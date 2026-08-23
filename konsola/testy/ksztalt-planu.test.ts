/**
 * Granica między tym, co przyszło z sieci, a tym, co idzie do silnika.
 *
 * Silnik zakłada, że dostaje plan — i ma pełne prawo zakładać, bo jest czystą
 * matematyką. Sprawdzenie, czy to naprawdę plan, należy do serwera. Dotąd
 * pilnowała tego wyłącznie kontrola odporności, która potrzebuje uruchomionego
 * serwera; te przypadki chodzą w zwykłym `npm test`.
 *
 * Dwa rodzaje szkody, które to zatrzymuje. Pierwszy to **awaria zamiast
 * odmowy**: `sloty` jako tekst dawało kod 500 z komunikatem z wnętrza Node'a.
 * Drugi, gorszy, to **cichy zapis czegoś, co planem nie jest** — plan psuł się
 * dopiero przy odczycie, czyli trener tracił dostęp do cyklu, którego przed
 * chwilą używał.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  bladDatyStartu, bladKsztaltuPlanu, bladKsztaltuPropozycji,
} from "../ksztalt-planu.ts";
// Dozwolone wartości bierzemy stąd, skąd bierze je serwer. Wpisane z pamięci
// dawały test, który sprawdzał moje wyobrażenie zamiast aplikacji.
import { TRYBY_AKCESORIOW, CZESCI_PLANU } from "../../silnik/src/typy.ts";

const planPoprawny = () => ({
  sloty: [{ positionId: "D1-S01", dzien: 1, cwiczenieId: "EX-0010", tygodnie: {} }],
  serieMaksymalne: [{ cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 3 }],
  topSety: [{ dzien: 1, wlaczony: true, rpe: 8 }],
  trybAkcesoriow: TRYBY_AKCESORIOW[0],
  czescPlanu: CZESCI_PLANU[0],
});

describe("kształt planu", () => {
  test("poprawny plan przechodzi", () => {
    assert.equal(bladKsztaltuPlanu(planPoprawny()), null);
  });

  const zle: [string, () => unknown][] = [
    ["plan jako tekst", () => "plan"],
    ["plan jako lista", () => []],
    ["bez slotów", () => ({ ...planPoprawny(), sloty: undefined })],
    ["sloty jako tekst", () => ({ ...planPoprawny(), sloty: "D1-S01" })],
    ["slot bez pozycji", () => ({ ...planPoprawny(), sloty: [{ dzien: 1 }] })],
    ["slot bez dnia", () => ({ ...planPoprawny(), sloty: [{ positionId: "D1-S01" }] })],
    ["ćwiczenie jako liczba", () => ({ ...planPoprawny(),
      sloty: [{ positionId: "D1-S01", dzien: 1, cwiczenieId: 42 }] })],
    ["serie maksymalne jako tekst", () => ({ ...planPoprawny(), serieMaksymalne: "dużo" })],
    ["seria bez liczb", () => ({ ...planPoprawny(),
      serieMaksymalne: [{ cwiczenieId: "EX-0010", ciezar: "sporo", powtorzenia: 3 }] })],
    ["tryb akcesoriów nieznany", () => ({ ...planPoprawny(), trybAkcesoriow: "cokolwiek" })],
    ["część planu nieznana", () => ({ ...planPoprawny(), czescPlanu: "połowa" })],
    ["sto tysięcy slotów", () => ({ ...planPoprawny(),
      sloty: Array.from({ length: 100_000 },
        (_, i) => ({ positionId: `D1-S${i}`, dzien: 1 })) })],
  ];

  for (const [co, zrob] of zle) {
    test(`odmawiamy: ${co}`, () => {
      const blad = bladKsztaltuPlanu(zrob());
      assert.ok(blad, `${co} zostało przyjęte`);
      // Komunikat trafia wprost na ekran trenera, więc mówi, co jest nie tak,
      // a nie którą funkcję to wywróciło.
      assert.doesNotMatch(blad, /undefined|function|TypeError|\.ts:/, blad);
    });
  }
});

describe("data startu", () => {
  test("pustka jest w porządku — cykl bez daty czeka", () => {
    assert.equal(bladDatyStartu(null), null);
    assert.equal(bladDatyStartu(""), null);
  });

  test("poprawna data przechodzi", () => {
    assert.equal(bladDatyStartu("2026-08-23"), null);
  });

  test("30 lutego nie istnieje, mimo że wygląda poprawnie", () => {
    // `Date.parse` przyjmuje ją i po cichu przesuwa na 2 marca — czyli cykl
    // zaczynałby się innego dnia, niż trener wpisał.
    assert.ok(bladDatyStartu("2026-02-30"));
  });

  for (const zla of ["23.08.2026", "2026-8-3", "jutro", "2026-13-01", 20260823]) {
    test(`odmawiamy: ${JSON.stringify(zla)}`, () => {
      assert.ok(bladDatyStartu(zla));
    });
  }
});

describe("propozycja asystenta", () => {
  const propozycja = () => ({
    dni: [{ dzien: 1, nazwa: "A", cwiczenia: [{ cwiczenieId: "EX-0010", kategoria: "Core" }] }],
  });

  test("poprawna propozycja przechodzi", () => {
    assert.equal(bladKsztaltuPropozycji(propozycja()), null);
  });

  const zle: [string, unknown][] = [
    ["propozycja jako tekst", "zrób mi plan"],
    ["brak dni", {}],
    ["dni jako tekst", { dni: "poniedziałek" }],
    ["pusta lista dni", { dni: [] }],
    ["dzień jako tekst", { dni: [{ dzien: "jeden", cwiczenia: [] }] }],
    ["dzień bez numeru", { dni: [{ nazwa: "A", cwiczenia: [] }] }],
    ["ćwiczenia jako tekst", { dni: [{ dzien: 1, cwiczenia: "przysiad" }] }],
    ["pozycja jako tekst", { dni: [{ dzien: 1, cwiczenia: ["przysiad"] }] }],
    ["tysiąc dni", { dni: Array.from({ length: 1000 }, () => ({ dzien: 1, cwiczenia: [] })) }],
  ];

  for (const [co, wejscie] of zle) {
    test(`odmawiamy: ${co}`, () => {
      const blad = bladKsztaltuPropozycji(wejscie);
      assert.ok(blad, `${co} zostało przyjęte`);
      // To jest ten komunikat, który przy „dni jako tekst" brzmiał
      // „((intermediate value) ?? []).map is not a function".
      assert.doesNotMatch(blad, /is not a function|intermediate value|TypeError/, blad);
    });
  }
});
