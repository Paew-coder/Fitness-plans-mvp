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
import { przeliczPlan, TYGODNIE } from "../silnik/src/plan.ts";
import { jestBojemGlownym } from "../silnik/src/import-arkusza.ts";
import type { ZapisanyPlan } from "./magazyn.ts";
import { bladSrodowiskaPythona, pierwszaLiniaBledu } from "./blad-pythona.ts";

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

/**
 * Co dokładnie wpisujemy do arkusza.
 *
 * Wydzielone z `eksportujDoArkusza`, żeby dało się to sprawdzić testem bez
 * Pythona i bez LibreOffice — a jest co sprawdzać: to tutaj rozstrzyga się,
 * czy klient dostanie te same liczby, które trener widział na ekranie.
 */
export function daneDoArkusza(zapisany: ZapisanyPlan) {
  const { plan } = zapisany;

  /**
   * Do arkusza wpisujemy wartości **policzone**, a nie surowe pola planu.
   *
   * Powód wyszedł przy pełnym kółku konsola → arkusz → konsola: slot, w którym
   * trener nie ruszył serii ani RPE, wychodził z konsoli jako „nie ustawione".
   * Wypełniacz pomijał puste pola, więc w arkuszu zostawały wartości szablonu
   * (6 serii, RPE 6,5 dla boju głównego w T1), a silnik liczył swoje domyślne
   * (1 seria, RPE 8). Klient dostawał inne liczby niż te, które trener widział
   * na ekranie — a cała umowa tej aplikacji brzmi „klient nie zauważa zmiany".
   */
  const wynik = przeliczPlan(plan);
  const policzony = (positionId: string, tydzien: number) =>
    wynik.tygodnie[tydzien - 1]?.sloty.find((s) => s.positionId === positionId);

  const sloty = plan.sloty.map((slot) => {
    const { dzien, pozycja } = rozbijPositionId(slot.positionId);
    const cwiczenie = slot.cwiczenieId ? katalog.poId(slot.cwiczenieId) : null;
    const bojGlowny = jestBojemGlownym(slot.lp);

    const tygodnie: Record<string, unknown> = {};
    for (const t of TYGODNIE) {
      if (!cwiczenie) continue;
      const p = slot.tygodnie?.[t] ?? {};
      const obliczony = policzony(slot.positionId, t);
      tygodnie[`T${t}`] = {
        serie: obliczony?.serie ?? p.serie ?? null,
        rpe: obliczony?.rpe ?? p.rpe ?? null,
        // Bój główny zawsze ma powtórzenia wpisane wprost; akcesorium tylko
        // wtedy, gdy trener świadomie nadpisał automat — inaczej nadpisalibyśmy
        // formułę, która w arkuszu liczy je sama.
        powtorzenia_reczne: bojGlowny
          ? (obliczony?.powtorzenia ?? p.powtorzenia ?? null)
          : (p.powtorzenia ?? null),
        // Odczucia klienta jadą razem z planem. Bez nich arkusz startowałby
        // od mnożnika 1 i od T2 pokazywał inne ciężary niż konsola.
        feedback: p.feedback ?? null,
        // Ciężar wpisany ręcznie zastępuje w arkuszu formułę — dokładnie tak,
        // jak robił to trener, wpisując liczbę do komórki. Bez tego klient
        // zobaczyłby w arkuszu ciężar policzony, a w konsoli stoi inny.
        ciezar_reczny: p.ciezarOverride ?? null,
        // Podmiana ćwiczenia w środku cyklu — w arkuszu wyraża się po prostu
        // inną nazwą w kolumnie ĆWICZENIE tego tygodnia. Bez tego arkusz
        // klienta pokazywałby ćwiczenie i ciężar sprzed podmiany.
        cwiczenie_podmienione: p.cwiczenieIdOverride
          && p.cwiczenieIdOverride !== slot.cwiczenieId
          ? (katalog.poId(p.cwiczenieIdOverride)?.nazwa ?? null)
          : null,
        // 1RM podmienionego ćwiczenia (kolumna AA) — arkusz nie sięga po jego
        // serię maksymalną, tylko po tę liczbę.
        one_rm_reczny: p.oneRMReczny ?? null,
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

  return {
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
}

export async function eksportujDoArkusza(zapisany: ZapisanyPlan): Promise<string> {
  const wypelnienie = daneDoArkusza(zapisany);

  mkdirSync(WYJSCIE, { recursive: true });
  const nazwa = `${bezpiecznaNazwa(zapisany.klient)} ${zapisany.wersja}.0.xlsx`;
  const cel = join(WYJSCIE, nazwa);

  const tymczasowy = mkdtempSync(join(tmpdir(), "eksport-"));
  const plikDanych = join(tymczasowy, "wypelnienie.json");
  try {
    writeFileSync(plikDanych, JSON.stringify(wypelnienie), "utf-8");
    try {
      execFileSync(
        "python3",
        [join(KATALOG, "narzedzia", "wypelnij-arkusz.py"), SZABLON, plikDanych, cel],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (blad) {
      // Pełny ślad zostaje w logu serwera; do trenera idzie jedno zdanie.
      console.error(blad);
      throw new Error(bladSrodowiskaPythona(blad)
        ?? `Nie udało się zapisać arkusza: ${pierwszaLiniaBledu(blad)}`);
    }
  } finally {
    rmSync(tymczasowy, { recursive: true, force: true });
  }

  return cel;
}
