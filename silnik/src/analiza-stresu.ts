/**
 * Więcej z liczenia stresu (23.11.2026). Trener: „czy możemy jakieś sensowne
 * dane jeszcze wyciągnąć z naszego systemu liczenia stresu? może jakieś
 * poszczególne o ćwiczeniach?”, potem „zrób punkty 1, 2 i 3”:
 *
 * 1. które ćwiczenia „robią” stres cyklu (`stresCwiczen`),
 * 2. stres zaplanowany a zrobiony — liczy konsola z wpisów klienta
 *    (`konsola/profil-klienta.ts`, tym samym `stresSlotu`),
 * 3. skoki obciążenia tydzień do tygodnia (`skokiStresu`).
 *
 * Nic tu nie zmienia planu — to tylko odczyt liczb, które silnik już ma.
 */
import type { Part } from "./typy.ts";
import type { PlanWyliczony } from "./plan.ts";
import { zaokraglij } from "./pomocnicze.ts";

export type StresCwiczenia = {
  id: string;
  nazwa: string;
  part: Part;
  calkowity: number;
  centralny: number;
  obwodowy: number;
  /** Udział w stresie całkowitym cyklu (0–1). */
  udzial: number;
};

/**
 * Stres ćwiczeń z tygodni roboczych planu, od największego. To samo ćwiczenie
 * w kilku dniach liczy się razem; podmiana w środku cyklu — pod tym, co stoi
 * w danym tygodniu.
 */
export function stresCwiczen(wynik: Pick<PlanWyliczony, "tygodnie">): StresCwiczenia[] {
  const suma = new Map<string, StresCwiczenia>();
  let razem = 0;
  for (const t of wynik.tygodnie) {
    for (const s of t.sloty) {
      if (!s.cwiczenie) continue;
      const c = suma.get(s.cwiczenie.id) ?? {
        id: s.cwiczenie.id, nazwa: s.cwiczenie.nazwa, part: s.cwiczenie.part,
        calkowity: 0, centralny: 0, obwodowy: 0, udzial: 0,
      };
      c.calkowity += s.stres.calkowity;
      c.centralny += s.stres.centralny;
      c.obwodowy += s.stres.obwodowy;
      razem += s.stres.calkowity;
      suma.set(s.cwiczenie.id, c);
    }
  }
  return [...suma.values()]
    .filter((c) => c.calkowity > 0)
    .map((c) => ({
      ...c,
      calkowity: zaokraglij(c.calkowity, 2),
      centralny: zaokraglij(c.centralny, 2),
      obwodowy: zaokraglij(c.obwodowy, 2),
      udzial: razem > 0 ? zaokraglij(c.calkowity / razem, 4) : 0,
    }))
    .sort((a, b) => b.calkowity - a.calkowity);
}

/** Wzrost względem poprzedniego tygodnia, od którego tydzień jest „skokiem”. */
export const PROG_SKOKU = 0.2;
/** Stres tygodnia do średniej z (do) 3 poprzednich — powyżej to „skok”. */
export const PROG_DO_SREDNIEJ = 1.3;
/** Ile poprzednich tygodni wchodzi do średniej. */
export const OKNO_SREDNIEJ = 3;

export type SkokTygodnia = {
  stres: number;
  /** Zmiana względem poprzedniego tygodnia (ułamek, 0,25 = +25 %); `null` w pierwszym. */
  zmiana: number | null;
  /** Stres do średniej z poprzednich (do 3) tygodni; `null` w pierwszym. */
  doSredniej: number | null;
  /** Wzrost ponad `PROG_SKOKU` albo ponad `PROG_DO_SREDNIEJ` średniej. */
  skok: boolean;
};

/**
 * Skoki obciążenia: każdy tydzień względem poprzedniego i względem średniej
 * z trzech poprzednich (jak stosunek obciążenia ostrego do przewlekłego —
 * w literaturze dyskutowany, więc to sygnał do spojrzenia, nie norma).
 */
export function skokiStresu(stresy: readonly number[]): SkokTygodnia[] {
  return stresy.map((stres, i) => {
    if (i === 0) return { stres, zmiana: null, doSredniej: null, skok: false };
    const poprzedni = stresy[i - 1]!;
    const okno = stresy.slice(Math.max(0, i - OKNO_SREDNIEJ), i);
    const srednia = okno.reduce((a, b) => a + b, 0) / okno.length;
    const zmiana = poprzedni > 0 ? zaokraglij(stres / poprzedni - 1, 4) : null;
    const doSredniej = srednia > 0 ? zaokraglij(stres / srednia, 4) : null;
    return {
      stres, zmiana, doSredniej,
      skok: (zmiana !== null && zmiana > PROG_SKOKU) || (doSredniej !== null && doSredniej > PROG_DO_SREDNIEJ),
    };
  });
}
