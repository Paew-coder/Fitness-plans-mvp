/**
 * Import planu z arkusza w formacie MasterTemplate 5.17 / 5.18.
 *
 * Wejściem jest JSON z `narzedzia/zrzut-arkusza.py`, który wyciąga z pliku
 * jednocześnie **wejście** (co wpisał trener) i **wynik** (co arkusz policzył).
 * Dzięki temu da się i zbudować plan do przeliczenia, i porównać obie strony.
 */
import type { CzescPlanu, Feedback, Kategoria, TrybAkcesoriow, Tydzien } from "./typy.ts";
import type { ParametryTygodnia, Plan, SlotPlanu } from "./plan.ts";
import { katalog } from "./katalog.ts";

export const TYGODNIE_IMPORTU: readonly Tydzien[] = [1, 2, 3, 4, 5, 6];
export const SKROTY_TYGODNI = ["T1", "T2", "T3", "T4", "T5", "T6"] as const;

export type PoleTygodniaArkusza = {
  /** Powtórzenia wpisane ręcznie przez trenera (a nie policzone automatem). */
  powt_reczne?: boolean;
  /** Ciężar wpisany ręcznie — w komórce stoi liczba, nie formuła. */
  ciezar_reczny?: boolean;
  serie: number | null;
  rpe: number | null;
  feedback: string | null;
  cwiczenie: string | null;
  one_rm_reczny: number | null;
  ocz_powtorzenia: number | null;
  ocz_ciezar: number | string | null;
  ocz_procent: number | null;
  ocz_one_rm: number | null;
  ocz_mnoznik: number | null;
  ocz_stres_t: number | null;
  ocz_stres_c: number | null;
  ocz_stres_p: number | null;
};

export type SlotArkusza = {
  position_id: string;
  dzien: number;
  lp: string;
  nazwa: string;
  ex_id: string | null;
  kategoria_szkieletu: string | null;
  "1rm_nierozwiazany": boolean;
  tygodnie: Record<string, PoleTygodniaArkusza>;
};

export type ZrzutArkusza = {
  zrodlo: string;
  ustawienia: {
    tryb_akcesoriow: string;
    czesc_planu: string;
    dni_treningowe: number | null;
  };
  serie_maksymalne: {
    position_id: string;
    nazwa: string | null;
    ex_id: string | null;
    ciezar: number;
    powtorzenia: number;
    oczekiwany_1rm: number | null;
  }[];
  sloty: SlotArkusza[];
  top_sety: {
    dzien: number;
    wlaczony: boolean;
    rpe: number | null;
    slot_position_id: string | null;
  }[];
  podsumowania: Record<string, {
    wzorce: Record<string, {
      ocz_calkowity: number | null;
      ocz_centralny: number | null;
      ocz_obwodowy: number | null;
      ocz_serie: number | null;
      ocz_powtorzenia: number | null;
    }>;
    ocz_razem: number | null;
    ocz_serie_razem: number | null;
    ocz_powtorzenia_razem: number | null;
  }>;
};

/**
 * Identyfikator ćwiczenia dla slotu z arkusza.
 *
 * Normalnie stoi w ukrytej kolumnie, którą arkusz wylicza formułą. Ale plik
 * **prosto z eksportu nie ma jeszcze policzonych formuł** — wartości pojawiają
 * się w nim dopiero po otwarciu w Excelu albo LibreOffice. Bez tego zapasowego
 * odczytu wczytanie własnego, dopiero co wyeksportowanego arkusza dawało plan
 * bez ani jednego ćwiczenia, i to bez słowa ostrzeżenia.
 *
 * Zapas jest bezpieczny: nazwa i tak pochodzi z BAZY, tej samej, z której
 * bierze ją formuła. Literówka nie przejdzie ani tu, ani tam.
 */
export function idCwiczenia(nazwa: string | null, exId: string | null): string | null {
  if (exId) return exId;
  return nazwa?.trim() ? (katalog.poNazwie(nazwa)?.id ?? null) : null;
}

