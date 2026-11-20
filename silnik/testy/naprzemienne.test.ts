/**
 * Ćwiczenia naprzemienne — powtórzenia łącznie na obie strony, zawsze parzyste
 * (20.11.2026). Trener: „w T1 robię 12 powtórzeń na przemian, a w T2 muszę
 * zrobić 14, żeby strony były symetryczne — licznik przeskakuje z 12 na 13”.
 * Decyzje: liczba łącznie, nieparzyste w górę, „alternating” z bibliotek to
 * naprzemienne, nie jednostronne.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { katalog } from "../src/katalog.ts";
import { przeliczPlan, type Plan } from "../src/plan.ts";
import { parzystePowtorzenia } from "../src/powtorzenia.ts";

const BENCH_ALT = "EX-0060";   // Dumbbell bench press alternating — kg
const CURL_ALT = "EX-0496";    // 2DB Alt. Bicep Curl — biblioteka, dotąd jednostronne
const LUNGE_ALT = "EX-0975";   // Alt. Drop Lunge — masa ciała

const plan = (cwiczenieId: string, tygodnie = {}): Plan => ({
  nazwa: "nap", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
  serieMaksymalne: [{ cwiczenieId, ciezar: 30, powtorzenia: 10 }],
  sloty: [{ positionId: "D1-S04", dzien: 1, lp: "C1.", cwiczenieId, tygodnie }],
} as unknown as Plan);
const powt = (p: Plan) => przeliczPlan(p).tygodnie.map((t) => t.sloty[0]!.powtorzenia);

test("parzyste: nieparzyste w górę, ponad tabelę — w dół", () => {
  assert.deepEqual([12, 13, 14, 15].map((n) => parzystePowtorzenia(n)), [12, 14, 14, 16]);
  assert.equal(parzystePowtorzenia(15, 15), 14);
});

test("z nazwy: naprzemienne, a nie jednostronne", () => {
  for (const id of [BENCH_ALT, CURL_ALT, LUNGE_ALT]) {
    const c = katalog.poId(id)!;
    assert.ok(c.naprzemienne && !c.jednostronne, c.nazwa);
  }
  assert.ok(!katalog.poId("EX-0010")!.naprzemienne, "przysiad nie");
});

test("progresja i wpis trenera — same parzyste; nieparzyste w górę", () => {
  assert.ok(powt(plan(CURL_ALT)).every((n) => n % 2 === 0), powt(plan(CURL_ALT)).join(" "));
  assert.deepEqual(powt(plan(LUNGE_ALT, { 1: { powtorzenia: 12 }, 2: { powtorzenia: 13 } })).slice(0, 2), [12, 14]);
});

test("ocena przy masie ciała zmienia o 2 (po jednym na stronę)", () => {
  const bez = powt(plan(LUNGE_ALT));
  const trudne = powt(plan(LUNGE_ALT, { 1: { feedback: "za trudne" } }));
  const latwe = powt(plan(LUNGE_ALT, { 1: { feedback: "za łatwe" } }));
  assert.equal(bez[1]! - trudne[1]!, 2);
  assert.equal(latwe[1]! - bez[1]!, 2);
});
