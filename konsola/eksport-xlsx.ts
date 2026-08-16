/**
 * Eksport planu do arkusza w formacie 5.18.
 *
 * Klient dostaje dokładnie taki plik, jaki dostawał zawsze — z żywymi formułami,
 * walidacjami i zakładkami ODDECH/BIEG. Zmienia się tylko to, że plan powstał
 * w konsoli, a nie przez ręczne wypełnianie szablonu.
 *
 * Wypełniamy wyłącznie komórki wejściowe trenera. Formuły zostają nietknięte —
 * arkusz przelicza się sam po otwarciu.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { katalog } from "../silnik/src/katalog.ts";
import { TYGODNIE } from "../silnik/src/plan.ts";
import { jestBojemGlownym } from "../silnik/src/import-arkusza.ts";
import type { ZapisanyPlan } from "./magazyn.ts";

const KATALOG = dirname(fileURLToPath(import.meta.url));
const SZABLON = join(KATALOG, "..", "arkusz", "MasterTemplate-5-18.xlsx");
const WYJSCIE = join(KATALOG, "dane", "eksport");

/** `D3-S07` → `{ dzien: 3, pozycja: 7 }` */
function rozbijPositionId(positionId: string): { dzien: number; pozycja: number } {
  const m = positionId.match(/^D(\d+)-S(\d+)$/);
  if (!m) throw new Error(`Nieznany position_id: ${positionId}`);
  return { dzien: Number(m[1]), pozycja: Number(m[2]) };
}

function bezpiecznaNazwa(tekst: string): string {
  return tekst.replace(/[^\p{L}\p{N} ._-]/gu, "").trim() || "plan";
}

export async function eksportujDoArkusza(zapisany: ZapisanyPlan): Promise<string> {
  const { plan } = zapisany;

  const sloty = plan.sloty.map((slot) => {
    const { dzien, pozycja } = rozbijPositionId(slot.positionId);
    const cwiczenie = slot.cwiczenieId ? katalog.poId(slot.cwiczenieId) : null;
    const bojGlowny = jestBojemGlownym(slot.lp);

    const tygodnie: Record<string, unknown> = {};
    for (const t of TYGODNIE) {
      const p = slot.tygodnie?.[t];
      if (!p) continue;
      tygodnie[`T${t}`] = {
        serie: p.serie ?? null,
        rpe: p.rpe ?? null,
        // Bój główny zawsze ma powtórzenia wpisane wprost; akcesorium tylko
        // wtedy, gdy trener świadomie nadpisał automat.
        powtorzenia_reczne: bojGlowny || p.powtorzenia !== undefined
          ? (p.powtorzenia ?? null)
          : null,
      };
    }

    return {
      position_id: slot.positionId,
      dzien,
      pozycja,
      lp: slot.lp,
      nazwa: cwiczenie?.nazwa ?? null,
      kategoria_szkieletu: slot.kategoriaSzkieletu ?? null,
      tygodnie,
    };
  });

  // Seria maksymalna trafia do wiersza START odpowiadającego slotowi ćwiczenia.
  const pierwszySlotDla = new Map<string, string>();
  for (const slot of plan.sloty) {
    if (slot.cwiczenieId && !pierwszySlotDla.has(slot.cwiczenieId)) {
      pierwszySlotDla.set(slot.cwiczenieId, slot.positionId);
    }
  }
  const serieMaksymalne = plan.serieMaksymalne
    .map((s) => {
      const positionId = pierwszySlotDla.get(s.cwiczenieId);
      if (!positionId) return null;
      const { dzien, pozycja } = rozbijPositionId(positionId);
      return { dzien, pozycja, ciezar: s.ciezar, powtorzenia: s.powtorzenia };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const wypelnienie = {
    ustawienia: {
      tryb_akcesoriow: plan.trybAkcesoriow,
      czesc_planu: plan.czescPlanu,
    },
    data_startu: zapisany.dataStartu,
    sloty,
    serie_maksymalne: serieMaksymalne,
    top_sety: (plan.topSety ?? []).map((t) => ({
      dzien: t.dzien,
      wlaczony: t.wlaczony,
      rpe: t.rpe,
    })),
  };

  mkdirSync(WYJSCIE, { recursive: true });
  const nazwa = `${bezpiecznaNazwa(zapisany.klient)} ${zapisany.wersja}.0.xlsx`;
  const cel = join(WYJSCIE, nazwa);

  const tymczasowy = mkdtempSync(join(tmpdir(), "eksport-"));
  const plikDanych = join(tymczasowy, "wypelnienie.json");
  try {
    writeFileSync(plikDanych, JSON.stringify(wypelnienie), "utf-8");
    execFileSync(
      "python3",
      [join(KATALOG, "narzedzia", "wypelnij-arkusz.py"), SZABLON, plikDanych, cel],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  } finally {
    rmSync(tymczasowy, { recursive: true, force: true });
  }

  return cel;
}
