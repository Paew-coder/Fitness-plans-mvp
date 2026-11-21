/**
 * Porównanie cykli.
 *
 * Arkusz widzi jeden plan naraz. Żeby odpowiedzieć na pytanie „czy w tym
 * cyklu robi więcej niż w poprzednim", trzeba było otworzyć dwa pliki obok
 * siebie i porównywać wzrokiem — a przy trzeciej i czwartej wersji planu to
 * przestaje działać.
 *
 * Tutaj to jedna funkcja czysta: dwa policzone plany na wejściu, różnice
 * na wyjściu.
 *
 * **Czego to świadomie nie robi:** nie ocenia, czy zmiana jest dobra. Wzrost
 * objętości o 20% może być planowaną progresją albo błędem — o tym decyduje
 * trener, patrząc na klienta, nie na liczbę.
 */

import type { PlanWyliczony } from "./plan.ts";
import type { Part } from "./typy.ts";
import { zaokraglij } from "./pomocnicze.ts";
import { WZORCE, NAZWY_WZORCOW } from "./stres.ts";

/** Zmiana wartości liczbowej między cyklami. */
export type Zmiana = {
  poprzednio: number;
  teraz: number;
  roznica: number;
  /** Zmiana procentowa. `null`, gdy poprzednio było zero — nie ma od czego liczyć. */
  procent: number | null;
};

function zmiana(poprzednio: number, teraz: number, miejsca = 1): Zmiana {
  return {
    poprzednio: zaokraglij(poprzednio, miejsca),
    teraz: zaokraglij(teraz, miejsca),
    roznica: zaokraglij(teraz - poprzednio, miejsca),
    procent: poprzednio > 0 ? zaokraglij(((teraz - poprzednio) / poprzednio) * 100, 1) : null,
  };
}

/** Średnia z sześciu tygodni — cykle porównujemy jako całości, nie tydzień po tygodniu. */
function sredniaTygodniowa(plan: PlanWyliczony, wybierz: (t: PlanWyliczony["tygodnie"][number]) => number): number {
  if (plan.tygodnie.length === 0) return 0;
  return plan.tygodnie.reduce((suma, t) => suma + wybierz(t), 0) / plan.tygodnie.length;
}

export type ZmianaWzorca = {
  part: Part;
  nazwa: string;
  /** Średnia liczba serii na tydzień. */
  serie: Zmiana;
  stres: Zmiana;
};

export type ZmianaCwiczenia = {
  cwiczenieId: string;
  nazwa: string;
  /** `powtórka` — było w poprzednim cyklu i zostaje; `nowe` — weszło teraz; `usunięte` — wypadło. */
  stan: "powtórka" | "nowe" | "usunięte";
  /** 1RM z serii maksymalnych. `null`, gdy w danym cyklu go nie było. */
  oneRMPoprzednio: number | null;
  oneRMTeraz: number | null;
  zmianaOneRM: Zmiana | null;
};

export type PorownanieCykli = {
  nazwaPoprzednia: string;
  nazwaObecna: string;
  dniTreningowe: Zmiana;
  /** Stres całkowity, średnio na tydzień. */
  obciazenie: Zmiana;
  serieRazem: Zmiana;
  powtorzeniaRazem: Zmiana;
  wzorce: ZmianaWzorca[];
  cwiczenia: ZmianaCwiczenia[];
  /** Ile ćwiczeń wróciło z poprzedniego cyklu, na ile w ogóle. */
  powtorzonych: number;
  wszystkichTeraz: number;
};

/**
 * Porównuje dwa policzone cykle.
 *
 * `oneRM` bierzemy z pierwszego tygodnia, bo tam widać punkt startowy —
 * to, z czym klient wchodził w cykl.
 */
