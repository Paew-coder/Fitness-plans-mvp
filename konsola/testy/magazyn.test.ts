/**
 * Testy magazynu — czy plan wraca z bazy dokładnie taki, jaki tam poszedł.
 *
 * Baza jest tymczasowa: `BAZA_CRAFTMYPLAN` wskazuje plik w katalogu testowym,
 * więc dane trenera są nietykalne.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KATALOG = mkdtempSync(join(tmpdir(), "magazyn-test-"));
process.env.BAZA_CRAFTMYPLAN = join(KATALOG, "test.db");

const magazyn = await import("../magazyn.ts");
const { baza, zamknij, trenerDomyslny } = await import("../baza/polaczenie.ts");

let TRENER = 0;
before(() => { TRENER = trenerDomyslny(); });
after(() => { zamknij(); rmSync(KATALOG, { recursive: true, force: true }); });

function planTestowy(id: string, klient = "Testowy Klient"): magazyn.ZapisanyPlan {
  return {
    id, trenerId: TRENER, klientId: magazyn.idKlienta(klient), klient, wersja: 1, status: "szkic",
    dataStartu: "2026-09-01", utworzony: "", zmieniony: "",
    plan: magazyn.pustyPlan(klient),
  };
}

describe("magazyn — plan tam i z powrotem", () => {
  test("zapisany plan wraca z tą samą treścią", () => {
    const plan = planTestowy("round-trip");
    plan.plan.sloty[0]!.cwiczenieId = "EX-0011";
    plan.plan.sloty[0]!.tygodnie = { 1: { serie: 5, powtorzenia: 5, rpe: 7 } };
    plan.plan.serieMaksymalne = [{ cwiczenieId: "EX-0011", ciezar: 100, powtorzenia: 5 }];

    magazyn.zapisz(plan);
    const wczytany = magazyn.wczytaj(TRENER, "round-trip")!;

    assert.equal(wczytany.klient, plan.klient);
    assert.equal(wczytany.dataStartu, "2026-09-01");
    assert.deepEqual(wczytany.plan.sloty[0], plan.plan.sloty[0]);
    assert.deepEqual(wczytany.plan.serieMaksymalne, plan.plan.serieMaksymalne);
  });

  test("wpisy klienta wracają w komplecie", () => {
    const plan = planTestowy("wpisy");
    plan.wykonania = [
      { positionId: "D1-S01", tydzien: 1, data: "2026-09-02T10:00:00.000Z", feedback: "OK" },
      {
        positionId: "D1-S02", tydzien: 1, data: "2026-09-02T10:05:00.000Z",
        // Ćwiczenie zapisane przy wpisie, a nie tylko pozycja w tabeli —
        // bo slot trzyma jedno ćwiczenie na cały cykl, a podmiana w środku
        // przepisywałaby przeszłość.
        cwiczenieId: "EX-0016",
        feedback: "za trudne", ciezarWykonany: 62.5, powtorzeniaWykonane: 8,
      },
    ];
    plan.ukonczoneDni = [{ dzien: 1, tydzien: 1, data: "2026-09-02T10:30:00.000Z" }];

    magazyn.zapisz(plan);
    const w = magazyn.wczytaj(TRENER, "wpisy")!;

    assert.equal(w.wykonania!.length, 2);
    assert.deepEqual(w.wykonania!.find((x) => x.positionId === "D1-S02"), plan.wykonania[1]);
    // Wpis bez ćwiczenia — sprzed wprowadzenia kolumny — wraca bez zgadywania.
    assert.equal(w.wykonania!.find((x) => x.positionId === "D1-S01")!.cwiczenieId, undefined);
    assert.deepEqual(w.ukonczoneDni, plan.ukonczoneDni);
  });

  test("moduły oddechu i biegu przeżywają zapis", () => {
    const plan = planTestowy("moduly");
    plan.oddech = { twot: 22, przeciwwskazania: false };
    plan.bieg = { wiek: 35, dystansTestowy: 5, czasTestowy: 25, jednostekWTygodniu: 3 };
    magazyn.zapisz(plan);

    const w = magazyn.wczytaj(TRENER, "moduly")!;
    assert.deepEqual(w.oddech, plan.oddech);
    assert.deepEqual(w.bieg, plan.bieg);
  });

  test("ponowny zapis nadpisuje, nie duplikuje", () => {
    const plan = planTestowy("nadpis");
    plan.wykonania = [{ positionId: "D1-S01", tydzien: 1, data: "2026-09-02T10:00:00.000Z", feedback: "OK" }];
    magazyn.zapisz(plan);

    plan.wykonania = [{ positionId: "D1-S01", tydzien: 1, data: "2026-09-02T11:00:00.000Z", feedback: "za łatwe" }];
    magazyn.zapisz(plan);

    const w = magazyn.wczytaj(TRENER, "nadpis")!;
    assert.equal(w.wykonania!.length, 1, "jeden wpis, nie dwa");
    assert.equal(w.wykonania![0]!.feedback, "za łatwe");
    assert.equal(magazyn.lista(TRENER).filter((p) => p.id === "nadpis").length, 1);
  });

  test("utworzony zostaje, zmieniony się przesuwa", () => {
    const zapisany = magazyn.zapisz(planTestowy("daty"));
    const drugi = magazyn.zapisz({ ...zapisany, klient: "Inny" });
    assert.equal(drugi.utworzony, zapisany.utworzony, "data utworzenia jest raz na zawsze");
    assert.ok(drugi.zmieniony >= zapisany.zmieniony);
  });
});

describe("magazyn — dostęp klienta", () => {
  test("token prowadzi do klienta, byle token nie", () => {
    const plan = magazyn.zapisz(planTestowy("token", "Klient Z Linkiem"));
    const token = magazyn.nowyToken();
    magazyn.zapiszKlienta({ ...magazyn.wczytajKlienta(TRENER, plan.klientId)!, token });

    assert.equal(magazyn.klientPoTokenie(token)!.id, plan.klientId);
    assert.equal(magazyn.klientPoTokenie("nieistniejacy-token-1234"), null);
    assert.equal(magazyn.klientPoTokenie(""), null, "pusty token nie może niczego otworzyć");
    assert.equal(magazyn.klientPoTokenie("krotki"), null);
  });

  test("unieważnienie tokenu zamyka dostęp natychmiast", () => {
    const plan = magazyn.zapisz(planTestowy("uniewaznienie", "Klient Do Odciecia"));
    const token = magazyn.nowyToken();
    const klient = magazyn.wczytajKlienta(TRENER, plan.klientId)!;
    magazyn.zapiszKlienta({ ...klient, token });

    magazyn.zapiszKlienta({ ...klient, token: undefined });
    assert.equal(magazyn.klientPoTokenie(token), null);
  });

  test("link przeżywa zmianę cyklu i pokazuje aktualny plan", () => {
    const pierwszy = magazyn.zapisz({
      ...planTestowy("ciaglosc-1", "Klient Wielocyklowy"), status: "zakończony",
    });
    const token = magazyn.nowyToken();
    magazyn.zapiszKlienta({ ...magazyn.wczytajKlienta(TRENER, pierwszy.klientId)!, token });

    // Klient ma link w telefonie i widzi cykl pierwszy.
    assert.equal(magazyn.aktywnyPlan(TRENER, pierwszy.klientId)!.id, "ciaglosc-1");

    // Trener układa drugi cykl. Dopóki jest szkicem, klient go nie widzi.
    const drugi = magazyn.zapisz({
      ...magazyn.kopiaJakoNowaWersja(pierwszy, 2), id: "ciaglosc-2",
    });
    assert.equal(magazyn.aktywnyPlan(TRENER, pierwszy.klientId)!.id, "ciaglosc-1",
      "szkic to jeszcze nie plan do trenowania");

    // Po wysłaniu ten sam link pokazuje nowy cykl — bez wymiany adresu.
    magazyn.zapisz({ ...drugi, status: "wysłany" });
    assert.equal(magazyn.klientPoTokenie(token)!.id, pierwszy.klientId);
    assert.equal(magazyn.aktywnyPlan(TRENER, pierwszy.klientId)!.id, "ciaglosc-2");
  });

  test("bez wysłanego planu klient nie widzi nic", () => {
    const szkic = magazyn.zapisz(planTestowy("sam-szkic", "Klient Bez Planu"));
    assert.equal(magazyn.aktywnyPlan(TRENER, szkic.klientId), null);
  });
});

describe("magazyn — waga należy do klienta", () => {
  test("wpisy z dwóch cykli składają się na jedną historię", () => {
    const cykl1 = magazyn.zapisz(planTestowy("waga-1", "Klient Wazacy Sie"));
    magazyn.zapisz({ ...magazyn.kopiaJakoNowaWersja(cykl1, 2), id: "waga-2" });

    magazyn.zapiszWage(TRENER, cykl1.klientId, "2026-09-01", 78.4);
    magazyn.zapiszWage(TRENER, cykl1.klientId, "2026-10-20", 77.1);

    // Obie wersje planu widzą tę samą, pełną historię.
    assert.deepEqual(magazyn.wczytaj(TRENER, "waga-1")!.waga, magazyn.wczytaj(TRENER, "waga-2")!.waga);
    assert.deepEqual(magazyn.wagaKlienta(TRENER, cykl1.klientId).map((w) => w.kg), [78.4, 77.1]);
  });

  test("drugi pomiar tego samego dnia nadpisuje, zero kasuje", () => {
    const plan = magazyn.zapisz(planTestowy("waga-nadpis", "Klient Poprawiajacy"));
    magazyn.zapiszWage(TRENER, plan.klientId, "2026-09-01", 80);
    magazyn.zapiszWage(TRENER, plan.klientId, "2026-09-01", 79.5);
    assert.deepEqual(magazyn.wagaKlienta(TRENER, plan.klientId), [{ data: "2026-09-01", kg: 79.5 }]);

    magazyn.zapiszWage(TRENER, plan.klientId, "2026-09-01", 0);
    assert.deepEqual(magazyn.wagaKlienta(TRENER, plan.klientId), []);
  });

  test("usunięcie klienta zabiera jego plany i wagę", () => {
    const plan = magazyn.zapisz(planTestowy("kaskada-klienta", "Klient Do Usuniecia"));
    magazyn.zapiszWage(TRENER, plan.klientId, "2026-09-01", 75);

    magazyn.usunKlienta(TRENER, plan.klientId);
    assert.equal(magazyn.wczytaj(TRENER, "kaskada-klienta"), null);
    assert.deepEqual(magazyn.wagaKlienta(TRENER, plan.klientId), []);
    assert.equal(magazyn.wczytajKlienta(TRENER, plan.klientId), null);
  });

  test("zmiana nazwy nie rozdziela historii", () => {
    const plan = magazyn.zapisz(planTestowy("nazwa-1", "Zuzanna C"));
    const klient = magazyn.wczytajKlienta(TRENER, plan.klientId)!;

    // Trener poprawia nazwisko. Identyfikator zostaje ten sam, więc plany
    // dalej należą do tej samej osoby — inaczej cała historia by się rozjechała.
    magazyn.zapiszKlienta({ ...klient, nazwa: "Zuzanna Chmielewska" });
    const drugiCykl = magazyn.zapisz({
      ...magazyn.kopiaJakoNowaWersja(magazyn.wczytaj(TRENER, "nazwa-1")!, 2), id: "nazwa-2",
    });

    assert.equal(drugiCykl.klientId, klient.id);
    assert.equal(drugiCykl.klient, "Zuzanna Chmielewska", "plan pokazuje aktualną nazwę");
    assert.deepEqual(magazyn.planyKlienta(TRENER, klient.id).map((p) => p.id), ["nazwa-1", "nazwa-2"]);
    assert.equal(magazyn.wczytajKlienta(TRENER, "zuzanna-chmielewska"), null,
      "poprawka nazwy nie zakłada drugiej osoby");
  });

  test("ten sam człowiek zapisany inaczej to dalej jeden klient", () => {
    const a = magazyn.zapewnijKlienta(TRENER, "Zuzanna C");
    const b = magazyn.zapewnijKlienta(TRENER, "zuzanna c.");
    assert.equal(a.id, b.id);
    assert.equal(magazyn.listaKlientow(TRENER).filter((k) => k.id === "zuzanna-c").length, 1);
  });
});

describe("magazyn — rozdzielenie trenerów", () => {
  test("trener nie widzi planów drugiego trenera", () => {
    const drugi = Number(baza().prepare(
      "INSERT INTO trener (email, nazwa, utworzony) VALUES (?, ?, ?)",
    ).run("drugi@localhost", "Drugi", new Date().toISOString()).lastInsertRowid);

    // Ten sam identyfikator planu u obu trenerów — musi być dozwolony.
    magazyn.zapisz({ ...planTestowy("wspolne-id", "Pierwszy klient") });
    magazyn.zapisz({ ...planTestowy("wspolne-id", "Drugi klient"), trenerId: drugi });

    assert.equal(magazyn.wczytaj(TRENER, "wspolne-id")!.klient, "Pierwszy klient");
    assert.equal(magazyn.wczytaj(drugi, "wspolne-id")!.klient, "Drugi klient");

    const mojeId = magazyn.lista(TRENER).map((p) => p.id);
    const cudze = magazyn.lista(drugi);
    assert.equal(cudze.length, 1);
    assert.ok(mojeId.length > 1);
    assert.ok(cudze.every((p) => p.trenerId === drugi));
  });

  test("usunięcie planu zabiera wpisy klienta", () => {
    const plan = planTestowy("kaskada");
    plan.wykonania = [{ positionId: "D1-S01", tydzien: 1, data: "2026-09-02T10:00:00.000Z", feedback: "OK" }];
    plan.ukonczoneDni = [{ dzien: 1, tydzien: 1, data: "2026-09-02T10:30:00.000Z" }];
    magazyn.zapisz(plan);

    magazyn.usun(TRENER, "kaskada");
    assert.equal(magazyn.wczytaj(TRENER, "kaskada"), null);
    for (const tabela of ["wykonanie", "ukonczony_dzien"]) {
      const { c } = baza().prepare(
        `SELECT COUNT(*) AS c FROM ${tabela} WHERE plan_id = 'kaskada'`,
      ).get() as { c: number };
      assert.equal(c, 0, `${tabela} nie może zostać osierocone`);
    }
  });
});

describe("magazyn — scalanie kartotek", () => {
  /** Dwie kartoteki tej samej osoby — dokładnie to, co robi literówka w nazwisku. */
  function dwieKartoteki() {
    const zly = magazyn.zapisz(planTestowy("zuzana-x-1", "Zuzana X"));
    magazyn.zapiszWage(TRENER, zly.klientId, "2026-09-01", 61.5);
    magazyn.zapiszWage(TRENER, zly.klientId, "2026-09-08", 61.1);

    const dobry = magazyn.zapisz(planTestowy("zuzanna-x-1", "Zuzanna X"));
    magazyn.zapiszWage(TRENER, dobry.klientId, "2026-09-08", 99);   // ten sam dzień, inna liczba
    magazyn.zapiszWage(TRENER, dobry.klientId, "2026-09-15", 60.8);
    return { zly, dobry };
  }

  test("plany i waga przechodzą, kartoteka źródłowa znika", () => {
    const { zly, dobry } = dwieKartoteki();
    const wynik = magazyn.scalKlientow(TRENER, zly.klientId, dobry.klientId);

    assert.equal(wynik.przeniesionePlany, 1);
    assert.equal(magazyn.wczytajKlienta(TRENER, zly.klientId), null, "źródło znika");
    assert.deepEqual(
      magazyn.planyKlienta(TRENER, dobry.klientId).map((p) => p.id).sort(),
      ["zuzana-x-1", "zuzanna-x-1"],
    );
    assert.equal(magazyn.wczytaj(TRENER, "zuzana-x-1")!.klient, "Zuzanna X",
      "przeniesiony plan pokazuje nazwę celu");
  });

  test("przeniesione cykle dostają kolejne numery, nie duplikaty", () => {
    const { zly, dobry } = dwieKartoteki();
    // Cel ma już cykl 1.0, źródło też — po scaleniu muszą dać 1.0 i 2.0.
    magazyn.scalKlientow(TRENER, zly.klientId, dobry.klientId);

    const cykle = magazyn.planyKlienta(TRENER, dobry.klientId);
    assert.deepEqual(cykle.map((p) => p.wersja), [1, 2]);
    assert.deepEqual(cykle.map((p) => p.id), ["zuzanna-x-1", "zuzana-x-1"],
      "identyfikatory zostają — inaczej rozpadłby się łańcuch poprzednich cykli");
  });

  test("pomiar z tego samego dnia nie dubluje się ani nie nadpisuje", () => {
    const { zly, dobry } = dwieKartoteki();
    magazyn.scalKlientow(TRENER, zly.klientId, dobry.klientId);

    const waga = magazyn.wagaKlienta(TRENER, dobry.klientId);
    assert.deepEqual(waga.map((w) => w.data), ["2026-09-01", "2026-09-08", "2026-09-15"]);
    assert.equal(waga.find((w) => w.data === "2026-09-08")!.kg, 99,
      "przy konflikcie zostaje wpis klienta docelowego");
  });

  test("link przechodzi tylko wtedy, gdy cel go nie ma", () => {
    const { zly, dobry } = dwieKartoteki();
    const token = magazyn.nowyToken();
    magazyn.zapiszKlienta({ ...magazyn.wczytajKlienta(TRENER, zly.klientId)!, token });

    magazyn.scalKlientow(TRENER, zly.klientId, dobry.klientId);
    assert.equal(magazyn.klientPoTokenie(token)!.id, dobry.klientId,
      "link, który klient ma w telefonie, prowadzi teraz do właściwej kartoteki");
  });

  test("gdy cel ma własny link, zostaje jego", () => {
    const { zly, dobry } = dwieKartoteki();
    const tokenZlego = magazyn.nowyToken();
    const tokenDobrego = magazyn.nowyToken();
    magazyn.zapiszKlienta({ ...magazyn.wczytajKlienta(TRENER, zly.klientId)!, token: tokenZlego });
    magazyn.zapiszKlienta({ ...magazyn.wczytajKlienta(TRENER, dobry.klientId)!, token: tokenDobrego });

    magazyn.scalKlientow(TRENER, zly.klientId, dobry.klientId);
    assert.equal(magazyn.klientPoTokenie(tokenDobrego)!.id, dobry.klientId);
    assert.equal(magazyn.klientPoTokenie(tokenZlego), null, "stary link przestaje działać");
  });

  test("scalenie z samym sobą i z nieistniejącym jest odrzucane", () => {
    const { zly } = dwieKartoteki();
    assert.throws(() => magazyn.scalKlientow(TRENER, zly.klientId, zly.klientId), /samym sobą/);
    assert.throws(() => magazyn.scalKlientow(TRENER, zly.klientId, "kogo-nie-ma"), /docelowego/);
    assert.ok(magazyn.wczytajKlienta(TRENER, zly.klientId), "nieudane scalenie niczego nie kasuje");
  });
});

