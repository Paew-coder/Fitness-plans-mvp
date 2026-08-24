#!/usr/bin/env node
/**
 * Odtworzenie bazy z kopii zapasowej.
 *
 *   npm run przywroc                          # co mam do wyboru
 *   npm run przywroc -- <plik>                # co się stanie, nic nie zmienia
 *   npm run przywroc -- <plik> --wykonaj      # odtwarza naprawdę
 *
 * Po co osobne narzędzie, skoro to „tylko skopiowanie pliku": bo nie jest.
 * Baza chodzi w trybie WAL i zostawia obok siebie plik ze świeżymi zapisami.
 * Skopiowanie kopii na miejsce bazy z pominięciem tego pliku **po cichu nie
 * robi nic** — SQLite dokleja zostawiony WAL do świeżo wgranego pliku i
 * pokazuje z powrotem stare dane. Tak brzmiała instrukcja w WDROZENIE.md
 * i tak nie działała.
 *
 * Odtwarzanie zdarza się raz na kilka lat, w najgorszym możliwym dniu.
 * Wtedy nikt nie czyta dokumentacji ze zrozumieniem — więc to musi być
 * jedna komenda, która sama pilnuje kolejności.
 */
import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";

import { katalogKopii } from "../baza/kopie.ts";
import { SCIEZKA_BAZY } from "../baza/sciezka.ts";
import {
  BladOdtworzenia, bladKopii, listaKopii, odtworz, opisz, type OpisBazy,
} from "../baza/odtworzenie.ts";
import { konsolaChodzi } from "../baza/slad-pracy.ts";

const WYKONAJ = process.argv.includes("--wykonaj");
const WSKAZANY = process.argv.slice(2).find((a) => !a.startsWith("--"));

const kB = (bajtow: number) => `${Math.max(Math.round(bajtow / 1024), 1)} kB`;
const kiedy = (d: Date) => d.toLocaleString("pl-PL", { dateStyle: "long", timeStyle: "short" });

function wierszOpisu(o: OpisBazy): string {
  const zmiana = o.ostatniaZmiana
    ? `, ostatnia zmiana ${kiedy(new Date(o.ostatniaZmiana))}`
    : "";
  return `${o.klientow} ${o.klientow === 1 ? "klient" : "klientów"}, `
    + `${o.planow} ${o.planow === 1 ? "plan" : "planów"}, `
    + `${o.wykonan} zapisanych serii${zmiana}`;
}

/**
 * Stan obecnej bazy — najpierw pytanie, czy w ogóle da się jej ufać.
 *
 * Bez tego kroku uszkodzony plik wyglądał na **pusty**: SQLite otwiera go bez
 * protestu, a liczenie wierszy wywala się po cichu na każdej tabeli z osobna
 * i wychodzi „0 klientów, 0 planów". To jest zupełnie inne zdanie niż
 * „plik jest uszkodzony" — i dokładnie to drugie trener musi wtedy przeczytać.
 */
function obecna(): { opis: OpisBazy } | { blad: string } | null {
  if (!existsSync(SCIEZKA_BAZY)) return null;
  const blad = bladKopii(SCIEZKA_BAZY);
  if (blad) return { blad };
  try {
    return { opis: opisz(SCIEZKA_BAZY) };
  } catch {
    return { blad: "Nie da się jej przeczytać" };
  }
}

function pokazObecna(): void {
  const stan = obecna();
  console.log(`  Baza teraz: ${SCIEZKA_BAZY}`);
  console.log(stan === null ? "              nie ma jej jeszcze\n"
    : "blad" in stan ? `              ⚠ ${stan.blad}\n`
      : `              ${wierszOpisu(stan.opis)}\n`);
}

function wypiszListe(): never {
  const kopie = listaKopii();
  pokazObecna();

  if (kopie.length === 0) {
    console.log(`  Nie ma żadnych kopii w ${katalogKopii()}.\n`);
    process.exit(1);
  }

  console.log(`  Kopie w ${katalogKopii()} — od najnowszej:\n`);
  for (const k of kopie) {
    const skad = k.plik.includes("-przed-migracja-") ? "  [sprzed aktualizacji]"
      : k.plik.includes("-przed-odtworzeniem-") ? "  [sprzed odtworzenia]" : "";
    console.log(`  ${k.plik}${skad}`);
    console.log(`      ${kiedy(k.kiedy)} · ${kB(k.bajtow)}`);
    console.log(k.blad ? `      ⚠ ${k.blad}` : `      ${wierszOpisu(k.opis!)}`);
    console.log();
  }
  console.log("  Żeby zobaczyć, co da odtworzenie wybranej kopii:");
  console.log(`  npm run przywroc -- ${kopie[0]!.plik}\n`);
  process.exit(0);
}

