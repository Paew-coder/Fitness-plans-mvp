/**
 * Odtworzenie bazy z kopii — czyli sprawdzenie, czy kopie zapasowe są kopiami.
 *
 * Kopie robią się same i są sprawdzone (`kopie.test.ts`). Ale kopia zapasowa
 * nie jest plikiem — jest **obietnicą, że da się wrócić**. Dopóki nikt tej
 * drogi nie przeszedł, obietnica jest niesprawdzona.
 *
 * A droga opisana dotąd w WDROZENIE.md — „zatrzymaj konsolę, skopiuj kopię
 * na miejsce bazy, uruchom" — po cichu nie robiła nic. Baza chodzi w trybie
 * WAL: świeże zapisy siedzą w pliku obok, a nadpisanie samego `.db` zostawia
 * ten plik na dysku. SQLite dokleja go przy pierwszym otwarciu i pokazuje
 * z powrotem **dane sprzed odtworzenia**. Sprawdzone na prawdziwej bazie:
 * po takim „odtworzeniu" w środku stał dokładnie ten plan, przed którym się
 * uciekało.
 *
 * Ten test chodzi tą samą drogą co trener w najgorszym dniu: konsola ubita
 * bez domknięcia bazy (zamknięte okno, `docker compose stop`, uśpiony laptop),
 * plik WAL na dysku, kopia sprzed pomyłki w ręku.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const KATALOG = mkdtempSync(join(tmpdir(), "przywroc-test-"));
const KOPIE = join(KATALOG, "kopie");
process.env.BAZA_CRAFTMYPLAN = join(KATALOG, "craftmyplan.db");
process.env.KOPIE_CRAFTMYPLAN = KOPIE;
const BAZA = process.env.BAZA_CRAFTMYPLAN;

const magazyn = await import("../magazyn.ts");
const { baza, trenerDomyslny, zamknij } = await import("../baza/polaczenie.ts");
const { zrobKopie } = await import("../baza/kopie.ts");
const o = await import("../baza/odtworzenie.ts");
const slad = await import("../baza/slad-pracy.ts");

/** Plan w bazie — przez zwykłą drogę zapisu, nie przez ręczny SQL. */
function dodajPlan(klient: string, wersja: number): void {
  const trenerId = trenerDomyslny();
  const osoba = magazyn.zapewnijKlienta(trenerId, klient);
  magazyn.zapisz({
    id: magazyn.nowyId(klient, wersja), trenerId, klientId: osoba.id, klient: osoba.nazwa,
    wersja, status: "szkic", dataStartu: null, utworzony: "", zmieniony: "",
    plan: magazyn.pustyPlan(osoba.nazwa),
  });
}

/** Identyfikatory planów widziane w pliku — czytane na świeżo, z dysku. */
function planyW(sciezka: string): string[] {
  const d = new DatabaseSync(sciezka, { readOnly: true });
  try {
    return (d.prepare("SELECT id FROM plan ORDER BY id").all() as { id: string }[])
      .map((r) => r.id);
  } finally {
    d.close();
  }
}

/**
 * Zapis, po którym plik WAL zostaje na dysku.
 *
 * Robi to osobny proces ubity bez domknięcia bazy, bo tylko tak powstaje stan,
 * o który tu chodzi: domknięta baza sama przepisuje WAL do głównego pliku
 * i kasuje go za sobą. Trener dochodzi do tego stanu za każdym razem, gdy
 * zamknie okno terminala zamiast nacisnąć Ctrl+C.
 */
async function zapiszIUbij(klient: string, wersja: number): Promise<void> {
  const kod = `
    const m = await import("./magazyn.ts");
    const p = await import("./baza/polaczenie.ts");
    const t = p.trenerDomyslny();
    const o = m.zapewnijKlienta(t, ${JSON.stringify(klient)});
    m.zapisz({ id: m.nowyId(${JSON.stringify(klient)}, ${wersja}), trenerId: t,
      klientId: o.id, klient: o.nazwa, wersja: ${wersja}, status: "szkic",
      dataStartu: null, utworzony: "", zmieniony: "", plan: m.pustyPlan(o.nazwa) });
    console.log("gotowe");
    await new Promise(() => {});   // bazy nie domykamy — o to chodzi
  `;
  const dziecko = spawn(process.execPath, ["--no-warnings", "--input-type=module", "-e", kod],
    { cwd: KONSOLA, env: process.env, stdio: ["ignore", "pipe", "pipe"] });

  await new Promise<void>((gotowe, blad) => {
    dziecko.stdout.on("data", (b) => { if (String(b).includes("gotowe")) gotowe(); });
    dziecko.on("exit", (kodWyjscia) =>
      blad(new Error(`proces zapisujący padł (${kodWyjscia})`)));
  });
  dziecko.kill("SIGKILL");
  await new Promise((r) => dziecko.on("close", r));
}

