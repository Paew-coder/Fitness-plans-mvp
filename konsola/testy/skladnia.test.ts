/**
 * Czy wszystkie źródła w ogóle się parsują.
 *
 * Powód jest konkretny i powtarzalny: w polskich komunikatach używamy cudzysłowu
 * „…”, a prosty znak `"` w środku łańcucha ograniczonego `"` **zamyka go**.
 * Zdanie w rodzaju `"użyj „Połącz z innym klientem" — historia zostanie"`
 * wygląda niewinnie i wywala parser. Trafiło się to w tym projekcie trzy razy,
 * za każdym razem kończąc się serwerem, który się nie uruchamia.
 *
 * Zwykłe testy tego nie łapią, bo nie importują wszystkiego — `serwer.ts`
 * przy imporcie postawiłby nasłuch. Dlatego parsujemy pliki bez wykonywania.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stripTypeScriptTypes } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const SILNIK = join(KONSOLA, "..", "silnik", "src");
const POMIJANE = new Set(["node_modules", "dane", ".git"]);

const zrodlo = (sciezka: string) => readFileSync(join(KONSOLA, sciezka), "utf-8");

function zrodla(katalog: string): string[] {
  return readdirSync(katalog).flatMap((wpis) => {
    if (POMIJANE.has(wpis)) return [];
    const pelna = join(katalog, wpis);
    if (statSync(pelna).isDirectory()) return zrodla(pelna);
    return [".ts", ".js"].includes(extname(pelna)) ? [pelna] : [];
  });
}

describe("składnia — każdy plik da się sparsować", () => {
  const pliki = [...zrodla(KONSOLA), ...zrodla(SILNIK)];

  test("znaleziono pliki do sprawdzenia", () => {
    assert.ok(pliki.length > 25, `tylko ${pliki.length} plików — coś nie tak ze skanowaniem`);
  });

  for (const plik of pliki) {
    const nazwa = relative(join(KONSOLA, ".."), plik);
    test(nazwa, () => {
      const kod = readFileSync(plik, "utf-8");
      // `stripTypeScriptTypes` parsuje plik i wywala się na błędzie składni,
      // ale niczego nie wykonuje — czyli sprawdza też `serwer.ts`, którego
      // zwykły import postawiłby nasłuch na porcie.
      assert.doesNotThrow(() => {
        if (extname(plik) === ".ts") stripTypeScriptTypes(kod);
        else new Function(kod);   // moduły klienta: sam parser, bez uruchamiania
      });
    });
  }
});

describe("HTML — przycisk nie może stać w <label>", () => {
  /**
   * Kliknięcie w `<label>` uruchamia jego kontrolkę, a kontrolką jest pierwszy
   * element formularza w środku. Grupa przycisków w labelu znaczy więc, że
   * **każde kliknięcie trafia w pierwszy przycisk**.
   *
   * Tak było z zakładkami tygodni: siedziały w `<label>Tydzień …</label>`,
   * więc klik w „T4" wracał natychmiast na „T1". Przełączanie tygodni nie
   * działało wcale, a ekran planu istnieje właśnie po to, żeby ustawiać sześć
   * tygodni parametrów. Nie widać tego z kodu JavaScriptu — handler jest
   * poprawny i nawet się uruchamia.
   */
  for (const plik of ["public/index.html", "public/klient/index.html", "public/logowanie.html"]) {
    test(plik, () => {
      // Komentarze wycinamy: opis tej właśnie pułapki zawiera słowo <label>
      // i bez tego test wykrywałby sam siebie.
      const html = zrodlo(plik).replace(/<!--[\s\S]*?-->/g, "");
      const etykiety = [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)];
      const zPrzyciskiem = etykiety
        .map((m) => m[1] ?? "")
        .filter((wnetrze) => /<button\b/.test(wnetrze));

      assert.deepEqual(zPrzyciskiem, [],
        "przenieś grupę przycisków do <div class=\"pole\"> z <span class=\"etykieta-pola\">");
    });
  }
});

describe("składnia — pułapka polskiego cudzysłowu", () => {
  test("wykrywa prosty cudzysłów zamykający łańcuch przedwcześnie", () => {
    // Ten sam kształt, który trzy razy zepsuł serwer. Gdyby `stripTypeScriptTypes`
    // przestało się na tym wywalać, powyższy test przestałby cokolwiek chronić.
    const pulapka = 'const x = "użyj „Połącz" — historia zostanie zachowana";';
    assert.throws(() => stripTypeScriptTypes(pulapka));

    const poprawnie = 'const x = "użyj „Połącz” — historia zostanie zachowana";';
    assert.doesNotThrow(() => stripTypeScriptTypes(poprawnie));
  });
});
