/**
 * Bój główny z decyzji trenera — przycisk „G" przy ćwiczeniu.
 *
 * Trener, 26.09.2026: front squat stał u Marka X na B1 i liczył się jak
 * akcesorium — „chciałbym, żeby liczył się jak ćwiczenie główne". Reguła
 * (pozycja A + ćwiczenie złożone) zostaje, ale trener może ją przestawić
 * przy slocie w obie strony.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { przeliczPlan, type Plan } from "../src/plan.ts";
import { zastosujProgresje, skopiujTydzien } from "../src/progresja.ts";
import { sprawdzPlan } from "../src/walidacja.ts";

const PRZYSIAD = "EX-0010";
const FRONT = "EX-0089";   // Front squat, coeff 1,0
const SLDL = "EX-0183";    // SLDL balance, coeff 0,25

function plan(zmiana: (p: Plan) => void = () => {}): Plan {
  const LP = ["A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2.", "E1.", "E2.", "", "", ""];
  const p: Plan = {
    nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [
      { cwiczenieId: PRZYSIAD, ciezar: 120, powtorzenia: 1 },
      { cwiczenieId: FRONT, ciezar: 100, powtorzenia: 1 },
    ],
    sloty: LP.map((lp, i) => ({
      positionId: `D1-S${String(i + 1).padStart(2, "0")}`, dzien: 1, lp,
      cwiczenieId: [PRZYSIAD, FRONT][i] ?? null, kategoriaSzkieletu: null,
      tygodnie: {} as Plan["sloty"][number]["tygodnie"],
    })),
  };
  zmiana(p);
  return p;
}
const b1 = (p: Plan, t: number) => przeliczPlan(p).tygodnie[t - 1]!.sloty[1]!;

describe("front squat na B1", () => {
  test("bez decyzji trenera — akcesorium, jak dotąd", () => {
    assert.deepEqual([b1(plan(), 1).serie, b1(plan(), 1).rpe], [3, 8]);
  });

  test("z „G” — progresja boju: 6 × 6 @ 6,5, potem 5 × 6 @ 7", () => {
    const p = plan((x) => { (x.sloty[1] as { bojGlowny?: boolean }).bojGlowny = true; });
    assert.deepEqual([1, 2].map((t) => [b1(p, t).serie, b1(p, t).powtorzenia, b1(p, t).rpe]),
      [[6, 6, 6.5], [5, 6, 7]]);
  });

  test("bój liczy ciężar z RPE co tydzień, nie trzyma go z bloku", () => {
    const p = plan((x) => { (x.sloty[1] as { bojGlowny?: boolean }).bojGlowny = true; });
    assert.notEqual(b1(p, 2).ciezar, b1(p, 1).ciezar);
  });

  test("„progresja 5.18” też słucha decyzji trenera", () => {
    const p = zastosujProgresje(plan((x) => { (x.sloty[1] as { bojGlowny?: boolean }).bojGlowny = true; }));
    assert.deepEqual([p.sloty[1]!.tygodnie![1]!.serie, p.sloty[1]!.tygodnie![1]!.powtorzenia], [6, 6]);
  });
});

describe("w drugą stronę i kontrola planu", () => {
  test("przysiad z A1 z „G” wyłączonym to akcesorium", () => {
    const p = plan((x) => { (x.sloty[0] as { bojGlowny?: boolean }).bojGlowny = false; });
    assert.equal(przeliczPlan(p).tygodnie[0]!.sloty[0]!.serie, 3);
  });

  test("akcesorium świadomie na A1 nie dostaje ostrzeżenia", () => {
    const zOstrzezeniem = plan((x) => { x.sloty[0]!.cwiczenieId = SLDL; });
    const kod = (p: Plan) => sprawdzPlan(p, przeliczPlan(p)).some((u) => u.kod === "POZYCJA_A_BEZ_BOJU");
    assert.equal(kod(zOstrzezeniem), true);
    (zOstrzezeniem.sloty[0] as { bojGlowny?: boolean }).bojGlowny = false;
    assert.equal(kod(zOstrzezeniem), false);
  });
});

describe("progresja i kopiowanie nie gubią wyboru klienta", () => {
  test("ciężar wybrany przez klienta zostaje, a kopia go nie rozmnaża", () => {
    const p = plan((x) => {
      x.sloty[1]!.tygodnie = { 1: { serie: 4, ciezarKlienta: { kg: 60, cwiczenieId: FRONT } },
        3: { ciezarKlienta: { kg: 62.5, cwiczenieId: FRONT } } };
    });
    const poProgresji = zastosujProgresje(p).sloty[1]!.tygodnie!;
    assert.deepEqual([poProgresji[1]!.ciezarKlienta?.kg, poProgresji[3]!.ciezarKlienta?.kg], [60, 62.5]);
    const poKopii = skopiujTydzien(p, 1, "D1-S02").sloty[1]!.tygodnie!;
    assert.equal(poKopii[2]!.serie, 4);
    assert.equal(poKopii[2]!.ciezarKlienta, undefined, "wybór z T1 nie jest wyborem z T2");
    assert.equal(poKopii[3]!.ciezarKlienta?.kg, 62.5);
  });
});