/** Kopia wskazana samą nazwą leży w katalogu kopii; ścieżkę bierzemy dosłownie. */
function wskazanaSciezka(co: string): string {
  return isAbsolute(co) || co.includes("/") || co.includes("\\")
    ? resolve(co)
    : resolve(katalogKopii(), co);
}

if (!WSKAZANY) wypiszListe();

const zrodlo = wskazanaSciezka(WSKAZANY);
const blad = bladKopii(zrodlo);
if (blad) {
  console.error(`\n  ✗ ${basename(zrodlo)}: ${blad}\n`);
  console.error("  Listę kopii, które da się odtworzyć, pokaże:  npm run przywroc\n");
  process.exit(1);
}

const wKopii = opisz(zrodlo);
const stanObecnej = obecna();
const teraz = stanObecnej && "opis" in stanObecnej ? stanObecnej.opis : null;

console.log(`\n  Kopia:  ${zrodlo}`);
console.log(`          ${kiedy(statSync(zrodlo).mtime)} · ${kB(statSync(zrodlo).size)}`);
console.log(`          ${wierszOpisu(wKopii)}\n`);
pokazObecna();

// Różnica wprost, a nie do policzenia z dwóch akapitów. To jedyna liczba,
// która przy odtwarzaniu naprawdę interesuje: ile pracy zniknie.
if (stanObecnej && "blad" in stanObecnej) {
  // Odtwarzanie na uszkodzonej bazie to najczęstszy powód, dla którego ktoś
  // w ogóle po to narzędzie sięga. Porównywanie liczb nie ma tu sensu.
  console.log("  Obecnej bazy nie da się przeczytać — odtworzenie jest jedyną drogą.");
  console.log("  Zostanie odłożona obok, taka jaka jest.\n");
} else if (teraz) {
  const ubytek = teraz.planow - wKopii.planow;
  const ubytekKlientow = teraz.klientow - wKopii.klientow;
  console.log(ubytek > 0 || ubytekKlientow > 0
    ? `  ⚠ Po odtworzeniu zniknie: ${ubytek > 0 ? `${ubytek} planów` : ""}`
      + `${ubytek > 0 && ubytekKlientow > 0 ? " i " : ""}`
      + `${ubytekKlientow > 0 ? `${ubytekKlientow} klientów` : ""}.\n`
    : "  Kopia jest nie starsza od obecnej bazy — nic nie powinno zniknąć.\n");
}

if (!WYKONAJ) {
  console.log("  To był podgląd — nic nie zostało zmienione.");
  console.log("  Zatrzymaj konsolę, a potem dopisz na końcu:  --wykonaj\n");
  process.exit(0);
}

// Odtwarzanie pod działającym serwerem daje najgorszy możliwy wynik: serwer
// trzyma otwarte połączenie ze starym plikiem i przy pierwszym zapisie
// przywraca to, co przed chwilą zostało nadpisane.
const naPorcie = await konsolaChodzi();
if (naPorcie !== null) {
  console.error(`\n  ✗ Konsola jest uruchomiona (port ${naPorcie}). Zatrzymaj ją i spróbuj jeszcze raz.`);
  console.error("      w oknie z konsolą: Ctrl+C");
  console.error("      w Dockerze:        docker compose stop konsola\n");
  process.exit(1);
}

try {
  const wynik = await odtworz(zrodlo);
  console.log("  ✓ Odtworzone.\n");
  console.log(`  W bazie: ${wierszOpisu(wynik.opis)}`);
  if (wynik.odlozona) {
    console.log(`  Poprzednia baza odłożona: ${wynik.odlozona}`);
    console.log("  (gdyby to była nie ta kopia — odtwórz z tego pliku)");
  }
  if (wynik.usunieteObok.length) {
    console.log(`  Skasowane pliki obok bazy: ${wynik.usunieteObok.join(", ")}`);
  }
  console.log("\n  Możesz uruchomić konsolę.\n");
} catch (e) {
  console.error(`\n  ✗ ${e instanceof BladOdtworzenia ? e.message : String(e)}\n`);
  process.exit(1);
}
