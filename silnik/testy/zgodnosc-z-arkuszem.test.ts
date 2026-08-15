/**
 * Złoty test: silnik musi policzyć dokładnie to samo co arkusz.
 *
 * Zestawy w `testy/zlote/` powstają z prawdziwych plików narzędziem
 * `narzedzia/zrzut-arkusza.py`. Każdy zawiera jednocześnie wejście (co wpisał
 * trener) i wynik (co arkusz policzył).
 *
 * Kryterium: ciężar co do grosza, stres do 0,1. Zero tolerancji.
 *
 * Pola, których arkusz nie miał policzonych (plik nieprzeliczony przed eksportem),
 * są pomijane i raportowane — nie zaliczane po cichu.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { przeliczPlan, type Plan, type ParametryTygodnia, type SlotPlanu } from "../src/plan.ts";
import { oblicz1RM } from "../src/rpe.ts";
import type { CzescPlanu, Feedback, Kategoria, TrybAkcesoriow, Tydzien } from "../src/typy.ts";

const KATALOG_ZLOTYCH = join(dirname(fileURLToPath(import.meta.url)), "zlote");
const TYGODNIE: Tydzien[] = [1, 2, 3, 4, 5, 6];
const SKROTY = ["T1", "T2", "T3", "T4", "T5", "T6"] as const;

/** Ciężar w kg — porównanie co do grosza. */
const TOL_CIEZAR = 0.005;
/** Stres — arkusz pokazuje jedno miejsce po przecinku. */
const TOL_STRES = 0.05;

type PoleTygodnia = {
  serie: number | null;
  rpe: number | null;
  feedback: string | null;
  cwiczenie: string | null;
  one_rm_reczny: number | null;
  ocz_powtorzenia: number | null;
  ocz_ciezar: number | string | null;
  ocz_procent: number | null;
  ocz_one_rm: number | null;
  ocz_mnoznik: number | null;
  ocz_stres_t: number | null;
  ocz_stres_c: number | null;
  ocz_stres_p: number | null;
};

type SlotZlota = {
  position_id: string;
  dzien: number;
  lp: string;
  nazwa: string;
  ex_id: string | null;
  kategoria_szkieletu: string | null;
  "1rm_nierozwiazany": boolean;
  tygodnie: Record<string, PoleTygodnia>;
};

type Zloty = {
  zrodlo: string;
  ustawienia: { tryb_akcesoriow: string; czesc_planu: string; dni_treningowe: number | null };
  serie_maksymalne: { position_id: string; ex_id: string | null; ciezar: number; powtorzenia: number; oczekiwany_1rm: number | null }[];
  sloty: SlotZlota[];
  top_sety: { dzien: number; wlaczony: boolean; rpe: number | null; slot_position_id: string | null }[];
  podsumowania: Record<string, {
    wzorce: Record<string, { ocz_calkowity: number | null; ocz_centralny: number | null; ocz_obwodowy: number | null; ocz_serie: number | null; ocz_powtorzenia: number | null }>;
    ocz_razem: number | null;
    ocz_serie_razem: number | null;
    ocz_powtorzenia_razem: number | null;
  }>;
};

function jestBojemGlownym(lp: string): boolean {
  return lp.trim().toUpperCase().startsWith("A");
}

function zbudujPlan(z: Zloty): Plan {
  const sloty: SlotPlanu[] = z.sloty
    .filter((s) => s.ex_id)
    .map((s) => {
      const tygodnie: Partial<Record<Tydzien, ParametryTygodnia>> = {};
      TYGODNIE.forEach((t, i) => {
        const pole = s.tygodnie[SKROTY[i]!]!;
        tygodnie[t] = {
          serie: pole.serie ?? undefined,
          rpe: pole.rpe ?? undefined,
          feedback: (pole.feedback as Feedback | null) ?? undefined,
          oneRMReczny: pole.one_rm_reczny ?? undefined,
          // Bój główny ma powtórzenia wpisane przez trenera; akcesoria liczy automat
          // i to właśnie automat jest tutaj sprawdzany.
          powtorzenia: jestBojemGlownym(s.lp) ? (pole.ocz_powtorzenia ?? undefined) : undefined,
        };
      });
      return {
        positionId: s.position_id,
        dzien: s.dzien,
        lp: s.lp,
        cwiczenieId: s.ex_id!,
        kategoriaSzkieletu: (s.kategoria_szkieletu as Kategoria | null) ?? null,
        tygodnie,
      };
    });

  return {
    nazwa: z.zrodlo,
    trybAkcesoriow: (z.ustawienia.tryb_akcesoriow as TrybAkcesoriow) ?? "trzymaj z bloku",
    czescPlanu: (z.ustawienia.czesc_planu as CzescPlanu) ?? "objętość",
    serieMaksymalne: z.serie_maksymalne
      .filter((s) => s.ex_id)
      .map((s) => ({ cwiczenieId: s.ex_id!, ciezar: s.ciezar, powtorzenia: s.powtorzenia })),
    sloty,
    topSety: z.top_sety
      .filter((t) => t.wlaczony && t.slot_position_id)
      .map((t) => ({
        dzien: t.dzien,
        wlaczony: true,
        rpe: t.rpe ?? 7,
        slotPositionId: t.slot_position_id!,
      })),
  };
}

const pliki = readdirSync(KATALOG_ZLOTYCH).filter((f) => f.endsWith(".json"));

assert.ok(pliki.length > 0, "brak zestawów w testy/zlote/ — uruchom narzedzia/zrzut-arkusza.py");

