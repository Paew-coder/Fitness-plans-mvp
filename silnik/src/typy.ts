/** Wzorzec ruchu, do którego ćwiczenie dokłada obciążenie. Nie musi zgadzać się z kategorią. */
export type Part = "s" | "d" | "b" | "r" | "c";

/** 1 = główny złożony · 0,75 = pomocniczy złożony · 0,5 = semi-izolacja · 0,25 = izolacja. */
export type Coeff = 1 | 0.75 | 0.5 | 0.25;

/** Kategorie siłowe — wzorce ruchu z BAZY 5.17 (arkusz trenera). */
export const KATEGORIE_SILOWE = [
  "Lower push", "Lower pull", "Upper push horizontal", "Upper push vertical",
  "Upper pull horizontal", "Upper pull vertical", "Core", "Bicep", "Tricep",
] as const;

/**
 * Mobilność stawów — każdy staw osobną kategorią (trener, 27.10.2026: „każdy
 * staw żeby miał swoją kategorię i do niej przypasowane ćwiczenia”).
 * Ćwiczenie mobilizacyjne ma ją jako główną; ćwiczenie siłowe z dużym
 * zakresem ruchu — jako dodatkową (`kategorieDodatkowe`), np. Front foot
 * elevated split squat: Lower push i Ankle mobility.
 */
export const KATEGORIE_MOBILNOSCI = [
  "Spine mobility", "Shoulder mobility", "Elbow mobility", "Wrist mobility",
  "Hip mobility", "Knee mobility", "Ankle mobility",
] as const;

/**
 * Plyometria (trener, 30.10.2026: „kategoria Plyometria, gdzie będą wszystkie
 * ćwiczenia plyometryczne typu np. skoki”). Przypisana jako dodatkowa —
 * kategoria główna zostaje (Lower push przy skokach, Upper push przy rzutach
 * piłką), bo z niej idzie arkusz 5.18 i szkielet asystenta. Box jump jest
 * więc w „Lower push” i w „Plyometria”. Przypisania: `narzedzia/mobilnosc.py`.
 */
export const KATEGORIA_PLYOMETRII = "Plyometria";

export const KATEGORIE = [...KATEGORIE_SILOWE, KATEGORIA_PLYOMETRII, ...KATEGORIE_MOBILNOSCI] as const;
export type Kategoria = (typeof KATEGORIE)[number];

/** Ćwiczenie w kategorii — głównej albo jednej z dodatkowych. */
export const wKategorii = (c: { kategoria: Kategoria; kategorieDodatkowe?: readonly Kategoria[] }, k: Kategoria): boolean =>
  c.kategoria === k || (c.kategorieDodatkowe?.includes(k) ?? false);

export type Progresja =
  | "kg"
  | "asysta"
  | "masa ciała"
  | "dodatkowy ciężar"
  | "czas"
  | "dystans"
  | "ręczne ustawienie";

/**
 * Progresje, przy których ciężar idzie z tabeli %1RM (19.10.2026). Tabela
 * kończy się na 15 powtórzeniach — tylko tu 15 jest granicą; przy masie
 * ciała, czasie czy gumie powtórzeń może być więcej.
 */
export const PROGRESJE_Z_TABELI: readonly Progresja[] = ["kg", "dodatkowy ciężar"];

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
  /**
   * Kategorie, w których ćwiczenie też się pokazuje (27.10.2026) — dziś
   * mobilność stawów przy ćwiczeniach siłowych z dużym zakresem ruchu
   * (Dumbbell fly: Upper push horizontal i Shoulder mobility). Lista w slocie,
   * filtr bazy i kontrola szkieletu biorą je pod uwagę; ciężar, stres
   * i arkusz liczą się z głównej `kategoria`.
   */
  kategorieDodatkowe?: readonly Kategoria[];
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
   * Dodane przez trenera w konsoli (17.10.2026) — leży w bazie danych, nie
   * w plikach, i wchodzi do katalogu przy starcie serwera. Generator go nie
   * losuje — trener wybiera je ręcznie.
   */
  wlasne?: true;
  /**
   * Własne ćwiczenie tylko do jednego planu (27.10.2026). Trener: „wpisuję
   * ćwiczenie do planu, który tworzę, ale nie dodaje się ono do bazy ćwiczeń”.
   * Liczy się w planie, na telefonie i w eksporcie jak każde inne, ale nie ma
   * go na liście wyboru — poza planem, dla którego powstało (`planId`), i tym,
   * w którym już stoi.
   */
  jednorazowe?: true;
  planId?: string;
  /**
   * Ćwiczenie z BAZY albo z biblioteki poprawione przez trenera w konsoli
   * (27.10.2026, ekran „Baza ćwiczeń”). Poprawka leży w bazie danych konsoli,
   * pliki BAZY zostają bez zmian — „Przywróć oryginał” ją zdejmuje.
   */
  poprawione?: true;
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
  /**
   * Guma wskazana wprost przez trenera (27.10.2026, okienko ćwiczenia: „nie mam
   * opcji do wybrania przy ćwiczeniu, które chcę zrobić z gumą”). `true` —
   * ćwiczenie z gumą, choć nazwa i sprzęt tego nie mówią; `false` — bez gumy,
   * choć „band” stoi w nazwie. Brak — jak dotąd, z nazwy i sprzętu (`zGuma`).
   */
  guma?: boolean;
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
export type WynikCiezaru = number | KomunikatCiezaru | Progresja | "guma";

/**
 * Ćwiczenie z gumą bez kilogramów (trener, 17.10.2026: przy „SL Glute Bridge
 * ISO Band Hip Flexion” w kolumnie ciężaru stało „czas”, „a to jest ćwiczenie
 * z gumą — musimy zrobić osobny wpis w tamto miejsce dla ćwiczeń z gumą”).
 * Guma w sprzęcie albo „band” w nazwie, a progresja bez kilogramów (czas,
 * ręczne ustawienie, asysta, masa ciała, dystans). Guma razem ze sztangą czy
 * hantlami zostaje przy kilogramach — także gdy progresja jest ręczna
 * („Band on DB 90/90 Ext. Rot”: kilogramy hantli wpisuje trener).
 * Wybór trenera w okienku ćwiczenia (`guma`, 27.10.2026) idzie przed nazwą
 * i sprzętem — ale nie przed kilogramami.
 */
const OBCIAZENIE = ["sztanga", "hantle", "kettlebell", "talerz", "landmine", "wyciąg",
  "maszyna", "trap bar", "gryf łamany", "piłka lekarska", "sanie", "kamizelka"];
export function zGuma(c: { nazwa: string; progresja: Progresja; sprzet?: readonly string[]; guma?: boolean }): boolean {
  if (c.progresja === "kg" || c.progresja === "dodatkowy ciężar") return false;
  if (c.guma !== undefined) return c.guma;
  const sprzet = c.sprzet ?? [];
  if (sprzet.some((s) => OBCIAZENIE.includes(s))) return false;
  return sprzet.includes("guma") || /\bband(s|ed)?\b/i.test(c.nazwa);
}

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
