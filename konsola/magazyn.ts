/**
 * Przechowywanie planów — SQLite.
 *
 * Wcześniej były to pliki JSON i przez całą fazę 1 wystarczały. Baza wchodzi
 * w momencie, w którym konsola ma stanąć na serwerze: pliki nie znoszą dwóch
 * zapisów naraz (trener zmienia plan, klient odhacza trening), nie mają
 * transakcji i nie dają się sensownie odpytać przez wielu klientów.
 *
 * Interfejs został ten sam, z jedną zmianą: każda funkcja pyta o `trenerId`.
 * To wygląda na nadmiar przy jednym trenerze — i jest, dokładnie do dnia,
 * w którym trenerów zrobi się dwóch. Wtedy okaże się, że nie ma czego zmieniać.
 */
import { randomBytes } from "node:crypto";
import type { Plan } from "../silnik/src/plan.ts";
import type { DaneBiegowe } from "../silnik/src/bieg.ts";
import { baza } from "./baza/polaczenie.ts";

export { trenerDomyslny } from "./baza/polaczenie.ts";

export type StatusPlanu = "szkic" | "wysłany" | "zakończony";

/** Co klient faktycznie zrobił — tego arkusz nie przechowuje w ogóle. */
export type Wykonanie = {
  positionId: string;
  tydzien: number;
  /** ISO — kiedy klient to odhaczył. */
  data: string;
  ciezarWykonany?: number;
  powtorzeniaWykonane?: number;
  feedback?: "OK" | "za łatwe" | "za trudne";
};

/** Dzień oznaczony przez klienta jako zrobiony. */
export type UkonczonyDzien = {
  dzien: number;
  tydzien: number;
  data: string;
};

/** Wpis wagi ciała. Jeden na dzień — kolejny tego samego dnia nadpisuje poprzedni. */
export type PomiarWagi = {
  /** `RRRR-MM-DD`, nie ISO z godziną — waży się raz dziennie, nie co godzinę. */
  data: string;
  kg: number;
};

/** Plan razem z tym, czego silnik nie potrzebuje, a trener tak. */
export type ZapisanyPlan = {
  id: string;
  /** Właściciel. Dopisywany przy odczycie, żeby zapis wiedział, gdzie wrócić. */
  trenerId: number;
  klient: string;
  wersja: number;
  status: StatusPlanu;
  dataStartu: string | null;
  utworzony: string;
  zmieniony: string;
  /** Plan z poprzedniego cyklu — do ostrzegania o powtórkach ćwiczeń. */
  poprzedniId?: string;
  /**
   * Klucz dostępu dla klienta. Kto ma link, ten widzi plan — bez hasła.
   * Przy kilkunastu klientach to proporcjonalne; przy setkach trzeba by kont.
   * Token da się unieważnić, gdy link wycieknie.
   */
  token?: string;
  wykonania?: Wykonanie[];
  ukonczoneDni?: UkonczonyDzien[];
  /** Log wagi ciała — klient wpisuje z telefonu. */
  waga?: PomiarWagi[];
  /** Moduł oddechowy — wynik testu TWOT i flaga przeciwwskazań. */
  oddech?: { twot: number | null; przeciwwskazania: boolean };
  /** Moduł biegowy — pięć pól z zakładki BIEG. */
  bieg?: DaneBiegowe;
  plan: Plan;
};

/** Nowy klucz dostępu. 192 bity losowości — nie do zgadnięcia. */
export function nowyToken(): string {
  return randomBytes(24).toString("base64url");
}

export function nowyId(klient: string, wersja: number): string {
  const bezPolskich = klient
    .toLocaleLowerCase("pl")
    .replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e").replace(/ł/g, "l")
    .replace(/ń/g, "n").replace(/ó/g, "o").replace(/ś/g, "s").replace(/[żź]/g, "z");
  const podstawa = bezPolskich.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";
  return `${podstawa}-${wersja}`;
}

// ── odczyt ───────────────────────────────────────────────────────────

type WierszPlanu = {
  trener_id: number;
  id: string;
  klient: string;
  wersja: number;
  status: StatusPlanu;
  data_startu: string | null;
  utworzony: string;
  zmieniony: string;
  poprzedni_id: string | null;
  token: string | null;
  oddech_json: string | null;
  bieg_json: string | null;
  plan_json: string;
};

