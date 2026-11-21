/**
 * Link dla klienta oglądany z innego urządzenia — czyli to, co naprawdę robi
 * trener, gdy chce sprawdzić plan na własnym telefonie.
 *
 * Konsola ma dwie bramki, nie jedną, i łatwo je pomylić — pomyliłem je sam.
 * `rozpoznajTrenera` pilnuje ekranów trenera i bez ustawionego hasła odcina
 * wszystko, co nie przyszło z tej maszyny. Ale ścieżki klienta idą obok niej,
 * bo ich kluczem jest token w adresie. Skutkiem pomyłki było okno „Link dla
 * klienta", które w trybie bez hasła twierdziło, że link z telefonu nie
 * zadziała — i nie podawało adresu, pod którym działał.
 *
 * Trener czytał więc, że musi ustawić hasło albo postawić serwer, żeby zrobić
 * coś, co działało od razu. Ten test trzyma obie bramki osobno.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { adresyLokalnejSieci } from "../adresy.ts";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const KATALOG = mkdtempSync(join(tmpdir(), "telefon-test-"));
process.env.BAZA_CRAFTMYPLAN = join(KATALOG, "craftmyplan.db");
process.env.KOPIE_CRAFTMYPLAN = join(KATALOG, "kopie");

let proces: ChildProcess;
let port = 0;
let adres = "";

/** Adres tej maszyny widziany z sieci — to, co trener wpisuje na telefonie. */
let zSieci: string | null = null;

async function wolnyPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((g) => s.listen(0, "127.0.0.1", g));
  const p = (s.address() as { port: number }).port;
  await new Promise<void>((g) => { s.close(() => g()); });
  return p;
}

before(async () => {
  // Żadnego hasła: to jest dokładnie ten tryb, w którym konsola startuje
  // u trenera po pierwszym kliknięciu launchera.
  for (let proba = 1; proba <= 3; proba++) {
    port = await wolnyPort();
    adres = `http://127.0.0.1:${port}`;
    proces = spawn(process.execPath, ["--no-warnings", "serwer.ts"], {
      cwd: KONSOLA, env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let wstala = false;
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${adres}/zdrowie`)).ok) { wstala = true; break; } }
      catch { /* jeszcze nie */ }
      await new Promise((g) => setTimeout(g, 250));
    }
    if (wstala) break;
    proces.kill("SIGKILL");
    if (proba === 3) throw new Error("konsola nie wstała przy trzech próbach");
  }
  zSieci = adresyLokalnejSieci(port)[0] ?? null;
});

after(() => {
  proces?.kill("SIGKILL");
  rmSync(KATALOG, { recursive: true, force: true });
});

/** Klient z linkiem — tak jak powstaje po kliknięciu „Link dla klienta". */
async function klientZLinkiem(): Promise<string> {
  const plan = await fetch(`${adres}/api/plany`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ klient: "Tomasz", wersja: 1 }),
  });
  assert.equal(plan.status, 201);
  const klientId = (await plan.json()).zapisany.klientId;

  const link = await fetch(`${adres}/api/klienci/${klientId}/link`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  assert.equal(link.status, 200);
  return (await link.json()).sciezka;
}

describe("link dla klienta bez hasła", () => {
  test("konsola podaje adres w sieci także w trybie lokalnym", async () => {
    // To jest ta regresja. Adresy wychodziły wcześniej tylko przy haśle,
    // więc okno linku nie miało czego pokazać i zostawał sam `localhost`,
    // który na telefonie klienta znaczy jego telefon.
    const ja = await (await fetch(`${adres}/api/ja`)).json();
    assert.equal(ja.tryb, "lokalny");
    assert.deepEqual(ja.adresyWSieci, adresyLokalnejSieci(port));
  });

  test("plan otwiera się z adresu spoza tej maszyny", async (t) => {
    if (!zSieci) return t.skip("ta maszyna nie ma adresu w żadnej sieci");
    const sciezka = await klientZLinkiem();

    // Połączenie idzie po adresie sieciowym, więc dla serwera nie przychodzi
    // z `127.0.0.1` — czyli tak samo, jak z telefonu obok.
    assert.equal((await fetch(`${zSieci}${sciezka}`)).status, 200);

    const token = sciezka.split("/").pop();
    const dane = await fetch(`${zSieci}/api/klient/${token}`);
    assert.equal(dane.status, 200);
    assert.equal((await dane.json()).klient, "Tomasz");
  });

  test("ekrany trenera z tego samego adresu nadal odmawiają", async (t) => {
    if (!zSieci) return t.skip("ta maszyna nie ma adresu w żadnej sieci");
    // Druga połowa umowy: link klienta przechodzi, konsola nie. Gdyby ten
    // test kiedyś zzieleniał na 200, plany wszystkich klientów byłyby
    // widoczne dla każdego w tej samej sieci Wi-Fi.
    assert.equal((await fetch(`${zSieci}/api/klienci`)).status, 403);
    assert.equal((await fetch(`${zSieci}/`)).status, 403);
  });

  test("zmyślony token nie otwiera niczego", async () => {
    assert.equal((await fetch(`${adres}/api/klient/nie-ma-takiego`)).status, 404);
  });
});