before(() => { baza().exec("SELECT 1"); });
after(() => {
  zamknij();
  rmSync(KATALOG, { recursive: true, force: true });
});
beforeEach(() => {
  zamknij();
  for (const koncowka of ["", "-wal", "-shm"]) rmSync(BAZA + koncowka, { force: true });
  rmSync(KOPIE, { recursive: true, force: true });
  mkdirSync(KOPIE, { recursive: true });
  baza().exec("SELECT 1");
});

describe("droga, dla której to powstało", () => {
  test("zostawiony plik WAL nie przywraca danych sprzed odtworzenia", async () => {
    dodajPlan("Anna K", 1);
    const kopia = (await zrobKopie())!;
    zamknij();

    // Konsola dopisuje plan i zostaje ubita — WAL zostaje na dysku.
    await zapiszIUbij("Pomylka XX", 1);
    assert.ok(existsSync(`${BAZA}-wal`), "test nie odtworzył stanu, o który chodzi");
    assert.deepEqual(planyW(BAZA), ["anna-k-1", "pomylka-xx-1"]);

    await o.odtworz(kopia);

    // Sedno: „pomylka-xx-1" ma zniknąć. Przy zwykłym skopiowaniu pliku zostaje.
    assert.deepEqual(planyW(BAZA), ["anna-k-1"]);
  });

  test("po odtworzeniu nie zostają pliki obok bazy", async () => {
    dodajPlan("Anna K", 1);
    const kopia = (await zrobKopie())!;
    zamknij();
    await zapiszIUbij("Pomylka XX", 1);

    const wynik = await o.odtworz(kopia);
    assert.deepEqual(wynik.usunieteObok, ["-wal", "-shm"]);
    for (const koncowka of o.PLIKI_OBOK) {
      assert.ok(!existsSync(BAZA + koncowka), `został ${koncowka}`);
    }
  });

  test("obecna baza zostaje odłożona — razem z tym, co siedziało w WAL", async () => {
    dodajPlan("Anna K", 1);
    const kopia = (await zrobKopie())!;
    zamknij();
    await zapiszIUbij("Pomylka XX", 1);

    const wynik = await o.odtworz(kopia);
    assert.ok(wynik.odlozona, "nic nie odłożono");

    // Gdyby odkładanie szło zwykłym kopiowaniem pliku, byłby tu plik prawie
    // pusty — bo wszystko świeże siedzi w WAL. A to jest jedyny ratunek,
    // gdy odtworzenie poszło z niewłaściwej kopii.
    assert.deepEqual(planyW(wynik.odlozona!), ["anna-k-1", "pomylka-xx-1"]);
  });
});

describe("czego nie wolno wgrać na miejsce bazy", () => {
  const przypadki: [string, () => string][] = [
    ["pliku, którego nie ma", () => join(KATALOG, "nie-ma-mnie.db")],
    ["pustego pliku", () => {
      const p = join(KATALOG, "pusty.db");
      writeFileSync(p, "");
      return p;
    }],
    ["czegoś, co bazą nie jest", () => {
      const p = join(KATALOG, "notatka.db");
      writeFileSync(p, "to jest zwykły tekst, nie baza\n".repeat(50));
      return p;
    }],
    ["cudzej bazy SQLite", () => {
      const p = join(KATALOG, "obca.db");
      const d = new DatabaseSync(p);
      d.exec("CREATE TABLE cokolwiek (a TEXT)");
      d.close();
      return p;
    }],
  ];

  for (const [co, zrob] of przypadki) {
    test(`odmawiamy ${co}`, () => {
      assert.ok(o.bladKopii(zrob()), `${co} zostało przyjęte`);
    });
  }

  test("odmowa przychodzi, zanim cokolwiek zostanie nadpisane", async () => {
    dodajPlan("Anna K", 1);
    zamknij();
    const przed = planyW(BAZA);

    const smiec = join(KATALOG, "smiec.db");
    writeFileSync(smiec, "nie baza");
    await assert.rejects(() => o.odtworz(smiec), o.BladOdtworzenia);

    assert.deepEqual(planyW(BAZA), przed, "baza została ruszona mimo odmowy");
    assert.equal(readdirSync(KOPIE).length, 0, "odłożono kopię mimo odmowy");
  });
});

