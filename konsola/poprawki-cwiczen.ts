/**
 * Poprawki trenera do ćwiczeń z BAZY i bibliotek filmów (27.10.2026).
 *
 * Trener: „zrób tak, żebym miał dostęp do całej bazy ćwiczeń tak po prostu,
 * a nie tylko podczas wybierania ćwiczenia do planu, i żebym mógł edytować
 * każde ćwiczenie z bazy”.
 *
 * BAZA i biblioteki to pliki w repozytorium (`docs/dane/…` → katalog silnika).
 * Poprawka trenera nie zmienia plików: leży w bazie danych konsoli
 * (`cwiczenie_poprawka`) — tylko pola, które trener zmienił — i przy starcie
 * serwera oraz po każdej zmianie wchodzi do katalogu (`katalog.ustawPoprawki`).
 * Od tej chwili plan, telefon klienta, eksport i import arkusza widzą
 * ćwiczenie poprawione. Pola, których trener nie ruszył, idą dalej za plikami
 * (np. nowy link do filmu z kolejnej wersji BAZY). „Przywróć oryginał” usuwa
 * poprawkę.
 *
 * Własne ćwiczenia trenera (`WL-…`) poprawia się jak dotąd —
 * `cwiczenia-wlasne.ts`; tu tylko ćwiczenia z plików.
 */
import { baza } from "./baza/polaczenie.ts";
import { katalog, zastosujPoprawke, type PoprawkaCwiczenia } from "../silnik/src/katalog.ts";
import { zGuma, type Cwiczenie } from "../silnik/src/typy.ts";
import { sprawdzCwiczenie } from "./cwiczenia-wlasne.ts";
import type { ZapisanyPlan } from "./magazyn.ts";

/** Pola, które trener może poprawić — te same co w okienku własnego ćwiczenia. */
const POLA = ["nazwa", "kategoria", "part", "coeff", "skokKg", "progresja", "jednostronne", "film"] as const;
const NA_KILOGRAMY = ["kg", "dodatkowy ciężar"];
const DO_WERYFIKACJI = /^(DO WERYFIKACJI|UZUPEŁNIĆ)/;

/** Wszystkie poprawki: id → zmienione pola. */
export function wczytajPoprawki(): Record<string, PoprawkaCwiczenia> {
  const wiersze = baza().prepare("SELECT id, dane_json FROM cwiczenie_poprawka ORDER BY id").all() as
    { id: string; dane_json: string }[];
  return Object.fromEntries(wiersze.map((w) => [w.id, JSON.parse(w.dane_json) as PoprawkaCwiczenia]));
}

/** Katalog silnika dostaje aktualne poprawki — przy starcie serwera i po każdej zmianie. */
export function zarejestrujPoprawki(): void {
  katalog.ustawPoprawki(wczytajPoprawki());
}

/**
 * Poprawka ćwiczenia z BAZY albo biblioteki. `null` — nie ma takiego
 * ćwiczenia w plikach (własne poprawia się osobno). Odmowa po polsku, bo
 * trafia wprost do okienka w konsoli. Zapisują się tylko pola różne od
 * oryginału; bez różnic — poprawka znika (to samo co „Przywróć oryginał”).
 */
export function poprawCwiczenie(trenerId: number, id: string, dane: unknown): Cwiczenie | { blad: string } | null {
  const oryginal = katalog.oryginal(id);
  if (!oryginal) return null;
  const d = dane && typeof dane === "object" ? dane as Record<string, unknown> : {};
  const sprawdzone = sprawdzCwiczenie({ ...d, jednorazowe: false }, id);
  if ("blad" in sprawdzone) return sprawdzone;
  // Skok liczy się tylko przy kilogramach — przy innej progresji zostaje taki, jak w oryginale
  // (np. asysta ze skokiem 5), żeby zapis bez zmian nie robił poprawki.
  if (!NA_KILOGRAMY.includes(sprawdzone.progresja)) sprawdzone.skokKg = oryginal.skokKg;
  const poprawka: Record<string, unknown> = {};
  for (const pole of POLA) {
    const nowe = sprawdzone[pole] ?? null;
    const stare = oryginal[pole] ?? null;
    if (nowe === stare || (pole === "jednostronne" && !nowe && !stare)) continue;
    poprawka[pole] = nowe ?? (pole === "jednostronne" ? false : pole === "film" ? "" : null);
  }
  // Guma (27.10.2026): przy ćwiczeniu z plików decyduje też sprzęt, więc
  // porównanie idzie po wyniku — poprawka dostaje „guma” tylko wtedy, gdy bez
  // niej ćwiczenie wyszłoby inaczej, niż trener wybrał.
  if (typeof d.guma === "boolean") {
    const chce = d.guma && !NA_KILOGRAMY.includes(sprawdzone.progresja);
    if (zGuma(zastosujPoprawke(oryginal, poprawka as PoprawkaCwiczenia)) !== chce) poprawka.guma = chce;
  }
  if (d.zweryfikowane === true && DO_WERYFIKACJI.test(oryginal.uwagi ?? "")) poprawka.zweryfikowane = true;
  if (Object.keys(poprawka).length === 0) {
    baza().prepare("DELETE FROM cwiczenie_poprawka WHERE id = ?").run(id);
  } else {
    baza().prepare(`
      INSERT INTO cwiczenie_poprawka (id, trener_id, dane_json, zmienione) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET trener_id = excluded.trener_id, dane_json = excluded.dane_json, zmienione = excluded.zmienione
    `).run(id, trenerId, JSON.stringify(poprawka), new Date().toISOString());
  }
  zarejestrujPoprawki();
  return katalog.poId(id)!;
}

/** „Przywróć oryginał” — poprawka znika, ćwiczenie znów takie, jak w plikach. `null` — nie ma takiego. */
export function przywrocCwiczenie(id: string): Cwiczenie | null {
  if (!katalog.oryginal(id)) return null;
  baza().prepare("DELETE FROM cwiczenie_poprawka WHERE id = ?").run(id);
  zarejestrujPoprawki();
  return katalog.poId(id)!;
}

/**
 * W ilu planach stoi ćwiczenie — okienko mówi przed zapisem, ile planów
 * zmieni poprawka (także wysłanych klientom).
 */
export function uzycieCwiczenia(plany: readonly ZapisanyPlan[], id: string): { planow: number; wyslanych: number; klientow: number } {
  const z = plany.filter((p) => p.plan.sloty.some((s) => s.cwiczenieId === id));
  return {
    planow: z.length,
    wyslanych: z.filter((p) => p.status === "wysłany").length,
    klientow: new Set(z.map((p) => p.klientId)).size,
  };
}
