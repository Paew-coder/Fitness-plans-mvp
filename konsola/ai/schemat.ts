/**
 * Sprawdzanie schematów JSON, którymi wiążemy odpowiedź modelu.
 *
 * Structured outputs przyjmuje tylko podzbiór JSON Schema. Schemat spoza tego
 * podzbioru nie jest cichym problemem — API odrzuca całe zapytanie błędem 400,
 * czyli funkcja wywala się dopiero u trenera, przy kliknięciu. Ten plik pozwala
 * złapać to testem, zanim ktokolwiek kliknie.
 *
 * Źródło ograniczeń: dokumentacja structured outputs (obsługiwane: typy proste,
 * `enum`, `const`, `anyOf`/`allOf`, `$ref`; nieobsługiwane: schematy rekurencyjne,
 * ograniczenia liczbowe i długości, `additionalProperties` inne niż `false`).
 */

/** Słowa kluczowe, których structured outputs nie przyjmuje. */
const ZAKAZANE = [
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern",
  "minItems", "maxItems", "uniqueItems", "contains",
  "minProperties", "maxProperties", "patternProperties", "dependentSchemas",
];

/**
 * Zwraca listę problemów. Pusta lista = schemat da się wysłać.
 *
 * Poza ograniczeniami API pilnujemy jednej zasady własnej: każde pole
 * wymienione w `properties` musi być w `required`. Pole opcjonalne w odpowiedzi
 * modelu znaczy, że kod po drugiej stronie musi obsłużyć jego brak — a to jest
 * dokładnie ten rodzaj „prawie zawsze działa", którego tu nie chcemy.
 */
export function sprawdzSchemat(schemat: unknown, sciezka = "$"): string[] {
  if (schemat === null || typeof schemat !== "object") return [];
  if (Array.isArray(schemat)) {
    return schemat.flatMap((s, i) => sprawdzSchemat(s, `${sciezka}[${i}]`));
  }

  const s = schemat as Record<string, unknown>;
  const problemy: string[] = [];

  for (const slowo of ZAKAZANE) {
    if (slowo in s) problemy.push(`${sciezka}: „${slowo}" nie jest obsługiwane`);
  }

  if (s.type === "object") {
    if (s.additionalProperties !== false) {
      problemy.push(`${sciezka}: obiekt musi mieć additionalProperties: false`);
    }
    const wlasciwosci = Object.keys((s.properties as object) ?? {});
    const wymagane = new Set((s.required as string[]) ?? []);
    for (const nazwa of wlasciwosci) {
      if (!wymagane.has(nazwa)) problemy.push(`${sciezka}: pole „${nazwa}" musi być w required`);
    }
    for (const [nazwa, pod] of Object.entries((s.properties as object) ?? {})) {
      problemy.push(...sprawdzSchemat(pod, `${sciezka}.${nazwa}`));
    }
  }

  if (s.items) problemy.push(...sprawdzSchemat(s.items, `${sciezka}[]`));
  for (const zlozony of ["anyOf", "allOf", "oneOf"]) {
    if (s[zlozony]) problemy.push(...sprawdzSchemat(s[zlozony], `${sciezka}.${zlozony}`));
  }

  return problemy;
}
