/**
 * Ciężar ustawiany ręcznie przechodzi na kolejne tygodnie.
 *
 * Trener, 26.09.2026, przy „SLDL balance": „skoro są odgórnie ustalone
 * powtórzenia i serie, to jak klient dobierze sobie ciężar w T1, to zostaje
 * on do końca planu". Dotąd bez wpisu trenera w danym tygodniu stał tam sam
 * napis i klient dobierał ciężar co tydzień od nowa.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { przeliczPlan, tydzienWyliczony, type Plan } from "../src/plan.ts";

const SLDL = "EX-0183";      // SLDL balance — ręczne ustawienie
const WIOSLO = "EX-0016";    // na kilogramy — tego to nie dotyczy

function plan(tygodnie: Record<number, object> = {}, zmiany: Partial<Plan> = {}): Plan {
  const LP = ["A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2.", "E1.", "E2.", "", "", ""];
  const sloty = LP.map((lp, i) => ({
    positionId: `D1-S${String(i + 1).padStart(2, "0")}`, dzien: 1, lp,
    cwiczenieId: [SLDL, WIOSLO][i] ?? null, kategoriaSzkieletu: null,
    tygodnie: (i === 0 ? tygodnie : {}) as Plan["sloty"][number]["tygodnie"],
  }));
  return { nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [{ cwiczenieId: WIOSLO, ciezar: 80, powtorzenia: 5 }], sloty, ...zmiany };
}
const ciezary = (p: Plan, tygodnie = [1, 2, 3, 4, 5, 6]) => {
  const w = przeliczPlan(p);
  return tygodnie.map((t) => tydzienWyliczony(w, t)!.sloty[0]!.ciezar);
};
const zrodlo = (p: Plan, t: number) => tydzienWyliczony(przeliczPlan(p), t)!.sloty[0]!.ciezarZrodlo;
const klient = (kg: number, cwiczenieId = SLDL) => ({ ciezarKlienta: { kg, cwiczenieId } });

describe("ręczny ciężar przechodzi na kolejne tygodnie", () => {
  test("bez niczyjego wpisu zostaje napis, jak było", () => {
    assert.deepEqual(ciezary(plan()), Array(6).fill("ręczne ustawienie"));
  });

  test("wybór klienta z T1 zostaje do końca planu — także w deloadzie", () => {
    const p = plan({ 1: klient(22.5) }, { deload: true });
    assert.deepEqual(ciezary(p, [1, 2, 3, 4, 5, 6, 7]), Array(7).fill(22.5));
    assert.deepEqual(zrodlo(p, 4), { tydzien: 1, kto: "klient" });
    assert.deepEqual(zrodlo(p, 1), { tydzien: 1, kto: "klient" });
  });

  test("wpis trenera w T1 też przechodzi dalej", () => {
    const p = plan({ 1: { ciezarOverride: 20 } });
    assert.deepEqual(ciezary(p), Array(6).fill(20));
    assert.deepEqual(zrodlo(p, 3), { tydzien: 1, kto: "trener" });
    assert.equal(zrodlo(p, 1), undefined, "w T1 to po prostu wpis trenera");
  });

  test("w tym samym tygodniu klient przed trenerem — jego ciężar już się odbył", () => {
    const p = plan({ 1: { ciezarOverride: 20, ...klient(22.5) } });
    assert.deepEqual(ciezary(p, [1, 2]), [20, 22.5]);
  });

  test("nowszy wybór zastępuje starszy, a wpis trenera w danym tygodniu wygrywa", () => {
    const p = plan({ 1: klient(20), 3: klient(25), 5: { ciezarOverride: 30 } });
    assert.deepEqual(ciezary(p), [20, 20, 25, 25, 30, 30]);
    assert.deepEqual(zrodlo(p, 6), { tydzien: 5, kto: "trener" });
  });

  test("ciężar innego ćwiczenia nie przechodzi — po podmianie w slocie", () => {
    assert.deepEqual(ciezary(plan({ 1: klient(20, "EX-0100") }), [2]), ["ręczne ustawienie"]);
  });

  test("podmiana od T4 przerywa przenoszenie", () => {
    const p = plan({ 1: klient(20), 4: { cwiczenieIdOverride: "EX-0100" },
      5: { cwiczenieIdOverride: "EX-0100" }, 6: { cwiczenieIdOverride: "EX-0100" } });
    assert.deepEqual(ciezary(p), [20, 20, 20, "ręczne ustawienie", "ręczne ustawienie", "ręczne ustawienie"]);
  });

  test("ćwiczeń na kilogramy to nie dotyczy — te liczy 1RM", () => {
    const p = plan();
    p.sloty[1]!.tygodnie = { 1: { ciezarKlienta: { kg: 999, cwiczenieId: WIOSLO } } };
    const w = przeliczPlan(p);
    assert.notEqual(w.tygodnie[1]!.sloty[1]!.ciezar, 999);
  });
});
