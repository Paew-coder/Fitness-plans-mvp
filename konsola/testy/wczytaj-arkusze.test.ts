/**
 * Odczytanie nazwiska i cyklu z nazwy pliku.
 *
 * Wczytywanie całego katalogu arkuszy stoi na jednym założeniu: że nazwa pliku
 * niesie nazwisko klienta i numer cyklu, bo tak te pliki są nazywane
 * („Zuzanna C 4.0.xlsx"). To jedyne miejsce w całej aplikacji, gdzie coś jest
 * **zgadywane z tekstu** — więc wzorzec jest celowo wąski.
 *
 * Lepiej powiedzieć „nie rozumiem tej nazwy" i pominąć plik, niż zgadnąć źle
 * i założyć klienta o nazwisku „Kopia (2)" albo wpiąć cudzy cykl do czyjejś
 * kartoteki. Pominięty plik trener widzi na liście i wczyta go z ekranu;
 * źle rozpoznanego nie zauważy, dopóki nie zajrzy do kartoteki.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { zNazwyPliku } from "../narzedzia/wczytaj-arkusze.ts";

describe("nazwy, które rozumiemy", () => {
  const dobre: [string, string, number][] = [
    ["Zuzanna C 4.0.xlsx", "Zuzanna C", 4],
    ["Zuzanna C 4.xlsx", "Zuzanna C", 4],
    ["Plan Zuzanna C 4.0.xlsx", "Zuzanna C", 4],
    ["plan Maciek Tabakowski 12.0.xlsx", "Maciek Tabakowski", 12],
    ["Anna 1.0.XLSX", "Anna", 1],
    ["  Jan Kowalski 7.0.xlsx  ", "Jan Kowalski", 7],
    ["Zuzanna C 999.xlsx", "Zuzanna C", 999],
  ];

  for (const [plik, klient, wersja] of dobre) {
    test(`„${plik.trim()}" → ${klient}, cykl ${wersja}`, () => {
      assert.deepEqual(zNazwyPliku(plik), { klient, wersja });
    });
  }

  test("pełna ścieżka też działa — liczy się sama nazwa pliku", () => {
    assert.deepEqual(zNazwyPliku("/home/trener/Plany/Zuzanna C 4.0.xlsx"),
      { klient: "Zuzanna C", wersja: 4 });
  });
});

describe("nazwy, przy których wolimy się nie domyślać", () => {
  for (const plik of [
    "Notatki z lipca.xlsx",       // brak numeru
    "4.0.xlsx",                    // sam numer, bez nazwiska
    "Zuzanna C.xlsx",              // brak cyklu
    "Zuzanna C 0.xlsx",            // cykl zerowy nie istnieje
    "Zuzanna C 1000.xlsx",         // poza zakresem numerów cykli
    "Kopia (2).xlsx",              // typowa nazwa po skopiowaniu pliku
    "Zuzanna C 4.0.pdf",           // nie arkusz
  ]) {
    test(`„${plik}" — pomijamy, zamiast zgadywać`, () => {
      assert.equal(zNazwyPliku(plik), null);
    });
  }
});

describe("cyfry w nazwisku", () => {
  test("liczba na końcu jest cyklem, wcześniejsze zostają w nazwisku", () => {
    // Trener bywa dokładny: „Anna K 2 4.0.xlsx" to druga Anna K, cykl czwarty.
    assert.deepEqual(zNazwyPliku("Anna K 2 4.0.xlsx"), { klient: "Anna K 2", wersja: 4 });
  });
});
