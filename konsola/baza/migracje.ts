/**
 * Migracje schematu.
 *
 * `schemat.sql` opisuje bazę docelową i wykonuje się przy każdym starcie —
 * ale samymi `CREATE TABLE IF NOT EXISTS` nie da się zmienić tabeli, która już
 * istnieje. Od tego są migracje: kod, który doprowadza starą bazę do kształtu
 * opisanego w schemacie.
 *
 * Zasada: migracja nigdy nie kasuje danych trenera. Przenosi je i sprawdza,
 * czy po przeniesieniu zgadza się liczba wierszy.
 */
import type { DatabaseSync } from "node:sqlite";
import { idKlienta } from "../nazwy.ts";
import { katalog } from "../../silnik/src/katalog.ts";
import {
  BOJE, czescBoju, DWUBOJ, PAUZOWANE, PROGRESJA_BOJU, pozycjaBoju, progresjaSlotu,
} from "../../silnik/src/szablon-boju.ts";
import type { CzescPlanu } from "../../silnik/src/typy.ts";

export type Migracja = {
  /** Wersja, do której ta migracja doprowadza. */
  doWersji: number;
  opis: string;
  wykonaj: (d: DatabaseSync) => void;
};

/** Czy tabela ma taką kolumnę. Podstawa wszystkich sprawdzeń „czy już zrobione". */
export function maKolumne(d: DatabaseSync, tabela: string, kolumna: string): boolean {
  const kolumny = d.prepare(`PRAGMA table_info(${tabela})`).all() as { name: string }[];
  return kolumny.some((k) => k.name === kolumna);
}

export function tabelaIstnieje(d: DatabaseSync, nazwa: string): boolean {
  const wiersz = d.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(nazwa);
  return wiersz !== undefined;
}

/**
 * Wersja 2 — klient przestaje być kolumną tekstową w planie, a staje się encją.
 *
 * Co się przenosi:
 *   · z każdej odrębnej nazwy w `plan.klient` powstaje klient,
 *   · token dostępowy wędruje z najnowszego planu na klienta, więc link,
 *     który klient ma już w telefonie, **działa dalej** — i od teraz sam
 *     pokazuje aktualny cykl zamiast zamrożonego starego,
 *   · waga ciała przestaje wisieć przy planie i ląduje przy kliencie, przez
 *     co wykres nie zeruje się co sześć tygodni.
 */
