/**
 * Filmy instruktażowe — osobno od BAZY ćwiczeń (09.10.2026).
 *
 * Trener: „baza ćwiczeń powinna być niezależna od źródła materiałów wideo;
 * w przyszłości chcę zastąpić filmy YouTube własnymi plikami MP4 bez
 * przebudowy bazy”. Dlatego:
 *
 * - ćwiczenie (EX-…) nie wie, skąd jest jego film — wpis w
 *   `docs/dane/filmy-cwiczen.json` wskazuje ćwiczenie po id;
 * - wpis ma typ: `youtube` (id filmu) albo `plik` (adres MP4/WebM);
 *   zamiana źródła to zmiana jednego wpisu, BAZA i plany zostają;
 * - aplikacja dostaje gotowy opis (`Wideo`), a odtwarzacz wybiera po typie.
 *
 * `film` w BAZIE to dotychczasowy link z arkusza — dalej działa jak link
 * dla ćwiczeń bez wpisu tutaj. Na razie wpis ma tylko EX-0011 (test
 * biblioteki OPEX Fitness); importu całego kanału jeszcze nie ma.
 */
import type { Cwiczenie } from "./typy.ts";
import { FILMY_CWICZEN, ZRODLA_WIDEO } from "./dane/filmy.ts";
import { katalog as katalogDomyslny, type Katalog } from "./katalog.ts";

export type ZrodloWideo = {
  id: string;
  /** Kto nagrał — do podpisu pod filmem („OPEX Fitness”). */
  nazwa: string;
  /** Gdzie leży („YouTube”, „własne”). */
  platforma: string;
  kanal?: string;
  kanalId?: string;
  url?: string;
};

export type WpisWideo = {
  id: string;
  cwiczenieId: string;
  typ: "youtube" | "plik";
  /** 11 znaków z adresu YouTube — przy `typ: "youtube"`. */
  youtubeId?: string;
  /** Adres pliku wideo — przy `typ: "plik"`. */
  plik?: string;
  zrodlo: string;
  tytul: string;
  /** Strona filmu u źródła (np. na YouTube) — do linku „otwórz u źródła”. */
  url?: string;
  czasSekund?: number;
};

/** Opis filmu dla aplikacji — tyle, ile potrzebuje odtwarzacz i podpis. */
export type Wideo = {
  typ: "youtube" | "plik";
  youtubeId?: string;
  plik?: string;
  tytul: string;
  czasSekund?: number;
  /** Link do oryginału — `null` dla własnych plików bez strony źródłowej. */
  link: string | null;
  zrodlo: { nazwa: string; platforma: string; url: string | null };
};

/** Karta ćwiczenia w aplikacji: opis i film. */
export type KartaCwiczenia = {
  cwiczenieId: string;
  nazwa: string;
  nazwaEn: string;
  nazwaPl: string | null;
  /** Wzorzec ruchu z BAZY („Upper push horizontal”). */
  kategoria: string;
  rodzaj: string | null;
  miesnieGlowne: readonly string[];
  miesniePomocnicze: readonly string[];
  sprzet: readonly string[];
  wideo: Wideo | null;
};

/** Identyfikator filmu YouTube: 11 znaków z [A-Za-z0-9_-]. */
export const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;

