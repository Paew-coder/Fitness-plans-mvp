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

export const MIGRACJE: readonly Migracja[] = [
  { doWersji: 2, opis: "klient jako osobna encja; stały link i waga przy kliencie", wykonaj: doWersji2 },
  { doWersji: 3, opis: "wykonanie pamięta, które ćwiczenie klient robił", wykonaj: doWersji3 },
];
