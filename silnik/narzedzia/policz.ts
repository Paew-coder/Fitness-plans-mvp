#!/usr/bin/env node
/**
 * Kalkulator z wiersza poleceń — ta sama matematyka co arkusz, bez otwierania arkusza.
 *
 *   npm run policz -- 1rm 80 5
 *   npm run policz -- ciezar "Barbell bench press" --1rm 100 --powt 8 --rpe 8
 *   npm run policz -- blok "Barbell bench press" --1rm 100 --powt 6 --rpe 7
 *   npm run policz -- szukaj pushdown
 *   npm run policz -- kontrola
 */
import { oblicz1RM, procent1RM } from "../src/rpe.ts";
import { obliczCiezar } from "../src/ciezar.ts";
import { stresSlotu } from "../src/stres.ts";
import { powtorzeniaAkcesorium } from "../src/powtorzenia.ts";
import { katalog } from "../src/katalog.ts";
import type { Cwiczenie, Tydzien } from "../src/typy.ts";

const ARG = process.argv.slice(2);
const polecenie = ARG[0];

function flaga(nazwa: string): number | undefined {
  const i = ARG.indexOf(`--${nazwa}`);
  if (i === -1) return undefined;
  const v = Number(ARG[i + 1]?.replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
}

function pozycyjne(): string[] {
  const wynik: string[] = [];
  for (let i = 1; i < ARG.length; i++) {
    const a = ARG[i]!;
    if (a.startsWith("--")) { i++; continue; }
    wynik.push(a);
  }
  return wynik;
}

function liczba(n: number, miejsca = 1): string {
  return n.toFixed(miejsca).replace(".", ",");
}

function znajdz(fraza: string): Cwiczenie {
  const c = katalog.poId(fraza.toUpperCase()) ?? katalog.poNazwie(fraza);
  if (c) return c;
  const pasujace = katalog.wszystkie.filter((x) =>
    x.nazwa.toLocaleLowerCase("pl").includes(fraza.toLocaleLowerCase("pl")),
  );
  if (pasujace.length === 1) return pasujace[0]!;
  if (pasujace.length === 0) {
    console.error(`Nie znalazłem ćwiczenia: "${fraza}". Spróbuj: policz szukaj ${fraza}`);
    process.exit(1);
  }
  console.error(`Niejednoznaczne "${fraza}" — pasuje ${pasujace.length} pozycji:`);
  for (const p of pasujace.slice(0, 10)) console.error(`  ${p.id}  ${p.nazwa}`);
  process.exit(1);
}

function opisCwiczenia(c: Cwiczenie): string {
  return `${c.id}  ${c.nazwa}\n` +
    `  kategoria ${c.kategoria} · wzorzec ${c.part} · coeff ${liczba(c.coeff, 2)} · ` +
    `skok ${liczba(c.skokKg, 1)} kg · progresja ${c.progresja}` +
    (c.jednostronne ? "\n  ↔ jednostronne — wykonywane osobno na każdą stronę" : "") +
    (c.jednostronneDoPotwierdzenia ? "\n  ↔ wzorzec jednostronny — do potwierdzenia" : "") +
    (c.uwagi ? `\n  ⚠ ${c.uwagi}` : "") +
    (c.film ? "" : "\n  ⚠ brak nagrania");
}

switch (polecenie) {
  case "1rm": {
    const [ciezarStr, powtStr] = pozycyjne();
    const ciezar = Number(ciezarStr?.replace(",", "."));
    const powt = Number(powtStr);
    if (!Number.isFinite(ciezar) || !Number.isFinite(powt)) {
      console.error("Użycie: policz 1rm <ciężar> <powtórzenia>");
      process.exit(1);
    }
    const wynik = oblicz1RM(ciezar, powt);
    if (wynik === null) {
      console.error(`Powtórzenia poza tabelą (obsługiwane 1–15): ${powt}`);
      process.exit(1);
    }
    console.log(`\nSeria maksymalna: ${liczba(ciezar)} kg × ${powt} powt. do odmowy (RPE 10)`);
    console.log(`Twój 1RM: ${liczba(wynik)} kg\n`);
    break;
  }

  case "ciezar": {
    const [fraza] = pozycyjne();
    if (!fraza) {
      console.error('Użycie: policz ciezar "<ćwiczenie>" --1rm N --powt N --rpe N [--serie N]');
      process.exit(1);
    }
    const c = znajdz(fraza);
    const oneRM = flaga("1rm") ?? 0;
    const powt = flaga("powt") ?? 8;
    const rpe = flaga("rpe") ?? 8;
    const serie = flaga("serie") ?? 3;

    const wynik = obliczCiezar({
      tydzien: 1, jestBojemGlownym: false, trybAkcesoriow: "licz z RPE",
      powtorzenia: powt, rpe, skokKg: c.skokKg, progresja: c.progresja, oneRM, mnoznik: 1,
    });
    const stres = stresSlotu({ coeff: c.coeff, serie, rpe, powtorzenia: powt });
    const procent = procent1RM(powt, rpe);

    console.log(`\n${opisCwiczenia(c)}\n`);
    console.log(`  1RM ${liczba(oneRM)} kg · ${serie} × ${powt} powt. · RPE ${liczba(rpe)}`);
    console.log(`  %1RM z tabeli: ${procent === null ? "poza tabelą" : liczba(procent) + "%"}`);
    console.log(`  CIĘŻAR: ${typeof wynik === "number" ? liczba(wynik) + " kg" : wynik}`);
    console.log(`  stres — całkowity ${liczba(stres.calkowity, 2)} · ` +
      `centralny ${liczba(stres.centralny, 2)} · obwodowy ${liczba(stres.obwodowy, 2)}\n`);
    break;
  }

  case "blok": {
    const [fraza] = pozycyjne();
    if (!fraza) {
      console.error('Użycie: policz blok "<ćwiczenie>" --1rm N [--powt N] [--rpe N]');
      process.exit(1);
    }
    const c = znajdz(fraza);
    const oneRM = flaga("1rm") ?? 0;
    const rpe = flaga("rpe") ?? 8;
    const serie = flaga("serie") ?? 3;
    const powtStale = flaga("powt");

    console.log(`\n${opisCwiczenia(c)}\n`);
    console.log(`  1RM ${liczba(oneRM)} kg · tryb akcesoriów: licz z RPE · część: objętość\n`);
    console.log("  tydzień   serie × powt.   RPE    ciężar      stres t/c/p");
    console.log("  " + "─".repeat(62));

    for (const tydzien of [1, 2, 3, 4, 5, 6] as Tydzien[]) {
      const powt = powtStale ?? powtorzeniaAkcesorium({ coeff: c.coeff, czesc: "objętość", tydzien });
      const w = obliczCiezar({
        tydzien, jestBojemGlownym: false, trybAkcesoriow: "licz z RPE",
        powtorzenia: powt, rpe, skokKg: c.skokKg, progresja: c.progresja, oneRM, mnoznik: 1,
      });
      const s = stresSlotu({ coeff: c.coeff, serie, rpe, powtorzenia: powt });
      const ciezar = typeof w === "number" ? `${liczba(w)} kg` : w;
      console.log(
        `  T${tydzien}        ${String(serie).padStart(2)} × ${String(powt).padStart(2)}       ` +
        `${liczba(rpe)}    ${ciezar.padEnd(12)}` +
        `${liczba(s.calkowity, 2)} / ${liczba(s.centralny, 2)} / ${liczba(s.obwodowy, 2)}`,
      );
    }
    console.log("");
    break;
  }

  case "szukaj": {
    const fraza = pozycyjne().join(" ").toLocaleLowerCase("pl");
    const pasujace = fraza
      ? katalog.wszystkie.filter(
          (c) => c.nazwa.toLocaleLowerCase("pl").includes(fraza) ||
                 c.kategoria.toLocaleLowerCase("pl").includes(fraza),
        )
      : katalog.wszystkie;
    console.log(`\nZnaleziono ${pasujace.length} z ${katalog.wszystkie.length}:\n`);
    for (const c of pasujace) {
      console.log(`  ${c.id}  ${c.nazwa.padEnd(34)} ${c.kategoria.padEnd(23)} ` +
        `${c.part}  coeff ${liczba(c.coeff, 2)}  ${c.progresja}${c.film ? "" : "  ⚠ bez filmu"}`);
    }
    console.log("");
    break;
  }

  case "kontrola": {
    const decyzje = katalog.wymagajaceDecyzji();
    const bezFilmu = katalog.bezFilmu();
    console.log(`\nBAZA: ${katalog.wszystkie.length} ćwiczeń\n`);
    console.log(`Wymagają decyzji (${decyzje.length}):`);
    for (const c of decyzje) console.log(`  ${c.id}  ${c.nazwa.padEnd(32)} ${c.uwagi}`);
    console.log(`\nBez nagrania (${bezFilmu.length}):`);
    for (const c of bezFilmu) console.log(`  ${c.id}  ${c.nazwa}`);

    const jedn = katalog.jednostronne();
    const kand = katalog.kandydaciJednostronne();
    console.log(`\nJednostronne (${jedn.length}):`);
    for (const c of jedn) console.log(`  ${c.id}  ${c.nazwa}`);
    if (kand.length > 0) {
      console.log(`\nJednostronne — do potwierdzenia (${kand.length}):`);
      for (const c of kand) console.log(`  ${c.id}  ${c.nazwa}`);
    }
    console.log("");
    break;
  }

  default:
    console.log(`
Kalkulator planów treningowych — silnik MasterTemplate 5.17

  policz 1rm <ciężar> <powtórzenia>
      1RM z serii maksymalnej do odmowy.
      przykład:  policz 1rm 80 5

  policz ciezar "<ćwiczenie>" --1rm N --powt N --rpe N [--serie N]
      Ciężar roboczy i stres dla jednego slotu.
      przykład:  policz ciezar "Barbell bench press" --1rm 100 --powt 8 --rpe 8

  policz blok "<ćwiczenie>" --1rm N [--powt N] [--rpe N] [--serie N]
      Sześć tygodni naraz. Bez --powt powtórzenia liczy automat akcesoriów.
      przykład:  policz blok "Rope pushdown" --1rm 40

  policz szukaj <fraza>
      Wyszukiwanie w bazie po nazwie albo kategorii.

  policz kontrola
      Pozycje wymagające decyzji i ćwiczenia bez nagrania.
`);
    process.exit(polecenie ? 1 : 0);
}
