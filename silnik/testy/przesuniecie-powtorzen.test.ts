/**
 * Przesunięcie powtórzeń — „±” w konsoli (19.10.2026).
 *
 * Trener: „jak dane ćwiczenie idzie T1–T3 8–10 powt. i później T4–T6 8–10, to
 * jak nacisnę ten nowy przycisk i wpiszę w T1 10, to będzie szło 10–12 w T1–T3
 * i 10–12 w T4–T6. Jeżeli ćwiczenie idzie od T1 do T6 10–15 powtórzeń, to jak
 * wpiszę 12 w T1, to ma iść 12–17. Wyjątkiem są ćwiczenia główne z własną
 * periodyzacją”.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { przeliczPlan, type Plan, type SlotPlanu } from "../src/plan.ts";
import { powtorzeniaOdT1 } from "../src/progresja.ts";
import { sprawdzPlan } from "../src/walidacja.ts";

const EZ_BAR_CURL = "EX-0086";   // kg, coeff 0,25 — objętość 10–12 w bloku
const DEAD_BUG = "EX-0050";      // masa ciała, coeff 0,5 — 10–15 przez cały cykl
const PRZYSIAD = "EX-0010";      // bój główny

const plan = (slot: Partial<SlotPlanu>, opcje: Partial<Plan> = {}): Plan => ({
  nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
  serieMaksymalne: [
    { cwiczenieId: EZ_BAR_CURL, ciezar: 30, powtorzenia: 10 },
    { cwiczenieId: PRZYSIAD, ciezar: 100, powtorzenia: 5 },
  ],
  sloty: [{ positionId: "D1-S02", dzien: 1, lp: "B1.", cwiczenieId: EZ_BAR_CURL, kategoriaSzkieletu: null, ...slot }],
  ...opcje,
});

const powtorzenia = (p: Plan) =>
  przeliczPlan(p).tygodnie.map((t) => t.sloty[0]!.powtorzenia);

test("ćwiczenie z ciężarem: 10–12 i 10–12, przesunięte o 2 → 12–14 i 12–14", () => {
  assert.deepEqual(powtorzenia(plan({})), [10, 11, 12, 10, 11, 12]);
  assert.deepEqual(powtorzenia(plan({ przesunieciePowtorzen: 2 })), [12, 13, 14, 12, 13, 14]);
  assert.deepEqual(powtorzenia(plan({ przesunieciePowtorzen: -2 })), [8, 9, 10, 8, 9, 10]);
});

test("masa ciała: 10–15 przez cały cykl, przesunięte o 2 → 12–17, bez błędu „poza tabelą”", () => {
  const p = plan({ cwiczenieId: DEAD_BUG, przesunieciePowtorzen: 2 });
  assert.deepEqual(powtorzenia(plan({ cwiczenieId: DEAD_BUG })), [10, 11, 12, 13, 14, 15]);
  assert.deepEqual(powtorzenia(p), [12, 13, 14, 15, 16, 17]);
  const uwagi = sprawdzPlan(p, przeliczPlan(p));
  assert.ok(!uwagi.some((u) => u.kod === "POWT_POZA_TABELA"), JSON.stringify(uwagi.map((u) => u.kod)));
});

test("z ciężarem tabela kończy się na 15 — automat nie wychodzi poza nią", () => {
  assert.deepEqual(powtorzenia(plan({ przesunieciePowtorzen: 5 })), [15, 15, 15, 15, 15, 15]);
});

test("wpisane 16 przy ciężarze dalej jest błędem — przy masie ciała już nie", () => {
  const zCiezarem = plan({ tygodnie: { 1: { powtorzenia: 16 } } });
  assert.ok(sprawdzPlan(zCiezarem, przeliczPlan(zCiezarem)).some((u) => u.kod === "POWT_POZA_TABELA"));
  const masaCiala = plan({ cwiczenieId: DEAD_BUG, tygodnie: { 1: { powtorzenia: 16 } } });
  assert.ok(!sprawdzPlan(masaCiala, przeliczPlan(masaCiala)).some((u) => u.kod === "POWT_POZA_TABELA"));
});

test("liczba wpisana przez trenera w tygodniu wygrywa z przesunięciem", () => {
  assert.deepEqual(powtorzenia(plan({ przesunieciePowtorzen: 2, tygodnie: { 3: { powtorzenia: 8 } } })),
    [12, 13, 8, 12, 13, 14]);
});

test("bój główny ma własną periodyzację — przesunięcie go nie rusza", () => {
  const boj = { positionId: "D1-S01", lp: "A1.", cwiczenieId: PRZYSIAD };
  assert.deepEqual(powtorzenia(plan({ ...boj, przesunieciePowtorzen: 3 })), powtorzenia(plan(boj)));
});

test("deload przy masie ciała wraca do T1 — przesuniętego", () => {
  const w = przeliczPlan(plan({ cwiczenieId: DEAD_BUG, przesunieciePowtorzen: 2 }, { deload: true }));
  assert.equal(w.tygodnieDodatkowe[0]!.sloty[0]!.powtorzenia, 12);
});

// ── „±” w konsoli: powtorzeniaOdT1 ──────────────────────────────────

const odT1 = (p: Plan, t1: number | null) => {
  const wynik = powtorzeniaOdT1(p, "D1-S02", t1);
  if ("blad" in wynik) throw new Error(wynik.blad);
  return wynik;
};

test("od T1 = 6 przy 8–10/8–10 — 6–8 i 6–8, liczone od progresji z planu", () => {
  const p = odT1(plan({ cwiczenieId: "EX-0077" }), 6);   // Dumbbell row, coeff 0,75
  assert.deepEqual(powtorzenia(plan({ cwiczenieId: "EX-0077" })), [8, 9, 10, 8, 9, 10]);
  assert.deepEqual(powtorzenia(p), [6, 7, 8, 6, 7, 8]);
  assert.equal(p.sloty[0]!.przesunieciePowtorzen, -2);
});

test("trener najpierw wpisał 6 w T1, potem „±” z tą samą liczbą — reszta tygodni idzie za nim (19.10.2026)", () => {
  // „w T2 nadal jest 9 po zmianie, a nie 7” — pierwsza wersja liczyła różnicę
  // od bieżącego T1 (już 6), więc wychodziło zero.
  const wpisane = plan({ cwiczenieId: "EX-0077", tygodnie: { 1: { powtorzenia: 6, serie: 3 }, 3: { powtorzenia: 12 } } });
  assert.deepEqual(powtorzenia(wpisane), [6, 9, 12, 8, 9, 10]);
  const p = odT1(wpisane, 6);
  assert.deepEqual(powtorzenia(p), [6, 7, 8, 6, 7, 8]);
  assert.deepEqual(p.sloty[0]!.tygodnie, { 1: { serie: 3 }, 3: {} }, "wpisane powtórzenia ustępują, reszta zostaje");
});

test("masa ciała od T1 = 12 — 12–17", () => {
  assert.deepEqual(powtorzenia(odT1(plan({ cwiczenieId: DEAD_BUG }), 12)), [12, 13, 14, 15, 16, 17]);
});

test("ponowne „±” z tą samą liczbą nic nie psuje, inna liczba — od progresji z planu, nie od poprzedniego przesunięcia", () => {
  const raz = odT1(plan({}), 12);
  assert.deepEqual(powtorzenia(odT1(raz, 12)), [12, 13, 14, 12, 13, 14]);
  assert.deepEqual(powtorzenia(odT1(raz, 9)), [9, 10, 11, 9, 10, 11]);
});

test("puste pole — progresja z planu: bez przesunięcia i bez wpisanych powtórzeń", () => {
  const p = odT1(plan({ przesunieciePowtorzen: 3, tygodnie: { 2: { powtorzenia: 5, rpe: 8 } } }), null);
  assert.deepEqual(powtorzenia(p), [10, 11, 12, 10, 11, 12]);
  assert.equal(p.sloty[0]!.przesunieciePowtorzen, undefined);
  assert.deepEqual(p.sloty[0]!.tygodnie, { 2: { rpe: 8 } });
});

test("przy „↗” (stałe powtórzenia) wszystkie tygodnie dostają T1, a zapis „↗” idzie za nimi", () => {
  const tygodnie = Object.fromEntries([7.5, 8, 8.5, 9, 9.5, 10].map((rpe, i) => [i + 1, { rpe, powtorzenia: 10 }]));
  const p = odT1(plan({ tygodnie, przedRpeRosnacym: {
    rpe: {}, powtorzenia: { 2: 10, 3: 10, 4: 10, 5: 10, 6: 10 }, trybCiezaru: null } }), 8);
  assert.deepEqual(powtorzenia(p), [8, 8, 8, 8, 8, 8]);
  assert.deepEqual(p.sloty[0]!.przedRpeRosnacym!.powtorzenia, { 2: 8, 3: 8, 4: 8, 5: 8, 6: 8 });
  assert.equal(p.sloty[0]!.przesunieciePowtorzen, -2, "po wyłączeniu „↗” automat od 8");
});

test("odmowy: powyżej 15 przy ciężarze, bój główny", () => {
  const za = powtorzeniaOdT1(plan({}), "D1-S02", 15);   // 10–12 → 15–17
  assert.ok("blad" in za && /15 powtórzeniach/.test(za.blad), JSON.stringify(za));
  const boj = powtorzeniaOdT1(plan({ lp: "A1.", cwiczenieId: PRZYSIAD }), "D1-S02", 8);
  assert.ok("blad" in boj && /własną periodyzację/.test(boj.blad), JSON.stringify(boj));
});
