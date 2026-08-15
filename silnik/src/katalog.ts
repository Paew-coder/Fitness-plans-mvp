import type { Cwiczenie, Kategoria } from "./typy.ts";
import { BAZA_CWICZEN } from "./dane/cwiczenia.ts";

/** Katalog ćwiczeń — odpowiednik zakładki BAZA, ale z wyszukiwaniem po ID. */
export class Katalog {
  readonly wszystkie: readonly Cwiczenie[];
  #poId = new Map<string, Cwiczenie>();
  #poNazwie = new Map<string, Cwiczenie>();

  constructor(cwiczenia: readonly Cwiczenie[] = BAZA_CWICZEN) {
    this.wszystkie = cwiczenia;
    for (const c of cwiczenia) {
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
}

/** Katalog zbudowany z BAZY 5.17. */
export const katalog = new Katalog();
