/**
 * Własne ćwiczenia trenera — dodane w konsoli, nie w plikach BAZY.
 *
 * Trener, 17.10.2026: „dodaj możliwość wpisywania własnej nazwy ćwiczenia
 * podczas tworzenia planu — razem z coeff, part, kategorią itp.”
 *
 * Dotąd nowe ćwiczenie oznaczało zmianę w `docs/dane/baza-cwiczen.json`,
 * regenerację danych i wdrożenie. Teraz trener dopisuje je sam w okienku
 * przy wyborze ćwiczenia. Leży w bazie danych (`cwiczenie_wlasne`), a przy
 * starcie serwera i po każdej zmianie wchodzi do katalogu silnika
 * (`katalog.ustawWlasne`) — od tej chwili plan, telefon, eksport i import
 * arkusza traktują je jak każde inne ćwiczenie.
 *
 * Numery `WL-0001…` — osobne od BAZY i bibliotek (`EX-…`), więc kolejny
 * import bibliotek ani dopisek do BAZY nigdy się z nimi nie zderzy.
 *
 * Ćwiczenie tylko do tego planu (27.10.2026, trener: „wpisuję ćwiczenie do
 * planu, który tworzę, ale nie dodaje się ono do bazy ćwiczeń”) to to samo
 * własne ćwiczenie z `jednorazowe` i `planId`. W katalogu jest jak każde inne
 * — plan, telefon, eksport i import arkusza działają bez zmian — tylko konsola
 * nie podsuwa go na liście wyboru w innych planach. Odznaczenie „tylko w tym
 * planie” przenosi je do bazy trenera.
 */
import { baza } from "./baza/polaczenie.ts";
import { katalog } from "../silnik/src/katalog.ts";
import { KATEGORIE as WSZYSTKIE_KATEGORIE, zGuma, type Coeff, type Cwiczenie, type Kategoria, type Part, type Progresja }
  from "../silnik/src/typy.ts";

/** Kategorie siłowe z BAZY i mobilność stawów (27.10.2026). */
export const KATEGORIE: readonly Kategoria[] = WSZYSTKIE_KATEGORIE;
export const PARTY: readonly Part[] = ["s", "d", "b", "r", "c"];
export const COEFFY: readonly Coeff[] = [1, 0.75, 0.5, 0.25];
export const PROGRESJE: readonly Progresja[] = [
  "kg", "dodatkowy ciężar", "masa ciała", "asysta", "czas", "dystans", "ręczne ustawienie",
];
const NA_KILOGRAMY: readonly Progresja[] = ["kg", "dodatkowy ciężar"];

type Wiersz = { id: string; trener_id: number; dane_json: string };

/** Własne ćwiczenia — wszystkich trenerów albo jednego. */
export function wczytajWlasne(trenerId?: number): Cwiczenie[] {
  const wiersze = (trenerId === undefined
    ? baza().prepare("SELECT id, trener_id, dane_json FROM cwiczenie_wlasne ORDER BY id").all()
    : baza().prepare("SELECT id, trener_id, dane_json FROM cwiczenie_wlasne WHERE trener_id = ? ORDER BY id")
      .all(trenerId)) as Wiersz[];
  return wiersze.map((w) => ({ ...JSON.parse(w.dane_json), id: w.id, wlasne: true }));
}

/** Katalog silnika dostaje aktualną listę — przy starcie serwera i po każdej zmianie. */
export function zarejestrujWlasne(): void {
  katalog.ustawWlasne(wczytajWlasne());
}

/**
 * Ćwiczenie z formularza albo powód odmowy. Odmowa po polsku, bo trafia
 * wprost do okienka w konsoli.
 */
