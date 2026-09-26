/**
 * Szablony planów z aplikacji trenera w Base44 — do wykorzystania w konsoli.
 *
 * Czternaście szkieletów — Klasyczny, Rozbudowany i Hipertroficzny po 1–4 dni
 * oraz dwie kontynuacje „(cz. 2)" — wyciągniętych 21.09.2026 i dodanych do
 * konsoli 25.09.2026, pod nazwami z ekranu Base44 od 26.09.2026. Szablon
 * rozpisuje **układ**: dni, numerację (A1, B1/B2…), kategorię każdej pozycji
 * i miejsce TOP SETU. **Ćwiczeń nie wybiera** — do 26.09 cztery szablony
 * niosły dobór z zapisanych planów w Base44, którego trener nie rozpoznał,
 * a trzy pozycje zostawały w środku dnia puste (nazwy spoza BAZY).
 *
 * Czego szablon **nie** przenosi: liczb z Base44 tydzień po tygodniu. Serie,
 * powtórzenia i RPE liczy dalej silnik z „części planu" — tej samej, którą
 * trener ustala dla każdego planu. Szablon ustawia ją tylko na start:
 * klasyczne i rozbudowane → objętość, kontynuacje „(część 2)" → intensywność,
 * hipertroficzne → hipertrofia. Liczby z Base44 zgadzają się z tym prawie
 * wszędzie („Klasyczny 2 dni" to dokładnie nasza objętość), a tam, gdzie się
 * różnią, rozstrzygnął już trener: obowiązują jego arkusze.
 *
 */
import type { CzescPlanu, Kategoria } from "./typy.ts";
import type { Plan, SlotPlanu, TopSet } from "./plan.ts";

export type SlotSzablonu = {
  lp: string;
  kategoria: Kategoria;
  /** Przy tej pozycji w Base44 stał TOP SET (w progresji od T2). */
  topSet?: boolean;
};

export type SzablonPlanu = {
  id: string;
  /** Tak jak na ekranie Base44: „Klasyczny – 3 dni", „Klasyczny – 2 dni (cz. 2)". */
  nazwa: string;
  /** Grupa na liście w konsoli: Klasyczny, Rozbudowany, Hipertroficzny, Kontynuacje (cz. 2). */
  rodzina: string;
  opis: string;
  czesc: CzescPlanu;
  /** Dzień po dniu, pozycje w kolejności. */
  dni: readonly (readonly SlotSzablonu[])[];
};

/**
 * Plan rozpisany według szablonu. Funkcja czysta — nic nie zapisuje.
 *
 * Dni z szablonu dostają jego pozycje po kolei; pozycje za ostatnią zostają
 * bez numeru, jak zapas w pustym planie. Dni, których szablon nie ma, zostają
 * w swoim układzie, tylko puste. Parametry tygodni i tryb ciężaru przy slotach
 * znikają — należały do poprzedniego doboru. Serie maksymalne, tryb akcesoriów
 * i tygodnie po cyklu zostają, bo dotyczą klienta, a nie układu.
 */
export function zastosujSzablon(plan: Plan, szablon: SzablonPlanu): Plan {
  const sloty: SlotPlanu[] = [];
  const topSety: TopSet[] = [];
  const dni = [...new Set(plan.sloty.map((s) => s.dzien))].sort((a, b) => a - b);

  for (const dzien of dni) {
    const wzor = szablon.dni[dzien - 1];
    const wDniu = plan.sloty.filter((s) => s.dzien === dzien);
    let top: string | null = null;
    wDniu.forEach((slot, i) => {
      const z = wzor?.[i];
      sloty.push({
        positionId: slot.positionId,
        dzien: slot.dzien,
        lp: wzor ? (z?.lp ?? "") : slot.lp,
        cwiczenieId: null,
        kategoriaSzkieletu: z?.kategoria ?? null,
        tygodnie: {},
      });
      if (z?.topSet && !top) top = slot.positionId;
    });
    topSety.push({
      dzien,
      wlaczony: top !== null,
      slotPositionId: top ?? wDniu[0]?.positionId ?? `D${dzien}-S01`,
    });
  }

  const { cwiczeniaMaksow: _poprzednie, ...reszta } = plan;
  return { ...reszta, czescPlanu: szablon.czesc, sloty, topSety };
}
