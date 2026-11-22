/**
 * Liczba tygodni planu — trasy serwera (22.11.2026).
 *
 * Trener: „dodaj mi możliwość zmiany ilości tygodni w planie w konsoli
 * trenera — zarówno nowe plany, jak i edytowanie aktualnych”. Od 4 do 12;
 * arkusz tylko przy sześciu (szablon ma zakładki T1–T6) — przy innej
 * długości konsola mówi dlaczego. Liczenie tygodni — `silnik/testy/liczba-tygodni.test.ts`.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plan } from "../../silnik/src/plan.ts";
import { bladKsztaltuPlanu } from "../ksztalt-planu.ts";
import { podsumujZmiany } from "../wersja-robocza.ts";

const planBazowy = (zmiany: Record<string, unknown> = {}): Plan => ({
  nazwa: "długość", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość", serieMaksymalne: [],
  sloty: [{ positionId: "D1-S01", dzien: 1, lp: "A1.", cwiczenieId: "EX-0010" }],
  ...zmiany,
} as unknown as Plan);

describe("liczba tygodni — bez serwera", () => {
  test("kształt planu: 4–12 całkowita albo brak; inaczej odmowa po polsku", () => {
    for (const n of [undefined, 4, 6, 12]) assert.equal(bladKsztaltuPlanu(planBazowy({ tygodni: n })), null, String(n));
    for (const n of [3, 13, 7.5, "8"]) {
      assert.match(bladKsztaltuPlanu(planBazowy({ tygodni: n }))!, /Liczba tygodni planu musi być liczbą całkowitą od 4 do 12/);
    }
  });

  test("wersja robocza: zmiana długości stoi na liście zmian, tygodnie T7+ pod swoimi numerami", () => {
    const nazwa = (id: string) => id;
    assert.deepEqual(podsumujZmiany(planBazowy(), planBazowy({ tygodni: 8 }), {}, nazwa), ["Plan: liczba tygodni"]);
    const zT7 = planBazowy({ tygodni: 8 });
    (zT7.sloty[0] as any).tygodnie = { 9: { serie: 2 } };
    assert.deepEqual(podsumujZmiany(planBazowy({ tygodni: 8 }), zT7, {}, nazwa), ["Dzień 1 A1: EX-0010 — parametry T7"]);
  });
});

describe("liczba tygodni — trasy serwera", () => {
  const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
  const KATALOG = mkdtempSync(join(tmpdir(), "tygodnie-test-"));
  let konsola: ChildProcess;
  let adres = "";
  let planId = "";
  let token = "";

  const zapytaj = async (sciezka: string, metoda = "GET", cialo?: unknown) => {
    const r = await fetch(`${adres}${sciezka}`, {
      method: metoda, headers: { "content-type": "application/json" },
      body: cialo ? JSON.stringify(cialo) : undefined,
    });
    const typ = r.headers.get("content-type") ?? "";
    return { kod: r.status, tresc: typ.includes("json") ? await r.json() as any : null };
  };
  const tygodnieTelefonu = async () =>
    (await zapytaj(`/api/klient/${token}`)).tresc.tygodnie.map((t: any) => [t.tydzien, t.numer, t.rodzaj ?? null]);

  before(async () => {
    const wolny = createServer();
    await new Promise<void>((g) => wolny.listen(0, "127.0.0.1", g));
    const port = (wolny.address() as AddressInfo).port;
    await new Promise<void>((g) => { wolny.close(() => g()); });
    adres = `http://127.0.0.1:${port}`;
    const { ANTHROPIC_API_KEY: _bezKlucza, ...env } = process.env;
    konsola = spawn(process.execPath, ["--no-warnings", "serwer.ts"], {
      cwd: KONSOLA,
      env: { ...env, PORT: String(port),
        BAZA_CRAFTMYPLAN: join(KATALOG, "craftmyplan.db"), KOPIE_CRAFTMYPLAN: join(KATALOG, "kopie") },
      stdio: "ignore",
    });
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(`${adres}/zdrowie`)).ok) break; } catch { /* jeszcze nie */ }
      await new Promise((g) => setTimeout(g, 150));
    }
  });

  after(() => {
    konsola?.kill("SIGKILL");
    rmSync(KATALOG, { recursive: true, force: true });
  });

  test("nowy plan: liczba tygodni z formularza; spoza 4–12 — odmowa", async () => {
    const zly = await zapytaj("/api/plany", "POST", { klient: "Jan Przykładowy", wersja: 1, tygodni: 13 });
    assert.equal(zly.kod, 400);
    assert.match(zly.tresc.blad, /od 4 do 12/);
    const { kod, tresc } = await zapytaj("/api/plany", "POST", { klient: "Jan Przykładowy", wersja: 1, tygodni: 9 });
    assert.equal(kod, 201);
    planId = tresc.zapisany.id;
    assert.equal(tresc.zapisany.plan.tygodni, 9);
    assert.deepEqual(tresc.wynik.tygodnie.map((t: any) => t.tydzien), [1, 2, 3, 4, 5, 6, 9, 10, 11]);
    assert.match(tresc.bezArkusza, /tylko dla planów sześciotygodniowych/);
  });

  test("telefon: dziewięć tygodni po kolei, deload i maksy za T9", async () => {
    const plan = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan;
    plan.sloty[0].cwiczenieId = "EX-0010";
    plan.serieMaksymalne = [{ cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 1 }];
    plan.deload = true;
    plan.tydzienMaksow = true;
    assert.equal((await zapytaj(`/api/plany/${planId}`, "PUT", { plan, dataStartu: null, status: "wysłany" })).kod, 200);
    token = (await zapytaj(`/api/plany/${planId}/link`, "POST")).tresc.token;
    assert.deepEqual(await tygodnieTelefonu(), [
      [1, 1, null], [2, 2, null], [3, 3, null], [4, 4, null], [5, 5, null], [6, 6, null],
      [9, 7, null], [10, 8, null], [11, 9, null], [7, 10, "deload"], [8, 11, "maksy"],
    ]);
  });

  test("ocena w T7 (klucz 9) zapisuje się; tydzień spoza planu — odmowa", async () => {
    const ok = await zapytaj(`/api/klient/${token}/odczucie`, "POST", { positionId: "D1-S01", tydzien: 9, feedback: "za łatwe" });
    assert.equal(ok.kod, 200, JSON.stringify(ok.tresc));
    const zly = await zapytaj(`/api/klient/${token}/odczucie`, "POST", { positionId: "D1-S01", tydzien: 12, feedback: "OK" });
    assert.equal(zly.kod, 400);
    const zapisany = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany;
    assert.equal(zapisany.plan.sloty[0].tygodnie[9].feedback, "za łatwe");
  });

  test("eksport przy 9 tygodniach — powód zamiast pliku", async () => {
    const { kod, tresc } = await zapytaj(`/api/plany/${planId}/eksport`);
    assert.equal(kod, 409);
    assert.match(tresc.blad, /szablon trenera ma zakładki T1–T6, a ten plan ma 9 tygodni/);
  });

  test("skrócenie wysłanego planu czeka na „Zatwierdź”, po nim telefon ma 4 tygodnie — wpis z T7 zostaje w bazie", async () => {
    const plan = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan;
    plan.tygodni = 4;
    assert.equal((await zapytaj(`/api/plany/${planId}`, "PUT", { plan })).kod, 200);
    const obraz = (await zapytaj(`/api/plany/${planId}`)).tresc;
    assert.ok(obraz.zmianyDlaKlienta.zmiany.includes("Plan: liczba tygodni"), JSON.stringify(obraz.zmianyDlaKlienta));
    assert.equal((await tygodnieTelefonu()).length, 11, "klient widzi jeszcze stary plan");
    assert.equal((await zapytaj(`/api/plany/${planId}/zatwierdz`, "POST")).kod, 200);
    assert.deepEqual((await tygodnieTelefonu()).map((t: any[]) => t[1]), [1, 2, 3, 4, 5, 6]);
    const po = (await zapytaj(`/api/plany/${planId}`)).tresc;
    assert.equal(po.zapisany.plan.sloty[0].tygodnie[9].feedback, "za łatwe", "nic nie zniknęło");
    assert.equal(po.bezArkusza !== null, true);
  });

  test("powrót do sześciu tygodni — eksport znowu możliwy (nie 409)", async () => {
    const plan = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan;
    delete plan.tygodni;
    assert.equal((await zapytaj(`/api/plany/${planId}`, "PUT", { plan })).kod, 200);
    const obraz = (await zapytaj(`/api/plany/${planId}`)).tresc;
    assert.equal(obraz.bezArkusza, null);
    assert.notEqual((await zapytaj(`/api/plany/${planId}/eksport`)).kod, 409);
  });
});
