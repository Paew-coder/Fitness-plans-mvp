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
