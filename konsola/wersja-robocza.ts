/**
 * Wersja robocza planu — zmiany trenera czekają, klient trenuje na zatwierdzonej.
 *
 * Trener, 10.10.2026: „funkcja taka, że jak wprowadzam zmiany, to nie wpływa
 * to na aktualne plany klientów, chyba że to zatwierdzę”.
 *
 * Model. Konsola pracuje jak dotąd na `plan_json` — każda trasa trenera
 * (tabela, ▲▼, tygodnie, szablon, losowanie, asystent, 1RM, eksport, cofanie)
 * zostaje bez zmian. Gdy plan jest u klienta (status inny niż „szkic”),
 * pierwsza zmiana trenera odkłada kopię tego, co klient widzi
 * (`plan_klienta_json`). Telefon czyta odtąd tę kopię, aż trener zatwierdzi
 * zmiany (kopia znika — klient widzi plan trenera) albo je odrzuci (plan
 * trenera wraca do kopii).
 *
 * Wpisy klienta (oceny, jego ciężary, TOP SETY, serie maksymalne) w tym czasie
 * idą do obu wersji: do kopii, którą klient widzi, i do planu trenera — żeby
 * trener widział je przy pracy i żeby zatwierdzenie niczego klientowi nie zabrało.
 *
 * Przestawienie ▲▼ przenosi treść slotu na inną pozycję. Wykonania klienta
 * w bazie są kluczowane pozycją planu trenera, więc kopia klienta potrzebuje
 * mapy: pozycja u trenera → pozycja tej samej treści u klienta.
 *
 * Czysta logika, bez bazy — testy w `testy/wersja-robocza.test.ts`.
 */
import type { Plan } from "../silnik/src/plan.ts";

/** Pola, które w tygodniu slotu wpisuje klient, nie trener. */
export const POLA_KLIENTA = ["feedback", "ciezarKlienta", "topSetKlienta"] as const;

/** Mapa pozycji: positionId w planie trenera → positionId tej samej treści u klienta. */
export type MapaPozycji = Record<string, string>;

/** JSON z kluczami w stałej kolejności — porównanie treści, nie kolejności pól. */
export function kanonicznie(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
    : v));
}

export const naKlienta = (mapa: MapaPozycji, pozycjaTrenera: string) => mapa[pozycjaTrenera] ?? pozycjaTrenera;

export function odwrocMape(mapa: MapaPozycji): MapaPozycji {
  return Object.fromEntries(Object.entries(mapa).map(([t, k]) => [k, t]));
}

/** Mapa bez przestawień (każda pozycja na swoim miejscu) — przechowujemy wtedy pustą. */
export function bezPrzestawien(mapa: MapaPozycji): boolean {
  return Object.entries(mapa).every(([t, k]) => t === k);
}

/** Po zamianie treści pozycji `a` i `b` w planie trenera. */
export function przestaw(mapa: MapaPozycji, a: string, b: string): MapaPozycji {
  const nowa = { ...mapa, [a]: naKlienta(mapa, b), [b]: naKlienta(mapa, a) };
  return Object.fromEntries(Object.entries(nowa).filter(([t, k]) => t !== k));
}

/**
 * To, co klient zmienił między `stary` a `nowy` (jego wersja planu), przepisane
 * na `cel` (plan trenera). `naCel` mówi, gdzie w celu leży pozycja klienta.
 * Zmienia `cel` w miejscu i go zwraca.
 */
export function przeniesWpisyKlienta(
  stary: Plan, nowy: Plan, cel: Plan, naCel: (pozycjaKlienta: string) => string,
): Plan {
  const stareSloty = new Map(stary.sloty.map((s) => [s.positionId, s]));
  for (const slot of nowy.sloty) {
    const przed = stareSloty.get(slot.positionId);
    const docelowy = cel.sloty.find((s) => s.positionId === naCel(slot.positionId));
    if (!docelowy) continue;
    const tygodnie = new Set([...Object.keys(slot.tygodnie ?? {}), ...Object.keys(przed?.tygodnie ?? {})]);
    for (const t of tygodnie) {
      for (const pole of POLA_KLIENTA) {
        const teraz = (slot.tygodnie as any)?.[t]?.[pole];
        const wczesniej = (przed?.tygodnie as any)?.[t]?.[pole];
        if (kanonicznie(teraz) === kanonicznie(wczesniej)) continue;
        docelowy.tygodnie ??= {};
        const tydzien = ((docelowy.tygodnie as any)[t] ??= {});
        if (teraz === undefined) delete tydzien[pole];
        else tydzien[pole] = structuredClone(teraz);
      }
    }
  }
  // Serie maksymalne: klient dopisuje i kalibruje je z telefonu. Przepisujemy
  // tylko ćwiczenia, przy których coś się zmieniło — resztę mógł zmienić trener.
  const wedlug = (p: Plan) => {
    const m = new Map<string, unknown[]>();
    for (const s of p.serieMaksymalne ?? []) m.set(s.cwiczenieId, [...(m.get(s.cwiczenieId) ?? []), s]);
    return m;
  };
  const przed = wedlug(stary);
  const po = wedlug(nowy);
  for (const id of new Set([...przed.keys(), ...po.keys()])) {
    if (kanonicznie(przed.get(id)) === kanonicznie(po.get(id))) continue;
    cel.serieMaksymalne = [
      ...(cel.serieMaksymalne ?? []).filter((s) => s.cwiczenieId !== id),
      ...structuredClone(nowy.serieMaksymalne.filter((s) => s.cwiczenieId === id)),
    ];
  }
  return cel;
}

