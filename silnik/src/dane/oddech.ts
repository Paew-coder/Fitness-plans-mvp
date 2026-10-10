// PLIK GENEROWANY — nie edytuj recznie.
// Zrodlo: docs/dane/oddech-progi.json (MasterTemplate 5.17, TABELE!A66:I70)
// Regeneracja: python3 silnik/narzedzia/generuj-dane.py

import type { ObjasnieniaOddechu, ProgTWOT } from "../oddech.ts";

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

/** Instrukcje z zakladki ODDECH (A2, A17:A44) — dla klienta, przy dawce. */
export const OBJASNIENIA_ODDECHU: ObjasnieniaOddechu = {
  "wstep": "Protokół oddechowy prowadzony równolegle do planu siłowego.",
  "technika": {
    "A": [
      {
        "nazwa": "Breathe Light",
        "tekst": "siedź prosto, rozluźnij barki i szczękę. Oddychaj cicho nosem i subtelnie zmniejsz objętość oddechu — bez wstrzymywania. Głód powietrza ma być tolerowalny."
      }
    ],
    "B": [
      {
        "nazwa": "Bezdech w marszu",
        "tekst": "wydech, zatkaj nos, idź spokojnym krokiem przez zaplanowany czas. Puść nos i wróć do oddechu nosowego. Jeśli po 2–3 oddechach nie wracasz do spokoju, zatrzymanie było za długie."
      },
      {
        "nazwa": "Przerwa",
        "tekst": "minimum 60 s między powtórzeniami."
      }
    ],
    "C": [
      {
        "nazwa": "Kadencja 4–6",
        "tekst": "wdech na 4, wydech na 6, przez nos, bez napięcia."
      }
    ]
  },
  "pomiar": [
    "Odpocznij 10 minut. Najlepiej rano, przed kawą i wysiłkiem.",
    "Usiądź. Zwykły, niepogłębiony wdech i wydech przez nos.",
    "Po wydechu zatkaj nos i uruchom stoper.",
    "Zatrzymaj pomiar przy pierwszej wyraźnej potrzebie wdechu. Nie walcz o wynik.",
    "Puść nos i spokojnie zaczerpnij powietrza nosem. Jeśli musisz nasilić oddychanie, test trwał za długo."
  ],
  "coMowi": [
    "Opisuje pośrednio wrażliwość na CO₂ i skłonność do zadyszki.",
    "Nie mierzy saturacji, pojemności płuc ani wydolności tlenowej.",
    "Powtarzalność wyniku jest umiarkowana — patrz na trend z kilku pomiarów, nie na pojedynczy odczyt.",
    "Dowody na przełożenie na wyniki sportowe są ograniczone. Traktuj to jako dodatek, nie miernik formy."
  ],
  "retest": [
    "Mierz TWOT rano w pierwszym dniu tygodnia 1, 3 i 5 oraz na koniec cyklu.",
    "Nowy wynik przekaż trenerowi — dawka przeliczy się sama.",
    "Dobra odpowiedź to wzrost o 3–5 s na 2 tygodnie.",
    "Brak zmiany przez 4 tygodnie: wróć do samego oddechu nosowego w ciągu dnia zamiast dokładać bezdechy."
  ],
  "przerwij": [
    "Zawroty głowy, ból w klatce, mrowienie, narastający lęk, oddech tracący płynność.",
    "Nigdy w wodzie ani w jej pobliżu. Nigdy za kierownicą."
  ]
};
