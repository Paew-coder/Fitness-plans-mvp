/**
 * Progresja bloku z szablonu 5.18 — sześć tygodni, tak jak stoją w arkuszu.
 *
 * Skąd to się wzięło: MasterTemplate przychodzi z **wypełnionymi** parametrami
 * na wszystkie sześć tygodni. Trener otwierał plik i poprawiał, co chciał.
 * Konsola zaczynała każdy tydzień od domyślnych wartości silnika, więc plan
 * na trzy dni po piętnaście pozycji znaczył około dziewięćdziesięciu pól do
 * wpisania ręcznie — jedyne miejsce, w którym aplikacja była gorsza od arkusza.
 *
 * Te liczby nie są niczyim pomysłem: zostały odczytane z `arkusz/MasterTemplate-5-18.xlsx`,
 * z zakładek T1…T6, i są identyczne w każdym dniu.
 *
 * Progresja **nic nie robi sama**. Trener klika, pola wypełniają się widocznymi
 * wartościami i od tej chwili są zwykłymi liczbami do poprawienia. Nie ma tu
 * ukrytej domyślności — to była właśnie ta pułapka, przez którą arkusz pokazywał
 * kiedyś inne ciężary niż konsola.
 */
import type { Plan, ParametryTygodnia, SlotPlanu } from "./plan.ts";
import { TYGODNIE } from "./plan.ts";
import type { Tydzien } from "./typy.ts";

/**
 * Bój główny (pozycja A1), tydzień po tygodniu.
 * Objętość schodzi, intensywność rośnie; T4 otwiera drugi blok.
 */
export const PROGRESJA_BOJU: readonly { serie: number; powtorzenia: number; rpe: number }[] = [
  { serie: 6, powtorzenia: 6, rpe: 6.5 },   // T1
  { serie: 5, powtorzenia: 6, rpe: 7 },     // T2
  { serie: 5, powtorzenia: 5, rpe: 7 },     // T3
  { serie: 4, powtorzenia: 5, rpe: 7.5 },   // T4 — początek drugiego bloku
  { serie: 5, powtorzenia: 4, rpe: 7.5 },   // T5
  { serie: 6, powtorzenia: 3, rpe: 7.5 },   // T6
];

/** Akcesoria mają w szablonie zawsze trzy serie. */
export const SERIE_AKCESORIUM = 3;

/** RPE akcesoriów: pierwszy blok, drugi blok. Powtórzenia liczy automat. */
export const RPE_AKCESORIUM = { blokI: 8, blokII: 9 } as const;

/**
 * Pozycje, które w szablonie chodzą o stopień wyżej — drugie ćwiczenie
 * w superserii C i D. B2 nie, i tak jest w arkuszu.
 */
export const LP_PODWYZSZONE: readonly string[] = ["C2.", "D2."];

/** Czy ten tydzień należy do drugiego bloku. W arkuszu blok zaczyna się w T4. */
export function drugiBlok(tydzien: Tydzien): boolean {
  return tydzien >= 4;
}

function bojGlowny(lp: string): boolean {
  return lp.trim().toUpperCase().startsWith("A");
}

/**
 * Parametry jednej pozycji w jednym tygodniu, wg szablonu.
 *
 * Powtórzeń akcesoriów **nie ustawiamy** — w arkuszu liczy je formuła i tak
 * samo robi to silnik. Wpisanie ich tutaj zamieniłoby automat w liczbę wpisaną
 * na sztywno, czyli odebrałoby planowi to, co sam się dostraja.
 *
 * Pozycje E1/E2 szablon zostawia puste jako zapas; dostają regułę akcesorium,
 * bo niczym innym nie są — to jedyne miejsce, w którym wychodzimy poza
 * dosłowną treść arkusza, i dlatego stoi to tu napisane.
 */
export function progresjaSlotu(lp: string, tydzien: Tydzien): ParametryTygodnia {
  if (bojGlowny(lp)) {
    const p = PROGRESJA_BOJU[tydzien - 1]!;
    return { serie: p.serie, powtorzenia: p.powtorzenia, rpe: p.rpe };
  }
  const podstawowe = drugiBlok(tydzien) ? RPE_AKCESORIUM.blokII : RPE_AKCESORIUM.blokI;
  const wyzej = LP_PODWYZSZONE.includes(lp.trim());
  return { serie: SERIE_AKCESORIUM, rpe: podstawowe + (wyzej ? 1 : 0) };
}

/**
 * Wypełnia plan progresją z szablonu. Zwraca nowy plan — oryginał zostaje.
 *
 * Dotyka wyłącznie slotów z ćwiczeniem i wyłącznie trzech pól: serie,
 * powtórzenia (tylko bój główny) i RPE. Odczucia klienta oraz ręcznie
 * nadpisane ciężary zostają nietknięte — należą do wykonanego treningu,
 * a nie do szkieletu planu.
 */
export function zastosujProgresje(plan: Plan): Plan {
  return {
    ...plan,
    sloty: plan.sloty.map((slot): SlotPlanu => {
      if (!slot.cwiczenieId) return { ...slot };

      const tygodnie: SlotPlanu["tygodnie"] = { ...(slot.tygodnie ?? {}) };
      for (const t of TYGODNIE) {
        const { feedback, ciezarOverride } = tygodnie[t] ?? {};
        tygodnie[t] = {
          ...progresjaSlotu(slot.lp, t),
          ...(feedback !== undefined ? { feedback } : {}),
          ...(ciezarOverride !== undefined ? { ciezarOverride } : {}),
        };
      }
      return { ...slot, tygodnie };
    }),
  };
}

/**
 * Kopiuje parametry jednego tygodnia do pozostałych.
 *
 * Druga droga obok progresji: trener ustawia T1 po swojemu i rozprowadza to
 * na cykl. Odczucia i nadpisania ciężaru zostają na swoich miejscach —
 * kopiuje się szkielet, nie historia.
 */
export function skopiujTydzien(plan: Plan, zrodlo: Tydzien): Plan {
  return {
    ...plan,
    sloty: plan.sloty.map((slot): SlotPlanu => {
      if (!slot.cwiczenieId) return { ...slot };

      const wzorzec = slot.tygodnie?.[zrodlo] ?? {};
      const { feedback: _f, ciezarOverride: _c, ...doSkopiowania } = wzorzec;

      const tygodnie: SlotPlanu["tygodnie"] = { ...(slot.tygodnie ?? {}) };
      for (const t of TYGODNIE) {
        if (t === zrodlo) continue;
        const { feedback, ciezarOverride } = tygodnie[t] ?? {};
        tygodnie[t] = {
          ...doSkopiowania,
          ...(feedback !== undefined ? { feedback } : {}),
          ...(ciezarOverride !== undefined ? { ciezarOverride } : {}),
        };
      }
      return { ...slot, tygodnie };
    }),
  };
}
