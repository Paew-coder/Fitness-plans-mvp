/**
 * Przerwa między seriami — jedna liczba w trzech miejscach.
 *
 * Regułę trzyma silnik (`przerwa.ts`), serwer podaje ją klientowi przy każdym
 * ćwiczeniu, a aplikacja klienta odlicza. Ten plik pilnuje dwóch rzeczy naraz:
 * że reguła daje to, co ma dawać, i że **klient nie liczy jej po swojemu** —
 * bo drugie miejsce z tą samą wiedzą rozjeżdża się po cichu.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { przerwaSekund, PRZERWA_SEKUND, PRZERWA_DOMYSLNA } from "../../silnik/src/przerwa.ts";

const TU = dirname(fileURLToPath(import.meta.url));
const KLIENT = readFileSync(join(TU, "../public/klient/app.js"), "utf8");

describe("przerwa między seriami", () => {
  test("cięższe ćwiczenie odpoczywa dłużej", () => {
    assert.ok(przerwaSekund(1) > przerwaSekund(0.75));
    assert.ok(przerwaSekund(0.75) > przerwaSekund(0.5));
    assert.ok(przerwaSekund(0.5) > przerwaSekund(0.25));
  });

  test("bój główny trzy minuty, izolacja minutę", () => {
    assert.equal(przerwaSekund(1), 180);
    assert.equal(przerwaSekund(0.25), 60);
  });

  test("bez coeff zostaje środek, nie zero", () => {
    assert.equal(przerwaSekund(), PRZERWA_DOMYSLNA);
    assert.equal(przerwaSekund(null), PRZERWA_DOMYSLNA);
    assert.ok(PRZERWA_DOMYSLNA > 0, "przerwa zerowa znaczyłaby „wracaj od razu”");
  });

  test("każdy coeff z BAZY ma swoją przerwę", () => {
    for (const coeff of [1, 0.75, 0.5, 0.25] as const) {
      assert.equal(typeof PRZERWA_SEKUND[coeff], "number", `coeff ${coeff}`);
    }
  });

  /**
   * Klient dostaje przerwę z serwera przy każdym ćwiczeniu. Jedyna liczba,
   * którą zna sam, to ratunek na widok zapisany w telefonie **zanim** serwer
   * zaczął ją podawać — i ta jedna ma się zgadzać z domyślną z silnika.
   * Gdyby klient zaczął liczyć przerwy z własnej tabeli, zmiana reguły
   * w silniku przestałaby cokolwiek zmieniać na siłowni.
   */
  test("aplikacja klienta nie liczy przerw po swojemu", () => {
    const zapasowa = KLIENT.match(/const PRZERWA_GDY_BRAK = (\d+);/);
    assert.ok(zapasowa, "brak stałej PRZERWA_GDY_BRAK w app.js");
    assert.equal(Number(zapasowa![1]), PRZERWA_DOMYSLNA,
      "zapasowa przerwa klienta rozjechała się z domyślną z silnika");
    assert.ok(KLIENT.includes("przerwaSekundy"),
      "klient ma brać przerwę z serwera, nie liczyć jej sam");
  });
});
