/**
 * Ćwiczenia z gumą — w kolumnie ciężaru „guma” (17.10.2026).
 *
 * Trener: przy „SL Glute Bridge ISO Band Hip Flexion” w kolumnie ciężaru stało
 * „czas”, „a to jest ćwiczenie z gumą jak wskazuje nazwa — musimy zrobić
 * osobny wpis w tamto miejsce dla ćwiczeń z gumą”.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { Katalog, katalog } from "../src/katalog.ts";
import { przeliczPlan, tydzienWyliczony, type Plan } from "../src/plan.ts";
import { zGuma } from "../src/typy.ts";

const GLUTE_BRIDGE_BAND = "EX-2579"; // czas
const BANDED_PULL_UPS = "EX-0009";   // asysta, BAZA trenera
const BAND_ON_DB = "EX-1066";        // ręczne ustawienie, guma + hantle
const KB_PULLOVER_BAND = "EX-0415";  // kg, guma + kettlebell

const ciezar = (id: string, tygodnie = {}) => {
  const plan: Plan = {
    nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [{ cwiczenieId: KB_PULLOVER_BAND, ciezar: 20, powtorzenia: 10 }],
    sloty: [{ positionId: "D1-S01", dzien: 1, lp: "A1.", cwiczenieId: id, kategoriaSzkieletu: null, tygodnie }],
  };
  return tydzienWyliczony(przeliczPlan(plan), 1)!.sloty[0]!.ciezar;
};

test("guma zamiast nazwy progresji — czas, asysta", () => {
  assert.equal(ciezar(GLUTE_BRIDGE_BAND), "guma");
  assert.equal(ciezar(BANDED_PULL_UPS), "guma");
});

test("ciężar wpisany wcześniej przez trenera nie wraca zamiast gumy", () => {
  assert.equal(ciezar(GLUTE_BRIDGE_BAND, { 1: { ciezarOverride: 10 } }), "guma");
});

test("guma z hantlą czy kettlem zostaje przy kilogramach", () => {
  assert.equal(zGuma(katalog.poId(BAND_ON_DB)!), false, "ręczne kg hantli");
  assert.equal(typeof ciezar(KB_PULLOVER_BAND), "number");
});

test("wszystkie złapane to gumy bez kilogramów", () => {
  const gumy = katalog.wszystkie.filter(zGuma);
  assert.ok(gumy.length > 100, String(gumy.length));
  for (const c of gumy) {
    assert.ok(!["kg", "dodatkowy ciężar"].includes(c.progresja), c.nazwa);
    assert.ok((c.sprzet ?? []).includes("guma") || /band/i.test(c.nazwa), c.nazwa);
  }
});

test("guma wybrana przez trenera (27.10.2026) idzie przed nazwą i sprzętem, ale nie przed kilogramami", () => {
  const plank = { nazwa: "Deska bokiem", progresja: "czas" as const };
  assert.equal(zGuma(plank), false);
  assert.equal(zGuma({ ...plank, guma: true }), true, "guma, choć nazwa jej nie mówi");
  assert.equal(zGuma({ nazwa: "Band pull-apart", progresja: "masa ciała", guma: false }), false, "trener zdjął gumę");
  assert.equal(zGuma({ nazwa: "Wiosło", progresja: "kg", guma: true }), false, "kilogramy wygrywają");
  const k = new Katalog();
  k.ustawPoprawki({ [BAND_ON_DB]: { guma: true } });
  assert.equal(zGuma(k.poId(BAND_ON_DB)!), true, "poprawka trenera przy ćwiczeniu z hantlą i gumą");
});
