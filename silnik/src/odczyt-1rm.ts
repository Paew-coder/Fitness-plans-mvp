/**
 * 1RM odczytane z serii roboczych.
 *
 * Arkusz zna tylko jedną drogę do 1RM: seria maksymalna do odmowy na starcie
 * cyklu. To kosztuje trening, męczy klienta i mija się z prawdą po sześciu
 * tygodniach — a przez cały ten czas leży pod ręką materiał, którego arkusz
 * nie zbiera w ogóle: co klient faktycznie podniósł i jak mu to szło.
 *
 * Tu z tego materiału wychodzi propozycja nowego 1RM. Propozycja, nie zapis —
 * decyduje trener.
 */

import type { Feedback } from "./typy.ts";
import { procent1RM } from "./rpe.ts";
import { ogranicz, zaokraglij } from "./pomocnicze.ts";

/** Najniższe i najwyższe RPE w tabeli. Poza tym zakresem nie ma z czego liczyć. */
export const RPE_MIN = 6;
export const RPE_MAX = 10;

/**
 * O ile odczucie przesuwa RPE serii względem zaplanowanego.
 *
 * Klient nie podaje RPE — podaje odczucie. „Za trudne" znaczy, że seria kosztowała
 * więcej niż zakładał plan, więc realne RPE było wyższe; „za łatwe" odwrotnie.
 * Jeden stopień to ostrożny przelicznik: przy braku danych o rzeczywistym RPE
 * lepiej nie doszacować 1RM niż je zawyżyć i wysłać klienta na ciężar, którego
 * nie udźwignie.
 */
export const PRZESUNIECIE_RPE: Record<Feedback, number> = {
  "za trudne": +1,
  "OK": 0,
  "za łatwe": -1,
};

export type SeriaRobocza = {
  /** Ciężar faktycznie użyty, w kilogramach. */
  ciezar: number;
  /** Powtórzenia faktycznie wykonane. */
  powtorzenia: number;
  /** RPE z planu — punkt wyjścia, korygowany odczuciem. */
  rpePlanowane: number;
  /** Odczucie klienta; brak znaczy „poszło zgodnie z planem". */
  feedback?: Feedback | null;
};

export type Estymata = {
  seria: SeriaRobocza;
  rpeEfektywne: number;
  oneRM: number;
};

/**
 * 1RM z jednej serii roboczej: `ciężar / (%1RM przy powtórzeniach i RPE / 100)`.
 * Ten sam wzór, którym arkusz liczy ciężar — tylko odwrócony.
 *
 * `null`, gdy tabela nie ma takiej pary (powtórzenia poza 1–15) albo brakuje
 * ciężaru czy powtórzeń. Serie bezciężarowe nie mają tu czego szukać.
 */
export function oneRMzSerii(seria: SeriaRobocza): Estymata | null {
  if (!(seria.ciezar > 0) || !(seria.powtorzenia > 0)) return null;

  const rpeEfektywne = ogranicz(
    seria.rpePlanowane + PRZESUNIECIE_RPE[seria.feedback ?? "OK"],
    RPE_MIN,
    RPE_MAX,
  );
  const procent = procent1RM(seria.powtorzenia, rpeEfektywne);
  if (procent === null || procent <= 0) return null;

  return { seria, rpeEfektywne, oneRM: zaokraglij(seria.ciezar / (procent / 100), 1) };
}

/** Ile ostatnich serii bierzemy pod uwagę. Starsze mówią o innej formie. */
export const OKNO_SERII = 3;

export type Propozycja1RM = {
  /** Nowe 1RM do zaproponowania trenerowi. */
  oneRM: number;
  /** Estymaty, z których wyszła — od najstarszej. */
  estymaty: Estymata[];
  /** Rozrzut estymat w kilogramach. Duży znaczy, że dane są niespójne. */
  rozrzut: number;
  /** Zmiana względem 1RM używanego dziś, w procentach. `null`, gdy nie było czego porównać. */
  zmianaProc: number | null;
};

/**
 * Propozycja 1RM z historii serii roboczych.
 *
 * Bierze medianę z ostatnich `OKNO_SERII` serii, nie maksimum i nie średnią:
 * jedna pomylona cyfra przy wpisywaniu (90 zamiast 9) zawyżyłaby maksimum
 * i przesunęła średnią, a mediany nie ruszy.
 *
 * `null`, gdy żadna seria nie daje się przeliczyć.
 */
export function propozycja1RM(
  serie: readonly SeriaRobocza[],
  obecne1RM = 0,
): Propozycja1RM | null {
  const estymaty = serie
    .map(oneRMzSerii)
    .filter((e): e is Estymata => e !== null)
    .slice(-OKNO_SERII);
  if (estymaty.length === 0) return null;

  const posortowane = [...estymaty].sort((a, b) => a.oneRM - b.oneRM);
  const srodek = Math.floor(posortowane.length / 2);
  const oneRM = posortowane.length % 2 === 1
    ? posortowane[srodek]!.oneRM
    : zaokraglij((posortowane[srodek - 1]!.oneRM + posortowane[srodek]!.oneRM) / 2, 1);

  return {
    oneRM,
    estymaty,
    rozrzut: zaokraglij(posortowane.at(-1)!.oneRM - posortowane[0]!.oneRM, 1),
    zmianaProc: obecne1RM > 0 ? zaokraglij(((oneRM - obecne1RM) / obecne1RM) * 100, 1) : null,
  };
}

/** Powyżej tylu procent różnicy propozycja wymaga świadomej decyzji, nie kliknięcia. */
export const PROG_PODEJRZANY = 15;
/** Powyżej takiego rozrzutu estymat dane są zbyt niespójne, żeby na nich polegać. */
export const PROG_ROZRZUTU_PROC = 10;

export type OcenaPropozycji =
  | { zaufanie: "wysokie" }
  | { zaufanie: "niskie"; powod: string };

/**
 * Czy propozycji można ufać na oko. Trener i tak decyduje, ale niech wie,
 * na co patrzy.
 */
export function ocenPropozycje(p: Propozycja1RM): OcenaPropozycji {
  if (p.estymaty.length < 2) {
    return { zaufanie: "niskie", powod: "tylko jedna seria z wpisanym ciężarem" };
  }
  if (p.oneRM > 0 && (p.rozrzut / p.oneRM) * 100 > PROG_ROZRZUTU_PROC) {
    return {
      zaufanie: "niskie",
      powod: `serie dają rozbieżne wyniki (rozrzut ${p.rozrzut} kg)`,
    };
  }
  if (p.zmianaProc !== null && Math.abs(p.zmianaProc) > PROG_PODEJRZANY) {
    return {
      zaufanie: "niskie",
      powod: `skok o ${p.zmianaProc > 0 ? "+" : ""}${p.zmianaProc}% względem obecnego 1RM`,
    };
  }
  return { zaufanie: "wysokie" };
}
