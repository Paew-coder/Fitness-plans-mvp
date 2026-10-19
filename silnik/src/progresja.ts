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
import type { ParametryTygodnia, Plan, SlotPlanu } from "./plan.ts";
import { TYGODNIE } from "./plan.ts";
import { PROGRESJE_Z_TABELI, type Tydzien } from "./typy.ts";
import { Katalog, katalog as katalogDomyslny } from "./katalog.ts";
import { bojGlownySlotu, dwubojSlotu, parametrySzablonu, pauzaSlotu } from "./szablon-boju.ts";
import { POWT_MAX_BEZ_TABELI, powtorzeniaAkcesorium } from "./powtorzenia.ts";
import { POWT_MAX, POWT_MIN } from "./rpe.ts";

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
/**
 * To, co należy do konkretnego tygodnia, a nie do szkieletu: ocena klienta,
 * ciężar wpisany przez trenera i ciężar wybrany przez klienta. Progresja
 * i kopiowanie tygodni tego nie ruszają — do 26.09 gubiły wybór klienta.
 */
function wlasneTygodnia(p: ParametryTygodnia | undefined): ParametryTygodnia {
  const { feedback, ciezarOverride, ciezarKlienta, topSetKlienta } = p ?? {};
  return {
    ...(feedback !== undefined ? { feedback } : {}),
    ...(ciezarOverride !== undefined ? { ciezarOverride } : {}),
    ...(ciezarKlienta !== undefined ? { ciezarKlienta } : {}),
    ...(topSetKlienta !== undefined ? { topSetKlienta } : {}),
  };
}

