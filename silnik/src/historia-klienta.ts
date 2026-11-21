/**
 * Historia klienta — wiele cykli naraz.
 *
 * `porownanie-cykli.ts` odpowiada na pytanie „co się zmieniło wobec
 * poprzedniego planu". To jest pytanie inne i szersze: **co się dzieje z tym
 * człowiekiem od roku**. Przy czwartej wersji planu porównanie dwóch sąsiednich
 * cykli przestaje wystarczać — trend widać dopiero z całej serii.
 *
 * Arkusz nie mógł tego pokazać w ogóle: jeden plan to jeden plik.
 *
 * Jak wszystko w silniku — funkcja czysta. Nie wie o bazie, o trenerze ani
 * o tym, skąd wzięły się cykle; dostaje je gotowe i policzone.
 */
import type { PlanWyliczony } from "./plan.ts";
import { NAZWY_WZORCOW, WZORCE } from "./stres.ts";
import type { Part } from "./typy.ts";
import { zaokraglij } from "./pomocnicze.ts";

/** Jeden cykl na wejściu. Frekwencja przychodzi z zewnątrz — silnik jej nie liczy. */
export type CyklDoHistorii = {
  wersja: number;
  status: string;
  dataStartu: string | null;
  wynik: PlanWyliczony;
  /** Ile treningów klient domknął i ile ich było w planie. */
  ukonczonych: number;
  zaplanowanych: number;
};

export type PunktCyklu = {
  wersja: number;
  status: string;
  dataStartu: string | null;
  dniTreningowe: number;
  cwiczen: number;
  /** Średnie z sześciu tygodni — cykl porównuje się z cyklem, nie tydzień z tygodniem. */
  stresNaTydzien: number;
  serieNaTydzien: number;
  powtorzeniaNaTydzien: number;
  ukonczonych: number;
  zaplanowanych: number;
  /** Ułamek domkniętych treningów. `null`, gdy w planie nie było czego domykać. */
  frekwencja: number | null;
};

export type SciezkaCwiczenia = {
  cwiczenieId: string;
  nazwa: string;
  /** 1RM na wejściu w cykl — tylko z cykli, w których ćwiczenie w ogóle stało. */
  punkty: { wersja: number; oneRM: number }[];
  pierwszy: number;
  ostatni: number;
  zmianaKg: number;
  zmianaProc: number | null;
  /** W ilu cyklach się pojawiło. Miara tego, co u tego klienta jest stałe. */
  wCyklach: number;
};

export type SciezkaWzorca = {
  part: Part;
  nazwa: string;
  punkty: { wersja: number; serie: number }[];
};

export type HistoriaKlienta = {
  cykle: PunktCyklu[];
  cwiczenia: SciezkaCwiczenia[];
  wzorce: SciezkaWzorca[];
  razem: {
    cykli: number;
    ukonczonych: number;
    zaplanowanych: number;
    /** Od pierwszej daty startu do dziś, w dniach. `null` bez dat startu. */
    dniWspolpracy: number | null;
  };
};

/** Średnia z tygodni cyklu. Zero tygodni nie zdarza się, ale nie dzielimy przez nie. */
function srednia(wartosci: readonly number[]): number {
  if (wartosci.length === 0) return 0;
  return wartosci.reduce((a, b) => a + b, 0) / wartosci.length;
}

function punktCyklu(c: CyklDoHistorii): PunktCyklu {
  const tygodnie = c.wynik.tygodnie;
  const cwiczen = new Set(
    tygodnie[0]?.sloty.filter((s) => s.cwiczenie).map((s) => s.cwiczenie!.id) ?? [],
  ).size;

  return {
    wersja: c.wersja,
    status: c.status,
    dataStartu: c.dataStartu,
    dniTreningowe: c.wynik.dniTreningowe,
    cwiczen,
    stresNaTydzien: zaokraglij(srednia(tygodnie.map((t) => t.bilans.razem)), 2),
    serieNaTydzien: zaokraglij(srednia(tygodnie.map((t) => t.bilans.serieRazem)), 1),
    powtorzeniaNaTydzien: zaokraglij(srednia(tygodnie.map((t) => t.bilans.powtorzeniaRazem)), 0),
    ukonczonych: c.ukonczonych,
    zaplanowanych: c.zaplanowanych,
    frekwencja: c.zaplanowanych > 0 ? zaokraglij(c.ukonczonych / c.zaplanowanych, 3) : null,
  };
}

/**
 * 1RM ćwiczenia na wejściu w cykl.
 *
 * Bierzemy tydzień pierwszy, bo tam 1RM jest tym, co trener wpisał albo przyjął
 * z serii roboczych — w kolejnych tygodniach ciężar rusza się mnożnikiem
 * adaptacji, a to już nie jest ta sama miara.
 */
