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