export function zastosujProgresje(
  plan: Plan,
  katalog: Katalog = katalogDomyslny,
  /**
   * `tylkoBoje` — przepisuje wyłącznie boje główne. Po zmianie „Części planu"
   * (27.09.2026): wpisane liczby boju zostałyby ze starej części, a akcesoriów
   * zmiana nie dotyczy — ich serie i RPE są w każdej części te same, a ręczne
   * poprawki trenera przy nich mają zostać.
   */
  opcje: { tylkoBoje?: boolean } = {},
): Plan {
  return {
    ...plan,
    sloty: plan.sloty.map((slot): SlotPlanu => {
      if (!slot.cwiczenieId) return { ...slot };

      // Szablon boju należy się ćwiczeniu złożonemu, nie miejscu w tabeli —
      // dlatego progresja musi wiedzieć, co w tym slocie stoi.
      const cwiczenie = katalog.poId(slot.cwiczenieId);
      const coeff = cwiczenie?.coeff;
      // Pauzowane mają progresję zależną od części planu, tak jak bój —
      // po zmianie części ich liczby też trzeba przepisać.
      // Dwubój tak samo (16.10.2026) — jego tabela też zależy od części.
      if (opcje.tylkoBoje && !bojGlownySlotu(slot, cwiczenie)
        && !pauzaSlotu(slot, slot.cwiczenieId, plan.czescPlanu)
        && !dwubojSlotu(slot, slot.cwiczenieId)) return { ...slot };
      const tygodnie: SlotPlanu["tygodnie"] = { ...(slot.tygodnie ?? {}) };
      for (const t of TYGODNIE) {
        tygodnie[t] = {
          ...parametrySzablonu(slot, t, cwiczenie, plan.czescPlanu),
          ...wlasneTygodnia(tygodnie[t]),
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
      const { feedback: _f, ciezarOverride: _c, ciezarKlienta: _k, topSetKlienta: _t,
        ...doSkopiowania } = wzorzec;

      const tygodnie: SlotPlanu["tygodnie"] = { ...(slot.tygodnie ?? {}) };
      for (const t of TYGODNIE) {
        if (t === zrodlo) continue;
        tygodnie[t] = { ...doSkopiowania, ...wlasneTygodnia(tygodnie[t]) };
      }
      return { ...slot, tygodnie };
    }),
  };
}

/**
 * „±” — powtórzenia całej progresji ułożone od T1 (19.10.2026).
 *
 * Trener: „jak dane ćwiczenie idzie T1–T3 8–10 i T4–T6 8–10, to jak wpiszę
 * w T1 10, to będzie szło 10–12 i 10–12; jak idzie T1–T6 10–15, to po
 * wpisaniu 12 ma iść 12–17. Wyjątkiem są ćwiczenia główne z własną
 * periodyzacją”.
 *
 * Liczone od progresji z planu, nie od tego, co akurat stoi w T1. Pierwsza
 * wersja przesuwała o różnicę względem bieżącego T1 — a trener wpisał 6 do pola
 * T1, kliknął „±”, okienko podsunęło 6 i różnica wyszła zero: „w T2 nadal jest
 * 9 po zmianie, a nie 7”. Teraz przesunięcie = T1 − automat T1, a powtórzenia
 * wpisane w T1–T6 ustępują automatowi z przesunięciem, żeby cała progresja szła
 * od T1. Przy „↗” (stałe powtórzenia, `przedRpeRosnacym`) wszystkie tygodnie
 * dostają liczbę z T1 — automat z przesunięciem wraca po wyłączeniu „↗”.
 *
 * `t1 === null` — powrót do progresji z planu (bez przesunięcia i bez wpisanych
 * powtórzeń). Zwraca nowy plan albo powód odmowy po polsku.
 */
export function powtorzeniaOdT1(
  plan: Plan, positionId: string, t1: number | null, katalog: Katalog = katalogDomyslny,
): Plan | { blad: string } {
  const slot = plan.sloty.find((s) => s.positionId === positionId);
  const cwiczenie = slot?.cwiczenieId ? katalog.poId(slot.cwiczenieId) : undefined;
  if (!slot || !cwiczenie) return { blad: "Nie ma takiego ćwiczenia w planie." };
  if (bojGlownySlotu(slot, cwiczenie) || pauzaSlotu(slot, cwiczenie.id, plan.czescPlanu)
    || dwubojSlotu(slot, cwiczenie.id)) {
    return { blad: "To ćwiczenie ma własną periodyzację — jego powtórzeń się nie przesuwa." };
  }
  const bezTabeli = !PROGRESJE_Z_TABELI.includes(cwiczenie.progresja);
  const automat = TYGODNIE.map((t) => powtorzeniaAkcesorium({
    coeff: cwiczenie.coeff, czesc: plan.czescPlanu, tydzien: t,
    przezCalyCykl: cwiczenie.progresja === "masa ciała", bezTabeli,
  }));
  let przesuniecie = 0;
  if (t1 !== null) {
    if (!Number.isInteger(t1)) return { blad: "Wpisz liczbę całkowitą." };
    przesuniecie = t1 - automat[0]!;
    const po = automat.map((x) => x + przesuniecie);
    const maks = bezTabeli ? POWT_MAX_BEZ_TABELI : POWT_MAX;
    if (Math.min(...po) < POWT_MIN || Math.max(...po) > maks) {
      return { blad: bezTabeli
        ? `Od ${POWT_MIN} do ${maks} powtórzeń w każdym tygodniu — wyszłoby ${po.join(" · ")}.`
        : `Przy ćwiczeniu z ciężarem tabela %1RM kończy się na ${POWT_MAX} powtórzeniach — `
          + `wyszłoby ${po.join(" · ")}.` };
    }
  }

  const stale = slot.przedRpeRosnacym ? structuredClone(slot.przedRpeRosnacym) : undefined;
  const tygodnie: SlotPlanu["tygodnie"] = { ...(slot.tygodnie ?? {}) };
  for (const t of TYGODNIE) {
    if (!tygodnie[t] && !(stale && t1 !== null)) continue;
    const { powtorzenia: _p, ...reszta } = tygodnie[t] ?? {};
    tygodnie[t] = stale && t1 !== null ? { ...reszta, powtorzenia: t1 } : reszta;
  }
  if (stale) {
    stale.powtorzenia = t1 === null ? {}
      : Object.fromEntries(Object.keys(stale.powtorzenia).map((t) => [t, t1]));
  }
  const { przesunieciePowtorzen: _s, przedRpeRosnacym: _r, ...bezPol } = slot;
  const nowy: SlotPlanu = {
    ...bezPol,
    tygodnie,
    ...(przesuniecie ? { przesunieciePowtorzen: przesuniecie } : {}),
    ...(stale ? { przedRpeRosnacym: stale } : {}),
  };
  return { ...plan, sloty: plan.sloty.map((s) => (s.positionId === positionId ? nowy : s)) };
}