function doWersji2(d: DatabaseSync): void {
  if (maKolumne(d, "plan", "klient_id")) return;   // baza już w tym kształcie

  // Migracja jest samowystarczalna: nie liczy na to, że `schemat.sql` zdążył
  // cokolwiek utworzyć. To ta sama definicja co w schemacie — kopia jest tu
  // ceną za brak zależności od kolejności wykonania.
  d.exec(`
    CREATE TABLE IF NOT EXISTS klient (
      trener_id INTEGER NOT NULL REFERENCES trener(id) ON DELETE CASCADE,
      id        TEXT    NOT NULL,
      nazwa     TEXT    NOT NULL,
      utworzony TEXT    NOT NULL,
      token     TEXT    UNIQUE,
      PRIMARY KEY (trener_id, id)
    );
  `);

  type StaryPlan = {
    trener_id: number; id: string; klient: string;
    token: string | null; utworzony: string; zmieniony: string;
  };
  const plany = d.prepare(
    "SELECT trener_id, id, klient, token, utworzony, zmieniony FROM plan ORDER BY zmieniony",
  ).all() as StaryPlan[];

  // Grupowanie po (trener, slug nazwy). Kolejność rosnąca po `zmieniony`
  // sprawia, że nazwa i token biorą się z najświeższego planu klienta.
  type Grupa = { trenerId: number; id: string; nazwa: string; token: string | null; utworzony: string };
  const klienci = new Map<string, Grupa>();
  for (const p of plany) {
    const id = idKlienta(p.klient);
    const klucz = `${p.trener_id}/${id}`;
    const dotychczas = klienci.get(klucz);
    klienci.set(klucz, {
      trenerId: p.trener_id,
      id,
      nazwa: p.klient,
      token: p.token ?? dotychczas?.token ?? null,
      utworzony: dotychczas && dotychczas.utworzony < p.utworzony ? dotychczas.utworzony : p.utworzony,
    });
  }

  const wstawKlienta = d.prepare(
    "INSERT OR IGNORE INTO klient (trener_id, id, nazwa, utworzony, token) VALUES (?, ?, ?, ?, ?)",
  );
  for (const k of klienci.values()) {
    wstawKlienta.run(k.trenerId, k.id, k.nazwa, k.utworzony, k.token);
  }

  // Mapa plan → klient. Tabela pomocnicza, bo przepisanie tabel robimy w SQL,
  // a slug liczy się w JS — inaczej trzeba by go odtwarzać wyrażeniem SQL.
  d.exec("CREATE TEMP TABLE mapa_klienta (trener_id INTEGER, plan_id TEXT, klient_id TEXT)");
  const wstawMape = d.prepare("INSERT INTO mapa_klienta VALUES (?, ?, ?)");
  for (const p of plany) wstawMape.run(p.trener_id, p.id, idKlienta(p.klient));

  // Przepisanie tabeli planów: dochodzi `klient_id`, znika `token`.
  // SQLite nie umie usunąć kolumny z indeksem UNIQUE, więc tabela powstaje
  // od nowa — to standardowa procedura z dokumentacji SQLite.
  d.exec(`
    CREATE TABLE plan_nowy (
      trener_id    INTEGER NOT NULL REFERENCES trener(id) ON DELETE CASCADE,
      id           TEXT    NOT NULL,
      klient_id    TEXT    NOT NULL,
      wersja       INTEGER NOT NULL,
      status       TEXT    NOT NULL CHECK (status IN ('szkic', 'wysłany', 'zakończony')),
      data_startu  TEXT,
      utworzony    TEXT    NOT NULL,
      zmieniony    TEXT    NOT NULL,
      poprzedni_id TEXT,
      oddech_json  TEXT,
      bieg_json    TEXT,
      plan_json    TEXT    NOT NULL,
      PRIMARY KEY (trener_id, id),
      FOREIGN KEY (trener_id, klient_id) REFERENCES klient(trener_id, id) ON DELETE CASCADE
    );

    INSERT INTO plan_nowy
    SELECT p.trener_id, p.id, m.klient_id, p.wersja, p.status, p.data_startu,
           p.utworzony, p.zmieniony, p.poprzedni_id, p.oddech_json, p.bieg_json, p.plan_json
      FROM plan p
      JOIN mapa_klienta m ON m.trener_id = p.trener_id AND m.plan_id = p.id;

    DROP TABLE plan;
    ALTER TABLE plan_nowy RENAME TO plan;

    CREATE INDEX IF NOT EXISTS plan_zmieniony ON plan (trener_id, zmieniony DESC);
    CREATE INDEX IF NOT EXISTS plan_klienta ON plan (trener_id, klient_id, wersja DESC);
  `);

  // Waga przechodzi z planu na klienta. Dwa cykle tego samego klienta mogą
  // mieć wpis z tego samego dnia — wygrywa późniejszy, bo `plany` idą rosnąco.
  d.exec(`
    CREATE TABLE pomiar_wagi_nowy (
      trener_id INTEGER NOT NULL,
      klient_id TEXT    NOT NULL,
      data      TEXT    NOT NULL,
      kg        REAL    NOT NULL,
      PRIMARY KEY (trener_id, klient_id, data),
      FOREIGN KEY (trener_id, klient_id) REFERENCES klient(trener_id, id) ON DELETE CASCADE
    );

    INSERT OR REPLACE INTO pomiar_wagi_nowy
    SELECT w.trener_id, m.klient_id, w.data, w.kg
      FROM pomiar_wagi w
      JOIN mapa_klienta m ON m.trener_id = w.trener_id AND m.plan_id = w.plan_id;

    DROP TABLE pomiar_wagi;
    ALTER TABLE pomiar_wagi_nowy RENAME TO pomiar_wagi;

    DROP TABLE mapa_klienta;
  `);
}

