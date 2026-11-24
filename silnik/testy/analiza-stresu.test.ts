/**
 * Więcej z liczenia stresu (23.11.2026): ranking ćwiczeń i skoki obciążenia.
 * Stres zaplanowany a zrobiony — `konsola/testy/profil-klienta.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { przeliczPlan, type Plan } from "../src/plan.ts";
import { PROG_DO_SREDNIEJ, PROG_SKOKU, skokiStresu, stresCwiczen } from "../src/analiza-stresu.ts";

const plan = (): Plan => ({
  nazwa: "stres", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
  serieMaksymalne: [{ cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 1 }],
  sloty: [
    { positionId: "D1-S01", dzien: 1, lp: "A1.", cwiczenieId: "EX-0010" },
    { positionId: "D1-S02", dzien: 1, lp: "B1.", cwiczenieId: "EX-0016" },
    { positionId: "D2-S01", dzien: 2, lp: "A1.", cwiczenieId: "EX-0010" },
  ],
} as unknown as Plan);

test("ranking: to samo ćwiczenie z kilku dni razem, od największego, udziały sumują się do 1", () => {
  const wynik = przeliczPlan(plan());
  const r = stresCwiczen(wynik);
  assert.deepEqual(r.map((c) => c.id), ["EX-0010", "EX-0016"]);
  const przysiad = wynik.tygodnie.flatMap((t) => t.sloty).filter((s) => s.cwiczenie?.id === "EX-0010")
    .reduce((a, s) => a + s.stres.calkowity, 0);
  assert.ok(Math.abs(r[0]!.calkowity - przysiad) < 0.01);
  assert.ok(Math.abs(r.reduce((a, c) => a + c.udzial, 0) - 1) < 0.001);
  assert.ok(r[0]!.centralny > 0 && r[0]!.obwodowy > 0);
});

test("skoki: zmiana do poprzedniego i do średniej z 3 poprzednich; progi 20 % i 1,3×", () => {
  const s = skokiStresu([10, 11, 11, 15, 12]);
  assert.deepEqual(s[0], { stres: 10, zmiana: null, doSredniej: null, skok: false });
  assert.equal(s[1]!.skok, false);
  assert.ok(Math.abs(s[3]!.zmiana! - (15 / 11 - 1)) < 0.001);
  assert.ok(Math.abs(s[3]!.doSredniej! - 15 / ((10 + 11 + 11) / 3)) < 0.001);
  assert.equal(s[3]!.skok, true, "+36 % i 1,41× średniej");
  assert.equal(s[4]!.skok, false, "spadek to nie skok");
  assert.equal(PROG_SKOKU, 0.2);
  assert.equal(PROG_DO_SREDNIEJ, 1.3);
  // Sama średnia też wystarczy: +18 % do poprzedniego, ale 1,35× średniej.
  assert.equal(skokiStresu([8, 8, 11, 13])[3]!.skok, true);
});

test("stres przy połówkach RPE: 7,5 ma własny wiersz (między 7 a 8); RPE spoza siatki — do najbliższej połówki, nie 0", async () => {
  const { stresSlotu } = await import("../src/stres.ts");
  const { procent1RM } = await import("../src/rpe.ts");
  const s = (rpe: number) => stresSlotu({ coeff: 1, serie: 1, rpe, powtorzenia: 5 }).calkowity;
  assert.deepEqual([s(7), s(7.5), s(8)], [0.6, 0.7, 0.8]);
  assert.equal(s(7.3), s(7.5), "7,3 → 7,5 zamiast 0");
  assert.equal(s(7.2), s(7));
  assert.ok(s(7.3) > 0);
  // Ciężar zostaje jak w arkuszu: spoza siatki — „ustaw ręcznie” (widać to), nie zgadujemy.
  assert.equal(procent1RM(5, 7.3), null);
  assert.equal(stresSlotu({ coeff: 1, serie: 1, rpe: 8, powtorzenia: 5.4 }).calkowity, s(8), "powtórzenia — całe");
});