/**
 * Plan bez wpisów klienta — do „Resetuj plan” (10.10.2026): oceny, ciężary
 * i TOP SETY klienta znikają z tygodni, a 1RM wyliczone z jego treningu
 * (`kalibracja`) z serii maksymalnych. Serie maksymalne wpisane wprost zostają,
 * tylko bez pamięci o zastąpionej kalibracji — tamtego treningu już nie ma.
 * Parametry trenera (serie, powtórzenia, RPE, ciężar na sztywno) bez zmian.
 */
export function bezWpisowKlienta(plan: Plan): Plan {
  const czysty = structuredClone(plan);
  for (const slot of czysty.sloty) {
    for (const tydzien of Object.values(slot.tygodnie ?? {})) {
      for (const pole of POLA_KLIENTA) delete (tydzien as any)?.[pole];
    }
  }
  czysty.serieMaksymalne = czysty.serieMaksymalne
    .filter((s) => !s.kalibracja)
    .map(({ zastapionaKalibracja, ...s }) => s);
  return czysty;
}

/** Tydzień slotu bez wpisów klienta — to, co ustawia trener. */
function parametryTrenera(tydzien: Record<string, unknown> | undefined): string {
  const { feedback, ciezarKlienta, topSetKlienta, ...reszta } = tydzien ?? {};
  return kanonicznie(reszta);
}

const ETYKIETY_PLANU: Record<string, string> = {
  czescPlanu: "część planu",
  trybAkcesoriow: "tryb akcesoriów",
  topSety: "TOP SETY",
  rozgrzewki: "rozgrzewka",
  serieMaksymalne: "serie maksymalne / 1RM",
  deload: "tydzień deload",
  tydzienMaksow: "tydzień maksów",
  cwiczeniaMaksow: "ćwiczenia tygodnia maksów",
  liczenieJednostronnych: "liczenie jednostronnych",
  nazwa: "nazwa planu",
};

/**
 * Co trener zmienił względem wersji klienta — zdania do paska „Zatwierdź”.
 * `nazwa` zamienia id ćwiczenia na nazwę.
 */
export function podsumujZmiany(
  klienta: Plan, trenera: Plan, mapa: MapaPozycji, nazwa: (id: string) => string,
): string[] {
  const zmiany: string[] = [];
  const uKlienta = new Map(klienta.sloty.map((s) => [s.positionId, s]));
  const lp = (s: { lp?: string } | undefined) => (s?.lp ?? "").replace(/\.$/, "") || "—";
  for (const s of trenera.sloty) {
    const k = uKlienta.get(naKlienta(mapa, s.positionId));
    const gdzie = `Dzień ${s.dzien} ${lp(s)}`;
    const przed = k?.cwiczenieId ?? null;
    const po = s.cwiczenieId ?? null;
    if (!przed && !po) continue;
    if (przed !== po) {
      zmiany.push(!przed ? `${gdzie}: dodane ${nazwa(po!)}`
        : !po ? `${gdzie}: usunięte ${nazwa(przed)}`
          : `${gdzie}: ${nazwa(przed)} → ${nazwa(po)}`);
      continue;
    }
    if (naKlienta(mapa, s.positionId) !== s.positionId) {
      zmiany.push(`${gdzie}: ${nazwa(po!)} przestawione (było ${lp(k)})`);
    } else if (lp(k) !== lp(s)) {
      zmiany.push(`${gdzie}: ${nazwa(po!)} — numer ${lp(k)} → ${lp(s)}`);
    }
    const tygodnie = [...new Set([...Object.keys(s.tygodnie ?? {}), ...Object.keys(k?.tygodnie ?? {})])]
      .filter((t) => parametryTrenera((s.tygodnie as any)?.[t]) !== parametryTrenera((k?.tygodnie as any)?.[t]))
      .map(Number).sort((a, b) => a - b);
    const ustawienia = ["bojGlowny", "bojSilowy", "trybCiezaru"]
      .some((p) => kanonicznie((s as any)[p]) !== kanonicznie((k as any)?.[p]));
    if (tygodnie.length || ustawienia) {
      zmiany.push(`${gdzie}: ${nazwa(po!)} — ${tygodnie.length ? `parametry T${tygodnie.join(", T")}` : "ustawienia"}`
        + (tygodnie.length && ustawienia ? " i ustawienia" : ""));
    }
  }
  const klucze = new Set([...Object.keys(klienta), ...Object.keys(trenera)].filter((k) => k !== "sloty"));
  const inne: string[] = [];
  for (const klucz of klucze) {
    if (kanonicznie((klienta as any)[klucz]) === kanonicznie((trenera as any)[klucz])) continue;
    inne.push(ETYKIETY_PLANU[klucz] ?? klucz);
  }
  if (inne.length) zmiany.push(`Plan: ${[...new Set(inne)].join(", ")}`);
  return zmiany;
}