describe("magazyn — kopia jako nowa wersja", () => {
  test("dobór ćwiczeń zostaje, odczucia klienta znikają", () => {
    const zrodlo = planTestowy("kopia-zrodlo", "Zuzanna C");
    zrodlo.plan.sloty[0]!.cwiczenieId = "EX-0011";
    zrodlo.plan.sloty[0]!.tygodnie = { 1: { serie: 5, powtorzenia: 5, rpe: 7, feedback: "za łatwe" } };
    const zapisany = magazyn.zapisz(zrodlo);

    const kopia = magazyn.kopiaJakoNowaWersja(zapisany, 2);
    assert.equal(kopia.trenerId, TRENER, "kopia zostaje u tego samego trenera");
    assert.equal(kopia.poprzedniId, "kopia-zrodlo");
    assert.equal(kopia.status, "szkic");
    assert.equal(kopia.plan.sloty[0]!.cwiczenieId, "EX-0011");
    assert.equal(kopia.plan.sloty[0]!.tygodnie![1]!.serie, 5);
    assert.equal(kopia.plan.sloty[0]!.tygodnie![1]!.feedback, undefined,
      "odczucia należą do wykonanego cyklu");
  });

  test("ćwiczenia z poprzedniego cyklu są widoczne dla walidatora powtórek", () => {
    const zapisany = magazyn.wczytaj(TRENER, "kopia-zrodlo")!;
    const kopia = magazyn.zapisz(magazyn.kopiaJakoNowaWersja(zapisany, 3));
    assert.deepEqual(magazyn.cwiczeniaZPoprzedniegoCyklu(kopia), ["EX-0011"]);
  });
});

