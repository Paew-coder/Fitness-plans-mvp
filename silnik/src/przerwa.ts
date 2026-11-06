/**
 * Ile odpoczywać między seriami.
 *
 * Przerwa jest jedyną liczbą w treningu, której arkusz nigdy nie zawierał —
 * bo na papierze nie ma jej po co pisać. Trener mówił ją na sali. Aplikacja,
 * która prowadzi klienta seria po serii, musi ją znać: bez niej licznik nie ma
 * od czego odliczać, a klient stoi ze sztangą i zgaduje.
 *
 * **Rozstrzyga `coeff`** — ta sama liczba, która w BAZIE mówi, jak ciężkie jest
 * ćwiczenie. Bój główny wymaga pełnego odpoczynku, izolacja prawie żadnego,
 * a wszystko po drodze jest po drodze. Innego źródła tej wiedzy nie mamy
 * i wymyślanie osobnej kolumny w BAZIE byłoby powtarzaniem tego, co już stoi
 * w `coeff`.
 *
 * Skąd te konkretne wartości: z aplikacji trenera na Base44, gdzie stały
 * dokładnie w tym układzie (180 / 120 / 90 / 60 sekund wg `coef`). To jego
 * własne liczby, nie nasze — dlatego bierzemy je bez poprawiania. Gdyby miały
 * się zmienić, zmienia się ta jedna tabela i nic więcej.
 */
import type { Coeff } from "./typy.ts";

/** Sekundy przerwy wg ciężkości ćwiczenia. */
export const PRZERWA_SEKUND: Record<Coeff, number> = {
  1: 180,      // bój główny — przysiad, martwy ciąg, wyciskanie
  0.75: 120,   // pomocnicze złożone
  0.5: 90,     // semi-izolacja
  0.25: 60,    // izolacja
};

/**
 * Domyślna przerwa, gdy `coeff` nie jest znany.
 *
 * Bierzemy środek, nie zero: licznik, który nie wie, ile odliczać, ma milczeć
 * zbyt długo, a nie zbyt krótko. Zbyt krótka przerwa wygląda jak polecenie
 * „wracaj do sztangi" i zostanie tak odczytana.
 */
export const PRZERWA_DOMYSLNA = 90;

/** Ile sekund przerwy po serii tego ćwiczenia. */
export function przerwaSekund(coeff?: Coeff | null): number {
  return coeff == null ? PRZERWA_DOMYSLNA : PRZERWA_SEKUND[coeff] ?? PRZERWA_DOMYSLNA;
}