export function sprawdzCwiczenie(
  dane: unknown, id?: string,
): Omit<Cwiczenie, "id"> | { blad: string } {
  if (!dane || typeof dane !== "object") return { blad: "Brak danych ćwiczenia." };
  const d = dane as Record<string, unknown>;
  const nazwa = typeof d.nazwa === "string" ? d.nazwa.trim().replace(/\s+/g, " ") : "";
  if (nazwa.length < 2 || nazwa.length > 80) return { blad: "Nazwa: od 2 do 80 znaków." };
  // Import arkusza szuka ćwiczeń po nazwie — dwie takie same nazwy to dwa
  // różne ćwiczenia, których nie da się rozróżnić.
  const zajeta = katalog.poNazwie(nazwa);
  if (zajeta && zajeta.id !== id) {
    return { blad: zajeta.jednorazowe
      ? `„${zajeta.nazwa}” jest już ćwiczeniem tylko do innego planu, z innymi ustawieniami — zmień nazwę (np. dopisz „2”).`
      : `Ćwiczenie „${zajeta.nazwa}” już jest w bazie — wybierz je z listy albo zmień nazwę.` };
  }
  if (!KATEGORIE.includes(d.kategoria as Kategoria)) return { blad: "Wybierz kategorię." };
  // Także w kategoriach (27.10.2026, mobilność stawów): bez głównej, bez powtórek, w kolejności listy.
  const dodatkowe = d.kategorieDodatkowe ?? [];
  if (!Array.isArray(dodatkowe) || !dodatkowe.every((k) => KATEGORIE.includes(k as Kategoria))) {
    return { blad: "Nieznana kategoria dodatkowa." };
  }
  const kategorieDodatkowe = KATEGORIE.filter((k) => k !== d.kategoria && dodatkowe.includes(k));
  if (!PARTY.includes(d.part as Part)) return { blad: "Wybierz wzorzec ruchu (part)." };
  const coeff = Number(d.coeff);
  if (!COEFFY.includes(coeff as Coeff)) return { blad: "Coeff: 1, 0,75, 0,5 albo 0,25." };
  if (!PROGRESJE.includes(d.progresja as Progresja)) return { blad: "Wybierz progresję." };
  const progresja = d.progresja as Progresja;
  const naKg = NA_KILOGRAMY.includes(progresja);
  const skokKg = d.skokKg == null || d.skokKg === "" ? (naKg ? 2.5 : 0) : Number(d.skokKg);
  if (!Number.isFinite(skokKg) || skokKg < 0 || skokKg > 20) return { blad: "Skok: od 0 do 20 kg." };
  if (naKg && skokKg <= 0) return { blad: "Przy progresji na kilogramy skok musi być większy od zera." };
  const film = typeof d.film === "string" ? d.film.trim() : "";
  if (film && (!/^https?:\/\/\S+$/i.test(film) || film.length > 300)) {
    return { blad: "Film: pełny link, np. https://youtu.be/…" };
  }
  const jednorazowe = d.jednorazowe === true;
  const planId = typeof d.planId === "string" ? d.planId.trim() : "";
  if (jednorazowe && (!planId || planId.length > 200)) return { blad: "Ćwiczenie tylko do planu — brakuje planu." };
  // Guma (27.10.2026) zapisuje się tylko wtedy, gdy mówi co innego niż nazwa
  // („band”) — przy kilogramach guma nie zmienia ciężaru, więc jej nie ma.
  // Bez pola (stare wywołania) — jak dotąd, z nazwy.
  const guma = typeof d.guma === "boolean" && !naKg && d.guma !== zGuma({ nazwa, progresja }) ? d.guma : undefined;
  return {
    nazwa,
    kategoria: d.kategoria as Kategoria,
    ...(kategorieDodatkowe.length ? { kategorieDodatkowe } : {}),
    part: d.part as Part,
    coeff: coeff as Coeff,
    skokKg: naKg ? skokKg : 0,
    progresja,
    ...(d.jednostronne === true ? { jednostronne: true } : {}),
    ...(guma !== undefined ? { guma } : {}),
    ...(film ? { film } : {}),
    ...(jednorazowe ? { jednorazowe: true as const, planId } : {}),
  };
}

