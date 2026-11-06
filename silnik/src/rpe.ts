import { TABELA_RPE } from "./dane/tabele.ts";
import { klucz, zaokraglij } from "./pomocnicze.ts";

/** Najniższe i najwyższe powtórzenia obsługiwane przez tabelę RPE. */
export const POWT_MIN = 1;
export const POWT_MAX = 15;

/**
 * %1RM dla danej liczby powtórzeń i RPE.
 * Tabela nie interpoluje — trafienie dokładne albo `null` (odpowiednik IFERROR w arkuszu).
 */
export function procent1RM(powtorzenia: number, rpe: number): number | null {
  const wiersz = TABELA_RPE[klucz(powtorzenia)];
  if (!wiersz) return null;
  return wiersz[klucz(rpe)] ?? null;
}

/**
 * RPE z tabeli najbliższe danemu %1RM przy tej liczbie powtórzeń — w drugą
 * stronę niż `procent1RM`. Dla progresji w procentach (dwubój, 16.10.2026):
 * ciężar idzie wprost z procentu, a RPE służy już tylko stresowi tygodnia.
 * Poniżej tabeli (np. 3 powtórzenia przy 70 %) wychodzi 6 — jej początek.
 */
export function rpeDlaProcentu(powtorzenia: number, procent: number): number {
  let najblizsze = 6;
  let roznica = Infinity;
  for (let rpe = 6; rpe <= 10; rpe += 0.5) {
    const p = procent1RM(powtorzenia, rpe);
    if (p === null) continue;
    if (Math.abs(p - procent) < roznica) {
      roznica = Math.abs(p - procent);
      najblizsze = rpe;
    }
  }
  return najblizsze;
}

/**
 * 1RM z serii maksymalnej. Seria do odmowy = RPE 10.
 * Odpowiednik START!E: `ciężar / (%1RM przy RPE 10 / 100)`, zaokrąglone do 0,1 kg.
 * Zwraca `null`, gdy powtórzenia wypadają poza tabelę (arkusz pokazuje wtedy "powt. 1–15").
 */
export function oblicz1RM(ciezar: number, powtorzenia: number): number | null {
  const procent = procent1RM(powtorzenia, 10);
  if (procent === null || procent <= 0) return null;
  return zaokraglij(ciezar / (procent / 100), 1);
}

export type SeriaMaksymalna = {
  cwiczenieId: string;
  ciezar: number;
  powtorzenia: number;
  /**
   * Obecne, gdy wpis nie jest serią maksymalną, tylko 1RM policzonym z serii
   * roboczej — patrz `KalibracjaSerii`.
   */
  kalibracja?: KalibracjaSerii;
  /**
   * Numer cyklu, w którego tygodniu maksów klient to podniósł. Wpis jest wtedy
   * prawdziwą serią maksymalną — wstawia ją „Nowa wersja" planu. Silnik tego
   * nie czyta; konsola pokazuje, skąd liczba.
   */
  zTygodniaMaksow?: number;
  /**
   * 1RM z treningu (wpis kalibracji), które ta seria maksymalna zastąpiła.
   * Trzymane tylko po to, żeby usunięcie serii z telefonu je przywróciło —
   * wcześniej wpisanie serii „na próbę” i wyczyszczenie pól kasowało 1RM
   * na dobre. Silnik tego nie czyta.
   */
  zastapionaKalibracja?: {
    ciezar: number; powtorzenia: number; kalibracja: KalibracjaSerii;
    wczesniej?: readonly { doTygodnia: number; oneRM: number }[];
  };
  /**
   * 1RM sprzed zmiany z serii roboczej w środku cyklu (17.10.2026) — dla
   * tygodni, które klient już przerobił. Trener: „jeżeli ktoś wpisze inny
   * ciężar … to niech ta seria będzie podstawą do wyliczenia obciążeń do całej
   * reszty planu”. Reszta planu, czyli od tygodnia tej serii: minione tygodnie
   * zostają przy ciężarach, które klient wtedy dostał. Tydzień `t` bierze
   * pierwszy wpis z `t ≤ doTygodnia`; dalsze — ten wpis.
   */
  wczesniej?: readonly { doTygodnia: number; oneRM: number }[];
};

/**
 * Seria robocza, z której wyszło 1RM, gdy klient zaczął cykl bez serii
 * maksymalnej i dobrał ciężar sam, według RPE z planu.
 *
 * **Silnik tego nie czyta.** Liczy z `ciezar × powtorzenia` wpisu tak samo
 * jak zawsze — kalibracja zapisuje się tam jako `1RM × 1`, tą samą drogą,
 * którą trener przyjmuje propozycję 1RM. Ten opis jest dla ludzi: trener
 * musi widzieć, że to nie była seria do odmowy, i z czego się wzięło.
 */
export type KalibracjaSerii = {
  ciezar: number;
  powtorzenia: number;
  /** RPE z planu — przy nim klient dobierał ciężar. */
  rpe: number;
  tydzien: number;
  dzien: number;
  positionId: string;
  /** ISO — kiedy klient wpisał tę serię. */
  data: string;
  /**
   * Zmiana 1RM w środku cyklu (17.10.2026) — 1RM obowiązujące w tym tygodniu
   * przed tą serią i ciężar, który klient miał wtedy w planie. Z nich liczy
   * się każda poprawka z tego samego treningu (kolejna, cięższa seria).
   */
  oneRMPrzed?: number;
  ciezarPlanu?: number;
  /**
   * Serie maksymalne sprzed pierwszej zmiany w tym cyklu — „Resetuj plan”
   * wraca do nich, zamiast zostawiać ćwiczenie bez 1RM.
   */
  pierwotne?: readonly SeriaMaksymalna[];
};

/**
 * 1RM ćwiczenia, gdy ta sama pozycja stoi w kilku dniach.
 * Arkusz bierze MAX po wszystkich wpisach (START!N) — nie pierwsze trafienie, nie średnią.
 * Zwraca 0, gdy nie ma żadnego wpisu; wtedy ciężar liczy się na "— brak 1RM".
 */
export function rozwiaz1RM(
  cwiczenieId: string, serie: readonly SeriaMaksymalna[], tydzien?: number,
): number {
  let max = 0;
  for (const s of serie) {
    if (s.cwiczenieId !== cwiczenieId) continue;
    // Bez tygodnia — obecne 1RM (maksy, propozycje); z tygodniem — to, które
    // w nim obowiązywało (patrz `wczesniej`).
    const wczesniejsze = tydzien === undefined ? undefined
      : s.wczesniej?.find((w) => tydzien <= w.doTygodnia)?.oneRM;
    const wynik = wczesniejsze ?? oblicz1RM(s.ciezar, s.powtorzenia);
    if (wynik !== null && wynik > max) max = wynik;
  }
  return max;
}

/**
 * Wpisy dające różne 1RM dla jednego ćwiczenia — odpowiednik kontroli
 * "Serie maksymalne w konflikcie" (START!M ≠ START!N). Ostrzeżenie, nie błąd.
 */
export function konfliktSeriiMaksymalnych(serie: readonly SeriaMaksymalna[]): string[] {
  const wg = new Map<string, Set<number>>();
  for (const s of serie) {
    const wynik = oblicz1RM(s.ciezar, s.powtorzenia);
    if (wynik === null || wynik <= 0) continue;
    if (!wg.has(s.cwiczenieId)) wg.set(s.cwiczenieId, new Set());
    wg.get(s.cwiczenieId)!.add(wynik);
  }
  return [...wg].filter(([, wartosci]) => wartosci.size > 1).map(([id]) => id);
}
