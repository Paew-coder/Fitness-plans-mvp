/**
 * Asystent — cała droga, z podstawionym modelem po drugiej stronie.
 *
 * `ai-polaczenie.test.ts` sprawdza bibliotekę: zapytanie, ponowienie, odczyt.
 * Tutaj chodzi o coś innego — o **trasy serwera** i o dwie obietnice, które
 * projekt składa od początku, a których nikt nie sprawdził od strony sieci:
 *
 *   1. **Nazwisko klienta nigdy nie wychodzi do API.** Plan idzie do modelu
 *      jako zestaw ćwiczeń i celów, nie jako czyjaś kartoteka.
 *   2. **Notatka trenera nie jest nigdzie zapisywana.** Leci do modelu i znika;
 *      w bazie nie zostaje po niej ślad.
 *
 * Obietnicy nie da się sprawdzić czytając kod — trzeba zobaczyć, co naprawdę
 * wychodzi z komputera i co naprawdę leży w pliku bazy. Dlatego po drugiej
 * stronie stoi serwer z tego pliku, który zapisuje każde zapytanie, a bazę
 * czytamy z dysku bajt po bajcie.
 *
 * Trzecia rzecz, sprawdzana tu po raz pierwszy przez trasę serwera: **asystent
 * nie ustawia obciążeń**. Model może w odpowiedzi podać ciężary, serie i RPE —
 * i nie mają one prawa trafić do planu.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const KATALOG = mkdtempSync(join(tmpdir(), "asystent-test-"));

/** Nazwisko celowo nietypowe — żeby znaleźć je w wychodzącym zapytaniu bez pomyłki. */
const KLIENT = "Bogumiła Trzaskowska-Wilk";
const PLAN = "bogumila-trzaskowska-wilk-1";
/** Znacznik w notatce, którego nie ma prawa być nigdzie poza pamięcią procesu. */
const ZNACZNIK = "znacznik-notatki-9f3a1c7e";
const NOTATKA = `Od tygodnia boli go bark przy wyciskaniu. ${ZNACZNIK}`;

type Zadanie = { cialo: any };
let api: Server;
let odebrane: Zadanie[] = [];
let kolejka: { kod: number; tresc: unknown }[] = [];

let konsola: ChildProcess;
let adres = "";

