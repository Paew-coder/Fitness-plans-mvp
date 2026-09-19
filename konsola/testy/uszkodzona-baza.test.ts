/**
 * Dzień, w którym plik z danymi przestaje się otwierać.
 *
 * Zdarza się raz na kilka lat — po awarii dysku, przerwanym kopiowaniu,
 * wyciągniętym pendrivie. Wtedy w tym jednym pliku leży cała praca trenera,
 * a on musi się dowiedzieć **jednej rzeczy**: że jest kopia i jak z niej wrócić.
 *
 * Sprawdzone przed napisaniem tego pliku: konsola kończyła się wtedy
 * komunikatem `Error: file is not a database`, ścieżkami z dysku i ośmioma
 * ramkami stosu. A narzędzie odtwarzające mówiło o uszkodzonej bazie
 * „0 klientów, 0 planów" — czyli, że jest **pusta**. To zupełnie inne zdanie
 * niż „jest uszkodzona", i dużo gorsze do przeczytania w takiej chwili.
 *
 * Test przechodzi całą drogę: zdrowa baza → kopia → zniszczenie pliku →
 * komunikat → odtworzenie → konsola wstaje z kompletem klientów.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");

const { powodNieotwarciaBazy } = await import("../baza/blad-bazy.ts");
const KATALOG = mkdtempSync(join(tmpdir(), "uszkodzona-test-"));
const BAZA = join(KATALOG, "craftmyplan.db");
const KOPIE = join(KATALOG, "kopie");

const SRODOWISKO = { ...process.env, BAZA_CRAFTMYPLAN: BAZA, KOPIE_CRAFTMYPLAN: KOPIE };
const KLIENCI = ["Anna K", "Bartek Z", "Celina W"];

const uruchomione: ChildProcess[] = [];
after(() => {
  for (const p of uruchomione) p.kill("SIGKILL");
  rmSync(KATALOG, { recursive: true, force: true });
});

/** Node z kodem w argumencie, w środowisku wskazującym testową bazę. */
function wKonsoli(kod: string) {
  return spawnSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", kod],
    { cwd: KONSOLA, env: SRODOWISKO, encoding: "utf-8" });
}

function przywroc(...argumenty: string[]) {
  return spawnSync(process.execPath,
    ["--no-warnings", "narzedzia/przywroc.ts", ...argumenty],
    { cwd: KONSOLA, env: SRODOWISKO, encoding: "utf-8" });
}

async function wolnyPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((g) => s.listen(0, "127.0.0.1", g));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((g) => { s.close(() => g()); });
  return port;
}

