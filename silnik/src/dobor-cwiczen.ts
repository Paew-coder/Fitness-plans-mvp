/**
 * Dobór ćwiczeń jednym kliknięciem — do kategorii, które trener ustawił
 * w szkielecie (szablonem albo ręcznie, w swojej kolejności).
 *
 * Trener, 02.10.2026: „po wybraniu szablonu albo po wpisaniu kategorii
 * w wybranej przeze mnie kolejności możliwość wygenerowania ćwiczeń
 * automatycznie jednym kliknięciem — miałem już taką funkcję w Base44”.
 *
 * **Reguła z Base44** (funkcja generatora z opublikowanego pakietu aplikacji,
 * `tEe`), przełożona na BAZĘ — trener ją wybrał:
 *
 * - **A** — bój główny: ćwiczenie z coeff 1,0, a wśród nich najpierw
 *   klasyczne boje (`KLASYCZNE_BOJE`). W Base44 była to klasa „main”;
 *   u nas bojem głównym jest wyłącznie coeff 1,0 (decyzja z 22.09.2026,
 *   dlatego OHP i wiosłowanie, coeff 0,75, na A nie trafiają).
 * - **B** — złożone, ale nie boje: coeff 0,75 (Base44: coef ≥ 0,65 bez „main”).
 * - **C, D, E** — akcesoria: coeff 0,5 i mniej.
 * - W kategorii bez takiego ćwiczenia (np. Upper pull horizontal nie ma
 *   żadnego 1,0) bierze najbliższy coeff, przy remisie cięższy.
 *
 * **Czego Base44 nie miało, a trener wybrał:** to samo ćwiczenie nigdy
 * dwa razy w jednym dniu; bój na A może wrócić w innym dniu (przysiad
 * 2× w tygodniu), akcesoria nie powtarzają się w całym planie, dopóki
 * kategoria ma coś innego. Ćwiczenia „DO WERYFIKACJI” są pomijane — ręcznie
 * dalej da się je wybrać.
 *
 * To nie jest AI: losowanie wśród ćwiczeń spełniających regułę. Serii,
 * powtórzeń, RPE i ciężarów nie dotyka — te liczy silnik jak zawsze.
 */
import type { Plan, SlotPlanu } from "./plan.ts";
import type { Coeff, Cwiczenie } from "./typy.ts";
import { katalog as katalogDomyslny, type Katalog } from "./katalog.ts";

/** Lista `Ej` z Base44 w nazwach z BAZY — tylko te z coeff 1,0. */
export const KLASYCZNE_BOJE: readonly string[] = [
  "Barbell back squat", "Barbell low bar squat", "Front squat",
  "Deadlift", "Sumo deadlift", "Trap bar deadlift",
  "Barbell bench press", "Pull up weighted",
];

export type WynikDoboru = {
  plan: Plan;
  /** Pozycje, w które wstawiono ćwiczenie. */
  dobrane: string[];
  /** Pozycje z kategorią, dla których nie było czego wstawić. */
  bezKandydata: string[];
};

/** Docelowy coeff pozycji: A — 1,0, B — 0,75, reszta — „0,5 i mniej”. */
function celPozycji(lp: string): "A" | "B" | "reszta" {
  const litera = lp.trim().charAt(0).toUpperCase();
  return litera === "A" ? "A" : litera === "B" ? "B" : "reszta";
}

/** Ćwiczenia ściśle według reguły pozycji; na A najpierw klasyczne boje. */
function wedlugReguly(cwiczenia: readonly Cwiczenie[], lp: string): Cwiczenie[] {
  const cel = celPozycji(lp);
  const scisle = cwiczenia.filter((c) =>
    cel === "A" ? c.coeff === 1 : cel === "B" ? c.coeff === 0.75 : c.coeff <= 0.5);
  if (cel !== "A") return scisle;
  const klasyczne = scisle.filter((c) => KLASYCZNE_BOJE.includes(c.nazwa));
  return klasyczne.length > 0 ? klasyczne : scisle;
}

