/**
 * Połączenie z bazą — jeden plik SQLite obok konsoli.
 *
 * `node:sqlite` jest wbudowane w Node 22, więc dalej zero zależności i zero
 * instalowania czegokolwiek. Ta sama baza chodzi na laptopie trenera i na
 * serwerze; przeniesienie to skopiowanie jednego pliku.
 *
 * Gdy kiedyś trzeba będzie Postgresa (wielu trenerów, kopie zapasowe w chmurze),
 * schemat przeniesie się prawie bez zmian — dlatego trzymamy się zwykłego SQL
 * bez sztuczek specyficznych dla SQLite.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MIGRACJE, tabelaIstnieje } from "./migracje.ts";
import { kopiaPrzedMigracja } from "./kopie.ts";
import { SCIEZKA_BAZY } from "./sciezka.ts";

const KATALOG = dirname(fileURLToPath(import.meta.url));

export { SCIEZKA_BAZY };

let db: DatabaseSync | null = null;

export function baza(): DatabaseSync {
  if (db) return db;

  mkdirSync(dirname(SCIEZKA_BAZY), { recursive: true });
  db = new DatabaseSync(SCIEZKA_BAZY);

  // Klucze obce w SQLite są domyślnie wyłączone — bez tego kaskadowe usuwanie
  // planu zostawiłoby osierocone wykonania.
  db.exec("PRAGMA foreign_keys = ON");
  // WAL: czytanie nie blokuje pisania. Ma znaczenie, gdy klient odhacza
  // trening w tej samej chwili, gdy trener przegląda listę.
  db.exec("PRAGMA journal_mode = WAL");

  // Czy to pierwszy start na tym pliku. Sprawdzamy PRZED wykonaniem schematu,
  // bo zaraz potem wszystkie tabele już będą istniały i pytanie straci sens.
  const swiezaBaza = !tabelaIstnieje(db, "plan");

  // Podział ról jest ostry i celowy: `schemat.sql` opisuje bazę docelową
  // i zakłada ją od zera, migracje doprowadzają do niej bazę istniejącą.
  // Gdyby jedno i drugie działało na tym samym pliku, kolejność zaczęłaby
  // mieć znaczenie — a wtedy prędzej czy później coś by się o nią potknęło.
  if (swiezaBaza) {
    db.exec(readFileSync(join(KATALOG, "schemat.sql"), "utf-8"));
    zapiszWersje(db, WERSJA_SCHEMATU);
  } else {
    migruj(db);
  }

  return db;
}

/** Aktualna wersja schematu. Podniesienie = nowa pozycja w `migracje.ts`. */
export const WERSJA_SCHEMATU = 2;

function wersjaBazy(d: DatabaseSync): number {
  // Baza sprzed wprowadzenia wersjonowania nie ma nawet tej tabeli — a nie
  // mając jej, samo pytanie o wersję wywalało konsolę przy starcie, zanim
  // jakakolwiek migracja zdążyła się wykonać. Aplikacja nie wstawała wcale,
  // z komunikatem o SQL-u, na bazie pełnej danych. Taka baza to wersja 1:
  // zakładamy tabelę i zwykłą drogą doprowadzamy plik do aktualnego schematu.
  if (!tabelaIstnieje(d, "wersja_schematu")) {
    d.exec(`CREATE TABLE wersja_schematu (
      wersja  INTEGER NOT NULL,
      wgrana  TEXT    NOT NULL
    )`);
    return 1;
  }

  const wiersz = d.prepare("SELECT MAX(wersja) AS w FROM wersja_schematu").get() as { w: number | null };
  // Tabela jest, ale pusta — też wersja 1, tylko zapisana inaczej.
  return wiersz?.w ?? 1;
}

function zapiszWersje(d: DatabaseSync, wersja: number): void {
  d.prepare("INSERT INTO wersja_schematu (wersja, wgrana) VALUES (?, ?)")
    .run(wersja, new Date().toISOString());
}

/**
 * Doprowadza istniejącą bazę do aktualnego schematu.
 *
 * Każda migracja idzie w swojej transakcji, z kluczami obcymi wyłączonymi na
 * czas przepisywania tabel (SQLite inaczej nie pozwala podmienić tabeli, do
 * której ktoś się odwołuje). Na końcu `foreign_key_check` — gdyby przepisanie
 * osierociło choć jeden wiersz, zobaczymy to tu, a nie za miesiąc.
 */
export function migruj(d: DatabaseSync): void {
  let wersja = wersjaBazy(d);
  for (const migracja of MIGRACJE) {
    if (migracja.doWersji <= wersja) continue;

    console.log(`  Migracja bazy → wersja ${migracja.doWersji}: ${migracja.opis}`);

    // Kopia przed każdą migracją. Instrukcja mówi, żeby zrobić ją ręcznie
    // przed aktualizacją; nikt tego nie robi, a to jedyny moment, w którym
    // aplikacja przepisuje cudze dane. Gdy coś pójdzie nie tak, jest do czego wrócić.
    const kopia = kopiaPrzedMigracja(d, migracja.doWersji);
    if (kopia) console.log(`  Kopia przed migracją: ${kopia}`);

    d.exec("PRAGMA foreign_keys = OFF");
    d.exec("BEGIN");
    try {
      migracja.wykonaj(d);
      zapiszWersje(d, migracja.doWersji);
      d.exec("COMMIT");
    } catch (blad) {
      d.exec("ROLLBACK");
      d.exec("PRAGMA foreign_keys = ON");
      throw blad;
    }
    d.exec("PRAGMA foreign_keys = ON");

    const osierocone = d.prepare("PRAGMA foreign_key_check").all();
    if (osierocone.length > 0) {
      throw new Error(
        `Migracja do wersji ${migracja.doWersji} zostawiła ${osierocone.length} osieroconych wierszy.`,
      );
    }
    wersja = migracja.doWersji;
  }
}

/** Zamyka bazę. Potrzebne w testach; serwer trzyma połączenie do końca życia. */
export function zamknij(): void {
  db?.close();
  db = null;
}

/**
 * Trener, do którego należą dane w instalacji jednoosobowej.
 *
 * Dopóki konsola chodzi u jednego trenera, nie ma sensu zmuszać go do
 * zakładania konta. Rekord i tak powstaje, więc gdy dojdą kolejni trenerzy,
 * jego dane już mają właściciela — nie trzeba niczego przenosić.
 */
export function trenerDomyslny(): number {
  const d = baza();
  const istniejacy = d.prepare("SELECT id FROM trener ORDER BY id LIMIT 1").get() as { id: number } | undefined;
  if (istniejacy) return istniejacy.id;

  const wynik = d.prepare(
    "INSERT INTO trener (email, nazwa, hash_hasla, utworzony) VALUES (?, ?, NULL, ?)",
  ).run("trener@localhost", "Trener", new Date().toISOString());
  return Number(wynik.lastInsertRowid);
}
