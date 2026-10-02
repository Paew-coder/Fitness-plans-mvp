/**
 * Moduł biegowy — zakładka BIEG.
 *
 * Pięć pól na wejściu (wiek, HR max, dystans i czas biegu testowego, liczba
 * jednostek w tygodniu) i wychodzi z tego sześć tygodni po maksymalnie pięć
 * jednostek, z czasem, tempem, szacowanym dystansem i — orientacyjnie — tętnem.
 *
 * Zasada arkusza, którą warto powtórzyć na głos: **czas jest zadaniem, tempo
 * celem, dystans szacunkiem.** Biegacz ma przebiec minuty, nie kilometry.
 *
 * Od 27.09.2026 (trener) rozpiska stoi na tempie i czasie, a tętno jest tylko
 * poglądowe. Zestaw jednostek jest stały: przy N biegach w tygodniu pierwsze
 * N z listy — spokojny, progowy, długie wybieganie, interwały, spokojny
 * z przebieżkami. Wcześniej, jak w arkuszu, przy 2–3 biegach były tylko
 * spokojne i ciągły, progowy dopiero przy piątym, a interwałów wcale.
 *
 * Źródło wzorów: `BIEG!B13:B28` i bloki jednostek `BIEG!B32:O61`.
 */

import { mround, zaokraglij, zaokraglijJakArkusz } from "./pomocnicze.ts";
import {
  STREFY_TETNA, TEMPA, WZORY_JEDNOSTEK,
  MNOZNIK_TYGODNIA, MNOZNIK_LICZBY_JEDNOSTEK,
} from "./dane/bieg.ts";

export type KluczTempa = "spokojne" | "ciagle" | "progowe" | "interwal";

export type StrefaTetna = { nazwa: string; od: number; do: number };
export type TempoBiegowe = { klucz: KluczTempa; nazwa: string; offset: number };
export type RodzajJednostki = "spokojny" | "progowy" | "dlugie" | "interwaly" | "przebiezki";

export type WzorJednostki = {
  nr: number;
  klucz: RodzajJednostki;
  /** Nazwa dla klienta: „Bieg progowy", „Interwały"… */
  typ: string;
  /** Minuty pracy przed przemnożeniem przez mnożniki. */
  bazaMin: number;
  tempo: KluczTempa;
  /** Numer strefy tętna (1–5) wskazywany przez arkusz. */
  strefa: number;
  etykieta: string;
  /** Rozgrzewka i schłodzenie (albo przebieżki) doliczane do czasu, tempem spokojnym. */
  dodatkoweMin: number;
  /** Długość jednego odcinka — tylko przy biegu progowym i interwałach. */
  odcinekMin?: number;
  /** Trucht po każdym odcinku. */
  przerwaMin?: number;
  /** Liczba przebieżek po 20 s na końcu biegu spokojnego. */
  przebiezki?: number;
};

export { STREFY_TETNA, TEMPA, WZORY_JEDNOSTEK, MNOZNIK_TYGODNIA, MNOZNIK_LICZBY_JEDNOSTEK };

/** Minimalna długość jednostki po wszystkich mnożnikach (MAX(10; …) w arkuszu). */
export const MIN_MINUT = 10;
/** Odcinek biegu progowego — tyle minut (wzór może mieć własny: `odcinekMin`). */
export const MINUT_NA_POWTORZENIE = 4;
/** Przerwa po odcinku (wzór może mieć własną: `przerwaMin`). */
export const MINUT_PRZERWY = 2;
/** Przebieżka — tyle sekund, szybko i luźno. */
export const SEKUND_PRZEBIEZKI = 20;

export type DaneBiegowe = {
  wiek?: number | null;
  /** HR max zmierzone; jeśli podane, wygrywa nad wzorem z wieku. */
  hrMaxZmierzone?: number | null;
  /** Dystans biegu testowego w kilometrach. */
  dystansTestowy?: number | null;
  /** Czas biegu testowego w minutach. */
  czasTestowy?: number | null;
  /** Ile razy w tygodniu klient chce biegać (1–5). */
  jednostekWTygodniu?: number | null;
};

/**
 * HR max: zmierzone, jeśli jest; inaczej `208 − 0,7 × wiek`.
 * `null`, gdy nie ma ani jednego, ani drugiego.
 */
export function hrMax(dane: DaneBiegowe): number | null {
  if (dane.hrMaxZmierzone) return dane.hrMaxZmierzone;
  if (!dane.wiek) return null;
  return zaokraglijJakArkusz(208 - 0.7 * dane.wiek);
}

