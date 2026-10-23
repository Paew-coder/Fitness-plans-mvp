/**
 * Dwubój olimpijski — rwanie i zarzut — progresja w % 1RM (16.10.2026).
 *
 * Trener o propozycji periodyzacji clean / snatch: „to, co zaproponowałeś,
 * mi się podoba i może tak być … skok 1 kg, wdrażaj całość”. Blok
 * objętościowy (cz. 1) i intensyfikujący (cz. 2), deload 4 × 2 na 70 %,
 * TOP SET 88 / 91 / 93 % w intensyfikacji od T4.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { katalog } from "../src/katalog.ts";
import { domyslneCwiczeniaMaksow, przeliczPlan, tydzienWyliczony, type Plan } from "../src/plan.ts";
import { zastosujProgresje } from "../src/progresja.ts";
import { DWUBOJ, PROGRESJA_DWUBOJU } from "../src/szablon-boju.ts";
import { rpeDlaProcentu } from "../src/rpe.ts";
import type { CzescPlanu } from "../src/typy.ts";

const CLEAN = "EX-0046";     // Clean, BAZA trenera
const SNATCH = "EX-2630";    // Snatch, Theory of Motion
const PRZYSIAD = "EX-0010";
const LP = ["A1.", "B1.", "C1."];

function plan(cwiczenia: (string | null)[], zmiany: Partial<Plan> = {}, slot: object = {}): Plan {
  return {
    nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [
      { cwiczenieId: CLEAN, ciezar: 100, powtorzenia: 1 },
      { cwiczenieId: SNATCH, ciezar: 80, powtorzenia: 1 },
      { cwiczenieId: PRZYSIAD, ciezar: 120, powtorzenia: 1 },
    ],
    sloty: cwiczenia.map((id, i) => ({
      positionId: `D1-S0${i + 1}`, dzien: 1, lp: LP[i]!, cwiczenieId: id,
      kategoriaSzkieletu: null, tygodnie: {}, ...(i === 0 ? slot : {}),
    })),
    ...zmiany,
  };
}
const slot = (p: Plan, t: number, poz = 0) => tydzienWyliczony(przeliczPlan(p), t)!.sloty[poz]!;
const tygodnie = (p: Plan, poz = 0) => [1, 2, 3, 4, 5, 6].map((t) => {
  const s = slot(p, t, poz);
  return `${s.serie}×${s.powtorzenia} ${s.ciezar}`;
}).join(" | ");

describe("lista ćwiczeń dwuboju", () => {
  test("każde istnieje, to rwanie albo zarzut ze sztangą, skok 1 kg", () => {
    assert.equal(DWUBOJ.size, 34, "33 z 16.10.2026 + S/l clean (17.10.2026)");
    for (const id of DWUBOJ) {
      const c = katalog.poId(id);
      assert.ok(c, id);
      assert.match(c.nazwa, /clean|snatch/i, c.nazwa);
      assert.doesNotMatch(c.nazwa, /pull|deadlift|muscle|tall|no jump|riser|segment|DB|KB|power position/i, c.nazwa);
      assert.equal(c.skokKg, 1, c.nazwa);
      assert.equal(c.progresja, "kg", c.nazwa);
    }
  });

  test("ciągi i ćwiczenia techniczne zostają poza listą", () => {
    for (const nazwa of ["Clean Pull", "Snatch Pull", "Muscle Snatch", "Snatch Balance", "Clean Deadlift"]) {
      const c = katalog.poNazwie(nazwa);
      assert.ok(c, nazwa);
      assert.ok(!DWUBOJ.has(c.id), nazwa);
    }
  });
});

describe("progresja w % 1RM", () => {
  test("blok objętościowy: Clean 1RM 100 → 70 · 72 · 75 · 75 · 78 · 80 kg", () => {
    assert.equal(tygodnie(plan([CLEAN])),
      "6×3 70 | 6×3 72 | 5×3 75 | 6×2 75 | 6×2 78 | 5×2 80");
  });

  test("blok intensyfikujący: dwójki 80–85 %, od T4 pojedyncze 85–90 %", () => {
    assert.equal(tygodnie(plan([CLEAN], { czescPlanu: "intensywność" })),
      "6×2 80 | 6×2 82 | 5×2 85 | 8×1 85 | 7×1 88 | 5×1 90");
  });

  test("każde ćwiczenie od własnego 1RM — Snatch 80 kg, skok 1 kg", () => {
    assert.equal(tygodnie(plan([PRZYSIAD, SNATCH]), 1),
      "6×3 56 | 6×3 58 | 5×3 60 | 6×2 60 | 6×2 62 | 5×2 64");
  });

  test("S/l clean (17.10.2026) — jak zwykły Clean, od własnego 1RM, na stronę", () => {
    // Trener: „moje ćwiczenie s/l clean — zrób, żeby progresja w nim
    // przebiegała podobnie jak w zwykłym clean”.
    const SL_CLEAN = "EX-3627";
    const p = plan([PRZYSIAD, SL_CLEAN], {
      serieMaksymalne: [{ cwiczenieId: PRZYSIAD, ciezar: 120, powtorzenia: 1 }, { cwiczenieId: SL_CLEAN, ciezar: 50, powtorzenia: 1 }],
    });
    assert.equal(tygodnie(p, 1), "6×3 35 | 6×3 36 | 5×3 38 | 6×2 38 | 6×2 39 | 5×2 40");
    const s = slot(p, 1, 1);
    assert.deepEqual([s.dwuboj, s.cwiczenie?.jednostronne], [true, true]);
  });

  test("na każdej pozycji, nie tylko A — Snatch na B1 też", () => {
    assert.equal(slot(plan([PRZYSIAD, SNATCH]), 1, 1).dwuboj, true);
  });

  test("procent w wyniku, RPE tylko jako odpowiednik dla stresu", () => {
    const s = slot(plan([CLEAN]), 1);
    assert.equal(s.procent1RM, 70);
    assert.equal(s.rpe, rpeDlaProcentu(3, 70));
    assert.equal(s.rpe, 6, "70 % przy trójkach jest poniżej tabeli — jej początek");
    assert.ok(s.stres.calkowity > 0);
  });

  test("procent wpisany przez trenera wygrywa, wpisane RPE nic nie zmienia", () => {
    const p = plan([CLEAN], {}, { tygodnie: { 1: { procent: 65, rpe: 9 }, 2: { serie: 4 } } });
    assert.equal(slot(p, 1).ciezar, 65);
    assert.deepEqual([slot(p, 2).serie, slot(p, 2).ciezar], [4, 72]);
  });

  test("ocena klienta koryguje kolejne tygodnie, jak przy każdym boju", () => {
    const p = plan([CLEAN], {}, { tygodnie: { 1: { feedback: "za łatwe" } } });
    assert.ok((slot(p, 2).ciezar as number) > 72, String(slot(p, 2).ciezar));
  });

  test("bez 1RM — „brak 1RM”, nie zgadujemy", () => {
    const p = plan([CLEAN], { serieMaksymalne: [] });
    assert.equal(slot(p, 1).ciezar, "— brak 1RM");
  });

  test("„G” robi z ćwiczenia zwykły bój — progresja RPE", () => {
    const p = plan([CLEAN], {}, { bojGlowny: true });
    const s = slot(p, 1);
    assert.equal(s.dwuboj, undefined);
    assert.deepEqual([s.serie, s.powtorzenia, s.rpe], [6, 6, 6.5]);
  });

  test("hipertrofia bierze tabelę objętościową; „S” w cz. 2 — intensyfikującą", () => {
    for (const czesc of ["hipertrofia", "hipertrofia 2"] as CzescPlanu[]) {
      assert.equal(slot(plan([CLEAN], { czescPlanu: czesc }), 1).ciezar, 70, czesc);
    }
    assert.equal(slot(plan([CLEAN], { czescPlanu: "hipertrofia 2" }, { bojSilowy: true }), 1).ciezar, 80);
  });
});

describe("deload, TOP SET, tydzień maksów", () => {
  test("deload 4 × 2 na 70 % w obu blokach", () => {
    for (const czesc of ["objętość", "intensywność"] as CzescPlanu[]) {
      const s = slot(plan([CLEAN], { czescPlanu: czesc, deload: true }), 7);
      assert.deepEqual([s.serie, s.powtorzenia, s.ciezar], [4, 2, 70], czesc);
    }
  });

  test("TOP SET tylko w intensyfikacji od T4: 88 · 91 · 93 % 1RM", () => {
    const topSety = [{ dzien: 1, wlaczony: true, slotPositionId: "D1-S01" }];
    const wynik = przeliczPlan(plan([CLEAN], { czescPlanu: "intensywność", topSety }));
    assert.deepEqual(wynik.tygodnie.map((t) => t.topSety[0]!.ciezar), ["", "", "", 88, 91, 93]);
    assert.deepEqual(wynik.tygodnie.map((t) => t.topSety[0]!.procent ?? null), [null, null, null, 88, 91, 93]);
    const objetosc = przeliczPlan(plan([CLEAN], { topSety }));
    assert.ok(objetosc.tygodnie.every((t) => t.topSety[0]!.rpe === null), "w objętości TOP SETU nie ma");
  });

  test("TOP SET: procent wpisany przez trenera na tydzień", () => {
    const topSety = [{ dzien: 1, wlaczony: true, slotPositionId: "D1-S01", procentTygodni: { 2: 85 } }];
    const t2 = przeliczPlan(plan([CLEAN], { czescPlanu: "intensywność", topSety })).tygodnie[1]!.topSety[0]!;
    assert.deepEqual([t2.procent, t2.ciezar], [85, 85]);
  });

  test("tydzień maksów domyślnie bierze też dwubój", () => {
    const t6 = przeliczPlan(plan([PRZYSIAD, CLEAN])).tygodnie[5]!;
    assert.deepEqual(domyslneCwiczeniaMaksow(t6), [PRZYSIAD, CLEAN]);
  });
});

describe("„progresja 5.18” i zmiana części planu", () => {
  test("wpisuje serie, powtórzenia i procent — bez RPE", () => {
    const p = zastosujProgresje(plan([CLEAN]));
    assert.deepEqual(p.sloty[0]!.tygodnie![1], { serie: 6, powtorzenia: 3, procent: 70 });
  });

  test("po zmianie części przepisuje dwubój jak bój", () => {
    const p = zastosujProgresje({ ...zastosujProgresje(plan([PRZYSIAD, CLEAN])), czescPlanu: "intensywność" },
      undefined, { tylkoBoje: true });
    assert.equal(p.sloty[1]!.tygodnie![4]!.procent, PROGRESJA_DWUBOJU["intensywność"][3]!.procent);
  });
});
