/**
 * Interfejs, z którego korzysta telefon klienta — na prawdziwym serwerze.
 *
 * Reszta testów nie stawia serwera; ten stawia, bo sprawdza rzecz, której
 * inaczej sprawdzić się nie da: **do którego cyklu trafia zapis z telefonu**.
 *
 * Błąd, po którym ten plik powstał. Klient trenuje bez zasięgu — na siłowni
 * w podziemiach, na wyjeździe — a kolejka wychodzi dopiero w domu, czasem po
 * kilku dniach. Jeśli w międzyczasie trener wysłał kolejny cykl, zapis szedł
 * do planu **aktywnego w chwili dotarcia**, nie do tego, którego dotyczył:
 * oceny z poprzedniego cyklu przepadały bez śladu, a nowy dostawał odczucia
 * z treningu, którego jeszcze nie było — i liczył z nich ciężary na kolejne
 * tygodnie. Cicho, bez błędu, z konsekwencją na sztandze.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4193;
const ADRES = `http://127.0.0.1:${PORT}`;

let katalog = "";
let serwer: ChildProcess | null = null;
let token = "";
let planCyklu1 = "";
let planCyklu2 = "";

async function api(sciezka: string, metoda = "GET", cialo?: unknown) {
  const odp = await fetch(`${ADRES}${sciezka}`, {
    method: metoda,
    headers: cialo ? { "content-type": "application/json" } : {},
    body: cialo ? JSON.stringify(cialo) : undefined,
  });
  return { kod: odp.status, dane: await odp.json() as any };
}

before(async () => {
  katalog = mkdtempSync(join(tmpdir(), "craftmyplan-api-"));
  serwer = spawn("node", ["--no-warnings", "serwer.ts"], {
    cwd: KONSOLA,
    env: { ...process.env, PORT: String(PORT), BAZA_CRAFTMYPLAN: join(katalog, "test.db") },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${ADRES}/api/cwiczenia`)).ok) break;
    } catch { /* jeszcze nie wstał */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  // Cykl pierwszy: dwa ćwiczenia, serie maksymalne, wysłany.
  await api("/api/plany", "POST", { klient: "Ala Testowa", wersja: 1 });
  planCyklu1 = "ala-testowa-1";
  const { dane } = await api(`/api/plany/${planCyklu1}`);
  const plan = dane.zapisany.plan;
  plan.sloty[0].cwiczenieId = "EX-0010";
  plan.sloty[1].cwiczenieId = "EX-0016";
  plan.serieMaksymalne = [{ cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 3 }];
  await api(`/api/plany/${planCyklu1}`, "PUT", { plan, dataStartu: null, status: "wysłany" });
  token = (await api(`/api/plany/${planCyklu1}/link`, "POST")).dane.token;
});

after(() => {
  serwer?.kill();
  rmSync(katalog, { recursive: true, force: true });
});

