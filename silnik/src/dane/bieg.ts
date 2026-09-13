// PLIK GENEROWANY — nie edytuj recznie.
// Zrodlo: docs/dane/bieg-parametry.json (MasterTemplate 5.17, zakladka BIEG)
// Regeneracja: python3 silnik/narzedzia/generuj-dane.py

import type { StrefaTetna, TempoBiegowe, WzorJednostki } from "../bieg.ts";

/** Piec stref tetna jako ulamek HR max (BIEG!B18:B22). */
export const STREFY_TETNA: readonly StrefaTetna[] = [
  { nazwa: "Strefa 1 — regeneracja", od: 0.6, do: 0.7 },
  { nazwa: "Strefa 2 — baza tlenowa", od: 0.7, do: 0.8 },
  { nazwa: "Strefa 3 — tempo ciągłe", od: 0.8, do: 0.87 },
  { nazwa: "Strefa 4 — próg", od: 0.87, do: 0.93 },
  { nazwa: "Strefa 5 — VO2max", od: 0.93, do: 1.0 },
];

/** Cztery tempa jako offset w min/km od tempa testowego (BIEG!B25:B28). */
export const TEMPA: readonly TempoBiegowe[] = [
  { klucz: "spokojne", nazwa: "Bieg spokojny (Z2)", offset: 1.25 },
  { klucz: "ciagle", nazwa: "Bieg ciągły (Z3)", offset: 0.6667 },
  { klucz: "progowe", nazwa: "Tempo progowe (Z4)", offset: 0.25 },
  { klucz: "interwal", nazwa: "Interwał (Z5)", offset: -0.1667 },
];

/** Piec typow jednostek (BIEG!B32:O36 i kolejne bloki tygodni). */
export const WZORY_JEDNOSTEK: readonly WzorJednostki[] = [
  { nr: 1, typ: "Bieg spokojny — ciągły", bazaMin: 30, tempo: "spokojne", strefa: 1, etykieta: "spokojny (Z2)", dodatkoweMin: 0 },
  { nr: 2, typ: "Bieg spokojny — ciągły", bazaMin: 30, tempo: "spokojne", strefa: 1, etykieta: "spokojny (Z2)", dodatkoweMin: 0 },
  { nr: 3, typ: "Bieg ciągły", bazaMin: 20, tempo: "ciagle", strefa: 2, etykieta: "ciągły (Z3)", dodatkoweMin: 20 },
  { nr: 4, typ: "Długie wybieganie — ciągły", bazaMin: 45, tempo: "spokojne", strefa: 1, etykieta: "długie wybieganie (Z2)", dodatkoweMin: 0 },
  { nr: 5, typ: "Interwał progowy", bazaMin: 16, tempo: "progowe", strefa: 3, etykieta: "interwał progowy (Z4)", dodatkoweMin: 20 },
];

/** Mnoznik objetosci na tydzien; T4 celowo lzejszy. */
export const MNOZNIK_TYGODNIA: readonly number[] = [1.0, 1.1, 1.2, 0.9, 1.2, 1.3];

/** Skalowanie objetosci liczba jednostek w tygodniu (CHOOSE w arkuszu). */
export const MNOZNIK_LICZBY_JEDNOSTEK: readonly number[] = [1.2, 1.1, 1.0, 0.95, 0.9];