/**
 * Wersja 3 — wykonanie zapamiętuje, które ćwiczenie klient faktycznie robił.
 *
 * Slot planu trzyma jedno ćwiczenie na wszystkie sześć tygodni. Podmiana
 * w środku cyklu przepisywała więc także przeszłość: przerobione tygodnie
 * pokazywały nową nazwę, a kilogramy podniesione na starym ćwiczeniu zasilały
 * propozycję 1RM dla nowego — czyli wracały na sztangę w kolejnym cyklu.
 *
 * Migracja tylko dokłada kolumnę. Starych wierszy nie wypełnia: `NULL` znaczy
 * „to, co stoi w slocie", czyli dokładnie tyle, ile było wiadomo do tej pory.
 * Zgadywanie wstecz byłoby wymyślaniem historii, której nikt nie zapisał.
 */
function doWersji3(d: DatabaseSync): void {
  if (maKolumne(d, "wykonanie", "cwiczenie_id")) return;
  d.exec("ALTER TABLE wykonanie ADD COLUMN cwiczenie_id TEXT");
}

/**
 * Wersja 4 — TOP SET zapisany jest tam, gdzie był widoczny.
 *
 * Do tej pory TOP SET miał dwie warstwy: w planie stało „włączony" dla
 * każdego dnia, a na ekranie pokazywał się dopiero wtedy, gdy w pierwszym
 * wierszu stało ćwiczenie złożone (coeff 1,0). Ta druga warstwa właśnie
 * znika — TOP SET dodaje trener, przy dowolnym ćwiczeniu, i pokazuje się
 * dokładnie tam, gdzie go postawił.
 *
 * Gdyby stare plany zostały bez zmian, po aktualizacji TOP SET pojawiłby się
 * nagle w każdym dniu, przy czymkolwiek stoi w pierwszym wierszu — także
 * przy ćwiczeniu balansowym. Klient dostałby w telefonie polecenie „jedno
 * powtórzenie na maksimum" w ćwiczeniu, w którym nie ma ono sensu.
 *
 * Migracja przepisuje więc do danych to, co było widać: zostaje włączone
 * to, co pokazywało się przed aktualizacją, i nic ponadto. Niczego nie
 * dodaje — plan po aktualizacji wygląda tak samo jak przed nią.
 */
function doWersji4(d: DatabaseSync): void {
  const plany = d.prepare("SELECT trener_id, id, plan_json FROM plan").all() as
    { trener_id: number; id: string; plan_json: string }[];
  const zapisz = d.prepare("UPDATE plan SET plan_json = ? WHERE trener_id = ? AND id = ?");

  for (const wiersz of plany) {
    let plan: { topSety?: { wlaczony?: boolean; slotPositionId?: string }[];
                sloty?: { positionId?: string; cwiczenieId?: string | null }[] };
    try {
      plan = JSON.parse(wiersz.plan_json);
    } catch {
      // Nieczytelny plan zostawiamy nietknięty. Migracja nie jest miejscem
      // na naprawianie czegoś, czego nie umiemy przeczytać.
      continue;
    }
    if (!Array.isArray(plan.topSety) || plan.topSety.length === 0) continue;

    let zmiana = false;
    for (const top of plan.topSety) {
      if (!top?.wlaczony) continue;
      const slot = (plan.sloty ?? []).find((s) => s.positionId === top.slotPositionId);
      const cwiczenie = slot?.cwiczenieId ? katalog.poId(slot.cwiczenieId) : null;
      if (cwiczenie?.coeff === 1) continue;   // tak samo było widać wcześniej
      top.wlaczony = false;
      zmiana = true;
    }
    if (!zmiana) continue;
    zapisz.run(JSON.stringify(plan), wiersz.trener_id, wiersz.id);
  }
}

