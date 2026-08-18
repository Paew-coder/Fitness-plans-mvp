/**
 * Przechowywanie planów — SQLite.
 *
 * Wcześniej były to pliki JSON i przez całą fazę 1 wystarczały. Baza weszła
 * w momencie, w którym konsola miała stanąć na serwerze: pliki nie znoszą
 * dwóch zapisów naraz (trener zmienia plan, klient odhacza trening).
 *
 * Od wersji 2 schematu **klient jest osobną encją**, a plan do niego należy.
 * Wcześniej klient był kolumną tekstową i to wystarczało dokładnie do chwili,
 * w której okazało się, że trzy rzeczy nie mają gdzie mieszkać: link dostępowy
 * (nowy cykl = nowy link do wysłania), waga ciała (wykres zerował się co sześć
 * tygodni) i historia dłuższa niż jeden cykl.
 */
import { randomBytes } from "node:crypto";
import type { Plan } from "../silnik/src/plan.ts";
import type { DaneBiegowe } from "../silnik/src/bieg.ts";
import { baza } from "./baza/polaczenie.ts";
import { idKlienta, idPlanu } from "./nazwy.ts";

export { trenerDomyslny } from "./baza/polaczenie.ts";
export { idKlienta, idPlanu } from "./nazwy.ts";
/** Układ pustego planu mieszka w `uklad-planu.ts` — dzieli go z asystentem AI. */
export { LP_SLOTU, SLOTOW_W_DNIU, DNI_W_PLANIE, pustyPlan } from "./uklad-planu.ts";

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

/**
 * Klient trenera. Trwa dłużej niż każdy z jego planów i to on jest właścicielem
 * linku dostępowego oraz wagi ciała.
 */
export type Klient = {
  trenerId: number;
  id: string;
  nazwa: string;
  utworzony: string;
  /**
   * Stały klucz dostępu. Kto ma link, ten widzi aktualny plan — bez hasła.
   * Przy kilkunastu klientach to proporcjonalne; przy setkach trzeba by kont.
   * Token da się unieważnić, gdy link wycieknie.
   */
  token?: string;
};

