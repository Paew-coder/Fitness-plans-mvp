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
 */
import { backup, DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SCIEZKA_BAZY } from "../baza/polaczenie.ts";

const ILE_TRZYMAMY = 30;

const domyslny = join(dirname(fileURLToPath(import.meta.url)), "..", "dane", "kopie");
const katalog = resolve(process.argv[2] ?? domyslny);
mkdirSync(katalog, { recursive: true });

const stempel = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const cel = join(katalog, `craftmyplan-${stempel}.db`);

const zrodlo = new DatabaseSync(SCIEZKA_BAZY, { readOnly: true });
await backup(zrodlo, cel);
zrodlo.close();

const rozmiar = (statSync(cel).size / 1024).toFixed(0);
console.log(`\n  Kopia: ${cel}  (${rozmiar} kB)`);

// Sprzątanie: zostają najnowsze, reszta leci.
const kopie = readdirSync(katalog)
  .filter((f) => f.startsWith("craftmyplan-") && f.endsWith(".db"))
  .sort()
  .reverse();
const doUsuniecia = kopie.slice(ILE_TRZYMAMY);
for (const f of doUsuniecia) unlinkSync(join(katalog, f));

console.log(`  W katalogu: ${Math.min(kopie.length, ILE_TRZYMAMY)} kopii`
  + (doUsuniecia.length ? `, usunięto ${doUsuniecia.length} starych` : "") + "\n");
