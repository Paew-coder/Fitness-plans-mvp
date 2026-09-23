import { TABELA_RPE } from "./dane/tabele.ts";
import { klucz, zaokraglij } from "./pomocnicze.ts";

/** Najniższe i najwyższe powtórzenia obsługiwane przez tabelę RPE. */
export const POWT_MIN = 1;
export const POWT_MAX = 15;

/**
 * %1RM dla danej liczby powtórzeń i RPE.
 * Tabela nie interpoluje — trafienie dokładne albo `null` (odpowiednik IFERROR w arkuszu).
 */
export function procent1RM(powtorzenia: number, rpe: number): number | null {
  const wiersz = TABELA_RPE[klucz(powtorzenia)];
  if (!wiersz) return null;
  return wiersz[klucz(rpe)] ?? null;
}

/**
 * 1RM z serii maksymalnej. Seria do odmowy = RPE 10.
 * Odpowiednik START!E: `ciężar / (%1RM przy RPE 10 / 100)`, zaokrąglone do 0,1 kg.
 * Zwraca `null`, gdy powtórzenia wypadają poza tabelę (arkusz pokazuje wtedy "powt. 1–15").
 */
export function oblicz1RM(ciezar: number, powtorzenia: number): number | null {
  const procent = procent1RM(powtorzenia, 10);
  if (procent === null || procent <= 0) return null;
  return zaokraglij(ciezar / (procent / 100), 1);
}

export type SeriaMaksymalna = {
  cwiczenieId: string;
  ciezar: number;
  powtorzenia: number;
  /**
   * Obecne, gdy wpis nie jest serią maksymalną, tylko 1RM policzonym z serii
   * roboczej — patrz `KalibracjaSerii`.
   */
  kalibracja?: KalibracjaSerii;
};

/**
 * Seria robocza, z której wyszło 1RM, gdy klient zaczął cykl bez serii
 * maksymalnej i dobrał ciężar sam, według RPE z planu.
 *
 * **Silnik tego nie czyta.** Liczy z `ciezar × powtorzenia` wpisu tak samo
 * jak zawsze — kalibracja zapisuje się tam jako `1RM × 1`, tą samą drogą,
 * którą trener przyjmuje propozycję 1RM. Ten opis jest dla ludzi: trener
 * musi widzieć, że to nie była seria do odmowy, i z czego się wzięło.
 */
export type KalibracjaSerii = {
  ciezar: number;
  powtorzenia: number;
  /** RPE z planu — przy nim klient dobierał ciężar. */
  rpe: number;
  tydzien: number;
  dzien: number;
  positionId: string;
  /** ISO — kiedy klient wpisał tę serię. */
  data: string;
};

/**
 * 1RM ćwiczenia, gdy ta sama pozycja stoi w kilku dniach.
 * Arkusz bierze MAX po wszystkich wpisach (START!N) — nie pierwsze trafienie, nie średnią.
 * Zwraca 0, gdy nie ma żadnego wpisu; wtedy ciężar liczy się na "— brak 1RM".
 */
export function rozwiaz1RM(cwiczenieId: string, serie: readonly SeriaMaksymalna[]): number {
  let max = 0;
  for (const s of serie) {
    if (s.cwiczenieId !== cwiczenieId) continue;
    const wynik = oblicz1RM(s.ciezar, s.powtorzenia);
    if (wynik !== null && wynik > max) max = wynik;
  }
  return max;
}

/**
 * Wpisy dające różne 1RM dla jednego ćwiczenia — odpowiednik kontroli
 * "Serie maksymalne w konflikcie" (START!M ≠ START!N). Ostrzeżenie, nie błąd.
 */
export function konfliktSeriiMaksymalnych(serie: readonly SeriaMaksymalna[]): string[] {
  const wg = new Map<string, Set<number>>();
  for (const s of serie) {
    const wynik = oblicz1RM(s.ciezar, s.powtorzenia);
    if (wynik === null || wynik <= 0) continue;
    if (!wg.has(s.cwiczenieId)) wg.set(s.cwiczenieId, new Set());
    wg.get(s.cwiczenieId)!.add(wynik);
  }
  return [...wg].filter(([, wartosci]) => wartosci.size > 1).map(([id]) => id);
}
