/**
 * Szablony z aplikacji trenera w Base44 — układ dni do wstawienia w konsoli.
 * Prośba trenera z 25.09.2026: „dodaj szkielety z planów z Base44 do
 * wykorzystania w konsoli trenera".
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { SZABLONY_BASE44 } from "../src/dane/szablony.ts";
import { zastosujSzablon } from "../src/szablony-planow.ts";
import { przeliczPlan, type Plan } from "../src/plan.ts";
import { katalog } from "../src/katalog.ts";

const LP = ["A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2.", "E1.", "E2.", "", "", ""];
function pustyPlan(): Plan {
  const sloty = [];
  for (let dzien = 1; dzien <= 5; dzien++) {
    for (let poz = 1; poz <= 12; poz++) {
      sloty.push({ positionId: `D${dzien}-S${String(poz).padStart(2, "0")}`, dzien,
        lp: LP[poz - 1]!, cwiczenieId: null, kategoriaSzkieletu: null, tygodnie: {} });
    }
  }
  return { nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [{ cwiczenieId: "EX-0011", ciezar: 100, powtorzenia: 1 }], sloty,
    topSety: [1, 2, 3, 4, 5].map((dzien) => ({ dzien, wlaczony: false, slotPositionId: `D${dzien}-S01` })),
    deload: true };
}
const szablon = (id: string) => SZABLONY_BASE44.find((s) => s.id === id)!;

describe("dane szablonów", () => {
  test("czternaście szablonów: klasyczne, rozbudowane, hipertroficzne, kontynuacje", () => {
    assert.equal(SZABLONY_BASE44.length, 14);
    assert.deepEqual([...new Set(SZABLONY_BASE44.map((s) => s.czesc))].sort(),
      ["hipertrofia", "intensywność", "objętość"]);
  });

  test("każde ćwiczenie istnieje w BAZIE i pasuje do kategorii swojej pozycji", () => {
    for (const s of SZABLONY_BASE44) {
      for (const slot of s.dni.flat()) {
        if (!slot.cwiczenieId) continue;
        const c = katalog.poId(slot.cwiczenieId);
        assert.ok(c, `${s.id}: ${slot.cwiczenieId}`);
        assert.equal(c!.kategoria, slot.kategoria, `${s.id} ${slot.lp} ${c!.nazwa}`);
      }
    }
  });

  test("trzy nazwy bez odpowiednika zostają puste, z kategorią", () => {
    const bez = new Set(SZABLONY_BASE44.flatMap((s) => s.dni.flat())
      .filter((x) => x.bezOdpowiednika).map((x) => x.bezOdpowiednika));
    assert.deepEqual([...bez].sort(), ["Close-Grip Bench Press", "Machine Shoulder Press", "Plank"]);
  });
});

describe("wstawienie szablonu do planu", () => {
  test("FBW 3 dni: trzy dni z układem, ćwiczenia z planu trenera, TOP SET przy A1", () => {
    const p = zastosujSzablon(pustyPlan(), szablon("fbw_3dni_6w"));
    const d1 = p.sloty.filter((s) => s.dzien === 1);
    assert.deepEqual(d1.slice(0, 7).map((s) => s.lp), ["A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2."]);
    assert.deepEqual(d1.slice(7).map((s) => s.lp), ["", "", "", "", ""], "zapas bez numeru");
    assert.equal(d1[0]!.cwiczenieId, "EX-0011");
    assert.equal(d1[4]!.cwiczenieId, null, "Close-Grip Bench Press — do wyboru trenera");
    assert.equal(d1[4]!.kategoriaSzkieletu, "Tricep");
    assert.deepEqual(p.topSety!.slice(0, 3).map((t) => [t.wlaczony, t.slotPositionId]),
      [[true, "D1-S01"], [true, "D2-S01"], [true, "D3-S01"]]);
    assert.ok(p.sloty.filter((s) => s.dzien >= 4).every((s) => !s.cwiczenieId));
    assert.equal(p.czescPlanu, "objętość");
  });

  test("klient zostaje: serie maksymalne i deload nie znikają", () => {
    const p = zastosujSzablon(pustyPlan(), szablon("fbw_3dni_6w"));
    assert.equal(p.serieMaksymalne.length, 1);
    assert.equal(p.deload, true);
  });

  test("hipertroficzny: część „hipertrofia”, A1/A2 i bez TOP SETU", () => {
    const p = zastosujSzablon(pustyPlan(), szablon("hyper_1dzien_6w"));
    assert.equal(p.czescPlanu, "hipertrofia");
    assert.deepEqual(p.sloty.slice(0, 3).map((s) => s.lp), ["A1.", "A2.", "B1."]);
    assert.ok(p.topSety!.every((t) => !t.wlaczony));
  });

  test("kontynuacja „(część 2)” zaczyna od intensywności", () => {
    assert.equal(zastosujSzablon(pustyPlan(), szablon("fbw_3dni_6w_v2")).czescPlanu, "intensywność");
  });

  test("plan z szablonu da się od razu policzyć", () => {
    for (const s of SZABLONY_BASE44) {
      const w = przeliczPlan(zastosujSzablon(pustyPlan(), s));
      assert.equal(w.tygodnie.length, 6, s.id);
    }
  });
});
