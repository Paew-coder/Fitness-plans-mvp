/**
 * Układ pustego planu — 5 dni × 12 slotów, numeracja jak w arkuszu.
 *
 * Wydzielone z magazynu, bo tego samego szablonu potrzebuje też asystent AI,
 * a wciąganie dla trzech stałych całego modułu z bazą danych byłoby zbędnym
 * splątaniem. Zmiana numeracji w jednym miejscu zmienia ją wszędzie.
 */
import type { Plan } from "../silnik/src/plan.ts";

/**
 * Numeracja pozycji w dniu. Wspólna litera = superseria, dokładnie jak w 5.17.
 * Trzy ostatnie sloty zostają bez Lp. — to zapas na pozycje dokładane ręcznie.
 */
export const LP_SLOTU: readonly string[] = [
  "A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2.", "E1.", "E2.", "", "", "",
];

export const SLOTOW_W_DNIU = LP_SLOTU.length;

export const DNI_W_PLANIE = 5;

/** Pusty plan: 5 dni × 12 slotów z numeracją A1, B1/B2, C1/C2, D1/D2, E1/E2. */
export function pustyPlan(klient: string): Plan {
  const sloty = [];
  for (let dzien = 1; dzien <= DNI_W_PLANIE; dzien++) {
    for (let poz = 1; poz <= SLOTOW_W_DNIU; poz++) {
      sloty.push({
        positionId: `D${dzien}-S${String(poz).padStart(2, "0")}`,
        dzien,
        lp: LP_SLOTU[poz - 1] ?? "",
        cwiczenieId: null,
        kategoriaSzkieletu: null,
        tygodnie: {},
      });
    }
  }
  return {
    nazwa: klient,
    trybAkcesoriow: "trzymaj z bloku",
    czescPlanu: "objętość",
    serieMaksymalne: [],
    sloty,
    topSety: [1, 2, 3, 4, 5].map((dzien) => ({
      dzien,
      wlaczony: true,
      rpe: 7,
      slotPositionId: `D${dzien}-S01`,
    })),
  };
}