for (const plik of pliki) {
  const z: Zloty = JSON.parse(readFileSync(join(KATALOG_ZLOTYCH, plik), "utf-8"));

  test(`zgodność z arkuszem — ${plik}`, (t) => {
    const plan = zbudujPlan(z);
    const wynik = przeliczPlan(plan);

    let porownane = 0;
    let pominiete = 0;

    // --- serie maksymalne -> 1RM ---
    for (const s of z.serie_maksymalne) {
      if (s.oczekiwany_1rm === null) { pominiete++; continue; }
      assert.equal(
        oblicz1RM(s.ciezar, s.powtorzenia),
        s.oczekiwany_1rm,
        `1RM dla ${s.position_id} (${s.ciezar} kg × ${s.powtorzenia})`,
      );
      porownane++;
    }

    // --- slot po slocie, tydzień po tygodniu ---
    for (const slotZ of z.sloty) {
      if (!slotZ.ex_id) continue;

      TYGODNIE.forEach((tydzien, i) => {
        const pole = slotZ.tygodnie[SKROTY[i]!]!;
        const obliczony = wynik.tygodnie[i]!.sloty.find((s) => s.positionId === slotZ.position_id);
        assert.ok(obliczony, `brak slotu ${slotZ.position_id} w T${tydzien}`);
        const gdzie = `${slotZ.position_id} ${slotZ.nazwa} T${tydzien}`;

        if (pole.ocz_powtorzenia !== null) {
          assert.equal(obliczony.powtorzenia, pole.ocz_powtorzenia, `powtórzenia — ${gdzie}`);
          porownane++;
        } else pominiete++;

        if (pole.ocz_procent !== null) {
          assert.equal(obliczony.procent1RM, pole.ocz_procent, `%1RM — ${gdzie}`);
          porownane++;
        } else pominiete++;

        if (pole.ocz_mnoznik !== null) {
          assert.equal(obliczony.mnoznik, pole.ocz_mnoznik, `mnożnik adaptacji — ${gdzie}`);
          porownane++;
        } else pominiete++;

        for (const [klucz, oczekiwany] of [
          ["calkowity", pole.ocz_stres_t],
          ["centralny", pole.ocz_stres_c],
          ["obwodowy", pole.ocz_stres_p],
        ] as const) {
          if (oczekiwany === null) { pominiete++; continue; }
          const faktyczny = obliczony.stres[klucz];
          assert.ok(
            Math.abs(faktyczny - oczekiwany) < TOL_STRES,
            `stres ${klucz} — ${gdzie}: silnik ${faktyczny}, arkusz ${oczekiwany}`,
          );
          porownane++;
        }

        // Ciężar pomijamy, gdy arkusz sam nie rozwiązał 1RM dla tego slotu —
        // wtedy nie jest wyrocznią. W 5.17 dotyczy to slotu D1-S02 (brak formuły
        // w START!B7); w 5.18 już nie występuje.
        if (slotZ["1rm_nierozwiazany"] || pole.ocz_ciezar === null) { pominiete++; return; }

        if (typeof pole.ocz_ciezar === "number") {
          assert.equal(typeof obliczony.ciezar, "number", `ciężar powinien być liczbą — ${gdzie}`);
          assert.ok(
            Math.abs((obliczony.ciezar as number) - pole.ocz_ciezar) < TOL_CIEZAR,
            `ciężar — ${gdzie}: silnik ${obliczony.ciezar}, arkusz ${pole.ocz_ciezar}`,
          );
        } else {
          assert.equal(obliczony.ciezar, pole.ocz_ciezar, `komunikat ciężaru — ${gdzie}`);
        }
        porownane++;
      });
    }

    // --- bilans tygodnia ---
    TYGODNIE.forEach((tydzien, i) => {
      const ocz = z.podsumowania[SKROTY[i]!];
      if (!ocz) return;
      const bilans = wynik.tygodnie[i]!.bilans;

      for (const part of ["s", "d", "b", "r", "c"] as const) {
        const w = ocz.wzorce[part];
        const nasz = bilans.wzorce.find((x) => x.part === part)!;
        if (!w) continue;
        for (const [pole, oczekiwany, faktyczny] of [
          ["stres całkowity", w.ocz_calkowity, nasz.calkowity],
          ["stres centralny", w.ocz_centralny, nasz.centralny],
          ["stres obwodowy", w.ocz_obwodowy, nasz.obwodowy],
        ] as const) {
          if (oczekiwany === null) { pominiete++; continue; }
          assert.ok(
            Math.abs(faktyczny - oczekiwany) < TOL_STRES,
            `${pole} wzorca ${part} T${tydzien}: silnik ${faktyczny}, arkusz ${oczekiwany}`,
          );
          porownane++;
        }
        if (w.ocz_serie !== null) {
          assert.equal(nasz.serie, w.ocz_serie, `serie wzorca ${part} T${tydzien}`);
          porownane++;
        } else pominiete++;
        if (w.ocz_powtorzenia !== null) {
          assert.equal(nasz.powtorzenia, w.ocz_powtorzenia, `powtórzenia wzorca ${part} T${tydzien}`);
          porownane++;
        } else pominiete++;
      }

      if (ocz.ocz_razem !== null) {
        assert.ok(
          Math.abs(bilans.razem - ocz.ocz_razem) < TOL_STRES,
          `stres RAZEM T${tydzien}: silnik ${bilans.razem}, arkusz ${ocz.ocz_razem}`,
        );
        porownane++;
      } else pominiete++;
    });

    // --- liczba dni treningowych (baza wszystkich norm) ---
    if (z.ustawienia.dni_treningowe !== null) {
      assert.equal(wynik.dniTreningowe, z.ustawienia.dni_treningowe, "dni treningowe");
      porownane++;
    }

    t.diagnostic(`porównanych wartości: ${porownane}, pominiętych (brak w arkuszu): ${pominiete}`);
    assert.ok(porownane > 0, "nie porównano ani jednej wartości");
  });
}
