import type { Cwiczenie, Kategoria } from "./typy.ts";
import { BAZA_CWICZEN } from "./dane/cwiczenia.ts";

/** Katalog ćwiczeń — odpowiednik zakładki BAZA, ale z wyszukiwaniem po ID. */
export class Katalog {
  #stale: readonly Cwiczenie[];
  #wszystkie: readonly Cwiczenie[];
  #poId = new Map<string, Cwiczenie>();
  #poNazwie = new Map<string, Cwiczenie>();

  /**
   * BAZA trenera — arkusz 5.17 i jego dopiski, bez ćwiczeń z bibliotek filmów
   * (import 09.10.2026) i bez własnych z konsoli. Na niej stoją kontrole
   * zgodne z arkuszem i generator.
   */
  readonly bazaTrenera: readonly Cwiczenie[];

  constructor(cwiczenia: readonly Cwiczenie[] = BAZA_CWICZEN) {
    this.#stale = cwiczenia;
    this.#wszystkie = cwiczenia;
    this.bazaTrenera = cwiczenia.filter((c) => !c.biblioteka && !c.wlasne);
    this.#indeksuj();
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
    this.#wszystkie = [...this.#stale, ...wlasne.map((c) => ({ ...c, wlasne: true as const }))];
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