/** Tempo biegu testowego w minutach na kilometr. `null` bez kompletu danych. */
export function tempoTestowe(dane: DaneBiegowe): number | null {
  if (!dane.dystansTestowy || !dane.czasTestowy) return null;
  return dane.czasTestowy / dane.dystansTestowy;
}

/**
 * Minuty na kilometr → `mm:ss`. Odpowiednik `TEXT(x/1440; "mm:ss")`.
 *
 * Sekundy się **obcina**, nie zaokrągla — tak robi `TEXT` i tak trzeba, żeby
 * tempo interwału wyszło `04:49`, a nie `04:50`. Epsilon chroni przed sytuacją,
 * w której wartość dokładnie na pełnej sekundzie wyjdzie z arytmetyki
 * zmiennoprzecinkowej o włos za nisko.
 */
export function tempoTekst(minNaKm: number): string {
  const sekundy = Math.floor(minNaKm * 60 + 1e-9);
  const m = Math.floor(sekundy / 60);
  const s = sekundy % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type StrefaWyliczona = StrefaTetna & { odUd: number; doUd: number };

/** Pięć stref w uderzeniach na minutę. Puste, gdy nie da się policzyć HR max. */
export function strefyTetna(dane: DaneBiegowe): StrefaWyliczona[] {
  const hr = hrMax(dane);
  if (hr === null) return [];
  return STREFY_TETNA.map((s) => ({
    ...s,
    odUd: zaokraglijJakArkusz(hr * s.od),
    doUd: zaokraglijJakArkusz(hr * s.do),
  }));
}

export type TempoWyliczone = TempoBiegowe & { minNaKm: number; tekst: string };

/** Cztery tempa treningowe jako offsety od tempa testowego. */
export function tempaTreningowe(dane: DaneBiegowe): TempoWyliczone[] {
  const bazowe = tempoTestowe(dane);
  if (bazowe === null) return [];
  return TEMPA.map((t) => {
    const minNaKm = bazowe + t.offset;
    return { ...t, minNaKm, tekst: tempoTekst(minNaKm) };
  });
}

export type Jednostka = {
  nr: number;
  klucz: RodzajJednostki;
  /** Nazwa dla klienta: „Bieg progowy". */
  typ: string;
  /** Całość jednym zdaniem — do dymków i tabel. */
  opis: string;
  /** Przebieg jednostki krok po kroku: rozgrzewka, odcinki, trucht, schłodzenie. */
  kroki: string[];
  etykieta: string;
  /** Minuty pracy właściwej. */
  minutPracy: number;
  /** Rozgrzewka i schłodzenie. */
  minutDodatkowych: number;
  /** Przerwy między powtórzeniami. */
  minutPrzerw: number;
  /** Suma trzech powyższych — to jest zadanie. */
  minutRazem: number;
  /** Szacowany dystans w kilometrach; `null` bez biegu testowego. */
  dystansKm: number | null;
  tempo: KluczTempa;
  /** Tempo części głównej, `mm:ss` na kilometr. */
  tempoTekst: string | null;
  /** Tempo rozgrzewki, truchtu i schłodzenia — spokojne. */
  tempoSpokojneTekst: string | null;
  /** Tylko orientacyjnie — rozpiska stoi na tempie i czasie. */
  strefa: StrefaWyliczona | null;
  /** Liczba odcinków; tylko przy biegu progowym i interwałach. */
  powtorzen: number | null;
  /** Długość odcinka w minutach, gdy są odcinki. */
  odcinekMin: number | null;
};

export type TydzienBiegowy = { tydzien: number; jednostki: Jednostka[] };

/**
 * Minuty pracy jednej jednostki.
 *
 * `MAX(10; ROUND(baza × mnożnikTygodnia × mnożnikLiczbyJednostek / 5; 0) × 5)` —
 * czyli zaokrąglenie do pełnych pięciu minut, ale nigdy poniżej dziesięciu.
 */
export function minutyPracy(bazaMin: number, tydzien: number, jednostekWTygodniu: number): number {
  const mT = MNOZNIK_TYGODNIA[tydzien - 1] ?? 1;
  const mJ = MNOZNIK_LICZBY_JEDNOSTEK[Math.max(1, Math.min(5, jednostekWTygodniu)) - 1] ?? 1;
  return Math.max(MIN_MINUT, zaokraglijJakArkusz((bazaMin * mT * mJ) / 5) * 5);
}

/**
 * Plan biegowy na sześć tygodni.
 *
 * Bez `jednostekWTygodniu` nie ma czego liczyć — zwraca puste tygodnie.
 * Bez biegu testowego jednostki powstają, ale bez temp i dystansów: arkusz
 * zachowuje się tak samo, bo czas jest zadaniem i da się go podać bez tempa.
 */
export function planBiegowy(dane: DaneBiegowe): TydzienBiegowy[] {
  const ile = Math.max(0, Math.min(5, Math.trunc(dane.jednostekWTygodniu ?? 0)));
  if (ile < 1) return [];

  const tempa = tempaTreningowe(dane);
  const strefy = strefyTetna(dane);
  const tempoPo = (k: KluczTempa) => tempa.find((t) => t.klucz === k) ?? null;
  const spokojne = tempoPo("spokojne");

  return MNOZNIK_TYGODNIA.map((_, i) => {
    const tydzien = i + 1;
    const jednostki = WZORY_JEDNOSTEK.slice(0, ile).map((w): Jednostka => {
      const minutPracy = minutyPracy(w.bazaMin, tydzien, ile);
      const odcinek = w.odcinekMin ?? null;
      const przerwa = w.przerwaMin ?? MINUT_PRZERWY;
      const powtorzen = odcinek ? zaokraglijJakArkusz(minutPracy / odcinek) : null;
      const minutPrzerw = powtorzen === null ? 0 : powtorzen * przerwa;
      const tempo = tempoPo(w.tempo);

      // Praca leci swoim tempem, rozgrzewka i przerwy zawsze spokojnym.
      const dystansKm = tempo && spokojne
        ? mround(
          minutPracy / tempo.minNaKm + (w.dodatkoweMin + minutPrzerw) / spokojne.minNaKm,
          0.5,
        )
        : null;

      const polowa = w.dodatkoweMin / 2;
      const nazwaTempa = w.tempo === "interwal" ? "interwałowym" : "progowym";
      const kroki = powtorzen !== null
        ? [
          `${polowa} min rozgrzewki — spokojnie`,
          `${powtorzen} × ${odcinek} min w tempie ${nazwaTempa}`,
          `po każdym odcinku ${przerwa} min truchtu`,
          `${polowa} min schłodzenia — spokojnie`,
        ]
        : w.przebiezki
          ? [
            `${minutPracy} min spokojnie`,
            `na koniec ${w.przebiezki} × ${SEKUND_PRZEBIEZKI} s przebieżki — szybko, ale luźno, bez sprintu`,
            "między przebieżkami 1 min marszu albo truchtu",
          ]
          : [`${minutPracy} min spokojnie${w.klucz === "dlugie" ? ", równym tempem" : ""}`];
      const opis = powtorzen !== null
        ? `${w.typ} — ${powtorzen} × ${odcinek} min, przerwa ${przerwa} min truchtu, `
          + `+ ${w.dodatkoweMin} min rozgrzewki i schłodzenia`
        : w.przebiezki
          ? `${w.typ} — ${minutPracy} min + ${w.przebiezki} × ${SEKUND_PRZEBIEZKI} s`
          : `${w.typ} — ${minutPracy} min`;

      return {
        nr: w.nr,
        klucz: w.klucz,
        typ: w.typ,
        opis,
        kroki,
        etykieta: w.etykieta,
        minutPracy,
        minutDodatkowych: w.dodatkoweMin,
        minutPrzerw,
        minutRazem: minutPracy + w.dodatkoweMin + minutPrzerw,
        dystansKm,
        tempo: w.tempo,
        tempoTekst: tempo?.tekst ?? null,
        tempoSpokojneTekst: spokojne?.tekst ?? null,
        strefa: strefy[w.strefa - 1] ?? null,
        powtorzen,
        odcinekMin: odcinek,
      };
    });
    return { tydzien, jednostki };
  });
}

/** Łączny czas biegania w tygodniu, w minutach. Do zestawienia z obciążeniem siłowym. */
export function minutWTygodniu(t: TydzienBiegowy): number {
  return t.jednostki.reduce((suma, j) => suma + j.minutRazem, 0);
}

/** Łączny szacowany dystans tygodnia. `null`, gdy brakuje biegu testowego. */
export function kilometrowWTygodniu(t: TydzienBiegowy): number | null {
  if (t.jednostki.some((j) => j.dystansKm === null)) return null;
  return zaokraglij(t.jednostki.reduce((suma, j) => suma + (j.dystansKm ?? 0), 0), 1);
}