/**
 * Wersja 5 — RPE TOP SETU osobno na każdy tydzień.
 *
 * Do tej pory TOP SET miał jedną liczbę na cały cykl. W arkuszach trenera
 * RPE rośnie z tygodnia na tydzień — 6 → 6,5 → 7 → 7,5 → 8 w cz.1, o stopień
 * wyżej w cz.2 — i to wraca do aplikacji jako szablon.
 *
 * Co robimy ze starą liczbą:
 *
 *   • **7 kasujemy.** Siedmiu nikt nie wybrał — tyle wpisywał nowy plan,
 *     bo taki był zaszyty w szkielecie. Zostawienie jej jako „decyzji trenera"
 *     zablokowałoby rampę w każdym istniejącym planie, i to po cichu.
 *   • **każdą inną przepisujemy na wszystkie sześć tygodni.** Tam trener
 *     liczbę zmienił, więc jest wyborem i zostaje dokładnie tam, gdzie była —
 *     plan po aktualizacji liczy tyle samo, co przed nią.
 *
 * Trener wyczyści pole w konsoli, gdy zechce wrócić do szablonu.
 */
function doWersji5(d: DatabaseSync): void {
  const plany = d.prepare("SELECT trener_id, id, plan_json FROM plan").all() as
    { trener_id: number; id: string; plan_json: string }[];
  const zapisz = d.prepare("UPDATE plan SET plan_json = ? WHERE trener_id = ? AND id = ?");

  for (const wiersz of plany) {
    let plan: { topSety?: { rpe?: unknown; rpeTygodni?: unknown }[] };
    try {
      plan = JSON.parse(wiersz.plan_json);
    } catch {
      continue;
    }
    if (!Array.isArray(plan.topSety) || plan.topSety.length === 0) continue;

    let zmiana = false;
    for (const top of plan.topSety) {
      if (!top || !("rpe" in top)) continue;
      const stare = top.rpe;
      delete top.rpe;
      zmiana = true;
      if (typeof stare !== "number" || !Number.isFinite(stare) || stare === 7) continue;
      if (top.rpeTygodni == null) {
        top.rpeTygodni = { 1: stare, 2: stare, 3: stare, 4: stare, 5: stare, 6: stare };
      }
    }
    if (!zmiana) continue;
    zapisz.run(JSON.stringify(plan), wiersz.trener_id, wiersz.id);
  }
}

/**
 * Wersja 6 — wykonanie pamięta wszystkie serie, nie tylko najcięższą.
 *
 * Trener widział przy ćwiczeniu jedną parę „ciężar × powtórzenia" i zakładał,
 * że klient zrobił tak wszystkie serie. Klient przy planie na 80 kg robił
 * 90, 85, 80 — przestrzelił i opadł z sił — a do bazy trafiało samo „90×6".
 *
 * Migracja tylko dokłada kolumnę. Stare wiersze zostają z `NULL`: z nich znana
 * jest wyłącznie najcięższa para i tak ją pokazujemy — jako jedną serię.
 * Rozpisywanie jej na „4 × 90" byłoby wymyślaniem serii, których nikt nie wpisał.
 */
function doWersji6(d: DatabaseSync): void {
  if (maKolumne(d, "wykonanie", "serie_json")) return;
  d.exec("ALTER TABLE wykonanie ADD COLUMN serie_json TEXT");
}

/**
 * Wersja 7 — wersja robocza planu (10.10.2026).
 *
 * Trener: „jak wprowadzam zmiany, to nie ma to wpływać na aktualne plany
 * klientów, chyba że to zatwierdzę”. Plan trenera zostaje w `plan_json`;
 * `plan_klienta_json` to kopia tego, co klient widzi, dopóki zmiany czekają
 * na zatwierdzenie, `pozycje_klienta_json` — mapa przestawień ▲▼, a
 * `zmiany_od` — od kiedy czekają. Pusto = nic nie czeka. Szczegóły:
 * `wersja-robocza.ts`.
 */
function doWersji7(d: DatabaseSync): void {
  for (const kolumna of ["plan_klienta_json", "pozycje_klienta_json", "zmiany_od"]) {
    if (!maKolumne(d, "plan", kolumna)) d.exec(`ALTER TABLE plan ADD COLUMN ${kolumna} TEXT`);
  }
}

