/**
 * Wczytanie planu z arkusza `.xlsx` — jedna droga dla konsoli i dla narzędzia.
 *
 * Ta sama operacja jest potrzebna w dwóch miejscach: gdy trener wskazuje plik
 * z ekranu i gdy wczytuje cały katalog arkuszy jedną komendą. Gdyby każde
 * miało własną wersję, prędzej czy później zaczęłyby się różnić — a różnica
 * w imporcie znaczy plan, który po wczytaniu liczy co innego.
 *
 * Ekstraktor siedzi w Pythonie, bo format `.xlsx` czyta tylko `openpyxl`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plan } from "../silnik/src/plan.ts";
import {
  planZArkusza, nierozpoznaneCwiczenia, type ZrzutArkusza,
} from "../silnik/src/import-arkusza.ts";
import * as magazyn from "./magazyn.ts";
import { bladSrodowiskaPythona } from "./blad-pythona.ts";

const KATALOG = dirname(fileURLToPath(import.meta.url));

/** Awaria, za którą odpowiada plik albo środowisko, a nie serwer. */
export class BladArkusza extends Error {}

/** Surowy zrzut z arkusza. Wyjątek znaczy: pliku nie da się odczytać. */
export function zrzutZArkusza(zawartosc: Buffer): ZrzutArkusza {
  const katalogTymczasowy = mkdtempSync(join(tmpdir(), "import-"));
  const zrodlo = join(katalogTymczasowy, "plan.xlsx");
  const cel = join(katalogTymczasowy, "zrzut.json");
  try {
    writeFileSync(zrodlo, zawartosc);
    try {
      execFileSync(
        "python3",
        [join(KATALOG, "..", "silnik", "narzedzia", "zrzut-arkusza.py"), zrodlo, cel],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (blad) {
      console.error(blad);
      // Brak Pythona albo biblioteki to nie jest wina pliku trenera —
      // a takie właśnie zdanie dostawał wcześniej.
      const srodowisko = bladSrodowiskaPythona(blad);
      if (srodowisko) throw new BladArkusza(srodowisko);
      throw blad;
    }
    return JSON.parse(readFileSync(cel, "utf-8")) as ZrzutArkusza;
  } finally {
    rmSync(katalogTymczasowy, { recursive: true, force: true });
  }
}

/**
 * Nakłada zaimportowany plan na pusty szkielet 5 dni × 12 slotów.
 *
 * Import zwraca tylko sloty z ćwiczeniem; reszta musi zostać pusta, ale obecna,
 * żeby w konsoli dało się dopisywać kolejne pozycje.
 */
export function scalZPustym(pusty: Plan, zaimportowany: Plan): Plan {
  const wgPozycji = new Map(zaimportowany.sloty.map((s) => [s.positionId, s]));
  return {
    ...zaimportowany,
    sloty: pusty.sloty.map((s) => wgPozycji.get(s.positionId) ?? s),
    topSety: pusty.topSety?.map((t) => {
      const z = zaimportowany.topSety?.find((x) => x.dzien === t.dzien);
      return z ? { ...t, wlaczony: z.wlaczony, rpe: z.rpe } : t;
    }),
  };
}

export type WynikWczytania = {
  zapisany: magazyn.ZapisanyPlan;
  nierozpoznane: { positionId: string; nazwa: string }[];
};

/**
 * Cała droga: bajty pliku → zapisany plan w bazie.
 *
 * Rzuca `BladArkusza` ze zdaniem po polsku wszędzie tam, gdzie winny jest plik
 * albo środowisko. Wołający decyduje, czy to pokazać na ekranie, czy wypisać
 * w terminalu — ale treść jest ta sama.
 */
export function wczytajPlanZArkusza(args: {
  zawartosc: Buffer;
  trenerId: number;
  klient: string;
  wersja: number;
  poprzedniId?: string;
}): WynikWczytania {
  if (args.zawartosc.length === 0) throw new BladArkusza("Pusty plik");

  let zrzut: ZrzutArkusza;
  try {
    zrzut = zrzutZArkusza(args.zawartosc);
  } catch (e) {
    if (e instanceof BladArkusza) throw e;
    throw new BladArkusza("Nie udało się odczytać pliku. Czy to arkusz w układzie 5.17/5.18?");
  }

  // Arkusz bez ani jednego rozpoznanego ćwiczenia dawał kiedyś pusty plan
  // i komunikat o powodzeniu — najgorsze możliwe połączenie.
  const zArkusza = planZArkusza(zrzut);
  if (!zArkusza.sloty.some((s) => s.cwiczenieId)) {
    const nierozpoznane = nierozpoznaneCwiczenia(zrzut);
    throw new BladArkusza(nierozpoznane.length
      ? "W arkuszu nie ma ani jednego ćwiczenia z BAZY. Nierozpoznane nazwy: "
        + `${nierozpoznane.slice(0, 5).map((n) => `„${n.nazwa}”`).join(", ")}.`
      : "W arkuszu nie ma ani jednego ćwiczenia. Czy to plik z planem, "
        + "z wypełnionymi zakładkami T1–T6?");
  }

  const id = magazyn.nowyId(args.klient, args.wersja);
  if (magazyn.wczytaj(args.trenerId, id)) {
    throw new BladArkusza(`Plan „${id}” już istnieje`);
  }

  const osoba = magazyn.zapewnijKlienta(args.trenerId, args.klient);
  const zapisany = magazyn.zapisz({
    id, trenerId: args.trenerId, klientId: osoba.id, klient: osoba.nazwa,
    wersja: args.wersja, status: "szkic",
    dataStartu: null, utworzony: "", zmieniony: "",
    poprzedniId: args.poprzedniId || undefined,
    plan: scalZPustym(magazyn.pustyPlan(osoba.nazwa), zArkusza),
  });

  return { zapisany, nierozpoznane: nierozpoznaneCwiczenia(zrzut) };
}
