/**
 * Co widzi trener, gdy konsola nie chce wstać.
 *
 * Najczęstszy powód jest jeden: **ikona kliknięta drugi raz**, przy konsoli,
 * która już chodzi. Odtworzone na działającym launcherze — trener dostawał
 * wtedy najpierw „Gotowe — otwórz http://localhost:4173", zaraz potem
 * `Unhandled 'error' event`, `EADDRINUSE`, ścieżki z dysku i `node:net:1940`,
 * a na koniec okno gasło. Plik uruchamiający istnieje właśnie po to, żeby to
 * się nie działo: „okno, które gaśnie po ułamku sekundy, nie mówi nikomu nic".
 *
 * Ślad pozwala odróżnić dwa kłopoty wyglądające tak samo: własną konsolę już
 * działającą (nie ma czego naprawiać) od cudzego programu na tym porcie
 * (trzeba zmienić port). Rada „zmień port" przy własnej działającej konsoli
 * byłaby myląca — trener uruchomiłby drugą kopię obok pierwszej.
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const KATALOG = mkdtempSync(join(tmpdir(), "start-test-"));
process.env.BAZA_CRAFTMYPLAN = join(KATALOG, "craftmyplan.db");
process.env.KOPIE_CRAFTMYPLAN = join(KATALOG, "kopie");

const slad = await import("../baza/slad-pracy.ts");

const uruchomione: ChildProcess[] = [];
after(() => {
  for (const p of uruchomione) p.kill("SIGKILL");
  rmSync(KATALOG, { recursive: true, force: true });
});

/**
 * Wolny port — bierzemy go, oglądamy numer i oddajemy.
 *
 * Między oddaniem a zajęciem go przez konsolę jest szczelina, w którą może
 * wejść inny proces. Raz na kilkadziesiąt przebiegów widziałem test, który
 * padł i nie powtórzył się przez sześć kolejnych uruchomień — a test, który
 * czasem pada, jest gorszy niż brak testu: uczy przechodzić nad czerwienią
 * do porządku. Stąd ponawianie na kolejnym porcie zamiast jednej próby.
 */
async function wolnyPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((g) => s.listen(0, "127.0.0.1", g));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((g) => { s.close(() => g()); });
  return port;
}

type Wynik = { kod: number | null; wyjscie: string };

/** Konsola jako osobny proces — bo o wygląd wyjścia właśnie tu chodzi. */
function konsola(port: number): { proces: ChildProcess; skonczona: Promise<Wynik> } {
  const proces = spawn(process.execPath, ["--no-warnings", "serwer.ts"], {
    cwd: KONSOLA,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  uruchomione.push(proces);

  let wyjscie = "";
  proces.stdout.on("data", (b) => { wyjscie += String(b); });
  proces.stderr.on("data", (b) => { wyjscie += String(b); });
  const skonczona = new Promise<Wynik>((g) =>
    proces.on("close", (kod) => g({ kod, wyjscie })));
  return { proces, skonczona };
}

/** Czeka, aż konsola odpowie — albo podda się po paru sekundach. */
async function wstala(port: number): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/zdrowie`)).ok) return true;
    } catch { /* jeszcze nie */ }
    await new Promise((g) => setTimeout(g, 250));
  }
  return false;
}

describe("druga konsola na zajętym porcie", () => {
  test("mówi po polsku, zamiast wysypać ślad stosu", async () => {
    let port = 0;
    let pierwsza!: ReturnType<typeof konsola>;
    for (let proba = 1; proba <= 3; proba++) {
      port = await wolnyPort();
      pierwsza = konsola(port);
      if (await wstala(port)) break;
      pierwsza.proces.kill("SIGKILL");
      assert.ok(proba < 3, "pierwsza konsola nie wstała przy trzech próbach");
    }

    const druga = await konsola(port).skonczona;

    assert.match(druga.wyjscie, /Konsola już działa/);
    assert.match(druga.wyjscie, new RegExp(`localhost:${port}`));
    assert.equal(druga.kod, 1, "nieudany start ma się kończyć błędem");

    // To jest właściwa treść tej kontroli: nie „czy jest komunikat", tylko
    // „czy zniknęło to, co trener widział zamiast niego".
    for (const wzor of [/EADDRINUSE/, /Unhandled/, /node:net/, /^\s+at /m]) {
      assert.doesNotMatch(druga.wyjscie, wzor,
        `w wyjściu został ślad stosu: ${druga.wyjscie.slice(0, 200)}`);
    }

    // Nieudany start nie może sprzątnąć śladu po tej konsoli, która działa —
    // inaczej odtwarzanie bazy przestałoby widzieć, że jest pod czym pracować.
    assert.ok(existsSync(slad.sciezkaSladu()), "ślad działającej konsoli zniknął");
    assert.equal(slad.czytajSlad()?.pid, pierwsza.proces.pid);

    pierwsza.proces.kill("SIGTERM");
    await pierwsza.skonczona;
  });
});

describe("zdanie dobrane do kłopotu", () => {
  const zajety = { code: "EADDRINUSE" };

  test("przy własnej działającej konsoli nie radzi zmieniać portu", () => {
    writeFileSync(slad.sciezkaSladu(),
      JSON.stringify({ pid: process.pid, port: 4173, od: new Date().toISOString() }));
    const tresc = slad.powodNieuruchomienia(zajety, 4173);
    slad.usunSlad();

    assert.match(tresc, /już działa/);
    // Rada „uruchom na innym porcie" jest tu szkodliwa: trener postawiłby
    // drugą kopię obok pierwszej i zaczął pracować w dwóch naraz.
    assert.doesNotMatch(tresc, /innym porcie/);
  });

  test("przy cudzym programie na porcie mówi, co z tym zrobić", () => {
    // Ślad po ubitej konsoli nie może udawać działającej.
    writeFileSync(slad.sciezkaSladu(),
      JSON.stringify({ pid: 2_147_483_647, port: 4173, od: "" }));
    const tresc = slad.powodNieuruchomienia(zajety, 4173);
    slad.usunSlad();

    assert.match(tresc, /zajęty przez inny program/);
    assert.match(tresc, /PORT=4174/);
  });

  test("brak uprawnień do portu jest nazwany po imieniu", () => {
    const tresc = slad.powodNieuruchomienia({ code: "EACCES" }, 80);
    assert.match(tresc, /uprawnie/i);
    assert.match(tresc, /1024/);
  });

  test("awaria spoza tej listy nie jest zgadywana", () => {
    const tresc = slad.powodNieuruchomienia(new Error("dysk pełny"), 4173);
    assert.match(tresc, /dysk pełny/);
  });
});
