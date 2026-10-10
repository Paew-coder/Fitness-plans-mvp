/**
 * Hipertrofia jako część planu — cz. 1 od 25.09.2026, cz. 2 od 27.09.2026.
 *
 * Cz. 1 z szablonów „Hipertroficzny 1–4 dni" z aplikacji trenera w Base44:
 * bój główny 4 × 12 → 13 → 14 na RPE 8, w drugim bloku to samo na RPE 9,
 * bez TOP SETU. Cz. 2 — trener, 27.09: bój 4 × 10 → 11 → 12, to samo RPE.
 * Akcesoria (trener, 27.09): cz. 1 złożone 10–12, izolacje 12–14; cz. 2
 * złożone 8–10, izolacje 10–12. Do 27.09 cz. 1 miała 12/14.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { przeliczPlan, TYGODNIE, type Plan } from "../src/plan.ts";
import { powtorzeniaBazowe } from "../src/powtorzenia.ts";

function plan(czescPlanu: Plan["czescPlanu"] = "hipertrofia"): Plan {
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
    nazwa: "hipertrofia", trybAkcesoriow: "trzymaj z bloku", czescPlanu,
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

  test("akcesoria cz. 1: złożone 10–12, izolacje 12–14", () => {
    assert.equal(powtorzeniaBazowe(0.75, "hipertrofia"), 10);
    assert.equal(powtorzeniaBazowe(1, "hipertrofia"), 10);
    assert.equal(powtorzeniaBazowe(0.25, "hipertrofia"), 12);
    assert.deepEqual(TYGODNIE.map((t) => tydzien(t, 1).powtorzenia), [10, 11, 12, 10, 11, 12]);
    assert.deepEqual(TYGODNIE.map((t) => tydzien(t, 2).powtorzenia), [12, 13, 14, 12, 13, 14]);
  });

  test("bez TOP SETU, choć trener postawił go w dniu", () => {
    for (const t of w.tygodnie) assert.equal(t.topSety[0]?.cwiczenie ?? null, null, `T${t.tydzien}`);
  });

  test("ciężar liczy się z tabeli jak w pozostałych częściach", () => {
    for (const t of TYGODNIE) assert.equal(typeof tydzien(t, 0).ciezar, "number", `T${t}`);
    assert.ok((tydzien(1, 0).ciezar as number) < (tydzien(1, 0).oneRM * 0.8));
  });

  test("cz. 2: bój 4 × 10 → 11 → 12 (RPE 8, potem 9), akcesoria 8–10 / 10–12, bez TOP SETU", () => {
    const w2 = przeliczPlan(plan("hipertrofia 2"));
    const t2 = (t: number, i: number) => w2.tygodnie[t - 1]!.sloty[i]!;
    assert.deepEqual(TYGODNIE.map((t) => [t2(t, 0).serie, t2(t, 0).powtorzenia, t2(t, 0).rpe]),
      [[4, 10, 8], [4, 11, 8], [4, 12, 8], [4, 10, 9], [4, 11, 9], [4, 12, 9]]);
    assert.equal(powtorzeniaBazowe(0.75, "hipertrofia 2"), 8);
    assert.equal(powtorzeniaBazowe(0.25, "hipertrofia 2"), 10);
    assert.deepEqual(TYGODNIE.map((t) => t2(t, 1).powtorzenia), [8, 9, 10, 8, 9, 10]);
    assert.deepEqual(TYGODNIE.map((t) => t2(t, 2).powtorzenia), [10, 11, 12, 10, 11, 12]);
    for (const t of w2.tygodnie) assert.equal(t.topSety[0]?.cwiczenie ?? null, null, `T${t.tydzien}`);
  });

  test("wpisane RPE TOP SETU dalej wygrywa z szablonem", () => {
    const p = plan();
    p.topSety = [{ dzien: 1, wlaczony: true, slotPositionId: "D1-S01", rpeTygodni: { 3: 7 } }];
    assert.equal(przeliczPlan(p).tygodnie[2]!.topSety[0]!.rpe, 7);
  });
});

/*
 * Bój siłowy w hipertrofii — trener, 27.09.2026: „żeby móc zrobić standardowo
 * ćwiczenie główne razem z TOP SETEM w hipertrofii". Znacznik przy boju
 * przełącza jego progresję i TOP SET na część siłową tego samego etapu;
 * akcesoria zostają hipertroficzne.
 */
describe("bój siłowy w hipertrofii („S”)", () => {
  function zSilowym(czesc: Plan["czescPlanu"]): Plan {
    const p = plan(czesc);
    return { ...p, sloty: p.sloty.map((s, i) => (i === 0 ? { ...s, bojSilowy: true } : s)) };
  }
  const bojITop = (w: ReturnType<typeof przeliczPlan>) => TYGODNIE.map((t) => {
    const s = w.tygodnie[t - 1]!;
    return [s.sloty[0]!.serie, s.sloty[0]!.powtorzenia, s.sloty[0]!.rpe, s.topSety[0]?.rpe ?? null];
  });

  test("cz. 1: bój jak objętość, TOP SET od T2 (6 → 8), akcesoria dalej 10–12", () => {
    const w = przeliczPlan(zSilowym("hipertrofia"));
    assert.deepEqual(bojITop(w), [[6, 6, 6.5, null], [5, 6, 7, 6], [5, 5, 7, 6.5],
      [4, 5, 7.5, 7], [5, 4, 7.5, 7.5], [6, 3, 7.5, 8]]);
    assert.equal(w.tygodnie[1]!.topSety[0]!.cwiczenie?.id, "EX-0010");
    assert.equal(typeof w.tygodnie[1]!.topSety[0]!.ciezar, "number");
    assert.deepEqual(TYGODNIE.map((t) => w.tygodnie[t - 1]!.sloty[1]!.powtorzenia), [10, 11, 12, 10, 11, 12]);
  });

  test("cz. 2: bój jak intensywność, TOP SET 7 → 9, akcesoria 8–10", () => {
    const w = przeliczPlan(zSilowym("hipertrofia 2"));
    assert.deepEqual(bojITop(w), [[6, 4, 7, null], [6, 4, 7, 7], [5, 4, 7.5, 7.5],
      [5, 3, 7.5, 8], [5, 3, 8, 8.5], [6, 2, 8, 9]]);
    assert.deepEqual(TYGODNIE.map((t) => w.tygodnie[t - 1]!.sloty[1]!.powtorzenia), [8, 9, 10, 8, 9, 10]);
  });

  test("poza hipertrofią i przy akcesorium znacznik nic nie zmienia", () => {
    const sila = przeliczPlan({ ...zSilowym("objętość") });
    const bez = przeliczPlan(plan("objętość"));
    assert.deepEqual(bojITop(sila), bojITop(bez));
    const p = zSilowym("hipertrofia");
    const akcesorium = { ...p, sloty: p.sloty.map((s, i) => (i === 0 ? { ...s, bojGlowny: false } : s)) };
    const w = przeliczPlan(akcesorium);
    assert.ok(w.tygodnie.every((t) => t.topSety[0]?.rpe == null), "TOP SET akcesorium w hipertrofii bez RPE");
  });

  test("„progresja 5.18” wpisuje bojowi siłowemu liczby części siłowej", async () => {
    const { zastosujProgresje } = await import("../src/progresja.ts");
    const p = zastosujProgresje(zSilowym("hipertrofia"));
    assert.deepEqual([p.sloty[0]!.tygodnie[1], p.sloty[0]!.tygodnie[6]].map((x) => [x!.serie, x!.powtorzenia, x!.rpe]),
      [[6, 6, 6.5], [6, 3, 7.5]]);
  });
});
