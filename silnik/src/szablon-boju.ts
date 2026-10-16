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
import type { Coeff, CzescPlanu, Progresja, Tydzien } from "./typy.ts";
import { jestHipertrofia } from "./typy.ts";

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
  // Hipertrofia cz. 2 — trener, 27.09.2026: zakres o dwa niżej, to samo RPE.
  // Base44 miał tę kontynuację tylko z nazwy (bez liczb).
  "hipertrofia 2": [
    { serie: 4, powtorzenia: 10, rpe: 8 },    // T1
    { serie: 4, powtorzenia: 11, rpe: 8 },    // T2
    { serie: 4, powtorzenia: 12, rpe: 8 },    // T3
    { serie: 4, powtorzenia: 10, rpe: 9 },    // T4 — początek drugiego bloku
    { serie: 4, powtorzenia: 11, rpe: 9 },    // T5
    { serie: 4, powtorzenia: 12, rpe: 9 },    // T6
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

/** Numer pozycji bez kropki i spacji, wielkimi literami: „a2.” → „A2”, brak → „”. */
export function numerLp(lp: string | null | undefined): string {
  return (lp ?? "").trim().replace(/\.$/, "").toUpperCase();
}

/** Pozycja A — miejsce boju głównego w numeracji arkusza. */
export function pozycjaBoju(lp: string): boolean {
  return lp.trim().toUpperCase().startsWith("A");
}

/**
 * Bój główny: ćwiczenie złożone (coeff 1,0) z ciężarem — **na każdej pozycji**.
 *
 * Trener, 16.10.2026: „mam ćwiczenie barbell bench press jako B1 i liczy mi się
 * jako akcesorium — zrób tak, żeby ćwiczenia, które mają swoją własną
 * progresję, zawsze miały ją docelowo w planie niezależnie od miejsca
 * w rozpisce”. Do tego dnia bojem była tylko pozycja A (niżej — dlaczego
 * sama pozycja nie wystarczała); poza A trzeba było klikać „G”. Teraz
 * pozycja liczy się tylko przy złożonych bez kilogramów (dipy na masie ciała,
 * przysiad bułgarski z asystą) — tam bój w A jak dotąd, a gdzie indziej ich
 * własny automat powtórzeń. „G” dalej przestawia rolę w obie strony.
 *
 * Historia reguły. Sama pozycja nie wystarcza i to jest tu sedno. Arkusz rozstrzygał o tym
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
export function jestBojemGlownym(lp: string, coeff?: Coeff, progresja?: Progresja): boolean {
  if (coeff !== 1) return false;
  return (progresja !== undefined && PROGRESJE_BOJU_WSZEDZIE.includes(progresja)) || pozycjaBoju(lp);
}

/** Progresje z kilogramami — przy nich bój obowiązuje na każdej pozycji (16.10.2026). */
export const PROGRESJE_BOJU_WSZEDZIE: readonly Progresja[] = ["kg", "dodatkowy ciężar"];

/**
 * Bój główny w konkretnym slocie: decyzja trenera, a bez niej reguła wyżej.
 *
 * Trener, 26.09.2026: front squat stał u Marka X na B1 i liczył się jak
 * akcesorium — „chciałbym, żeby liczył się jak ćwiczenie główne". Reguła
 * zostaje (bez niej każdy przysiad z B1 w szablonach dostałby 6 × 6), ale
 * trener może ją przestawić przy ćwiczeniu w obie strony — przyciskiem „G".
 */
export function bojGlownySlotu(
  slot: { lp: string; bojGlowny?: boolean }, coeff?: Coeff, progresja?: Progresja,
): boolean {
  return slot.bojGlowny ?? jestBojemGlownym(slot.lp, coeff, progresja);
}

/**
 * Część planu, według której liczy się bój w tym slocie.
 *
 * Trener, 27.09.2026: w planie hipertroficznym chce móc zrobić „standardowo
 * ćwiczenie główne razem z TOP SETEM". Bój oznaczony jako siłowy (przycisk
 * „S", `SlotPlanu.bojSilowy`) liczy się wtedy jak w części siłowej tego
 * samego etapu — hipertrofia cz. 1 → objętość, cz. 2 → intensywność — razem
 * z RPE TOP SETU. Akcesoria zostają hipertroficzne. Poza hipertrofią
 * znacznik nic nie zmienia.
 */
export function czescBoju(czesc: CzescPlanu, bojSilowy?: boolean): CzescPlanu {
  if (!bojSilowy || !jestHipertrofia(czesc)) return czesc;
  return czesc === "hipertrofia" ? "objętość" : "intensywność";
}

/**
 * Ćwiczenia pauzowane — własna progresja z periodyzacji trenera.
 *
 * Trener, 02.10.2026 (zrzut arkusza: Blok I i II, 5 tygodni + deload):
 * „paused bench press i paused squat mają w tej periodyzacji swoją własną
 * progresję — aktualnie paused bench press liczy mi się jak ćwiczenie
 * akcesoryjne”. Jego decyzje:
 *
 * - cz.1 (objętość) = Blok I, cz.2 (intensywność) = Blok II; tygodnie 1–5
 *   jeden do jednego jako T1–T5, **T6 jak T5** (szczyt trzymany dwa tygodnie);
 *   deload aplikacji (T7) wychodzi z T6 jak przy każdym ćwiczeniu;
 * - pauzowany przysiad w cz.1 ma liczby „RAW squat” z Bloku I (ten sam slot
 *   w jego periodyzacji), w cz.2 — „pause lowbar squat” z Bloku II;
 * - **zawsze, na każdej pozycji** (A, B, C…), chyba że trener kliknie „G” —
 *   wtedy zwykły bój. W hipertrofii jak dotąd, chyba że „S”.
 *
 * Ciężar jak przy boju: z 1RM tego ćwiczenia i RPE z tabeli, co tydzień.
 * Arkusz trenera daje tak samo 85 · 87,5 · 90 · 92,5 kg przy 1RM pauzowanego
 * wyciskania ≈ 102 kg.
 */
export type RodzajPauzy = "wyciskanie" | "przysiad";

/** Które ćwiczenia z BAZY liczą się progresją pauzowaną. */
export const PAUZOWANE: Readonly<Record<string, RodzajPauzy>> = {
  "EX-0022": "wyciskanie",   // Bench press paused 3sec
  "EX-0205": "przysiad",     // Barbell low bar squat paused 3sec (dodany 02.10.2026)
};

const t = (serie: number, powtorzenia: number, rpe: number): ParametryBoju => ({ serie, powtorzenia, rpe });

export const PROGRESJA_PAUZY: Record<RodzajPauzy, Record<"objętość" | "intensywność", readonly ParametryBoju[]>> = {
  wyciskanie: {
    // 4ct pause BP, Blok I
    "objętość": [t(5, 3, 7.5), t(5, 3, 8), t(4, 3, 8), t(5, 3, 8.5), t(5, 2, 8.5), t(5, 2, 8.5)],
    // 3ct pause BP, Blok II
    "intensywność": [t(5, 4, 8), t(5, 4, 8), t(5, 3, 8), t(5, 4, 9), t(4, 3, 8.5), t(4, 3, 8.5)],
  },
  przysiad: {
    // RAW squat, Blok I
    "objętość": [t(4, 5, 7), t(4, 5, 8), t(4, 5, 8.5), t(4, 4, 8.5), t(4, 4, 9), t(4, 4, 9)],
    // pause lowbar squat, Blok II
    "intensywność": [t(4, 5, 8), t(4, 5, 8.5), t(4, 4, 8.5), t(4, 4, 9), t(4, 5, 9), t(4, 5, 9)],
  },
};

/**
 * Czy ten slot liczy się progresją pauzowaną — a jeśli tak, którą.
 * `null`: ćwiczenie nie jest pauzowane, trener ustawił „G” (zwykły bój albo
 * akcesorium z jego decyzji) albo część jest hipertroficzna bez „S”.
 */
export function pauzaSlotu(
  slot: { bojGlowny?: boolean; bojSilowy?: boolean },
  cwiczenieId: string | null | undefined,
  czescPlanu: CzescPlanu,
): RodzajPauzy | null {
  const rodzaj = cwiczenieId ? PAUZOWANE[cwiczenieId] : undefined;
  if (!rodzaj || slot.bojGlowny !== undefined) return null;
  return jestHipertrofia(czescBoju(czescPlanu, slot.bojSilowy)) ? null : rodzaj;
}

/**
 * Dwubój olimpijski — rwanie i zarzut — własna progresja w % 1RM.
 *
 * Trener, 16.10.2026, o propozycji periodyzacji clean / snatch: „to, co
 * zaproponowałeś, mi się podoba i może tak być … skok 1 kg, wdrażaj całość”.
 *
 * Dlaczego procenty, a nie RPE jak reszta planu:
 * - tabela RPE zaczyna się od 6, czyli od 76,5 % przy trójkach i 79,5 % przy
 *   dwójkach — techniczna objętość na 70–75 % się w niej nie mieści;
 * - w dwuboju o ciężarze decyduje technika i szybkość sztangi, nie „ile
 *   zostało w zapasie” — trenerzy dwuboju piszą w procentach.
 *
 * Ciężar = 1RM tego ćwiczenia × procent × korekta z ocen, zaokrąglone do
 * skoku (1 kg — talerzyki w dwuboju). RPE slotu liczy się z procentu
 * (`rpeDlaProcentu`) i służy tylko stresowi tygodnia.
 *
 * Kto: pełne, siłowe (power), z zawieszenia (hang, high/mid/low) i z bloków
 * wersje rwania i zarzutu ze sztangą oraz zarzut z podrzutem — każda od
 * własnego 1RM. Bez ciągów, martwych ciągów, ćwiczeń technicznych (muscle,
 * tall, no jump, z pozycji mocy, segmentowe), kompleksów i wersji z hantlami
 * czy kettlebellem. Na każdej pozycji, jak pauzowane; „G” robi z ćwiczenia
 * zwykły bój. W planach hipertroficznych — tabela objętościowa (rwanie po
 * 12 powtórzeń nie ma sensu); „S” daje tabelę części siłowej tego etapu.
 */
export const DWUBOJ: ReadonlySet<string> = new Set([
  // BAZA trenera
  "EX-0046",   // Clean
  "EX-0047",   // Clean pins (z bloków)
  // Theory of Motion
  "EX-1143",   // BB Clean and Jerk
  "EX-1186",   // BB High Hang Clean
  "EX-1192",   // BB High Hang Snatch
  "EX-1204",   // BB Mid Hang Clean
  "EX-1242",   // BB Snatch
  "EX-1761",   // High Hang Clean
  "EX-1763",   // High Hang Power Clean
  "EX-1764",   // High Hang Power Snatch
  "EX-1765",   // High Hang Snatch
  "EX-1767",   // High Hang Squat Clean
  "EX-1768",   // High Hang Squat Snatch
  "EX-2004",   // Low Hang Clean
  "EX-2005",   // Low Hang Power Clean
  "EX-2006",   // Low Hang Power Snatch
  "EX-2007",   // Low Hang Snatch
  "EX-2037",   // Mid Hang Clean
  "EX-2040",   // Mid Hang Power Clean
  "EX-2041",   // Mid Hang Power Snatch
  "EX-2042",   // Mid Hang Snatch
  "EX-2143",   // Power Clean
  "EX-2145",   // Power Snatch
  "EX-2630",   // Snatch
  // Catalyst Athletics
  "EX-3178",   // Block Clean & Jerk
  "EX-3185",   // Block Power Clean
  "EX-3186",   // Block Power Snatch
  "EX-3187",   // Block Snatch
  "EX-3316",   // Hang Clean
  "EX-3320",   // Hang Power Clean
  "EX-3321",   // Hang Power Snatch
  "EX-3322",   // Hang Snatch
  "EX-3421",   // Power Clean - Jerk
]);

export type ParametryDwuboju = { serie: number; powtorzenia: number; procent: number };
const d = (serie: number, powtorzenia: number, procent: number): ParametryDwuboju =>
  ({ serie, powtorzenia, procent });

/**
 * Blok objętościowy (cz. 1): 18 powtórzeń w T1 do 10 w T6, 70 → 80 %.
 * Blok intensyfikujący (cz. 2): dwójki 80–85 %, od T4 pojedyncze 85–90 %.
 * T4 otwiera drugą połowę bloku — jak w całym planie.
 */
export const PROGRESJA_DWUBOJU: Record<"objętość" | "intensywność", readonly ParametryDwuboju[]> = {
  "objętość": [d(6, 3, 70), d(6, 3, 72), d(5, 3, 75), d(6, 2, 75), d(6, 2, 78), d(5, 2, 80)],
  "intensywność": [d(6, 2, 80), d(6, 2, 82), d(5, 2, 85), d(8, 1, 85), d(7, 1, 88), d(5, 1, 90)],
};

/** Deload dwuboju (T7) — w obu blokach 4 × 2 na 70 %, bez TOP SETU. */
export const DELOAD_DWUBOJU: ParametryDwuboju = d(4, 2, 70);

/**
 * TOP SET dwuboju — najcięższa pojedyncza tygodnia przed pojedynczymi
 * z tabeli: tylko w bloku intensyfikującym, od T4. Opcjonalny — stoi, gdy
 * trener postawi przy ćwiczeniu TOP SET. `null` = w tym tygodniu go nie ma.
 */
export const PROGRESJA_TOP_SETU_DWUBOJU: Record<"objętość" | "intensywność", readonly (number | null)[]> = {
  "objętość": [null, null, null, null, null, null],
  "intensywność": [null, null, null, 88, 91, 93],
};

/** Czy ten slot liczy się progresją dwuboju: ćwiczenie z listy, a trener nie ustawił „G”. */
export function dwubojSlotu(slot: { bojGlowny?: boolean }, cwiczenieId: string | null | undefined): boolean {
  return !!cwiczenieId && DWUBOJ.has(cwiczenieId) && slot.bojGlowny === undefined;
}

/** Tabela dwuboju dla części planu — hipertrofia bierze objętościową, chyba że „S”. */
export function czescDwuboju(czesc: CzescPlanu, bojSilowy?: boolean): "objętość" | "intensywność" {
  return czescBoju(czesc, bojSilowy) === "intensywność" ? "intensywność" : "objętość";
}

/** % 1RM TOP SETU dwuboju z szablonu; `null` = w tym tygodniu go nie ma. */
export function procentTopSetuDwuboju(czesc: CzescPlanu, tydzien: Tydzien, bojSilowy?: boolean): number | null {
  return PROGRESJA_TOP_SETU_DWUBOJU[czescDwuboju(czesc, bojSilowy)][tydzien - 1] ?? null;
}

/**
 * Parametry tygodnia wg szablonu dla konkretnego slotu: progresja pauzowana,
 * bój albo akcesorium. Jedno miejsce dla planu i przycisku „wpisz progresję”.
 */
export function parametrySzablonu(
  slot: { lp: string; bojGlowny?: boolean; bojSilowy?: boolean },
  tydzien: Tydzien,
  cwiczenie: { id: string; coeff?: Coeff; progresja?: Progresja } | null | undefined,
  czescPlanu: CzescPlanu,
): ParametryTygodnia {
  if (dwubojSlotu(slot, cwiczenie?.id)) {
    const p = PROGRESJA_DWUBOJU[czescDwuboju(czescPlanu, slot.bojSilowy)][tydzien - 1]!;
    return { serie: p.serie, powtorzenia: p.powtorzenia, procent: p.procent };
  }
  const pauza = pauzaSlotu(slot, cwiczenie?.id, czescPlanu);
  if (pauza) {
    const czesc = czescBoju(czescPlanu, slot.bojSilowy) as "objętość" | "intensywność";
    const p = PROGRESJA_PAUZY[pauza][czesc][tydzien - 1]!;
    return { serie: p.serie, powtorzenia: p.powtorzenia, rpe: p.rpe };
  }
  return progresjaSlotu(slot.lp, tydzien, cwiczenie?.coeff,
    czescBoju(czescPlanu, slot.bojSilowy), slot.bojGlowny, cwiczenie?.progresja);
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
  /** Progresja ćwiczenia — z kilogramami bój obowiązuje na każdej pozycji. */
  progresja?: Progresja,
): ParametryTygodnia {
  if (bojGlownyTrenera ?? jestBojemGlownym(lp, coeff, progresja)) {
    const p = PROGRESJA_BOJU[czesc][tydzien - 1]!;
    return { serie: p.serie, powtorzenia: p.powtorzenia, rpe: p.rpe };
  }
  const podstawowe = drugiBlok(tydzien) ? RPE_AKCESORIUM.blokII : RPE_AKCESORIUM.blokI;
  const wyzej = LP_PODWYZSZONE.includes(lp.trim());
  return { serie: SERIE_AKCESORIUM, rpe: podstawowe + (wyzej ? 1 : 0) };
}
