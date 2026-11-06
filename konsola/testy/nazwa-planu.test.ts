/**
 * Nazwa planu (06.11.2026). Trener: „dodasz mi możliwość edytowania nazwy
 * planu?” — np. „Redukcja zima” obok „Klient 2.0”. Zapis bez wersji roboczej:
 * to opis dla trenera, nie zmiana treningu.
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

describe("nazwa planu — trasy serwera", () => {
  const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
  const KATALOG = mkdtempSync(join(tmpdir(), "nazwa-planu-test-"));
  let konsola: ChildProcess;
  let adres = "";
  let planId = "";
  let token = "";

  const zapytaj = async (sciezka: string, metoda = "GET", cialo?: unknown) => {
    const r = await fetch(`${adres}${sciezka}`, {
      method: metoda, headers: { "content-type": "application/json" },
      body: cialo ? JSON.stringify(cialo) : undefined,
    });
    return { kod: r.status, tresc: await r.json() as any };
  };

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
    planId = (await zapytaj("/api/plany", "POST", { klient: "Nazwa Testowa", wersja: 1 })).tresc.zapisany.id;
    const plan = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan;
    plan.sloty[0].cwiczenieId = "EX-0010";
    plan.sloty[1].cwiczenieId = "EX-0064";
    const zapis = await zapytaj(`/api/plany/${planId}`, "PUT", { plan, dataStartu: null, status: "wysłany" });
    assert.equal(zapis.kod, 200, JSON.stringify(zapis.tresc));
    token = (await zapytaj(`/api/plany/${planId}/link`, "POST")).tresc.token;
  });

  after(() => {
    konsola?.kill("SIGKILL");
    rmSync(KATALOG, { recursive: true, force: true });
  });

  test("nowy plan bez nazwy (pole `nazwa` z imieniem klienta to nie nazwa planu)", async () => {
    const lista = (await zapytaj("/api/plany")).tresc;
    assert.equal(lista.find((p: any) => p.id === planId).nazwaPlanu, null);
  });

  test("nazwa zapisuje się od razu, bez wersji roboczej; widać ją na liście i w kartotece", async () => {
    const { kod, tresc } = await zapytaj(`/api/plany/${planId}/nazwa`, "PUT", { nazwa: "  Redukcja   zima " });
    assert.equal(kod, 200, JSON.stringify(tresc));
    assert.equal(tresc.zapisany.plan.tytul, "Redukcja zima");
    assert.equal(tresc.zmianyDlaKlienta, null, "wysłany plan bez „zmiany czekają”");
    const lista = (await zapytaj("/api/plany")).tresc;
    const naLiscie = lista.find((p: any) => p.id === planId);
    assert.deepEqual([naLiscie.nazwaPlanu, naLiscie.zmianyCzekaja], ["Redukcja zima", false]);
    const kartoteka = (await zapytaj(`/api/klienci/${naLiscie.klientId}`)).tresc;
    assert.equal(kartoteka.plany.find((p: any) => p.id === planId).nazwaPlanu, "Redukcja zima");
    // Zwykły zapis planu z konsoli niesie tę nazwę dalej — nie ma czego zatwierdzać.
    const plan = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan;
    assert.equal((await zapytaj(`/api/plany/${planId}`, "PUT", { plan })).tresc.zmianyDlaKlienta, null);
  });

  test("za długa — odmowa; puste pole zdejmuje nazwę", async () => {
    const dluga = await zapytaj(`/api/plany/${planId}/nazwa`, "PUT", { nazwa: "x".repeat(61) });
    assert.equal(dluga.kod, 400);
    assert.match(dluga.tresc.blad, /60 znaków/);
    const pusta = await zapytaj(`/api/plany/${planId}/nazwa`, "PUT", { nazwa: "" });
    assert.equal(pusta.kod, 200);
    assert.equal((await zapytaj("/api/plany")).tresc.find((p: any) => p.id === planId).nazwaPlanu, null);
    assert.equal((await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan.tytul, undefined, "pole znika");
  });
});
