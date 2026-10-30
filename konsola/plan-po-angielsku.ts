/**
 * Plan po angielsku (27.10.2026).
 *
 * Trener: „dodaj mi opcję przed wysłaniem linku z planem do klienta, żeby
 * oznaczyć dany plan na anglojęzyczny — wtedy, jeżeli to zaznaczę, cały plan
 * z linku ma być przetłumaczony na język angielski”.
 *
 * Dwie warstwy:
 *
 * - **Teksty aplikacji** (przyciski, podpowiedzi, opisy RPE, komunikaty
 *   serwera) tłumaczy telefon — słownik w `public/klient/angielski.js`.
 *   Polska aplikacja zostaje bez zmian.
 * - **Teksty trenera**, których słownik nie zna: linie rozgrzewki i polskie
 *   nazwy ćwiczeń (własne, wpisane w konsoli). Te trener tłumaczy w okienku
 *   linku — sam albo z propozycją AI — a tłumaczenia leżą przy planie
 *   (`tlumaczenia`, schemat v14). Telefon dostaje je już podmienione.
 *
 * AI dostaje wyłącznie te teksty — bez nazwiska klienta i bez liczb do
 * policzenia. Odpowiedź to propozycja: zapisuje się dopiero po „Zapisz”.
 */
import type { Plan } from "../silnik/src/plan.ts";
import { katalog } from "../silnik/src/katalog.ts";
import { jako, zapytaj, type BlokSystemowy, type Uzycie } from "./ai/klient.ts";
import type { ZapisanyPlan } from "./magazyn.ts";

export type TekstTrenera = {
  pl: string;
  /** Tłumaczenie zapisane przy planie albo `null`. */
  en: string | null;
  /** Skąd tekst — do podpisu w okienku („Rozgrzewka · dzień 1”, „Ćwiczenie”). */
  gdzie: string;
};

const POLSKIE_LITERY = /[ąćęłńóśźż]/i;
/** Polskie słowa w nazwie bez polskich liter („Pallof press z pauza”, „wyciskanie na lawce”). */
const POLSKIE_SLOWA = /\b(z|na|do|w|ze|i|bez|przy|pod|nad|sek|powt|lawce|reka|noga)\b/i;

/** Nazwa, która może być po polsku — własne ćwiczenia zawsze (wpisał je trener), z bazy tylko z polskimi znakami. */
function nazwaDoTlumaczenia(c: { nazwa: string; wlasne?: true }): boolean {
  return POLSKIE_LITERY.test(c.nazwa) || (c.wlasne === true && POLSKIE_SLOWA.test(c.nazwa));
}

/**
 * Teksty trenera, które klient zobaczy w planie: linie rozgrzewki (z planu
 * trenera i z wersji, którą klient ma teraz) i nazwy ćwiczeń, które mogą być
 * po polsku. Każdy raz, w kolejności dni.
 */
export function tekstyTrenera(zapisany: ZapisanyPlan): TekstTrenera[] {
  const plany: Plan[] = [zapisany.plan, ...(zapisany.wersjaKlienta ? [zapisany.wersjaKlienta.plan] : [])];
  const tlumaczenia = zapisany.tlumaczenia ?? {};
  const teksty = new Map<string, string>();
  for (const plan of plany) {
    for (const r of [...(plan.rozgrzewki ?? [])].sort((a, b) => a.dzien - b.dzien)) {
      for (const linia of (r.tekst ?? "").split("\n").map((l) => l.trim()).filter(Boolean)) {
        if (!teksty.has(linia)) teksty.set(linia, `Rozgrzewka · dzień ${r.dzien}`);
      }
    }
  }
  for (const plan of plany) {
    for (const s of plan.sloty) {
      const c = s.cwiczenieId ? katalog.poId(s.cwiczenieId) : undefined;
      if (c && nazwaDoTlumaczenia(c) && !teksty.has(c.nazwa)) teksty.set(c.nazwa, "Ćwiczenie");
    }
  }
  return [...teksty].map(([pl, gdzie]) => ({ pl, en: tlumaczenia[pl] ?? null, gdzie }));
}

/** Najwięcej tekstów i najdłuższy tekst — rozgrzewka to kilka linii, nazw jest kilkanaście. */
const MAKS_TEKSTOW = 300;
const MAKS_DLUGOSC = 500;

/**
 * Tłumaczenia z okienka: tylko niepuste, przycięte i nie dłuższe niż limit.
 * Odmowa po polsku — trafia wprost do okienka.
 */
export function sprawdzTlumaczenia(dane: unknown): Record<string, string> | { blad: string } {
  if (dane == null) return {};
  if (typeof dane !== "object" || Array.isArray(dane)) return { blad: "Tłumaczenia: zła postać danych." };
  const wynik: Record<string, string> = {};
  for (const [pl, en] of Object.entries(dane as Record<string, unknown>)) {
    if (typeof en !== "string") return { blad: "Tłumaczenia: każde musi być tekstem." };
    const tekst = en.trim();
    if (!tekst) continue;
    if (pl.length > MAKS_DLUGOSC || tekst.length > MAKS_DLUGOSC) {
      return { blad: `Tłumaczenie dłuższe niż ${MAKS_DLUGOSC} znaków — skróć je.` };
    }
    wynik[pl.trim()] = tekst;
  }
  if (Object.keys(wynik).length > MAKS_TEKSTOW) return { blad: "Za dużo tłumaczeń naraz." };
  return wynik;
}

