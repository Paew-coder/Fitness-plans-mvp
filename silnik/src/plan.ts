import type {
  Cwiczenie,
  CzescPlanu,
  Feedback,
  Kategoria,
  Stres,
  TrybAkcesoriow,
  Tydzien,
  WynikCiezaru,
} from "./typy.ts";
import { Katalog, katalog as katalogDomyslny } from "./katalog.ts";
import { obliczCiezar, obliczCiezarTopSetu, tydzienBazowyBloku } from "./ciezar.ts";
import { korektaPowtorzen, mnoznikNaTydzien } from "./adaptacja.ts";
import { powtorzeniaAkcesorium } from "./powtorzenia.ts";
import {
  bilansTygodnia,
  NORMY,
  ocenaNormy,
  stresSlotu,
  type BilansTygodnia,
  type OcenaNormy,
  type SlotObliczony,
} from "./stres.ts";
import { procent1RM, rozwiaz1RM, type SeriaMaksymalna } from "./rpe.ts";

export const TYGODNIE: readonly Tydzien[] = [1, 2, 3, 4, 5, 6];

/** Co trener ustawia dla slotu w konkretnym tygodniu. Puste pole = policz automatem. */
export type ParametryTygodnia = {
  serie?: number;
  /** Puste = automat powtórzeń akcesoriów. Bój główny wymaga wpisu. */
  powtorzenia?: number;
  rpe?: number;
  /** Podmiana ćwiczenia w T4–T6. */
  cwiczenieIdOverride?: string;
  /** 1RM wpisany ręcznie dla podmienionego ćwiczenia (kolumna AA). */
  oneRMReczny?: number;
  /** Jawne nadpisanie ciężaru — widoczne i cofalne, inaczej niż zerwany link w arkuszu. */
  ciezarOverride?: number;
  /** Odczucie klienta po wykonaniu (kolumna H). */
  feedback?: Feedback;
};

export type SlotPlanu = {
  /** D1-S01 … D5-S12 */
  positionId: string;
  dzien: number;
  /** "A1." "B1." "B2." — wspólna litera = superseria. */
  lp: string;
  cwiczenieId: string | null;
  kategoriaSzkieletu?: Kategoria | null;
  tygodnie?: Partial<Record<Tydzien, ParametryTygodnia>>;
};

export type TopSet = {
  dzien: number;
  wlaczony: boolean;
  rpe: number;
  /** Slot, z którego TOP SET bierze ćwiczenie i 1RM. Jawnie — nie „wiersz poniżej". */
  slotPositionId: string;
};

export type Plan = {
  nazwa: string;
  trybAkcesoriow: TrybAkcesoriow;
  czescPlanu: CzescPlanu;
  serieMaksymalne: readonly SeriaMaksymalna[];
  sloty: readonly SlotPlanu[];
  topSety?: readonly TopSet[];
};

export type SlotWyliczony = {
  positionId: string;
  dzien: number;
  lp: string;
  cwiczenie: Cwiczenie | null;
  serie: number;
  powtorzenia: number;
  rpe: number;
  procent1RM: number | null;
  oneRM: number;
  mnoznik: number;
  ciezar: WynikCiezaru;
  ciezarNadpisany: boolean;
  stres: Stres;
};

export type TopSetWyliczony = {
  dzien: number;
  cwiczenie: Cwiczenie | null;
  rpe: number;
  ciezar: WynikCiezaru;
};

export type PodsumowanieDnia = {
  dzien: number;
  serie: number;
  powtorzenia: number;
  stresCalkowity: number;
};

export type TydzienWyliczony = {
  tydzien: Tydzien;
  sloty: SlotWyliczony[];
  topSety: TopSetWyliczony[];
  dni: PodsumowanieDnia[];
  bilans: BilansTygodnia;
  ocenaStresu: OcenaNormy;
};

export type PlanWyliczony = {
  nazwa: string;
  dniTreningowe: number;
  tygodnie: TydzienWyliczony[];
  /** Ocena średniej liczby serii per wzorzec z całego cyklu — jak w Analizie. */
  ocenaObjetosci: Record<string, { srednia: number; ocena: OcenaNormy }>;
};

function jestBojemGlownym(lp: string): boolean {
  return lp.trim().toUpperCase().startsWith("A");
}

function parametry(slot: SlotPlanu, tydzien: Tydzien): ParametryTygodnia {
  return slot.tygodnie?.[tydzien] ?? {};
}

/** Liczba dni, w których stoi choć jedno ćwiczenie — baza wszystkich norm (Analiza!B76). */
export function dniTreningowe(plan: Plan): number {
  const dni = new Set<number>();
  for (const s of plan.sloty) if (s.cwiczenieId) dni.add(s.dzien);
  return dni.size;
}

/**
 * Przelicza cały plan: sześć tygodni, wszystkie sloty, ciężary, stres i bilans.
 *
 * Tygodnie liczą się po kolei, bo T2/T3 dziedziczą ciężar z T1, a T5/T6 z T4 —
 * wynik tygodnia bazowego musi być gotowy, zanim policzy się tydzień zależny.
 */
