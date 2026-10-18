/**
 * Widoczny postęp przy spadku powtórzeń (18.10.2026).
 *
 * Trener: „single arm lat pullover — 6 kg na 10–12 powtórzeń w T1–T3 z RPE 8,
 * ale po zmianie RPE na 9 i powrocie do 10 powtórzeń ciężar nadal zostaje 6,
 * bo zmiana jest za mała — T4 wygląda tak samo jak T1 i jest to cofnięcie
 * progresu”.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { przeliczPlan, type Plan } from "../src/plan.ts";

const PULLOVER = "EX-2497";   // Single Arm Lat Pullover, coeff 0,5, skok 1 kg

function tygodnie(oneRM: number, parametry: Record<number, object> = {}, id = PULLOVER) {
  const plan: Plan = {
    nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [{ cwiczenieId: id, ciezar: oneRM, powtorzenia: 1 }],
    sloty: [{ positionId: "D1-S03", dzien: 1, lp: "B2.", cwiczenieId: id, kategoriaSzkieletu: null, tygodnie: parametry }],
  };
  return przeliczPlan(plan).tygodnie.slice(0, 6).map((t) => t.sloty[0]!);
}

test("przykład trenera: T4 o skok cięższy niż T3, T5–T6 trzymają nowy ciężar", () => {
  const t = tygodnie(8.5);
  assert.deepEqual(t.map((s) => `${s.ciezar}×${s.powtorzenia}`),
    ["6×10", "6×11", "6×12", "7×10", "7×11", "7×12"]);
  assert.equal(t[3]!.widocznyPostep, true);
  assert.equal(t[4]!.widocznyPostep, undefined, "T5 trzyma T4 z bloku — nic nie podbija");
});

test("po ocenie „za trudne” nic się nie podnosi — klient powiedział, że jest ciężko", () => {
  const t = tygodnie(8.5, { 3: { feedback: "za trudne" } });
  assert.ok((t[3]!.ciezar as number) <= 6, String(t[3]!.ciezar));
  assert.equal(t[3]!.widocznyPostep, undefined);
});

test("ciężar wpisany przez trenera wygrywa", () => {
  const t = tygodnie(8.5, { 4: { ciezarOverride: 6 } });
  assert.equal(t[3]!.ciezar, 6);
  assert.equal(t[3]!.widocznyPostep, undefined);
});

test("przy dużych ciężarach zaokrąglenie wzrostu nie zjada — reguła nic nie zmienia", () => {
  const t = tygodnie(60);
  assert.ok(t.every((s) => s.widocznyPostep === undefined));
  assert.ok((t[3]!.ciezar as number) > (t[2]!.ciezar as number));
});
