/**
 * Szablon arkusza 5.18 — to, co idzie do klienta jako plik .xlsx.
 *
 * Plik jest w repozytorium jako gotowy `.xlsx`, więc nic go nie pilnuje przy
 * zwykłym uruchomieniu testów: można go podmienić, przepuścić przez konwerter
 * albo zapomnieć o poprawce i zobaczyć to dopiero u klienta w telefonie —
 * czyli najpóźniej, jak się da.
 *
 * Czytamy surowy XML z archiwum, bez openpyxl i bez LibreOffice: chodzi
 * o kształt formuł, a nie o wynik przeliczenia.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PROGRESJA_TOP_SETU } from "../../silnik/src/top-set.ts";

const KATALOG = dirname(fileURLToPath(import.meta.url));
const SZABLON = join(KATALOG, "..", "..", "arkusz", "MasterTemplate-5-18.xlsx");

/** T1…T6 to sheet3…sheet8 w tym pliku. */
const ARKUSZE = [1, 2, 3, 4, 5, 6].map((t) => ({ nazwa: `T${t}`, plik: `sheet${t + 2}.xml` }));
const WIERSZE_TOPSET = [6, 22, 38, 54, 70];

/** Zawartość jednej części archiwum. `unzip -p` jest wszędzie tam, gdzie Node. */
function czesc(plik: string): string {
  return execFileSync("unzip", ["-p", SZABLON, `xl/worksheets/${plik}`], {
    encoding: "utf-8", maxBuffer: 64 * 1024 * 1024,
  });
}

function komorka(xml: string, adres: string): string {
  const m = xml.match(new RegExp(`<c r="${adres}"[^>]*>(.*?)</c>`, "s"));
  return m?.[1] ?? "";
}

describe("szablon 5.18 — TOP SET", () => {
  /*
   * Poprawka 4: pusty RPE znaczy „w tym tygodniu TOP SETU nie ma".
   *
   * Bez niej wyczyszczona komórka RPE daje MATCH bez trafienia, IFERROR
   * zwraca 0, a MROUND z zera to 0 kg — czyli zamiast pustego wiersza klient
   * dostaje polecenie „podnieś 0 kg". A pusty pierwszy tydzień to nie wyjątek,
   * tylko reguła: tak wyglądają oba szablony trenera.
   */
  test("wiersz TOP SETU patrzy na swoje RPE, we wszystkich tygodniach i dniach", () => {
    const bez: string[] = [];
    for (const { nazwa, plik } of ARKUSZE) {
      const xml = czesc(plik);
      for (const r of WIERSZE_TOPSET) {
        for (const kol of ["C", "D", "E"]) {
          if (!komorka(xml, `${kol}${r}`).includes(`$F${r}`)) bez.push(`${nazwa}!${kol}${r}`);
        }
      }
    }
    assert.deepEqual(bez, [], "te komórki nie sprawdzają, czy RPE jest puste");
  });

  /*
   * Rampa RPE w arkuszu i w silniku to musi być ta sama rampa. Arkusz miał ją
   * od zawsze — każdy tydzień ma własną komórkę F — tyle że eksport pisał
   * do jednej i sześć tygodni dostawało jedną liczbę.
   */
  test("RPE w arkuszu zgadza się z szablonem silnika", () => {
    const szablon = PROGRESJA_TOP_SETU["objętość"];
    for (const [i, { nazwa, plik }] of ARKUSZE.entries()) {
      const xml = czesc(plik);
      const oczekiwane = szablon[i];
      if (oczekiwane === null) continue;   // T1 — patrz test niżej
      for (const r of WIERSZE_TOPSET) {
        const wartosc = Number(komorka(xml, `F${r}`).replace(/<\/?v>/g, ""));
        assert.equal(wartosc, oczekiwane, `${nazwa}!F${r}`);
      }
    }
  });

  test("przełącznik TOP SETU jest jeden na cykl — T1 rządzi, reszta lustrzy", () => {
    // Stąd bierze się to, że „czy TOP SET jest" ustawia się raz na cykl,
    // a „w którym tygodniu" wychodzi z RPE. Gdyby przełącznik dało się ustawić
    // osobno co tydzień, eksport mógłby to zrobić wprost.
    assert.ok(!komorka(czesc("sheet3.xml"), "B6").includes("<f>"), "T1 ma wpisaną wartość");
    for (const { nazwa, plik } of ARKUSZE.slice(1)) {
      assert.ok(komorka(czesc(plik), "B6").includes("'T1'!$B6"), `${nazwa} nie lustrzy T1`);
    }
  });
});
