/**
 * Migracja bazy z wersji 1 do 2 — na prawdziwej starej bazie.
 *
 * Test buduje bazę w starym schemacie (klient jako kolumna tekstowa, token
 * i waga przy planie), wypełnia ją danymi i otwiera normalnym kodem konsoli.
 * Sprawdzamy to, co przy migracji naprawdę może zniknąć: plany, wpisy klienta,
 * wagę z kilku cykli i — najważniejsze — link, który klient ma już w telefonie.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KATALOG = mkdtempSync(join(tmpdir(), "migracja-test-"));
const PLIK = join(KATALOG, "stara.db");
process.env.BAZA_CRAFTMYPLAN = PLIK;

/**
 * Schemat sprzed wprowadzenia encji klienta — dokładnie taki, jaki był.
 *
 * Nie ma tu tabeli `wersja_schematu` i to jest celowe: instalacja sprzed
 * wersjonowania jej nie miała. Konsola musi sobie z tym poradzić sama, bo
 * inaczej nie wstaje w ogóle — na bazie pełnej danych, z komunikatem o SQL-u.
 */
const SCHEMAT_V1 = `
CREATE TABLE trener (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, nazwa TEXT NOT NULL,
  hash_hasla TEXT, utworzony TEXT NOT NULL
);
CREATE TABLE sesja (
  token TEXT PRIMARY KEY, trener_id INTEGER NOT NULL REFERENCES trener(id) ON DELETE CASCADE,
  utworzona TEXT NOT NULL, wygasa TEXT NOT NULL
);
CREATE TABLE plan (
  trener_id INTEGER NOT NULL REFERENCES trener(id) ON DELETE CASCADE,
  id TEXT NOT NULL, klient TEXT NOT NULL, wersja INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('szkic', 'wysłany', 'zakończony')),
  data_startu TEXT, utworzony TEXT NOT NULL, zmieniony TEXT NOT NULL,
  poprzedni_id TEXT, token TEXT UNIQUE,
  oddech_json TEXT, bieg_json TEXT, plan_json TEXT NOT NULL,
  PRIMARY KEY (trener_id, id)
);
CREATE TABLE wykonanie (
  trener_id INTEGER NOT NULL, plan_id TEXT NOT NULL, position_id TEXT NOT NULL,
  tydzien INTEGER NOT NULL, data TEXT NOT NULL, ciezar_wykonany REAL,
  powtorzenia_wykonane INTEGER, feedback TEXT,
  PRIMARY KEY (trener_id, plan_id, position_id, tydzien),
  FOREIGN KEY (trener_id, plan_id) REFERENCES plan(trener_id, id) ON DELETE CASCADE
);
CREATE TABLE ukonczony_dzien (
  trener_id INTEGER NOT NULL, plan_id TEXT NOT NULL, tydzien INTEGER NOT NULL,
  dzien INTEGER NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (trener_id, plan_id, tydzien, dzien),
  FOREIGN KEY (trener_id, plan_id) REFERENCES plan(trener_id, id) ON DELETE CASCADE
);
CREATE TABLE pomiar_wagi (
  trener_id INTEGER NOT NULL, plan_id TEXT NOT NULL, data TEXT NOT NULL, kg REAL NOT NULL,
  PRIMARY KEY (trener_id, plan_id, data),
  FOREIGN KEY (trener_id, plan_id) REFERENCES plan(trener_id, id) ON DELETE CASCADE
);
`;

const TOKEN_STARY_CYKL = "token-cyklu-trzeciego-1234";
const TOKEN_AKTUALNY = "token-cyklu-czwartego-5678";