function sciezkiCwiczen(cykle: readonly CyklDoHistorii[]): SciezkaCwiczenia[] {
  const wgCwiczenia = new Map<string, { nazwa: string; punkty: { wersja: number; oneRM: number }[] }>();

  for (const c of cykle) {
    const pierwszyTydzien = c.wynik.tygodnie[0];
    if (!pierwszyTydzien) continue;

    // To samo ćwiczenie może stać w kilku dniach — 1RM jest jedno, więc bierzemy
    // pierwsze niezerowe wystąpienie.
    const wTymCyklu = new Map<string, { nazwa: string; oneRM: number }>();
    for (const slot of pierwszyTydzien.sloty) {
      if (!slot.cwiczenie || !(slot.oneRM > 0)) continue;
      if (!wTymCyklu.has(slot.cwiczenie.id)) {
        wTymCyklu.set(slot.cwiczenie.id, { nazwa: slot.cwiczenie.nazwa, oneRM: slot.oneRM });
      }
    }

    for (const [id, { nazwa, oneRM }] of wTymCyklu) {
      const wpis = wgCwiczenia.get(id) ?? { nazwa, punkty: [] };
      wpis.punkty.push({ wersja: c.wersja, oneRM });
      wgCwiczenia.set(id, wpis);
    }
  }

  return [...wgCwiczenia]
    .map(([cwiczenieId, w]) => {
      const punkty = [...w.punkty].sort((a, b) => a.wersja - b.wersja);
      const pierwszy = punkty[0]!.oneRM;
      const ostatni = punkty.at(-1)!.oneRM;
      return {
        cwiczenieId,
        nazwa: w.nazwa,
        punkty,
        pierwszy,
        ostatni,
        zmianaKg: zaokraglij(ostatni - pierwszy, 1),
        zmianaProc: pierwszy > 0 ? zaokraglij(((ostatni - pierwszy) / pierwszy) * 100, 1) : null,
        wCyklach: punkty.length,
      };
    })
    // Najpierw to, co ruszyło się najmocniej — tam jest treść. Przy równych
    // zmianach decyduje nazwa, żeby kolejność była powtarzalna.
    .sort((a, b) => Math.abs(b.zmianaKg) - Math.abs(a.zmianaKg) || a.nazwa.localeCompare(b.nazwa, "pl"));
}

function sciezkiWzorcow(cykle: readonly CyklDoHistorii[]): SciezkaWzorca[] {
  return WZORCE.map((part) => ({
    part,
    nazwa: NAZWY_WZORCOW[part],
    punkty: cykle.map((c) => ({
      wersja: c.wersja,
      serie: zaokraglij(
        srednia(c.wynik.tygodnie.map((t) => t.bilans.wzorce.find((w) => w.part === part)?.serie ?? 0)),
        1,
      ),
    })),
  }));
}

/** Ile dni minęło od daty. `null`, gdy daty nie ma. */
function dniOd(data: string | null, teraz: number): number | null {
  if (!data) return null;
  const znacznik = Date.parse(data);
  return Number.isNaN(znacznik) ? null : Math.floor((teraz - znacznik) / 86_400_000);
}

/**
 * Historia klienta z jego cykli. Kolejność wejścia nie ma znaczenia —
 * sortujemy po numerze wersji, bo to on porządkuje cykle.
 *
 * `teraz` jako parametr, a nie `Date.now()` w środku: inaczej funkcja
 * przestałaby być czysta i testy zależałyby od dnia uruchomienia.
 */
export function historiaKlienta(
  cykleWejsciowe: readonly CyklDoHistorii[],
  teraz: number = Date.now(),
): HistoriaKlienta {
  const cykle = [...cykleWejsciowe].sort((a, b) => a.wersja - b.wersja);
  const daty = cykle.map((c) => c.dataStartu).filter((d): d is string => Boolean(d)).sort();

  return {
    cykle: cykle.map(punktCyklu),
    cwiczenia: sciezkiCwiczen(cykle),
    wzorce: sciezkiWzorcow(cykle),
    razem: {
      cykli: cykle.length,
      ukonczonych: cykle.reduce((a, c) => a + c.ukonczonych, 0),
      zaplanowanych: cykle.reduce((a, c) => a + c.zaplanowanych, 0),
      dniWspolpracy: dniOd(daty[0] ?? null, teraz),
    },
  };
}

/**
 * Historia opisana słowami — bez oceniania.
 *
 * Ta sama zasada, co przy porównaniu cykli: mniej objętości po przerwie to
 * dokładnie to, co trzeba, a program nie wie, co działo się poza aplikacją.
 */
export function podsumujHistorie(h: HistoriaKlienta): string {
  if (h.cykle.length === 0) return "Brak cykli do pokazania.";
  if (h.cykle.length === 1) return "To pierwszy cykl — historia zacznie się od następnego.";

  const czesci: string[] = [`${h.cykle.length} cykli`];
  if (h.razem.dniWspolpracy !== null) {
    const miesiace = Math.round(h.razem.dniWspolpracy / 30);
    czesci.push(miesiace >= 1 ? `przez ${miesiace} ${miesiace === 1 ? "miesiąc" : "miesięcy"}` : "w tym miesiącu");
  }
  if (h.razem.zaplanowanych > 0) {
    czesci.push(`${h.razem.ukonczonych} z ${h.razem.zaplanowanych} treningów domkniętych`);
  }

  const rosnace = h.cwiczenia.filter((c) => c.wCyklach >= 2 && c.zmianaKg > 0).length;
  const malejace = h.cwiczenia.filter((c) => c.wCyklach >= 2 && c.zmianaKg < 0).length;
  if (rosnace + malejace > 0) {
    czesci.push(`1RM w górę w ${rosnace}, w dół w ${malejace} ćwiczeniach`);
  }

  return `${czesci.join(" · ")}.`;
}
