/**
 * Kilka TOP SETÓW w jednym dniu — trener, 27.09.2026, przy szablonie
 * Rozbudowanym: „A1 barbell bench press robię TOP SET i później robocze,
 * a następnie B1 low bar squat i tam też na początek TOP SET i robocze".
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { przeliczPlan, TYGODNIE, type Plan } from "../src/plan.ts";

function plan(): Plan {
  const LP = ["A1.", "B1.", "C1."];
  return {
    nazwa: "rozbudowany", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [
      { cwiczenieId: "EX-0011", ciezar: 100, powtorzenia: 1 },   // bench press
      { cwiczenieId: "EX-0010", ciezar: 140, powtorzenia: 1 },   // back squat
      { cwiczenieId: "EX-0016", ciezar: 80, powtorzenia: 1 },
    ],
    sloty: LP.map((lp, i) => ({
      positionId: `D1-S0${i + 1}`, dzien: 1, lp,
      cwiczenieId: ["EX-0011", "EX-0010", "EX-0016"][i]!, kategoriaSzkieletu: null,
      // B1 jako bój z decyzji trenera („G"), jak drugi bój w Rozbudowanym.
      ...(i === 1 ? { bojGlowny: true } : {}),
      tygodnie: {},
    })),
    topSety: [
      { dzien: 1, wlaczony: true, slotPositionId: "D1-S02" },    // kolejność wpisów bez znaczenia
      { dzien: 1, wlaczony: true, slotPositionId: "D1-S01" },
    ],
  };
}

describe("kilka TOP SETÓW w dniu", () => {
  const w = przeliczPlan(plan());

  test("dwa TOP SETY w kolejności tabeli, każdy przy swoim ćwiczeniu", () => {
    const t2 = w.tygodnie[1]!.topSety;
    assert.deepEqual(t2.map((t) => [t.positionId, t.cwiczenie?.id, t.rpe]),
      [["D1-S01", "EX-0011", 6], ["D1-S02", "EX-0010", 6]]);
    assert.ok(t2.every((t) => typeof t.ciezar === "number"));
    assert.ok((t2[1]!.ciezar as number) > (t2[0]!.ciezar as number), "przysiad cięższy niż wyciskanie");
  });

  test("każdy TOP SET to jedna seria więcej w podsumowaniu dnia", () => {
    const bez = przeliczPlan({ ...plan(), topSety: [] });
    for (const t of TYGODNIE.slice(1)) {
      assert.equal(w.tygodnie[t - 1]!.dni[0]!.serie - bez.tygodnie[t - 1]!.dni[0]!.serie, 2, `T${t}`);
    }
  });

  test("dwa wpisy przy tym samym ćwiczeniu to jeden TOP SET", () => {
    const p = plan();
    const podwojny = przeliczPlan({ ...p, topSety: [...p.topSety!, { dzien: 1, wlaczony: true, slotPositionId: "D1-S01" }] });
    assert.equal(podwojny.tygodnie[1]!.topSety.length, 2);
  });

  test("wyłączony wpis nic nie daje", () => {
    const p = plan();
    const jeden = przeliczPlan({ ...p, topSety: [{ ...p.topSety![0]!, wlaczony: false }, p.topSety![1]!] });
    assert.deepEqual(jeden.tygodnie[1]!.topSety.map((t) => t.positionId), ["D1-S01"]);
  });
});
