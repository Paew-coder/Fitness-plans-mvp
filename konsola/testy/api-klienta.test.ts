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
    await api(`/api/klient/${token}/odczucie`, "POST", {
      positionId: "D1-S02", tydzien: 1,
      ciezarWykonany: 95, powtorzeniaWykonane: 5, feedback: "OK",
    });
    const { dane } = await api(`/api/plany/${planCyklu2}`);
    const propozycja = dane.propozycje1RM.find((p: any) => p.cwiczenieId === "EX-0016");
    assert.ok(propozycja, "brak propozycji z bieżącego cyklu");
    assert.equal(propozycja.zPoprzedniegoCyklu, undefined,
      "propozycja z tego cyklu nie może być podpisana poprzednim");
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