/** Bój główny to pozycja, której `lp` zaczyna się na „A". */
export function jestBojemGlownym(lp: string): boolean {
  return lp.trim().toUpperCase().startsWith("A");
}

/**
 * Buduje plan do przeliczenia z tego, co trener wpisał w arkuszu.
 *
 * Powtórzenia bierzemy z arkusza wtedy, gdy wpisał je trener — czyli przy boju
 * głównym oraz wszędzie tam, gdzie w komórce stoi liczba zamiast formuły.
 * Tam, gdzie stoi formuła, zostawiamy puste i liczy je automat; to właśnie
 * automat jest w tym porównaniu sprawdzany.
 */
export function planZArkusza(z: ZrzutArkusza): Plan {
  const sloty: SlotPlanu[] = z.sloty
    .map((s) => ({ s, id: idCwiczenia(s.nazwa, s.ex_id) }))
    .filter((x): x is { s: SlotArkusza; id: string } => x.id !== null)
    .map(({ s, id }) => {
      const tygodnie: Partial<Record<Tydzien, ParametryTygodnia>> = {};
      TYGODNIE_IMPORTU.forEach((t, i) => {
        const pole = s.tygodnie[SKROTY_TYGODNI[i]!]!;
        tygodnie[t] = {
          serie: pole.serie ?? undefined,
          rpe: pole.rpe ?? undefined,
          feedback: (pole.feedback as Feedback | null) ?? undefined,
          oneRMReczny: pole.one_rm_reczny ?? undefined,
          powtorzenia:
            jestBojemGlownym(s.lp) || pole.powt_reczne
              ? (pole.ocz_powtorzenia ?? undefined)
              : undefined,
          // Liczba zamiast formuły w kolumnie CIĘŻAR znaczy, że trener ustalił
          // ten ciężar na sztywno. Musi wrócić jako nadpisanie, a nie zniknąć —
          // inaczej po powrocie z arkusza plan liczyłby coś innego.
          ciezarOverride:
            pole.ciezar_reczny && typeof pole.ocz_ciezar === "number"
              ? pole.ocz_ciezar
              : undefined,
        };
      });
      return {
        positionId: s.position_id,
        dzien: s.dzien,
        lp: s.lp,
        cwiczenieId: id,
        kategoriaSzkieletu: (s.kategoria_szkieletu as Kategoria | null) ?? null,
        tygodnie,
      };
    });

  return {
    nazwa: z.zrodlo,
    trybAkcesoriow: (z.ustawienia.tryb_akcesoriow as TrybAkcesoriow) ?? "trzymaj z bloku",
    czescPlanu: (z.ustawienia.czesc_planu as CzescPlanu) ?? "objętość",
    serieMaksymalne: z.serie_maksymalne
      .map((s) => ({ ...s, id: idCwiczenia(s.nazwa, s.ex_id) }))
      .filter((s) => s.id !== null)
      .map((s) => ({ cwiczenieId: s.id!, ciezar: s.ciezar, powtorzenia: s.powtorzenia })),
    sloty,
    topSety: z.top_sety
      .filter((t) => t.wlaczony && t.slot_position_id)
      .map((t) => ({
        dzien: t.dzien,
        wlaczony: true,
        rpe: t.rpe ?? 7,
        slotPositionId: t.slot_position_id!,
      })),
  };
}

/**
 * Sloty, w których trener wpisał nazwę ćwiczenia, ale arkusz nie znalazł jej w BAZIE.
 *
 * To najcichszy z możliwych błędów: taki slot nie dostaje ani ciężaru, ani stresu,
 * ani nie liczy się do objętości — a w planie wygląda normalnie. Kontrole w zakładce
 * Analiza go nie łapią. Literówka w nazwie wystarczy.
 */
export function nierozpoznaneCwiczenia(z: ZrzutArkusza): { positionId: string; nazwa: string }[] {
  return z.sloty
    .filter((s) => s.nazwa && !idCwiczenia(s.nazwa, s.ex_id))
    .map((s) => ({ positionId: s.position_id, nazwa: s.nazwa }));
}
