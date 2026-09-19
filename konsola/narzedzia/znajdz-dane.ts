#!/usr/bin/env node
/**
 * Znajduje bazy z poprzednich paczek i przenosi wybraną tutaj.
 *
 *   npm run znajdz-dane                 # szuka i wypisuje, co znalazł
 *   npm run znajdz-dane -- --wykonaj    # bierze najbogatszą z listy
 *   npm run znajdz-dane -- --wykonaj 2  # bierze drugą z listy
 *
 * Po co to istnieje: aktualizacja przez pobranie ZIP-a zostawia klientów
 * w poprzednim katalogu, a przeniesienie ich ręcznie okazało się drogą przez
 * mękę. Prawdziwy przebieg u trenera: sześć kopii projektu w dwóch różnych
 * miejscach, schowek skasowany po drodze przez skopiowanie ścieżki, folder
 * wklejony sam w siebie jako „dane — kopia", a w bazie `craftmyplan.db`
 * cztery kilobajty przy pliku `-wal` ważącym 1,7 MB. Każdy z tych kroków
 * da się zrobić źle po cichu, a stawką jest praca, której nikt już nie
 * odtworzy.
 *
 * Komputer wie to wszystko lepiej: umie przeszukać dysk, otworzyć każdą
 * znalezioną bazę i powiedzieć, ile w niej jest klientów i kiedy była ostatnio
 * używana. Wybór zostaje przy trenerze, ale szukanie i przenoszenie — nie.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SCIEZKA_BAZY } from "../baza/sciezka.ts";
import { opisz, bladKopii, odlozObecna, PLIKI_OBOK } from "../baza/odtworzenie.ts";
import { konsolaChodzi } from "../baza/slad-pracy.ts";
import { katalogKopii } from "../baza/kopie.ts";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Ile poziomów w głąb schodzimy. Paczka leży zwykle 2–4 katalogi od domu. */
const GLEBOKOSC = 6;
const POMIJAMY = new Set([
  "node_modules", ".git", ".cache", "AppData", "Library", "Windows",
  "Program Files", "Program Files (x86)", "$Recycle.Bin", "System Volume Information",
]);

type Znaleziona = {
  sciezka: string;
  klientow: number;
  planow: number;
  wykonan: number;
  ostatniaZmiana: string | null;
  zmieniony: Date;
};

/** Szuka plików `konsola/dane/craftmyplan.db` — tak wygląda każda instalacja. */
function szukaj(katalog: string, poziom: number, znalezione: string[]): void {
  if (poziom > GLEBOKOSC) return;

  let wpisy;
  try {
    wpisy = readdirSync(katalog, { withFileTypes: true });
  } catch {
    return;   // brak uprawnień albo katalog zniknął — to nie powód do awarii
  }

  for (const wpis of wpisy) {
    if (!wpis.isDirectory() || wpis.name.startsWith(".") || POMIJAMY.has(wpis.name)) continue;
    const pelna = join(katalog, wpis.name);

    if (wpis.name === "dane") {
      const baza = join(pelna, "craftmyplan.db");
      if (existsSync(baza)) znalezione.push(baza);
      continue;   // w `dane` nie ma czego szukać głębiej
    }
    szukaj(pelna, poziom + 1, znalezione);
  }
}

const argWykonaj = process.argv.indexOf("--wykonaj");
const wykonaj = argWykonaj !== -1;
const ktora = wykonaj ? Number(process.argv[argWykonaj + 1] ?? 1) : 0;

console.log("\n  Szukam baz z poprzednich paczek…\n");

/*
 * Gdzie szukamy: katalog domowy i katalog nad projektem — tam lądują paczki
 * z przeglądarki, Pulpit i OneDrive. `KORZENIE_CRAFTMYPLAN` pozwala wskazać
 * inne miejsca (projekt na drugim dysku, pendrive) i tym samym daje testom
 * sposób na przejechanie całej drogi bez dotykania prawdziwego dysku.
 */
const korzenie = [...new Set(
  process.env.KORZENIE_CRAFTMYPLAN
    ? process.env.KORZENIE_CRAFTMYPLAN.split(delimiter).filter(Boolean)
    : [homedir(), resolve(KONSOLA, "..", "..")],
)];
const kandydaci: string[] = [];
for (const korzen of korzenie) szukaj(korzen, 0, kandydaci);

