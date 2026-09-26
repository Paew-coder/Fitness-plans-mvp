#!/usr/bin/env node
/**
 * Pobranie najnowszej wersji programu — bez ruszania danych klientów.
 *
 *   npm run aktualizuj              # pokazuje, co by się zmieniło
 *   npm run aktualizuj -- --wykonaj # zmienia naprawdę
 *
 * Po co osobne narzędzie, skoro można pobrać ZIP z przeglądarki: bo ZIP
 * rozpakowuje się do **nowego katalogu obok starego**, razem z pustym `dane/`.
 * Klienci zostają w starym katalogu, konsola z nowego wstaje pusta, i jedyne,
 * co stoi między trenerem a utratą pracy, to zdanie w instrukcji, żeby
 * przenieść jeden folder. Tutaj nie ma czego przenosić: program podmienia się
 * w miejscu, a `dane/` nie jest nawet dotykane.
 *
 * Zasady, których to narzędzie pilnuje:
 *   • nie rusza `konsola/dane/` — ani pliku bazy, ani kopii, ani linków;
 *   • nie działa przy uruchomionej konsoli;
 *   • przed podmianą robi kopię bazy;
 *   • niczego nie kasuje — pliki, których nie ma już w paczce, tylko wypisuje.
 */
import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { czytajTar, bezPierwszegoKatalogu } from "../paczka-tar.ts";
import { konsolaChodzi } from "../baza/slad-pracy.ts";
import { zrobKopie, katalogKopii } from "../baza/kopie.ts";
import { powodNieotwarciaBazy } from "../baza/blad-bazy.ts";
import { SCIEZKA_BAZY } from "../baza/sciezka.ts";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const GLOWNY = join(KONSOLA, "..");

