/**
 * Moduł oddechowy — zakładka ODDECH.
 *
 * Jedno pole na wejściu (wynik testu TWOT w sekundach) plus flaga
 * przeciwwskazań. Wyjście to gotowa dawka: poziom, częstotliwość i trzy bloki.
 *
 * Przeciwwskazanie jest **twardym zatrzymaniem**, nie ostrzeżeniem do
 * przeklikania. Arkusz podmienia wtedy wszystkie pola na „ustal indywidualnie"
 * i tak samo robi ten moduł.
 *
 * Źródło: `ODDECH!B8:B12`, `ODDECH!A14`, tabela `TABELE!A66:I70`.
 */

import { zaokraglijJakArkusz } from "./pomocnicze.ts";
import { PROGI_TWOT } from "./dane/oddech.ts";

export type ProgTWOT = {
  /** Dolna granica przedziału TWOT w sekundach. */
  od: number;
  /** Górna granica; ostatni próg sięga umownego 999. */
  do: number;
  poziom: string;
  czestotliwosc: string;
  blokA: string;
  blokB: string;
  blokC: string;
  /** Komunikat bramkujący — co wolno, a czego jeszcze nie. */
  brama: string;
  /** Ułamek TWOT używany w bezdechach; 0 na najniższym progu. */
  procentTWOT: number;
};

export const KOMUNIKAT_PRZECIWWSKAZANIE =
  "Zaznaczyłeś przeciwwskazanie — nie realizuj tej drabiny samodzielnie. " +
  "Ustal ćwiczenie indywidualnie.";

const WERSJA_LAGODNA = "Wersja łagodna — ustal indywidualnie";

export const PRZECIWWSKAZANIA = [
  "ciąża",
  "niekontrolowane nadciśnienie",
  "choroba sercowo-naczyniowa",
  "padaczka",
  "cukrzyca typu 1",
  "anemia sierpowata",
  "zaburzenia lękowe / napady paniki",
  "zabieg operacyjny w ostatnich 3 miesiącach",
] as const;

export type DawkaOddechowa = {
  poziom: string;
  czestotliwosc: string;
  blokA: string;
  blokB: string;
  blokC: string;
  brama: string;
  /** `true`, gdy zadziałało przeciwwskazanie — nic z powyższego nie jest dawką. */
  zatrzymane: boolean;
};

/**
 * Próg dla danego wyniku TWOT. Odpowiednik `MATCH(wynik; TABELE!A66:A70; 1)` —
 * dopasowanie przybliżone w dół, czyli największy próg nie większy od wyniku.
 * `null` poniżej pierwszego progu (arkusz zwraca wtedy pustkę przez IFERROR).
 */
export function progDlaTWOT(twot: number): ProgTWOT | null {
  if (!Number.isFinite(twot) || twot < PROGI_TWOT[0]!.od) return null;
  let znaleziony: ProgTWOT | null = null;
  for (const p of PROGI_TWOT) {
    if (twot >= p.od) znaleziony = p;
  }
  return znaleziony;
}

/**
 * Dawka oddechowa z wyniku testu.
 *
 * `blokB` ma podstawiony konkretny czas bezdechu: arkusz robi to przez
 * `SUBSTITUTE(...; "TWOT"; "TWOT (≈ N s)")`, gdzie N = `ROUND(twot × %TWOT; 0)`.
 */
export function dawkaOddechowa(twot: number, przeciwwskazania = false): DawkaOddechowa | null {
  if (przeciwwskazania) {
    return {
      poziom: WERSJA_LAGODNA,
      czestotliwosc: WERSJA_LAGODNA,
      blokA: WERSJA_LAGODNA,
      blokB: WERSJA_LAGODNA,
      blokC: WERSJA_LAGODNA,
      brama: KOMUNIKAT_PRZECIWWSKAZANIE,
      zatrzymane: true,
    };
  }

  const prog = progDlaTWOT(twot);
  if (!prog) return null;

  const sekundy = zaokraglijJakArkusz(twot * prog.procentTWOT);
  const blokB = prog.procentTWOT > 0
    ? prog.blokB.replaceAll("TWOT", `TWOT (≈ ${sekundy} s)`)
    : prog.blokB;

  return {
    poziom: prog.poziom,
    czestotliwosc: prog.czestotliwosc,
    blokA: prog.blokA,
    blokB,
    blokC: prog.blokC,
    brama: prog.brama,
    zatrzymane: false,
  };
}
