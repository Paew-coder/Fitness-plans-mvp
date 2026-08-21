/**
 * Kopie zapasowe bazy — jedno miejsce dla wszystkich, którzy je robią.
 *
 * Dlaczego nie zwykłe skopiowanie pliku: baza chodzi w trybie WAL, więc część
 * świeżych zapisów siedzi w pliku obok głównego. Skopiowanie samego `.db`
 * w trakcie pracy daje plik, który może się nie otworzyć — albo, gorzej,
 * otworzy się bez ostatnich treningów. `backup()` z `node:sqlite` robi to
 * poprawnie na działającej bazie.
 *
 * Kopie robią się **same**, i to jest w tym najważniejsze. Instrukcja
 * wdrożeniowa mówi, żeby uruchomić `npm run kopia` przed aktualizacją; nikt
 * tego nie robi. Trener chodzi na laptopie, w danych ma sześć tygodni pracy
 * każdego klienta, a jedno kliknięcie „Usuń klienta" kasuje to bezpowrotnie.
 */
import { backup, DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SCIEZKA_BAZY } from "./sciezka.ts";

const KATALOG = dirname(fileURLToPath(import.meta.url));

/** Ile kopii zostaje. Baza jednego trenera to setki kilobajtów — miesiąc mieści się bez trudu. */
export const ILE_TRZYMAMY = 30;

export function katalogKopii(): string {
  return process.env.KOPIE_CRAFTMYPLAN ?? join(KATALOG, "..", "dane", "kopie");
}

/**
 * Znacznik czasu w nazwie — z milisekundami, bo dwie kopie zrobione w tej
 * samej sekundzie dostawały tę samą nazwę i druga po cichu nadpisywała pierwszą.
 * Sortowanie po nazwie dalej daje kolejność chronologiczną.
 */
function stempel(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
}

/**
 * Kopia bazy. `etykieta` trafia do nazwy pliku — po to, żeby kopia sprzed
 * migracji dała się odróżnić na pierwszy rzut oka od codziennej.
 */
export async function zrobKopie(etykieta = "", katalog = katalogKopii()): Promise<string | null> {
  if (!existsSync(SCIEZKA_BAZY)) return null;
  mkdirSync(katalog, { recursive: true });

  const nazwa = `craftmyplan-${etykieta ? `${etykieta}-` : ""}${stempel()}.db`;
  const cel = join(katalog, nazwa);

  const zrodlo = new DatabaseSync(SCIEZKA_BAZY, { readOnly: true });
  try {
    await backup(zrodlo, cel);
  } finally {
    zrodlo.close();
  }
  posprzataj(katalog);
  return cel;
}

/** Zostają najnowsze; kopie sprzed migracji przeżywają dłużej niż codzienne. */
export function posprzataj(katalog = katalogKopii()): string[] {
  if (!existsSync(katalog)) return [];
  const wszystkie = readdirSync(katalog)
    .filter((f) => f.startsWith("craftmyplan-") && f.endsWith(".db"))
    .sort()
    .reverse();

  // Kopia sprzed migracji jest tą jedyną, po którą sięga się po nieudanej
  // aktualizacji — a wtedy zwykle minęło już trochę czasu i codzienne dawno
  // by ją wypchnęły. Dlatego liczy się je osobno.
  const przedMigracja = wszystkie.filter((f) => f.includes("-przed-migracja-"));
  const codzienne = wszystkie.filter((f) => !f.includes("-przed-migracja-"));
  const doUsuniecia = [
    ...codzienne.slice(ILE_TRZYMAMY),
    ...przedMigracja.slice(ILE_TRZYMAMY),
  ];
  for (const f of doUsuniecia) unlinkSync(join(katalog, f));
  return doUsuniecia;
}

/**
 * Kopia przed migracją — synchroniczna, bo migracja też jest synchroniczna
 * i dzieje się w środku otwierania bazy. Nie da się tam nic zaczekać.
 *
 * `backup()` z `node:sqlite` jest wyłącznie asynchroniczne, więc idziemy inaczej:
 * `wal_checkpoint(TRUNCATE)` przepisuje wszystko z pliku WAL do głównego,
 * a potem kopiujemy już zwykły plik. Zostaje wąskie okno, w którym inny proces
 * mógłby dopisać coś między jednym a drugim — w instalacji jednoosobowej,
 * przy starcie, jest to praktycznie niemożliwe, a brak kopii przed migracją
 * jest ryzykiem znacznie większym.
 */
export function kopiaPrzedMigracja(d: DatabaseSync, doWersji: number): string | null {
  if (!existsSync(SCIEZKA_BAZY)) return null;
  const katalog = katalogKopii();
  mkdirSync(katalog, { recursive: true });
  const cel = join(katalog, `craftmyplan-przed-migracja-v${doWersji}-${stempel()}.db`);

  d.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  copyFileSync(SCIEZKA_BAZY, cel);
  posprzataj(katalog);
  return cel;
}

/** Wiek najnowszej kopii w godzinach. `null`, gdy nie ma żadnej. */
export function godzinOdOstatniej(katalog = katalogKopii()): number | null {
  if (!existsSync(katalog)) return null;
  const kopie = readdirSync(katalog)
    .filter((f) => f.startsWith("craftmyplan-") && f.endsWith(".db"))
    .map((f) => statSync(join(katalog, f)).mtimeMs);
  if (kopie.length === 0) return null;
  return (Date.now() - Math.max(...kopie)) / 3_600_000;
}

/**
 * Kopia, o ile od ostatniej minęło dość czasu. Wywoływane przy starcie serwera
 * i raz na dobę w trakcie — żeby trener nie musiał o niczym pamiętać.
 */
export async function kopiaJesliTrzeba(odstepGodzin = 24): Promise<string | null> {
  const wiek = godzinOdOstatniej();
  if (wiek !== null && wiek < odstepGodzin) return null;
  return await zrobKopie();
}