/**
 * Wersja 8 — znacznik resetu planu (10.10.2026).
 *
 * Trener zresetował plan, a telefon klienta wznowił trening w połowie: postęp
 * prowadzonego treningu (zrobione serie, bieżąca seria) żyje w pamięci
 * telefonu, a reset czyścił tylko bazę. `reset_od` — kiedy plan zresetowano;
 * telefon porzuca lokalny postęp sprzed tej chwili, a serwer odrzuca zaległe
 * zapisy z kolejki offline sprzed resetu.
 */
function doWersji8(d: DatabaseSync): void {
  if (!maKolumne(d, "plan", "reset_od")) d.exec("ALTER TABLE plan ADD COLUMN reset_od TEXT");
}

/**
 * Wersja 9 — boje na każdej pozycji, nie tylko w A (16.10.2026; od wersji 10
 * bojem są tylko przysiady, martwe ciągi i bench — `BOJE`).
 *
 * Trener: „mam barbell bench press jako B1 i liczy mi się jako akcesorium —
 * zrób tak, żeby ćwiczenia, które mają swoją własną progresję, zawsze miały
 * ją niezależnie od miejsca w rozpisce”. Reguła żyje w silniku
 * (`BOJE`), ale plany pamiętają liczby wpisane przyciskiem
 * „wpisz progresję”, gdy takie ćwiczenie było jeszcze akcesorium: 3 serie
 * i RPE akcesorium. Wpisane wygrywają z szablonem, więc bench na B1 wyszedłby
 * „3 × 6 @ 8” — ani bój, ani akcesorium.
 *
 * Migracja zdejmuje **tylko te liczby, które wpisał automat** — 3 serie
 * i dokładnie RPE akcesorium z tej pozycji i tygodnia, bez wpisanych
 * powtórzeń. Liczby zmienione ręcznie przez trenera, oceny i ciężary klienta
 * zostają. Plan trenera i wersja, którą widzi klient.
 */
function doWersji9(d: DatabaseSync): void {
  const plany = d.prepare("SELECT trener_id, id, plan_json, plan_klienta_json FROM plan").all() as
    { trener_id: number; id: string; plan_json: string; plan_klienta_json: string | null }[];
  const zapisz = d.prepare(
    "UPDATE plan SET plan_json = ?, plan_klienta_json = ? WHERE trener_id = ? AND id = ?");

  type Slot = { lp?: string; cwiczenieId?: string | null; bojGlowny?: boolean;
    tygodnie?: Record<string, Record<string, unknown>> };
  const posprzataj = (json: string | null): { json: string | null; zmiana: boolean } => {
    if (!json) return { json, zmiana: false };
    let plan: { sloty?: Slot[] };
    try { plan = JSON.parse(json); } catch { return { json, zmiana: false }; }
    let zmiana = false;
    for (const slot of plan.sloty ?? []) {
      const c = slot.cwiczenieId ? katalog.poId(slot.cwiczenieId) : undefined;
      const lp = slot.lp ?? "";
      if (!c || slot.bojGlowny !== undefined || pozycjaBoju(lp)) continue;
      if (PAUZOWANE[c.id] || DWUBOJ.has(c.id) || !BOJE.has(c.id)) continue;
      for (const t of [1, 2, 3, 4, 5, 6] as const) {
        const p = slot.tygodnie?.[t];
        if (!p || p.powtorzenia !== undefined) continue;
        const akcesorium = progresjaSlotu(lp, t);
        if (p.serie === akcesorium.serie && p.rpe === akcesorium.rpe) {
          delete p.serie;
          delete p.rpe;
          zmiana = true;
        }
      }
    }
    return { json: zmiana ? JSON.stringify(plan) : json, zmiana };
  };

  for (const wiersz of plany) {
    const trenera = posprzataj(wiersz.plan_json);
    const klienta = posprzataj(wiersz.plan_klienta_json);
    if (!trenera.zmiana && !klienta.zmiana) continue;
    zapisz.run(trenera.json, klienta.json, wiersz.trener_id, wiersz.id);
  }
}

