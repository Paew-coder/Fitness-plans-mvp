import type { Cwiczenie, Kategoria } from "./typy.ts";
import { BAZA_CWICZEN } from "./dane/cwiczenia.ts";

/**
 * Poprawka trenera do ćwiczenia z BAZY albo biblioteki (27.10.2026): tylko
 * pola, które zmienił. `jednostronne: false` i `film: ""` zdejmują wartość
 * z oryginału, `zweryfikowane` — dopisek „DO WERYFIKACJI” / „UZUPEŁNIĆ” z uwag.
 */
export type PoprawkaCwiczenia = Partial<Pick<Cwiczenie,
  "nazwa" | "kategoria" | "part" | "coeff" | "skokKg" | "progresja" | "jednostronne" | "film" | "guma">> & { zweryfikowane?: true };

const DOPISEK_WERYFIKACJI = /^(DO WERYFIKACJI|UZUPEŁNIĆ)\s*[–—-]?\s*/u;

export function zastosujPoprawke(c: Cwiczenie, p: PoprawkaCwiczenia): Cwiczenie {
  const { zweryfikowane, ...pola } = p;
  const n: Cwiczenie = { ...c, ...pola, poprawione: true };
  if (pola.jednostronne === false) delete n.jednostronne;
  if (pola.film === "") delete n.film;
  if (zweryfikowane && n.uwagi) {
    const uwagi = n.uwagi.replace(DOPISEK_WERYFIKACJI, "").trim();
    if (uwagi) n.uwagi = uwagi;
    else delete n.uwagi;
  }
  return n;
}

/** Katalog ćwiczeń — odpowiednik zakładki BAZA, ale z wyszukiwaniem po ID. */
export class Katalog {
  #stale: readonly Cwiczenie[];
  #staleId: ReadonlyMap<string, Cwiczenie>;
  #poprawki = new Map<string, PoprawkaCwiczenia>();
  #wlasne: readonly Cwiczenie[] = [];
  #wszystkie: readonly Cwiczenie[];
  #bazaTrenera: readonly Cwiczenie[];
  #poId = new Map<string, Cwiczenie>();
  #poNazwie = new Map<string, Cwiczenie>();

  constructor(cwiczenia: readonly Cwiczenie[] = BAZA_CWICZEN) {
    this.#stale = cwiczenia;
    this.#staleId = new Map(cwiczenia.map((c) => [c.id, c]));
    this.#wszystkie = cwiczenia;
    this.#bazaTrenera = cwiczenia.filter((c) => !c.biblioteka && !c.wlasne);
    this.#indeksuj();
  }

  /**
   * BAZA trenera — arkusz 5.17 i jego dopiski, bez ćwiczeń z bibliotek filmów
   * (import 09.10.2026) i bez własnych z konsoli. Na niej stoją kontrole
   * zgodne z arkuszem i generator. Z poprawkami trenera (27.10.2026).
   */
  get bazaTrenera(): readonly Cwiczenie[] {
    return this.#bazaTrenera;
  }

  get wszystkie(): readonly Cwiczenie[] {
    return this.#wszystkie;
  }

  /**
   * Ćwiczenia dodane przez trenera w konsoli (17.10.2026) — z bazy danych,
   * nie z plików. Każde wywołanie zastępuje poprzednią listę własnych; reszta
   * katalogu bez zmian. Dzięki temu plan, eksport, import arkusza i telefon
   * widzą je tak samo jak każde inne ćwiczenie.
   */
  ustawWlasne(wlasne: readonly Cwiczenie[]): void {
    this.#wlasne = wlasne.map((c) => ({ ...c, wlasne: true as const }));
    this.#przebuduj();
  }

  /**
   * Poprawki trenera do ćwiczeń z BAZY i bibliotek (27.10.2026, ekran „Baza
   * ćwiczeń”): id → zmienione pola. Każde wywołanie zastępuje poprzednie.
   * Plan, telefon, eksport i import widzą ćwiczenie już poprawione.
   */
  ustawPoprawki(poprawki: Readonly<Record<string, PoprawkaCwiczenia>>): void {
    this.#poprawki = new Map(Object.entries(poprawki).filter(([id]) => this.#staleId.has(id)));
    this.#przebuduj();
  }

  /** Ćwiczenie z BAZY albo biblioteki takie, jak w plikach — bez poprawki trenera. */
  oryginal(id: string): Cwiczenie | undefined {
    return this.#staleId.get(id);
  }

  #przebuduj(): void {
    const stale = this.#poprawki.size
      ? this.#stale.map((c) => (this.#poprawki.has(c.id) ? zastosujPoprawke(c, this.#poprawki.get(c.id)!) : c))
      : this.#stale;
    this.#wszystkie = [...stale, ...this.#wlasne];
    this.#bazaTrenera = stale.filter((c) => !c.biblioteka && !c.wlasne);
    this.#indeksuj();
  }

  #indeksuj(): void {
    this.#poId.clear();
    this.#poNazwie.clear();
    for (const c of this.#wszystkie) {
      this.#poId.set(c.id, c);
      this.#poNazwie.set(c.nazwa.toLocaleLowerCase("pl"), c);
    }
  }

  poId(id: string): Cwiczenie | undefined {
    return this.#poId.get(id);
  }

  /** Wyszukiwanie po nazwie — wyłącznie do importu z arkusza. Plan referuje po ID. */
  poNazwie(nazwa: string): Cwiczenie | undefined {
    return this.#poNazwie.get(nazwa.trim().toLocaleLowerCase("pl"));
  }

  /** Lista do wyboru w slocie. Pusta kategoria = pełna baza (jak w arkuszu). */
  wKategorii(kategoria: Kategoria | null | undefined): readonly Cwiczenie[] {
    if (!kategoria) return this.wszystkie;
    return this.wszystkie.filter((c) => c.kategoria === kategoria);
  }

  /**
   * Pozycje oznaczone "DO WERYFIKACJI" — dokładnie to, co liczy kontrola
   * `Analiza!B71` (`LEFT(uwagi;14)="DO WERYFIKACJI"`). W 5.17 jest ich 14.
   */
  doWeryfikacji(): readonly Cwiczenie[] {
    return this.wszystkie.filter((c) => c.uwagi?.startsWith("DO WERYFIKACJI"));
  }

  /**
   * Wszystkie pozycje czekające na decyzję trenera: "DO WERYFIKACJI" (14)
   * plus "UZUPEŁNIĆ" (2) — tych drugich kontrola w arkuszu nie łapie,
   * bo sprawdza tylko pierwszy z dwóch prefiksów.
   */
  wymagajaceDecyzji(): readonly Cwiczenie[] {
    return this.wszystkie.filter(
      (c) => c.uwagi?.startsWith("DO WERYFIKACJI") || c.uwagi?.startsWith("UZUPEŁNIĆ"),
    );
  }

  bezFilmu(): readonly Cwiczenie[] {
    return this.wszystkie.filter((c) => !c.film);
  }

  /** Ćwiczenia jednostronne rozpoznane po jawnym markerze w nazwie. */
  jednostronne(): readonly Cwiczenie[] {
    return this.wszystkie.filter((c) => c.jednostronne);
  }

  /** Wzorce z natury jednostronne, ale bez markera — do potwierdzenia przez trenera. */
  kandydaciJednostronne(): readonly Cwiczenie[] {
    return this.wszystkie.filter((c) => c.jednostronneDoPotwierdzenia);
  }
}

/** Katalog zbudowany z BAZY 5.17. */
export const katalog = new Katalog();
