#!/usr/bin/env node
/**
 * Wczytanie całego katalogu arkuszy — przeprowadzka z plików do aplikacji.
 *
 *   npm run wczytaj-arkusze -- ~/Plany            # podgląd, nic nie zapisuje
 *   npm run wczytaj-arkusze -- ~/Plany --wykonaj  # wczytuje naprawdę
 *
 * Po co: dotychczasowe plany klientów leżą w plikach `.xlsx`, po jednym na
 * cykl. Wczytywanie ich pojedynczo z ekranu — z ręcznym wpisywaniem nazwiska
 * i numeru cyklu przy każdym — to przy kilkunastu klientach godzina klikania,
 * czyli dokładnie ta przeszkoda, przez którą przeprowadzka się nie odbywa.
 *
 * Nazwisko i numer cyklu biorą się z nazwy pliku, bo tak są nazywane:
 * `Zuzanna C 4.0.xlsx` → klient „Zuzanna C", cykl 4. Rozpoznawane jest też
 * `Plan Zuzanna C 4.0.xlsx` i wersja bez `.0`.
 *
 * **Domyślnie nic nie zapisuje.** Pokazuje, co by zrobił, i dopiero po
 * `--wykonaj` robi to naprawdę. Przy operacji, która dotyka wszystkich danych
 * naraz, zobaczenie listy przed jej wykonaniem jest warte jednej komendy więcej.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import * as magazyn from "../magazyn.ts";
import { trenerDomyslny } from "../baza/polaczenie.ts";
import { BladArkusza, wczytajPlanZArkusza } from "../wczytaj-arkusz.ts";

const WYKONAJ = process.argv.includes("--wykonaj");
const KATALOG = process.argv.slice(2).find((a) => !a.startsWith("--"));

type Znaleziony = { plik: string; klient: string; wersja: number };

/**
 * Nazwisko i cykl z nazwy pliku.
 *
 * Wzorzec jest celowo wąski: wolę powiedzieć „nie rozumiem tej nazwy" niż
 * zgadnąć źle i założyć klienta o nazwisku „Kopia (2)".
 */
export function zNazwyPliku(nazwa: string): { klient: string; wersja: number } | null {
  // Najpierw obcinamy spacje, potem rozszerzenie — odwrotna kolejność
  // gubiła nazwy ze spacją na końcu, bo wzorzec `.xlsx$` wtedy nie trafia.
  const bez = basename(nazwa.trim()).trim().replace(/\.xlsx$/i, "").trim();
  // „Plan " na początku bywa w nazwach eksportów; nie należy do nazwiska.
  const bezPrzedrostka = bez.replace(/^plan\s+/i, "");
  const m = bezPrzedrostka.match(/^(.+?)\s+(\d{1,3})(?:\.0)?$/);
  if (!m) return null;
  const klient = m[1]!.trim();
  const wersja = Number(m[2]);
  if (!klient || !(wersja >= 1 && wersja <= 999)) return null;
  return { klient, wersja };
}

function znajdz(katalog: string): { rozpoznane: Znaleziony[]; pominiete: string[] } {
  const rozpoznane: Znaleziony[] = [];
  const pominiete: string[] = [];

  for (const wpis of readdirSync(katalog).sort()) {
    const pelna = join(katalog, wpis);
    if (!statSync(pelna).isFile() || !/\.xlsx$/i.test(wpis)) continue;
    // Pliki tymczasowe Excela — otwarty skoroszyt zostawia obok siebie `~$…`.
    if (wpis.startsWith("~$")) continue;

    const rozpoznanie = zNazwyPliku(wpis);
    if (rozpoznanie) rozpoznane.push({ plik: pelna, ...rozpoznanie });
    else pominiete.push(wpis);
  }

  // Kolejność ma znaczenie: cykle jednego klienta muszą wejść po kolei, żeby
  // każdy wskazywał poprzedni. Bez tego znika ostrzeżenie o powtórkach ćwiczeń
  // i propozycja 1RM z poprzedniego cyklu.
  rozpoznane.sort((a, b) =>
    a.klient.localeCompare(b.klient, "pl") || a.wersja - b.wersja);
  return { rozpoznane, pominiete };
}

