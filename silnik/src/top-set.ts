import type { CzescPlanu, Tydzien } from "./typy.ts";

/**
 * TOP SET — jedno powtórzenie na ciężarze bliskim maksimum, przed właściwą
 * pracą dnia. W arkuszu stoi w osobnym wierszu nad tabelą.
 *
 * Są tu dwie różne rzeczy i nie wolno ich mylić:
 *
 *   1. **Gdzie TOP SET może stanąć.** Wszędzie. Decyduje trener, klikając
 *      przy konkretnym ćwiczeniu. Aplikacja nie zgaduje i nie blokuje.
 *   2. **Gdzie TOP SET zwykle stoi.** To wiedza trenera, spisana niżej —
 *      potrzebna wtedy, gdy plan ma się rozpisać sam.
 *
 * Wcześniej stała tu reguła zamiast wiedzy: TOP SET pojawiał się wyłącznie
 * przy ćwiczeniu z coeff 1,0. To było za wąsko i za szeroko naraz —
 * odbierało trenerowi wybór, a jednocześnie proponowało TOP SET przy dipach
 * i wykrokach, bo one też mają coeff 1,0.
 */

/**
 * Ćwiczenia, przy których TOP SET pojawia się zwyczajowo. Słowa trenera:
 * „zazwyczaj top set będzie tylko do ćwiczeń barbell bench press, low bar
 * squat, high bar squat, deadlift, sumo deadlift — w innych przypadkach się
 * nie zdarza **niezależnie od coeff**".
 *
 * Nazwy z katalogu, z dwoma przypisami:
 *   • „high bar squat" to `Barbell back squat` — przysiad ze sztangą wysoko,
 *     domyślny wariant bez dopisku;
 *   • `Sumo deadlift` nie istnieje w BAZIE 5.17 — dodany osobno 20.09.2026
 *     na prośbę trenera, z parametrami jak Deadlift (`EX-0204`).
 *
 * Lista nie ogranicza niczego, co trener robi ręcznie — służy rozpisywaniu
 * automatycznemu i podpowiedzi w konsoli.
 */
export const CWICZENIA_ZWYCZAJOWO_Z_TOP_SETEM: readonly string[] = [
  "Barbell bench press",
  "Barbell low bar squat",
  "Barbell back squat",
  "Deadlift",
  "Sumo deadlift",
];

const ZNORMALIZOWANE = new Set(
  CWICZENIA_ZWYCZAJOWO_Z_TOP_SETEM.map((n) => n.trim().toLowerCase()),
);

/**
 * Czy przy tym ćwiczeniu TOP SET jest czymś zwyczajnym.
 *
 * Porównujemy po nazwie, nie po identyfikatorze, bo identyfikatory BAZY
 * (`EX-0011`) są numerami wierszy arkusza i zmieniają się przy scaleniach;
 * nazwa jest tym, co trener widzi i czym się posługuje.
 */
export function zwyczajowyTopSet(nazwa?: string | null): boolean {
  return ZNORMALIZOWANE.has((nazwa ?? "").trim().toLowerCase());
}

/**
 * RPE TOP SETU tydzień po tygodniu — tak jak w arkuszach trenera.
 *
 * W cz.1 idzie 6 → 6,5 → 7 → 7,5 → 8, w cz.2 o stopień wyżej: 7 → 7,5 → 8 →
 * 8,5 → 9. Skok jest ten sam, pół stopnia na tydzień; części różni punkt
 * wyjścia. Odczytane z „Szablon 3 dni, 3 złożone cz.1 / cz.2", Day I.
 *
 * **W T1 TOP SETU nie ma i to nie jest przeoczenie** — w obu arkuszach
 * pierwszy tydzień jest bez niego, TOP SET wchodzi dopiero w drugim. Dlatego
 * stoi tu `null`, a nie liczba: „nie ma" to co innego niż „jest, na RPE 6".
 * Trener może wpisać RPE także w T1 i wtedy TOP SET tam będzie — wpisana
 * liczba zawsze wygrywa z szablonem.
 *
 * ── Dlaczego te liczby są NIŻSZE niż w periodyzacji źródłowej ─────────
 *
 * Kto porówna to z arkuszem periodyzacji (`docs/dane/periodyzacja-13-tygodni.json`),
 * zobaczy, że TOP SET wychodzi tam o cały punkt RPE wyżej — przy wyciskaniu
 * z maksem 115 kg równe 5 kg więcej w każdym tygodniu. **To jest świadoma
 * decyzja trenera z 21.09.2026, nie rozjazd do naprawienia:**
 *
 *   „zostawmy tak jak jest, żeby wartości kilogramów nadawały się dla
 *    trenujących mniej zaawansowanych i były bezpieczniejsze, skoro
 *    z aplikacji ma korzystać szerokie grono odbiorców".
 *
 * Periodyzacja powstała dla jednej osoby pod sztangą, którą trener widział
 * na oczy. Aplikacja rozpisuje pojedyncze na maksimum komuś, kogo nikt nie
 * obserwuje — i tam pół kroku zapasu jest warte więcej niż zgodność
 * z tabelą. Podniesienie tych liczb wymaga decyzji trenera, nie uznania,
 * że ktoś się kiedyś pomylił.
 */
export const PROGRESJA_TOP_SETU: Record<CzescPlanu, readonly (number | null)[]> = {
  "objętość":     [null, 6, 6.5, 7, 7.5, 8],
  "intensywność": [null, 7, 7.5, 8, 8.5, 9],
  // Hipertrofia TOP SETU nie ma wcale — tak jest we wszystkich czterech
  // szablonach „Hipertroficzny". Wpisane ręcznie RPE dalej wygrywa.
  "hipertrofia":  [null, null, null, null, null, null],
};

/** RPE TOP SETU z szablonu na ten tydzień; `null` = w tym tygodniu go nie ma. */
export function rpeTopSetu(czesc: CzescPlanu, tydzien: Tydzien): number | null {
  return PROGRESJA_TOP_SETU[czesc][tydzien - 1] ?? null;
}
