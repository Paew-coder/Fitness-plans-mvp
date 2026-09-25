/**
 * Tygodnie po cyklu: deload (T7) i maksy (T8).
 *
 * Z periodyzacji trenera: po bloku tydzień lżejszy — te same ćwiczenia, serie
 * i powtórzenia mniej więcej jak w ostatnim tygodniu, RPE około 7, bez TOP
 * SETU (przysiad 102,5 kg 4×4 @9 → 97,5 kg 5×4 @7). Na koniec max out:
 * 1 × 1 @ RPE 10 w przysiadzie, wyciskaniu i martwym ciągu. Decyzje trenera
 * z 25.09.2026: deload „jak T6, RPE o 2 niżej, bez TOP SETU", maksy
 * wszystkie jednego dnia, kolejność jak w periodyzacji (najpierw deload).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  przeliczPlan, tydzienWyliczony, tygodniePlanu, numerTygodniaNaEkranie, rpeDeloadu,
  TYDZIEN_DELOADU, TYDZIEN_MAKSOW, type Plan,
} from "../src/plan.ts";

const PRZYSIAD = "EX-0010";
const WIOSLO = "EX-0016";
const WYCISKANIE = "EX-0011";
const UGINANIE = "EX-0012";
const MARTWY = "EX-0053";

function plan(zmiany: Partial<Plan> = {}): Plan {
  const LP = ["A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2.", "E1.", "E2.", "", "", ""];
  const wDniu: Record<number, string[]> = {
    1: [PRZYSIAD, WIOSLO],
    2: [WYCISKANIE, UGINANIE],
    3: [MARTWY, PRZYSIAD],   // przysiad drugi raz — maksuje się raz
  };
  const sloty = [];
  for (let dzien = 1; dzien <= 5; dzien++) {
    for (let poz = 1; poz <= 12; poz++) {
      sloty.push({
        positionId: `D${dzien}-S${String(poz).padStart(2, "0")}`,
        dzien, lp: LP[poz - 1] ?? "",
        cwiczenieId: wDniu[dzien]?.[poz - 1] ?? null,
        kategoriaSzkieletu: null,
        tygodnie: {} as Plan["sloty"][number]["tygodnie"],
      });
    }
  }
  return {
    nazwa: "po cyklu", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [
      { cwiczenieId: PRZYSIAD, ciezar: 120, powtorzenia: 1 },
      { cwiczenieId: WIOSLO, ciezar: 80, powtorzenia: 5 },
      { cwiczenieId: WYCISKANIE, ciezar: 100, powtorzenia: 1 },
    ],
    sloty,
    topSety: [{ dzien: 1, wlaczony: true, slotPositionId: "D1-S01" }],
    ...zmiany,
  };
}

const slot = (w: ReturnType<typeof przeliczPlan>, tydzien: number, positionId: string) =>
  tydzienWyliczony(w, tydzien)!.sloty.find((s) => s.positionId === positionId)!;

describe("bez przełączników nic się nie zmienia", () => {
  test("sześć tygodni, zero dodatkowych", () => {
    const w = przeliczPlan(plan());
    assert.equal(w.tygodnie.length, 6);
    assert.deepEqual(w.tygodnieDodatkowe, []);
    assert.deepEqual(tygodniePlanu(plan()), [1, 2, 3, 4, 5, 6]);
  });
});

describe("deload — T7", () => {
  const w = przeliczPlan(plan({ deload: true }));

  test("jest siódmym tygodniem i ma rodzaj", () => {
    assert.equal(w.tygodnieDodatkowe.length, 1);
    assert.equal(w.tygodnieDodatkowe[0]!.tydzien, TYDZIEN_DELOADU);
    assert.equal(w.tygodnieDodatkowe[0]!.rodzaj, "deload");
    assert.deepEqual(tygodniePlanu({ deload: true }), [1, 2, 3, 4, 5, 6, 7]);
  });

  test("serie i powtórzenia jak w T6, RPE o 2 niżej", () => {
    for (const positionId of ["D1-S01", "D1-S02", "D2-S01", "D2-S02"]) {
      const t6 = slot(w, 6, positionId);
      const t7 = slot(w, 7, positionId);
      assert.equal(t7.serie, t6.serie, positionId);
      assert.equal(t7.powtorzenia, t6.powtorzenia, positionId);
      assert.equal(t7.rpe, Math.max(6, t6.rpe - 2), positionId);
    }
  });

  test("ciężar lżejszy niż w T6 — liczony z tabeli, bez wymyślania", () => {
    const t6 = slot(w, 6, "D1-S01");
    const t7 = slot(w, 7, "D1-S01");
    assert.equal(typeof t7.ciezar, "number");
    assert.ok((t7.ciezar as number) < (t6.ciezar as number), `${t6.ciezar} → ${t7.ciezar}`);
  });

  test("bez TOP SETU, a stres nie jest oceniany normą", () => {
    const t7 = tydzienWyliczony(w, 7)!;
    assert.deepEqual(t7.topSety, []);
    assert.equal(t7.ocenaStresu, "—");
    assert.ok(t7.bilans.razem < tydzienWyliczony(w, 6)!.bilans.razem);
  });

  test("RPE nie schodzi poniżej tabeli", () => {
    assert.equal(rpeDeloadu(9), 7);
    assert.equal(rpeDeloadu(7), 6);
    assert.equal(rpeDeloadu(6.5), 6);
  });

  test("trener może poprawić deload ręcznie, jak każdy tydzień", () => {
    const p = plan({ deload: true });
    p.sloty[0]!.tygodnie = { 7: { serie: 3, rpe: 6.5, ciezarOverride: 90 } };
    const t7 = slot(przeliczPlan(p), 7, "D1-S01");
    assert.equal(t7.serie, 3);
    assert.equal(t7.rpe, 6.5);
    assert.equal(t7.ciezar, 90);
  });

  test("podmiana ćwiczenia z T4–T6 trwa w deloadzie", () => {
    const p = plan({ deload: true });
    p.sloty[1]!.tygodnie = {
      4: { cwiczenieIdOverride: UGINANIE, oneRMReczny: 40 },
      5: { cwiczenieIdOverride: UGINANIE, oneRMReczny: 40 },
      6: { cwiczenieIdOverride: UGINANIE, oneRMReczny: 40 },
    };
    const t7 = slot(przeliczPlan(p), 7, "D1-S02");
    assert.equal(t7.cwiczenie?.id, UGINANIE);
    assert.equal(typeof t7.ciezar, "number", String(t7.ciezar));
  });

  test("średnie i normy cyklu liczą się dalej z sześciu tygodni pracy", () => {
    assert.deepEqual(w.ocenaObjetosci, przeliczPlan(plan()).ocenaObjetosci);
  });
});

describe("maksy — T8", () => {
  const w = przeliczPlan(plan({ deload: true, tydzienMaksow: true }));
  const t8 = tydzienWyliczony(w, 8)!;

  test("po deloadzie, jako tydzień ósmy", () => {
    assert.deepEqual(w.tygodnieDodatkowe.map((t) => t.rodzaj), ["deload", "maksy"]);
    assert.equal(t8.tydzien, TYDZIEN_MAKSOW);
    assert.equal(numerTygodniaNaEkranie({ deload: true, tydzienMaksow: true }, 8), 8);
  });

  test("bez deloadu maksy są na ekranie tygodniem siódmym, a klucz zostaje 8", () => {
    const bez = przeliczPlan(plan({ tydzienMaksow: true }));
    assert.equal(bez.tygodnieDodatkowe[0]!.tydzien, 8);
    assert.equal(numerTygodniaNaEkranie({ tydzienMaksow: true }, 8), 7);
    assert.deepEqual(tygodniePlanu({ tydzienMaksow: true }), [1, 2, 3, 4, 5, 6, 8]);
  });

  test("domyślnie przysiad, wyciskanie i martwy — po razie, bez akcesoriów", () => {
    assert.deepEqual(t8.sloty.map((s) => s.cwiczenie!.id), [PRZYSIAD, WYCISKANIE, MARTWY]);
  });

  test("wszystkie jednego dnia, każdy w osobnej grupie", () => {
    assert.deepEqual(t8.sloty.map((s) => s.dzien), [1, 1, 1]);
    assert.deepEqual(t8.sloty.map((s) => s.lp), ["A1.", "B1.", "C1."]);
    assert.equal(t8.dni.length, 1);
  });

  test("1 × 1 @ RPE 10, ciężar to obecne 1RM", () => {
    const przysiad = t8.sloty[0]!;
    assert.equal(przysiad.serie, 1);
    assert.equal(przysiad.powtorzenia, 1);
    assert.equal(przysiad.rpe, 10);
    assert.equal(przysiad.ciezar, 120);
    assert.equal(przysiad.positionId, "D1-S01", "wpis ląduje przy tym samym ćwiczeniu co historia");
  });

  test("bez 1RM klient dostaje „brak 1RM”, a nie zero", () => {
    assert.equal(t8.sloty[2]!.ciezar, "— brak 1RM");
  });

  test("trener wybiera boje sam — kolejność jak na liście", () => {
    const wybrane = przeliczPlan(plan({ tydzienMaksow: true, cwiczeniaMaksow: [WYCISKANIE, WIOSLO] }));
    assert.deepEqual(tydzienWyliczony(wybrane, 8)!.sloty.map((s) => s.cwiczenie!.id),
      [WYCISKANIE, WIOSLO]);
  });

  test("ćwiczenie, którego nie ma już w planie, po cichu wypada", () => {
    const wybrane = przeliczPlan(plan({ tydzienMaksow: true, cwiczeniaMaksow: ["EX-0013", PRZYSIAD] }));
    assert.deepEqual(tydzienWyliczony(wybrane, 8)!.sloty.map((s) => s.cwiczenie!.id), [PRZYSIAD]);
  });
});