/**
 * Program uruchamia się tylko wtedy, gdy plik został wywołany wprost.
 * Przy imporcie (np. z testu składni albo testu odczytu nazw) ma milczeć —
 * inaczej sam sobie kończył proces na braku argumentu z katalogiem.
 */
function jestemGlowny(): boolean {
  return process.argv[1] !== undefined
    && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function main(): never {
  if (!KATALOG) {
    console.error("Użycie: npm run wczytaj-arkusze -- <katalog> [--wykonaj]");
    process.exit(1);
  }

  const katalog = resolve(KATALOG);
  const { rozpoznane, pominiete } = znajdz(katalog);

  console.log(`\n  Katalog: ${katalog}`);
  console.log(`  Arkuszy rozpoznanych: ${rozpoznane.length}`
    + (pominiete.length ? `, pominiętych: ${pominiete.length}` : "") + "\n");

  for (const p of pominiete) {
    console.log(`  ? ${p}`);
    console.log("      nie umiem odczytać nazwiska i cyklu z tej nazwy — pomijam");
  }
  if (pominiete.length) {
    console.log('\n      Oczekiwany wzór: „Nazwisko 4.0.xlsx" albo „Nazwisko 4.xlsx".\n');
  }

  if (rozpoznane.length === 0) {
    console.log("  Nie ma czego wczytywać.\n");
    process.exit(pominiete.length ? 1 : 0);
  }

  const trenerId = trenerDomyslny();
  let wczytanych = 0;
  let pominietychIstniejacych = 0;
  let bledow = 0;
  /** Ostatni wczytany cykl klienta — do połączenia go z następnym. */
  const poprzedniCykl = new Map<string, string>();

  for (const { plik, klient, wersja } of rozpoznane) {
    const id = magazyn.nowyId(klient, wersja);
    const etykieta = `${klient} ${wersja}.0`;

    if (magazyn.wczytaj(trenerId, id)) {
      console.log(`  • ${etykieta.padEnd(28)} już jest w bazie — pomijam`);
      poprzedniCykl.set(klient, id);
      pominietychIstniejacych++;
      continue;
    }

    if (!WYKONAJ) {
      console.log(`  + ${etykieta.padEnd(28)} ${basename(plik)}`);
      poprzedniCykl.set(klient, id);
      continue;
    }

    try {
      const wynik = wczytajPlanZArkusza({
        zawartosc: readFileSync(plik),
        trenerId, klient, wersja,
        poprzedniId: poprzedniCykl.get(klient),
      });
      const zCwiczeniem = wynik.zapisany.plan.sloty.filter((s) => s.cwiczenieId).length;
      console.log(`  ✓ ${etykieta.padEnd(28)} ${zCwiczeniem} pozycji`
        + (wynik.nierozpoznane.length
          ? `, ${wynik.nierozpoznane.length} ćwiczeń nierozpoznanych` : ""));
      for (const n of wynik.nierozpoznane) {
        console.log(`      ⚠ ${n.positionId}: „${n.nazwa}” — slot został pusty`);
      }
      poprzedniCykl.set(klient, wynik.zapisany.id);
      wczytanych++;
    } catch (e) {
      console.log(`  ✗ ${etykieta.padEnd(28)} ${e instanceof BladArkusza ? e.message : String(e)}`);
      bledow++;
    }
  }

  console.log();
  if (!WYKONAJ) {
    console.log("  To był podgląd — nic nie zostało zapisane.");
    console.log("  Żeby wczytać naprawdę, dopisz na końcu:  --wykonaj\n");
  } else {
    const klientow = new Set(rozpoznane.map((r) => r.klient)).size;
    console.log(`  Wczytanych: ${wczytanych} (${klientow} klientów)`
      + (pominietychIstniejacych ? `, pominiętych: ${pominietychIstniejacych}` : "")
      + (bledow ? `, błędów: ${bledow}` : ""));
    console.log("  Wszystkie plany wchodzą jako szkice — żaden nie jest widoczny");
    console.log("  dla klienta, dopóki nie przestawisz statusu na „wysłany”.\n");
  }

  process.exit(bledow > 0 ? 1 : 0);
}

if (jestemGlowny()) main();
