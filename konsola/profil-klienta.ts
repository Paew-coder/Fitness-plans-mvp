/**
 * Profil klienta — „Teraz” i „Dziennik treningów” (20.11.2026).
 *
 * Trener: „lepiej, żeby analiza każdego klienta była osobno po wejściu w niego
 * w konsoli trenera — klienci mają swoje panele/profile, gdzie widoczne są ich
 * plany, analiza dotychczasowych planów i treningów, zebrane w przejrzystej
 * i spójnej formie”. Trzy zakładki: Teraz (bieżący cykl), Dziennik (co klient
 * robił, trening po treningu, przez wszystkie cykle), Historia (cykle — to,
 * co kartoteka pokazywała dotąd).
 *
 * Czysta logika na zapisanych planach — liczby z silnika (`przeliczPlan`),
 * tu tylko zestawienie. Testy: `testy/profil-klienta.test.ts`.
 */
import { katalog } from "../silnik/src/katalog.ts";
import { numerTygodniaNaEkranie, przeliczPlan, TYDZIEN_MAKSOW, tygodniePlanu, type Plan } from "../silnik/src/plan.ts";
import type { SeriaWykonana } from "./serie-wykonane.ts";
import { najciezsza, serieWpisu } from "./serie-wykonane.ts";
import { procent1RM, rozwiaz1RM } from "../silnik/src/rpe.ts";
import { serieEfektywne, stresSlotu } from "../silnik/src/stres.ts";
import { PRZESUNIECIE_RPE } from "../silnik/src/odczyt-1rm.ts";
import { skokiStresu, stresCwiczen } from "../silnik/src/analiza-stresu.ts";
import { kolejnosc } from "../silnik/src/tygodnie.ts";
import type { Wykonanie, ZapisanyPlan } from "./magazyn.ts";

/** Ciężar różny od planu o więcej niż tyle (ułamek) — „lżej” albo „ciężej”. */
const PROG_ROZNICY = 0.02;
/** Najwięcej treningów w dzienniku — starsze są w Historii (cykle). */
const MAKS_TRENINGOW = 80;

type Wynik = ReturnType<typeof przeliczPlan>;
type SlotWyniku = Wynik["tygodnie"][number]["sloty"][number];

const nazwaCwiczenia = (id: string | undefined | null) => (id ? katalog.poId(id)?.nazwa ?? id : "—");

/** Tydzień wyniku — roboczy (1–6, 9–14) albo po cyklu (deload, maksy). */
function tydzienWyniku(wynik: Wynik, tydzien: number) {
  return wynik.tygodnie.find((t) => t.tydzien === tydzien)
    ?? (wynik.tygodnieDodatkowe ?? []).find((t) => t.tydzien === tydzien);
}

/** „lżej” / „ciężej” / `null` — najcięższa seria klienta względem ciężaru z planu. */
export function roznicaCiezaru(serie: readonly SeriaWykonana[], planowany: unknown): "lżej" | "ciężej" | null {
  const top = najciezsza(serie);
  if (typeof planowany !== "number" || !(planowany > 0) || !top?.ciezar) return null;
  const r = top.ciezar / planowany - 1;
  return r < -PROG_ROZNICY ? "lżej" : r > PROG_ROZNICY ? "ciężej" : null;
}

const dzienWpisu = (plan: Plan, w: Wykonanie) =>
  w.tydzien === TYDZIEN_MAKSOW ? 1 : plan.sloty.find((s) => s.positionId === w.positionId)?.dzien;

type Zrodlo1RM = { rodzaj: "seria" | "top set" | "maksy"; tydzien: number; ciezar: number; powtorzenia: number };

/**
 * Szacunki 1RM z treningów jednego cyklu, bez RPE (23.11.2026): seria jak do
 * upadku (tabela przy RPE 10), TOP SET i maksy (1 powtórzenie) — ciężar wprost.
 * Na ćwiczenie: lista szacunków z kluczem tygodnia i źródłem.
 */
