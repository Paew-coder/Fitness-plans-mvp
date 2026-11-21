/**
 * Ocena zmienia też mały ciężar (trener, 02.10.2026): „nie wyłapało 5 kg —
 * niech przeskakuje na 4 kg”. Gdy ±5 % ginie w zaokrągleniu: do 10 kg o 1 kg,
 * wyżej o skok ćwiczenia.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { krokWidoczny, widocznaZmiana } from "../src/ciezar.ts";
import { przeliczPlan, tydzienWyliczony, type Plan } from "../src/plan.ts";

describe("widoczna zmiana po ocenie", () => {
  test("krok: do 10 kg o 1 kg do pełnych kilogramów, wyżej o skok", () => {
    assert.equal(krokWidoczny(5, -1, 2.5), 4);
    assert.equal(krokWidoczny(5, 1, 2.5), 6);
    assert.equal(krokWidoczny(7.5, -1, 2.5), 7);
    assert.equal(krokWidoczny(7.5, 1, 2.5), 8);
    assert.equal(krokWidoczny(10, -1, 2.5), 9);
    assert.equal(krokWidoczny(12.5, -1, 2.5), 10, "jak dotąd — trener: „okej”");
    assert.equal(krokWidoczny(1, -1, 1), 0.5, "nie schodzi do zera");
  });

  test("tylko gdy ocena zginęła w zaokrągleniu, tyle kroków, ile ocen", () => {
    assert.equal(widocznaZmiana(5, 5, 0.95, 2.5), 4);
    assert.equal(widocznaZmiana(5, 5, 0.9, 2.5), 3);
    assert.equal(widocznaZmiana(5, 5, 1.05, 2.5), 6);
    assert.equal(widocznaZmiana(5, 5, 1, 2.5), 5, "bez oceny nic");
    assert.equal(widocznaZmiana(30, 27.5, 0.95, 2.5), 27.5, "zaokrąglenie samo zmieniło — zostaje");
    assert.equal(widocznaZmiana(20, 20, 0.95, 2.5), 17.5, "powyżej 10 kg — skok");
  });

  test("w planie: „za trudne” w T1 przy małym ciężarze zmienia T2, a slot to oznacza", () => {
    // Akcesorium (B1) z 1RM tak małym, że T1 wychodzi kilka kilogramów.
    const plan = (feedback?: "za trudne"): Plan => ({
      nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
      serieMaksymalne: [{ cwiczenieId: "EX-0016", ciezar: 8, powtorzenia: 1 }],
      sloty: [{ positionId: "D1-S01", dzien: 1, lp: "B1.", cwiczenieId: "EX-0016",
        kategoriaSzkieletu: null, tygodnie: feedback ? { 1: { feedback } } : {} }],
    });
    const t = (p: Plan, n: number) => tydzienWyliczony(przeliczPlan(p), n)!.sloty[0]!;
    const t1 = t(plan(), 1).ciezar as number;
    assert.ok(t1 > 0 && t1 <= 10, `T1 = ${t1}`);
    assert.equal(t(plan(), 2).ciezar, t1, "bez oceny T2 trzyma T1");
    const poOcenie = t(plan("za trudne"), 2);
    assert.equal(poOcenie.ciezar, krokWidoczny(t1, -1, 2.5), `T2 po „za trudne”: ${poOcenie.ciezar}`);
    assert.equal(poOcenie.zmianaPoOcenie, true);
    assert.equal(t(plan(), 2).zmianaPoOcenie, undefined);
  });

  test("masa ciała: „za trudne” w T1 to o 1 powtórzenie mniej w kolejnych tygodniach", () => {
    const plan = (feedback?: "za trudne"): Plan => ({
      nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość", serieMaksymalne: [],
      sloty: [{ positionId: "D1-S01", dzien: 1, lp: "C1.", cwiczenieId: "EX-0122",   // Knee raises
        kategoriaSzkieletu: null, tygodnie: feedback ? { 1: { feedback } } : {} }],
    });
    const powt = (p: Plan, n: number) => tydzienWyliczony(przeliczPlan(p), n)!.sloty[0]!.powtorzenia;
    for (const n of [2, 3]) assert.equal(powt(plan("za trudne"), n), powt(plan(), n) - 1, `T${n}`);
  });
});
