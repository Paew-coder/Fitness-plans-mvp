import type { Coeff, CzescPlanu, Tydzien } from "./typy.ts";
import { ogranicz } from "./pomocnicze.ts";
import { POWT_MAX, POWT_MIN } from "./rpe.ts";

/**
 * Przesunięcie powtórzeń w obrębie bloku. Blok pierwszy to T1–T3, drugi T4–T6 —
 * objętość rośnie wewnątrz bloku, a T4 restartuje.
 */
export function offsetTygodnia(tydzien: Tydzien): 0 | 1 | 2 {
  return ((tydzien - 1) % 3) as 0 | 1 | 2;
}

/**
 * Powtórzenia bazowe akcesorium — wynikają z coeff i przełącznika części planu
 * (Analiza!B5). Bój główny nie przechodzi przez ten automat: jego serie,
 * powtórzenia i RPE ustawia trener wprost.
 */
export function powtorzeniaBazowe(coeff: Coeff, czesc: CzescPlanu): number {
  // Hipertrofia — trener, 27.09.2026: cz. 1 złożone 10–12, izolacje 12–14;
  // cz. 2 złożone 8–10, izolacje 10–12. Ćwiczenie złożone idzie tu razem
  // z pomocniczymi (≥ 0,75), nie na 6 jak w części siłowej. Do 27.09
  // hipertrofia miała jedną część: 12/14.
  if (czesc === "hipertrofia") return coeff >= 0.75 ? 10 : 12;
  if (czesc === "hipertrofia 2") return coeff >= 0.75 ? 8 : 10;
  if (coeff >= 1) return 6;
  if (coeff >= 0.75) return czesc === "objętość" ? 8 : 6;
  return czesc === "objętość" ? 10 : 8;
}

/**
 * Pełny automat powtórzeń akcesorium (kolumna E w arkuszu):
 * baza z coeff, plus przesunięcie tygodnia w bloku, plus korekta z odczuć
 * (tylko dla progresji bezciężarowych), obcięte do zakresu tabeli 1–15.
 */
export function powtorzeniaAkcesorium(args: {
  coeff: Coeff;
  czesc: CzescPlanu;
  tydzien: Tydzien;
  korekta?: number;
}): number {
  const { coeff, czesc, tydzien, korekta = 0 } = args;
  const baza = powtorzeniaBazowe(coeff, czesc);
  return ogranicz(baza + offsetTygodnia(tydzien) + korekta, POWT_MIN, POWT_MAX);
}
