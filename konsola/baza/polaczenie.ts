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

const KATALOG = dirname(fileURLToPath(import.meta.url));

/** Ścieżka do pliku bazy. Nadpisywalna, żeby testy nie ruszały prawdziwych danych. */
export const SCIEZKA_BAZY = process.env.BAZA_CRAFTMYPLAN
  ?? join(KATALOG, "..", "dane", "craftmyplan.db");

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

  db.exec(readFileSync(join(KATALOG, "schemat.sql"), "utf-8"));
  zapiszWersje(db);
  return db;
}

/** Aktualna wersja schematu. Podniesienie = nowy plik migracji obok schematu. */
export const WERSJA_SCHEMATU = 1;

function zapiszWersje(d: DatabaseSync): void {
  const wiersz = d.prepare("SELECT MAX(wersja) AS w FROM wersja_schematu").get() as { w: number | null };
  if (wiersz?.w === WERSJA_SCHEMATU) return;
  d.prepare("INSERT INTO wersja_schematu (wersja, wgrana) VALUES (?, ?)")
    .run(WERSJA_SCHEMATU, new Date().toISOString());
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
