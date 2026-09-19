/**
 * Szkielet planu z szablonu 5.18 — sześć tygodni, tak jak w arkuszu.
 *
 * Osobny plik, bo potrzebują go dwa moduły naraz: `progresja.ts` wpisuje te
 * liczby do planu na kliknięcie trenera, a `plan.ts` sięga po nie wtedy, gdy
 * trener nic nie wpisał — i to jest tu najważniejsze. **Liczba niewpisana
 * i liczba wpisana przyciskiem są tą samą liczbą.** Klikniecie „progresja
 * 5.18" nie zmienia więc planu, tylko czyni go widocznym i edytowalnym.
 *
 * Wcześniej tak nie było: bój główny bez wpisanych serii szedł do klienta
 * jako **jedna seria**, choć szablon mówi sześć. Na telefonie wyglądało to
 * jak polecenie „zrób jedną serię" i tak też zostało odczytane.
 *
 * Trzymanie tego w `progresja.ts` zrobiłoby cykl w imporcie — `progresja.ts`
 * czyta z `plan.ts`, więc `plan.ts` nie może czytać z niego.
 *
 * Liczby odczytane z `arkusz/MasterTemplate-5-18.xlsx`, zakładki T1…T6;
 * identyczne w każdym dniu. Objętość schodzi, intensywność rośnie, a T4
 * otwiera drugi blok.
 */
import type { ParametryTygodnia } from "./plan.ts";
import type { Tydzien } from "./typy.ts";

export const PROGRESJA_BOJU: readonly { serie: number; powtorzenia: number; rpe: number }[] = [
  { serie: 6, powtorzenia: 6, rpe: 6.5 },   // T1
  { serie: 5, powtorzenia: 6, rpe: 7 },     // T2
  { serie: 5, powtorzenia: 5, rpe: 7 },     // T3
  { serie: 4, powtorzenia: 5, rpe: 7.5 },   // T4 — początek drugiego bloku
  { serie: 5, powtorzenia: 4, rpe: 7.5 },   // T5
  { serie: 6, powtorzenia: 3, rpe: 7.5 },   // T6
];

/** Akcesoria mają w szablonie zawsze trzy serie. */
export const SERIE_AKCESORIUM = 3;

/** RPE akcesoriów: pierwszy blok, drugi blok. Powtórzenia liczy automat. */
export const RPE_AKCESORIUM = { blokI: 8, blokII: 9 } as const;

/**
 * Pozycje, które w szablonie chodzą o stopień wyżej — drugie ćwiczenie
 * w superserii C i D. B2 nie, i tak jest w arkuszu.
 */
export const LP_PODWYZSZONE: readonly string[] = ["C2.", "D2."];

/** Czy ten tydzień należy do drugiego bloku. W arkuszu blok zaczyna się w T4. */
export function drugiBlok(tydzien: Tydzien): boolean {
  return tydzien >= 4;
}

/** Bojem głównym jest pozycja A — tak numeruje je arkusz. */
export function jestBojemGlownym(lp: string): boolean {
  return lp.trim().toUpperCase().startsWith("A");
}

/**
 * Parametry jednej pozycji w jednym tygodniu, wg szablonu.
 *
 * Powtórzeń akcesoriów **nie ustawiamy** — w arkuszu liczy je formuła i tak
 * samo robi to silnik. Wpisanie ich tutaj zamieniłoby automat w liczbę wpisaną
 * na sztywno, czyli odebrałoby planowi to, co sam się dostraja.
 *
 * Pozycje E1/E2 szablon zostawia puste jako zapas; dostają regułę akcesorium,
 * bo niczym innym nie są — to jedyne miejsce, w którym wychodzimy poza
 * dosłowną treść arkusza, i dlatego stoi to tu napisane.
 */
export function progresjaSlotu(lp: string, tydzien: Tydzien): ParametryTygodnia {
  if (jestBojemGlownym(lp)) {
    const p = PROGRESJA_BOJU[tydzien - 1]!;
    return { serie: p.serie, powtorzenia: p.powtorzenia, rpe: p.rpe };
  }
  const podstawowe = drugiBlok(tydzien) ? RPE_AKCESORIUM.blokII : RPE_AKCESORIUM.blokI;
  const wyzej = LP_PODWYZSZONE.includes(lp.trim());
  return { serie: SERIE_AKCESORIUM, rpe: podstawowe + (wyzej ? 1 : 0) };
}
