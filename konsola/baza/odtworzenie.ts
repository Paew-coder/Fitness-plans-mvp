/**
 * Odtworzenie bazy z kopii zapasowej.
 *
 * Kopie robią się same, raz na dobę i przed każdą migracją. Ale kopia, której
 * nikt nigdy nie odtworzył, nie jest kopią zapasową — jest plikiem, o którym
 * się myśli, że nią jest. Ten plik zamyka tę lukę.
 *
 * ## Dlaczego nie wystarczy skopiować pliku
 *
 * Baza chodzi w trybie WAL: świeże zapisy siedzą w pliku `craftmyplan.db-wal`
 * obok głównego, a do głównego trafiają dopiero przy domknięciu bazy. Gdy
 * konsola zostanie ubita — `docker compose stop`, zamknięte okno terminala,
 * uśpiony laptop — plik WAL zostaje na dysku, a sam `.db` bywa **pusty**.
 *
 * Instrukcja mówiła dotąd: zatrzymaj konsolę, skopiuj kopię na miejsce bazy,
 * uruchom. To po cichu nie robi nic. SQLite przy otwarciu dokleja zostawiony
 * WAL do świeżo wgranego pliku i pokazuje **z powrotem stare dane** — te,
 * przed którymi się uciekało. Sprawdzone: po takim odtworzeniu w bazie stoi
 * zawartość sprzed odtworzenia, bez jednego słowa ostrzeżenia.
 *
 * A gdy kopia pochodzi z innego momentu niż zostawiony WAL — czyli zawsze —
 * doklejane strony trafiają w plik, do którego nie należą. Wtedy to już nie
 * jest „nic się nie stało", tylko uszkodzona baza.
 *
 * Stąd trzy rzeczy, których nie da się pominąć: **skasować pliki obok**,
 * **sprawdzić kopię, zanim cokolwiek nadpiszemy**, i **odłożyć obecną bazę**,
 * bo najczęstszym błędem przy odtwarzaniu jest sięgnięcie po niewłaściwą kopię.
 */
import { backup, DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

import { katalogKopii } from "./kopie.ts";
import { SCIEZKA_BAZY } from "./sciezka.ts";

/** Awaria, za którą odpowiada plik albo stan na dysku, a nie kod. */
export class BladOdtworzenia extends Error {}

/** Pliki, które SQLite trzyma obok bazy. Przy odtwarzaniu muszą zniknąć. */
export const PLIKI_OBOK = ["-wal", "-shm"] as const;

/**
 * Otwiera plik do odczytu i **sprząta po sobie**.
 *
 * Samo zajrzenie do bazy w trybie WAL zakłada obok niej `-shm`, czasem `-wal`.
 * Przy kopiach zapasowych to nie jest drobiazg: takie pliki zostawały obok
 * każdej przejrzanej kopii, a `posprzataj()` ich nie widzi, bo filtruje po
 * `.db` — więc rosły bez końca i zostawały nawet po skasowaniu samej kopii.
 * Kasujemy wyłącznie te, których przed zajrzeniem nie było.
 */
function przejrzyj<T>(sciezka: string, co: (d: DatabaseSync) => T): T {
  const byly = PLIKI_OBOK.filter((k) => existsSync(sciezka + k));
  const d = new DatabaseSync(sciezka, { readOnly: true });
  try {
    return co(d);
  } finally {
    d.close();
    for (const koncowka of PLIKI_OBOK) {
      if (!byly.includes(koncowka) && existsSync(sciezka + koncowka)) {
        unlinkSync(sciezka + koncowka);
      }
    }
  }
}

export type OpisBazy = {
  klientow: number;
  planow: number;
  wykonan: number;
  ostatniaZmiana: string | null;
  wersja: number | null;
};

/**
 * Co jest w środku pliku. Otwieramy **tylko do odczytu**: samo zajrzenie do
 * kopii nie może jej zmienić ani założyć obok niej plików WAL.
 */
export function opisz(sciezka: string): OpisBazy {
  return przejrzyj(sciezka, (d) => {
    const licz = (tabela: string): number => {
      try {
        return (d.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }).n;
      } catch {
        return 0;   // tabela z młodszego schematu — brak jej to nie awaria
      }
    };
    let ostatniaZmiana: string | null = null;
    try {
      ostatniaZmiana = (d.prepare(
        "SELECT MAX(zmieniony) AS z FROM plan").get() as { z: string | null }).z;
    } catch { /* jak wyżej */ }
    let wersja: number | null = null;
    try {
      wersja = (d.prepare(
        "SELECT MAX(wersja) AS w FROM wersja_schematu").get() as { w: number | null }).w;
    } catch { /* baza sprzed wersjonowania */ }

    return {
      klientow: licz("klient"),
      planow: licz("plan"),
      wykonan: licz("wykonanie"),
      ostatniaZmiana,
      wersja,
    };
  });
}

