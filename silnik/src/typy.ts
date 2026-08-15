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
  film?: string;
  uwagi?: string;
  /** Duplikat zwinięty w tę pozycję. */
  scaloneId?: string;
  /**
   * Ćwiczenie wykonywane osobno na każdą stronę. BAZA 5.17 nie ma takiej kolumny —
   * flaga pochodzi z jawnego markera w nazwie (`s/a`, `s/l`, `alternating`).
   * Na razie tylko oznaczenie: stres liczy się identycznie jak dla obustronnych,
   * dokładnie jak w arkuszu.
   */
  jednostronne?: boolean;
  /** Wzorzec z natury jednostronny, ale bez markera w nazwie — czeka na decyzję trenera. */
  jednostronneDoPotwierdzenia?: boolean;
};

export type Feedback = "OK" | "za łatwe" | "za trudne";

export type Tydzien = 1 | 2 | 3 | 4 | 5 | 6;

export type TrybAkcesoriow = "trzymaj z bloku" | "licz z RPE";

export type CzescPlanu = "objętość" | "intensywność";

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
