/**
 * Trzecia część planu: hipertrofia (25.09.2026, zaplanowana 21.09).
 *
 * Trener: „możemy zrobić osobną progresję 12/14". Wzór to szablony
 * „Hipertroficzny 1–4 dni" z jego aplikacji w Base44: bój główny
 * 4 × 12 → 13 → 14 na RPE 8, w drugim bloku to samo na RPE 9, bez TOP SETU;
 * akcesoria na 12/14 — trzecia kolumna obok 8/10 (objętość) i 6/8
 * (intensywność).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { przeliczPlan, TYGODNIE, type Plan } from "../src/plan.ts";
import { powtorzeniaBazowe } from "../src/powtorzenia.ts";

function plan(): Plan {
  const LP = ["A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2.", "E1.", "E2.", "", "", ""];
  const sloty = [];
  for (let poz = 1; poz <= 12; poz++) {
    sloty.push({
      positionId: `D1-S${String(poz).padStart(2, "0")}`, dzien: 1, lp: LP[poz - 1]!,
      cwiczenieId: ["EX-0010", "EX-0016", "EX-0012"][poz - 1] ?? null,
      kategoriaSzkieletu: null, tygodnie: {} as Plan["sloty"][number]["tygodnie"],
    });
  }
  return {
    nazwa: "hipertrofia", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "hipertrofia",
    serieMaksymalne: [
      { cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 1 },
      { cwiczenieId: "EX-0016", ciezar: 80, powtorzenia: 1 },
      { cwiczenieId: "EX-0012", ciezar: 45, powtorzenia: 1 },
    ],
    sloty,
    topSety: [{ dzien: 1, wlaczony: true, slotPositionId: "D1-S01" }],
  };
}

describe("hipertrofia", () => {
  const w = przeliczPlan(plan());
  const tydzien = (t: number, i: number) => w.tygodnie[t - 1]!.sloty[i]!;

  test("bój główny: 4 × 12 → 13 → 14, RPE 8, w drugim bloku RPE 9", () => {
    assert.deepEqual(TYGODNIE.map((t) => [tydzien(t, 0).serie, tydzien(t, 0).powtorzenia, tydzien(t, 0).rpe]),
      [[4, 12, 8], [4, 13, 8], [4, 14, 8], [4, 12, 9], [4, 13, 9], [4, 14, 9]]);
  });

  test("akcesoria: 12/14 — cięższe od 12, lżejsze od 14, nie ponad tabelę", () => {
    assert.equal(powtorzeniaBazowe(0.75, "hipertrofia"), 12);
    assert.equal(powtorzeniaBazowe(1, "hipertrofia"), 12);
    assert.equal(powtorzeniaBazowe(0.25, "hipertrofia"), 14);
    assert.deepEqual(TYGODNIE.map((t) => tydzien(t, 1).powtorzenia), [12, 13, 14, 12, 13, 14]);
    assert.deepEqual(TYGODNIE.map((t) => tydzien(t, 2).powtorzenia), [14, 15, 15, 14, 15, 15]);
  });

  test("bez TOP SETU, choć trener postawił go w dniu", () => {
    for (const t of w.tygodnie) assert.equal(t.topSety[0]?.cwiczenie ?? null, null, `T${t.tydzien}`);
  });

  test("ciężar liczy się z tabeli jak w pozostałych częściach", () => {
    for (const t of TYGODNIE) assert.equal(typeof tydzien(t, 0).ciezar, "number", `T${t}`);
    assert.ok((tydzien(1, 0).ciezar as number) < (tydzien(1, 0).oneRM * 0.8));
  });

  test("wpisane RPE TOP SETU dalej wygrywa z szablonem", () => {
    const p = plan();
    p.topSety = [{ dzien: 1, wlaczony: true, slotPositionId: "D1-S01", rpeTygodni: { 3: 7 } }];
    assert.equal(przeliczPlan(p).tygodnie[2]!.topSety[0]!.rpe, 7);
  });
});