function odpowiedz(tekst: string) {
  return {
    kod: 200,
    tresc: {
      content: [{ type: "text", text: tekst }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

/** Model, który oddaje poprawny szkielet — i przy okazji próbuje ustawić obciążenia. */
const SZKIELET_Z_CIEZARAMI = JSON.stringify({
  dni: [{
    dzien: 1, nazwa: "Dolny",
    cwiczenia: [
      { cwiczenieId: "EX-0010", nazwa: "Barbell back squat", kategoria: "Lower push",
        powod: "bój główny", ciezar: 140, rpe: 9.5, serie: 8, powtorzenia: 12 },
      { cwiczenieId: "EX-9999", nazwa: "Super Przysiad 3000", kategoria: "Lower push",
        powod: "wymyślone przez model" },
    ],
  }],
  uzasadnienie: "Jeden dzień.",
});

async function wolnyPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((g) => s.listen(0, "127.0.0.1", g));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((g) => { s.close(() => g()); });
  return port;
}

const zapytaj = async (sciezka: string, metoda = "GET", cialo?: unknown) => {
  const r = await fetch(`${adres}${sciezka}`, {
    method: metoda,
    headers: { "content-type": "application/json" },
    body: cialo ? JSON.stringify(cialo) : undefined,
  });
  return { kod: r.status, tresc: await r.json() as any };
};

before(async () => {
  api = createServer(async (req, res) => {
    const kawalki: Buffer[] = [];
    for await (const k of req) kawalki.push(k as Buffer);
    odebrane.push({ cialo: JSON.parse(Buffer.concat(kawalki).toString("utf-8")) });
    const odp = kolejka.shift()
      ?? { kod: 500, tresc: { error: { message: "brak odpowiedzi w kolejce" } } };
    res.writeHead(odp.kod, { "content-type": "application/json" });
    res.end(JSON.stringify(odp.tresc));
  });
  await new Promise<void>((g) => api.listen(0, "127.0.0.1", g));
  const portApi = (api.address() as AddressInfo).port;

  for (let proba = 1; proba <= 3; proba++) {
    const port = await wolnyPort();
    adres = `http://127.0.0.1:${port}`;
    konsola = spawn(process.execPath, ["--no-warnings", "serwer.ts"], {
      cwd: KONSOLA,
      env: {
        ...process.env,
        PORT: String(port),
        BAZA_CRAFTMYPLAN: join(KATALOG, "craftmyplan.db"),
        KOPIE_CRAFTMYPLAN: join(KATALOG, "kopie"),
        ANTHROPIC_API_KEY: "klucz-testowy",
        CRAFTMYPLAN_API_URL: `http://127.0.0.1:${portApi}/v1/messages`,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${adres}/zdrowie`)).ok) {
          await zapytaj("/api/plany", "POST", { klient: KLIENT, wersja: 1 });
          return;
        }
      } catch { /* jeszcze nie */ }
      await new Promise((g) => setTimeout(g, 250));
    }
    konsola.kill("SIGKILL");
  }
  throw new Error("konsola nie wstała przy trzech próbach");
});

after(() => {
  konsola?.kill("SIGKILL");
  api?.close();
  rmSync(KATALOG, { recursive: true, force: true });
});

beforeEach(() => { odebrane = []; kolejka = []; });

const szkielet = () => zapytaj(`/api/plany/${PLAN}/ai-szkielet`, "POST", {
  cel: "siła", staz: "2 lata", sprzet: "sztanga i hantle",
  notatka: NOTATKA, dniWTygodniu: 1,
});

describe("co wychodzi z komputera", () => {
  test("nazwisko klienta nie leci do modelu", async () => {
    kolejka.push(odpowiedz(SZKIELET_Z_CIEZARAMI));
    await szkielet();

    assert.equal(odebrane.length, 1, "model nie został zapytany");
    const cale = JSON.stringify(odebrane[0]!.cialo);
    for (const kawalek of ["Bogumiła", "Trzaskowska", KLIENT, PLAN]) {
      assert.ok(!cale.includes(kawalek),
        `w zapytaniu do modelu jest „${kawalek}"`);
    }
  });

  test("notatka trenera leci do modelu — bo po to jest", async () => {
    // Druga strona tej samej obietnicy: notatka ma dojść tam, dokąd trener
    // ją kieruje. Gdyby nie dochodziła, „nie zapisujemy jej" znaczyłoby
    // po prostu, że jej nie ma.
    kolejka.push(odpowiedz(SZKIELET_Z_CIEZARAMI));
    await szkielet();
    assert.ok(JSON.stringify(odebrane[0]!.cialo).includes(ZNACZNIK));
  });
});

describe("co zostaje na dysku", () => {
  test("notatki trenera nie ma w bazie", async () => {
    kolejka.push(odpowiedz(SZKIELET_Z_CIEZARAMI));
    const o = await szkielet();
    assert.equal(o.kod, 200);

    // Wstawiamy propozycję do planu — czyli robimy jedyną rzecz, po której
    // cokolwiek z tej rozmowy trafia do bazy.
    kolejka.push(odpowiedz(SZKIELET_Z_CIEZARAMI));
    await zapytaj(`/api/plany/${PLAN}/ai-wstaw`, "POST", { propozycja: o.tresc.propozycja });

    // Czytamy plik bazy bajt po bajcie, razem z plikiem WAL obok. Zapytanie
    // SQL-em sprawdzałoby tylko te kolumny, o których pomyślałem.
    const naDysku = readdirSync(KATALOG)
      .filter((f) => f.startsWith("craftmyplan.db"))
      .map((f) => readFileSync(join(KATALOG, f)).toString("latin1"))
      .join("");
    assert.ok(naDysku.length > 1000, "baza nie została jeszcze zapisana");
    assert.ok(!naDysku.includes(ZNACZNIK), "notatka trenera wylądowała w bazie");
    assert.ok(!naDysku.includes("boli go bark"), "treść notatki wylądowała w bazie");
  });
});

describe("czego asystent nie ma prawa zrobić", () => {
  test("nie ustawia ciężarów, serii ani RPE", async () => {
    kolejka.push(odpowiedz(SZKIELET_Z_CIEZARAMI));
    const o = await szkielet();
    kolejka.push(odpowiedz(SZKIELET_Z_CIEZARAMI));
    const po = await zapytaj(`/api/plany/${PLAN}/ai-wstaw`, "POST",
      { propozycja: o.tresc.propozycja });

    const zCwiczeniem = po.tresc.zapisany.plan.sloty.filter((s: any) => s.cwiczenieId);
    assert.ok(zCwiczeniem.length > 0, "nic nie zostało wstawione");
    for (const s of zCwiczeniem) {
      assert.deepEqual(s.tygodnie ?? {}, {},
        `slot ${s.positionId} przyszedł z gotowymi parametrami`);
    }
  });

  test("ćwiczenie wymyślone przez model nie wchodzi do planu", async () => {
    kolejka.push(odpowiedz(SZKIELET_Z_CIEZARAMI));
    const o = await szkielet();
    const idki = o.tresc.propozycja.dni
      .flatMap((d: any) => d.cwiczenia.map((c: any) => c.cwiczenieId));
    assert.ok(idki.includes("EX-0010"), "znane ćwiczenie zniknęło");
    assert.ok(!idki.includes("EX-9999"), "wymyślone ćwiczenie przeszło");
  });
});

describe("sygnał zdrowotny", () => {
  test("notatka o bólu podnosi komunikat, cokolwiek odpowie model", async () => {
    // Model o tym nie decyduje i nie może o tym zapomnieć: komunikat składa
    // serwer, na podstawie deterministycznej listy słów.
    kolejka.push(odpowiedz(SZKIELET_Z_CIEZARAMI));
    const o = await szkielet();
    assert.ok(o.tresc.komunikatZdrowotny, "brak komunikatu przy notatce o bólu");
    assert.match(o.tresc.komunikatZdrowotny, /konsultac|lekar|fizjoterapeut|decyzj/i);
  });

  test("notatka bez zdrowia nie podnosi komunikatu", async () => {
    kolejka.push(odpowiedz(SZKIELET_Z_CIEZARAMI));
    const o = await zapytaj(`/api/plany/${PLAN}/ai-szkielet`, "POST", {
      cel: "siła", staz: "2 lata", sprzet: "sztanga",
      notatka: "Lubi przysiady, nie znosi wiosłowania.", dniWTygodniu: 1,
    });
    assert.equal(o.tresc.komunikatZdrowotny, null);
  });
});

describe("gdy model odpowie bzdurą", () => {
  test("trener dostaje zdanie po polsku, nie ślad stosu", async () => {
    kolejka.push(odpowiedz("Jasne! Oto plan treningowy: poniedziałek — przysiady."));
    const o = await szkielet();
    assert.ok(o.kod >= 400 && o.kod < 600, `kod ${o.kod}`);
    assert.ok(typeof o.tresc.blad === "string" && o.tresc.blad.length > 10);
    assert.doesNotMatch(o.tresc.blad, /SyntaxError|is not a function|undefined|\.ts:/,
      o.tresc.blad);
  });

  test("awaria po stronie API nie wywraca konsoli", async () => {
    kolejka.push({ kod: 500, tresc: { error: { message: "internal" } } });
    kolejka.push({ kod: 500, tresc: { error: { message: "internal" } } });
    kolejka.push({ kod: 500, tresc: { error: { message: "internal" } } });
    const o = await szkielet();
    assert.ok(o.kod >= 400, `kod ${o.kod}`);
    // Konsola ma dalej pracować.
    assert.equal((await zapytaj(`/api/plany/${PLAN}`)).kod, 200);
  });
});