export function szacunki1RM(z: ZapisanyPlan, wynik: Wynik = przeliczPlan(z.plan)) {
  const wykonania = z.wykonania ?? [];
  const szacunki = new Map<string, { klucz: number; oneRM: number; zrodlo: Zrodlo1RM }[]>();
  const dopisz = (id: string, klucz: number, ciezar: number, powtorzenia: number, rodzaj: Zrodlo1RM["rodzaj"]) => {
    const procent = procent1RM(powtorzenia, 10);
    if (!(ciezar > 0) || !procent) return;
    const lista = szacunki.get(id) ?? [];
    lista.push({ klucz, oneRM: Math.round(ciezar / (procent / 100) * 10) / 10,
      zrodlo: { rodzaj, tydzien: numerTygodniaNaEkranie(z.plan, klucz), ciezar, powtorzenia } });
    szacunki.set(id, lista);
  };
  for (const w of wykonania) {
    const s = tydzienWyniku(wynik, w.tydzien)?.sloty.find((x) => x.positionId === w.positionId);
    const id = w.cwiczenieId ?? s?.cwiczenie?.id;
    if (!id) continue;
    for (const seria of serieWpisu(w)) {
      if (seria.ciezar && seria.powtorzenia) {
        dopisz(id, w.tydzien, seria.ciezar, seria.powtorzenia, w.tydzien === TYDZIEN_MAKSOW ? "maksy" : "seria");
      }
    }
  }
  for (const slot of z.plan.sloty) {
    for (const [klucz, p] of Object.entries(slot.tygodnie ?? {})) {
      const kg = p?.topSetKlienta?.kg;
      const ts = kg ? tydzienWyniku(wynik, Number(klucz))?.topSety?.find((x) => x.positionId === slot.positionId) : null;
      if (kg && ts?.cwiczenie) dopisz(ts.cwiczenie.id, Number(klucz), kg, 1, "top set");
    }
  }
  return szacunki;
}

/**
 * 1RM przez cykle (23.11.2026): w każdym cyklu najwyższy szacunek z treningów
 * — ta sama miara co „Progress 1RM”, bez RPE. Trener: „to chyba jest
 * nieaktualne, bo jest ten problem z RM w bench press” — dotąd panel brał
 * 1RM z planu na wejściu w cykl, więc obniżka 1RM serią w środku cyklu
 * (126 → 120,3) wyglądała jak spadek siły. Cykl bez serii ćwiczenia — bez punktu.
 */
export function oneRMPrzezCykle(plany: readonly ZapisanyPlan[]) {
  const wgCwiczenia = new Map<string, { nazwa: string; punkty: { wersja: number; oneRM: number; zrodlo: Zrodlo1RM }[] }>();
  for (const z of [...plany].sort((a, b) => a.wersja - b.wersja)) {
    for (const [id, lista] of szacunki1RM(z)) {
      const max = lista.reduce((a, b) => (b.oneRM > a.oneRM ? b : a));
      const wpis = wgCwiczenia.get(id) ?? { nazwa: nazwaCwiczenia(id), punkty: [] };
      wpis.punkty.push({ wersja: z.wersja, oneRM: max.oneRM, zrodlo: max.zrodlo });
      wgCwiczenia.set(id, wpis);
    }
  }
  return [...wgCwiczenia].map(([cwiczenieId, w]) => {
    const pierwszy = w.punkty[0]!.oneRM;
    const ostatni = w.punkty.at(-1)!.oneRM;
    return {
      cwiczenieId, nazwa: w.nazwa, punkty: w.punkty, pierwszy, ostatni,
      zmianaKg: Math.round((ostatni - pierwszy) * 10) / 10,
      zmianaProc: pierwszy > 0 ? Math.round(((ostatni - pierwszy) / pierwszy) * 1000) / 10 : null,
      wCyklach: w.punkty.length,
    };
  }).sort((a, b) => Math.abs(b.zmianaKg) - Math.abs(a.zmianaKg) || a.nazwa.localeCompare(b.nazwa, "pl"));
}

/**
 * Ćwiczenia, które klient już robił (24.11.2026). Trener: „żeby w profilu
 * klienta zapamiętywały się ćwiczenia, które już robił — jak robił Dumbbell
 * row w jakimś cyklu, a ja mu wpiszę to do kolejnego, to chcę, żeby mi się
 * pokazywało, że już robił, i jakim ciężarem albo jaki 1RM”.
 *
 * Na ćwiczenie (to, które klient faktycznie robił — `cwiczenieId` wpisu):
 * cykle, w których je robił; ostatni trening z seriami (cykl, tydzień,
 * serie, ocena); najwyższy szacunek 1RM z treningów (bez RPE, jak „Progress
 * 1RM”) i 1RM z planu najnowszego z tych cykli. `pomin` — plan, który trener
 * właśnie rozpisuje (jego wpisy to nie „już robił”).
 */
