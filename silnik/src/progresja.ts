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
import type { Plan, SlotPlanu } from "./plan.ts";
import { TYGODNIE } from "./plan.ts";
import type { Tydzien } from "./typy.ts";
import { Katalog, katalog as katalogDomyslny } from "./katalog.ts";
import { progresjaSlotu } from "./szablon-boju.ts";

export {
  PROGRESJA_BOJU, SERIE_AKCESORIUM, RPE_AKCESORIUM,
  LP_PODWYZSZONE, drugiBlok, progresjaSlotu, pozycjaBoju, jestBojemGlownym,
} from "./szablon-boju.ts";

/**
 * Wypełnia plan progresją z szablonu. Zwraca nowy plan — oryginał zostaje.
 *
 * Dotyka wyłącznie slotów z ćwiczeniem i wyłącznie trzech pól: serie,
 * powtórzenia (tylko bój główny) i RPE. Odczucia klienta oraz ręcznie
 * nadpisane ciężary zostają nietknięte — należą do wykonanego treningu,
 * a nie do szkieletu planu.
 */
export function zastosujProgresje(plan: Plan, katalog: Katalog = katalogDomyslny): Plan {
  return {
    ...plan,
    sloty: plan.sloty.map((slot): SlotPlanu => {
      if (!slot.cwiczenieId) return { ...slot };

      // Szablon boju należy się ćwiczeniu złożonemu, nie miejscu w tabeli —
      // dlatego progresja musi wiedzieć, co w tym slocie stoi.
      const coeff = katalog.poId(slot.cwiczenieId)?.coeff;
      const tygodnie: SlotPlanu["tygodnie"] = { ...(slot.tygodnie ?? {}) };
      for (const t of TYGODNIE) {
        const { feedback, ciezarOverride } = tygodnie[t] ?? {};
        tygodnie[t] = {
          ...progresjaSlotu(slot.lp, t, coeff),
          ...(feedback !== undefined ? { feedback } : {}),
          ...(ciezarOverride !== undefined ? { ciezarOverride } : {}),
        };
      }
      return { ...slot, tygodnie };
    }),
  };
}

/**
 * Kopiuje parametry jednego tygodnia do pozostałych — dla jednego ćwiczenia
 * albo, gdy `positionId` pominięte, dla całego planu.
 *
 * Druga droga obok progresji: trener ustawia ćwiczenie po swojemu i rozprowadza
 * to na cykl. Odczucia i nadpisania ciężaru zostają na swoich miejscach —
 * kopiuje się szkielet, nie historia.
 *
 * Dlaczego domyślnie **nie** cały plan, choć tak to kiedyś działało: bo cały
 * plan rozniesiony z jednego tygodnia to sześć identycznych tygodni, czyli
 * blok bez progresji. Trener zobaczył to pierwszego dnia i nazwał wprost —
 * kopiowanie ma sens dla jednego ćwiczenia, nie dla całego cyklu.
 */
export function skopiujTydzien(plan: Plan, zrodlo: Tydzien, positionId?: string): Plan {
  return {
    ...plan,
    sloty: plan.sloty.map((slot): SlotPlanu => {
      if (!slot.cwiczenieId) return { ...slot };
      if (positionId !== undefined && slot.positionId !== positionId) return { ...slot };

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