const REPO = "Paew-coder/Fitness-plans-mvp";
const GALAZ = process.env.GALAZ_CRAFTMYPLAN ?? "claude/craftmyplan-training-app-hokugh";
const ZRODLO = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${GALAZ}`;

/** Czego nie dotykamy nigdy — tu mieszka praca trenera, nie program. */
const NIETYKALNE = [`konsola${sep}dane`];

const wykonaj = process.argv.includes("--wykonaj");

function chronione(sciezka: string): boolean {
  return NIETYKALNE.some((k) => sciezka === k || sciezka.startsWith(k + sep));
}

/** Wszystkie pliki projektu — do wskazania tych, których paczka już nie ma. */
function pliki(katalog: string, wynik: string[] = []): string[] {
  for (const wpis of readdirSync(katalog, { withFileTypes: true })) {
    const pelna = join(katalog, wpis.name);
    const wzgledna = relative(GLOWNY, pelna);
    if (wpis.name === ".git" || wpis.name === "node_modules" || chronione(wzgledna)) continue;
    if (wpis.isDirectory()) pliki(pelna, wynik);
    else if (wpis.isFile()) wynik.push(wzgledna);
  }
  return wynik;
}

const port = await konsolaChodzi();
if (port !== null) {
  console.error(`\n  Konsola właśnie działa (port ${port}).`);
  console.error("  Zamknij czarne okno i uruchom to jeszcze raz —");
  console.error("  podmiana programu pod pracującą konsolą kończy się źle.\n");
  process.exit(1);
}

console.log(`\n  Pobieram najnowszą wersję…\n  ${ZRODLO}\n`);

let paczka: Buffer;
try {
  const odp = await fetch(ZRODLO);
  if (!odp.ok) {
    console.error(`  GitHub odpowiedział ${odp.status}. Sprawdź połączenie z internetem.\n`);
    process.exit(1);
  }
  paczka = Buffer.from(await odp.arrayBuffer());
} catch (blad) {
  console.error(`  Nie udało się pobrać paczki: ${(blad as Error).message}`);
  console.error("  Sprawdź połączenie z internetem i spróbuj ponownie.\n");
  process.exit(1);
}

const wpisy = czytajTar(gunzipSync(paczka)).filter((w) => !w.katalog);
if (wpisy.length === 0) {
  console.error("  Paczka przyszła pusta — nic nie zmieniam.\n");
  process.exit(1);
}

const nowe: string[] = [];
const zmienione: string[] = [];
const doZapisu: { sciezka: string; tresc: Buffer }[] = [];

for (const wpis of wpisy) {
  const wzgledna = bezPierwszegoKatalogu(wpis.nazwa);
  if (!wzgledna) continue;
  const lokalna = wzgledna.split("/").join(sep);
  if (chronione(lokalna)) continue;

  const pelna = join(GLOWNY, lokalna);
  const istnieje = existsSync(pelna) && statSync(pelna).isFile();
  if (!istnieje) nowe.push(lokalna);
  else if (!readFileSync(pelna).equals(wpis.tresc)) zmienione.push(lokalna);
  else continue;
  doZapisu.push({ sciezka: pelna, tresc: wpis.tresc });
}

const wPaczce = new Set(wpisy
  .map((w) => bezPierwszegoKatalogu(w.nazwa))
  .filter((n): n is string => n !== null)
  .map((n) => n.split("/").join(sep)));
const osierocone = pliki(GLOWNY).filter((p) => !wPaczce.has(p));

const wypisz = (tytul: string, lista: string[]) => {
  if (lista.length === 0) return;
  console.log(`  ${tytul} (${lista.length}):`);
  for (const p of lista.slice(0, 12)) console.log(`    ${p}`);
  if (lista.length > 12) console.log(`    …i jeszcze ${lista.length - 12}`);
  console.log("");
};

wypisz("Nowe pliki", nowe);
wypisz("Zmienione", zmienione);
wypisz("Są u Ciebie, nie ma ich w paczce — zostawiam nietknięte", osierocone);

if (doZapisu.length === 0) {
  console.log("  Masz już najnowszą wersję. Nic do zrobienia.\n");
  process.exit(0);
}

if (!wykonaj) {
  console.log(`  Do podmiany: ${doZapisu.length} ${doZapisu.length === 1 ? "plik" : "plików"}.`);
  console.log("  Nic nie zostało zmienione — to był podgląd.");
  console.log("  Żeby wykonać:  npm run aktualizuj -- --wykonaj\n");
  process.exit(0);
}

/*
 * Kopia bazy przed podmianą. Program da się pobrać jeszcze raz, danych nie.
 *
 * Nieudana kopia nie może jednak zatrzymać aktualizacji ani wysypać narzędzia
 * śladem stosu po angielsku. Uszkodzona baza jest wiadomością samą w sobie —
 * mówimy o niej po polsku i powtarzamy na końcu, bo do naprawy jest osobne
 * narzędzie. Podmiana plików programu i tak nie ma z bazą nic wspólnego:
 * `dane/` nie jest dotykane.
 */
let bladKopii: string | null = null;
try {
  const kopia = await zrobKopie("", katalogKopii());
  console.log(kopia ? `  Kopia bazy: ${kopia}\n` : "  Nie ma jeszcze bazy do skopiowania.\n");
} catch (blad) {
  bladKopii = powodNieotwarciaBazy(blad, SCIEZKA_BAZY);
  console.log(`  Uwaga: nie udało się zrobić kopii bazy.\n  ${bladKopii}\n`);
  console.log("  Aktualizuję mimo to — podmiana programu nie dotyka danych.\n");
}

for (const { sciezka, tresc } of doZapisu) {
  mkdirSync(dirname(sciezka), { recursive: true });
  writeFileSync(sciezka, tresc);
}

console.log(`  Gotowe — podmieniono ${doZapisu.length} ${doZapisu.length === 1 ? "plik" : "plików"}.`);
console.log("  Dane klientów zostały nietknięte.");
console.log("  Uruchom konsolę ponownie, żeby zobaczyć zmiany.\n");
if (bladKopii) {
  console.log("  Zostaje sprawa bazy, o której wyżej — zajmij się nią teraz:");
  console.log("    npm run przywroc\n");
}
