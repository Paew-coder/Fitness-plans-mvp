/**
 * Pauzowane wyciskanie i przysiad — własna progresja z periodyzacji trenera
 * (02.10.2026): cz.1 = Blok I, cz.2 = Blok II, T1–T5 z arkusza, T6 jak T5,
 * zawsze na każdej pozycji, „G” robi z ćwiczenia zwykły bój.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { przeliczPlan, tydzienWyliczony, type Plan } from "../src/plan.ts";
import { zastosujProgresje } from "../src/progresja.ts";
import type { CzescPlanu } from "../src/typy.ts";

const PAUZA_BP = "EX-0022";      // Bench press paused 3sec
const PAUZA_SQ = "EX-0205";      // Barbell low bar squat paused 3sec
const LP = ["A1.", "B1.", "B2.", "C1."];

function plan(cwiczenia: (string | null)[], zmiany: Partial<Plan> = {}, slot: object = {}): Plan {
  return {
    nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [
      { cwiczenieId: PAUZA_BP, ciezar: 102, powtorzenia: 1 },
      { cwiczenieId: PAUZA_SQ, ciezar: 120, powtorzenia: 1 },
      { cwiczenieId: "EX-0011", ciezar: 115, powtorzenia: 1 },
    ],
    sloty: cwiczenia.map((id, i) => ({
      positionId: `D1-S0${i + 1}`, dzien: 1, lp: LP[i]!, cwiczenieId: id,
      kategoriaSzkieletu: null, tygodnie: {}, ...(i === 1 ? slot : {}),
    })),
    ...zmiany,
  };
}
const tydzien = (p: Plan, t: number, poz = 1) => tydzienWyliczony(przeliczPlan(p), t)!.sloty[poz]!;
const schemat = (p: Plan, poz = 1) => [1, 2, 3, 4, 5, 6].map((t) => {
  const s = tydzien(p, t, poz);
  return `${s.serie}×${s.powtorzenia}@${s.rpe}`;
}).join(" ");

describe("progresja pauzowana", () => {
  test("pauzowane wyciskanie na B1, cz.1 = Blok I arkusza, T6 jak T5", () => {
    const p = plan(["EX-0011", PAUZA_BP]);
    assert.equal(schemat(p), "5×3@7.5 5×3@8 4×3@8 5×3@8.5 5×2@8.5 5×2@8.5");
    assert.equal(tydzien(p, 1).pauza, "wyciskanie");
  });

  test("ciężary jak w arkuszu trenera: 85 · 87,5 · 90 · 92,5 kg (T1, T2, T4, T5)", () => {
    const p = plan(["EX-0011", PAUZA_BP]);
    assert.deepEqual([1, 2, 4, 5].map((t) => tydzien(p, t).ciezar), [85, 87.5, 90, 92.5]);
  });

  test("cz.2 = Blok II", () => {
    const p = plan(["EX-0011", PAUZA_BP], { czescPlanu: "intensywność" });
    assert.equal(schemat(p), "5×4@8 5×4@8 5×3@8 5×4@9 4×3@8.5 4×3@8.5");
  });

  test("pauzowany przysiad: cz.1 jak RAW squat z Bloku I, cz.2 jak pause lowbar z Bloku II", () => {
    assert.equal(schemat(plan(["EX-0011", PAUZA_SQ])), "4×5@7 4×5@8 4×5@8.5 4×4@8.5 4×4@9 4×4@9");
    assert.equal(schemat(plan(["EX-0011", PAUZA_SQ], { czescPlanu: "intensywność" })),
      "4×5@8 4×5@8.5 4×4@8.5 4×4@9 4×5@9 4×5@9");
  });

  test("na każdej pozycji — także na A1 i na C1", () => {
    assert.equal(schemat(plan([PAUZA_BP]), 0), "5×3@7.5 5×3@8 4×3@8 5×3@8.5 5×2@8.5 5×2@8.5");
    assert.equal(schemat(plan(["EX-0011", null, null, PAUZA_SQ]), 3), "4×5@7 4×5@8 4×5@8.5 4×4@8.5 4×4@9 4×4@9");
  });

  test("„G” robi z pauzowanego zwykły bój", () => {
    const p = plan(["EX-0011", PAUZA_BP], {}, { bojGlowny: true });
    assert.equal(tydzien(p, 1).serie, 6);
    assert.equal(tydzien(p, 1).powtorzenia, 6);
    assert.equal(tydzien(p, 1).pauza, undefined);
  });

  test("w hipertrofii jak dotąd, chyba że „S”", () => {
    for (const czesc of ["hipertrofia", "hipertrofia 2"] as CzescPlanu[]) {
      assert.equal(tydzien(plan(["EX-0011", PAUZA_BP], { czescPlanu: czesc }), 1).pauza, undefined);
    }
    // Pauzowane na A1 w hipertrofii z „S” liczy się częścią siłową — pauzowaną.
    const zS = plan([PAUZA_BP], { czescPlanu: "hipertrofia 2" });
    (zS.sloty[0] as { bojSilowy?: boolean }).bojSilowy = true;
    assert.equal(schemat(zS, 0), "5×4@8 5×4@8 5×3@8 5×4@9 4×3@8.5 4×3@8.5");
  });

  test("ciężar z RPE co tydzień także przy „trzymaj z bloku”", () => {
    const p = plan(["EX-0011", PAUZA_BP]);
    // T5 to 5×2 @8,5 — inna liczba powtórzeń niż T4, więc ciężar musi się zmienić.
    assert.notEqual(tydzien(p, 4).ciezar, tydzien(p, 5).ciezar);
  });

  test("deload (T7) wychodzi z T6: te same serie i powtórzenia, RPE o 1 niżej", () => {
    const p = plan(["EX-0011", PAUZA_BP], { deload: true });
    const w = przeliczPlan(p);
    const t7 = tydzienWyliczony(w, 7)!.sloty[1]!;
    assert.equal(`${t7.serie}×${t7.powtorzenia}@${t7.rpe}`, "5×2@7.5");
  });

  test("„wpisz progresję” wpisuje liczby pauzowane, a zmiana części przepisuje je razem z bojami", () => {
    const wpisane = zastosujProgresje(plan(["EX-0011", PAUZA_BP, "EX-0016"]));
    assert.deepEqual(wpisane.sloty[1]!.tygodnie![1], { serie: 5, powtorzenia: 3, rpe: 7.5 });
    const cz2 = zastosujProgresje({ ...wpisane, czescPlanu: "intensywność" }, undefined, { tylkoBoje: true });
    assert.deepEqual(cz2.sloty[1]!.tygodnie![1], { serie: 5, powtorzenia: 4, rpe: 8 });
    assert.deepEqual(cz2.sloty[2]!.tygodnie, wpisane.sloty[2]!.tygodnie, "akcesorium nietknięte");
  });
});