/**
 * Wersja 10 — bojem tylko przysiady, martwe ciągi i bench (16.10.2026).
 *
 * Trener: „zostaw jako boje tylko przysiady, martwe ciągi, bench — te mniej
 * oczywiste mogą liczyć się jako akcesoria”. Hip thrust, RDL, push press,
 * podciąganie i dipy z obciążeniem, wykroki… były bojem w A (a przez chwilę,
 * po wersji 9 — wszędzie). „Wpisz progresję” zostawił im liczby boju: serie,
 * powtórzenia i RPE z szablonu boju. Wpisane wygrywają z szablonem, więc
 * akcesorium wyszłoby z powtórzeniami boju.
 *
 * Migracja zdejmuje **tylko trójki identyczne z szablonem boju** dla części
 * planu tego slotu. Ręczne zmiany trenera, oceny i ciężary klienta zostają;
 * „G” trenera — też. Plan trenera i wersja, którą widzi klient.
 */
function doWersji10(d: DatabaseSync): void {
  const plany = d.prepare("SELECT trener_id, id, plan_json, plan_klienta_json FROM plan").all() as
    { trener_id: number; id: string; plan_json: string; plan_klienta_json: string | null }[];
  const zapisz = d.prepare(
    "UPDATE plan SET plan_json = ?, plan_klienta_json = ? WHERE trener_id = ? AND id = ?");

  type Slot = { cwiczenieId?: string | null; bojGlowny?: boolean; bojSilowy?: boolean;
    tygodnie?: Record<string, Record<string, unknown>> };
  const posprzataj = (json: string | null): { json: string | null; zmiana: boolean } => {
    if (!json) return { json, zmiana: false };
    let plan: { czescPlanu?: CzescPlanu; sloty?: Slot[] };
    try { plan = JSON.parse(json); } catch { return { json, zmiana: false }; }
    const czesc = plan.czescPlanu ?? "objętość";
    let zmiana = false;
    for (const slot of plan.sloty ?? []) {
      const c = slot.cwiczenieId ? katalog.poId(slot.cwiczenieId) : undefined;
      if (!c || c.coeff !== 1 || slot.bojGlowny !== undefined) continue;
      if (BOJE.has(c.id) || PAUZOWANE[c.id] || DWUBOJ.has(c.id)) continue;
      const szablon = PROGRESJA_BOJU[czescBoju(czesc, slot.bojSilowy)];
      for (const t of [1, 2, 3, 4, 5, 6] as const) {
        const p = slot.tygodnie?.[t];
        const b = szablon?.[t - 1];
        if (!p || !b) continue;
        if (p.serie === b.serie && p.powtorzenia === b.powtorzenia && p.rpe === b.rpe) {
          delete p.serie;
          delete p.powtorzenia;
          delete p.rpe;
          zmiana = true;
        }
      }
    }
    return { json: zmiana ? JSON.stringify(plan) : json, zmiana };
  };

  for (const wiersz of plany) {
    const trenera = posprzataj(wiersz.plan_json);
    const klienta = posprzataj(wiersz.plan_klienta_json);
    if (!trenera.zmiana && !klienta.zmiana) continue;
    zapisz.run(trenera.json, klienta.json, wiersz.trener_id, wiersz.id);
  }
}

/**
 * Wersja 11 — ćwiczenia dodane przez trenera w konsoli (17.10.2026). Nowa
 * tabela, nic się nie przenosi. Ta sama definicja co w schemacie.
 */
