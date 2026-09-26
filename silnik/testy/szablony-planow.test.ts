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

  // Trener zna je z ekranu Base44 jako „Klasyczny – 3 dni", nie jako
  // wewnętrzne „FBW 3 dni – 3 główne ćwiczenia" (26.09.2026).
  test("nazwy i rodziny jak na ekranie Base44, w jego kolejności", () => {
    assert.deepEqual([...new Set(SZABLONY_BASE44.map((s) => s.rodzina))],
      ["Klasyczny", "Rozbudowany", "Hipertroficzny", "Kontynuacje (cz. 2)"]);
    assert.deepEqual(SZABLONY_BASE44.filter((s) => s.rodzina === "Rozbudowany").map((s) => s.nazwa),
      ["Rozbudowany – 1 dzień", "Rozbudowany – 2 dni", "Rozbudowany – 3 dni", "Rozbudowany – 4 dni"]);
    assert.equal(szablon("fbw_6cwiczen_6w").nazwa, "Rozbudowany – 3 dni");
    assert.equal(szablon("fbw_2dni_6w_v2").nazwa, "Klasyczny – 2 dni (cz. 2)");
    for (const s of SZABLONY_BASE44) {
      const dni = Number(s.nazwa.match(/– (\d)/)![1]);
      assert.equal(s.dni.length, dni, `${s.nazwa}: liczba dni w nazwie`);
    }
  });

  test("szablon nie niesie ćwiczeń — tylko układ", () => {
    for (const s of SZABLONY_BASE44) {
      for (const slot of s.dni.flat()) {
        assert.deepEqual(Object.keys(slot).filter((k) => !["lp", "kategoria", "topSet"].includes(k)), [],
          `${s.id} ${slot.lp}`);
      }
    }
  });
});

describe("wstawienie szablonu do planu", () => {
  test("Klasyczny – 3 dni: trzy dni z układem i kategoriami, bez ćwiczeń, TOP SET przy A1", () => {
    const p = zastosujSzablon(pustyPlan(), szablon("fbw_3dni_6w"));
    const d1 = p.sloty.filter((s) => s.dzien === 1);
    assert.deepEqual(d1.slice(0, 7).map((s) => s.lp), ["A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2."]);
    assert.deepEqual(d1.slice(7).map((s) => s.lp), ["", "", "", "", ""], "zapas bez numeru");
    assert.ok(p.sloty.every((s) => s.cwiczenieId === null), "ćwiczenia wybiera trener");
    assert.deepEqual(d1.slice(0, 7).map((s) => s.kategoriaSzkieletu), ["Upper push horizontal",
      "Lower push", "Lower pull", "Upper pull horizontal", "Tricep", "Core", "Upper push vertical"]);
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