export function cwiczeniaKlienta(plany: readonly ZapisanyPlan[], pomin?: string) {
  const wynik = new Map<string, {
    cwiczenieId: string; nazwa: string; cykle: number[]; treningow: number;
    ostatnio: { wersja: number; tydzien: number; data: string; serie: SeriaWykonana[]; feedback: string | null } | null;
    najwyzszy: { oneRM: number; wersja: number; zrodlo: Zrodlo1RM } | null;
    oneRMPlanu: { oneRM: number; wersja: number } | null;
  }>();
  for (const z of [...plany].filter((p) => p.id !== pomin).sort((a, b) => a.wersja - b.wersja)) {
    const wynikPlanu = przeliczPlan(z.plan);
    for (const w of z.wykonania ?? []) {
      const id = w.cwiczenieId ?? z.plan.sloty.find((s) => s.positionId === w.positionId)?.cwiczenieId;
      if (!id) continue;
      const c = wynik.get(id) ?? { cwiczenieId: id, nazwa: nazwaCwiczenia(id), cykle: [], treningow: 0,
        ostatnio: null, najwyzszy: null, oneRMPlanu: null };
      if (!c.cykle.includes(z.wersja)) c.cykle.push(z.wersja);
      c.treningow++;
      const serie = serieWpisu(w).filter((x) => x.ciezar || x.powtorzenia);
      if (serie.length && (!c.ostatnio || w.data > c.ostatnio.data)) {
        c.ostatnio = { wersja: z.wersja, tydzien: numerTygodniaNaEkranie(z.plan, w.tydzien), data: w.data,
          serie, feedback: w.feedback ?? null };
      }
      wynik.set(id, c);
    }
    for (const [id, lista] of szacunki1RM(z, wynikPlanu)) {
      const c = wynik.get(id);
      if (!c) continue;
      const max = lista.reduce((a, b) => (b.oneRM > a.oneRM ? b : a));
      if (!c.najwyzszy || max.oneRM > c.najwyzszy.oneRM) c.najwyzszy = { oneRM: max.oneRM, wersja: z.wersja, zrodlo: max.zrodlo };
    }
    for (const c of wynik.values()) {
      if (!c.cykle.includes(z.wersja)) continue;
      const oneRM = rozwiaz1RM(c.cwiczenieId, z.plan.serieMaksymalne);
      if (oneRM > 0) c.oneRMPlanu = { oneRM: Math.round(oneRM * 10) / 10, wersja: z.wersja };
    }
  }
  return [...wynik.values()].sort((a, b) => (b.ostatnio?.data ?? "").localeCompare(a.ostatnio?.data ?? "")
    || a.nazwa.localeCompare(b.nazwa, "pl"));
}

/**
 * Dziennik treningów: trening = cykl × tydzień × dzień, od najnowszego.
 * Przy każdym ćwiczeniu serie klienta, ocena, TOP SET i plan tego tygodnia
 * (tak, jak plan stoi teraz — po zmianach trenera i ocenach).
 */