/** Pola widoku, w których stoją teksty trenera: nazwy ćwiczeń (także na karcie filmu) i linie rozgrzewki. */
const POLA_TEKSTOW = new Set(["nazwa", "nazwaEn", "linie"]);

/**
 * Widok dla telefonu po angielsku: nazwa ćwiczenia (w planie, w TOP SECIE,
 * w seriach maksymalnych, na karcie filmu) i linia rozgrzewki równe tekstowi
 * trenera z tłumaczeniem — podmienione. Porównanie całych napisów i tylko
 * w tych polach, więc tłumaczenie nie wejdzie w środek innego tekstu ani
 * w wartości, z których telefon liczy (np. „guma” w kolumnie ciężaru).
 */
export function podmienTeksty<T>(widok: T, tlumaczenia: Readonly<Record<string, string>>): T {
  const tekst = (w: unknown) => typeof w === "string" && Object.hasOwn(tlumaczenia, w) ? tlumaczenia[w] : w;
  const podmien = (w: unknown): unknown => {
    if (Array.isArray(w)) return w.map(podmien);
    if (w && typeof w === "object") {
      return Object.fromEntries(Object.entries(w).map(([k, v]) => [k,
        // Karta filmu po angielsku: tytułem nazwa angielska, bez polskiej nad nią.
        k === "nazwaPl" ? null
          : !POLA_TEKSTOW.has(k) ? podmien(v) : Array.isArray(v) ? v.map(tekst) : tekst(v)]));
    }
    return w;
  };
  return podmien(widok) as T;
}

const ZASADY = `Tłumaczysz na angielski teksty trenera personalnego, które klient zobaczy
w aplikacji treningowej: linie rozgrzewki i nazwy ćwiczeń.

Zasady:
- Krótko i naturalnie, językiem siłowni (np. „wykroki chodzone” → „walking lunges”,
  „wyciskanie hantli na ławce skośnej” → „incline dumbbell bench press”).
- Liczby, jednostki, serie i powtórzenia przepisuj dokładnie („2 x 10” zostaje „2 x 10”,
  „30 s” → „30 s”, „na stronę” → „per side”). Niczego nie dopisuj i nie licz.
- Skróty i nazwy własne zostają (RPE, 1RM, DB, KB, TRX, nazwy z angielskiego).
- Tekst już po angielsku — zwróć bez zmian.
- Jedno tłumaczenie na każdy tekst, w tej samej kolejności.`;

const SCHEMAT_TLUMACZEN = {
  type: "object",
  additionalProperties: false,
  required: ["tlumaczenia"],
  properties: {
    tlumaczenia: {
      type: "array",
      description: "Po jednym na każdy tekst z listy, w tej samej kolejności.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pl", "en"],
        properties: {
          pl: { type: "string", description: "Tekst z listy, przepisany dokładnie." },
          en: { type: "string", description: "Tłumaczenie na angielski." },
        },
      },
    },
  },
} as const;

/** Prompt systemowy — osobno, żeby test sprawdził, co wychodzi na zewnątrz. */
export function promptTlumaczenia(): BlokSystemowy[] {
  return [{ type: "text", text: ZASADY }];
}

/** Wiadomość do modelu: same teksty, ponumerowane. Bez nazwiska klienta i bez planu. */
export function wiadomoscTlumaczenia(teksty: readonly string[]): string {
  return "Przetłumacz na angielski:\n\n" + teksty.map((t, i) => `${i + 1}. ${t}`).join("\n");
}

/**
 * Propozycje tłumaczeń z AI — polski → angielski. Tylko dla tekstów z listy:
 * coś, czego trener nie pokazał, nie wraca. Zapisuje dopiero trener.
 */
export async function zaproponujTlumaczenia(
  teksty: readonly string[],
): Promise<{ propozycje: Record<string, string>; uzycie: Uzycie }> {
  if (teksty.length === 0) {
    return { propozycje: {}, uzycie: { wejscie: 0, wyjscie: 0, zCache: 0, doCache: 0, koszt: 0 } };
  }
  const odp = await zapytaj({
    system: promptTlumaczenia(),
    wiadomosc: wiadomoscTlumaczenia(teksty),
    schemat: SCHEMAT_TLUMACZEN,
    // Tłumaczenie krótkich linijek — nie ma tu czego projektować.
    wysilek: "low",
    maxTokens: 4000,
  });
  const lista = jako<{ tlumaczenia?: { pl?: string; en?: string }[] }>(odp).tlumaczenia ?? [];
  const propozycje: Record<string, string> = {};
  lista.forEach((t, i) => {
    // Model przepisuje tekst; gdy coś w nim zmienił, liczy się kolejność.
    const pl = t.pl && teksty.includes(t.pl) ? t.pl : teksty[i];
    const en = t.en?.trim();
    if (pl && en && en.length <= MAKS_DLUGOSC) propozycje[pl] = en;
  });
  return { propozycje, uzycie: odp.uzycie };
}