/** Wiersz z bazy → obiekt, którego oczekuje reszta aplikacji. */
function zWiersza(w: WierszPlanu): ZapisanyPlan {
  const d = baza();
  const wykonania = d.prepare(
    `SELECT position_id, tydzien, data, ciezar_wykonany, powtorzenia_wykonane, feedback
       FROM wykonanie WHERE trener_id = ? AND plan_id = ? ORDER BY data`,
  ).all(w.trener_id, w.id) as {
    position_id: string; tydzien: number; data: string;
    ciezar_wykonany: number | null; powtorzenia_wykonane: number | null;
    feedback: Wykonanie["feedback"] | null;
  }[];

  // Wiersze z `node:sqlite` mają pusty prototyp — przepisujemy je na zwykłe
  // obiekty, żeby `JSON.stringify` i porównania w testach zachowywały się
  // tak samo jak dla danych z pamięci.
  const ukonczoneDni = (d.prepare(
    `SELECT dzien, tydzien, data FROM ukonczony_dzien
      WHERE trener_id = ? AND plan_id = ? ORDER BY tydzien, dzien`,
  ).all(w.trener_id, w.id) as UkonczonyDzien[])
    .map((x) => ({ dzien: x.dzien, tydzien: x.tydzien, data: x.data }));

  const waga = (d.prepare(
    "SELECT data, kg FROM pomiar_wagi WHERE trener_id = ? AND plan_id = ? ORDER BY data",
  ).all(w.trener_id, w.id) as PomiarWagi[])
    .map((x) => ({ data: x.data, kg: x.kg }));

  return {
    id: w.id,
    trenerId: w.trener_id,
    klient: w.klient,
    wersja: w.wersja,
    status: w.status,
    dataStartu: w.data_startu,
    utworzony: w.utworzony,
    zmieniony: w.zmieniony,
    poprzedniId: w.poprzedni_id ?? undefined,
    token: w.token ?? undefined,
    wykonania: wykonania.map((x) => ({
      positionId: x.position_id,
      tydzien: x.tydzien,
      data: x.data,
      ciezarWykonany: x.ciezar_wykonany ?? undefined,
      powtorzeniaWykonane: x.powtorzenia_wykonane ?? undefined,
      feedback: x.feedback ?? undefined,
    })),
    ukonczoneDni,
    waga,
    oddech: w.oddech_json ? JSON.parse(w.oddech_json) : undefined,
    bieg: w.bieg_json ? JSON.parse(w.bieg_json) : undefined,
    plan: JSON.parse(w.plan_json) as Plan,
  };
}

export function lista(trenerId: number): ZapisanyPlan[] {
  const wiersze = baza().prepare(
    "SELECT * FROM plan WHERE trener_id = ? ORDER BY zmieniony DESC",
  ).all(trenerId) as WierszPlanu[];
  return wiersze.map(zWiersza);
}

export function wczytaj(trenerId: number, id: string): ZapisanyPlan | null {
  const w = baza().prepare(
    "SELECT * FROM plan WHERE trener_id = ? AND id = ?",
  ).get(trenerId, id) as WierszPlanu | undefined;
  return w ? zWiersza(w) : null;
}

/**
 * Plan po kluczu dostępu klienta. Zwraca null, gdy token nieznany.
 * Szuka po wszystkich trenerach — klient nie wie, czyim jest klientem.
 */
export function wczytajPoTokenie(token: string): ZapisanyPlan | null {
  if (!token || token.length < 16) return null;
  const w = baza().prepare("SELECT * FROM plan WHERE token = ?").get(token) as WierszPlanu | undefined;
  return w ? zWiersza(w) : null;
}

// ── zapis ────────────────────────────────────────────────────────────

/**
 * Zapisuje plan w całości: nagłówek, dokument planu i wszystkie wpisy klienta.
 *
 * Wszystko w jednej transakcji. Bez tego przerwany zapis mógłby zostawić plan
 * z nowymi ćwiczeniami, ale ze starymi odczuciami — a to są liczby, które
 * potem lecą na sztangę.
 */
