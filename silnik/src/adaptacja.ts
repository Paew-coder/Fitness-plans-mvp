import type { Feedback, Progresja, Tydzien } from "./typy.ts";
import { PROGRESJE_BEZ_CIEZARU } from "./typy.ts";
import { ogranicz, zaokraglij, zaokraglijJakArkusz } from "./pomocnicze.ts";

/** Krok korekty na jedno zgłoszenie odczucia. */
export const KROK_ADAPTACJI = 0.05;
export const MNOZNIK_MIN = 0.85;
export const MNOZNIK_MAX = 1.15;

/**
 * Mnożnik ciężaru na dany tydzień, liczony z odczuć klienta z tego samego slotu
 * w tygodniach poprzednich (kolumna AC w arkuszu).
 *
 * Każde "za łatwe" podnosi o 5%, każde "za trudne" obniża o 5%, wynik obcięty do ±15%.
 * Mnożnik jest kumulatywny w obrębie całego cyklu — restart w T4 dotyczy bazy ciężaru,
 * nie historii odczuć.
 */
export function mnoznikAdaptacji(historia: readonly Feedback[]): number {
  let mnoznik = 1;
  for (const f of historia) {
    if (f === "za łatwe") mnoznik += KROK_ADAPTACJI;
    else if (f === "za trudne") mnoznik -= KROK_ADAPTACJI;
  }
  return zaokraglij(ogranicz(mnoznik, MNOZNIK_MIN, MNOZNIK_MAX), 4);
}

/** Tygodnie, z których liczy się mnożnik dla zadanego tygodnia. T1 nie ma historii. */
export function tygodnieHistorii(tydzien: Tydzien): Tydzien[] {
  const wynik: Tydzien[] = [];
  for (let t = 1; t < tydzien; t++) wynik.push(t as Tydzien);
  return wynik;
}

/**
 * Mnożnik dla slotu w danym tygodniu na podstawie mapy `tydzień -> odczucie`.
 * Wygodniejsze wejście niż gotowa lista, bo tak wyglądają dane z bazy.
 */
export function mnoznikNaTydzien(
  tydzien: Tydzien,
  odczucia: Partial<Record<Tydzien, Feedback | undefined>>,
): number {
  const historia = tygodnieHistorii(tydzien)
    .map((t) => odczucia[t])
    .filter((f): f is Feedback => f !== undefined);
  return mnoznikAdaptacji(historia);
}

/**
 * Przy progresjach bezciężarowych mnożnik nie ma na co działać, więc arkusz
 * zamienia go na powtórzenia (kolumna AD): ±5% = ±1 powtórzenie, maksymalnie ±3.
 * Dla progresji ciężarowych zwraca 0.
 */
export function korektaPowtorzen(progresja: Progresja, mnoznik: number): number {
  if (!PROGRESJE_BEZ_CIEZARU.includes(progresja)) return 0;
  return ogranicz(zaokraglijJakArkusz((mnoznik - 1) / KROK_ADAPTACJI), -3, 3);
}
