/**
 * Wszystkie serie ćwiczenia z jednego treningu — nie tylko najcięższa.
 *
 * Do 23.09 baza trzymała przy ćwiczeniu jedną parę „ciężar × powtórzenia"
 * na tydzień: najcięższą serię. Wszystkie wpisane serie żyły wyłącznie
 * w telefonie, i to tylko dla jednego treningu naraz. Trener widział „90×6"
 * i zakładał 4 × 6 na 90 — a klient przy planie na 80 kg zrobił 90, 85, 80,
 * czyli przestrzelił i opadł z sił. Przy układaniu następnego planu to są
 * dwa różne wnioski.
 *
 * Najcięższa para zostaje, gdzie była, i dalej karmi 1RM (propozycje,
 * kalibrację, postęp). Tyle że teraz **wylicza ją serwer z listy serii**,
 * a nie przysyła telefon — jedna reguła w jednym miejscu.
 */

export type SeriaWykonana = {
  ciezar: number | null;
  powtorzenia: number | null;
};

/**
 * Najwięcej serii w jednym wpisie. Plan daje najwyżej kilka; dwadzieścia to
 * zapas na pomyłki i dokładki, a zarazem granica, za którą lista nie może
 * być prawdziwa i tylko rozdyma bazę.
 */
export const MAKS_SERII = 20;

type Zakres = readonly [number, number];

/**
 * Lista serii z ciała żądania albo powód odmowy — po polsku, dla klienta.
 *
 * Seria może być połówkowa (sam ciężar albo same powtórzenia): klient wpisuje
 * pola po kolei, a kolejka wysyła każde. Pusta seria — oba pola puste — jest
 * dozwolona, bo w środku listy znaczy „tej serii nie wpisałem", a przesunięcie
 * kolejnych w górę zmieniłoby im numery.
 */
export function sprawdzSerie(
  wejscie: unknown,
  granice: { ciezar: Zakres; powtorzenia: Zakres },
): { serie: SeriaWykonana[] } | { blad: string } {
  if (!Array.isArray(wejscie)) return { blad: "Serie muszą być listą" };
  if (wejscie.length > MAKS_SERII) {
    return { blad: `Najwyżej ${MAKS_SERII} serii przy jednym ćwiczeniu` };
  }
  const serie: SeriaWykonana[] = [];
  for (const [i, s] of wejscie.entries()) {
    if (s === null || typeof s !== "object" || Array.isArray(s)) {
      return { blad: `Seria ${i + 1} nie jest parą ciężar × powtórzenia` };
    }
    const { ciezar, powtorzenia } = s as Record<string, unknown>;
    const kg = liczbaAlboPusto(ciezar, granice.ciezar, false);
    const powt = liczbaAlboPusto(powtorzenia, granice.powtorzenia, true);
    if (kg === undefined) return { blad: `Seria ${i + 1}: ciężar musi być z zakresu 0–1000 kg` };
    if (powt === undefined) return { blad: `Seria ${i + 1}: powtórzenia muszą być z zakresu 0–200` };
    serie.push({ ciezar: kg, powtorzenia: powt });
  }
  // Puste serie z końca nic nie znaczą — zostają tylko te w środku listy.
  while (serie.length > 0 && serie.at(-1)!.ciezar === null && serie.at(-1)!.powtorzenia === null) {
    serie.pop();
  }
  return { serie };
}

/** `null` dla pustego pola i zera, `undefined` dla wartości spoza świata. */
function liczbaAlboPusto(w: unknown, [dol, gora]: Zakres, calkowita: boolean): number | null | undefined {
  if (w === null || w === undefined || w === "") return null;
  const n = typeof w === "number" ? w : Number(w);
  if (!Number.isFinite(n) || n < dol || n > gora) return undefined;
  const wynik = calkowita ? Math.trunc(n) : n;
  return wynik === 0 ? null : wynik;
}

/**
 * Seria, która idzie do 1RM: najcięższa, a przy równym ciężarze — z większą
 * liczbą powtórzeń. Ostatnia byłaby zwykle najsłabsza, bo zmęczona.
 *
 * Gdy żadna seria nie ma kompletu, bierzemy to, co jest: ćwiczenie na masie
 * ciała ma same powtórzenia i ta liczba też jest coś warta dla trenera.
 */
export function najciezsza(serie: readonly SeriaWykonana[]): SeriaWykonana | null {
  const wazne = serie.filter((s) => s.ciezar !== null || s.powtorzenia !== null);
  if (wazne.length === 0) return null;
  const pelne = wazne.filter((s) => s.ciezar !== null && s.powtorzenia !== null);
  const pula = pelne.length > 0 ? pelne : wazne;
  return pula.reduce((a, b) => {
    const ka = a.ciezar ?? 0, kb = b.ciezar ?? 0;
    if (kb !== ka) return kb > ka ? b : a;
    return (b.powtorzenia ?? 0) > (a.powtorzenia ?? 0) ? b : a;
  });
}

/**
 * Serie wpisu do pokazania. Wpis sprzed wersji 6 bazy zna tylko najcięższą
 * parę — pokazujemy ją jako jedną serię, bo tyle o nim wiadomo. Rozpisanie
 * jej na wszystkie serie z planu byłoby wymyślaniem liczb, których nikt
 * nie wpisał.
 */
export function serieWpisu(
  w: { serie?: SeriaWykonana[]; ciezarWykonany?: number; powtorzeniaWykonane?: number } | undefined,
): SeriaWykonana[] {
  if (!w) return [];
  if (w.serie) return w.serie;
  return w.ciezarWykonany || w.powtorzeniaWykonane
    ? [{ ciezar: w.ciezarWykonany ?? null, powtorzenia: w.powtorzeniaWykonane ?? null }]
    : [];
}