/** Najbliższy coeff do docelowego pozycji, przy remisie cięższy. */
function najblizsze(cwiczenia: readonly Cwiczenie[], lp: string): Cwiczenie[] {
  if (cwiczenia.length === 0) return [];
  const cel = celPozycji(lp);
  const docelowy = cel === "A" ? 1 : cel === "B" ? 0.75 : 0.5;
  const odleglosc = (c: Coeff) => Math.abs(c - docelowy);
  const min = Math.min(...cwiczenia.map((c) => odleglosc(c.coeff)));
  const wsrod = cwiczenia.filter((c) => odleglosc(c.coeff) === min);
  const najciezszy = Math.max(...wsrod.map((c) => c.coeff));
  return wsrod.filter((c) => c.coeff === najciezszy);
}

/** Kandydaci do pozycji: według reguły, a gdy nic — najbliższy coeff. */
export function kandydaci(cwiczenia: readonly Cwiczenie[], lp: string): Cwiczenie[] {
  const scisle = wedlugReguly(cwiczenia, lp);
  return scisle.length > 0 ? scisle : najblizsze(cwiczenia, lp);
}

/**
 * Wstawia ćwiczenia w pozycje z kategorią.
 *
 * `odNowa: false` — tylko puste pozycje; `true` — wszystkie poza
 * `zablokowane` (pozycje, przy których klient już coś zapisał: to historia).
 * `los` — liczba z [0, 1); domyślnie `Math.random`, w testach ze ziarnem.
 */
export function dobierzCwiczenia(
  plan: Plan,
  opcje: { odNowa?: boolean; zablokowane?: ReadonlySet<string>; los?: () => number; katalog?: Katalog } = {},
): WynikDoboru {
  const { odNowa = false, zablokowane = new Set(), los = Math.random, katalog = katalogDomyslny } = opcje;
  const sloty: SlotPlanu[] = plan.sloty.map((s) => ({ ...s }));
  const doLosowania = (s: SlotPlanu) => !!s.kategoriaSzkieletu
    && !zablokowane.has(s.positionId) && (odNowa || !s.cwiczenieId);

  // Co już stoi w planie i zostaje — liczy się do „bez powtórek”.
  const wPlanie = new Set<string>();
  const wDniu = new Map<number, Set<string>>();
  const dodaj = (dzien: number, id: string) => {
    wPlanie.add(id);
    if (!wDniu.has(dzien)) wDniu.set(dzien, new Set());
    wDniu.get(dzien)!.add(id);
  };
  for (const s of sloty) if (s.cwiczenieId && !doLosowania(s)) dodaj(s.dzien, s.cwiczenieId);

  const dobrane: string[] = [];
  const bezKandydata: string[] = [];
  const wybierz = <T>(lista: readonly T[]) => lista[Math.min(lista.length - 1, Math.floor(los() * lista.length))]!;

  for (const s of sloty) {
    if (!doLosowania(s)) continue;
    const zKategorii = katalog.wKategorii(s.kategoriaSzkieletu)
      .filter((c) => !c.uwagi?.startsWith("DO WERYFIKACJI"));
    const dzis = wDniu.get(s.dzien) ?? new Set<string>();
    // Nigdy dwa razy w jednym dniu. Bój na A może wrócić w innym dniu;
    // reszta najpierw spośród jeszcze niewybranych.
    const dostepne = zKategorii.filter((c) => !dzis.has(c.id));
    const nieuzyte = celPozycji(s.lp) === "A" ? dostepne : dostepne.filter((c) => !wPlanie.has(c.id));
    // Reguła pozycji ma pierwszeństwo przed „bez powtórek”: gdy lekkich
    // akcesoriów zabraknie, lepiej powtórzyć jedno z innego dnia niż wstawić
    // na E ćwiczenie złożone. Dopiero gdy i tego brak — najbliższy coeff.
    const lista = [wedlugReguly(nieuzyte, s.lp), wedlugReguly(dostepne, s.lp),
      najblizsze(nieuzyte, s.lp), najblizsze(dostepne, s.lp)].find((l) => l.length > 0) ?? [];
    if (lista.length === 0) {
      // Nic do wstawienia — dotychczasowe ćwiczenie (przy „od nowa”) zostaje.
      bezKandydata.push(s.positionId);
      continue;
    }
    const c = wybierz(lista);
    s.cwiczenieId = c.id;
    dodaj(s.dzien, c.id);
    dobrane.push(s.positionId);
  }
  return { plan: { ...plan, sloty }, dobrane, bezKandydata };
}