/** Plan razem z tym, czego silnik nie potrzebuje, a trener tak. */
export type ZapisanyPlan = {
  id: string;
  /** Właściciel. Dopisywany przy odczycie, żeby zapis wiedział, gdzie wrócić. */
  trenerId: number;
  klientId: string;
  /** Nazwa klienta — dołączana przy odczycie, wyłącznie do wyświetlania. */
  klient: string;
  wersja: number;
  status: StatusPlanu;
  dataStartu: string | null;
  utworzony: string;
  zmieniony: string;
  /** Plan z poprzedniego cyklu — do ostrzegania o powtórkach ćwiczeń. */
  poprzedniId?: string;
  wykonania?: Wykonanie[];
  ukonczoneDni?: UkonczonyDzien[];
  /**
   * Waga ciała klienta — **cała jego historia**, nie tylko z tego cyklu.
   * Tylko do odczytu: zapisuje się ją przez `zapiszWage`, bo należy do klienta,
   * a nie do sześciotygodniowego dokumentu planu.
   */
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

/** Zachowane pod starą nazwą — identyfikator planu to klient plus numer cyklu. */
export function nowyId(klient: string, wersja: number): string {
  return idPlanu(klient, wersja);
}

// ── klienci ──────────────────────────────────────────────────────────

type WierszKlienta = {
  trener_id: number; id: string; nazwa: string; utworzony: string; token: string | null;
};

function klientZWiersza(w: WierszKlienta): Klient {
  return {
    trenerId: w.trener_id,
    id: w.id,
    nazwa: w.nazwa,
    utworzony: w.utworzony,
    token: w.token ?? undefined,
  };
}

export function listaKlientow(trenerId: number): Klient[] {
  const wiersze = baza().prepare(
    "SELECT * FROM klient WHERE trener_id = ? ORDER BY nazwa COLLATE NOCASE",
  ).all(trenerId) as WierszKlienta[];
  return wiersze.map(klientZWiersza);
}

export function wczytajKlienta(trenerId: number, id: string): Klient | null {
  const w = baza().prepare(
    "SELECT * FROM klient WHERE trener_id = ? AND id = ?",
  ).get(trenerId, id) as WierszKlienta | undefined;
  return w ? klientZWiersza(w) : null;
}

/**
 * Klient o tej nazwie albo nowy klient.
 *
 * Dopasowanie idzie po slugu, więc „Zuzanna C" i „zuzanna c." to ta sama osoba —
 * inaczej literówka przy zakładaniu planu rozdzielałaby historię na dwie.
 */
export function zapewnijKlienta(trenerId: number, nazwa: string): Klient {
  const id = idKlienta(nazwa);
  const istniejacy = wczytajKlienta(trenerId, id);
  if (istniejacy) return istniejacy;

  const utworzony = new Date().toISOString();
  baza().prepare(
    "INSERT INTO klient (trener_id, id, nazwa, utworzony, token) VALUES (?, ?, ?, ?, NULL)",
  ).run(trenerId, id, nazwa.trim(), utworzony);
  return { trenerId, id, nazwa: nazwa.trim(), utworzony };
}

export function zapiszKlienta(klient: Klient): Klient {
  baza().prepare(`
    INSERT INTO klient (trener_id, id, nazwa, utworzony, token)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (trener_id, id) DO UPDATE SET
      nazwa = excluded.nazwa, token = excluded.token
  `).run(
    klient.trenerId, klient.id, klient.nazwa,
    klient.utworzony || new Date().toISOString(), klient.token ?? null,
  );
  return klient;
}

/** Usuwa klienta razem ze wszystkimi jego planami — kaskada robi resztę. */
export function usunKlienta(trenerId: number, id: string): void {
  baza().prepare("DELETE FROM klient WHERE trener_id = ? AND id = ?").run(trenerId, id);
}

/**
 * Klient po kluczu dostępu. `null`, gdy token nieznany.
 * Szuka po wszystkich trenerach — klient nie wie, czyim jest klientem.
 */
export function klientPoTokenie(token: string): Klient | null {
  if (!token || token.length < 16) return null;
  const w = baza().prepare("SELECT * FROM klient WHERE token = ?").get(token) as WierszKlienta | undefined;
  return w ? klientZWiersza(w) : null;
}

// ── odczyt planów ────────────────────────────────────────────────────

type WierszPlanu = {
  trener_id: number;
  id: string;
  klient_id: string;
  klient: string;
  wersja: number;
  status: StatusPlanu;
  data_startu: string | null;
  utworzony: string;
  zmieniony: string;
  poprzedni_id: string | null;
  oddech_json: string | null;
  bieg_json: string | null;
  plan_json: string;
};

/** Plany zawsze czytamy razem z nazwą klienta — bez niej nie ma czego pokazać. */
const WYBOR_PLANU = `
  SELECT p.*, k.nazwa AS klient
    FROM plan p
    JOIN klient k ON k.trener_id = p.trener_id AND k.id = p.klient_id
`;

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

  return {
    id: w.id,
    trenerId: w.trener_id,
    klientId: w.klient_id,
    klient: w.klient,
    wersja: w.wersja,
    status: w.status,
    dataStartu: w.data_startu,
    utworzony: w.utworzony,
    zmieniony: w.zmieniony,
    poprzedniId: w.poprzedni_id ?? undefined,
    wykonania: wykonania.map((x) => ({
      positionId: x.position_id,
      tydzien: x.tydzien,
      data: x.data,
      ciezarWykonany: x.ciezar_wykonany ?? undefined,
      powtorzeniaWykonane: x.powtorzenia_wykonane ?? undefined,
      feedback: x.feedback ?? undefined,
    })),
    ukonczoneDni,
    // Cała historia klienta, nie wycinek z tego cyklu.
    waga: wagaKlienta(w.trener_id, w.klient_id),
    oddech: w.oddech_json ? JSON.parse(w.oddech_json) : undefined,
    bieg: w.bieg_json ? JSON.parse(w.bieg_json) : undefined,
    plan: JSON.parse(w.plan_json) as Plan,
  };
}

export function lista(trenerId: number): ZapisanyPlan[] {
  const wiersze = baza().prepare(
    `${WYBOR_PLANU} WHERE p.trener_id = ? ORDER BY p.zmieniony DESC`,
  ).all(trenerId) as WierszPlanu[];
  return wiersze.map(zWiersza);
}

export function wczytaj(trenerId: number, id: string): ZapisanyPlan | null {
  const w = baza().prepare(
    `${WYBOR_PLANU} WHERE p.trener_id = ? AND p.id = ?`,
  ).get(trenerId, id) as WierszPlanu | undefined;
  return w ? zWiersza(w) : null;
}

/** Wszystkie cykle klienta, od najstarszego. To jest jego historia. */
export function planyKlienta(trenerId: number, klientId: string): ZapisanyPlan[] {
  const wiersze = baza().prepare(
    `${WYBOR_PLANU} WHERE p.trener_id = ? AND p.klient_id = ? ORDER BY p.wersja`,
  ).all(trenerId, klientId) as WierszPlanu[];
  return wiersze.map(zWiersza);
}

/**
 * Plan, który klient widzi po otwarciu swojego linku.
 *
 * Najnowszy wysłany; gdy takiego nie ma — najnowszy zakończony. Szkiców klient
 * nie widzi nigdy: plan w trakcie układania to nie jest coś, po czym można
 * trenować, a link jest stały i działa cały czas.
 */
