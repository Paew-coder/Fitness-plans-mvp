#!/usr/bin/env node
/**
 * Sprawdza plan klienta z pliku .xlsx i wypisuje, co jest z nim nie tak.
 *
 *   npm run sprawdz -- "Plan Zuzanna C 3.0.xlsx"
 *
 * Robi trzy rzeczy naraz:
 *   1. przepuszcza plan przez 12 kontroli (11 z zakładki Analiza + powtórki z cyklu),
 *   2. pokazuje obciążenie tydzień po tygodniu z oceną normy,
 *   3. porównuje, czy arkusz liczy to samo co silnik — rozbieżność zwykle znaczy,
 *      że w pliku ktoś skasował formułę.
 *
 * Plik musi być przeliczony przed eksportem, inaczej połowa komórek jest pusta.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { przeliczPlan } from "../src/plan.ts";
import { sprawdzPlan, planGotowyDoWyslania } from "../src/walidacja.ts";
import { porownajZArkuszem } from "../src/porownanie.ts";
import { planZArkusza, nierozpoznaneCwiczenia, type ZrzutArkusza } from "../src/import-arkusza.ts";
import { NORMY, ocenaNormy } from "../src/stres.ts";
import type { Uwaga } from "../src/typy.ts";

const KATALOG = dirname(fileURLToPath(import.meta.url));

function liczba(n: number, miejsca = 1): string {
  return n.toFixed(miejsca).replace(".", ",");
}

function pasek(wartosc: number, maks: number, szerokosc = 12): string {
  if (maks <= 0) return "░".repeat(szerokosc);
  const pelne = Math.round((wartosc / maks) * szerokosc);
  return "█".repeat(pelne) + "░".repeat(Math.max(0, szerokosc - pelne));
}

function naglowek(tytul: string): void {
  console.log(`\n${tytul}`);
  console.log("─".repeat(Math.max(46, tytul.length)));
}

/** Wywołuje ekstraktor w Pythonie i wczytuje wynik. */
function wczytajArkusz(sciezka: string): ZrzutArkusza {
  const katalogTymczasowy = mkdtempSync(join(tmpdir(), "cmp-"));
  const cel = join(katalogTymczasowy, "zrzut.json");
  try {
    execFileSync("python3", [join(KATALOG, "zrzut-arkusza.py"), sciezka, cel], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(readFileSync(cel, "utf-8")) as ZrzutArkusza;
  } finally {
    rmSync(katalogTymczasowy, { recursive: true, force: true });
  }
}

const sciezka = process.argv[2];
if (!sciezka) {
  console.error('Użycie: npm run sprawdz -- "Plan klienta.xlsx"');
  process.exit(1);
}

let zrzut: ZrzutArkusza;
try {
  zrzut = wczytajArkusz(sciezka);
} catch (e) {
  console.error(`Nie udało się wczytać pliku: ${sciezka}`);
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

const plan = planZArkusza(zrzut);
const wynik = przeliczPlan(plan);
const uwagi = sprawdzPlan(plan, wynik);

// ── nagłówek ───────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(56)}`);
console.log(`  ${basename(sciezka)}`);
console.log("═".repeat(56));
const info = uwagi.filter((u) => u.poziom === "info");
const licznik = (kod: string) => info.find((u) => u.kod === kod)?.pozycje[0] ?? "?";
console.log(
  `  ${licznik("DNI_TRENINGOWE")} dni treningowe · ` +
  `${licznik("SLOTY_Z_CWICZENIEM")} ćwiczeń · ` +
  `${licznik("SERIE_MAX_UZUPELNIONE")} serii maksymalnych`,
);
console.log(`  tryb akcesoriów: ${plan.trybAkcesoriow} · część: ${plan.czescPlanu}`);

// ── błędy i ostrzeżenia ────────────────────────────────────────────────
const wypisz = (lista: Uwaga[], znak: string) => {
  for (const u of lista) {
    console.log(`\n  ${znak} ${u.opis} — ${u.pozycje.length}`);
    for (const p of u.pozycje.slice(0, 8)) console.log(`      ${p}`);
    if (u.pozycje.length > 8) console.log(`      … i ${u.pozycje.length - 8} więcej`);
  }
};

const nierozpoznane = nierozpoznaneCwiczenia(zrzut);
const bledy: Uwaga[] = [...uwagi.filter((u) => u.poziom === "blad")];
if (nierozpoznane.length > 0) {
  bledy.unshift({
    kod: "POZA_BAZA",
    poziom: "blad",
    opis: "Ćwiczenie spoza BAZY — arkusz pomija ten slot po cichu",
    pozycje: nierozpoznane.map((n) => `${n.positionId} „${n.nazwa}"`),
  });
}
const ostrzezenia = uwagi.filter((u) => u.poziom === "ostrzezenie");

naglowek("CO BLOKUJE WYSYŁKĘ");
if (bledy.length === 0) console.log("\n  ✓ nic — plan można wysłać klientowi");
else {
  wypisz(bledy, "✗");
  if (nierozpoznane.length > 0) {
    console.log("\n      → taki slot nie dostaje ciężaru ani stresu i nie liczy się");
    console.log("        do objętości. Sprawdź pisownię albo dodaj ćwiczenie do BAZY.");
  }
}

naglowek("DO SPRAWDZENIA");
if (ostrzezenia.length === 0) console.log("\n  ✓ nic");
else wypisz(ostrzezenia, "⚠");

// ── obciążenie ─────────────────────────────────────────────────────────
naglowek("OBCIĄŻENIE TYDZIEŃ PO TYGODNIU");
const dni = wynik.dniTreningowe;
const maks = Math.max(...wynik.tygodnie.map((t) => t.bilans.razem), 0.001);
const norma = dni > 0
  ? `norma ${NORMY.stresTygodniowy[0] * dni}–${NORMY.stresTygodniowy[1] * dni}`
  : "brak dni treningowych";
console.log(`\n  ${norma}\n`);
for (const t of wynik.tygodnie) {
  console.log(
    `  T${t.tydzien}  ${pasek(t.bilans.razem, maks)}  ` +
    `${liczba(t.bilans.razem).padStart(6)}   ${t.ocenaStresu}`,
  );
}

// ── rozkład wzorców ────────────────────────────────────────────────────
naglowek("WZORCE RUCHU — średnia serii z cyklu");
console.log("");
for (const [part, ocena] of Object.entries(wynik.ocenaObjetosci)) {
  const nazwa = wynik.tygodnie[0]!.bilans.wzorce.find((w) => w.part === part)!.nazwa;
  const zakres = NORMY.serie[part as keyof typeof NORMY.serie];
  const opisNormy = dni > 0 ? `${zakres[0] * dni}–${zakres[1] * dni}` : "—";
  console.log(
    `  ${nazwa.padEnd(14)} ${liczba(ocena.srednia).padStart(5)} serii   ` +
    `norma ${opisNormy.padEnd(7)} ${ocena.ocena}`,
  );
}
const b = wynik.tygodnie[0]!.bilans;
if (b.razem > 0) {
  const proc = (x: number) => Math.round((x / b.razem) * 100);
  console.log(
    `\n  dolne / górne         ${proc(b.dolne)}% / ${proc(b.gorne)}%` +
    `\n  centralny / obwodowy  ${Math.round((b.centralny / (b.centralny + b.obwodowy)) * 100)}%` +
    ` / ${Math.round((b.obwodowy / (b.centralny + b.obwodowy)) * 100)}%`,
  );
}

// ── zgodność z arkuszem ────────────────────────────────────────────────
naglowek("CZY ARKUSZ LICZY TO SAMO CO SILNIK");
const p = porownajZArkuszem(zrzut, wynik);
const puste = p.roznice.filter((r) => r.arkuszPusty);
const rozjazdy = p.roznice.filter((r) => !r.arkuszPusty);

console.log(`\n  sprawdzonych wartości: ${p.zgodnych}`);
if (rozjazdy.length === 0 && puste.length === 0) {
  console.log("  ✓ wszystko się zgadza");
} else {
  if (puste.length > 0) {
    console.log(`\n  ⚠ arkusz nie policzył ${puste.length} pozycji, a silnik potrafi:`);
    for (const r of puste.slice(0, 6)) {
      console.log(`      ${r.gdzie} · ${r.pole}: silnik ${r.silnik}`);
    }
    if (puste.length > 6) console.log(`      … i ${puste.length - 6} więcej`);
    console.log("      → najczęściej znaczy skasowaną formułę w pliku");
  }
  if (rozjazdy.length > 0) {
    console.log(`\n  ✗ ${rozjazdy.length} rozbieżności — arkusz i silnik liczą różnie:`);
    for (const r of rozjazdy.slice(0, 8)) {
      console.log(`      ${r.gdzie} · ${r.pole}: arkusz ${r.arkusz}, silnik ${r.silnik}`);
    }
    if (rozjazdy.length > 8) console.log(`      … i ${rozjazdy.length - 8} więcej`);
  }
}

// ── podsumowanie ───────────────────────────────────────────────────────
console.log(`\n${"═".repeat(56)}`);
const gotowy = planGotowyDoWyslania(uwagi) && nierozpoznane.length === 0;
if (puste.length > 0 || rozjazdy.length > 0) {
  console.log(`  ⚠ ARKUSZ DO NAPRAWY — ${puste.length + rozjazdy.length} pozycji`);
}
console.log(
  gotowy
    ? `  ✓ PLAN GOTOWY${ostrzezenia.length > 0 ? ` (${ostrzezenia.length} rzeczy do sprawdzenia)` : ""}`
    : `  ✗ PLAN NIEGOTOWY — ${bledy.length} rzeczy blokuje wysyłkę`,
);
console.log(`${"═".repeat(56)}\n`);

process.exit(gotowy ? 0 : 1);