describe("widok klienta", () => {
  test("link pokazuje aktywny plan i mówi, który to cykl", async () => {
    const { dane } = await api(`/api/klient/${token}`);
    assert.equal(dane.planId, planCyklu1);
    assert.equal(dane.wersja, 1);
  });

  test("ocena bez podanego cyklu trafia do aktywnego planu", async () => {
    await api(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D1-S01", tydzien: 1, feedback: "za łatwe" });
    const { dane } = await api(`/api/plany/${planCyklu1}`);
    assert.equal(dane.zapisany.plan.sloty[0].tygodnie["1"].feedback, "za łatwe");
  });
});

describe("zapis, który dotarł po zmianie cyklu", () => {
  before(async () => {
    // Trener układa kolejny cykl i wysyła go. Od tej chwili link pokazuje jego.
    const { dane } = await api(`/api/plany/${planCyklu1}/kopia`, "POST", { wersja: 2 });
    planCyklu2 = dane.zapisany.id;
    await api(`/api/plany/${planCyklu2}`, "PUT",
      { plan: dane.zapisany.plan, dataStartu: null, status: "wysłany" });
  });

  test("link sam przechodzi na nowy cykl", async () => {
    const { dane } = await api(`/api/klient/${token}`);
    assert.equal(dane.planId, planCyklu2);
    assert.equal(dane.wersja, 2);
  });

  test("spóźniona ocena ląduje w cyklu, którego dotyczy", async () => {
    await api(`/api/klient/${token}/odczucie`, "POST",
      { planId: planCyklu1, positionId: "D1-S02", tydzien: 3, feedback: "za trudne" });

    const stary = await api(`/api/plany/${planCyklu1}`);
    assert.equal(stary.dane.zapisany.plan.sloty[1].tygodnie["3"].feedback, "za trudne",
      "ocena miała trafić do cyklu, w którym odbył się ten trening");
  });

  test("nowy cykl nie dostaje odczuć z poprzedniego", async () => {
    const nowy = await api(`/api/plany/${planCyklu2}`);
    assert.equal(nowy.dane.zapisany.plan.sloty[1].tygodnie["3"]?.feedback, undefined,
      "nowy cykl dostał odczucie z treningu, którego jeszcze nie było");
  });

  test("po spóźnionym zapisie telefon dalej widzi aktualny cykl", async () => {
    const { dane } = await api(`/api/klient/${token}/odczucie`, "POST",
      { planId: planCyklu1, positionId: "D1-S01", tydzien: 2, feedback: "OK" });
    assert.equal(dane.planId, planCyklu2,
      "odpowiedź ma wracać z aktywnym cyklem, żeby telefon sam na niego przeszedł");
  });

  test("domknięty dzień też trafia do właściwego cyklu", async () => {
    await api(`/api/klient/${token}/dzien`, "POST", { planId: planCyklu1, dzien: 1, tydzien: 4 });
    const stary = await api(`/api/plany/${planCyklu1}`);
    const nowy = await api(`/api/plany/${planCyklu2}`);
    const domkniete = (o: any) => (o.dane.zapisany.ukonczoneDni ?? [])
      .some((d: any) => d.dzien === 1 && d.tydzien === 4);
    assert.equal(domkniete(stary), true, "dzień miał się domknąć w starym cyklu");
    assert.equal(domkniete(nowy), false, "nowy cykl dostał domknięty trening, którego nie było");
  });

  test("seria maksymalna z telefonu trafia do właściwego cyklu", async () => {
    await api(`/api/klient/${token}/serie`, "POST",
      { planId: planCyklu1, cwiczenieId: "EX-0016", ciezar: 80, powtorzenia: 4 });
    const stary = await api(`/api/plany/${planCyklu1}`);
    const nowy = await api(`/api/plany/${planCyklu2}`);
    const ma = (o: any) => o.dane.zapisany.plan.serieMaksymalne
      .some((s: any) => s.cwiczenieId === "EX-0016");
    assert.equal(ma(stary), true);
    assert.equal(ma(nowy), false);
  });
});

describe("nowy cykl zaczyna od tego, co klient faktycznie podnosił", () => {
  /**
   * Serie maksymalne przechodzą do nowego cyklu razem z doborem ćwiczeń, więc
   * plan wygląda na kompletny, a liczy z 1RM sprzed sześciu tygodni. Klient
   * przez ten czas urósł — każdy ciężar wychodzi za lekki i nic tego nie widać.
   * Konsola umie policzyć nowy 1RM z serii roboczych, tyle że te zostały
   * w poprzednim planie. Ma je stamtąd wyciągnąć.
   */
  test("propozycja 1RM przychodzi z wykonań poprzedniego cyklu", async () => {
    // Klient podnosił w cyklu 1 więcej, niż wynikało z jego starego 1RM.
    for (const [tydzien, ciezar] of [[1, 110], [2, 115]] as const) {
      await api(`/api/klient/${token}/odczucie`, "POST", {
        planId: planCyklu1, positionId: "D1-S01", tydzien,
        ciezarWykonany: ciezar, powtorzeniaWykonane: 5, feedback: "OK",
      });
    }

    const { dane } = await api(`/api/plany/${planCyklu2}`);
    const propozycja = dane.propozycje1RM.find((p: any) => p.cwiczenieId === "EX-0010");
    assert.ok(propozycja, "nowy cykl nie dostał propozycji z poprzedniego");
    assert.equal(propozycja.zPoprzedniegoCyklu, 1, "propozycja ma być podpisana cyklem");
    assert.ok(propozycja.oneRM > 127,
      `1RM z serii roboczych (${propozycja.oneRM}) miał być wyższy niż stary 127`);
  });

  test("przyjęcie propozycji podnosi ciężary w nowym cyklu", async () => {
    const przed = await api(`/api/plany/${planCyklu2}`);
    const ciezarPrzed = przed.dane.wynik.tygodnie[0].sloty[0].ciezar;
    const propozycja = przed.dane.propozycje1RM.find((p: any) => p.cwiczenieId === "EX-0010");

    const { dane } = await api(`/api/plany/${planCyklu2}/1rm`, "POST",
      { cwiczenieId: "EX-0010", oneRM: propozycja.oneRM });
    assert.ok(dane.wynik.tygodnie[0].sloty[0].ciezar > ciezarPrzed,
      `ciężar miał urosnąć, a stoi na ${dane.wynik.tygodnie[0].sloty[0].ciezar}`);
  });

  test("przyjęta propozycja znika z listy", async () => {
    const { dane } = await api(`/api/plany/${planCyklu2}`);
    assert.equal(dane.propozycje1RM.some((p: any) => p.cwiczenieId === "EX-0010"), false);
  });

  test("wykonania z bieżącego cyklu biją te sprzed sześciu tygodni", async () => {
    // To samo ćwiczenie, ale podniesione już w nowym cyklu — świeższa liczba
    // ma wygrać, i to bez podpisu o poprzednim cyklu.
    //
    // Bój główny, bo ma już 1RM (przyjęte dwa testy wyżej). Przy ćwiczeniu
    // bez 1RM seria nie idzie do propozycji, tylko od razu je ustala — to
    // sprawdza test niżej.
    await api(`/api/klient/${token}/odczucie`, "POST", {
      positionId: "D1-S01", tydzien: 1,
      ciezarWykonany: 95, powtorzeniaWykonane: 5, feedback: "OK",
    });
    const { dane } = await api(`/api/plany/${planCyklu2}`);
    const propozycja = dane.propozycje1RM.find((p: any) => p.cwiczenieId === "EX-0010");
    assert.ok(propozycja, "brak propozycji z bieżącego cyklu");
    assert.equal(propozycja.zPoprzedniegoCyklu, undefined,
      "propozycja z tego cyklu nie może być podpisana poprzednim");
  });

  /**
   * Kalibracja pierwszym treningiem. Ćwiczenie bez 1RM nie czeka na trenera:
   * pierwsza wpisana seria staje się jego 1RM, a z niego liczy się cały cykl.
   * Inaczej klient, który wybrał start bez serii maksymalnych, przerobiłby
   * cały pierwszy tydzień bez jednej policzonej liczby.
   */
  test("przy ćwiczeniu bez 1RM seria robocza od razu je ustala", async () => {
    const przed = await api(`/api/plany/${planCyklu2}`);
    assert.equal(przed.dane.wynik.tygodnie[0].sloty[1].ciezar, "— brak 1RM",
      "punkt wyjścia: akcesorium nowego cyklu bez 1RM");

    await api(`/api/klient/${token}/odczucie`, "POST", {
      positionId: "D1-S02", tydzien: 1, ciezarWykonany: 60, powtorzeniaWykonane: 8,
    });

    const { dane } = await api(`/api/plany/${planCyklu2}`);
    const wpis = dane.zapisany.plan.serieMaksymalne.find((s: any) => s.cwiczenieId === "EX-0016");
    assert.ok(wpis?.kalibracja, "1RM miało przyjść z serii, z opisem, skąd");
    assert.equal(dane.wynik.tygodnie[0].sloty[1].ciezar, 60,
      "plan ma zacząć dokładnie od ciężaru, który klient podniósł");
    assert.equal(dane.propozycje1RM.some((p: any) => p.cwiczenieId === "EX-0016"), false,
      "ustalone 1RM nie wraca do trenera jako propozycja tego samego");

    const telefon = await api(`/api/klient/${token}`);
    const cw = telefon.dane.tygodnie[0].dni[0].cwiczenia[1];
    assert.deepEqual(cw.kalibracja, { ciezar: 60, powtorzenia: 8, rpe: cw.rpe },
      "klient widzi przy ćwiczeniu, z której serii policzono jego ciężar");
    assert.equal(cw.dobierzCiezar, false);
  });

  test("seria maksymalna zastępuje wyliczenie z serii roboczej", async () => {
    await api(`/api/klient/${token}/serie`, "POST",
      { cwiczenieId: "EX-0016", ciezar: 80, powtorzenia: 4 });
    const { dane } = await api(`/api/plany/${planCyklu2}`);
    const wpisy = dane.zapisany.plan.serieMaksymalne.filter((s: any) => s.cwiczenieId === "EX-0016");
    assert.equal(wpisy.length, 1, "jeden wpis na ćwiczenie");
    assert.equal(wpisy[0].kalibracja, undefined, "po serii maksymalnej opis kalibracji znika");
    assert.equal(wpisy[0].ciezar, 80);
  });
});

describe("wszystkie serie ćwiczenia, nie tylko najcięższa", () => {
  /**
   * Przykład trenera z 23.09: plan na 80 kg, klient zrobił 80, 90, 85, 80.
   * Do bazy trafiało samo „90×6". Teraz trafia wszystko, a najcięższą — tę,
   * która idzie do 1RM — wylicza serwer.
   */
  const serie = [
    { ciezar: 80, powtorzenia: 6 }, { ciezar: 90, powtorzenia: 6 },
    { ciezar: 85, powtorzenia: 6 }, { ciezar: 80, powtorzenia: 6 },
  ];
  const wpis = async (tydzien: number) => (await api(`/api/plany/${planCyklu2}`)).dane
    .zapisany.wykonania.find((w: any) => w.positionId === "D1-S01" && w.tydzien === tydzien);

  test("serwer zapisuje wszystkie serie i sam wybiera najcięższą", async () => {
    const { kod } = await api(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D1-S01", tydzien: 2, serie });
    assert.equal(kod, 200);
    const w = await wpis(2);
    assert.deepEqual(w.serie, serie);
    assert.equal(w.ciezarWykonany, 90, "do 1RM idzie najcięższa");
    assert.equal(w.powtorzeniaWykonane, 6);
  });

  test("telefon dostaje je z powrotem przy ćwiczeniu", async () => {
    const { dane } = await api(`/api/klient/${token}`);
    assert.deepEqual(dane.tygodnie[1].dni[0].cwiczenia[0].serieWykonane, serie);
  });

  test("sama ocena nie kasuje wpisanych serii", async () => {
    await api(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D1-S01", tydzien: 2, feedback: "za trudne" });
    assert.deepEqual((await wpis(2)).serie, serie);
  });

  test("sama para — z aplikacji sprzed zmiany — zapisuje się jako jedna seria", async () => {
    await api(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D1-S01", tydzien: 3, ciezarWykonany: 92.5, powtorzeniaWykonane: 5 });
    const w = await wpis(3);
    assert.deepEqual(w.serie, [{ ciezar: 92.5, powtorzenia: 5 }]);
    assert.equal(w.ciezarWykonany, 92.5);
  });

  test("zła lista dostaje odmowę, a nie błąd serwera", async () => {
    // 400, nie 500: kolejka w telefonie czyta 500 jako „spróbuj później"
    // i takie zadanie wracałoby w nieskończoność.
    const { kod, dane } = await api(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D1-S01", tydzien: 2, serie: [{ ciezar: 5000, powtorzenia: 6 }] });
    assert.equal(kod, 400);
    assert.match(dane.blad, /Seria 1/);
    assert.deepEqual((await wpis(2)).serie, serie, "odrzucona lista nie może nic zmienić");
  });
});

describe("ciężar ustawiany ręcznie, którego trener nie wpisał", () => {
  /**
   * „Dead bug izo + OH" od 24.09 ma progresję „ręczne ustawienie". Dopóki
   * trener nie wpisze ciężaru, telefon dostał w kolumnie napis z BAZY
   * i nic więcej — klient nie wiedział, że ciężar dobiera sam.
   */
  let planReczny = "";
  let tokenReczny = "";
  const deadBug = async () =>
    (await api(`/api/klient/${tokenReczny}`)).dane.tygodnie[0].dni[0].cwiczenia[2];

  before(async () => {
    await api("/api/plany", "POST", { klient: "Ręczny Test", wersja: 1 });
    planReczny = (await api("/api/plany")).dane.find((p: any) => p.klient === "Ręczny Test").id;
    const plan = (await api(`/api/plany/${planReczny}`)).dane.zapisany.plan;
    plan.sloty[0].cwiczenieId = "EX-0010";
    plan.sloty[1].cwiczenieId = "EX-0016";
    plan.sloty[2].cwiczenieId = "EX-0049";   // Dead bug izo + OH
    plan.serieMaksymalne = [{ cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 3 }];
    await api(`/api/plany/${planReczny}`, "PUT", { plan, dataStartu: null, status: "wysłany" });
    tokenReczny = (await api(`/api/plany/${planReczny}/link`, "POST")).dane.token;
  });

  test("bez wpisu trenera telefon wie, że ciężar dobiera klient", async () => {
    const c = await deadBug();
    assert.equal(c.ciezarWybieraKlient, true);
    assert.equal(c.dobierzCiezar, false, "to nie jest brak 1RM — nic się z tego nie liczy");
  });

  test("zwykłe ćwiczenia tej flagi nie mają", async () => {
    const dzien = (await api(`/api/klient/${tokenReczny}`)).dane.tygodnie[0].dni[0].cwiczenia;
    assert.equal(dzien[0].ciezarWybieraKlient, false, "bój z 1RM");
    assert.equal(dzien[1].ciezarWybieraKlient, false, "akcesorium bez 1RM ma dobierzCiezar");
  });

  test("wpisany przez klienta ciężar trener widzi w wykonaniach", async () => {
    await api(`/api/klient/${tokenReczny}/odczucie`, "POST",
      { positionId: "D1-S03", tydzien: 1, serie: [{ ciezar: 2, powtorzenia: 10 }] });
    const { dane } = await api(`/api/plany/${planReczny}`);
    const w = dane.zapisany.wykonania.find((x: any) => x.positionId === "D1-S03");
    assert.deepEqual(w.serie, [{ ciezar: 2, powtorzenia: 10 }]);
    assert.equal(dane.zapisany.plan.serieMaksymalne.some((x: any) => x.cwiczenieId === "EX-0049"),
      false, "ręczny ciężar nie udaje 1RM");
  });

  test("postęp przy ręcznym ciężarze to kilogramy, bez udawanego 1RM", async () => {
    await api(`/api/klient/${tokenReczny}/odczucie`, "POST",
      { positionId: "D1-S03", tydzien: 2, serie: [{ ciezar: 4, powtorzenia: 11 }] });
    const { dane } = await api(`/api/klient/${tokenReczny}`);
    const c = dane.postep.cwiczenia.find((x: any) => x.cwiczenieId === "EX-0049");
    assert.equal(c.bez1RM, true);
    assert.equal(c.tygodni, 2);
    assert.deepEqual(c.punkty.map((x: any) => x.oneRM), [null, null]);
    assert.equal(c.ciezarPierwszy, 2);
    assert.equal(c.ciezarOstatni, 4);
    assert.equal(c.zmiana1RMProc, null);
  });

  test("ciężar wpisany przez trenera zdejmuje flagę", async () => {
    const plan = (await api(`/api/plany/${planReczny}`)).dane.zapisany.plan;
    plan.sloty[2].tygodnie = { ...plan.sloty[2].tygodnie, 1: { ciezarOverride: 2.5 } };
    await api(`/api/plany/${planReczny}`, "PUT", { plan, dataStartu: null, status: "wysłany" });
    const c = await deadBug();
    assert.equal(c.ciezar, 2.5);
    assert.equal(c.ciezarWybieraKlient, false);
  });
});

describe("postęp w ćwiczeniach liczy się z siły, nie z kilogramów", () => {
  /**
   * Przykład z testów trenera: 55 kg × 9 w T1, 50 kg × 11 w T2. Nagłówek
   * mówił „−5 kg (−9,1%)", czyli regres — a szacowane 1RM zmieniło się
   * o około 2%. Kilogramy na sztandze zmienia sam plan.
   */
  test("zmiana w nagłówku to zmiana 1RM, a tygodnie są policzone", async () => {
    await api(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D1-S02", tydzien: 4, serie: [{ ciezar: 55, powtorzenia: 9 }] });
    await api(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D1-S02", tydzien: 5, serie: [{ ciezar: 50, powtorzenia: 11 }] });
    const { dane } = await api(`/api/klient/${token}`);
    const c = dane.postep.cwiczenia.find((x: any) => x.cwiczenieId === "EX-0016");
    const t4 = c.punkty.find((x: any) => x.tydzien === 4);
    const t5 = c.punkty.find((x: any) => x.tydzien === 5);
    assert.ok(c.tygodni >= 2);
    assert.equal(c.oneRMOstatni, c.punkty.at(-1).oneRM);
    assert.ok(Math.abs(t5.oneRM - t4.oneRM) / t4.oneRM < 0.05,
      `1RM prawie bez zmiany (${t4.oneRM} → ${t5.oneRM}), choć kilogramy spadły o 5`);
    assert.equal(c.zmianaKg, undefined, "kilogramy nie wracają do nagłówka");
  });
});

describe("wartości spoza świata", () => {
  /**
   * Klient nie jest przeciwnikiem, ale jest **bez nadzoru**: zamiast 100 kg
   * wpisze 1000, a kolejka sprzed dwóch cykli przyniesie numer tygodnia,
   * którego już nie ma. Wszystko to szło wprost do danych trenera — i psuło
   * jego liczby: frekwencję, propozycje 1RM, wykres wagi, a przy serii
   * maksymalnej ciężary na całe sześć tygodni.
   *
   * Osobno: nieznane odczucie kończyło się błędem 500 na ograniczeniu w bazie.
   * A 500 znaczy dla kolejki w telefonie „spróbuj później", więc takie zadanie
   * wracałoby w nieskończoność i zatykało wszystko za sobą.
   */
  const odrzucane: [string, string, Record<string, unknown>][] = [
    ["tydzień spoza cyklu", "/odczucie", { positionId: "D1-S01", tydzien: 99, feedback: "OK" }],
    ["tydzień ujemny", "/odczucie", { positionId: "D1-S01", tydzien: -1, feedback: "OK" }],
    ["odczucie spoza trzech", "/odczucie", { positionId: "D1-S01", tydzien: 1, feedback: "świetnie" }],
    ["ciężar ujemny", "/odczucie", { positionId: "D1-S01", tydzien: 1, ciezarWykonany: -100 }],
    ["ciężar ponad tonę", "/odczucie", { positionId: "D1-S01", tydzien: 1, ciezarWykonany: 5000 }],
    ["sto tysięcy powtórzeń", "/odczucie", { positionId: "D1-S01", tydzien: 1, powtorzeniaWykonane: 100_000 }],
    ["waga ujemna", "/waga", { kg: -80 }],
    ["waga bilion kilogramów", "/waga", { kg: 1e12 }],
    ["dzień spoza planu", "/dzien", { dzien: 99, tydzien: 1 }],
    ["seria milion kilogramów", "/serie", { cwiczenieId: "EX-0010", ciezar: 1e9, powtorzenia: 3 }],
    ["seria poza tabelą powtórzeń", "/serie", { cwiczenieId: "EX-0010", ciezar: 100, powtorzenia: 999 }],
    ["seria ćwiczenia spoza bazy", "/serie", { cwiczenieId: "EX-9999", ciezar: 100, powtorzenia: 3 }],
  ];

  for (const [opis, akcja, cialo] of odrzucane) {
    test(`${opis} — odmowa, nie zapis`, async () => {
      const { kod } = await api(`/api/klient/${token}${akcja}`, "POST", cialo);
      assert.equal(kod, 400, `${akcja} przyjęło wartość, która nie może być prawdziwa`);
    });
  }

  test("to, co możliwe, dalej przechodzi", async () => {
    const dobre: [string, Record<string, unknown>][] = [
      ["/odczucie", { positionId: "D1-S01", tydzien: 1, feedback: "za łatwe" }],
      ["/odczucie", { positionId: "D1-S01", tydzien: 1, ciezarWykonany: 105, powtorzeniaWykonane: 5 }],
      ["/waga", { kg: 81.5 }],
      ["/serie", { cwiczenieId: "EX-0010", ciezar: 125, powtorzenia: 2 }],
    ];
    for (const [akcja, cialo] of dobre) {
      const { kod } = await api(`/api/klient/${token}${akcja}`, "POST", cialo);
      assert.equal(kod, 200, `${akcja} odrzuciło poprawne dane`);
    }
  });
});

describe("zapis, którego nie da się przyjąć", () => {
  test("nieistniejący cykl to odmowa, nie cichy zapis gdzie indziej", async () => {
    const { kod } = await api(`/api/klient/${token}/odczucie`, "POST",
      { planId: "nie-ma-takiego-9", positionId: "D1-S01", tydzien: 1, feedback: "OK" });
    assert.equal(kod, 404);
  });

  test("cudzy plan jest nie do ruszenia tym linkiem", async () => {
    await api("/api/plany", "POST", { klient: "Ktos Inny", wersja: 1 });
    const { kod } = await api(`/api/klient/${token}/odczucie`, "POST",
      { planId: "ktos-inny-1", positionId: "D1-S01", tydzien: 1, feedback: "OK" });
    assert.equal(kod, 404, "link jednego klienta nie może zapisywać w kartotece drugiego");
  });

  test("ćwiczenie usunięte z planu daje odmowę, a nie zapis w próżnię", async () => {
    const { kod } = await api(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D5-S12", tydzien: 1, feedback: "OK" });
    assert.equal(kod, 400);
  });
});

/**
 * Trener cofa plan do szkicu, żeby go poprawić — a klient stoi właśnie na
 * siłowni albo wraca z niej z zaległymi ocenami.
 *
 * Sprawdzone na działającej konsoli: każdy taki zapis wracał z kodem 409
 * „Nie masz jeszcze aktywnego planu". Kolejka w telefonie traktuje 4xx jako
 * „tego nigdy się nie uda zapisać" i **wyrzuca zadanie**. Trening był, klient
 * go ocenił, a oceny znikały bez śladu — z winy zwykłej czynności trenera.
 *
 * Status planu mówi, co klient *widzi*, a nie czy wolno zapisać to, co już
 * zrobił. Zapis ze wskazanym `planId` idzie więc do tego planu, a na ekran
 * wraca informacja, że nowy jest w przygotowaniu.
 */
describe("zapis, gdy trener właśnie poprawia plan", () => {
  /**
   * Odstawia **wszystkie** cykle klienta do szkicu i oddaje funkcję
   * przywracającą stan. Wszystkie, bo chodzi o stan „nie ma czego pokazać":
   * dopóki którykolwiek jest wysłany, klient ma aktywny plan i nic tu nie
   * jest wyjątkowe. Pierwsza wersja odstawiała tylko cykl pierwszy i przez
   * to sprawdzała zwykłą drogę, a nie tę, o którą chodzi.
   */
  async function doSzkicu(): Promise<() => Promise<void>> {
    const cykle = [planCyklu1, planCyklu2].filter(Boolean);
    const stan: { id: string; plan: unknown; status: string }[] = [];
    for (const id of cykle) {
      const { dane } = await api(`/api/plany/${id}`);
      stan.push({ id, plan: dane.zapisany.plan, status: dane.zapisany.status });
      await api(`/api/plany/${id}`, "PUT",
        { plan: dane.zapisany.plan, dataStartu: null, status: "szkic" });
    }
    return async () => {
      for (const s of stan) {
        await api(`/api/plany/${s.id}`, "PUT",
          { plan: s.plan, dataStartu: null, status: s.status });
      }
    };
  }

  test("ocena ze wskazanym cyklem zostaje zapisana", async () => {
    const przywroc = await doSzkicu();
    try {
      const { kod, dane } = await api(`/api/klient/${token}/odczucie`, "POST",
        { planId: planCyklu1, positionId: "D1-S01", tydzien: 4,
          feedback: "za trudne", ciezarWykonany: 97.5, powtorzeniaWykonane: 4 });
      assert.equal(kod, 200, "ocena odrzucona, choć trening się odbył");

      // Na ekranie nie ma czego pokazać — i to jest właściwa odpowiedź.
      assert.equal(dane.czekaNaPlan, true);
      assert.equal(dane.planId, undefined, "szkic nie ma prawa trafić na telefon");

      const { dane: stan } = await api(`/api/plany/${planCyklu1}`);
      const wpis = stan.zapisany.wykonania
        .find((w: any) => w.positionId === "D1-S01" && w.tydzien === 4);
      assert.ok(wpis, "ocena nie doszła do bazy");
      assert.equal(wpis.ciezarWykonany, 97.5);
    } finally {
      await przywroc();
    }
  });

  test("domknięcie dnia i waga też dochodzą", async () => {
    const przywroc = await doSzkicu();
    try {
      assert.equal((await api(`/api/klient/${token}/dzien`, "POST",
        { planId: planCyklu1, dzien: 1, tydzien: 5 })).kod, 200);
      assert.equal((await api(`/api/klient/${token}/waga`, "POST",
        { planId: planCyklu1, kg: 79.5 })).kod, 200);

      const { dane } = await api(`/api/plany/${planCyklu1}`);
      assert.ok(dane.zapisany.ukonczoneDni.some((d: any) => d.tydzien === 5));
      assert.ok(dane.zapisany.waga.some((w: any) => w.kg === 79.5));
    } finally {
      await przywroc();
    }
  });

  test("zapis bez wskazania cyklu dalej jest odmawiany", async () => {
    // Bez `planId` nie wiadomo, czego dotyczy — a zgadywanie w tym miejscu
    // znaczyłoby dopisywanie treningu do cudzego albo nieistniejącego cyklu.
    const przywroc = await doSzkicu();
    try {
      const { kod } = await api(`/api/klient/${token}/odczucie`, "POST",
        { positionId: "D1-S01", tydzien: 1, feedback: "OK" });
      assert.equal(kod, 409);
    } finally {
      await przywroc();
    }
  });

  test("cudzy cykl zostaje nie do ruszenia także wtedy", async () => {
    const przywroc = await doSzkicu();
    try {
      const { kod } = await api(`/api/klient/${token}/waga`, "POST",
        { planId: "ktos-inny-1", kg: 70 });
      // 404, ta sama odpowiedź co na cykl nieistniejący i ta sama co przy
      // aktywnym planie — cudzy identyfikator nie ma się czym różnić.
      assert.equal(kod, 404, "link jednego klienta sięgnął do cudzej kartoteki");
    } finally {
      await przywroc();
    }
  });

  test("cykl usunięty przez trenera mówi, że go nie ma", async () => {
    // Zaległa ocena do skasowanego cyklu nie ma dokąd trafić — ale komunikat
    // „nie masz jeszcze aktywnego planu" mówił wtedy nieprawdę.
    const przywroc = await doSzkicu();
    try {
      const { kod, dane } = await api(`/api/klient/${token}/odczucie`, "POST",
        { planId: "ala-testowa-99", positionId: "D1-S01", tydzien: 1, feedback: "OK" });
      assert.equal(kod, 404);
      assert.match(dane.blad, /nie istnieje/i);
    } finally {
      await przywroc();
    }
  });
});

/**
 * Unieważnienie linku — jedyna obrona, gdy adres klienta wycieknie.
 *
 * Link jest kluczem bez hasła: kto go ma, ten widzi plan. Cała proporcjonalność
 * tego rozwiązania stoi na tym, że da się go odciąć. Obietnica warta dokładnie
 * tyle, ile jej sprawdzenie.
 */
describe("link, który wyciekł", () => {
  test("unieważniony przestaje działać, nowy działa, stary zostaje martwy", async () => {
    const stary = (await api("/api/klienci/ala-testowa/link", "POST")).dane.token;
    assert.equal((await api(`/api/klient/${stary}`)).kod, 200);

    assert.equal((await api("/api/klienci/ala-testowa/link", "DELETE")).kod, 200);
    assert.equal((await api(`/api/klient/${stary}`)).kod, 404, "stary link dalej otwiera plan");
    // Zapis też, nie tylko odczyt — inaczej „unieważniony" znaczyłoby
    // „nie pokazuje, ale nadal pisze do kartoteki".
    assert.equal((await api(`/api/klient/${stary}/waga`, "POST", { kg: 80 })).kod, 404);

    const nowy = (await api("/api/klienci/ala-testowa/link", "POST")).dane.token;
    assert.notEqual(nowy, stary, "wystawiono ten sam token co unieważniony");
    assert.equal((await api(`/api/klient/${nowy}`)).kod, 200);
    assert.equal((await api(`/api/klient/${stary}`)).kod, 404);
    token = nowy;
  });
});

/**
 * Przestawienie ćwiczenia w planie, w którym klient już coś zapisał.
 *
 * Trasa przenoszenia zamienia **treść** slotów — ćwiczenie i parametry
 * tygodni — bo `position_id` i „Lp." należą do miejsca w tabeli, nie do
 * ćwiczenia. Wpisy klienta też są kluczowane pozycją, i o nich zapomniano.
 *
 * Sprawdzone na działającej konsoli: po przestawieniu przysiadu w dół klient
 * widział „wykonane 100 kg × 4" **przy wiosłowaniu** zadanym na 52,5 kg,
 * a przy samym przysiadzie — odczucie bez ciężaru. Jedna ocena rozerwana
 * na pół, obie połówki w niewłaściwym miejscu. A z tych liczb liczy się
 * ciężary na kolejne tygodnie.
 */
describe("przestawienie ćwiczenia zabiera ze sobą zapisy klienta", () => {
  const KLIENT = "Przestawiana Osoba";
  const PLAN = "przestawiana-osoba-1";
  let tokenPrzestawiania = "";

  before(async () => {
    await api("/api/plany", "POST", { klient: KLIENT, wersja: 1 });
    const { dane } = await api(`/api/plany/${PLAN}`);
    const plan = dane.zapisany.plan;
    plan.sloty[0].cwiczenieId = "EX-0010";
    plan.sloty[1].cwiczenieId = "EX-0016";
    plan.serieMaksymalne = [
      { cwiczenieId: "EX-0010", ciezar: 140, powtorzenia: 3 },
      { cwiczenieId: "EX-0016", ciezar: 60, powtorzenia: 5 },
    ];
    await api(`/api/plany/${PLAN}`, "PUT", { plan, dataStartu: null, status: "wysłany" });
    await api(`/api/plany/${PLAN}/tygodnie`, "POST", { tryb: "progresja", zrodlo: 1 });
    tokenPrzestawiania = (await api(`/api/plany/${PLAN}/link`, "POST")).dane.token;
    await api(`/api/klient/${tokenPrzestawiania}/odczucie`, "POST", {
      planId: PLAN, positionId: "D1-S01", tydzien: 1,
      feedback: "za trudne", ciezarWykonany: 100, powtorzeniaWykonane: 4,
    });
  });

  test("cała ocena idzie za ćwiczeniem, a nie zostaje na miejscu", async () => {
    const { kod } = await api(`/api/plany/${PLAN}/przenies`, "POST",
      { positionId: "D1-S01", kierunek: "dol" });
    assert.equal(kod, 200);

    const { dane } = await api(`/api/plany/${PLAN}`);
    const wpisy = dane.zapisany.wykonania;
    assert.equal(wpisy.length, 1, "wpis się rozmnożył albo zniknął");
    assert.equal(wpisy[0].positionId, "D1-S02", "wpis został przy starym miejscu");
    assert.equal(wpisy[0].ciezarWykonany, 100);
    assert.equal(wpisy[0].feedback, "za trudne");
  });

  test("klient widzi to, co podniósł, przy ćwiczeniu, które robił", async () => {
    // Widok klienta podaje nazwę, nie identyfikator — szukamy tak, jak on patrzy.
    const { dane } = await api(`/api/klient/${tokenPrzestawiania}`);
    const dzien = dane.tygodnie[0].dni[0].cwiczenia;
    const przysiad = dzien.find((c: any) => /squat/i.test(c.nazwa));
    const wioslowanie = dzien.find((c: any) => /row/i.test(c.nazwa));
    assert.ok(przysiad && wioslowanie,
      `nie widać obu ćwiczeń: ${dzien.map((c: any) => c.nazwa).join(", ")}`);

    assert.equal(przysiad.ciezarWykonany, 100, "przysiad stracił swój ciężar");
    assert.equal(przysiad.feedback, "za trudne");
    // Druga połowa tej samej sprawy: przy ćwiczeniu, którego klient nie robił,
    // nie ma prawa stać liczba z innego ćwiczenia.
    assert.equal(wioslowanie.ciezarWykonany, null,
      "cudzy ciężar przykleił się do wiosłowania");
    assert.equal(wioslowanie.feedback, null);
  });

  test("powrót na dawne miejsce przywraca stan sprzed przestawienia", async () => {
    await api(`/api/plany/${PLAN}/przenies`, "POST",
      { positionId: "D1-S02", kierunek: "gora" });
    const { dane } = await api(`/api/plany/${PLAN}`);
    assert.equal(dane.zapisany.wykonania[0].positionId, "D1-S01");
    assert.equal(dane.zapisany.plan.sloty[0].cwiczenieId, "EX-0010");
  });
});

/**
 * Podmiana ćwiczenia w środku cyklu, w tygodniach, które klient już przerobił.
 *
 * Slot planu trzyma jedno ćwiczenie na wszystkie sześć tygodni. Okienko
 * „od którego tygodnia" pilnuje, żeby podmiana nie przepisała **parametrów**
 * tygodni już zrobionych — ale nazwa ćwiczenia jest jedna na cały slot, więc
 * przeszłość i tak dostawała nową.
 *
 * Sprawdzone na działającej konsoli. Klient przerabia dwa tygodnie przysiadu
 * ze sztangą (105 i 110 kg). Trener podmienia ćwiczenie od tygodnia 3. Po tym
 * propozycja nowego 1RM przenosiła się na **low bar squat** — ćwiczenie,
 * którego klient nie robił ani razu. Ta liczba wraca na sztangę w kolejnym
 * cyklu, więc nie jest to pomyłka kosmetyczna.
 */
describe("podmiana ćwiczenia nie przepisuje przerobionych tygodni", () => {
  const KLIENT = "Podmieniana Osoba";
  const PLAN = "podmieniana-osoba-1";
  let tokenPodmiany = "";

  before(async () => {
    await api("/api/plany", "POST", { klient: KLIENT, wersja: 1 });
    const { dane } = await api(`/api/plany/${PLAN}`);
    const plan = dane.zapisany.plan;
    plan.sloty[0].cwiczenieId = "EX-0010";
    plan.serieMaksymalne = [
      { cwiczenieId: "EX-0010", ciezar: 140, powtorzenia: 3 },
      { cwiczenieId: "EX-0013", ciezar: 90, powtorzenia: 5 },
    ];
    await api(`/api/plany/${PLAN}`, "PUT", { plan, dataStartu: null, status: "wysłany" });
    await api(`/api/plany/${PLAN}/tygodnie`, "POST", { tryb: "progresja", zrodlo: 1 });
    tokenPodmiany = (await api(`/api/plany/${PLAN}/link`, "POST")).dane.token;
    for (const tydzien of [1, 2]) {
      await api(`/api/klient/${tokenPodmiany}/odczucie`, "POST", {
        planId: PLAN, positionId: "D1-S01", tydzien, feedback: "OK",
        ciezarWykonany: 100 + tydzien * 5, powtorzeniaWykonane: 5,
      });
    }
  });

  test("wpis pamięta, które ćwiczenie klient robił", async () => {
    const { dane } = await api(`/api/plany/${PLAN}`);
    assert.ok(dane.zapisany.wykonania.every((w: any) => w.cwiczenieId === "EX-0010"),
      "wpisy nie wiedzą, czego dotyczyły");
  });

  test("propozycja 1RM zostaje przy ćwiczeniu, które klient faktycznie robił", async () => {
    const przed = (await api(`/api/plany/${PLAN}`)).dane.propozycje1RM ?? [];
    assert.ok(przed.some((p: any) => /squat/i.test(p.nazwa) && !/low bar/i.test(p.nazwa)),
      `bez podmiany propozycji nie ma: ${JSON.stringify(przed)}`);

    // Podmiana od tygodnia 3 — tak, jak robi to okienko w konsoli.
    const { dane: teraz } = await api(`/api/plany/${PLAN}`);
    const plan = teraz.zapisany.plan;
    plan.sloty[0].cwiczenieId = "EX-0013";
    for (const t of [3, 4, 5, 6]) delete plan.sloty[0].tygodnie[t];
    await api(`/api/plany/${PLAN}`, "PUT", {
      plan, dataStartu: null, status: "wysłany", zmieniony: teraz.zapisany.zmieniony,
    });

    const po = (await api(`/api/plany/${PLAN}`)).dane.propozycje1RM ?? [];
    assert.ok(!po.some((p: any) => /low bar/i.test(p.nazwa)),
      "kilogramy z przysiadu policzyły się jako nowe ćwiczenie");
    assert.ok(po.some((p: any) => /squat/i.test(p.nazwa) && !/low bar/i.test(p.nazwa)),
      "propozycja dla przerobionego ćwiczenia zniknęła");
  });

  test("klient nie widzi cudzych kilogramów pod nową nazwą", async () => {
    const { dane } = await api(`/api/klient/${tokenPodmiany}`);
    const t1 = dane.tygodnie[0].dni[0].cwiczenia[0];
    assert.match(t1.nazwa, /low bar/i, "slot pokazuje inne ćwiczenie niż podmienione");
    // Pustka w polach jest tu uczciwsza niż liczba spod innego ćwiczenia.
    assert.equal(t1.ciezarWykonany, null,
      "przy nowej nazwie stoją kilogramy ze starego ćwiczenia");
    assert.equal(t1.feedback, null, "przy nowej nazwie stoi ocena starego ćwiczenia");
  });

  test("postęp po podmianie idzie do ćwiczenia, które klient robił", async () => {
    const { dane } = await api(`/api/klient/${tokenPodmiany}`);
    const nazwy = dane.postep.cwiczenia.map((c: any) => c.nazwa);
    assert.ok(nazwy.some((n: string) => /back squat/i.test(n)), JSON.stringify(nazwy));
    assert.ok(!nazwy.some((n: string) => /low bar/i.test(n)),
      `kilogramy z przysiadu poszły na konto podmienionego ćwiczenia: ${JSON.stringify(nazwy)}`);
  });

  test("ale swoją historię widzi — pod prawdziwą nazwą", async () => {
    // Samo ukrycie kosztowało klienta własną historię: przerobione tygodnie
    // wyglądały na nietknięte. Liczby wracają, tylko opisane tym, czego
    // naprawdę dotyczą, i wyłącznie do odczytu.
    const { dane } = await api(`/api/klient/${tokenPodmiany}`);
    const t1 = dane.tygodnie[0].dni[0].cwiczenia[0];
    assert.ok(t1.wczesniej, "przerobiony tydzień wygląda na pusty");
    assert.match(t1.wczesniej.nazwa, /back squat/i);
    assert.equal(t1.wczesniej.ciezarWykonany, 105);
    assert.equal(t1.wczesniej.powtorzeniaWykonane, 5);
    assert.equal(t1.wczesniej.feedback, "OK");

    // Tygodnie nietknięte podmianą nie mają czego wspominać.
    const t3 = dane.tygodnie[2].dni[0].cwiczenia[0];
    assert.equal(t3.wczesniej, null);
  });
});
