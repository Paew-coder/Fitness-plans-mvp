import type { Progresja, TrybAkcesoriow, Tydzien, WynikCiezaru } from "./typy.ts";
import { PROGRESJE_BEZ_CIEZARU } from "./typy.ts";
import { mround } from "./pomocnicze.ts";
import { procent1RM } from "./rpe.ts";

/** Arkusz nigdy nie zaokrągla poniżej 0,5 kg, nawet gdy BAZA podaje mniejszy skok. */
export const SKOK_MINIMALNY = 0.5;

export type KontekstCiezaru = {
  tydzien: Tydzien;
  /** Bój główny — pozycja, której `lp` zaczyna się na "A". Zawsze liczy z RPE. */
  jestBojemGlownym: boolean;
  trybAkcesoriow: TrybAkcesoriow;
  powtorzenia: number;
  rpe: number;
  skokKg: number;
  progresja: Progresja;
  /** 1RM z serii maksymalnych. 0 = brak. */
  oneRM: number;
  /** Mnożnik adaptacji na ten tydzień (AC). W T1 zawsze 1. */
  mnoznik: number;
  /** Czy w tym tygodniu podmieniono ćwiczenie względem T1. */
  cwiczenieZmienioneWzgledemT1?: boolean;
  /** 1RM wpisany ręcznie dla podmienionego ćwiczenia (kolumna AA). */
  oneRMReczny?: number;
  /** Ciężar z tygodnia bazowego bloku: T1 dla T2/T3, T4 dla T5/T6. */
  ciezarBazowy?: WynikCiezaru;
  /** Mnożnik z tygodnia bazowego bloku. */
  mnoznikBazowy?: number;
};

/** Tygodnie, w których akcesoria mogą dziedziczyć ciężar z tygodnia bazowego bloku. */
const TYGODNIE_DZIEDZICZACE: readonly Tydzien[] = [2, 3, 5, 6];

/** Tydzień, z którego dziedziczy ciężar dany tydzień w trybie "trzymaj z bloku". */
export function tydzienBazowyBloku(tydzien: Tydzien): Tydzien | null {
  if (tydzien === 2 || tydzien === 3) return 1;
  if (tydzien === 5 || tydzien === 6) return 4;
  return null;
}

/**
 * Ciężar na jeden slot — odpowiednik kolumny G we wszystkich sześciu tygodniach.
 *
 * Cztery reguły:
 *   T1        — 1RM × %1RM
 *   T2, T3    — bój: 1RM × %1RM × AC · akcesoria "trzymaj z bloku": ciężar_T1 × AC / AC_T1
 *   T4        — zawsze 1RM × %1RM × AC (restart bloku intensyfikacji)
 *   T5, T6    — jak T2/T3, ale bazą jest T4
 */
export function obliczCiezar(k: KontekstCiezaru): WynikCiezaru {
  // Progresje bez ciężaru: arkusz pokazuje nazwę progresji, nie liczbę.
  if (PROGRESJE_BEZ_CIEZARU.includes(k.progresja)) return k.progresja;

  const skok = Math.max(k.skokKg, SKOK_MINIMALNY);
  const zmienione = k.cwiczenieZmienioneWzgledemT1 ?? false;

  const dziedziczy =
    !k.jestBojemGlownym &&
    k.trybAkcesoriow === "trzymaj z bloku" &&
    TYGODNIE_DZIEDZICZACE.includes(k.tydzien) &&
    !zmienione;

  if (dziedziczy) {
    // Komunikat z tygodnia bazowego propaguje się dalej zamiast liczby.
    if (typeof k.ciezarBazowy !== "number") {
      return (k.ciezarBazowy ?? "— brak 1RM") as WynikCiezaru;
    }
    const mnoznikBazowy = Math.max(k.mnoznikBazowy ?? 1, 0.0001);
    return mround((k.ciezarBazowy * k.mnoznik) / mnoznikBazowy, skok);
  }

  const baza = zmienione ? (k.oneRMReczny ?? 0) : k.oneRM;
  if (!baza) return zmienione ? "— ustaw ręcznie" : "— brak 1RM";

  const procent = procent1RM(k.powtorzenia, k.rpe);
  if (procent === null) return "— ustaw ręcznie";

  return mround((baza * procent * k.mnoznik) / 100, skok);
}

/**
 * Ciężar TOP SETU — jedna seria na 1 powtórzenie przy własnym RPE,
 * liczona zawsze z 1RM boju głównego dnia. Odpowiednik wiersza TOP SET (G6/G22/…).
 */
export function obliczCiezarTopSetu(args: {
  oneRM: number;
  rpe: number;
  skokKg: number;
  progresja: Progresja;
}): WynikCiezaru {
  if (PROGRESJE_BEZ_CIEZARU.includes(args.progresja)) return "—" as WynikCiezaru;
  if (!args.oneRM) return "— brak 1RM";
  const procent = procent1RM(1, args.rpe);
  if (procent === null) return "— ustaw ręcznie";
  return mround((args.oneRM * procent) / 100, Math.max(args.skokKg, SKOK_MINIMALNY));
}