describe("lista kopii do wyboru", () => {
  test("pokazuje, co jest w środku, a nie samą nazwę pliku", async () => {
    dodajPlan("Anna K", 1);
    dodajPlan("Bartek Z", 1);
    await zrobKopie();

    const [k] = o.listaKopii(KOPIE);
    assert.equal(k?.blad, null);
    assert.equal(k?.opis?.planow, 2);
    assert.equal(k?.opis?.klientow, 2);
  });

  test("uszkodzony plik jest opisany, a nie wywraca listy", async () => {
    dodajPlan("Anna K", 1);
    await zrobKopie();
    writeFileSync(join(KOPIE, "craftmyplan-uszkodzona.db"), "połamane");

    const lista = o.listaKopii(KOPIE);
    assert.equal(lista.length, 2);
    assert.ok(lista.some((k) => k.blad), "uszkodzona kopia wygląda na dobrą");
    assert.ok(lista.some((k) => !k.blad), "dobra kopia zniknęła z listy");
  });
});

describe("zaglądanie do kopii nie zostawia po sobie śmieci", () => {
  test("obok przejrzanej kopii nie zostają pliki WAL", async () => {
    dodajPlan("Anna K", 1);
    const kopia = (await zrobKopie())!;

    o.bladKopii(kopia);
    o.opisz(kopia);
    o.listaKopii(KOPIE);

    // Zostawione tutaj rosłyby bez końca: `posprzataj()` filtruje po `.db`,
    // więc ich nie widzi — i zostawałyby nawet po skasowaniu samej kopii.
    for (const koncowka of o.PLIKI_OBOK) {
      assert.ok(!existsSync(kopia + koncowka), `obok kopii został ${koncowka}`);
    }
  });
});

describe("czy konsola chodzi", () => {
  /** Serwer na losowym porcie — udaje konsolę na tyle, ile trzeba do pytania. */
  async function udawanaKonsola(): Promise<{ port: number; zamknij: () => Promise<void> }> {
    const s = createServer((_, odp) => odp.end("ok"));
    await new Promise<void>((g) => s.listen(0, "127.0.0.1", g));
    const port = (s.address() as { port: number }).port;
    return { port, zamknij: () => new Promise<void>((g) => { s.close(() => g()); }) };
  }

  test("ślad prowadzi do konsoli na porcie, o którym okno nie wie", async () => {
    // To jest ta luka, dla której ślad powstał: pytanie o `PORT` odpowiadało
    // „nie chodzi", podczas gdy konsola chodziła na 4987. Sprawdzone —
    // odtworzenie przeszło wtedy bez słowa, pod działającym serwerem.
    const konsola = await udawanaKonsola();
    try {
      slad.zapiszSlad(konsola.port);
      assert.equal(await slad.konsolaChodzi(), konsola.port);
    } finally {
      slad.usunSlad();
      await konsola.zamknij();
    }
  });

  test("ślad po ubitej konsoli nie liczy się jako działająca", async () => {
    const konsola = await udawanaKonsola();
    try {
      // Port odpowiada, ale proces z pliku nie istnieje — czyli ślad jest
      // po czymś, czego już nie ma. Sam plik nie może wystarczyć.
      writeFileSync(slad.sciezkaSladu(),
        JSON.stringify({ pid: 2_147_483_647, port: konsola.port, od: "" }));
      assert.notEqual(await slad.konsolaChodzi(), konsola.port);
    } finally {
      slad.usunSlad();
      await konsola.zamknij();
    }
  });

  test("uszkodzony ślad nie wywraca pytania", () => {
    writeFileSync(slad.sciezkaSladu(), "{to nie jest json");
    assert.equal(slad.czytajSlad(), null);
    slad.usunSlad();
  });

  test("proces, który żyje, jest rozpoznany", () => {
    assert.equal(slad.procesZyje(process.pid), true);
    assert.equal(slad.procesZyje(2_147_483_647), false);
  });
});