export function aktywnyPlan(trenerId: number, klientId: string): ZapisanyPlan | null {
  const w = baza().prepare(`
    ${WYBOR_PLANU}
     WHERE p.trener_id = ? AND p.klient_id = ? AND p.status IN ('wysłany', 'zakończony')
     ORDER BY CASE p.status WHEN 'wysłany' THEN 0 ELSE 1 END, p.wersja DESC
     LIMIT 1
  `).get(trenerId, klientId) as WierszPlanu | undefined;
  return w ? zWiersza(w) : null;
}

// ── zapis ────────────────────────────────────────────────────────────

/**
 * Zapisuje plan w całości: nagłówek, dokument planu i wpisy klienta.
 *
 * Wszystko w jednej transakcji. Bez tego przerwany zapis mógłby zostawić plan
 * z nowymi ćwiczeniami, ale ze starymi odczuciami — a to są liczby, które
 * potem lecą na sztangę.
 *
 * Wagi nie dotyka: należy do klienta, nie do planu. Od niej jest `zapiszWage`.
 */
export function zapisz(zapisany: ZapisanyPlan): ZapisanyPlan {
  const d = baza();
  const teraz = new Date().toISOString();

  // Do kogo należy ten plan.
  //
  // Pierwszeństwo ma `klientId`, jeśli taki klient istnieje — dzięki temu
  // zmiana nazwy („Zuzanna C" → „Zuzanna Chmiel") nie rozszczepia historii
  // na dwóch klientów przy najbliższym zapisie. Gdy identyfikatora nie ma
  // albo nie wskazuje na nikogo, decyduje nazwa i klient powstaje.
  const klient = (zapisany.klientId ? wczytajKlienta(zapisany.trenerId, zapisany.klientId) : null)
    ?? zapewnijKlienta(zapisany.trenerId, zapisany.klient || zapisany.klientId);

  const pelny: ZapisanyPlan = {
    ...zapisany,
    klientId: klient.id,
    klient: klient.nazwa,
    utworzony: zapisany.utworzony || teraz,
    zmieniony: teraz,
  };

  d.exec("BEGIN");
  try {
    d.prepare(`
      INSERT INTO plan (trener_id, id, klient_id, wersja, status, data_startu,
                        utworzony, zmieniony, poprzedni_id,
                        oddech_json, bieg_json, plan_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (trener_id, id) DO UPDATE SET
        klient_id = excluded.klient_id, wersja = excluded.wersja, status = excluded.status,
        data_startu = excluded.data_startu, zmieniony = excluded.zmieniony,
        poprzedni_id = excluded.poprzedni_id,
        oddech_json = excluded.oddech_json, bieg_json = excluded.bieg_json,
        plan_json = excluded.plan_json
    `).run(
      pelny.trenerId, pelny.id, pelny.klientId, pelny.wersja, pelny.status,
      pelny.dataStartu, pelny.utworzony, pelny.zmieniony,
      pelny.poprzedniId ?? null,
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

    d.exec("COMMIT");
  } catch (blad) {
    d.exec("ROLLBACK");
    throw blad;
  }

  return { ...pelny, waga: wagaKlienta(pelny.trenerId, pelny.klientId) };
}

export function usun(trenerId: number, id: string): void {
  baza().prepare("DELETE FROM plan WHERE trener_id = ? AND id = ?").run(trenerId, id);
}

// ── waga ciała ───────────────────────────────────────────────────────

export function wagaKlienta(trenerId: number, klientId: string): PomiarWagi[] {
  return (baza().prepare(
    "SELECT data, kg FROM pomiar_wagi WHERE trener_id = ? AND klient_id = ? ORDER BY data",
  ).all(trenerId, klientId) as PomiarWagi[])
    .map((x) => ({ data: x.data, kg: x.kg }));
}

/**
 * Jeden pomiar. `kg <= 0` kasuje wpis z tego dnia — tak klient poprawia pomyłkę.
 * Wpis dopisuje się pojedynczo, nie przez podmianę całej listy: historia wagi
 * bywa dłuższa niż rok i nie ma powodu przepisywać jej przy każdym ważeniu.
 */
export function zapiszWage(trenerId: number, klientId: string, data: string, kg: number): void {
  const d = baza();
  if (!(kg > 0)) {
    d.prepare("DELETE FROM pomiar_wagi WHERE trener_id = ? AND klient_id = ? AND data = ?")
      .run(trenerId, klientId, data);
    return;
  }
  d.prepare(`
    INSERT INTO pomiar_wagi (trener_id, klient_id, data, kg) VALUES (?, ?, ?, ?)
    ON CONFLICT (trener_id, klient_id, data) DO UPDATE SET kg = excluded.kg
  `).run(trenerId, klientId, data, kg);
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
    id: idPlanu(zrodlo.klient, wersja),
    trenerId: zrodlo.trenerId,
    klientId: zrodlo.klientId,
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