/** Uruchamia konsolę i oddaje jej wyjście oraz kod wyjścia. */
function konsola(port: number): Promise<{ kod: number | null; wyjscie: string }> {
  const proces = spawn(process.execPath, ["--no-warnings", "serwer.ts"],
    { cwd: KONSOLA, env: { ...SRODOWISKO, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  uruchomione.push(proces);
  let wyjscie = "";
  proces.stdout.on("data", (b) => { wyjscie += String(b); });
  proces.stderr.on("data", (b) => { wyjscie += String(b); });
  return new Promise((g) => proces.on("close", (kod) => g({ kod, wyjscie })));
}

before(() => {
  const wynik = wKonsoli(`
    const p = await import("./baza/polaczenie.ts");
    const m = await import("./magazyn.ts");
    const t = p.trenerDomyslny();
    for (const n of ${JSON.stringify(KLIENCI)}) {
      const o = m.zapewnijKlienta(t, n);
      m.zapisz({ id: m.nowyId(n, 1), trenerId: t, klientId: o.id, klient: o.nazwa,
        wersja: 1, status: "wysłany", dataStartu: null, utworzony: "", zmieniony: "",
        plan: m.pustyPlan(o.nazwa) });
    }
    await (await import("./baza/kopie.ts")).zrobKopie();
    p.zamknij();
  `);
  assert.equal(wynik.status, 0, `zasianie bazy padło: ${wynik.stderr}`);

  // Zniszczenie pliku — losowe bajty, tak jak po przerwanym zapisie.
  writeFileSync(BAZA, randomBytes(8192));
  for (const koncowka of ["-wal", "-shm"]) rmSync(BAZA + koncowka, { force: true });
});

describe("konsola nie wstaje", () => {
  test("mówi po polsku i kieruje do kopii, zamiast wysypać ślad stosu", async () => {
    const wynik = await konsola(await wolnyPort());

    assert.equal(wynik.kod, 1, "konsola wstała na uszkodzonym pliku");
    assert.match(wynik.wyjscie, /uszkodzon/i);
    assert.match(wynik.wyjscie, /npm run przywroc/,
      "komunikat nie mówi, co zrobić dalej");

    // Diagnoza bez następnego kroku jest w tej chwili bezużyteczna — a ślad
    // stosu jest gorszy niż bezużyteczny.
    for (const wzor of [/file is not a database/, /ERR_SQLITE/, /^\s+at /m, /node:internal/]) {
      assert.doesNotMatch(wynik.wyjscie, wzor,
        `w wyjściu został ślad stosu: ${wynik.wyjscie.slice(0, 200)}`);
    }
  });
});

describe("narzędzie odtwarzające", () => {
  test("mówi „uszkodzona”, a nie „pusta”", () => {
    const wynik = przywroc();
    assert.match(wynik.stdout, /nie da się otworzyć|uszkodzon/i);
    // To jest ta różnica: „0 klientów" znaczyłoby, że praca zniknęła.
    assert.doesNotMatch(wynik.stdout.split("Kopie w")[0]!, /0 klientów/,
      "uszkodzona baza wygląda na pustą");
  });

  test("pokazuje kopię z jej zawartością", () => {
    const wynik = przywroc();
    assert.match(wynik.stdout, new RegExp(`${KLIENCI.length} klientów`));
  });
});

describe("powrót", () => {
  test("odtworzenie przywraca komplet klientów, a konsola wstaje", async () => {
    const lista = przywroc().stdout;
    const plik = lista.match(/craftmyplan-[\w.-]+\.db/)?.[0];
    assert.ok(plik, `nie widać nazwy kopii w liście:\n${lista}`);

    const odtworzenie = przywroc(plik, "--wykonaj");
    assert.equal(odtworzenie.status, 0, odtworzenie.stdout + odtworzenie.stderr);
    assert.match(odtworzenie.stdout, /Odtworzone/);

    const port = await wolnyPort();
    const proces = spawn(process.execPath, ["--no-warnings", "serwer.ts"],
      { cwd: KONSOLA, env: { ...SRODOWISKO, PORT: String(port) }, stdio: ["ignore", "ignore", "pipe"] });
    uruchomione.push(proces);
    try {
      let klienci: { nazwa: string }[] = [];
      for (let i = 0; i < 60; i++) {
        try {
          const odp = await fetch(`http://127.0.0.1:${port}/api/klienci`);
          if (odp.ok) { klienci = await odp.json() as { nazwa: string }[]; break; }
        } catch { /* jeszcze nie */ }
        await new Promise((g) => setTimeout(g, 250));
      }
      assert.deepEqual(klienci.map((k) => k.nazwa).sort(), [...KLIENCI].sort());
    } finally {
      proces.kill("SIGKILL");
    }
  });
});

/**
 * Awarie, które przychodzą **przed** SQLite — z zakładania katalogu albo
 * z otwarcia pliku. Mają własny kod systemowy i wołają o co innego niż
 * uszkodzenie: odtworzenie z kopii nie pomaga, gdy nie ma gdzie zapisać.
 *
 * Sprawdzone na katalogu bez prawa zapisu, uruchomionym z konta bez
 * uprawnień: komunikat brzmiał „Powód podany przez bazę: EACCES: permission
 * denied, mkdir …", a pod spodem stała rada, żeby sięgnąć po kopię — czyli
 * porada na zupełnie inny kłopot.
 */
describe("kiedy nie ma gdzie zapisać", () => {
  const zdanie = (kod: string, wiadomosc = "cokolwiek") => {
    const b = new Error(wiadomosc) as Error & { code?: string };
    b.code = kod;
    return powodNieotwarciaBazy(b, "/gdzies/craftmyplan.db");
  };

  test("brak praw mówi, co przenieść, a nie żeby odtwarzać kopię", () => {
    const tresc = zdanie("EACCES", "EACCES: permission denied, mkdir '/gdzies'");
    assert.match(tresc, /praw do katalogu/i);
    assert.match(tresc, /Przenieś/);
    // Rada z innego kłopotu byłaby tu ślepym zaułkiem.
    assert.doesNotMatch(tresc, /npm run przywroc/);
    // I bez surowego komunikatu systemu — po polsku, nie po angielsku.
    assert.doesNotMatch(tresc, /EACCES|permission denied/);
  });

  test("pełny dysk i dysk tylko do odczytu mają własne zdania", () => {
    assert.match(zdanie("ENOSPC"), /miejsc[ea] na dysku/i);
    assert.match(zdanie("EROFS"), /tylko do odczytu/i);
  });

  test("brak katalogu mówi o katalogu, nie o bazie", () => {
    assert.match(zdanie("ENOENT"), /katalog/i);
  });

  test("uszkodzenie dalej kieruje do kopii", () => {
    // Druga strona tego samego rozróżnienia: tu odtworzenie JEST odpowiedzią.
    const tresc = powodNieotwarciaBazy(new Error("file is not a database"), "/gdzies/x.db");
    assert.match(tresc, /uszkodzon/i);
    assert.match(tresc, /npm run przywroc/);
  });

  test("nierozpoznana przyczyna też kończy się po polsku", () => {
    const tresc = powodNieotwarciaBazy(new Error("coś zupełnie nowego"), "/gdzies/x.db");
    assert.match(tresc, /Nie udało się otworzyć/);
    assert.match(tresc, /npm run przywroc/);
  });
});

/**
 * To samo, ale naprawdę: konsola uruchomiona na katalogu bez prawa zapisu.
 *
 * Wymaga `setpriv` i praw roota do zrzucenia uprawnień — bez tego test nie ma
 * jak odtworzyć sytuacji, bo root omija uprawnienia. Pomijamy z podaniem
 * powodu, zamiast udawać, że sprawdziliśmy.
 */
describe("konsola na katalogu bez prawa zapisu", () => {
  const mozliwe = process.getuid?.() === 0
    && spawnSync("which", ["setpriv"], { encoding: "utf-8" }).status === 0;

  test("mówi o uprawnieniach, a nie o kopii zapasowej",
    { skip: mozliwe ? false : "wymaga roota i `setpriv` do zrzucenia uprawnień" },
    async () => {
      const zamkniety = join(KATALOG, "zamkniety");
      if (!existsSync(zamkniety)) mkdirSync(zamkniety);
      chmodSync(zamkniety, 0o555);
      try {
        const wynik = spawnSync("setpriv",
          ["--reuid=65534", "--regid=65534", "--clear-groups",
            process.execPath, "--no-warnings", "serwer.ts"],
          {
            cwd: KONSOLA, encoding: "utf-8", timeout: 20_000,
            env: {
              ...process.env,
              BAZA_CRAFTMYPLAN: join(zamkniety, "dane", "craftmyplan.db"),
              KOPIE_CRAFTMYPLAN: join(zamkniety, "dane", "kopie"),
              PORT: String(await wolnyPort()),
            },
          });
        const wyjscie = `${wynik.stdout}${wynik.stderr}`;
        assert.match(wyjscie, /praw do katalogu/i, wyjscie.slice(0, 300));
        assert.doesNotMatch(wyjscie, /EACCES|^\s+at /m, wyjscie.slice(0, 300));
      } finally {
        chmodSync(zamkniety, 0o755);
      }
    });
});
