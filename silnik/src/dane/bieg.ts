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
  { klucz: "spokojne", nazwa: "Spokojne", offset: 1.25 },
  { klucz: "ciagle", nazwa: "Tempowe (ciągłe)", offset: 0.6667 },
  { klucz: "progowe", nazwa: "Progowe", offset: 0.25 },
  { klucz: "interwal", nazwa: "Interwałowe", offset: -0.1667 },
];

/** Piec typow jednostek — staly zestaw trenera (27.09.2026); wzory minut z BIEG!B32:O61. */
export const WZORY_JEDNOSTEK: readonly WzorJednostki[] = [
  { nr: 1, klucz: "spokojny", typ: "Bieg spokojny", bazaMin: 30, tempo: "spokojne", strefa: 1, etykieta: "spokojny", dodatkoweMin: 0 },
  { nr: 2, klucz: "progowy", typ: "Bieg progowy", bazaMin: 16, tempo: "progowe", strefa: 3, etykieta: "progowy", dodatkoweMin: 20, odcinekMin: 4, przerwaMin: 2 },
  { nr: 3, klucz: "dlugie", typ: "Długie wybieganie", bazaMin: 45, tempo: "spokojne", strefa: 1, etykieta: "długie", dodatkoweMin: 0 },
  { nr: 4, klucz: "interwaly", typ: "Interwały", bazaMin: 15, tempo: "interwal", strefa: 4, etykieta: "interwały", dodatkoweMin: 20, odcinekMin: 3, przerwaMin: 2 },
  { nr: 5, klucz: "przebiezki", typ: "Bieg spokojny z przebieżkami", bazaMin: 30, tempo: "spokojne", strefa: 1, etykieta: "przebieżki", dodatkoweMin: 8, przebiezki: 6 },
];

/** Mnoznik objetosci na tydzien; T4 celowo lzejszy. */
export const MNOZNIK_TYGODNIA: readonly number[] = [1.0, 1.1, 1.2, 0.9, 1.2, 1.3];

/** Skalowanie objetosci liczba jednostek w tygodniu (CHOOSE w arkuszu). */
export const MNOZNIK_LICZBY_JEDNOSTEK: readonly number[] = [1.2, 1.1, 1.0, 0.95, 0.9];
