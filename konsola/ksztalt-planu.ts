/**
 * Kontrola kształtu planu na wejściu do serwera.
 *
 * To jest granica między tym, co przyszło z sieci, a tym, co idzie do silnika
 * i do bazy. Silnik zakłada, że dostaje plan — i ma pełne prawo zakładać, bo
 * jest czystą matematyką. Sprawdzenie, czy to naprawdę plan, należy tutaj.
 *
 * Dwa rodzaje szkody, które to zatrzymuje:
 *
 *   1. **Awaria zamiast odmowy.** `sloty` jako tekst dawało „plan.sloty.filter
 *      is not a function" z kodem 500 — czyli komunikat z wnętrza Node'a
 *      zamiast zdania po polsku.
 *   2. **Cichy zapis czegoś, co nie jest planem.** Plan bez `sloty` albo z
 *      `serieMaksymalne` jako tekstem zapisywał się bez słowa i psuł dopiero
 *      przy odczycie — czyli trener tracił dostęp do cyklu, którego przed
 *      chwilą używał.
 *
 * Sprawdzamy **kształt**, nie sens. Czy plan ma sens — czy ćwiczenia są z BAZY,
 * czy da się policzyć ciężary — mówi `sprawdzPlan` w silniku, i to jest osobne
 * pytanie, zadawane po wczytaniu.
 */
import { TRYBY_AKCESORIOW, CZESCI_PLANU } from "../silnik/src/typy.ts";

/** Szkielet to 5 dni po 12 pozycji; zapas na wypadek zmiany układu. */
const MAX_SLOTOW = 100;
const MAX_SERII = 300;
const MAX_TOPSETOW = 20;

const jestObiektem = (w: unknown): w is Record<string, unknown> =>
  typeof w === "object" && w !== null && !Array.isArray(w);

const jestLiczba = (w: unknown): w is number =>
  typeof w === "number" && Number.isFinite(w);

/**
 * Zwraca komunikat po polsku albo `null`, gdy kształt jest w porządku.
 * Komunikat trafia wprost do trenera, więc mówi, co jest nie tak, a nie
 * którą funkcję to wywróciło.
 */
export function bladKsztaltuPlanu(plan: unknown): string | null {
  if (!jestObiektem(plan)) return "Plan musi być obiektem";

  // ── sloty ─────────────────────────────────────────────────────────
  if (!Array.isArray(plan.sloty)) return "Plan musi mieć listę slotów";
  if (plan.sloty.length > MAX_SLOTOW) {
    return `Plan może mieć najwyżej ${MAX_SLOTOW} slotów`;
  }
  for (const [i, slot] of plan.sloty.entries()) {
    const gdzie = `Slot ${i + 1}`;
    if (!jestObiektem(slot)) return `${gdzie} nie jest obiektem`;
    if (typeof slot.positionId !== "string" || !slot.positionId) {
      return `${gdzie} nie ma identyfikatora pozycji`;
    }
    if (!jestLiczba(slot.dzien)) return `${gdzie} nie ma numeru dnia`;
    if (slot.cwiczenieId != null && typeof slot.cwiczenieId !== "string") {
      return `${gdzie}: ćwiczenie musi być identyfikatorem albo pustką`;
    }
    if (slot.tygodnie != null && !jestObiektem(slot.tygodnie)) {
      return `${gdzie}: tygodnie muszą być obiektem`;
    }
    for (const [tydzien, parametry] of Object.entries(slot.tygodnie ?? {})) {
      if (!jestObiektem(parametry)) {
        return `${gdzie}, tydzień ${tydzien}: parametry muszą być obiektem`;
      }
    }
  }

  // ── serie maksymalne ──────────────────────────────────────────────
  if (!Array.isArray(plan.serieMaksymalne)) {
    return "Plan musi mieć listę serii maksymalnych";
  }
  if (plan.serieMaksymalne.length > MAX_SERII) {
    return `Plan może mieć najwyżej ${MAX_SERII} serii maksymalnych`;
  }
  for (const [i, seria] of plan.serieMaksymalne.entries()) {
    const gdzie = `Seria maksymalna ${i + 1}`;
    if (!jestObiektem(seria)) return `${gdzie} nie jest obiektem`;
    if (typeof seria.cwiczenieId !== "string" || !seria.cwiczenieId) {
      return `${gdzie} nie wskazuje ćwiczenia`;
    }
    if (!jestLiczba(seria.ciezar) || !jestLiczba(seria.powtorzenia)) {
      return `${gdzie}: ciężar i powtórzenia muszą być liczbami`;
    }
  }

  // ── TOP SETY ──────────────────────────────────────────────────────
  if (plan.topSety != null && !Array.isArray(plan.topSety)) {
    return "TOP SETY muszą być listą";
  }
  if (((plan.topSety as unknown[]) ?? []).length > MAX_TOPSETOW) {
    return `Plan może mieć najwyżej ${MAX_TOPSETOW} TOP SETÓW`;
  }
  for (const [i, top] of ((plan.topSety as unknown[]) ?? []).entries()) {
    if (!jestObiektem(top)) return `TOP SET ${i + 1} nie jest obiektem`;
    if (!jestLiczba(top.dzien)) return `TOP SET ${i + 1} nie ma numeru dnia`;
  }

  // ── przełączniki ──────────────────────────────────────────────────
  if (!TRYBY_AKCESORIOW.includes(plan.trybAkcesoriow as never)) {
    return `Tryb akcesoriów musi być jednym z: ${TRYBY_AKCESORIOW.join(", ")}`;
  }
  if (!CZESCI_PLANU.includes(plan.czescPlanu as never)) {
    return `Część planu musi być jedną z: ${CZESCI_PLANU.join(", ")}`;
  }

  return null;
}

/** Data w formacie, który rozumie i baza, i pole `<input type="date">`. */
export function bladDatyStartu(data: unknown): string | null {
  if (data == null || data === "") return null;
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return "Data startu musi być w formacie RRRR-MM-DD";
  }
  // `Date.parse` przyjmuje 30 lutego i po cichu przesuwa na 2 marca — czyli
  // cykl zaczynałby się innego dnia, niż trener wpisał. Porównanie po powrocie
  // do tekstu wychwytuje każdą taką datę.
  const data_ = new Date(`${data}T00:00:00Z`);
  const wroconaData = Number.isNaN(data_.getTime())
    ? "" : data_.toISOString().slice(0, 10);
  return wroconaData === data ? null : "Data startu nie istnieje w kalendarzu";
}
