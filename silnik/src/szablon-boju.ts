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
import type { Coeff, CzescPlanu, Tydzien } from "./typy.ts";

export type ParametryBoju = { serie: number; powtorzenia: number; rpe: number };

/**
 * Progresja boju głównego — dwie kolumny, bo takie są dwa szablony trenera.
 *
 * `objętość` to jego „cz.1", `intensywność` to „cz.2 kontynuacja". Obie
 * odczytane z arkuszy „Szablon 3 dni, 3 złożone cz.1 / cz.2" (Day I,
 * sześć tygodni) i sprawdzone na drugim komplecie — „3 dni, 6 złożonych,
 * 6 akcesoriów cz.2" ma w boju dokładnie te same liczby.
 *
 * Kolumna `objętość` jest identyczna z tym, co niesie MasterTemplate 5.18:
 * 5.18 wziął bój właśnie z Day I części pierwszej. Kolumna `intensywność`
 * była dotąd tylko w arkuszach — aplikacja jej nie znała, więc drugi cykl
 * wychodził z liczbami pierwszego.
 *
 * Czego tu świadomie NIE MA: różnic między dniami. W arkuszach Day II i III
 * mają o serię mniej i nierówne RPE (np. cz.2 Day II: 5×3 w T4, potem 4×2
 * w T5 i znów 4×3 w T6). MasterTemplate spłaszczył to do Day I i tak zostaje —
 * inaczej silnik musiałby trzymać osiemnaście osobnych komórek zamiast sześciu,
 * a liczby, które je różnią, wyglądają na pisane ręcznie, nie na regułę.
 */
export const PROGRESJA_BOJU: Record<CzescPlanu, readonly ParametryBoju[]> = {
  "objętość": [
    { serie: 6, powtorzenia: 6, rpe: 6.5 },   // T1
    { serie: 5, powtorzenia: 6, rpe: 7 },     // T2
    { serie: 5, powtorzenia: 5, rpe: 7 },     // T3
    { serie: 4, powtorzenia: 5, rpe: 7.5 },   // T4 — początek drugiego bloku
    { serie: 5, powtorzenia: 4, rpe: 7.5 },   // T5
    { serie: 6, powtorzenia: 3, rpe: 7.5 },   // T6
  ],
  "intensywność": [
    { serie: 6, powtorzenia: 4, rpe: 7 },     // T1
    // T2 powtarza T1 — w obu arkuszach cz.2 tak samo. Tydzień wejścia
    // w nowy zakres powtórzeń: zmienia się TOP SET, praca zostaje.
    { serie: 6, powtorzenia: 4, rpe: 7 },     // T2
    { serie: 5, powtorzenia: 4, rpe: 7.5 },   // T3
    { serie: 5, powtorzenia: 3, rpe: 7.5 },   // T4 — początek drugiego bloku
    { serie: 5, powtorzenia: 3, rpe: 8 },     // T5
    { serie: 6, powtorzenia: 2, rpe: 8 },     // T6
  ],
  // Z szablonów „Hipertroficzny 1–4 dni" (Base44, pozycja A): 4 × 12 → 13 → 14
  // na RPE 8, w drugim bloku to samo na RPE 9. TOP SETU w tej części nie ma.
  "hipertrofia": [
    { serie: 4, powtorzenia: 12, rpe: 8 },    // T1
    { serie: 4, powtorzenia: 13, rpe: 8 },    // T2
    { serie: 4, powtorzenia: 14, rpe: 8 },    // T3
    { serie: 4, powtorzenia: 12, rpe: 9 },    // T4 — początek drugiego bloku
    { serie: 4, powtorzenia: 13, rpe: 9 },    // T5
    { serie: 4, powtorzenia: 14, rpe: 9 },    // T6
  ],
};

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

/** Pozycja A — miejsce boju głównego w numeracji arkusza. */
export function pozycjaBoju(lp: string): boolean {
  return lp.trim().toUpperCase().startsWith("A");
}

/**
 * Bój główny: pozycja A **i** ćwiczenie złożone.
 *
 * Sama pozycja nie wystarcza i to jest tu sedno. Arkusz rozstrzygał o tym
 * miejscem w tabeli, bo trener wypełniał go ręcznie i po prostu nie wstawiał
 * w A1 ćwiczenia balansowego. Aplikacja pozwala wstawić tam cokolwiek —
 * i wstawiała: „SLDL balance" w A1 dostawał progresję bloku (6×6 na RPE 6,5)
 * i TOP SET na jedno powtórzenie. Dla ćwiczenia, które w BAZIE ma coeff 0,25
 * i progresję „ręczne ustawienie", jest to polecenie bez sensu.
 *
 * Rozstrzyga `coeff` z BAZY, bo tam ta wiedza już jest: **1,0 mają dokładnie
 * te dziewiętnaście ćwiczeń złożonych** — przysiady, martwe ciągi, wyciskania
 * ze sztangą, podciąganie z obciążeniem, dipy, clean. Nic innego.
 *
 * **Wiosłowanie bojem głównym nie jest — rozstrzygnięte 22.09.2026.** Pytanie
 * wisiało otwarte od 20.09, a analiza aplikacji trenera z Base44 przyniosła
 * dowód w drugą stronę: tamtejsza klasyfikacja `diff_class` liczy `Barbell Row`
 * i `Pendlay Row` do ćwiczeń głównych, choć mają coeff 0,75. Trener zdecydował
 * inaczej: **wiosłowanie liczymy jako akcesorium**. Progi zostają tam, gdzie
 * były — bojem głównym jest wyłącznie ćwiczenie z coeff 1,0 stojące w pozycji A.
 * Wiosłowanie w pozycji A dostaje więc progresję akcesorium, czyli powtórzenia
 * liczone z `coeff` i RPE z bloku, a nie dwukolumnowy szablon boju.
 */
export function jestBojemGlownym(lp: string, coeff?: Coeff): boolean {
  return pozycjaBoju(lp) && coeff === 1;
}

/**
 * Bój główny w konkretnym slocie: decyzja trenera, a bez niej reguła wyżej.
 *
 * Trener, 26.09.2026: front squat stał u Marka X na B1 i liczył się jak
 * akcesorium — „chciałbym, żeby liczył się jak ćwiczenie główne". Reguła
 * zostaje (bez niej każdy przysiad z B1 w szablonach dostałby 6 × 6), ale
 * trener może ją przestawić przy ćwiczeniu w obie strony — przyciskiem „G".
 */
export function bojGlownySlotu(
  slot: { lp: string; bojGlowny?: boolean }, coeff?: Coeff,
): boolean {
  return slot.bojGlowny ?? jestBojemGlownym(slot.lp, coeff);
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
export function progresjaSlotu(
  lp: string,
  tydzien: Tydzien,
  coeff?: Coeff,
  czesc: CzescPlanu = "objętość",
  /** Decyzja trenera przy slocie (`SlotPlanu.bojGlowny`); pusto = reguła. */
  bojGlownyTrenera?: boolean,
): ParametryTygodnia {
  if (bojGlownyTrenera ?? jestBojemGlownym(lp, coeff)) {
    const p = PROGRESJA_BOJU[czesc][tydzien - 1]!;
    return { serie: p.serie, powtorzenia: p.powtorzenia, rpe: p.rpe };
  }
  const podstawowe = drugiBlok(tydzien) ? RPE_AKCESORIUM.blokII : RPE_AKCESORIUM.blokI;
  const wyzej = LP_PODWYZSZONE.includes(lp.trim());
  return { serie: SERIE_AKCESORIUM, rpe: podstawowe + (wyzej ? 1 : 0) };
}
