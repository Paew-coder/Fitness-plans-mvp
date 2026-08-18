#!/usr/bin/env node
/**
 * Przenosi plany z plików JSON (faza 1) do bazy SQLite.
 *
 *   node narzedzia/migruj-do-bazy.ts
 *
 * Nic nie kasuje — pliki zostają tam, gdzie były. Uruchomienie drugi raz
 * nadpisze plany w bazie tą samą treścią, więc jest bezpieczne.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as magazyn from "../magazyn.ts";
import { trenerDomyslny } from "../baza/polaczenie.ts";

const KATALOG_JSON = join(dirname(fileURLToPath(import.meta.url)), "..", "dane", "plany");

if (!existsSync(KATALOG_JSON)) {
  console.log("Nie ma katalogu z plikami JSON — nie ma czego przenosić.");
  process.exit(0);
}

const pliki = readdirSync(KATALOG_JSON).filter((f) => f.endsWith(".json"));
if (pliki.length === 0) {
  console.log("Katalog pusty — nie ma czego przenosić.");
  process.exit(0);
}

const trener = trenerDomyslny();
let przeniesionych = 0;
/** Data ostatniego planu, z którego wzięliśmy token dla danego klienta. */
const najswiezszy = new Map<string, string>();

for (const plik of pliki) {
  const stary = JSON.parse(readFileSync(join(KATALOG_JSON, plik), "utf-8"));

  // W plikach JSON klient był tekstem, a token i waga wisiały przy planie.
  // Dziś klient jest encją i to do niego należy jedno i drugie.
  const klient = magazyn.zapewnijKlienta(trener, stary.klient);
  const zapisany = magazyn.zapisz({
    ...stary,
    trenerId: trener,
    klientId: klient.id,
    klient: klient.nazwa,
    // Daty z pliku muszą przetrwać — inaczej „ostatnia aktywność" i tydzień
    // cyklu policzyłyby się od dnia migracji.
    utworzony: stary.utworzony,
    zmieniony: stary.zmieniony,
  });

  // Token z najnowszego planu wygrywa — to ten link klient ma w telefonie.
  if (stary.token && (!klient.token || stary.zmieniony >= (najswiezszy.get(klient.id) ?? ""))) {
    magazyn.zapiszKlienta({ ...klient, token: stary.token });
    najswiezszy.set(klient.id, stary.zmieniony);
  }

  for (const pomiar of stary.waga ?? []) {
    magazyn.zapiszWage(trener, klient.id, pomiar.data, pomiar.kg);
  }

  przeniesionych++;
  console.log(`  ${zapisany.klient} ${zapisany.wersja}.0`);
}

// Zmienione daty: zapisz() zawsze stempluje `zmieniony` na teraz, więc
// przywracamy je osobno.
const { baza } = await import("../baza/polaczenie.ts");
const przywroc = baza().prepare("UPDATE plan SET zmieniony = ? WHERE trener_id = ? AND id = ?");
for (const plik of pliki) {
  const stary = JSON.parse(readFileSync(join(KATALOG_JSON, plik), "utf-8"));
  przywroc.run(stary.zmieniony, trener, stary.id);
}

console.log(`\nPrzeniesionych planów: ${przeniesionych}`);
console.log("Pliki JSON zostały nietknięte — możesz je usunąć, gdy sprawdzisz, że wszystko gra.");
