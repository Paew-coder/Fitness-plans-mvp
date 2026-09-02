/**
 * Nazwa klienta → identyfikator.
 *
 * To jest jedno z dwóch miejsc w aplikacji, gdzie z tekstu wpisanego ręką
 * powstaje klucz w bazie. Skutek pomyłki nie jest kosmetyczny: identyfikator
 * decyduje, do czyjej teczki wchodzi plan.
 *
 * Sprawdzone na działającej konsoli, zanim powstał ten plik: nazwa bez
 * łacińskich liter dawała identyfikator `klient` — ten sam dla każdej takiej
 * nazwy. Plan założony dla „Марія Ковальчук" wszedł do kartoteki „Анна"
 * i został podpisany cudzym nazwiskiem. Dwoje różnych ludzi w jednej teczce,
 * bez słowa ostrzeżenia. Dla trenera w Polsce klientka z Ukrainy to nie jest
 * przypadek teoretyczny.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { idKlienta, idPlanu, slug } from "../nazwy.ts";

describe("polskie nazwiska", () => {
  const pary: [string, string][] = [
    ["Zuzanna Ćwikła", "zuzanna-cwikla"],
    ["Łukasz Żółć", "lukasz-zolc"],
    ["Maciek Tabakowski", "maciek-tabakowski"],
    ["Anna K.", "anna-k"],
    ["  Jan   Kowalski  ", "jan-kowalski"],
  ];
  for (const [nazwa, oczekiwany] of pary) {
    test(`„${nazwa.trim()}" → ${oczekiwany}`, () => {
      assert.equal(idKlienta(nazwa), oczekiwany);
    });
  }

  test("wielkość liter i kropka nie robią z jednej osoby dwóch", () => {
    // To jest zachowanie chciane: „zuzanna c" i „Zuzanna C." to ta sama osoba,
    // a od łączenia dwóch teczek jest osobna operacja.
    assert.equal(idKlienta("Zuzanna Ćwikła"), idKlienta("zuzanna ćwikła."));
  });
});

describe("nazwy, z których nie zostaje ani jedna litera łacińska", () => {
  test("dwie różne nazwy dostają dwa różne identyfikatory", () => {
    // Sedno. Wcześniej obie dawały `klient`, więc druga wchodziła do teczki
    // pierwszej — z jej nazwiskiem na planie.
    assert.notEqual(idKlienta("Анна"), idKlienta("Марія Ковальчук"));
    assert.notEqual(idPlanu("Анна", 1), idPlanu("Марія Ковальчук", 1));
  });

  test("ta sama nazwa daje zawsze ten sam identyfikator", () => {
    // Inaczej klient gubiłby swoją teczkę przy każdym nowym cyklu.
    assert.equal(idKlienta("Анна Петренко"), idKlienta("Анна Петренко"));
  });

  test("identyfikator nadaje się do adresu i do nazwy pliku", () => {
    for (const nazwa of ["Анна", "李伟", "…", "🏋️"]) {
      const id = idKlienta(nazwa);
      assert.match(id, /^[a-z0-9-]+$/, `${nazwa} → ${id}`);
      assert.ok(id.length > 0);
    }
  });

  test("identyfikator planu zawsze zaczyna się od identyfikatora klienta", () => {
    // Na tym stoi cała nawigacja: z planu da się dojść do teczki i odwrotnie.
    for (const nazwa of ["Zuzanna Ćwikła", "Анна", "李伟"]) {
      assert.ok(idPlanu(nazwa, 4).startsWith(`${idKlienta(nazwa)}-`),
        `${nazwa}: ${idPlanu(nazwa, 4)} nie zaczyna się od ${idKlienta(nazwa)}`);
    }
  });
});

describe("sam slug", () => {
  test("z pustki robi pustkę, a nie śmieć", () => {
    // Zastępowanie pustki dzieje się warstwę wyżej, w `idKlienta` — tu ma być
    // widać, że nic nie zostało.
    assert.equal(slug("   "), "");
    assert.equal(slug("…"), "");
  });

  test("cyfry zostają — trener numeruje imienniczki", () => {
    assert.equal(idKlienta("Anna K 2"), "anna-k-2");
  });
});
