import type { Coeff, Part, Stres } from "./typy.ts";
import {
  TABELA_STRES_CALKOWITY,
  TABELA_STRES_CENTRALNY,
  TABELA_STRES_OBWODOWY,
} from "./dane/tabele.ts";
import { klucz, ogranicz, zaokraglij } from "./pomocnicze.ts";
import { POWT_MAX, POWT_MIN } from "./rpe.ts";

/** Tabele stresu obejmują RPE 5–10; niższe RPE mapuje się na wiersz 5. */
export const RPE_STRES_MIN = 5;
export const RPE_STRES_MAX = 10;

export const WZORCE: readonly Part[] = ["s", "d", "b", "r", "c"];

export const NAZWY_WZORCOW: Record<Part, string> = {
  s: "przysiad",
  d: "martwy ciąg",
  b: "wyciskanie",
  r: "wiosłowanie",
  c: "core",
};

function odczytaj(tabela: Record<number, Record<number, number>>, rpe: number, powt: number): number {
  const r = klucz(ogranicz(rpe, RPE_STRES_MIN, RPE_STRES_MAX));
  const p = klucz(ogranicz(powt, POWT_MIN, POWT_MAX));
  return tabela[r]?.[p] ?? 0;
}

/**
 * Stres jednego slotu na trzech osiach: `coeff × serie × tabela[RPE][powtórzenia]`.
 * Kategoria ćwiczenia nie wpływa na stres — liczy się wyłącznie coeff i part.
 */
export function stresSlotu(args: {
  coeff: Coeff;
  serie: number;
  rpe: number;
  powtorzenia: number;
}): Stres {
  const { coeff, serie, rpe, powtorzenia } = args;
  const mnoznik = coeff * serie;
  return {
    calkowity: zaokraglij(mnoznik * odczytaj(TABELA_STRES_CALKOWITY, rpe, powtorzenia), 4),
    centralny: zaokraglij(mnoznik * odczytaj(TABELA_STRES_CENTRALNY, rpe, powtorzenia), 4),
    obwodowy: zaokraglij(mnoznik * odczytaj(TABELA_STRES_OBWODOWY, rpe, powtorzenia), 4),
  };
}

export type SlotObliczony = {
  part: Part;
  serie: number;
  powtorzenia: number;
  stres: Stres;
};

export type BilansWzorca = {
  part: Part;
  nazwa: string;
  calkowity: number;
  centralny: number;
  obwodowy: number;
  serie: number;
  powtorzenia: number;
  udzial: number;
};

export type BilansTygodnia = {
  wzorce: BilansWzorca[];
  dolne: number;
  gorne: number;
  core: number;
  centralny: number;
  obwodowy: number;
  razem: number;
  serieRazem: number;
  powtorzeniaRazem: number;
};

/**
 * Bilans tygodnia — agregacja po `part`, nie po kategorii.
 * Dolne = s + d, górne = b + r, core osobno i tylko do sumy RAZEM.
 */
export function bilansTygodnia(sloty: readonly SlotObliczony[]): BilansTygodnia {
  const sumaCalkowita = sloty.reduce((a, s) => a + s.stres.calkowity, 0);

  const wzorce: BilansWzorca[] = WZORCE.map((part) => {
    const swoje = sloty.filter((s) => s.part === part);
    const calkowity = zaokraglij(swoje.reduce((a, s) => a + s.stres.calkowity, 0), 4);
    return {
      part,
      nazwa: NAZWY_WZORCOW[part],
      calkowity,
      centralny: zaokraglij(swoje.reduce((a, s) => a + s.stres.centralny, 0), 4),
      obwodowy: zaokraglij(swoje.reduce((a, s) => a + s.stres.obwodowy, 0), 4),
      serie: swoje.reduce((a, s) => a + s.serie, 0),
      powtorzenia: swoje.reduce((a, s) => a + s.serie * s.powtorzenia, 0),
      udzial: sumaCalkowita > 0 ? zaokraglij(calkowity / sumaCalkowita, 4) : 0,
    };
  });

  const we = (part: Part) => wzorce.find((w) => w.part === part)!;

  return {
    wzorce,
    dolne: zaokraglij(we("s").calkowity + we("d").calkowity, 4),
    gorne: zaokraglij(we("b").calkowity + we("r").calkowity, 4),
    core: we("c").calkowity,
    centralny: zaokraglij(wzorce.reduce((a, w) => a + w.centralny, 0), 4),
    obwodowy: zaokraglij(wzorce.reduce((a, w) => a + w.obwodowy, 0), 4),
    razem: zaokraglij(sumaCalkowita, 4),
    serieRazem: wzorce.reduce((a, w) => a + w.serie, 0),
    powtorzeniaRazem: wzorce.reduce((a, w) => a + w.powtorzenia, 0),
  };
}

/** Normy z zakładki Analiza, podane na jeden dzień treningowy. */
export const NORMY = {
  stresTygodniowy: [12, 18] as const,
  serie: {
    s: [4, 7] as const,
    d: [4, 7] as const,
    b: [8, 13] as const,
    r: [7, 11] as const,
    c: [3, 6] as const,
  },
} as const;

export type OcenaNormy = "▼ poniżej" | "✓ w normie" | "▲ powyżej" | "—";

/** Ocena wartości względem normy przeskalowanej liczbą dni treningowych. */
export function ocenaNormy(
  wartosc: number,
  zakres: readonly [number, number],
  dniTreningowe: number,
): OcenaNormy {
  if (dniTreningowe === 0) return "—";
  if (wartosc < zakres[0] * dniTreningowe) return "▼ poniżej";
  if (wartosc > zakres[1] * dniTreningowe) return "▲ powyżej";
  return "✓ w normie";
}
