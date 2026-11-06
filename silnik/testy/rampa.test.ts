/**
 * Rozgrzewka rampą (trener, 02.10.2026): lekko × 8–10, 50 % × 5, 70 % × 3,
 * 85 % × 1 ciężaru pierwszej ciężkiej serii, zaokrąglone do skoku.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { krokiRampy, potrzebaRampy } from "../src/rampa.ts";

describe("rampa", () => {
  test("przed TOP SETEM 117,5 kg: lekko, 60, 82,5, 100", () => {
    assert.deepEqual(krokiRampy(117.5, 2.5), [
      { ciezar: null, powtorzenia: "8–10" },
      { ciezar: 60, powtorzenia: "5" },
      { ciezar: 82.5, powtorzenia: "3" },
      { ciezar: 100, powtorzenia: "1" },
    ]);
  });

  test("przy lekkim celu kroki, które nie rosną, odpadają", () => {
    // 10 kg ze skokiem 5: 50 % = 5, 70 % = 7 → 5 (bez wzrostu), 85 % = 8,5 → 10 (= cel).
    assert.deepEqual(krokiRampy(10, 5), [
      { ciezar: null, powtorzenia: "8–10" },
      { ciezar: 5, powtorzenia: "5" },
    ]);
  });

  test("bez ciężaru docelowego zostaje sam krok „lekko”", () => {
    assert.deepEqual(krokiRampy(null, 2.5), [{ ciezar: null, powtorzenia: "8–10" }]);
  });

  test("kiedy rampa jest, a kiedy jej nie ma", () => {
    const baza = { progresja: "kg" as const, coeff: 0.5 as const, bojGlowny: false, maTopSet: false };
    assert.equal(potrzebaRampy(baza), false, "akcesorium bez TOP SETU");
    assert.equal(potrzebaRampy({ ...baza, coeff: 1 }), true, "złożone z BAZY");
    assert.equal(potrzebaRampy({ ...baza, maTopSet: true }), true, "z TOP SETEM");
    assert.equal(potrzebaRampy({ ...baza, bojGlowny: true }), true, "bój główny");
    assert.equal(potrzebaRampy({ ...baza, bojSilowy: true }), true, "bój siłowy „S”");
    assert.equal(potrzebaRampy({ ...baza, coeff: 1, progresja: "masa ciała" }), false,
      "bez kilogramów nie ma czego rozpisać");
  });
});
