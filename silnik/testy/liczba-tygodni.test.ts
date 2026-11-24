/**
 * Liczba tygodni planu — od 4 do 12 (22.11.2026).
 *
 * Trener: „dodaj mi możliwość zmiany ilości tygodni w planie — zarówno nowe
 * plany, jak i edytowanie aktualnych”. Decyzje: progresja w blokach po 3
 * tygodnie — krótszy cykl ucina, dłuższy dokłada bloki jak blok II (T4–T6)
 * z RPE o 0,5 wyżej w każdym kolejnym bloku (T7–T9 +0,5, T10–T12 +1,0).
 * Deload i maksy idą po ostatnim tygodniu roboczym. Klucze T7–T12 to 9–14
 * (7 i 8 zostały przy deloadzie i maksach) — `src/tygodnie.ts`.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  przeliczPlan, tydzienWyliczony, tygodniePlanu, numerTygodniaNaEkranie, TYDZIEN_DELOADU, TYDZIEN_MAKSOW,
  type Plan,
} from "../src/plan.ts";
import {
  bazaBloku, kluczTygodnia, kluczZNumeru, liczbaTygodni, numerRoboczy, szablonTygodnia, tygodnieRobocze,
  wczesniejszeRobocze,
} from "../src/tygodnie.ts";
import { zastosujProgresje } from "../src/progresja.ts";

const PRZYSIAD = "EX-0010";
const WIOSLO = "EX-0016";
const WYCISKANIE = "EX-0011";

function plan(zmiany: Partial<Plan> = {}): Plan {
  return {
    nazwa: "długość", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [
      { cwiczenieId: PRZYSIAD, ciezar: 120, powtorzenia: 1 },
      { cwiczenieId: WIOSLO, ciezar: 80, powtorzenia: 5 },
      { cwiczenieId: WYCISKANIE, ciezar: 100, powtorzenia: 1 },
    ],
    sloty: [
      { positionId: "D1-S01", dzien: 1, lp: "A1.", cwiczenieId: PRZYSIAD },
      { positionId: "D1-S02", dzien: 1, lp: "B1.", cwiczenieId: WIOSLO },
      { positionId: "D2-S01", dzien: 2, lp: "A1.", cwiczenieId: WYCISKANIE },
    ],
    topSety: [{ dzien: 1, wlaczony: true, slotPositionId: "D1-S01" }],
    ...zmiany,
  } as Plan;
}

const slot = (w: ReturnType<typeof przeliczPlan>, tydzien: number, positionId: string) =>
  tydzienWyliczony(w, tydzien)!.sloty.find((s) => s.positionId === positionId)!;
const topSet = (w: ReturnType<typeof przeliczPlan>, tydzien: number) =>
  tydzienWyliczony(w, tydzien)!.topSety[0]!;
const bezCwiczenia = (s: ReturnType<typeof slot>) => ({ ...s, cwiczenie: s.cwiczenie?.id });

describe("klucze i numery tygodni", () => {
  test("T1–T6 to 1–6, T7–T12 to 9–14; deload i maksy zostają przy 7 i 8", () => {
    assert.deepEqual(Array.from({ length: 12 }, (_, i) => kluczTygodnia(i + 1)), [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14]);
    assert.deepEqual([1, 6, 7, 8, 9, 14, 15].map(numerRoboczy), [1, 6, null, null, 7, 12, null]);
    assert.deepEqual(tygodnieRobocze({ tygodni: 4 }), [1, 2, 3, 4]);
    assert.deepEqual(tygodniePlanu({ tygodni: 8, deload: true, tydzienMaksow: true }), [1, 2, 3, 4, 5, 6, 9, 10, 7, 8]);
  });

  test("liczba tygodni: 4–12 całkowita, inaczej 6", () => {
    assert.deepEqual([undefined, 3, 4, 7.5, 12, 13, "8"].map((n) => liczbaTygodni({ tygodni: n })), [6, 6, 4, 6, 12, 6, 6]);
  });

  test("na ekranie deload i maksy stoją zaraz po ostatnim tygodniu roboczym", () => {
    const p = { tygodni: 9, deload: true, tydzienMaksow: true };
    assert.deepEqual(tygodniePlanu(p).map((t) => numerTygodniaNaEkranie(p, t)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.equal(numerTygodniaNaEkranie({ tygodni: 4, tydzienMaksow: true }, TYDZIEN_MAKSOW), 5);
    assert.equal(numerTygodniaNaEkranie({ deload: true }, TYDZIEN_DELOADU), 7, "plan sześciotygodniowy jak dotąd");
    assert.equal(kluczZNumeru(p, 7), 9);
    assert.equal(kluczZNumeru(p, 10), TYDZIEN_DELOADU);
    assert.equal(kluczZNumeru(p, 11), TYDZIEN_MAKSOW);
    assert.equal(kluczZNumeru({ tygodni: 4 }, 5), null);
  });

  test("szablon: blok I to T1–T3, każdy następny — T4–T6, od bloku III RPE +0,5 na blok", () => {
    const t = (n: number) => { const s = szablonTygodnia(kluczTygodnia(n)); return [s.tydzien, s.premiaRpe]; };
    assert.deepEqual([1, 3, 4, 6, 7, 9, 10, 12].map(t), [[1, 0], [3, 0], [4, 0], [6, 0], [4, 0.5], [6, 0.5], [4, 1], [6, 1]]);
    assert.deepEqual([2, 3, 4, 7, 8, 9, 10, 11].map((n) => bazaBloku(kluczTygodnia(n))), [1, 1, null, null, 9, 9, null, 12]);
    assert.deepEqual(wczesniejszeRobocze(TYDZIEN_DELOADU, { tygodni: 4 }), [4, 3, 2, 1]);
    assert.deepEqual(wczesniejszeRobocze(9), [6, 5, 4, 3, 2, 1]);
  });
});

describe("plan sześciotygodniowy bez zmian", () => {
  test("„tygodni: 6” liczy się dokładnie tak samo jak plan bez tego pola", () => {
    const a = przeliczPlan(plan({ deload: true, tydzienMaksow: true }));
    const b = przeliczPlan(plan({ deload: true, tydzienMaksow: true, tygodni: 6 }));
    assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)));
  });
});

describe("plan krótszy — 4 tygodnie", () => {
  const szesc = przeliczPlan(plan());
  const cztery = przeliczPlan(plan({ tygodni: 4, deload: true, tydzienMaksow: true }));

  test("cztery tygodnie robocze, T1–T4 jak w planie sześciotygodniowym", () => {
    assert.deepEqual(cztery.tygodnie.map((t) => t.tydzien), [1, 2, 3, 4]);
    for (const t of [1, 2, 3, 4]) {
      for (const id of ["D1-S01", "D1-S02", "D2-S01"]) {
        assert.deepEqual(bezCwiczenia(slot(cztery, t, id)), bezCwiczenia(slot(szesc, t, id)), `T${t} ${id}`);
      }
    }
  });

  test("deload bierze serie i powtórzenia z T4 (ostatniego), RPE o 1 niżej; maksy po nim", () => {
    const t4 = slot(cztery, 4, "D1-S01");
    const d = slot(cztery, TYDZIEN_DELOADU, "D1-S01");
    assert.deepEqual([d.serie, d.powtorzenia, d.rpe], [t4.serie, t4.powtorzenia, t4.rpe - 1]);
    assert.deepEqual(cztery.tygodnieDodatkowe.map((t) => t.rodzaj), ["deload", "maksy"]);
  });
});

describe("plan dłuższy — 12 tygodni", () => {
  const p = plan({ tygodni: 12, deload: true });
  const w = przeliczPlan(p);

  test("dwanaście tygodni roboczych, deload po T12", () => {
    assert.deepEqual(w.tygodnie.map((t) => t.tydzien), [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14]);
    const t12 = slot(w, 14, "D1-S01");
    const d = slot(w, TYDZIEN_DELOADU, "D1-S01");
    assert.deepEqual([d.serie, d.powtorzenia], [t12.serie, t12.powtorzenia]);
  });

  test("bój: T7–T9 to serie i powtórzenia T4–T6 z RPE +0,5, T10–T12 z +1,0 — i cięższe", () => {
    for (const [n, wzor, premia] of [[7, 4, 0.5], [8, 5, 0.5], [9, 6, 0.5], [10, 4, 1], [12, 6, 1]] as const) {
      const s = slot(w, kluczTygodnia(n), "D1-S01");
      const z = slot(w, wzor, "D1-S01");
      assert.deepEqual([s.serie, s.powtorzenia, s.rpe], [z.serie, z.powtorzenia, Math.min(10, z.rpe + premia)], `T${n}`);
      assert.ok((s.ciezar as number) >= (z.ciezar as number), `T${n} nie lżej niż T${wzor}`);
    }
    assert.ok((slot(w, 9, "D1-S01").ciezar as number) > (slot(w, 4, "D1-S01").ciezar as number));
  });

  test("akcesorium „trzymaj z bloku”: T8 i T9 niosą ciężar z T7, T7 liczy się z 1RM", () => {
    const t7 = slot(w, 9, "D1-S02");
    assert.equal(typeof t7.ciezar, "number");
    assert.equal(slot(w, 10, "D1-S02").ciezar, t7.ciezar);
    assert.equal(slot(w, 11, "D1-S02").ciezar, t7.ciezar);
    assert.equal(t7.rpe, slot(w, 4, "D1-S02").rpe + 0.5);
  });

  test("TOP SET w T7 z RPE szablonu T4 + 0,5", () => {
    assert.equal(topSet(w, 9).rpe, topSet(w, 4).rpe! + 0.5);
    assert.equal(topSet(w, 12).rpe, Math.min(10, topSet(w, 4).rpe! + 1), "T10 = klucz 12");
  });

  test("ocena „za łatwe” w T6 podnosi ciężar w T7 — historia ocen idzie przez cały cykl", () => {
    const zOcena = plan({ tygodni: 9 });
    (zOcena.sloty[0] as any).tygodnie = { 6: { feedback: "za łatwe" } };
    const a = przeliczPlan(plan({ tygodni: 9 }));
    const b = przeliczPlan(zOcena);
    assert.equal(slot(a, 9, "D1-S01").mnoznik, 1);
    assert.equal(slot(b, 9, "D1-S01").mnoznik, 1.05);
  });

  test("przycisk progresji wpisuje tygodnie T7–T12 (klucze 9–14) tymi samymi liczbami, które liczy silnik", () => {
    const zProgresja = zastosujProgresje(p);
    const tygodnie = zProgresja.sloty[0]!.tygodnie!;
    assert.deepEqual(Object.keys(tygodnie).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14]);
    const po = przeliczPlan(zProgresja);
    for (const t of [9, 14]) assert.equal(slot(po, t, "D1-S01").ciezar, slot(w, t, "D1-S01").ciezar);
  });
});

describe("skrócenie niczego nie kasuje", () => {
  test("wpisy z T7 zostają w planie i wracają po wydłużeniu", () => {
    const p = plan({ tygodni: 9 });
    (p.sloty[0] as any).tygodnie = { 9: { serie: 2 } };
    assert.equal(slot(przeliczPlan(p), 9, "D1-S01").serie, 2);
    const krotszy = przeliczPlan({ ...p, tygodni: 6 });
    assert.equal(tydzienWyliczony(krotszy, 9), undefined);
    assert.equal(slot(przeliczPlan({ ...p, tygodni: 7 }), 9, "D1-S01").serie, 2);
  });
});