export function porownajCykle(poprzedni: PlanWyliczony, obecny: PlanWyliczony): PorownanieCykli {
  const wzorce: ZmianaWzorca[] = WZORCE.map((part) => {
    const serieWzorca = (plan: PlanWyliczony) => sredniaTygodniowa(plan, (t) =>
      t.bilans.wzorce.find((w) => w.part === part)?.serie ?? 0);
    const stresWzorca = (plan: PlanWyliczony) => sredniaTygodniowa(plan, (t) =>
      t.bilans.wzorce.find((w) => w.part === part)?.stres ?? 0);
    return {
      part,
      nazwa: NAZWY_WZORCOW[part] ?? part,
      serie: zmiana(serieWzorca(poprzedni), serieWzorca(obecny)),
      stres: zmiana(stresWzorca(poprzedni), stresWzorca(obecny)),
    };
  });

  // Ćwiczenia z obu cykli, z 1RM na wejściu do cyklu.
  const zbierz = (plan: PlanWyliczony) => {
    const mapa = new Map<string, { nazwa: string; oneRM: number | null }>();
    for (const slot of plan.tygodnie[0]?.sloty ?? []) {
      if (!slot.cwiczenie) continue;
      mapa.set(slot.cwiczenie.id, {
        nazwa: slot.cwiczenie.nazwa,
        oneRM: slot.oneRM || null,
      });
    }
    return mapa;
  };
  const byly = zbierz(poprzedni);
  const sa = zbierz(obecny);

  const cwiczenia: ZmianaCwiczenia[] = [];
  for (const [id, teraz] of sa) {
    const poprzednio = byly.get(id);
    cwiczenia.push({
      cwiczenieId: id,
      nazwa: teraz.nazwa,
      stan: poprzednio ? "powtórka" : "nowe",
      oneRMPoprzednio: poprzednio?.oneRM ?? null,
      oneRMTeraz: teraz.oneRM,
      zmianaOneRM: poprzednio?.oneRM && teraz.oneRM
        ? zmiana(poprzednio.oneRM, teraz.oneRM)
        : null,
    });
  }
  for (const [id, poprzednio] of byly) {
    if (sa.has(id)) continue;
    cwiczenia.push({
      cwiczenieId: id,
      nazwa: poprzednio.nazwa,
      stan: "usunięte",
      oneRMPoprzednio: poprzednio.oneRM,
      oneRMTeraz: null,
      zmianaOneRM: null,
    });
  }

  // Najpierw powtórki (tam widać progresję), potem nowe, na końcu usunięte.
  const kolejnosc = { "powtórka": 0, "nowe": 1, "usunięte": 2 };
  cwiczenia.sort((a, b) =>
    kolejnosc[a.stan] - kolejnosc[b.stan] || a.nazwa.localeCompare(b.nazwa, "pl"));

  return {
    nazwaPoprzednia: poprzedni.nazwa,
    nazwaObecna: obecny.nazwa,
    dniTreningowe: zmiana(poprzedni.dniTreningowe, obecny.dniTreningowe, 0),
    obciazenie: zmiana(
      sredniaTygodniowa(poprzedni, (t) => t.bilans.razem),
      sredniaTygodniowa(obecny, (t) => t.bilans.razem),
    ),
    serieRazem: zmiana(
      sredniaTygodniowa(poprzedni, (t) => t.bilans.serieRazem),
      sredniaTygodniowa(obecny, (t) => t.bilans.serieRazem),
    ),
    powtorzeniaRazem: zmiana(
      sredniaTygodniowa(poprzedni, (t) => t.bilans.powtorzeniaRazem),
      sredniaTygodniowa(obecny, (t) => t.bilans.powtorzeniaRazem),
    ),
    wzorce,
    cwiczenia,
    powtorzonych: cwiczenia.filter((c) => c.stan === "powtórka").length,
    wszystkichTeraz: sa.size,
  };
}

/**
 * Jedno zdanie streszczające porównanie — do pokazania w konsoli.
 *
 * Opisuje, nie ocenia. „Więcej" nie znaczy „lepiej"; przy odciążeniu albo
 * powrocie po kontuzji mniej jest dokładnie tym, co trzeba.
 */
export function podsumujPorownanie(p: PorownanieCykli): string {
  const kierunek = (z: Zmiana) => {
    if (z.procent === null || Math.abs(z.procent) < 5) return "bez większej zmiany";
    return `${z.procent > 0 ? "+" : ""}${z.procent}%`;
  };
  const powtorki = p.wszystkichTeraz > 0
    ? `${p.powtorzonych} z ${p.wszystkichTeraz} ćwiczeń wraca z poprzedniego cyklu`
    : "brak ćwiczeń w planie";
  return `Obciążenie ${kierunek(p.obciazenie)}, serie ${kierunek(p.serieRazem)}. ${powtorki}.`;
}
