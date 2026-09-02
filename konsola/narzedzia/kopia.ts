#!/usr/bin/env node
/**
 * Kopia zapasowa bazy.
 *
 *   npm run kopia                    # do konsola/dane/kopie/
 *   npm run kopia -- /sciezka/gdzies # gdzie indziej, np. na Dysk
 *
 * Dlaczego nie zwykłe skopiowanie pliku: baza chodzi w trybie WAL, więc
 * część świeżych zapisów siedzi w pliku obok głównego. Skopiowanie samego
 * `.db` w trakcie pracy daje plik, który może się nie otworzyć — albo,
 * gorzej, otworzy się bez ostatnich treningów. `backup()` z `node:sqlite`
 * robi to poprawnie na działającej bazie.
 *
 * Stare kopie kasują się same; zostaje ostatnie ILE_TRZYMAMY.
 *
 * Serwer robi to samo sam raz na dobę i przed każdą migracją — to narzędzie
 * jest do kopii na żądanie, na przykład na pendrive albo na Dysk.
 */
import { statSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { ILE_TRZYMAMY, katalogKopii, zrobKopie } from "../baza/kopie.ts";

const katalog = resolve(process.argv[2] ?? katalogKopii());
const cel = await zrobKopie("", katalog);

if (!cel) {
  console.log("\n  Nie ma jeszcze bazy do skopiowania.\n");
  process.exit(0);
}

const rozmiar = (statSync(cel).size / 1024).toFixed(0);
const ile = readdirSync(katalog).filter((f) => f.startsWith("craftmyplan-") && f.endsWith(".db")).length;
console.log(`\n  Kopia: ${cel}  (${rozmiar} kB)`);
console.log(`  W katalogu: ${ile} ${ile === 1 ? "kopia" : "kopii"} (trzymamy ${ILE_TRZYMAMY})\n`);
