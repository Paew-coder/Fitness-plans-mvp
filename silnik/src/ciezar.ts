import type { Progresja, TrybAkcesoriow, Tydzien, WynikCiezaru } from "./typy.ts";
import { PROGRESJE_BEZ_CIEZARU } from "./typy.ts";
import { mround } from "./pomocnicze.ts";
import { procent1RM } from "./rpe.ts";
import { KROK_ADAPTACJI } from "./adaptacja.ts";

/** Arkusz nigdy nie zaokrągla poniżej 0,5 kg, nawet gdy BAZA podaje mniejszy skok. */
export const SKOK_MINIMALNY = 0.5;

/**
 * Ocena klienta ma zmieniać ciężar także przy małych ciężarach.
 *
 * Trener, 02.10.2026: „jeżeli ciężary są bardzo małe, np. 5 kg, to nasze
 * oznaczenie »za trudne« coś zmieni, czy za mały jest %? Zróbmy tak, żeby
 * ciężar i tak się zmniejszał delikatnie — nie wyłapało 5 kg, to niech
 * przeskakuje na 4 kg”. 5 kg × 0,95 = 4,75, po zaokrągleniu do skoku 2,5
 * znowu 5 — ocena nie zmieniała nic (w trakcie treningu spadało o cały skok,
 * czyli do 2,5 kg).
 *
 * Reguła: gdy ±5 % na ocenę ginie w zaokrągleniu, ciężar idzie o krok
 * w stronę oceny — do `MALY_CIEZAR_KG` o 1 kg (do pełnych kilogramów: 5 → 4,
 * 7,5 → 7), wyżej o skok ćwiczenia (12,5 → 10, jak było — trener: „okej”).
 * Tę samą regułę ma telefon w korekcie serii (`poKorekcie`).
 */
export const MALY_CIEZAR_KG = 10;

export function krokWidoczny(kg: number, kierunek: number, skok: number): number {
  if (kg <= MALY_CIEZAR_KG) {
    return kierunek < 0 ? Math.max(SKOK_MINIMALNY, Math.ceil(kg - 1)) : Math.floor(kg + 1);
  }
  return Math.max(0, kg + Math.sign(kierunek) * Math.max(skok, SKOK_MINIMALNY));
}

/**
 * Ciężar z oceną (`z`) wobec ciężaru bez niej (`bez`): gdy ocena coś mówi
 * (`wzgledny` ≠ 1), a w zaokrągleniu nic się nie zmieniło — tyle kroków
 * `krokWidoczny`, ile ocen netto (każda to 5 %).
 */
export function widocznaZmiana(bez: number, z: number, wzgledny: number, skok: number): number {
  const kroki = Math.round((wzgledny - 1) / KROK_ADAPTACJI);
  if (kroki === 0 || z !== bez) return z;
  let w = bez;
  for (let i = 0; i < Math.abs(kroki); i++) w = krokWidoczny(w, Math.sign(kroki), skok);
  return w;
}

export type KontekstCiezaru = {
  tydzien: Tydzien;
  /** Bój główny — pozycja A **i** ćwiczenie złożone (coeff 1,0). Zawsze liczy z RPE. */
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
  /** Bez `widocznaZmiana` — tak, jak liczy arkusz. Do porównania w planie. */
  bezWidocznejZmiany?: boolean;
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
    const z = mround((k.ciezarBazowy * k.mnoznik) / mnoznikBazowy, skok);
    return k.bezWidocznejZmiany ? z
      : widocznaZmiana(k.ciezarBazowy, z, k.mnoznik / mnoznikBazowy, skok);
  }

  const baza = zmienione ? (k.oneRMReczny ?? 0) : k.oneRM;
  if (!baza) return zmienione ? "— ustaw ręcznie" : "— brak 1RM";

  const procent = procent1RM(k.powtorzenia, k.rpe);
  if (procent === null) return "— ustaw ręcznie";

  const z = mround((baza * procent * k.mnoznik) / 100, skok);
  return k.bezWidocznejZmiany ? z
    : widocznaZmiana(mround((baza * procent) / 100, skok), z, k.mnoznik, skok);
}

/**
 * Ciężar TOP SETU — jedna seria na 1 powtórzenie przy własnym RPE, liczona
 * z 1RM tego ćwiczenia, przy którym trener postawił TOP SET. Odpowiednik
 * wiersza TOP SET (G6/G22/…), z tą różnicą, że arkusz brał bój z pierwszego
 * wiersza dnia, a tu wskazanie jest jawne.
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
