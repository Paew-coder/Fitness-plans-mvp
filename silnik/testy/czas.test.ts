/**
 * Ćwiczenia na czas — sekundy i ocena skalowana z czasem (27.10.2026).
 *
 * Trener: „jeżeli czas utrzymania to np. 5 sekund, »za trudne« zmienia go na
 * 4 sekundy, ale jeżeli było 45 sekund — na 40. Wartość skaluje się z tym,
 * jak duża będzie zmiana”.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CZAS_MAKS_S, czasPoOcenie, krokCzasu } from "../src/czas.ts";
import { katalog } from "../src/katalog.ts";
import { przeliczPlan, type Plan } from "../src/plan.ts";

test("krok rośnie z czasem: co najmniej 10 %, okrągły", () => {
  assert.deepEqual([5, 10, 15, 20, 30, 45, 60, 90, 180].map(krokCzasu), [1, 1, 2, 2, 5, 5, 10, 10, 30]);
});

test("przykłady trenera: 5 s → 4 s, 45 s → 40 s; dwa razy — od czasu po pierwszej", () => {
  assert.equal(czasPoOcenie(5, -1), 4);
  assert.equal(czasPoOcenie(45, -1), 40);
  assert.equal(czasPoOcenie(45, -2), 35);
  assert.equal(czasPoOcenie(45, 1), 50);
  assert.equal(czasPoOcenie(2, -3), 1, "najmniej sekunda");
  assert.equal(czasPoOcenie(CZAS_MAKS_S, 2), CZAS_MAKS_S);
});

test("w planie: czas wpisany przez trenera zmienia się po ocenie w kolejnych tygodniach", () => {
  const id = katalog.bazaTrenera.find((c) => c.progresja === "czas")!.id;
  const plan = (feedback?: "za trudne" | "za łatwe"): Plan => ({
    nazwa: "czas", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość", serieMaksymalne: [],
    sloty: [{ positionId: "D1-S01", dzien: 1, lp: "A1.", cwiczenieId: id, tygodnie: {
      1: { serie: 3, powtorzenia: 45, rpe: 8, ...(feedback ? { feedback } : {}) },
      2: { serie: 3, powtorzenia: 45, rpe: 8 },
      3: { serie: 3, powtorzenia: 50, rpe: 8 },
    } }],
  }) as Plan;
  const czasy = (p: Plan) => przeliczPlan(p).tygodnie.slice(0, 3).map((t) => t.sloty[0]!.powtorzenia);
  assert.deepEqual(czasy(plan()), [45, 45, 50], "bez oceny — jak wpisał trener");
  assert.deepEqual(czasy(plan("za trudne")), [45, 40, 45]);
  assert.deepEqual(czasy(plan("za łatwe")), [45, 50, 55]);
});

test("„±” przy czasie przyjmuje sekundy ponad 30 (do 600)", async () => {
  const { powtorzeniaOdT1 } = await import("../src/progresja.ts");
  const id = katalog.bazaTrenera.find((c) => c.progresja === "czas")!.id;
  const plan = { nazwa: "czas", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość", serieMaksymalne: [],
    sloty: [{ positionId: "D1-S01", dzien: 1, lp: "B1.", cwiczenieId: id }] } as unknown as Plan;
  const wynik = powtorzeniaOdT1(plan, "D1-S01", 45);
  assert.ok(!("blad" in wynik), JSON.stringify(wynik));
  assert.equal(przeliczPlan(wynik as Plan).tygodnie[0]!.sloty[0]!.powtorzenia, 45);
  assert.ok("blad" in powtorzeniaOdT1(plan, "D1-S01", 700));
});