export function zapisz(zapisany: ZapisanyPlan): ZapisanyPlan {
  const d = baza();
  const teraz = new Date().toISOString();
  const pelny: ZapisanyPlan = {
    ...zapisany,
    utworzony: zapisany.utworzony || teraz,
    zmieniony: teraz,
  };

  d.exec("BEGIN");
  try {
    d.prepare(`
      INSERT INTO plan (trener_id, id, klient, wersja, status, data_startu,
                        utworzony, zmieniony, poprzedni_id, token,
                        oddech_json, bieg_json, plan_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (trener_id, id) DO UPDATE SET
        klient = excluded.klient, wersja = excluded.wersja, status = excluded.status,
        data_startu = excluded.data_startu, zmieniony = excluded.zmieniony,
        poprzedni_id = excluded.poprzedni_id, token = excluded.token,
        oddech_json = excluded.oddech_json, bieg_json = excluded.bieg_json,
        plan_json = excluded.plan_json
    `).run(
      pelny.trenerId, pelny.id, pelny.klient, pelny.wersja, pelny.status,
      pelny.dataStartu, pelny.utworzony, pelny.zmieniony,
      pelny.poprzedniId ?? null, pelny.token ?? null,
      pelny.oddech ? JSON.stringify(pelny.oddech) : null,
      pelny.bieg ? JSON.stringify(pelny.bieg) : null,
      JSON.stringify(pelny.plan),
    );

    // Wpisy klienta podmieniamy w całości — lista w obiekcie jest źródłem prawdy.
    d.prepare("DELETE FROM wykonanie WHERE trener_id = ? AND plan_id = ?").run(pelny.trenerId, pelny.id);
    const wstawWykonanie = d.prepare(`
      INSERT INTO wykonanie (trener_id, plan_id, position_id, tydzien, data,
                             ciezar_wykonany, powtorzenia_wykonane, feedback)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const w of pelny.wykonania ?? []) {
      wstawWykonanie.run(
        pelny.trenerId, pelny.id, w.positionId, w.tydzien, w.data,
        w.ciezarWykonany ?? null, w.powtorzeniaWykonane ?? null, w.feedback ?? null,
      );
    }

    d.prepare("DELETE FROM ukonczony_dzien WHERE trener_id = ? AND plan_id = ?").run(pelny.trenerId, pelny.id);
    const wstawDzien = d.prepare(
      "INSERT INTO ukonczony_dzien (trener_id, plan_id, tydzien, dzien, data) VALUES (?, ?, ?, ?, ?)",
    );
    for (const u of pelny.ukonczoneDni ?? []) {
      wstawDzien.run(pelny.trenerId, pelny.id, u.tydzien, u.dzien, u.data);
    }

    d.prepare("DELETE FROM pomiar_wagi WHERE trener_id = ? AND plan_id = ?").run(pelny.trenerId, pelny.id);
    const wstawWage = d.prepare(
      "INSERT INTO pomiar_wagi (trener_id, plan_id, data, kg) VALUES (?, ?, ?, ?)",
    );
    for (const p of pelny.waga ?? []) {
      wstawWage.run(pelny.trenerId, pelny.id, p.data, p.kg);
    }

    d.exec("COMMIT");
  } catch (blad) {
    d.exec("ROLLBACK");
    throw blad;
  }

  return pelny;
}

export function usun(trenerId: number, id: string): void {
  baza().prepare("DELETE FROM plan WHERE trener_id = ? AND id = ?").run(trenerId, id);
}

// ── pomocnicze dla konsoli ───────────────────────────────────────────

/**
 * Ćwiczenia z poprzedniego cyklu klienta — wejście dla walidatora powtórek.
 * Tego arkusz nie potrafi: wymagałoby otwierania starych plików ręcznie.
 */
export function cwiczeniaZPoprzedniegoCyklu(zapisany: ZapisanyPlan): string[] {
  if (!zapisany.poprzedniId) return [];
  const poprzedni = wczytaj(zapisany.trenerId, zapisany.poprzedniId);
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
    trenerId: zrodlo.trenerId,
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
