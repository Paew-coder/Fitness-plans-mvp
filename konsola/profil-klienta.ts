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
import { numerTygodniaNaEkranie, przeliczPlan, TYDZIEN_MAKSOW, type Plan } from "../silnik/src/plan.ts";
import type { SeriaWykonana } from "./serie-wykonane.ts";
import { najciezsza, serieWpisu } from "./serie-wykonane.ts";
import { oneRMzSerii } from "../silnik/src/odczyt-1rm.ts";
import { rozwiaz1RM } from "../silnik/src/rpe.ts";
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
   * 1RM: na starcie planu i najwyższy szacowany z treningów (23.11.2026).
   * Trener: „wolałbym zapis, który porównuje, jaki miałem 1RM w danym
   * ćwiczeniu na początku planu, a jaki mam aktualnie, i z czego to zostało
   * wyliczone — z której serii z którego tygodnia albo z TOP SETU — po prostu
   * najwyższy szacowany wynik”. Szacunek z każdej serii (`oneRMzSerii`: RPE
   * z planu, przesunięte oceną), z TOP SETU z ciężarem klienta i z tygodnia
   * maksów (1 × 1 to 1RM wprost). Dwubój nie — jego RPE to tylko odpowiednik.
   */
  type Zrodlo1RM = { rodzaj: "seria" | "top set" | "maksy"; tydzien: number; ciezar: number;
    powtorzenia: number; rpe: number | null; feedback: string | null };
  const najlepsze = new Map<string, { oneRM: number; zrodlo: Zrodlo1RM }>();
  const dopisz = (id: string, oneRM: number, zrodlo: Zrodlo1RM) => {
    const b = najlepsze.get(id);
    if (!b || oneRM > b.oneRM) najlepsze.set(id, { oneRM, zrodlo });
  };
  for (const w of wykonania) {
    const s = tydzienWyniku(wynik, w.tydzien)?.sloty.find((x) => x.positionId === w.positionId);
    const id = w.cwiczenieId ?? s?.cwiczenie?.id;
    if (!id || !s || s.dwuboj) continue;
    const maksy = w.tydzien === TYDZIEN_MAKSOW;
    for (const seria of serieWpisu(w)) {
      if (!seria.ciezar || !seria.powtorzenia) continue;
      const e = maksy && seria.powtorzenia === 1 ? { oneRM: seria.ciezar }
        : oneRMzSerii({ ciezar: seria.ciezar, powtorzenia: seria.powtorzenia,
          rpePlanowane: maksy ? 10 : s.rpe, feedback: maksy ? null : w.feedback ?? null });
      if (e) {
        dopisz(id, e.oneRM, { rodzaj: maksy ? "maksy" : "seria", tydzien: numerTygodniaNaEkranie(z.plan, w.tydzien),
          ciezar: seria.ciezar, powtorzenia: seria.powtorzenia, rpe: maksy ? 10 : s.rpe,
          feedback: maksy ? null : w.feedback ?? null });
      }
    }
  }
  for (const slot of z.plan.sloty) {
    for (const [klucz, p] of Object.entries(slot.tygodnie ?? {})) {
      const kg = p?.topSetKlienta?.kg;
      if (!kg) continue;
      const ts = tydzienWyniku(wynik, Number(klucz))?.topSety?.find((x) => x.positionId === slot.positionId);
      if (!ts?.cwiczenie || ts.rpe == null || ts.procent != null) continue;
      const feedback = p.topSetKlienta?.feedback ?? null;
      const e = oneRMzSerii({ ciezar: kg, powtorzenia: 1, rpePlanowane: ts.rpe, feedback });
      if (e) {
        dopisz(ts.cwiczenie.id, e.oneRM, { rodzaj: "top set", tydzien: numerTygodniaNaEkranie(z.plan, Number(klucz)),
          ciezar: kg, powtorzenia: 1, rpe: ts.rpe, feedback });
      }
    }
  }
  const kolejnoscCwiczen = (id: string) => {
    const i = z.plan.sloty.findIndex((s) => s.cwiczenieId === id);
    return i < 0 ? 999 : i;
  };
  // 1RM na starcie: obowiązujące w T1. 1RM ustalone dopiero serią z treningu
  // (ćwiczenie bez 1RM) startu nie ma.
  const naStarcie = z.plan.serieMaksymalne.filter((s) => !(s.kalibracja && s.kalibracja.oneRMPrzed === undefined));
  const oneRMCwiczen = [...najlepsze]
    .sort(([a], [b]) => kolejnoscCwiczen(a) - kolejnoscCwiczen(b))
    .map(([id, { oneRM, zrodlo }]) => ({
      nazwa: nazwaCwiczenia(id),
      start: rozwiaz1RM(id, naStarcie, 1) || null,
      wPlanie: rozwiaz1RM(id, z.plan.serieMaksymalne) || null,
      najwyzszy: oneRM,
      zrodlo,
    }));

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
