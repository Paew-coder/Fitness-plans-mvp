/**
 * Plan po angielsku (27.10.2026) — od okienka linku do telefonu klienta.
 *
 * Trener: „dodaj opcję przed wysłaniem linku z planem do klienta, żeby oznaczyć
 * dany plan na anglojęzyczny — wtedy cały plan z linku ma być przetłumaczony
 * na język angielski”.
 *
 * Sprawdzane przez trasy serwera, z podstawionym modelem po drugiej stronie:
 * teksty trenera do tłumaczenia, propozycje AI bez nazwiska klienta i bez
 * zapisu, zapis języka bez ruszania planu, widok telefonu z podmienionymi
 * tekstami, nowy cykl po angielsku, komunikat „trener przygotowuje plan”.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { podmienTeksty, sprawdzTlumaczenia } from "../plan-po-angielsku.ts";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const KATALOG = mkdtempSync(join(tmpdir(), "angielski-test-"));
/** Nazwisko nietypowe — żeby znaleźć je w wychodzącym zapytaniu bez pomyłki. */
const KLIENT = "Bożydar Angielski-Testowy";
const ROZGRZEWKA = "5 min rowerek\n2 × 10 wymachy nóg na stronę";

let api: Server;
let odebrane: any[] = [];
let kolejka: { kod: number; tresc: unknown }[] = [];
let konsola: ChildProcess;
let adres = "";
let planId = "";
let token = "";
let wykroki = "";

const zapytaj = async (sciezka: string, metoda = "GET", cialo?: unknown) => {
  const r = await fetch(`${adres}${sciezka}`, {
    method: metoda,
    headers: { "content-type": "application/json" },
    body: cialo ? JSON.stringify(cialo) : undefined,
  });
  return { kod: r.status, tresc: await r.json() as any };
};

const odpowiedzModelu = (dane: unknown) => ({
  kod: 200,
  tresc: {
    content: [{ type: "text", text: JSON.stringify(dane) }],
    stop_reason: "end_turn",
    usage: { input_tokens: 80, output_tokens: 40 },
  },
});

