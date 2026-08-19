/**
 * Progresja z szablonu 5.18.
 *
 * Liczby w `progresja.ts` nie są niczyim pomysłem — zostały odczytane
 * z arkusza. Te testy pilnują, żeby nikt ich po drodze nie „poprawił",
 * i żeby wypełnianie planu nie kasowało tego, co należy do klienta.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import type { Plan } from "../src/plan.ts";
import { przeliczPlan } from "../src/plan.ts";
import {
  PROGRESJA_BOJU, RPE_AKCESORIUM, SERIE_AKCESORIUM,
  progresjaSlotu, skopiujTydzien, zastosujProgresje,
} from "../src/progresja.ts";

function planTestowy(): Plan {
  const LP = ["A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2.", "E1.", "E2.", "", "", ""];
  const sloty = [];
  for (let dzien = 1; dzien <= 5; dzien++) {
    for (let poz = 1; poz <= 12; poz++) {
      sloty.push({
        positionId: `D${dzien}-S${String(poz).padStart(2, "0")}`,
        dzien, lp: LP[poz - 1] ?? "",
        cwiczenieId: dzien === 1 && poz <= 7
          ? ["EX-0010", "EX-0016", "EX-0003", "EX-0011", "EX-0012", "EX-0042", "EX-0029"][poz - 1]!
          : null,
        kategoriaSzkieletu: null,
        tygodnie: {} as Plan["sloty"][number]["tygodnie"],
      });
    }
  }
  return {
    nazwa: "test", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [{ cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 1 }],
    sloty,
    topSety: [1, 2, 3, 4, 5].map((dzien) => ({
      dzien, wlaczony: true, rpe: 7, slotPositionId: `D${dzien}-S01`,
    })),
  };
}

const slot = (plan: Plan, positionId: string) => plan.sloty.find((s) => s.positionId === positionId)!;

describe("progresja — liczby zgodne z szablonem 5.18", () => {
  test("bój główny idzie blokiem: objętość w dół, intensywność w górę", () => {
    assert.deepEqual(PROGRESJA_BOJU, [
      { serie: 6, powtorzenia: 6, rpe: 6.5 },
      { serie: 5, powtorzenia: 6, rpe: 7 },
      { serie: 5, powtorzenia: 5, rpe: 7 },
      { serie: 4, powtorzenia: 5, rpe: 7.5 },
      { serie: 5, powtorzenia: 4, rpe: 7.5 },
      { serie: 6, powtorzenia: 3, rpe: 7.5 },
    ]);
  });

  test("akcesorium: trzy serie, RPE 8 w pierwszym bloku i 9 w drugim", () => {
    assert.deepEqual(progresjaSlotu("B1.", 1), { serie: SERIE_AKCESORIUM, rpe: RPE_AKCESORIUM.blokI });
    assert.deepEqual(progresjaSlotu("B1.", 3), { serie: 3, rpe: 8 });
    assert.deepEqual(progresjaSlotu("B1.", 4), { serie: 3, rpe: 9 }, "T4 otwiera drugi blok");
    assert.deepEqual(progresjaSlotu("B1.", 6), { serie: 3, rpe: 9 });
  });

  test("C2 i D2 chodzą o stopień wyżej, B2 nie — tak jest w arkuszu", () => {
    assert.equal(progresjaSlotu("C2.", 1).rpe, 9);
    assert.equal(progresjaSlotu("D2.", 4).rpe, 10);
    assert.equal(progresjaSlotu("B2.", 1).rpe, 8, "B2 zostaje na ósemce");
  });

  test("akcesorium nie dostaje powtórzeń — liczy je automat", () => {
    assert.equal(progresjaSlotu("C1.", 2).powtorzenia, undefined);
    assert.equal(progresjaSlotu("A1.", 2).powtorzenia, 6);
  });
});

describe("progresja — wypełnianie planu", () => {
  test("wypełnia wszystkie sześć tygodni, tylko tam, gdzie stoi ćwiczenie", () => {
    const plan = zastosujProgresje(planTestowy());
    const boj = slot(plan, "D1-S01");
    assert.deepEqual(boj.tygodnie![1], { serie: 6, powtorzenia: 6, rpe: 6.5 });
    assert.deepEqual(boj.tygodnie![6], { serie: 6, powtorzenia: 3, rpe: 7.5 });
    assert.deepEqual(slot(plan, "D1-S02").tygodnie![4], { serie: 3, rpe: 9 });
    assert.deepEqual(slot(plan, "D1-S08").tygodnie, {}, "pusty slot zostaje pusty");
  });

  test("odczucia klienta i nadpisany ciężar zostają nietknięte", () => {
    const wejscie = planTestowy();
    wejscie.sloty[0]!.tygodnie = {
      1: { serie: 99, rpe: 5, feedback: "za trudne" },
      2: { ciezarOverride: 123 },
    };
    const plan = zastosujProgresje(wejscie);
    const boj = slot(plan, "D1-S01");

    assert.equal(boj.tygodnie![1]!.feedback, "za trudne", "odczucie należy do wykonanego treningu");
    assert.equal(boj.tygodnie![1]!.serie, 6, "ale szkielet planu wypełnia się na nowo");
    assert.equal(boj.tygodnie![2]!.ciezarOverride, 123, "ręczny ciężar zostaje");
  });

  test("oryginalny plan zostaje nietknięty", () => {
    const wejscie = planTestowy();
    zastosujProgresje(wejscie);
    assert.deepEqual(wejscie.sloty[0]!.tygodnie, {});
  });

  test("plan po wypełnieniu liczy się normalnie", () => {
    const wynik = przeliczPlan(zastosujProgresje(planTestowy()));
    const t1 = wynik.tygodnie[0]!.sloty.find((s) => s.positionId === "D1-S01")!;
    assert.equal(t1.serie, 6);
    assert.equal(t1.rpe, 6.5);
    assert.ok(typeof t1.ciezar === "number" && t1.ciezar > 0, `ciężar: ${t1.ciezar}`);
    // Szósty tydzień: mniej powtórzeń przy wyższym RPE musi dać większy ciężar.
    const t6 = wynik.tygodnie[5]!.sloty.find((s) => s.positionId === "D1-S01")!;
    assert.ok((t6.ciezar as number) > (t1.ciezar as number), `${t1.ciezar} → ${t6.ciezar}`);
  });
});

describe("progresja — kopiowanie tygodnia", () => {
  test("rozprowadza parametry źródłowego tygodnia na pozostałe", () => {
    const wejscie = planTestowy();
    wejscie.sloty[1]!.tygodnie = { 1: { serie: 4, powtorzenia: 12, rpe: 7 } };
    const plan = skopiujTydzien(wejscie, 1);

    for (const t of [2, 3, 4, 5, 6] as const) {
      assert.deepEqual(slot(plan, "D1-S02").tygodnie![t], { serie: 4, powtorzenia: 12, rpe: 7 },
        `tydzień ${t}`);
    }
  });

  test("nie kopiuje odczuć ani nadpisanego ciężaru", () => {
    const wejscie = planTestowy();
    wejscie.sloty[1]!.tygodnie = {
      1: { serie: 4, rpe: 7, feedback: "za łatwe", ciezarOverride: 50 },
      3: { feedback: "za trudne" },
    };
    const plan = skopiujTydzien(wejscie, 1);
    const s = slot(plan, "D1-S02");

    assert.equal(s.tygodnie![2]!.feedback, undefined, "odczucie z T1 nie jedzie do T2");
    assert.equal(s.tygodnie![2]!.ciezarOverride, undefined);
    assert.equal(s.tygodnie![3]!.feedback, "za trudne", "cudze odczucie zostaje na miejscu");
    assert.equal(s.tygodnie![3]!.serie, 4, "a szkielet i tak się nadpisuje");
    assert.equal(s.tygodnie![1]!.feedback, "za łatwe", "źródłowy tydzień bez zmian");
  });
});
