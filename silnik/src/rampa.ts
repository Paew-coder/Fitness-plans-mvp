/**
 * Rozgrzewka rampą — kilka serii z rosnącym ciężarem przed pierwszą ciężką
 * serią ćwiczenia.
 *
 * Trener, 02.10.2026: „przy ćwiczeniach głównych / złożonych, zarówno gdy
 * zaczynają się serią, jak i TOP SETEM, nie powinna być informacja, żeby
 * zrobić rozgrzewkę stopniowo, zakładając coraz większy ciężar?”. Wybrał
 * wariant z wyliczonymi ciężarami.
 *
 * **Kiedy:** ćwiczenie z progresją w kilogramach i jedno z trojga — TOP SET
 * przy nim, bój główny (reguła `bojGlownySlotu` albo „S” trenera) albo
 * ćwiczenie złożone z BAZY (coeff 1,0). Tylko przy pierwszym wystąpieniu
 * ćwiczenia w dniu.
 *
 * **Do czego:** do pierwszej ciężkiej serii — TOP SETU, a bez niego pierwszej
 * serii roboczej.
 *
 * **Schemat** (zatwierdzony przez trenera): lekko × 8–10, potem 50 % × 5,
 * 70 % × 3 i 85 % × 1 ciężaru docelowego, zaokrąglone do skoku ćwiczenia.
 * Krok, który po zaokrągleniu nie rośnie albo dochodzi do ciężaru
 * docelowego, odpada — przy lekkim celu rampa jest po prostu krótsza.
 *
 * Serie rampy się nie zapisują i nie liczą do objętości — to instrukcja.
 */
import { SKOK_MINIMALNY } from "./ciezar.ts";
import { mround } from "./pomocnicze.ts";
import type { Coeff, Progresja } from "./typy.ts";

export type KrokRampy = {
  /** `null` — pierwszy krok, „lekko” (pusta sztanga albo lekki ciężar). */
  ciezar: number | null;
  powtorzenia: string;
};

export const SCHEMAT_RAMPY: readonly { procent: number | null; powtorzenia: string }[] = [
  { procent: null, powtorzenia: "8–10" },
  { procent: 50, powtorzenia: "5" },
  { procent: 70, powtorzenia: "3" },
  { procent: 85, powtorzenia: "1" },
];

/** Czy przed tym ćwiczeniem stoi rampa. */
export function potrzebaRampy(a: {
  progresja: Progresja;
  coeff: Coeff;
  bojGlowny: boolean;
  bojSilowy?: boolean;
  maTopSet: boolean;
}): boolean {
  if (a.progresja !== "kg") return false;
  return a.maTopSet || a.bojGlowny || !!a.bojSilowy || a.coeff === 1;
}

/**
 * Kroki rampy do ciężaru `cel`. Bez celu (klient dopiero dobiera ciężar)
 * zostaje sam pierwszy krok — resztę telefon opisuje słowami.
 */
export function krokiRampy(cel: number | null, skokKg: number): KrokRampy[] {
  const kroki: KrokRampy[] = [{ ciezar: null, powtorzenia: SCHEMAT_RAMPY[0]!.powtorzenia }];
  if (cel === null || !(cel > 0)) return kroki;
  const skok = Math.max(skokKg, SKOK_MINIMALNY);
  let poprzedni = 0;
  for (const { procent, powtorzenia } of SCHEMAT_RAMPY.slice(1)) {
    const ciezar = mround((cel * procent!) / 100, skok);
    if (ciezar <= poprzedni || ciezar >= cel) continue;
    kroki.push({ ciezar, powtorzenia });
    poprzedni = ciezar;
  }
  return kroki;
}