function doWersji11(d: DatabaseSync): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS cwiczenie_wlasne (
      id        TEXT    PRIMARY KEY,
      trener_id INTEGER NOT NULL REFERENCES trener(id) ON DELETE CASCADE,
      dane_json TEXT    NOT NULL,
      utworzone TEXT    NOT NULL,
      zmienione TEXT    NOT NULL
    );
  `);
}

/**
 * Wersja 12 — S/l clean z progresją dwuboju (17.10.2026).
 *
 * Trener: „moje ćwiczenie s/l clean — zrób, żeby progresja w nim przebiegała
 * podobnie jak w zwykłym clean”. Dwubój bierze serie, powtórzenia i procent
 * z własnej tabeli, ale liczby wpisane wcześniej przyciskiem „wpisz
 * progresję”, gdy ćwiczenie liczyło się jak akcesorium (3 serie i RPE
 * akcesorium z tej pozycji), wygrywają z tabelą — wyszłoby „3 × 8 na 70 %”.
 *
 * Zdejmujemy **tylko te liczby automatu** — przy każdym ćwiczeniu dwuboju,
 * bo Clean sprzed 16.10.2026 mógł mieć to samo. Ręczne zmiany trenera, „G”,
 * oceny i ciężary klienta zostają. Plan trenera i wersja, którą widzi klient.
 */
function doWersji12(d: DatabaseSync): void {
  const plany = d.prepare("SELECT trener_id, id, plan_json, plan_klienta_json FROM plan").all() as
    { trener_id: number; id: string; plan_json: string; plan_klienta_json: string | null }[];
  const zapisz = d.prepare(
    "UPDATE plan SET plan_json = ?, plan_klienta_json = ? WHERE trener_id = ? AND id = ?");

  type Slot = { lp?: string; cwiczenieId?: string | null; bojGlowny?: boolean;
    tygodnie?: Record<string, Record<string, unknown>> };
  const posprzataj = (json: string | null): { json: string | null; zmiana: boolean } => {
    if (!json) return { json, zmiana: false };
    let plan: { sloty?: Slot[] };
    try { plan = JSON.parse(json); } catch { return { json, zmiana: false }; }
    let zmiana = false;
    for (const slot of plan.sloty ?? []) {
      if (!slot.cwiczenieId || !DWUBOJ.has(slot.cwiczenieId) || slot.bojGlowny !== undefined) continue;
      for (const t of [1, 2, 3, 4, 5, 6] as const) {
        const p = slot.tygodnie?.[t];
        if (!p || p.powtorzenia !== undefined || p.procent !== undefined) continue;
        const akcesorium = progresjaSlotu(slot.lp ?? "", t);
        if (p.serie === akcesorium.serie && p.rpe === akcesorium.rpe) {
          delete p.serie;
          delete p.rpe;
          zmiana = true;
        }
      }
    }
    return { json: zmiana ? JSON.stringify(plan) : json, zmiana };
  };

  for (const wiersz of plany) {
    const trenera = posprzataj(wiersz.plan_json);
    const klienta = posprzataj(wiersz.plan_klienta_json);
    if (!trenera.zmiana && !klienta.zmiana) continue;
    zapisz.run(trenera.json, klienta.json, wiersz.trener_id, wiersz.id);
  }
}

export const MIGRACJE: readonly Migracja[] = [
  { doWersji: 2, opis: "klient jako osobna encja; stały link i waga przy kliencie", wykonaj: doWersji2 },
  { doWersji: 3, opis: "wykonanie pamięta, które ćwiczenie klient robił", wykonaj: doWersji3 },
  { doWersji: 4, opis: "TOP SET zapisany tam, gdzie był widoczny", wykonaj: doWersji4 },
  { doWersji: 5, opis: "RPE TOP SETU osobno na każdy tydzień", wykonaj: doWersji5 },
  { doWersji: 6, opis: "wykonanie pamięta wszystkie serie, nie tylko najcięższą", wykonaj: doWersji6 },
  { doWersji: 7, opis: "wersja robocza planu — zmiany trenera czekają na zatwierdzenie", wykonaj: doWersji7 },
  { doWersji: 8, opis: "znacznik resetu planu — telefon zaczyna trening od nowa", wykonaj: doWersji8 },
  { doWersji: 9, opis: "boje na każdej pozycji — bez liczb akcesorium", wykonaj: doWersji9 },
  { doWersji: 10, opis: "bojem tylko przysiady, martwe ciągi i bench — reszta bez liczb boju", wykonaj: doWersji10 },
  { doWersji: 11, opis: "własne ćwiczenia trenera", wykonaj: doWersji11 },
  { doWersji: 12, opis: "S/l clean z progresją dwuboju — bez liczb akcesorium", wykonaj: doWersji12 },
];
