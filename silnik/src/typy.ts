/** Wzorzec ruchu, do którego ćwiczenie dokłada obciążenie. Nie musi zgadzać się z kategorią. */
export type Part = "s" | "d" | "b" | "r" | "c";

/** 1 = główny złożony · 0,75 = pomocniczy złożony · 0,5 = semi-izolacja · 0,25 = izolacja. */
export type Coeff = 1 | 0.75 | 0.5 | 0.25;

export type Kategoria =
  | "Lower push"
  | "Lower pull"
  | "Upper push horizontal"
  | "Upper push vertical"
  | "Upper pull horizontal"
  | "Upper pull vertical"
  | "Core"
  | "Bicep"
  | "Tricep";

export type Progresja =
  | "kg"
  | "asysta"
  | "masa ciała"
  | "dodatkowy ciężar"
  | "czas"
  | "dystans"
  | "ręczne ustawienie";

/** Progresje, przy których kolumna CIĘŻAR nie pokazuje liczby, tylko nazwę progresji. */
export const PROGRESJE_BEZ_CIEZARU: readonly Progresja[] = [
  "masa ciała",
  "czas",
  "dystans",
  "ręczne ustawienie",
];

export type Cwiczenie = {
  /** EX-0001. Klucz obcy — slot referuje ćwiczenie po ID, nigdy po nazwie. */
  id: string;
  nazwa: string;
  kategoria: Kategoria;
  part: Part;
  coeff: Coeff;
  /** Najmniejszy sensowny przyrost obciążenia. */
  skokKg: number;
  progresja: Progresja;
  /**
   * Opis ćwiczenia do karty w aplikacji (09.10.2026, test biblioteki OPEX).
   * Opcjonalny — na razie tylko przy EX-0011. `nazwa` zostaje bez zmian:
   * po niej import arkusza dopasowuje ćwiczenia, a reguły (klasyczne boje,
   * TOP SET) porównują ją dosłownie. `nazwaEn` to tylko zapis do wyświetlenia.
   */
  nazwaEn?: string;
  nazwaPl?: string;
  /** Rodzaj treningu, np. „trening siłowy” — inaczej niż `kategoria` (wzorzec ruchu z BAZY). */
  rodzaj?: string;
  miesnieGlowne?: readonly string[];
  miesniePomocnicze?: readonly string[];
  sprzet?: readonly string[];
  /** Link z arkusza (kolumna filmu w BAZIE). Film odtwarzany w aplikacji: `wideo.ts`. */
  film?: string;
  /**
   * Skąd ćwiczenie: brak = BAZA trenera (arkusz 5.17 i jego dopiski);
   * `tom` / `catalyst` = import biblioteki filmów (09.10.2026,
   * `docs/dane/biblioteka-cwiczen.json`). Ćwiczenia z bibliotek trener
   * wybiera ręcznie — generator ich nie losuje.
   */
  biblioteka?: "tom" | "catalyst";
  /**
   * Trener usunął ćwiczenie z wyboru (arkusz weryfikacji bibliotek). Zostaje
   * w danych, bo mogło już trafić do planu — plan dalej się otwiera i eksportuje,
   * tylko wyszukiwarka go nie podsuwa.
   */
  ukryte?: boolean;
  uwagi?: string;
  /** Duplikat zwinięty w tę pozycję. */
  scaloneId?: string;
  /**
   * Ćwiczenie wykonywane osobno na każdą stronę. BAZA 5.17 nie ma takiej kolumny —
   * flaga pochodzi z markera w nazwie (`s/a`, `s/l`, `alternating`) albo z decyzji
   * trenera dla wzorców z natury jednostronnych (wykrok, pistol, bułgarski…).
   * Na razie tylko oznaczenie: stres liczy się identycznie jak dla obustronnych,
   * dokładnie jak w arkuszu.
   */
  jednostronne?: boolean;
  /**
   * Wzorzec z natury jednostronny, ale bez markera w nazwie — czeka na decyzję trenera.
   * Dziś pusta: wszystkie rozstrzygnięte. Zostaje dla ćwiczeń dokładanych w przyszłości.
   */
  jednostronneDoPotwierdzenia?: boolean;
};

/**
 * Wartości dopuszczalne — jako listy, nie tylko jako typy.
 *
 * Typ znika przy uruchomieniu, a serwer musi sprawdzić w locie, czy to, co
 * przyszło z sieci, jest jedną z tych wartości. Trzymanie listy i typu obok
 * siebie znaczyłoby dwa źródła prawdy, więc typ wywodzi się z listy.
 */
export const ODCZUCIA = ["OK", "za łatwe", "za trudne"] as const;
export type Feedback = (typeof ODCZUCIA)[number];

export type Tydzien = 1 | 2 | 3 | 4 | 5 | 6;
/** Tygodnie po cyklu: 7 — deload, 8 — maksy. Oba opcjonalne, numery stałe. */
export type TydzienDodatkowy = 7 | 8;
export type TydzienCyklu = Tydzien | TydzienDodatkowy;

export const TRYBY_AKCESORIOW = ["trzymaj z bloku", "licz z RPE"] as const;
export type TrybAkcesoriow = (typeof TRYBY_AKCESORIOW)[number];

/**
 * Części planu — przełącznik „Część planu" w konsoli. Siła: „objętość" (cz. 1)
 * i „intensywność" (cz. 2). Hipertrofia: „hipertrofia" (cz. 1, od 25.09.2026)
 * i „hipertrofia 2" (cz. 2, od 27.09.2026). Kontynuacja to ten sam szablon
 * z drugą częścią — tak jak „(cz. 2)" w Base44, gdzie układ się nie zmieniał.
 */
export const CZESCI_PLANU = ["objętość", "intensywność", "hipertrofia", "hipertrofia 2"] as const;
export type CzescPlanu = (typeof CZESCI_PLANU)[number];

/** Obie części hipertroficzne — bez TOP SETU, z własnymi zakresami powtórzeń. */
export function jestHipertrofia(czesc: CzescPlanu): boolean {
  return czesc === "hipertrofia" || czesc === "hipertrofia 2";
}

/** Komunikaty, które arkusz wyświetla w kolumnie CIĘŻAR zamiast liczby. */
export type KomunikatCiezaru = "— brak 1RM" | "— ustaw ręcznie";

/** Liczba (kg), komunikat błędu albo nazwa progresji bezciężarowej. */
export type WynikCiezaru = number | KomunikatCiezaru | Progresja;

export type Stres = {
  calkowity: number;
  centralny: number;
  obwodowy: number;
};

export type PoziomKontroli = "blad" | "ostrzezenie" | "info";

export type Uwaga = {
  kod: string;
  poziom: PoziomKontroli;
  opis: string;
  pozycje: string[];
};
