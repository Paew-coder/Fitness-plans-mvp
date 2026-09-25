/**
 * Szablony planów z aplikacji trenera w Base44 — do wykorzystania w konsoli.
 *
 * Czternaście szkieletów (klasyczne FBW 1–4 dni, rozbudowane, hipertroficzne
 * i kontynuacje bloków), wyciągniętych 21.09.2026 i dodanych do konsoli
 * 25.09.2026. Szablon rozpisuje **układ**: dni, numerację (A1, B1/B2…),
 * kategorię każdej pozycji i miejsce TOP SETU; przy czterech szablonach,
 * dla których trener miał w Base44 zapisany plan, także dobór ćwiczeń.
 *
 * Czego szablon **nie** przenosi: liczb z Base44 tydzień po tygodniu. Serie,
 * powtórzenia i RPE liczy dalej silnik z „części planu" — tej samej, którą
 * trener ustala dla każdego planu. Szablon ustawia ją tylko na start:
 * klasyczne i rozbudowane → objętość, kontynuacje „(część 2)" → intensywność,
 * hipertroficzne → hipertrofia. Liczby z Base44 zgadzają się z tym prawie
 * wszędzie („Klasyczny 2 dni" to dokładnie nasza objętość), a tam, gdzie się
 * różnią, rozstrzygnął już trener: obowiązują jego arkusze.
 *
 * Trzy nazwy z Base44 nie mają odpowiednika w BAZIE (Close-Grip Bench Press,
 * Machine Shoulder Press, Plank). Takie pozycje zostają puste, z kategorią —
 * trener wybiera ćwiczenie z listy, nic nie zgadujemy za niego.
 */
import type { CzescPlanu, Kategoria } from "./typy.ts";
import type { Plan, SlotPlanu, TopSet } from "./plan.ts";

export type SlotSzablonu = {
  lp: string;
  kategoria: Kategoria;
  /** Przy tej pozycji w Base44 stał TOP SET (w progresji od T2). */
  topSet?: boolean;
  /** Ćwiczenie z zapisanego planu trenera, zmapowane na BAZĘ. */
  cwiczenieId?: string;
  /** Nazwa z Base44, której w BAZIE nie ma — pozycja zostaje pusta. */
  bezOdpowiednika?: string;
};

export type SzablonPlanu = {
  id: string;
  nazwa: string;
  opis: string;
  czesc: CzescPlanu;
  /** Czy szablon niesie dobór ćwiczeń z zapisanego planu trenera. */
  zCwiczeniami: boolean;
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
        cwiczenieId: z?.cwiczenieId ?? null,
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
