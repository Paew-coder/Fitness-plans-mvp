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
import type { Wykonanie, ZapisanyPlan } from "./magazyn.ts";

/** Ciężar różny od planu o więcej niż tyle (ułamek) — „lżej” albo „ciężej”. */
const PROG_ROZNICY = 0.02;
/** Najwięcej treningów w dzienniku — starsze są w Historii (cykle). */
const MAKS_TRENINGOW = 80;

type Wynik = ReturnType<typeof przeliczPlan>;
type SlotWyniku = Wynik["tygodnie"][number]["sloty"][number];

const nazwaCwiczenia = (id: string | undefined | null) => (id ? katalog.poId(id)?.nazwa ?? id : "—");

/** Tydzień wyniku — roboczy (1–6) albo po cyklu (deload, maksy). */
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

  // 1RM zmienione serią z treningu w tym cyklu (kalibracja albo inny ciężar w środku).
  const zmiany1RM = z.plan.serieMaksymalne
    .filter((s) => s.kalibracja && !s.zTygodniaMaksow)
    .map((s) => ({
      nazwa: nazwaCwiczenia(s.cwiczenieId),
      tydzien: numerTygodniaNaEkranie(z.plan, s.kalibracja!.tydzien),
      seria: { ciezar: s.kalibracja!.ciezar, powtorzenia: s.kalibracja!.powtorzenia },
      przed: s.kalibracja!.oneRMPrzed ?? null,
      po: s.powtorzenia === 1 ? s.ciezar : null,
      data: s.kalibracja!.data,
    }))
    .sort((a, b) => a.tydzien - b.tydzien);

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
    zmiany1RM,
    uwagi: z.plan.sloty.filter((s) => s.cwiczenieId && s.uwaga?.trim())
      .map((s) => ({ dzien: s.dzien, lp: (s.lp ?? "").replace(/\.$/, ""), nazwa: nazwaCwiczenia(s.cwiczenieId), uwaga: s.uwaga!.trim() })),
    // Do wykresu stresu w konsoli (`wykresStresu`) — bez slotów.
    stres: {
      plan: { deload: !!z.plan.deload, tydzienMaksow: !!z.plan.tydzienMaksow },
      wynik: {
        dniTreningowe: wynik.dniTreningowe,
        tygodnie: wynik.tygodnie.map((t) => ({ tydzien: t.tydzien, bilans: t.bilans, ocenaStresu: t.ocenaStresu })),
        tygodnieDodatkowe: (wynik.tygodnieDodatkowe ?? []).map((t) => ({ tydzien: t.tydzien, rodzaj: t.rodzaj, bilans: t.bilans })),
      },
    },
  };
}
