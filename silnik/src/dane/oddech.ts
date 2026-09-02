// PLIK GENEROWANY — nie edytuj recznie.
// Zrodlo: docs/dane/oddech-progi.json (MasterTemplate 5.17, TABELE!A66:I70)
// Regeneracja: python3 silnik/narzedzia/generuj-dane.py

import type { ProgTWOT } from "../oddech.ts";

/** Piec progow TWOT -> dawka oddechowa. */
export const PROGI_TWOT: readonly ProgTWOT[] = [
  {
    od: 0.0, do: 9.999, procentTWOT: 0.0,
    poziom: "Bardzo niski",
    czestotliwosc: "3×/tydz · 8 min",
    blokA: "4 min Breathe Light, głód powietrza 2/10",
    blokB: "bez bezdechów",
    blokC: "4 min oddech swobodny nosem, kadencja 4–6",
    brama: "Wynik poniżej 10 s. Zacznij od samego oddechu nosowego w spoczynku; bezdechy dopiero po wzroście TWOT.",
  },
  {
    od: 10.0, do: 19.999, procentTWOT: 0.4,
    poziom: "Niski",
    czestotliwosc: "4×/tydz · 12 min",
    blokA: "5 min Breathe Light, głód powietrza 2–3/10",
    blokB: "8 × bezdech 40% TWOT w marszu, przerwa 60 s",
    blokC: "4 min kadencja 4–6 nosem",
    brama: "Dozwolone tylko krótkie zatrzymania w marszu, do 40% TWOT. Jeśli po serii łapiesz oddech ustami — skróć zatrzymanie.",
  },
  {
    od: 20.0, do: 24.999, procentTWOT: 0.5,
    poziom: "Średni",
    czestotliwosc: "4×/tydz · 14 min",
    blokA: "5 min Breathe Light, głód powietrza 3/10",
    blokB: "10 × bezdech 50% TWOT w marszu, przerwa 60 s",
    blokC: "5 min kadencja 4–6 nosem",
    brama: "Bezdechy tylko marszowe, do 50% TWOT. Maksymalne zatrzymania odblokowują się dopiero od TWOT ≥ 25 s.",
  },
  {
    od: 25.0, do: 29.999, procentTWOT: 0.6,
    poziom: "Dobry",
    czestotliwosc: "5×/tydz · 15 min",
    blokA: "5 min Breathe Light, głód powietrza 3–4/10",
    blokB: "10 × bezdech 60% TWOT w marszu + 1 × maksymalna liczba kroków",
    blokC: "5 min kadencja 4–6 nosem",
    brama: "Pełne bezdechy odblokowane. Nigdy w wodzie ani za kierownicą.",
  },
  {
    od: 30.0, do: 999.0, procentTWOT: 0.65,
    poziom: "Wysoki",
    czestotliwosc: "5×/tydz · 18 min",
    blokA: "8 min ciągłego Breathe Light, głód powietrza 3–4/10",
    blokB: "10 × bezdech 60–70% TWOT w truchcie + 2 × maks. liczba kroków",
    blokC: "5 min kadencja 4–6 nosem",
    brama: "Pełny zakres. Przerwij przy zawrotach głowy, bólu w klatce, mrowieniu lub narastającym lęku.",
  },
];