before(async () => {
  api = createServer(async (req, res) => {
    const kawalki: Buffer[] = [];
    for await (const k of req) kawalki.push(k as Buffer);
    odebrane.push(JSON.parse(Buffer.concat(kawalki).toString("utf-8")));
    const odp = kolejka.shift() ?? { kod: 500, tresc: { error: { message: "brak odpowiedzi w kolejce" } } };
    res.writeHead(odp.kod, { "content-type": "application/json" });
    res.end(JSON.stringify(odp.tresc));
  });
  await new Promise<void>((g) => api.listen(0, "127.0.0.1", g));
  const portApi = (api.address() as AddressInfo).port;
  const wolny = createServer();
  await new Promise<void>((g) => wolny.listen(0, "127.0.0.1", g));
  const port = (wolny.address() as AddressInfo).port;
  await new Promise<void>((g) => { wolny.close(() => g()); });
  adres = `http://127.0.0.1:${port}`;
  konsola = spawn(process.execPath, ["--no-warnings", "serwer.ts"], {
    cwd: KONSOLA,
    env: {
      ...process.env, PORT: String(port),
      BAZA_CRAFTMYPLAN: join(KATALOG, "craftmyplan.db"), KOPIE_CRAFTMYPLAN: join(KATALOG, "kopie"),
      ANTHROPIC_API_KEY: "klucz-testowy", CRAFTMYPLAN_API_URL: `http://127.0.0.1:${portApi}/v1/messages`,
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${adres}/zdrowie`)).ok) break; } catch { /* jeszcze nie */ }
    await new Promise((g) => setTimeout(g, 150));
  }
  // Plan z własnym ćwiczeniem po polsku i rozgrzewką, wysłany klientowi.
  wykroki = (await zapytaj("/api/cwiczenia-wlasne", "POST",
    { nazwa: "Wykroki chodzone z hantlami", kategoria: "Lower push", part: "s", coeff: 0.75, progresja: "kg", skokKg: 2 })).tresc.id;
  planId = (await zapytaj("/api/plany", "POST", { klient: KLIENT, wersja: 1 })).tresc.zapisany.id;
  const plan = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan;
  plan.sloty[0].cwiczenieId = "EX-0010";
  plan.sloty[1].cwiczenieId = wykroki;
  plan.rozgrzewki = [{ dzien: 1, tekst: ROZGRZEWKA }];
  const zapis = await zapytaj(`/api/plany/${planId}`, "PUT", { plan, dataStartu: null, status: "wysłany" });
  assert.equal(zapis.kod, 200, JSON.stringify(zapis.tresc));
  token = (await zapytaj(`/api/plany/${planId}/link`, "POST")).tresc.token;
});

after(() => {
  konsola?.kill("SIGKILL");
  api?.close();
  rmSync(KATALOG, { recursive: true, force: true });
});

beforeEach(() => { odebrane = []; kolejka = []; });

const dzien1 = async () => (await zapytaj(`/api/klient/${token}`)).tresc;

describe("plan po angielsku — trasy serwera", () => {
  test("nowy plan jest po polsku; teksty trenera: linie rozgrzewki i polska nazwa własnego ćwiczenia", async () => {
    const { kod, tresc } = await zapytaj(`/api/plany/${planId}/jezyk`);
    assert.equal(kod, 200);
    assert.equal(tresc.jezyk, "pl");
    assert.equal(tresc.ai, true);
    assert.deepEqual(tresc.teksty.map((t: any) => t.pl),
      ["5 min rowerek", "2 × 10 wymachy nóg na stronę", "Wykroki chodzone z hantlami"]);
    assert.ok(tresc.teksty.every((t: any) => t.en === null));
    assert.equal(tresc.teksty[0].gdzie, "Rozgrzewka · dzień 1");
    const widok = await dzien1();
    assert.equal(widok.jezyk, undefined, "telefon bez języka — po polsku");
  });

  test("propozycje AI: tylko teksty, bez nazwiska klienta; nic się nie zapisuje", async () => {
    kolejka.push(odpowiedzModelu({ tlumaczenia: [
      { pl: "5 min rowerek", en: "5 min stationary bike" },
      { pl: "2 × 10 wymachy nóg na stronę", en: "2 × 10 leg swings per side" },
      { pl: "Wykroki chodzone z hantlami", en: "Dumbbell walking lunges" },
    ] }));
    const { kod, tresc } = await zapytaj(`/api/plany/${planId}/tlumacz`, "POST", {});
    assert.equal(kod, 200, JSON.stringify(tresc));
    assert.deepEqual(tresc.propozycje, {
      "5 min rowerek": "5 min stationary bike",
      "2 × 10 wymachy nóg na stronę": "2 × 10 leg swings per side",
      "Wykroki chodzone z hantlami": "Dumbbell walking lunges",
    });
    const wyslane = JSON.stringify(odebrane);
    assert.equal(odebrane.length, 1);
    assert.ok(!wyslane.includes("Bożydar") && !wyslane.includes("Angielski-Testowy"), "nazwisko klienta nie wychodzi");
    assert.ok(wyslane.includes("wymachy nóg") && wyslane.includes("Wykroki chodzone"));
    assert.ok((await zapytaj(`/api/plany/${planId}/jezyk`)).tresc.teksty.every((t: any) => t.en === null), "propozycja to nie zapis");
  });

  test("zapis języka i tłumaczeń nie zmienia planu: bez wersji roboczej, ten sam znacznik zmiany", async () => {
    const przed = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany;
    const { kod, tresc } = await zapytaj(`/api/plany/${planId}/jezyk`, "PUT", { jezyk: "en", tlumaczenia: {
      "5 min rowerek": "5 min stationary bike",
      "2 × 10 wymachy nóg na stronę": "  2 × 10 leg swings per side ",
      "Wykroki chodzone z hantlami": "Dumbbell walking lunges",
      "Linia, której już nie ma": "",
    } });
    assert.equal(kod, 200, JSON.stringify(tresc));
    assert.equal(tresc.jezyk, "en");
    assert.deepEqual(tresc.teksty.map((t: any) => t.en),
      ["5 min stationary bike", "2 × 10 leg swings per side", "Dumbbell walking lunges"]);
    const po = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany;
    assert.equal(po.zmieniony, przed.zmieniony);
    assert.equal(po.wersjaKlienta, undefined, "zmiana języka nie czeka na zatwierdzenie");
    assert.equal(po.jezyk, "en");
  });

  test("telefon: „en”, rozgrzewka i nazwa przetłumaczone; liczby i ćwiczenia z bazy bez zmian", async () => {
    const widok = await dzien1();
    assert.equal(widok.jezyk, "en");
    const d1 = widok.tygodnie[0].dni[0];
    assert.deepEqual(d1.rozgrzewka.linie, ["5 min stationary bike", "2 × 10 leg swings per side"]);
    const nazwy = d1.cwiczenia.map((c: any) => c.nazwa);
    assert.ok(nazwy.includes("Dumbbell walking lunges") && nazwy.includes("Barbell back squat"), nazwy.join(", "));
    assert.ok(widok.doZmierzenia.some((c: any) => c.nazwa === "Dumbbell walking lunges"));
    const lunges = d1.cwiczenia.find((c: any) => c.nazwa === "Dumbbell walking lunges");
    assert.equal(lunges.cwiczenieId, wykroki, "id zostaje — zapis serii trafia tam, gdzie trzeba");
    assert.equal(widok.klient, KLIENT);
  });

  test("odmowy: inny język, za długie tłumaczenie, plan, którego nie ma", async () => {
    assert.equal((await zapytaj(`/api/plany/${planId}/jezyk`, "PUT", { jezyk: "de" })).kod, 400);
    const dlugie = await zapytaj(`/api/plany/${planId}/jezyk`, "PUT", { jezyk: "en", tlumaczenia: { a: "x".repeat(501) } });
    assert.equal(dlugie.kod, 400);
    assert.match(dlugie.tresc.blad, /dłuższe niż 500/);
    assert.equal((await zapytaj("/api/plany/nie-ma-takiego-1/jezyk", "PUT", { jezyk: "en" })).kod, 404);
    assert.equal((await dzien1()).jezyk, "en", "odmowa niczego nie zmienia");
  });

  test("nowy cykl przejmuje język i tłumaczenia; między cyklami komunikat też po angielsku", async () => {
    const kopia = await zapytaj(`/api/plany/${planId}/kopia`, "POST", {});
    assert.equal(kopia.kod, 201, JSON.stringify(kopia.tresc));
    const nowy = (await zapytaj(`/api/plany/${kopia.tresc.zapisany.id}/jezyk`)).tresc;
    assert.equal(nowy.jezyk, "en");
    assert.equal(nowy.teksty[0].en, "5 min stationary bike");
    // Trener cofa plan do szkicu — klient widzi „trener przygotowuje plan”, po angielsku.
    const plan = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany;
    await zapytaj(`/api/plany/${planId}`, "PUT", { plan: plan.plan, dataStartu: null, status: "szkic" });
    const czeka = await dzien1();
    assert.deepEqual([czeka.czekaNaPlan, czeka.jezyk], [true, "en"]);
    await zapytaj(`/api/plany/${planId}`, "PUT", { plan: plan.plan, dataStartu: null, status: "wysłany" });
  });

  test("z powrotem po polsku — telefon bez języka, polskie teksty trenera", async () => {
    const { tresc } = await zapytaj(`/api/plany/${planId}/jezyk`, "PUT", { jezyk: "pl" });
    assert.equal(tresc.jezyk, "pl");
    assert.equal(tresc.teksty[0].en, "5 min stationary bike", "tłumaczenia zostają na później");
    const widok = await dzien1();
    assert.equal(widok.jezyk, undefined);
    assert.deepEqual(widok.tygodnie[0].dni[0].rozgrzewka.linie, ["5 min rowerek", "2 × 10 wymachy nóg na stronę"]);
  });
});

describe("plan po angielsku — funkcje", () => {
  test("podmiana tylko całych napisów i tylko w nazwach i liniach rozgrzewki", () => {
    const widok = { nazwa: "Rowerek", ciezar: "guma", linie: ["Rowerek", "Rowerek 5 min"], karta: { nazwaEn: "Rowerek" }, opis: "Rowerek" };
    assert.deepEqual(podmienTeksty(widok, { Rowerek: "Bike", guma: "band" }),
      { nazwa: "Bike", ciezar: "guma", linie: ["Bike", "Rowerek 5 min"], karta: { nazwaEn: "Bike" }, opis: "Rowerek" });
  });
  test("tłumaczenia z okienka: puste pomijane, przycięte, zła postać — odmowa", () => {
    assert.deepEqual(sprawdzTlumaczenia({ " a ": " b ", c: "" }), { a: "b" });
    assert.ok("blad" in sprawdzTlumaczenia({ a: 5 }));
    assert.ok("blad" in sprawdzTlumaczenia(["a"]));
    assert.deepEqual(sprawdzTlumaczenia(undefined), {});
  });
});