/** Film ćwiczenia albo `null`, gdy nie ma wpisu (wtedy zostaje link z BAZY). */
export function wideoCwiczenia(
  cwiczenieId: string,
  wpisy: readonly WpisWideo[] = FILMY_CWICZEN,
  zrodla: readonly ZrodloWideo[] = ZRODLA_WIDEO,
): Wideo | null {
  const w = wpisy.find((x) => x.cwiczenieId === cwiczenieId);
  if (!w) return null;
  const z = zrodla.find((x) => x.id === w.zrodlo);
  const zrodlo = { nazwa: z?.nazwa ?? w.zrodlo, platforma: z?.platforma ?? "", url: z?.url ?? null };
  if (w.typ === "youtube" && w.youtubeId && ID_YOUTUBE.test(w.youtubeId)) {
    return {
      typ: "youtube", youtubeId: w.youtubeId, tytul: w.tytul,
      ...(w.czasSekund ? { czasSekund: w.czasSekund } : {}),
      link: w.url ?? `https://www.youtube.com/watch?v=${w.youtubeId}`, zrodlo,
    };
  }
  if (w.typ === "plik" && w.plik) {
    return {
      typ: "plik", plik: w.plik, tytul: w.tytul,
      ...(w.czasSekund ? { czasSekund: w.czasSekund } : {}),
      link: w.url ?? null, zrodlo,
    };
  }
  return null;
}

/**
 * Karta ćwiczenia — gdy jest co pokazać ponad nazwę: film albo opis.
 * Dla reszty BAZY `null` (aplikacja zostaje przy dotychczasowym linku).
 */
export function kartaCwiczenia(
  c: Cwiczenie,
  wpisy: readonly WpisWideo[] = FILMY_CWICZEN,
  zrodla: readonly ZrodloWideo[] = ZRODLA_WIDEO,
): KartaCwiczenia | null {
  const wideo = wideoCwiczenia(c.id, wpisy, zrodla);
  const maOpis = !!(c.nazwaPl || c.miesnieGlowne?.length || c.sprzet?.length);
  if (!wideo && !maOpis) return null;
  return {
    cwiczenieId: c.id,
    nazwa: c.nazwa,
    nazwaEn: c.nazwaEn ?? c.nazwa,
    nazwaPl: c.nazwaPl ?? null,
    kategoria: c.kategoria,
    rodzaj: c.rodzaj ?? null,
    miesnieGlowne: c.miesnieGlowne ?? [],
    miesniePomocnicze: c.miesniePomocnicze ?? [],
    sprzet: c.sprzet ?? [],
    wideo,
  };
}

/**
 * Kontrola danych filmów — przyda się, gdy wpisów będą setki (import
 * kanału): każdy wpis wskazuje istniejące ćwiczenie i znane źródło,
 * ćwiczenie ma najwyżej jeden film, id są unikalne, YouTube ma poprawne id,
 * plik ma adres. Zwraca listę problemów; pusta = w porządku.
 */
export function sprawdzFilmy(
  wpisy: readonly WpisWideo[] = FILMY_CWICZEN,
  zrodla: readonly ZrodloWideo[] = ZRODLA_WIDEO,
  katalog: Katalog = katalogDomyslny,
): string[] {
  const problemy: string[] = [];
  const idWpisow = new Set<string>();
  const cwiczen = new Set<string>();
  const znaneZrodla = new Set(zrodla.map((z) => z.id));
  for (const w of wpisy) {
    if (idWpisow.has(w.id)) problemy.push(`${w.id}: powtórzony identyfikator wpisu`);
    idWpisow.add(w.id);
    if (!katalog.poId(w.cwiczenieId)) problemy.push(`${w.id}: nie ma ćwiczenia ${w.cwiczenieId} w BAZIE`);
    if (cwiczen.has(w.cwiczenieId)) problemy.push(`${w.id}: ćwiczenie ${w.cwiczenieId} ma już film`);
    cwiczen.add(w.cwiczenieId);
    if (!znaneZrodla.has(w.zrodlo)) problemy.push(`${w.id}: nieznane źródło „${w.zrodlo}”`);
    if (w.typ === "youtube" && !ID_YOUTUBE.test(w.youtubeId ?? "")) problemy.push(`${w.id}: złe id filmu YouTube`);
    if (w.typ === "plik" && !w.plik) problemy.push(`${w.id}: plik bez adresu`);
    if (w.typ !== "youtube" && w.typ !== "plik") problemy.push(`${w.id}: nieznany typ „${w.typ}”`);
  }
  return problemy;
}
