/**
 * Porównanie planu z arkusza z tym, co liczy silnik.
 *
 * Używane w dwóch miejscach i po dwa różne powody:
 *   • w testach — żeby pilnować, że silnik nie odjechał od arkusza,
 *   • w narzędziu `sprawdz` — żeby wykryć arkusz z uszkodzoną formułą.
 *
 * Rozbieżność znaczy jedno z dwojga: albo silnik ma błąd, albo plik ma
 * skasowaną formułę. Drugie zdarza się częściej — tak wyszły braki w
 * `START!B7` i `T1!G8` w szablonie 5.17.
 */
import type { PlanWyliczony } from "./plan.ts";
import { oblicz1RM } from "./rpe.ts";
import { SKROTY_TYGODNI, TYGODNIE_IMPORTU, type ZrzutArkusza } from "./import-arkusza.ts";

/** Ciężar w kg — porównanie co do grosza. */
export const TOL_CIEZAR = 0.005;
/** Stres — arkusz pokazuje jedno miejsce po przecinku. */
export const TOL_STRES = 0.05;

export type Roznica = {
  gdzie: string;
  pole: string;
  arkusz: string;
  silnik: string;
  /** Arkusz nie ma wartości — najczęściej skasowana formuła albo plik nieprzeliczony. */
  arkuszPusty: boolean;
};

export type WynikPorownania = {
  zgodnych: number;
  pominietych: number;
  roznice: Roznica[];
};

function tekst(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(puste)";
  return typeof v === "number" ? String(v).replace(".", ",") : String(v);
}

/**
 * Porównuje wszystko, co arkusz policzył, z tym, co policzył silnik.
 * Pola, których arkusz w ogóle nie ma, trafiają do `pominietych` — nigdy
 * nie są liczone jako zgodne.
 */
export function porownajZArkuszem(z: ZrzutArkusza, wynik: PlanWyliczony): WynikPorownania {
  let zgodnych = 0;
  let pominietych = 0;
  const roznice: Roznica[] = [];

  const sprawdz = (
    gdzie: string, pole: string, oczekiwany: unknown, faktyczny: unknown, tolerancja = 0,
  ) => {
    if (oczekiwany === null || oczekiwany === undefined || oczekiwany === "") {
      pominietych++;
      return;
    }
    const zgodne =
      typeof oczekiwany === "number" && typeof faktyczny === "number"
        ? Math.abs(oczekiwany - faktyczny) <= tolerancja
        : oczekiwany === faktyczny;
    if (zgodne) zgodnych++;
    else {
      roznice.push({
        gdzie, pole,
        arkusz: tekst(oczekiwany),
        silnik: tekst(faktyczny),
        arkuszPusty: false,
      });
    }
  };

  for (const s of z.serie_maksymalne) {
    if (!s.ex_id) continue;
    sprawdz(
      `seria maksymalna ${s.position_id}`, "1RM",
      s.oczekiwany_1rm, oblicz1RM(s.ciezar, s.powtorzenia), TOL_CIEZAR,
    );
  }

  for (const slotZ of z.sloty) {
    if (!slotZ.ex_id) continue;

    TYGODNIE_IMPORTU.forEach((tydzien, i) => {
      const pole = slotZ.tygodnie[SKROTY_TYGODNI[i]!]!;
      const obliczony = wynik.tygodnie[i]!.sloty.find((x) => x.positionId === slotZ.position_id);
      if (!obliczony) return;
      const gdzie = `T${tydzien} ${slotZ.position_id} ${slotZ.nazwa}`;

      sprawdz(gdzie, "powtórzenia", pole.ocz_powtorzenia, obliczony.powtorzenia);
      sprawdz(gdzie, "%1RM", pole.ocz_procent, obliczony.procent1RM);
      sprawdz(gdzie, "mnożnik", pole.ocz_mnoznik, obliczony.mnoznik, 0.001);
      sprawdz(gdzie, "stres całkowity", pole.ocz_stres_t, obliczony.stres.calkowity, TOL_STRES);
      sprawdz(gdzie, "stres centralny", pole.ocz_stres_c, obliczony.stres.centralny, TOL_STRES);
      sprawdz(gdzie, "stres obwodowy", pole.ocz_stres_p, obliczony.stres.obwodowy, TOL_STRES);

      // Ciężar: gdy arkusz nie rozwiązał 1RM mimo istniejącej serii maksymalnej,
      // to nie jest wiarygodne źródło — zgłaszamy jako podejrzenie uszkodzonej formuły.
      if (slotZ["1rm_nierozwiazany"]) {
        roznice.push({
          gdzie, pole: "ciężar",
          arkusz: "(brak 1RM mimo serii maksymalnej)",
          silnik: tekst(obliczony.ciezar),
          arkuszPusty: true,
        });
        return;
      }
      if (pole.ocz_ciezar === null || pole.ocz_ciezar === "") {
        if (obliczony.cwiczenie) {
          roznice.push({
            gdzie, pole: "ciężar",
            arkusz: "(puste)", silnik: tekst(obliczony.ciezar), arkuszPusty: true,
          });
        } else pominietych++;
        return;
      }
      sprawdz(gdzie, "ciężar", pole.ocz_ciezar, obliczony.ciezar, TOL_CIEZAR);
    });
  }

  TYGODNIE_IMPORTU.forEach((tydzien, i) => {
    const ocz = z.podsumowania[SKROTY_TYGODNI[i]!];
    if (!ocz) return;
    const bilans = wynik.tygodnie[i]!.bilans;
    for (const part of ["s", "d", "b", "r", "c"] as const) {
      const w = ocz.wzorce[part];
      const nasz = bilans.wzorce.find((x) => x.part === part)!;
      if (!w) continue;
      const gdzie = `T${tydzien} wzorzec ${nasz.nazwa}`;
      sprawdz(gdzie, "stres całkowity", w.ocz_calkowity, nasz.calkowity, TOL_STRES);
      sprawdz(gdzie, "stres centralny", w.ocz_centralny, nasz.centralny, TOL_STRES);
      sprawdz(gdzie, "stres obwodowy", w.ocz_obwodowy, nasz.obwodowy, TOL_STRES);
      sprawdz(gdzie, "serie", w.ocz_serie, nasz.serie);
      sprawdz(gdzie, "powtórzenia", w.ocz_powtorzenia, nasz.powtorzenia);
    }
    sprawdz(`T${tydzien}`, "stres RAZEM", ocz.ocz_razem, bilans.razem, TOL_STRES);
  });

  return { zgodnych, pominietych, roznice };
}