/**
 * Czy z tego pliku da się odtworzyć bazę. Zdanie po polsku albo `null`.
 *
 * Kolejność pytań jest tu ważniejsza od ich treści: **pytamy, zanim cokolwiek
 * nadpiszemy**. Wgranie uszkodzonej kopii na miejsce działającej bazy jest
 * gorszym wynikiem niż nieudane odtworzenie.
 */
export function bladKopii(sciezka: string): string | null {
  if (!existsSync(sciezka)) return "Nie ma takiego pliku";
  if (statSync(sciezka).size === 0) return "Plik jest pusty";

  try {
    return przejrzyj(sciezka, (d) => {
      const wynik = d.prepare("PRAGMA integrity_check").get() as Record<string, string>;
      const odpowiedz = Object.values(wynik)[0];
      if (odpowiedz !== "ok") return `Kopia jest uszkodzona (${odpowiedz})`;

      const tabele = new Set((d.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
        .map((t) => t.name));
      for (const wymagana of ["klient", "plan"]) {
        if (!tabele.has(wymagana)) {
          return "To nie jest baza CraftMyPlan — nie ma w niej tabel z planami";
        }
      }
      return null;
    });
  } catch {
    // SQLite czyta nagłówek dopiero przy pierwszym pytaniu, więc plik, który
    // bazą nie jest, otwiera się bez protestu i wykłada się dopiero tutaj.
    return "Tego pliku nie da się otworzyć jako bazy";
  }
}

export type Kopia = {
  plik: string;
  sciezka: string;
  kiedy: Date;
  bajtow: number;
  opis: OpisBazy | null;
  blad: string | null;
};

/** Kopie z katalogu, od najnowszej. Każda od razu przejrzana — patrz niżej. */
export function listaKopii(katalog = katalogKopii()): Kopia[] {
  if (!existsSync(katalog)) return [];
  return readdirSync(katalog)
    .filter((f) => f.startsWith("craftmyplan-") && f.endsWith(".db"))
    .sort()
    .reverse()
    .map((plik) => {
      const sciezka = join(katalog, plik);
      // Zawartość, a nie tylko nazwa. Wybór między `craftmyplan-2026-08-19…`
      // a `craftmyplan-2026-08-20…` po samej nazwie to zgadywanie; wybór
      // między „12 klientów, 41 planów" a „12 klientów, 39 planów" to decyzja.
      const blad = bladKopii(sciezka);
      return {
        plik, sciezka,
        kiedy: statSync(sciezka).mtime,
        bajtow: statSync(sciezka).size,
        opis: blad ? null : opisz(sciezka),
        blad,
      };
    });
}

/**
 * Odkłada obecną bazę na bok, zanim zostanie nadpisana.
 *
 * To nie jest ostrożność na wszelki wypadek: najczęstszy błąd przy odtwarzaniu
 * to sięgnięcie po niewłaściwą kopię, a wtedy jedyne, czego się szuka, to
 * powrót do stanu sprzed pomyłki.
 *
 * Idzie przez `backup()`, więc zostawiony plik WAL wchodzi do środka — inaczej
 * odłożona baza byłaby dokładnie tym pustym plikiem, przez który ten kod
 * w ogóle powstał.
 */
export async function odlozObecna(
  katalog = katalogKopii(), zBazy = SCIEZKA_BAZY,
): Promise<string | null> {
  if (!existsSync(zBazy)) return null;
  mkdirSync(katalog, { recursive: true });
  const stempel = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
  const cel = join(katalog, `craftmyplan-przed-odtworzeniem-${stempel}.db`);

  /**
   * Ratunkowe odłożenie: surowe pliki, razem z tymi obok. Wchodzi w grę, gdy
   * bazy nie da się nawet otworzyć — czyli dokładnie w ten dzień, w którym
   * ktoś sięga po kopię. Wtedy „cokolwiek do oglądania" jest warte więcej
   * niż porządny plik, którego nie ma.
   */
  const surowo = () => {
    for (const koncowka of ["", ...PLIKI_OBOK]) {
      if (existsSync(zBazy + koncowka)) copyFileSync(zBazy + koncowka, cel + koncowka);
    }
  };

  let zrodlo: DatabaseSync;
  try {
    zrodlo = new DatabaseSync(zBazy, { readOnly: true });
  } catch {
    surowo();
    return cel;
  }
  try {
    await backup(zrodlo, cel);
  } catch {
    surowo();
  } finally {
    zrodlo.close();
  }
  return cel;
}

/** Kasuje pliki, które SQLite trzyma obok bazy. Zwraca końcówki tych, które były. */
export function usunPlikiObok(bazaSciezka = SCIEZKA_BAZY): string[] {
  const usuniete: string[] = [];
  for (const koncowka of PLIKI_OBOK) {
    if (existsSync(bazaSciezka + koncowka)) {
      unlinkSync(bazaSciezka + koncowka);
      usuniete.push(koncowka);
    }
  }
  return usuniete;
}

export type WynikOdtworzenia = {
  odlozona: string | null;
  usunieteObok: string[];
  opis: OpisBazy;
};

/**
 * Właściwe odtworzenie. Rzuca `BladOdtworzenia` wszędzie tam, gdzie coś jest
 * nie tak z plikiem — i robi to **przed** dotknięciem obecnej bazy.
 */
export async function odtworz(zKopii: string, doBazy = SCIEZKA_BAZY): Promise<WynikOdtworzenia> {
  const blad = bladKopii(zKopii);
  if (blad) throw new BladOdtworzenia(blad);

  const odlozona = await odlozObecna(katalogKopii(), doBazy);

  mkdirSync(dirname(doBazy), { recursive: true });
  copyFileSync(zKopii, doBazy);

  // Sedno całej sprawy. Zostawione tutaj, zostałyby doklejone do świeżo
  // wgranego pliku przy pierwszym otwarciu — i odtworzenie nie odtworzyłoby nic.
  const usunieteObok = usunPlikiObok(doBazy);

  // Sprawdzenie po fakcie: czy w bazie stoi to, co było w kopii. Bez tego
  // „odtworzone" znaczyłoby tylko „plik został skopiowany".
  const opis = opisz(doBazy);
  const wKopii = opisz(zKopii);
  if (opis.planow !== wKopii.planow || opis.klientow !== wKopii.klientow) {
    throw new BladOdtworzenia(
      `Po odtworzeniu baza nie zgadza się z kopią (${opis.planow} planów zamiast ${wKopii.planow}). `
      + `Poprzednia baza leży w ${odlozona ?? "kopiach"}.`);
  }
  // Ostatnie słowo należy do tego wywołania: katalog po odtworzeniu ma
  // wyglądać dokładnie tak, jak mówi wypisany komunikat — bez plików obok.
  usunPlikiObok(doBazy);

  return { odlozona, usunieteObok, opis };
}