const obecna = resolve(SCIEZKA_BAZY);
const znalezione: Znaleziona[] = [];
for (const sciezka of [...new Set(kandydaci)]) {
  if (resolve(sciezka) === obecna) continue;
  if (bladKopii(sciezka)) continue;   // uszkodzona albo nie-baza — pomijamy
  try {
    const opis = opisz(sciezka);
    if (opis.klientow === 0 && opis.planow === 0) continue;   // pusta, nie ma czego przenosić
    znalezione.push({ ...opis, sciezka, zmieniony: statSync(sciezka).mtime });
  } catch { /* nie da się otworzyć — traktujemy jak brak */ }
}

// Najbogatsza na górze: najpierw plany, potem świeżość.
znalezione.sort((a, b) =>
  b.planow - a.planow || b.zmieniony.getTime() - a.zmieniony.getTime());

if (znalezione.length === 0) {
  console.log("  Nie znalazłem żadnej innej bazy z klientami.");
  console.log(`  Obecna baza: ${obecna}\n`);
  process.exit(0);
}

const dzien = (d: Date) => d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });

znalezione.forEach((z, i) => {
  console.log(`  [${i + 1}] ${z.klientow} ${z.klientow === 1 ? "klient" : "klientów"} · `
    + `${z.planow} ${z.planow === 1 ? "plan" : "planów"} · ${z.wykonan} wykonań`);
  console.log(`      ostatnia praca: ${z.ostatniaZmiana ?? "—"} · plik z ${dzien(z.zmieniony)}`);
  console.log(`      ${z.sciezka}\n`);
});

console.log(`  Tutaj (${obecna}):`);
try {
  const tu = opisz(obecna);
  console.log(`    ${tu.klientow} klientów · ${tu.planow} planów\n`);
} catch {
  console.log("    baza jeszcze nie istnieje\n");
}

if (!wykonaj) {
  console.log("  Nic nie zostało zmienione — to był podgląd.");
  console.log("  Żeby przenieść pierwszą z listy:  npm run znajdz-dane -- --wykonaj");
  console.log("  Inną niż pierwsza:                npm run znajdz-dane -- --wykonaj 2\n");
  process.exit(0);
}

const wybrana = znalezione[ktora - 1];
if (!wybrana) {
  console.error(`  Nie ma pozycji [${ktora}] na liście. Wybierz numer z tej wyżej.\n`);
  process.exit(1);
}

const port = await konsolaChodzi();
if (port !== null) {
  console.error(`  Konsola właśnie działa (port ${port}). Zamknij ją i spróbuj ponownie.\n`);
  process.exit(1);
}

// Obecna baza idzie do kopii, zanim cokolwiek ją przykryje.
const odlozona = await odlozObecna(katalogKopii(), obecna);
console.log(odlozona
  ? `  Dotychczasowa baza odłożona: ${odlozona}\n`
  : "  Nie było tu jeszcze bazy — nie ma czego odkładać.\n");

/*
 * Pliki `-wal` i `-shm` idą razem z bazą i to jest tu sedno. Baza chodzi
 * w trybie WAL: świeże zapisy siedzą obok i trafiają do głównego pliku dopiero
 * co jakiś czas. Skopiowanie samego `.db` potrafi dać stan sprzed tygodnia,
 * i nic tego nie sygnalizuje.
 */
// Katalog `dane` zakłada zwykle konsola przy pierwszym starcie — ale odzysk
// robi się właśnie po to, żeby jej wcześniej nie uruchamiać pustej.
mkdirSync(dirname(obecna), { recursive: true });
copyFileSync(wybrana.sciezka, obecna);
for (const koncowka of PLIKI_OBOK) {
  const zrodlo = wybrana.sciezka + koncowka;
  if (existsSync(zrodlo)) copyFileSync(zrodlo, obecna + koncowka);
}

const po = opisz(obecna);
console.log(`  Gotowe. Tutaj jest teraz ${po.klientow} ${po.klientow === 1 ? "klient" : "klientów"} `
  + `i ${po.planow} ${po.planow === 1 ? "plan" : "planów"}.`);
console.log("  Uruchom konsolę — powinni być na liście.\n");
