/**
 * Przechowywanie planów — pliki JSON na dysku.
 *
 * Świadomie bez bazy danych. Konsola ma działać u trenera na komputerze bez
 * stawiania serwera; jeden plik = jeden plan, czytelny i łatwy do skopiowania.
 * Schemat Postgres z `docs/03-architektura.md` zostaje aktualny na później —
 * silnik i tak nie wie, skąd biorą się dane.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plan } from "../silnik/src/plan.ts";

const KORZEN = join(dirname(fileURLToPath(import.meta.url)), "dane", "plany");

export type StatusPlanu = "szkic" | "wysłany" | "zakończony";

/** Plan razem z tym, czego silnik nie potrzebuje, a trener tak. */
export type ZapisanyPlan = {
  id: string;
  klient: string;
  wersja: number;
  status: StatusPlanu;
  dataStartu: string | null;
  utworzony: string;
  zmieniony: string;
  /** Plan z poprzedniego cyklu — do ostrzegania o powtórkach ćwiczeń. */
  poprzedniId?: string;
  plan: Plan;
};

function upewnijKatalog(): void {
  mkdirSync(KORZEN, { recursive: true });
}

function sciezka(id: string): string {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`Niedozwolone id planu: ${id}`);
  return join(KORZEN, `${id}.json`);
}

export function nowyId(klient: string, wersja: number): string {
  const bezPolskich = klient
    .toLocaleLowerCase("pl")
    .replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e").replace(/ł/g, "l")
    .replace(/ń/g, "n").replace(/ó/g, "o").replace(/ś/g, "s").replace(/[żź]/g, "z");
  const podstawa = bezPolskich.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";
  return `${podstawa}-${wersja}`;
}

export function lista(): ZapisanyPlan[] {
  upewnijKatalog();
  return readdirSync(KORZEN)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(KORZEN, f), "utf-8")) as ZapisanyPlan)
    .sort((a, b) => b.zmieniony.localeCompare(a.zmieniony));
}

export function wczytaj(id: string): ZapisanyPlan | null {
  const p = sciezka(id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as ZapisanyPlan;
}

export function zapisz(zapisany: ZapisanyPlan): ZapisanyPlan {
  upewnijKatalog();
  const teraz = new Date().toISOString();
  const pelny: ZapisanyPlan = {
    ...zapisany,
    utworzony: zapisany.utworzony || teraz,
    zmieniony: teraz,
  };
  writeFileSync(sciezka(pelny.id), JSON.stringify(pelny, null, 1), "utf-8");
  return pelny;
}

export function usun(id: string): void {
  const p = sciezka(id);
  if (existsSync(p)) unlinkSync(p);
}

/**
 * Ćwiczenia z poprzedniego cyklu klienta — wejście dla walidatora powtórek.
 * Tego arkusz nie potrafi: wymagałoby otwierania starych plików ręcznie.
 */
export function cwiczeniaZPoprzedniegoCyklu(zapisany: ZapisanyPlan): string[] {
  if (!zapisany.poprzedniId) return [];
  const poprzedni = wczytaj(zapisany.poprzedniId);
  if (!poprzedni) return [];
  return poprzedni.plan.sloty
    .map((s) => s.cwiczenieId)
    .filter((id): id is string => id !== null);
}

/**
 * Kopia planu jako nowa wersja dla tego samego klienta.
 *
 * Dobór ćwiczeń, serie, powtórzenia i RPE zostają — to punkt wyjścia, nie kopia
 * pod klucz. Znikają odczucia klienta: należą do wykonanego cyklu, a nowy
 * zaczyna się od mnożnika 1.
 *
 * Nowy plan wskazuje poprzedni, więc od razu działa ostrzeżenie o powtórkach.
 */
export function kopiaJakoNowaWersja(zrodlo: ZapisanyPlan, wersja: number): ZapisanyPlan {
  return {
    id: nowyId(zrodlo.klient, wersja),
    klient: zrodlo.klient,
    wersja,
    status: "szkic",
    dataStartu: null,
    utworzony: "",
    zmieniony: "",
    poprzedniId: zrodlo.id,
    plan: {
      ...zrodlo.plan,
      sloty: zrodlo.plan.sloty.map((slot) => ({
        ...slot,
        tygodnie: Object.fromEntries(
          Object.entries(slot.tygodnie ?? {}).map(([tydzien, parametry]) => {
            const { feedback, ciezarOverride, ...reszta } = parametry ?? {};
            return [tydzien, reszta];
          }),
        ),
      })),
    },
  };
}

/** Pusty plan: 5 dni × 12 slotów z numeracją A1, B1/B2, C1/C2, D1/D2, E1/E2. */
export function pustyPlan(klient: string): Plan {
  const LP = ["A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2.", "E1.", "E2.", "", "", ""];
  const sloty = [];
  for (let dzien = 1; dzien <= 5; dzien++) {
    for (let poz = 1; poz <= 12; poz++) {
      sloty.push({
        positionId: `D${dzien}-S${String(poz).padStart(2, "0")}`,
        dzien,
        lp: LP[poz - 1] ?? "",
        cwiczenieId: null,
        kategoriaSzkieletu: null,
        tygodnie: {},
      });
    }
  }
  return {
    nazwa: klient,
    trybAkcesoriow: "trzymaj z bloku",
    czescPlanu: "objętość",
    serieMaksymalne: [],
    sloty,
    topSety: [1, 2, 3, 4, 5].map((dzien) => ({
      dzien,
      wlaczony: true,
      rpe: 7,
      slotPositionId: `D${dzien}-S01`,
    })),
  };
}