/** Buduje bazę w starym kształcie i wypełnia ją tak, jak wyglądałaby u trenera. */
function zbudujStaraBaze(): void {
  const d = new DatabaseSync(PLIK);
  d.exec("PRAGMA foreign_keys = ON");
  d.exec(SCHEMAT_V1);
  d.prepare("INSERT INTO trener (id, email, nazwa, utworzony) VALUES (1, 'trener@localhost', 'Trener', '2026-01-01T00:00:00.000Z')").run();

  const plan = JSON.stringify({ nazwa: "x", sloty: [], serieMaksymalne: [], topSety: [] });
  const wstaw = d.prepare(`
    INSERT INTO plan (trener_id, id, klient, wersja, status, data_startu, utworzony, zmieniony, poprzedni_id, token, plan_json)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Dwa cykle tej samej osoby — z drobną różnicą w zapisie nazwy, jak w życiu.
  wstaw.run("zuzanna-c-3", "Zuzanna C", 3, "zakończony", "2026-05-01",
    "2026-04-20T09:00:00.000Z", "2026-06-15T09:00:00.000Z", null, TOKEN_STARY_CYKL, plan);
  wstaw.run("zuzanna-c-4", "zuzanna c.", 4, "wysłany", "2026-06-20",
    "2026-06-16T09:00:00.000Z", "2026-07-01T09:00:00.000Z", "zuzanna-c-3", TOKEN_AKTUALNY, plan);
  wstaw.run("maciek-tabakowski-1", "Maciek Tabakowski", 1, "szkic", null,
    "2026-07-02T09:00:00.000Z", "2026-07-02T09:00:00.000Z", null, null, plan);

  d.prepare("INSERT INTO wykonanie VALUES (1, 'zuzanna-c-4', 'D1-S01', 2, '2026-06-28T10:00:00.000Z', 62.5, 8, 'za trudne')").run();
  d.prepare("INSERT INTO ukonczony_dzien VALUES (1, 'zuzanna-c-4', 2, 1, '2026-06-28T10:30:00.000Z')").run();

  // Waga w dwóch cyklach — po migracji ma być jedną historią.
  const wstawWage = d.prepare("INSERT INTO pomiar_wagi VALUES (1, ?, ?, ?)");
  wstawWage.run("zuzanna-c-3", "2026-05-04", 61.2);
  wstawWage.run("zuzanna-c-3", "2026-06-01", 60.4);
  wstawWage.run("zuzanna-c-4", "2026-06-22", 60.1);
  wstawWage.run("zuzanna-c-4", "2026-07-01", 59.8);
  d.close();
}

let magazyn: typeof import("../magazyn.ts");
let polaczenie: typeof import("../baza/polaczenie.ts");

before(async () => {
  zbudujStaraBaze();
  magazyn = await import("../magazyn.ts");
  polaczenie = await import("../baza/polaczenie.ts");
  polaczenie.baza();   // to tutaj wykonuje się migracja
});

after(() => {
  polaczenie.zamknij();
  rmSync(KATALOG, { recursive: true, force: true });
  delete process.env.BAZA_CRAFTMYPLAN;
});

describe("migracja v1 → v2", () => {
  test("baza podnosi wersję", () => {
    const { w } = polaczenie.baza().prepare("SELECT MAX(wersja) AS w FROM wersja_schematu").get() as { w: number };
    assert.equal(w, polaczenie.WERSJA_SCHEMATU);
    assert.equal(w, 2);
  });

  test("z nazw w planach powstali klienci", () => {
    const klienci = magazyn.listaKlientow(1);
    assert.deepEqual(klienci.map((k) => k.id).sort(), ["maciek-tabakowski", "zuzanna-c"]);
    // Nazwa bierze się z najświeższego planu — tam trener wpisał ją ostatnio.
    assert.equal(klienci.find((k) => k.id === "zuzanna-c")!.nazwa, "zuzanna c.");
  });

  test("link, który klient ma w telefonie, dalej działa", () => {
    const k = magazyn.klientPoTokenie(TOKEN_AKTUALNY);
    assert.ok(k, "token z najnowszego planu musi przejść na klienta");
    assert.equal(k!.id, "zuzanna-c");
  });

  test("token przeszedł na klienta, więc prowadzi do aktualnego cyklu", () => {
    const k = magazyn.klientPoTokenie(TOKEN_AKTUALNY)!;
    const plan = magazyn.aktywnyPlan(k.trenerId, k.id);
    assert.equal(plan!.id, "zuzanna-c-4", "wysłany wygrywa z zakończonym");
    assert.equal(plan!.wersja, 4);
  });

  test("plany trzymają się swoich klientów", () => {
    const cykle = magazyn.planyKlienta(1, "zuzanna-c");
    assert.deepEqual(cykle.map((p) => p.id), ["zuzanna-c-3", "zuzanna-c-4"]);
    assert.equal(magazyn.lista(1).length, 3, "żaden plan nie zginął");
  });

  test("waga z dwóch cykli to jedna historia", () => {
    const waga = magazyn.wagaKlienta(1, "zuzanna-c");
    assert.deepEqual(waga.map((w) => w.data),
      ["2026-05-04", "2026-06-01", "2026-06-22", "2026-07-01"]);
    assert.equal(waga.at(-1)!.kg, 59.8);
  });

  test("wpisy klienta przetrwały przepisanie tabeli planów", () => {
    const plan = magazyn.wczytaj(1, "zuzanna-c-4")!;
    assert.equal(plan.wykonania!.length, 1);
    assert.equal(plan.wykonania![0]!.ciezarWykonany, 62.5);
    assert.deepEqual(plan.ukonczoneDni, [{ dzien: 1, tydzien: 2, data: "2026-06-28T10:30:00.000Z" }]);
    assert.equal(plan.poprzedniId, "zuzanna-c-3", "łańcuch cykli zostaje");
  });

  test("po migracji nie ma osieroconych wierszy", () => {
    const osierocone = polaczenie.baza().prepare("PRAGMA foreign_key_check").all();
    assert.deepEqual(osierocone, []);
  });

  test("kolumna token zniknęła z planów — jedno źródło prawdy", () => {
    const kolumny = (polaczenie.baza().prepare("PRAGMA table_info(plan)").all() as { name: string }[])
      .map((k) => k.name);
    assert.ok(kolumny.includes("klient_id"));
    assert.ok(!kolumny.includes("token"));
  });

  test("ponowne otwarcie bazy niczego nie migruje drugi raz", () => {
    polaczenie.migruj(polaczenie.baza());
    const wersje = polaczenie.baza().prepare("SELECT COUNT(*) AS c FROM wersja_schematu").get() as { c: number };
    assert.equal(wersje.c, 1, "jeden wpis wersji, nie dwa");
    assert.equal(magazyn.listaKlientow(1).length, 2);
  });
});
