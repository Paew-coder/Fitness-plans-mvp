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
 * dla ćwiczeń bez wpisu tutaj.
 *
 * Kilka filmów na ćwiczenie (09.10.2026, import bibliotek Theory of Motion
 * i Catalyst Athletics). Trener: „ćwiczenie może zawierać dwa nagrania —
 * jedno standardowe, a drugie poradnikowe”. Wpis ma więc rolę:
 * `demonstracja` (krótki pokaz ruchu) albo `poradnik` (omówienie techniki).
 * Karta pokazuje najpierw pokazy, potem poradniki, w kolejności wpisów.
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

export type RolaWideo = "demonstracja" | "poradnik";
export const ROLE_WIDEO: readonly RolaWideo[] = ["demonstracja", "poradnik"];

export type WpisWideo = {
  id: string;
  cwiczenieId: string;
  typ: "youtube" | "plik";
  /** Brak = `demonstracja` (tak było przed importem bibliotek). */
  rola?: RolaWideo;
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
  rola: RolaWideo;
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
  /** Pierwszy film (pokaz, jeśli jest) — `null`, gdy filmu nie ma. */
  wideo: Wideo | null;
  /** Wszystkie filmy: najpierw pokazy, potem poradniki. */
  filmy: readonly Wideo[];
};

/** Identyfikator filmu YouTube: 11 znaków z [A-Za-z0-9_-]. */
export const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Wpisy pogrupowane po ćwiczeniu — liczone raz na tablicę wpisów. Przy
 * tysiącach filmów szukanie `find` po całej liście dla każdego ćwiczenia
 * (lista ćwiczeń w konsoli) kosztowałoby miliony porównań na zapytanie.
 */
const indeksy = new WeakMap<readonly WpisWideo[], Map<string, WpisWideo[]>>();
function wpisyCwiczenia(cwiczenieId: string, wpisy: readonly WpisWideo[]): readonly WpisWideo[] {
  let indeks = indeksy.get(wpisy);
  if (!indeks) {
    indeks = new Map();
    for (const w of wpisy) {
      const lista = indeks.get(w.cwiczenieId);
      if (lista) lista.push(w);
      else indeks.set(w.cwiczenieId, [w]);
    }
    indeksy.set(wpisy, indeks);
  }
  return indeks.get(cwiczenieId) ?? [];
}

function opisFilmu(w: WpisWideo, zrodla: readonly ZrodloWideo[]): Wideo | null {
  const z = zrodla.find((x) => x.id === w.zrodlo);
  const zrodlo = { nazwa: z?.nazwa ?? w.zrodlo, platforma: z?.platforma ?? "", url: z?.url ?? null };
  const rola: RolaWideo = w.rola ?? "demonstracja";
  if (w.typ === "youtube" && w.youtubeId && ID_YOUTUBE.test(w.youtubeId)) {
    return {
      typ: "youtube", rola, youtubeId: w.youtubeId, tytul: w.tytul,
      ...(w.czasSekund ? { czasSekund: w.czasSekund } : {}),
      link: w.url ?? `https://www.youtube.com/watch?v=${w.youtubeId}`, zrodlo,
    };
  }
  if (w.typ === "plik" && w.plik) {
    return {
      typ: "plik", rola, plik: w.plik, tytul: w.tytul,
      ...(w.czasSekund ? { czasSekund: w.czasSekund } : {}),
      link: w.url ?? null, zrodlo,
    };
  }
  return null;
}

/** Wszystkie filmy ćwiczenia: najpierw pokazy, potem poradniki (w każdej grupie kolejność wpisów). */
export function filmyCwiczenia(
  cwiczenieId: string,
  wpisy: readonly WpisWideo[] = FILMY_CWICZEN,
  zrodla: readonly ZrodloWideo[] = ZRODLA_WIDEO,
): Wideo[] {
  const filmy = wpisyCwiczenia(cwiczenieId, wpisy)
    .map((w) => opisFilmu(w, zrodla))
    .filter((f): f is Wideo => f !== null);
  return [...filmy.filter((f) => f.rola === "demonstracja"), ...filmy.filter((f) => f.rola !== "demonstracja")];
}

/** Pierwszy film ćwiczenia albo `null`, gdy nie ma wpisu (wtedy zostaje link z BAZY). */
export function wideoCwiczenia(
  cwiczenieId: string,
  wpisy: readonly WpisWideo[] = FILMY_CWICZEN,
  zrodla: readonly ZrodloWideo[] = ZRODLA_WIDEO,
): Wideo | null {
  return filmyCwiczenia(cwiczenieId, wpisy, zrodla)[0] ?? null;
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
  const filmy = filmyCwiczenia(c.id, wpisy, zrodla);
  const wideo = filmy[0] ?? null;
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
    filmy,
  };
}

/**
 * Kontrola danych filmów (tysiące wpisów po imporcie bibliotek): każdy
 * wpis wskazuje istniejące ćwiczenie i znane źródło, rola jest znana, id
 * wpisów są unikalne, ten sam film nie wisi dwa razy przy jednym ćwiczeniu,
 * YouTube ma poprawne id, plik ma adres. Zwraca listę problemów; pusta = w porządku.
 */
export function sprawdzFilmy(
  wpisy: readonly WpisWideo[] = FILMY_CWICZEN,
  zrodla: readonly ZrodloWideo[] = ZRODLA_WIDEO,
  katalog: Katalog = katalogDomyslny,
): string[] {
  const problemy: string[] = [];
  const idWpisow = new Set<string>();
  const pary = new Set<string>();
  const znaneZrodla = new Set(zrodla.map((z) => z.id));
  for (const w of wpisy) {
    if (idWpisow.has(w.id)) problemy.push(`${w.id}: powtórzony identyfikator wpisu`);
    idWpisow.add(w.id);
    if (!katalog.poId(w.cwiczenieId)) problemy.push(`${w.id}: nie ma ćwiczenia ${w.cwiczenieId} w BAZIE`);
    const para = `${w.cwiczenieId} ${w.youtubeId ?? w.plik ?? ""}`;
    if (pary.has(para)) problemy.push(`${w.id}: ten sam film już jest przy ${w.cwiczenieId}`);
    pary.add(para);
    if (w.rola !== undefined && !ROLE_WIDEO.includes(w.rola)) problemy.push(`${w.id}: nieznana rola „${w.rola}”`);
    if (!znaneZrodla.has(w.zrodlo)) problemy.push(`${w.id}: nieznane źródło „${w.zrodlo}”`);
    if (w.typ === "youtube" && !ID_YOUTUBE.test(w.youtubeId ?? "")) problemy.push(`${w.id}: złe id filmu YouTube`);
    if (w.typ === "plik" && !w.plik) problemy.push(`${w.id}: plik bez adresu`);
    if (w.typ !== "youtube" && w.typ !== "plik") problemy.push(`${w.id}: nieznany typ „${w.typ}”`);
  }
  return problemy;
}
