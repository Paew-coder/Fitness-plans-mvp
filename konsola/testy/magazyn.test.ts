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
    id, trenerId: TRENER, klient, wersja: 1, status: "szkic",
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
        feedback: "za trudne", ciezarWykonany: 62.5, powtorzeniaWykonane: 8,
      },
    ];
    plan.ukonczoneDni = [{ dzien: 1, tydzien: 1, data: "2026-09-02T10:30:00.000Z" }];
    plan.waga = [{ data: "2026-09-01", kg: 78.4 }, { data: "2026-09-08", kg: 78 }];

    magazyn.zapisz(plan);
    const w = magazyn.wczytaj(TRENER, "wpisy")!;

    assert.equal(w.wykonania!.length, 2);
    assert.deepEqual(w.wykonania!.find((x) => x.positionId === "D1-S02"), plan.wykonania[1]);
    assert.deepEqual(w.ukonczoneDni, plan.ukonczoneDni);
    assert.deepEqual(w.waga, plan.waga);
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
  test("token prowadzi do planu, byle token nie", () => {
    const plan = planTestowy("token");
    plan.token = magazyn.nowyToken();
    magazyn.zapisz(plan);

    assert.equal(magazyn.wczytajPoTokenie(plan.token)!.id, "token");
    assert.equal(magazyn.wczytajPoTokenie("nieistniejacy-token-1234"), null);
    assert.equal(magazyn.wczytajPoTokenie(""), null, "pusty token nie może niczego otworzyć");
    assert.equal(magazyn.wczytajPoTokenie("krotki"), null);
  });

  test("unieważnienie tokenu zamyka dostęp natychmiast", () => {
    const plan = planTestowy("uniewaznienie");
    plan.token = magazyn.nowyToken();
    const zapisany = magazyn.zapisz(plan);

    magazyn.zapisz({ ...zapisany, token: undefined });
    assert.equal(magazyn.wczytajPoTokenie(plan.token), null);
  });
});

describe("magazyn — rozdzielenie trenerów", () => {
  test("trener nie widzi planów drugiego trenera", () => {
    const drugi = Number(baza().prepare(
      "INSERT INTO trener (email, nazwa, utworzony) VALUES (?, ?, ?)",
    ).run("drugi@localhost", "Drugi", new Date().toISOString()).lastInsertRowid);

    // Ten sam identyfikator planu u obu trenerów — musi być dozwolony.
    magazyn.zapisz({ ...planTestowy("wspolne-id"), klient: "Pierwszy klient" });
    magazyn.zapisz({ ...planTestowy("wspolne-id"), trenerId: drugi, klient: "Drugi klient" });

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
    plan.waga = [{ data: "2026-09-01", kg: 80 }];
    magazyn.zapisz(plan);

    magazyn.usun(TRENER, "kaskada");
    assert.equal(magazyn.wczytaj(TRENER, "kaskada"), null);
    for (const tabela of ["wykonanie", "ukonczony_dzien", "pomiar_wagi"]) {
      const { c } = baza().prepare(
        `SELECT COUNT(*) AS c FROM ${tabela} WHERE plan_id = 'kaskada'`,
      ).get() as { c: number };
      assert.equal(c, 0, `${tabela} nie może zostać osierocone`);
    }
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
