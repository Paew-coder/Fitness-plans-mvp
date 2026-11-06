/**
 * Wszystkie serie ćwiczenia, nie tylko najcięższa.
 *
 * Przykład trenera z 23.09: plan 4 × 6 na 80 kg, a klient zrobił 90, potem 85.
 * Do bazy trafiało samo „90×6" i trener zakładał, że tak wyglądały wszystkie
 * serie. Najcięższa dalej idzie do 1RM — ale wylicza ją serwer z pełnej listy.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { MAKS_SERII, najciezsza, serieWpisu, sprawdzSerie } from "../serie-wykonane.ts";

const GRANICE = { ciezar: [0, 1000], powtorzenia: [0, 200] } as const;
const seria = (ciezar: number | null, powtorzenia: number | null) => ({ ciezar, powtorzenia });

describe("serie wpisane przez klienta", () => {
  test("do 1RM idzie najcięższa, nie ostatnia", () => {
    assert.deepEqual(najciezsza([seria(80, 6), seria(90, 6), seria(85, 6), seria(80, 6)]), seria(90, 6));
  });

  test("przy równym ciężarze wygrywa więcej powtórzeń", () => {
    assert.deepEqual(najciezsza([seria(90, 5), seria(90, 6), seria(90, 4)]), seria(90, 6));
  });

  test("seria z kompletem bije połówkę, choćby cięższą", () => {
    // Sam ciężar bez powtórzeń nic nie mówi o sile — z niego 1RM nie wyjdzie.
    assert.deepEqual(najciezsza([seria(100, null), seria(80, 6)]), seria(80, 6));
  });

  test("masa ciała: same powtórzenia też są coś warte", () => {
    assert.deepEqual(najciezsza([seria(null, 12), seria(null, 15), seria(null, 10)]), seria(null, 15));
  });

  test("pusta lista to brak serii, nie seria zerowa", () => {
    assert.equal(najciezsza([]), null);
    assert.equal(najciezsza([seria(null, null)]), null);
  });

  test("dziura w środku zostaje — kolejne serie nie zmieniają numerów", () => {
    const wynik = sprawdzSerie([seria(80, 6), seria(null, null), seria(85, 6)], GRANICE);
    assert.ok("serie" in wynik);
    assert.deepEqual(wynik.serie, [seria(80, 6), seria(null, null), seria(85, 6)]);
  });

  test("puste serie z końca odpadają", () => {
    const wynik = sprawdzSerie([seria(80, 6), seria(null, null), {}], GRANICE);
    assert.ok("serie" in wynik);
    assert.deepEqual(wynik.serie, [seria(80, 6)]);
  });

  test("wartości spoza świata i zły kształt dostają odmowę po polsku", () => {
    for (const [opis, wejscie] of [
      ["tekst zamiast listy", "80x6"],
      ["ciężar 5000 kg", [seria(5000, 6)]],
      ["ujemne powtórzenia", [seria(80, -1)]],
      ["nieskończoność", [{ ciezar: 1e400, powtorzenia: 6 }]],
      ["liczba zamiast serii", [80]],
      ["za długa lista", Array.from({ length: MAKS_SERII + 1 }, () => seria(80, 6))],
    ] as const) {
      const wynik = sprawdzSerie(wejscie, GRANICE);
      assert.ok("blad" in wynik, `${opis} przeszło`);
    }
  });

  test("wpis sprzed zmiany pokazuje się jako jedna seria — bez dopisywania", () => {
    assert.deepEqual(serieWpisu({ ciezarWykonany: 90, powtorzeniaWykonane: 6 }), [seria(90, 6)]);
    assert.deepEqual(serieWpisu({}), []);
    assert.deepEqual(serieWpisu(undefined), []);
    assert.deepEqual(serieWpisu({ serie: [seria(80, 6), seria(90, 6)], ciezarWykonany: 90 }),
      [seria(80, 6), seria(90, 6)]);
  });
});
