/**
 * Ćwiczenia, przy których seria maksymalna nic nie policzy.
 *
 * Zgłoszone z używania: trener wpisał serię maksymalną przy „SLDL balance"
 * i przy „Dead bug izo + OH", a w kolumnie ciężaru zobaczył „ręczne ustawienie"
 * i „masa ciała". Wszystko działało zgodnie z BAZĄ — tylko nikt nigdzie nie
 * napisał, dlaczego. Z drugiej strony ekranu wygląda to jak awaria.
 *
 * Powody muszą być w dwóch miejscach naraz: w silniku (stąd bierze je serwer
 * dla aplikacji klienta) i w `public/app.js` (konsola nie importuje modułów
 * silnika, bo chodzi w przeglądarce bez zaplecza budującego). Dwa miejsca
 * znaczą jedno ryzyko — że się rozjadą — i ten plik jest po to, żeby się nie
 * rozjechały po cichu.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { dlaczegoBezSeriiMaksymalnej, seriaMaksymalnaMaSens }
  from "../../silnik/src/seria-maksymalna.ts";
import { PROGRESJE_BEZ_CIEZARU } from "../../silnik/src/typy.ts";
import { POWT_MAX } from "../../silnik/src/rpe.ts";
import { katalog } from "../../silnik/src/katalog.ts";

const KATALOG = dirname(fileURLToPath(import.meta.url));
const zrodlo = (sciezka: string) => readFileSync(join(KATALOG, "..", sciezka), "utf-8");

describe("kiedy seria maksymalna ma sens", () => {
  test("progresje liczące ciężar biorą serię maksymalną", () => {
    for (const p of ["kg", "asysta", "dodatkowy ciężar"] as const) {
      assert.equal(seriaMaksymalnaMaSens(p), true, p);
      assert.equal(dlaczegoBezSeriiMaksymalnej(p), null, p);
    }
  });

  test("każda progresja bez ciężaru ma napisane, dlaczego", () => {
    // Lista progresji bez ciężaru jest w `typy.ts` i to ona rządzi. Gdyby
    // doszła nowa, ten test przypomni, że trzeba ją opisać — inaczej klient
    // zobaczyłby puste pola bez słowa wyjaśnienia.
    for (const p of PROGRESJE_BEZ_CIEZARU) {
      const powod = dlaczegoBezSeriiMaksymalnej(p);
      assert.ok(powod, `progresja „${p}" nie ma wyjaśnienia`);
      assert.ok(powod!.length > 25, `wyjaśnienie dla „${p}" jest za krótkie: ${powod}`);
    }
  });

  test("dotyczy 25 ćwiczeń ze 165 — nie jest to margines", () => {
    const bez = katalog.wszystkie.filter((c) => !seriaMaksymalnaMaSens(c.progresja));
    assert.equal(bez.length, 25);
    // Dokładnie te dwa, na których trener się potknął.
    assert.ok(bez.some((c) => c.nazwa === "SLDL balance"));
    assert.ok(bez.some((c) => c.nazwa === "Dead bug izo + OH"));
  });
});

describe("to samo zdanie w silniku i w przeglądarce", () => {
  test("konsola powtarza powody co do znaku", () => {
    const app = zrodlo("public/app.js");
    for (const p of PROGRESJE_BEZ_CIEZARU) {
      const powod = dlaczegoBezSeriiMaksymalnej(p)!;
      assert.ok(app.includes(`"${p}": "${powod}"`),
        `w public/app.js nie ma powodu dla „${p}" albo brzmi inaczej niż w silniku:\n  ${powod}`);
    }
  });

  test("granica powtórzeń jest wszędzie ta sama", () => {
    assert.equal(POWT_MAX, 15);
    for (const plik of ["public/app.js", "public/klient/app.js"]) {
      const tresc = zrodlo(plik);
      const m = tresc.match(/const MAKS_POWTORZEN(?:_SERII)? = (\d+);/);
      assert.ok(m, `${plik} nie ma stałej z granicą powtórzeń`);
      assert.equal(Number(m![1]), POWT_MAX, plik);
    }
  });
});
