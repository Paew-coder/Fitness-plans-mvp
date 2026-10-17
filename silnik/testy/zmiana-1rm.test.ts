/**
 * 1RM zmienione serią w środku cyklu (17.10.2026) — tygodnie przed zmianą
 * liczą się ze starego 1RM, od zmiany z nowego. Samą zmianę liczy konsola
 * (`konsola/kalibracja.ts`); silnik tylko czyta `wczesniej`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { przeliczPlan, type Plan } from "../src/plan.ts";
import { rozwiaz1RM } from "../src/rpe.ts";

const PRZYSIAD = "EX-0010";
const WIOSLOWANIE = "EX-0016";

test("rozwiaz1RM: tydzień bierze swój odcinek, bez tygodnia — obecne 1RM", () => {
  const serie = [{ cwiczenieId: PRZYSIAD, ciezar: 130, powtorzenia: 1,
    wczesniej: [{ doTygodnia: 2, oneRM: 113 }, { doTygodnia: 4, oneRM: 120 }] }];
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((t) => rozwiaz1RM(PRZYSIAD, serie, t)),
    [113, 113, 120, 120, 130, 130, 130]);
  assert.equal(rozwiaz1RM(PRZYSIAD, serie), 130);
});

test("plan: bój i akcesorium trzymane z bloku — zmiana od T3, T1–T2 jak były", () => {
  const plan = (serie: Plan["serieMaksymalne"]): Plan => ({
    nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość", serieMaksymalne: serie,
    sloty: [PRZYSIAD, WIOSLOWANIE].map((id, i) => ({
      positionId: `D1-S0${i + 1}`, dzien: 1, lp: ["A1.", "B1."][i]!, cwiczenieId: id,
      kategoriaSzkieletu: null, tygodnie: {},
    })),
  });
  const ciezary = (p: Plan, poz: number) => przeliczPlan(p).tygodnie.slice(0, 6).map((t) => t.sloty[poz]!.ciezar);
  const stary = plan([{ cwiczenieId: PRZYSIAD, ciezar: 100, powtorzenia: 1 }, { cwiczenieId: WIOSLOWANIE, ciezar: 80, powtorzenia: 1 }]);
  const nowy = plan([
    { cwiczenieId: PRZYSIAD, ciezar: 110, powtorzenia: 1, wczesniej: [{ doTygodnia: 2, oneRM: 100 }] },
    { cwiczenieId: WIOSLOWANIE, ciezar: 88, powtorzenia: 1, wczesniej: [{ doTygodnia: 2, oneRM: 80 }] },
  ]);
  for (const poz of [0, 1]) {
    const przed = ciezary(stary, poz);
    const po = ciezary(nowy, poz);
    assert.deepEqual(po.slice(0, 2), przed.slice(0, 2), `poz. ${poz}: T1–T2`);
    for (let t = 2; t < 6; t++) assert.ok((po[t] as number) > (przed[t] as number), `poz. ${poz} T${t + 1}: ${przed[t]} → ${po[t]}`);
  }
});