/** Pola, które decydują o ćwiczeniu — do porównania dwóch ćwiczeń tylko do planu. */
const POLA = ["nazwa", "kategoria", "kategorieDodatkowe", "part", "coeff", "skokKg", "progresja", "jednostronne", "guma", "film"] as const;

/**
 * Ćwiczenie tylko do planu o tej samej nazwie i tych samych ustawieniach już
 * jest (np. to samo w planie następnej osoby) — wtedy to samo ćwiczenie, nie
 * odmowa „nazwa zajęta”. Inne ustawienia — odmowa, żeby nazwa dalej znaczyła
 * jedno ćwiczenie (import arkusza szuka po nazwie).
 */
function takieSamoJednorazowe(trenerId: number, dane: unknown): Cwiczenie | null {
  const d = dane as Record<string, unknown> | null;
  if (d?.jednorazowe !== true || typeof d.nazwa !== "string") return null;
  const jest = katalog.poNazwie(d.nazwa.trim().replace(/\s+/g, " "));
  if (!jest?.jednorazowe || !wczytajWlasne(trenerId).some((c) => c.id === jest.id)) return null;
  const nowe = sprawdzCwiczenie(dane, jest.id);
  if ("blad" in nowe) return null;
  return POLA.every((p) => JSON.stringify(nowe[p] ?? null) === JSON.stringify(jest[p] ?? null)) ? jest : null;
}

function nastepneId(): string {
  const { n } = baza().prepare(
    "SELECT MAX(CAST(SUBSTR(id, 4) AS INTEGER)) AS n FROM cwiczenie_wlasne",
  ).get() as { n: number | null };
  return `WL-${String((n ?? 0) + 1).padStart(4, "0")}`;
}

export function dodajWlasne(trenerId: number, dane: unknown): Cwiczenie | { blad: string } {
  const takieSamo = takieSamoJednorazowe(trenerId, dane);
  if (takieSamo) return takieSamo;
  const sprawdzone = sprawdzCwiczenie(dane);
  if ("blad" in sprawdzone) return sprawdzone;
  const id = nastepneId();
  const teraz = new Date().toISOString();
  baza().prepare(`
    INSERT INTO cwiczenie_wlasne (id, trener_id, dane_json, utworzone, zmienione) VALUES (?, ?, ?, ?, ?)
  `).run(id, trenerId, JSON.stringify(sprawdzone), teraz, teraz);
  zarejestrujWlasne();
  return katalog.poId(id)!;
}

/** Poprawka własnego ćwiczenia. `null` — nie ma takiego (albo jest innego trenera). */
export function zmienWlasne(trenerId: number, id: string, dane: unknown): Cwiczenie | { blad: string } | null {
  const jest = baza().prepare("SELECT id, dane_json FROM cwiczenie_wlasne WHERE id = ? AND trener_id = ?")
    .get(id, trenerId) as { id: string; dane_json: string } | undefined;
  if (!jest) return null;
  // Poprawka ćwiczenia tylko do planu bez podanego planu — zostaje przy swoim.
  const d = dane && typeof dane === "object" ? dane as Record<string, unknown> : {};
  const poprzednie = JSON.parse(jest.dane_json) as Cwiczenie;
  // Bez pola „także w kategoriach” (np. zapis z innego miejsca niż okienko) — zostają, jakie były.
  const zKategoriami = "kategorieDodatkowe" in d ? d : { ...d, kategorieDodatkowe: poprzednie.kategorieDodatkowe };
  const sprawdzone = sprawdzCwiczenie(d.jednorazowe === true && !d.planId
    ? { ...zKategoriami, planId: poprzednie.planId } : zKategoriami, id);
  if ("blad" in sprawdzone) return sprawdzone;
  baza().prepare("UPDATE cwiczenie_wlasne SET dane_json = ?, zmienione = ? WHERE id = ? AND trener_id = ?")
    .run(JSON.stringify(sprawdzone), new Date().toISOString(), id, trenerId);
  zarejestrujWlasne();
  return katalog.poId(id)!;
}