export function dziennikTreningow(plany: readonly ZapisanyPlan[]) {
  const treningi = [];
  for (const z of plany) {
    const wynik = przeliczPlan(z.plan);
    const grupy = new Map<string, Wykonanie[]>();
    for (const w of z.wykonania ?? []) {
      const dzien = dzienWpisu(z.plan, w);
      if (dzien === undefined) continue;
      const klucz = `${w.tydzien}/${dzien}`;
      grupy.set(klucz, [...(grupy.get(klucz) ?? []), w]);
    }
    // Dzień domknięty bez żadnego wpisu też jest treningiem („Zakończ trening” na samych OK).
    for (const u of z.ukonczoneDni ?? []) {
      const klucz = `${u.tydzien}/${u.dzien}`;
      if (!grupy.has(klucz)) grupy.set(klucz, []);
    }
    for (const [klucz, wpisy] of grupy) {
      const [tydzien, dzien] = klucz.split("/").map(Number) as [number, number];
      const ukonczony = (z.ukonczoneDni ?? []).find((u) => u.tydzien === tydzien && u.dzien === dzien);
      const daty = [...wpisy.map((w) => w.data), ...(ukonczony?.data ? [ukonczony.data] : [])].sort();
      if (daty.length === 0) continue;
      const t = tydzienWyniku(wynik, tydzien);
      const kolejnosc = new Map(z.plan.sloty.map((s, i) => [s.positionId, i]));
      const cwiczenia = [...wpisy]
        .sort((a, b) => (kolejnosc.get(a.positionId) ?? 999) - (kolejnosc.get(b.positionId) ?? 999))
        .map((w) => {
          const s: SlotWyniku | undefined = t?.sloty.find((x) => x.positionId === w.positionId);
          const serie = serieWpisu(w);
          const slotPlanu = z.plan.sloty.find((x) => x.positionId === w.positionId);
          const ts = slotPlanu?.tygodnie?.[tydzien as 1]?.topSetKlienta;
          const tsPlan = t?.topSety?.find((x) => x.positionId === w.positionId);
          return {
            lp: (s?.lp ?? slotPlanu?.lp ?? "").replace(/\.$/, ""),
            nazwa: nazwaCwiczenia(w.cwiczenieId ?? slotPlanu?.cwiczenieId),
            serie,
            feedback: w.feedback ?? null,
            plan: s ? { serie: s.serie, powtorzenia: s.powtorzenia, ciezar: typeof s.ciezar === "number" ? s.ciezar : null }
              : null,
            roznica: roznicaCiezaru(serie, s?.ciezar),
            topSet: ts?.kg || ts?.feedback
              ? { kg: ts.kg ?? null, feedback: ts.feedback ?? null,
                  plan: typeof tsPlan?.ciezar === "number" ? tsPlan.ciezar : null }
              : null,
          };
        });
      treningi.push({
        planId: z.id,
        wersja: z.wersja,
        nazwaPlanu: z.plan.tytul?.trim() || null,
        tydzien: numerTygodniaNaEkranie(z.plan, tydzien),
        rodzaj: t && "rodzaj" in t ? t.rodzaj ?? null : null,
        dzien,
        data: daty.at(-1)!,
        domkniety: Boolean(ukonczony),
        cwiczenia,
      });
    }
  }
  return treningi.sort((a, b) => b.data.localeCompare(a.data)).slice(0, MAKS_TRENINGOW);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Stres zaplanowany a zrobiony (23.11.2026, trener: „zrób punkty 1, 2 i 3”).
 *
 * Ten sam `stresSlotu` co w planie, tylko z tego, co klient wpisał: każda
 * seria osobno (jej powtórzenia), RPE z planu tego tygodnia przesunięte oceną
 * (jak przy szacowaniu 1RM). Ocena bez serii albo domknięty dzień bez wpisu —
 * „zrobione jak w planie”. Liczą się tylko treningi, które się odbyły (dzień
 * z jakimkolwiek wpisem albo domknięty) — inaczej tydzień w toku wyglądałby
 * jak niewykonany. Tygodnie robocze i deload; maksów nie (to próby, nie dawka).
 */
export function stresZrobiony(z: ZapisanyPlan, wynik: Wynik = przeliczPlan(z.plan)) {
  const wykonania = z.wykonania ?? [];
  const ukonczone = z.ukonczoneDni ?? [];
  const jednostronne = z.plan.liczenieJednostronnych ?? "jak w arkuszu";
  const tygodnie = [];
  const cwiczenia = new Map<string, { nazwa: string; plan: number; zrobiony: number }>();
  for (const klucz of tygodniePlanu(z.plan)) {
    if (klucz === TYDZIEN_MAKSOW) continue;
    const t = tydzienWyniku(wynik, klucz);
    if (!t) continue;
    const odbyte = new Set([
      ...ukonczone.filter((u) => u.tydzien === klucz).map((u) => u.dzien),
      ...wykonania.filter((w) => w.tydzien === klucz)
        .map((w) => z.plan.sloty.find((s) => s.positionId === w.positionId)?.dzien)
        .filter((d): d is number => d !== undefined),
    ]);
    if (odbyte.size === 0) continue;
    let plan = 0;
    let zrobiony = 0;
    for (const s of t.sloty) {
      if (!s.cwiczenie || !odbyte.has(s.dzien)) continue;
      const w = wykonania.find((x) => x.positionId === s.positionId && x.tydzien === klucz);
      const cw = (w?.cwiczenieId ? katalog.poId(w.cwiczenieId) : null) ?? s.cwiczenie;
      const serie = serieWpisu(w).filter((x) => x.powtorzenia && x.powtorzenia > 0);
      const rpe = s.rpe + PRZESUNIECIE_RPE[w?.feedback ?? "OK"];
      const zTreningu = serie.length > 0
        ? serie.reduce((a, x) => a + stresSlotu({ coeff: cw.coeff,
          serie: serieEfektywne(1, cw.jednostronne, jednostronne), rpe, powtorzenia: x.powtorzenia! }).calkowity, 0)
        : s.stres.calkowity;   // ocena bez serii albo domknięty dzień — jak w planie
      plan += s.stres.calkowity;
      zrobiony += zTreningu;
      const c = cwiczenia.get(cw.id) ?? { nazwa: cw.nazwa, plan: 0, zrobiony: 0 };
      c.plan += s.stres.calkowity;
      c.zrobiony += zTreningu;
      cwiczenia.set(cw.id, c);
    }
    tygodnie.push({
      tydzien: numerTygodniaNaEkranie(z.plan, klucz),
      rodzaj: "rodzaj" in t ? t.rodzaj ?? null : null,
      treningow: odbyte.size,
      plan: r2(plan), zrobiony: r2(zrobiony), procent: plan > 0 ? Math.round(zrobiony / plan * 100) : null,
    });
  }
  const plan = tygodnie.reduce((a, t) => a + t.plan, 0);
  const zrobiony = tygodnie.reduce((a, t) => a + t.zrobiony, 0);
  return {
    tygodnie,
    razem: { plan: r2(plan), zrobiony: r2(zrobiony), procent: plan > 0 ? Math.round(zrobiony / plan * 100) : null },
    cwiczenia: [...cwiczenia.values()]
      .filter((c) => c.plan > 0)
      .sort((a, b) => b.plan - a.plan)
      .map((c) => ({ nazwa: c.nazwa, plan: r2(c.plan), zrobiony: r2(c.zrobiony), procent: Math.round(c.zrobiony / c.plan * 100) })),
  };
}

/**
 * Skoki obciążenia (23.11.2026): stres planu tydzień po tygodniu (tygodnie
 * robocze) i — gdzie klient trenował — stres zrobiony, każdy względem
 * poprzedniego tygodnia i średniej z trzech poprzednich (`skokiStresu`).
 */
export function skokiObciazenia(z: ZapisanyPlan, wynik: Wynik, zrobiony: ReturnType<typeof stresZrobiony>) {
  const plan = skokiStresu(wynik.tygodnie.map((t) => r2(t.bilans.razem)));
  const robocze = zrobiony.tygodnie.filter((t) => !t.rodzaj);
  const zTreningow = skokiStresu(robocze.map((t) => t.zrobiony));
  return wynik.tygodnie.map((t, i) => {
    const numer = numerTygodniaNaEkranie(z.plan, t.tydzien);
    const j = robocze.findIndex((x) => x.tydzien === numer);
    return { tydzien: numer, plan: plan[i]!, zrobiony: j >= 0 ? zTreningow[j]! : null };
  });
}

/**
 * Bieżący cykl w skrócie: oceny (razem i ćwiczenia, przy których się
 * powtarzają), ciężary inne niż w planie, zmiany 1RM w trakcie cyklu, uwagi
 * do ćwiczeń i stres tydzień po tygodniu (do wykresu).
 */
export function terazKlienta(z: ZapisanyPlan) {
  const wynik = przeliczPlan(z.plan);
  const wykonania = z.wykonania ?? [];

  // Oceny i ciężary — po ćwiczeniu, które klient faktycznie robił.
  const poCwiczeniu = new Map<string, { nazwa: string; trudne: number; latwe: number; lzej: number; ciezej: number; wpisow: number }>();
  for (const w of wykonania) {
    const slot = z.plan.sloty.find((s) => s.positionId === w.positionId);
    const id = w.cwiczenieId ?? slot?.cwiczenieId;
    if (!id) continue;
    const r = poCwiczeniu.get(id) ?? { nazwa: nazwaCwiczenia(id), trudne: 0, latwe: 0, lzej: 0, ciezej: 0, wpisow: 0 };
    r.wpisow++;
    if (w.feedback === "za trudne") r.trudne++;
    if (w.feedback === "za łatwe") r.latwe++;
    const s = tydzienWyniku(wynik, w.tydzien)?.sloty.find((x) => x.positionId === w.positionId);
    const roznica = roznicaCiezaru(serieWpisu(w), s?.ciezar);
    if (roznica === "lżej") r.lzej++;
    if (roznica === "ciężej") r.ciezej++;
    poCwiczeniu.set(id, r);
  }
  const lista = [...poCwiczeniu.values()];

  /*
   * 1RM z treningów: pierwszy trening → najwyższy w cyklu (23.11.2026).
   * Trener: „porównuje, jaki miałem 1RM na początku planu, a jaki mam
   * aktualnie, i z czego to zostało wyliczone — z której serii, z którego
   * tygodnia albo z top setu — po prostu najwyższy szacowany wynik”, potem:
   * „do wyliczeń maxów w tych podsumowaniach nie uwzględniaj RPE — jeżeli na
   * początku robiłem 100 × 4, a na końcu 105 × 3, to z tego porównuj maxa,
   * chyba że z top setu wyszło więcej, to wtedy top set”.
   *
   * Bez RPE: seria liczy się tak, jakby szła do upadku (tabela przy RPE 10 —
   * 4 powtórzenia to 91,5 % 1RM), TOP SET i maksy (1 powtórzenie) — ciężar
   * wprost. Oceny klienta nic tu nie zmieniają. Na początku: najlepszy wynik
   * z pierwszego tygodnia, w którym ćwiczenie ma serie; potem najwyższy
   * z całego cyklu. Dwubój też — tu liczą się kilogramy, nie RPE.
   */
  const szacunki = szacunki1RM(z, wynik);
  const kolejnoscCwiczen = (id: string) => {
    const i = z.plan.sloty.findIndex((s) => s.cwiczenieId === id);
    return i < 0 ? 999 : i;
  };
  const najlepszy = <T extends { oneRM: number; klucz: number }>(lista: T[]) =>
    lista.reduce((a, b) => (b.oneRM > a.oneRM || (b.oneRM === a.oneRM && kolejnosc(b.klucz) > kolejnosc(a.klucz)) ? b : a));
  const oneRMCwiczen = [...szacunki]
    .sort(([a], [b]) => kolejnoscCwiczen(a) - kolejnoscCwiczen(b))
    .map(([id, lista]) => {
      const pierwszy = Math.min(...lista.map((x) => kolejnosc(x.klucz)));
      const naPoczatku = najlepszy(lista.filter((x) => kolejnosc(x.klucz) === pierwszy));
      const max = najlepszy(lista);
      return {
        nazwa: nazwaCwiczenia(id),
        poczatek: { oneRM: naPoczatku.oneRM, zrodlo: naPoczatku.zrodlo },
        najwyzszy: { oneRM: max.oneRM, zrodlo: max.zrodlo },
      };
    });

  const zrobionyStres = stresZrobiony(z, wynik);
  return {
    planId: z.id,
    wersja: z.wersja,
    nazwaPlanu: z.plan.tytul?.trim() || null,
    status: z.status,
    oceny: {
      trudne: wykonania.filter((w) => w.feedback === "za trudne").length,
      ok: wykonania.filter((w) => w.feedback === "OK").length,
      latwe: wykonania.filter((w) => w.feedback === "za łatwe").length,
    },
    ocenyCwiczen: lista.filter((r) => r.trudne || r.latwe)
      .sort((a, b) => b.trudne + b.latwe - a.trudne - a.latwe)
      .map(({ nazwa, trudne, latwe }) => ({ nazwa, trudne, latwe })),
    ciezaryCwiczen: lista.filter((r) => r.lzej || r.ciezej)
      .sort((a, b) => b.lzej + b.ciezej - a.lzej - a.ciezej)
      .map(({ nazwa, lzej, ciezej, wpisow }) => ({ nazwa, lzej, ciezej, wpisow })),
    oneRMCwiczen,
    // Więcej z liczenia stresu (23.11.2026): ranking ćwiczeń, zaplanowany
    // a zrobiony, skoki obciążenia.
    stresCwiczen: stresCwiczen(wynik),
    skoki: skokiObciazenia(z, wynik, zrobionyStres),
    uwagi: z.plan.sloty.filter((s) => s.cwiczenieId && s.uwaga?.trim())
      .map((s) => ({ dzien: s.dzien, lp: (s.lp ?? "").replace(/\.$/, ""), nazwa: nazwaCwiczenia(s.cwiczenieId), uwaga: s.uwaga!.trim() })),
    // Do wykresu stresu w konsoli (`wykresStresu`) — bez slotów.
    stres: {
      plan: { deload: !!z.plan.deload, tydzienMaksow: !!z.plan.tydzienMaksow,
        ...(z.plan.tygodni ? { tygodni: z.plan.tygodni } : {}) },
      wynik: {
        dniTreningowe: wynik.dniTreningowe,
        tygodnie: wynik.tygodnie.map((t) => ({ tydzien: t.tydzien, bilans: t.bilans, ocenaStresu: t.ocenaStresu })),
        tygodnieDodatkowe: (wynik.tygodnieDodatkowe ?? []).map((t) => ({ tydzien: t.tydzien, rodzaj: t.rodzaj, bilans: t.bilans })),
      },
    },
  };
}
