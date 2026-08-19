/**
 * Tryb offline aplikacji klienta — umowa między trzema plikami.
 *
 * Test czyta źródła, a nie zachowanie, i to jest świadomy wybór: prawdziwe
 * sprawdzenie wymaga przeglądarki z service workerem, a błąd, po którym ten
 * plik powstał, polegał właśnie na **rozjeździe między plikami**, nie na złej
 * logice w żadnym z nich.
 *
 * Co się stało: worker leży w `/klient/`, więc rejestrował się z domyślnym
 * zakresem `/klient/`. Klient otwiera `/k/<token>` — adres spoza tego zakresu.
 * Worker instalował się poprawnie i **nigdy nie przejmował strony**, którą
 * klient faktycznie otwiera. Tryb offline, reklamowany jako „działa bez
 * zasięgu", nie działał wcale: bez sieci przeglądarka pokazywała własny błąd,
 * a zapisanego lokalnie planu nie miał kto odczytać.
 *
 * Naprawa wymaga zgody trzech miejsc naraz — i to pilnują poniższe testy.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const zrodlo = (sciezka: string) => readFileSync(join(KONSOLA, sciezka), "utf-8");

describe("offline klienta — zakres service workera", () => {
  test("aplikacja rejestruje workera z zakresu korzenia", () => {
    const app = zrodlo("public/klient/app.js");
    const rejestracja = app.match(/serviceWorker\.register\([^)]*\)/s)?.[0] ?? "";
    assert.match(rejestracja, /["']\/klient\/sw\.js["']/, "worker leży w /klient/");
    assert.match(rejestracja, /scope:\s*["']\/["']/,
      "bez jawnego zakresu worker nie obejmuje /k/<token>, czyli adresu klienta");
  });

  test("serwer pozwala workerowi na szerszy zakres", () => {
    const serwer = zrodlo("serwer.ts");
    assert.match(serwer, /service-worker-allowed/i,
      "przeglądarka odrzuci zakres '/' bez zgody serwera");
    assert.match(serwer, /\/klient\/sw\.js/,
      "nagłówek ma dotyczyć wyłącznie pliku workera");
  });

  test("worker nie dotyka adresów konsoli trenera", () => {
    const sw = zrodlo("public/klient/sw.js");
    // Zakres "/" obejmuje też konsolę — gdyby worker serwował ją ze swojego
    // cache, trener dostałby aplikację klienta zamiast swojego ekranu.
    assert.match(sw, /startsWith\("\/k\/"\)/);
    assert.match(sw, /startsWith\("\/klient\/"\)/);
    assert.match(sw, /if \(!nasze\(url\.pathname\)\) return;/,
      "wszystko poza aplikacją klienta ma iść do sieci normalną drogą");
  });

  test("szkielet zawiera samą stronę, nie tylko style i skrypt", () => {
    const sw = zrodlo("public/klient/sw.js");
    const szkielet = sw.match(/const SZKIELET = \[[^\]]*\]/s)?.[0] ?? "";
    for (const plik of ["/klient/index.html", "/klient/style.css", "/klient/app.js"]) {
      assert.ok(szkielet.includes(plik), `${plik} musi być w szkielecie`);
    }
  });

  test("wersja cache jest podbita przy zmianie szkieletu", () => {
    // Nie sprawdzamy konkretnego numeru — tylko tego, że stała istnieje
    // i że aktywacja kasuje wszystko, co do niej nie należy.
    const sw = zrodlo("public/klient/sw.js");
    assert.match(sw, /const CACHE = "trening-v\d+"/);
    assert.match(sw, /caches\.delete/, "stare cache mają znikać przy aktywacji");
    assert.match(sw, /clients\.claim/, "worker ma przejmować stronę od razu");
  });
});
