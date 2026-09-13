/**
 * Pliki, które trener klika zamiast otwierać terminal.
 *
 * Te cztery pliki są jedynym wejściem do aplikacji dla kogoś, kto nie
 * programuje — i jedynym kodem w projekcie, którego nie da się sprawdzić
 * uruchomieniem na tej maszynie: `.bat` chodzi tylko na Windowsie, a `.command`
 * klika się na Macu. Zostaje więc sprawdzenie tego, co da się sprawdzić
 * z pliku, i akurat to są rzeczy, które psują się po cichu.
 *
 * Każdy przypadek poniżej odpowiada awarii, która kończy się tak samo:
 * dwuklik nie robi nic albo pokazuje krzaki, a trener nie ma jak zgadnąć
 * dlaczego.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GLOWNY = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const NA_MACU = ["Uruchom CraftMyPlan.command", "Dostep z telefonu.command"];
const NA_WINDOWS = ["Uruchom CraftMyPlan.bat", "Dostep z telefonu.bat"];

const tresc = (nazwa: string) => readFileSync(join(GLOWNY, nazwa), "utf-8");

describe("pliki uruchamiające", () => {
  for (const nazwa of NA_MACU) {
    test(`${nazwa}: da się kliknąć`, () => {
      // Plik `.command` bez bitu wykonywalności po dwukliku na Macu nie robi
      // NIC — nie otwiera okna, nie wypisuje błędu, nie mruga. Git ten bit
      // przenosi, więc wystarczy go raz zgubić przy tworzeniu pliku.
      const prawa = statSync(join(GLOWNY, nazwa)).mode & 0o111;
      assert.notEqual(prawa, 0, `${nazwa} nie ma prawa wykonywania`);
    });

    test(`${nazwa}: ma nagłówek powłoki`, () => {
      assert.match(tresc(nazwa), /^#!\/bin\/bash\n/);
    });
  }

  for (const nazwa of NA_WINDOWS) {
    test(`${nazwa}: bez polskich znaków`, () => {
      // Wiersz polecen otwiera sie w stronie kodowej systemu, nie w UTF-8.
      // Polski tekst zapisany w pliku wyglada tam jak "Uruchamiam konsolÄ™" —
      // i akurat w komunikacie o bledzie jest to najmniej pomocne.
      const krzaki = [...tresc(nazwa)].filter((z) => z.charCodeAt(0) > 126);
      assert.deepEqual(krzaki, [], `${nazwa} zawiera znaki spoza ASCII`);
    });

    test(`${nazwa}: nawiasy nie wchodzą w blok if`, () => {
      // `cmd.exe` czyta caly blok `if ... ( ... )` naraz, wiec nawias w tresci
      // komunikatu zamyka blok w polowie. Skutek: bat konczy sie w losowym
      // miejscu, czesto zaraz po "Nie znalazlem katalogu".
      const linie = tresc(nazwa).split(/\r?\n/);
      let wBloku = 0;
      for (const [nr, linia] of linie.entries()) {
        const komentarz = /^\s*rem\b/i.test(linia);
        if (!komentarz && /^\s*echo\s/i.test(linia) && wBloku > 0) {
          assert.ok(!/[()]/.test(linia),
            `${nazwa}:${nr + 1} — nawias w echo wewnątrz bloku if: ${linia.trim()}`);
        }
        if (komentarz) continue;
        if (/\($/.test(linia.trimEnd())) wBloku += 1;
        if (/^\s*\)/.test(linia)) wBloku = Math.max(0, wBloku - 1);
      }
    });
  }

  for (const nazwa of [...NA_MACU, ...NA_WINDOWS]) {
    test(`${nazwa}: szuka konsoli obok siebie`, () => {
      // Plik ma leżeć w głównym katalogu projektu i wchodzić do `konsola`
      // ścieżką liczoną od siebie, nie od katalogu, w którym akurat stoi
      // powłoka. Inaczej dwuklik z pulpitu trafia w nieistniejące miejsce.
      assert.match(tresc(nazwa), /(%~dp0konsola|dirname "\$0"\)\/konsola)/);
    });

    test(`${nazwa}: mówi, czego brakuje, zamiast zniknąć`, () => {
      // Okno, które gaśnie po ułamku sekundy, nie mówi nikomu nic.
      assert.match(tresc(nazwa), /(pause|read -r -p)/);
      assert.match(tresc(nazwa), /nodejs\.org/);
    });
  }
});