export function przeliczPlan(plan: Plan, katalog: Katalog = katalogDomyslny): PlanWyliczony {
  const dni = dniTreningowe(plan);
  const wyliczone = new Map<Tydzien, TydzienWyliczony>();

  for (const tydzien of TYGODNIE) {
    const sloty: SlotWyliczony[] = [];

    for (const slot of plan.sloty) {
      const p = parametry(slot, tydzien);
      const cwiczenieId = p.cwiczenieIdOverride ?? slot.cwiczenieId;
      const cwiczenie = cwiczenieId ? (katalog.poId(cwiczenieId) ?? null) : null;

      if (!cwiczenie) {
        sloty.push({
          positionId: slot.positionId,
          dzien: slot.dzien,
          lp: slot.lp,
          cwiczenie: null,
          serie: 0,
          powtorzenia: 0,
          rpe: 0,
          procent1RM: null,
          oneRM: 0,
          mnoznik: 1,
          ciezar: "",
          ciezarNadpisany: false,
          stres: { calkowity: 0, centralny: 0, obwodowy: 0 },
        } as SlotWyliczony);
        continue;
      }

      const bojGlowny = jestBojemGlownym(slot.lp);
      const odczucia = Object.fromEntries(
        TYGODNIE.map((t) => [t, parametry(slot, t).feedback]),
      ) as Partial<Record<Tydzien, Feedback | undefined>>;
      const mnoznik = mnoznikNaTydzien(tydzien, odczucia);

      const serie = p.serie ?? (bojGlowny ? 1 : 3);
      const rpe = p.rpe ?? 8;
      const powtorzenia =
        p.powtorzenia ??
        (bojGlowny
          ? 6
          : powtorzeniaAkcesorium({
              coeff: cwiczenie.coeff,
              czesc: plan.czescPlanu,
              tydzien,
              korekta: korektaPowtorzen(cwiczenie.progresja, mnoznik),
            }));

      const zmienione = p.cwiczenieIdOverride !== undefined && p.cwiczenieIdOverride !== slot.cwiczenieId;
      const oneRM = rozwiaz1RM(cwiczenie.id, plan.serieMaksymalne);

      const bazowy = tydzienBazowyBloku(tydzien);
      const slotBazowy = bazowy
        ? wyliczone.get(bazowy)?.sloty.find((s) => s.positionId === slot.positionId)
        : undefined;

      const policzony = obliczCiezar({
        tydzien,
        jestBojemGlownym: bojGlowny,
        trybAkcesoriow: plan.trybAkcesoriow,
        powtorzenia,
        rpe,
        skokKg: cwiczenie.skokKg,
        progresja: cwiczenie.progresja,
        oneRM,
        mnoznik,
        cwiczenieZmienioneWzgledemT1: zmienione,
        oneRMReczny: p.oneRMReczny,
        ciezarBazowy: slotBazowy?.ciezar,
        mnoznikBazowy: slotBazowy?.mnoznik,
      });

      sloty.push({
        positionId: slot.positionId,
        dzien: slot.dzien,
        lp: slot.lp,
        cwiczenie,
        serie,
        powtorzenia,
        rpe,
        procent1RM: procent1RM(powtorzenia, rpe),
        oneRM,
        mnoznik,
        ciezar: p.ciezarOverride ?? policzony,
        ciezarNadpisany: p.ciezarOverride !== undefined,
        stres: stresSlotu({ coeff: cwiczenie.coeff, serie, rpe, powtorzenia }),
      });
    }

    const aktywne: SlotObliczony[] = sloty
      .filter((s) => s.cwiczenie !== null)
      .map((s) => ({
        part: s.cwiczenie!.part,
        serie: s.serie,
        powtorzenia: s.powtorzenia,
        stres: s.stres,
      }));

    const bilans = bilansTygodnia(aktywne);

    const topSety: TopSetWyliczony[] = (plan.topSety ?? [])
      .filter((t) => t.wlaczony)
      .map((t) => {
        const zrodlo = sloty.find((s) => s.positionId === t.slotPositionId);
        return {
          dzien: t.dzien,
          cwiczenie: zrodlo?.cwiczenie ?? null,
          rpe: t.rpe,
          ciezar: zrodlo?.cwiczenie
            ? obliczCiezarTopSetu({
                oneRM: zrodlo.oneRM,
                rpe: t.rpe,
                skokKg: zrodlo.cwiczenie.skokKg,
                progresja: zrodlo.cwiczenie.progresja,
              })
            : "",
        } as TopSetWyliczony;
      });

    const numeryDni = [...new Set(sloty.map((s) => s.dzien))].sort((a, b) => a - b);
    const podsumowania: PodsumowanieDnia[] = numeryDni.map((dzien) => {
      const wDniu = sloty.filter((s) => s.dzien === dzien && s.cwiczenie);
      const topSetDnia = topSety.find((t) => t.dzien === dzien && t.cwiczenie);
      return {
        dzien,
        serie: wDniu.reduce((a, s) => a + s.serie, 0) + (topSetDnia ? 1 : 0),
        powtorzenia: wDniu.reduce((a, s) => a + s.serie * s.powtorzenia, 0),
        stresCalkowity: Math.round(wDniu.reduce((a, s) => a + s.stres.calkowity, 0) * 1e4) / 1e4,
      };
    });

    wyliczone.set(tydzien, {
      tydzien,
      sloty,
      topSety,
      dni: podsumowania,
      bilans,
      ocenaStresu: ocenaNormy(bilans.razem, NORMY.stresTygodniowy, dni),
    });
  }

  const tygodnie = TYGODNIE.map((t) => wyliczone.get(t)!);

  const ocenaObjetosci: PlanWyliczony["ocenaObjetosci"] = {};
  for (const part of ["s", "d", "b", "r", "c"] as const) {
    const serie = tygodnie.map((t) => t.bilans.wzorce.find((w) => w.part === part)!.serie);
    const srednia = serie.reduce((a, b) => a + b, 0) / serie.length;
    ocenaObjetosci[part] = {
      srednia: Math.round(srednia * 100) / 100,
      ocena: ocenaNormy(srednia, NORMY.serie[part], dni),
    };
  }

  return { nazwa: plan.nazwa, dniTreningowe: dni, tygodnie, ocenaObjetosci };
}