/**
 * Który cykl widzi telefon, gdy trener otworzy bieżący do poprawki.
 *
 * Sprawdzone na działającej konsoli: cofnięcie cyklu 2 do szkicu sprawiało,
 * że aktywnym stawał się **cykl 1**. Klient w połowie drugiego cyklu otwierał
 * aplikację i dostawał plan sprzed sześciu tygodni — ze starymi ciężarami,
 * bez żadnego znaku, że to nie jest dzisiejszy trening.
 *
 * Rozróżnienie, na którym to stoi: szkic, w którym klient **już pracował**,
 * to poprawiany cykl bieżący — wtedy nie ma czego pokazać i telefon dostaje
 * „plan w przygotowaniu" (a wyświetla ostatnią wersję, którą ma u siebie).
 * Szkic bez ani jednego wpisu to zwykły następny cykl, szykowany, gdy klient
 * kończy poprzedni — ten ma się nie liczyć.
 */
describe("magazyn — cykl cofnięty do szkicu", () => {
  const KLIENT = "Wracajaca Klientka";
  const klientId = () => magazyn.idKlienta(KLIENT);

  function cykl(wersja: number, status: magazyn.StatusPlanu): magazyn.ZapisanyPlan {
    const osoba = magazyn.zapewnijKlienta(TRENER, KLIENT);
    return magazyn.zapisz({
      id: magazyn.nowyId(KLIENT, wersja), trenerId: TRENER, klientId: osoba.id,
      klient: osoba.nazwa, wersja, status,
      dataStartu: null, utworzony: "", zmieniony: "",
      plan: magazyn.pustyPlan(osoba.nazwa),
    });
  }

  test("szkic bez pracy klienta nie zasłania poprzedniego cyklu", () => {
    cykl(1, "wysłany");
    cykl(2, "szkic");
    // Trener szykuje kolejny cykl, klient kończy poprzedni — normalny stan.
    assert.equal(magazyn.aktywnyPlan(TRENER, klientId())?.wersja, 1);
  });

  test("szkic, w którym klient już ćwiczył, nie cofa go do starego planu", () => {
    const drugi = cykl(2, "wysłany");
    magazyn.zapisz({
      ...drugi,
      wykonania: [{ positionId: "D1-S01", tydzien: 1, data: new Date().toISOString(),
        feedback: "OK" }],
    });
    // Trener otwiera bieżący cykl do poprawki.
    magazyn.zapisz({ ...magazyn.wczytaj(TRENER, drugi.id)!, status: "szkic" });

    assert.equal(magazyn.aktywnyPlan(TRENER, klientId()), null,
      "telefon dostał plan sprzed sześciu tygodni jako dzisiejszy trening");
  });

  test("po ponownym wysłaniu wraca ten sam cykl, z zapisami klienta", () => {
    const drugi = magazyn.wczytaj(TRENER, magazyn.nowyId(KLIENT, 2))!;
    magazyn.zapisz({ ...drugi, status: "wysłany" });

    const aktywny = magazyn.aktywnyPlan(TRENER, klientId());
    assert.equal(aktywny?.wersja, 2);
    assert.equal(aktywny?.wykonania?.length, 1, "praca klienta zniknęła po drodze");
  });
});
