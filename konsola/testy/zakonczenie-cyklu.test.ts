/**
 * „Zakończ cykl” przed ostatnim treningiem (23.11.2026).
 *
 * Trener: „zdarza się tak, że np. jeden trening zostanie pominięty w planie,
 * i mimo to chciałbym, żeby była możliwość zakończenia cyklu”. Status
 * „zakończony” (przycisk „⏹ Zakończ cykl” w konsoli): telefon dostaje
 * `zakonczony` i pokazuje „Cykl zakończony” z pominiętymi treningami, konsola
 * widzi to w Realizacji, a klient przestaje wołać o uwagę. Telefon —
 * `narzedzia/przeglad-klienta.ts`.
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

describe("zakończenie cyklu — trasy serwera", () => {
  const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
  const KATALOG = mkdtempSync(join(tmpdir(), "koniec-cyklu-test-"));
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
    planId = (await zapytaj("/api/plany", "POST", { klient: "Jan Przykładowy", wersja: 1, tygodni: 4 })).tresc.zapisany.id;
    const plan = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan;
    plan.sloty[0].cwiczenieId = "EX-0010";
    plan.serieMaksymalne = [{ cwiczenieId: "EX-0010", ciezar: 100, powtorzenia: 1 }];
    assert.equal((await zapytaj(`/api/plany/${planId}`, "PUT", { plan, dataStartu: null, status: "wysłany" })).kod, 200);
    token = (await zapytaj(`/api/plany/${planId}/link`, "POST")).tresc.token;
    for (const tydzien of [1, 2, 3]) {
      assert.equal((await zapytaj(`/api/klient/${token}/dzien`, "POST", { dzien: 1, tydzien })).kod, 200);
    }
  });

  after(() => {
    konsola?.kill("SIGKILL");
    rmSync(KATALOG, { recursive: true, force: true });
  });

  test("wysłany plan: telefon nie widzi zakończenia, realizacja 3 z 4", async () => {
    assert.equal((await zapytaj(`/api/klient/${token}`)).tresc.zakonczony, false);
    const r = (await zapytaj(`/api/plany/${planId}`)).tresc.realizacja;
    assert.deepEqual([r.ukonczonych, r.zaplanowanych, r.zakonczony], [3, 4, false]);
  });

  test("status „zakończony”: telefon dostaje zakończenie, plan i wpisy zostają; zapis z telefonu dalej możliwy", async () => {
    assert.equal((await zapytaj(`/api/plany/${planId}`, "PUT", { status: "zakończony" })).kod, 200);
    const widok = (await zapytaj(`/api/klient/${token}`)).tresc;
    assert.equal(widok.zakonczony, true);
    assert.equal(widok.tygodnie.length, 4);
    assert.equal(widok.tygodnie.flatMap((t: any) => t.dni).filter((d: any) => d.ukonczony).length, 3);
    assert.equal((await zapytaj(`/api/plany/${planId}`)).tresc.realizacja.zakonczony, true);
    // Kolejka z telefonu sprzed zakończenia nie może przepaść.
    assert.equal((await zapytaj(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D1-S01", tydzien: 3, feedback: "OK" })).kod, 200);
  });

  test("zakończony cykl nie woła o uwagę; „wysłany” cofa zakończenie", async () => {
    const uwaga = (await zapytaj("/api/uwaga")).tresc;
    assert.ok(!JSON.stringify(uwaga).includes(planId), JSON.stringify(uwaga));
    assert.equal((await zapytaj(`/api/plany/${planId}`, "PUT", { status: "wysłany" })).kod, 200);
    assert.equal((await zapytaj(`/api/klient/${token}`)).tresc.zakonczony, false);
  });
});
