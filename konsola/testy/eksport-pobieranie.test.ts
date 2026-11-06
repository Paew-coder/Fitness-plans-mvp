/**
 * Arkusz pobiera się do przeglądarki trenera (18.10.2026).
 *
 * Trener: „gdzie się eksportuje ten plan jako plik xlsx, bo go nie widzę?”.
 * Konsola zapisywała plik na dysku i podawała ścieżkę — na serwerze był to
 * dysk serwera, którego z laptopa ani iPada nie widać. Teraz `GET …/eksport`
 * oddaje sam plik, z nazwą klienta (także z polskimi literami).
 *
 * Eksport idzie przez Pythona z `openpyxl`. Bez niego serwer odpowiada 503
 * z wyjaśnieniem (to sprawdza `blad-pythona.test.ts`) — wtedy test pobrania
 * jest pomijany, a nie czerwony.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { naglowekZalacznika } from "../eksport-xlsx.ts";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4204;
const ADRES = `http://127.0.0.1:${PORT}`;

let katalog = "";
let serwer: ChildProcess | null = null;

before(async () => {
  katalog = mkdtempSync(join(tmpdir(), "craftmyplan-pobieranie-"));
  serwer = spawn("node", ["--no-warnings", "serwer.ts"], {
    cwd: KONSOLA,
    env: { ...process.env, PORT: String(PORT), BAZA_CRAFTMYPLAN: join(katalog, "test.db") },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${ADRES}/api/cwiczenia`)).ok) return;
    } catch { /* jeszcze nie wstał */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
after(async () => {
  if (serwer) {
    const s = serwer;
    await new Promise((r) => { s.once("exit", r); s.kill(); });
  }
  rmSync(katalog, { recursive: true, force: true });
});

describe("nagłówek pobrania", () => {
  test("polskie litery w filename*, zapas bez ogonków w filename", () => {
    assert.equal(naglowekZalacznika("Jan Przykładowy 2.0.xlsx"),
      "attachment; filename=\"Jan Przykladowy 2.0.xlsx\"; "
      + "filename*=UTF-8''Jan%20Przyk%C5%82adowy%202.0.xlsx");
    assert.match(naglowekZalacznika("Łucja Źdźbło 1.0.xlsx"), /filename="Lucja Zdzblo 1\.0\.xlsx"/);
  });
});

describe("eksport do przeglądarki", () => {
  test("GET …/eksport oddaje plik .xlsx z nazwą klienta", async (t) => {
    await fetch(`${ADRES}/api/plany`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ klient: "Jan Przykładowy", wersja: 2 }),
    });
    const plany = await (await fetch(`${ADRES}/api/plany`)).json() as { id: string; klient: string }[];
    const id = plany.find((p) => p.klient === "Jan Przykładowy")!.id;

    const odp = await fetch(`${ADRES}/api/plany/${id}/eksport`);
    if (odp.status === 503) {
      t.skip(`eksport niedostępny w tym środowisku: ${(await odp.json() as { blad: string }).blad}`);
      return;
    }
    assert.equal(odp.status, 200);
    assert.equal(odp.headers.get("content-type"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.match(odp.headers.get("content-disposition") ?? "",
      /^attachment; .*filename\*=UTF-8''Jan%20Przyk%C5%82adowy%202\.0\.xlsx$/);
    assert.equal(odp.headers.get("cache-control"), "no-store");
    const tresc = Buffer.from(await odp.arrayBuffer());
    assert.equal(tresc.subarray(0, 2).toString(), "PK", "xlsx to archiwum zip");
    assert.ok(tresc.length > 10_000, `${tresc.length} B`);
  });

  test("zmieniona nazwa w bazie — wiersz BAZA arkusza znaleziony po ID, bez duplikatu (18.10.2026)", async (t) => {
    // Szablon zna EX-0167 jako „Raised bird dog”; baza aplikacji ma już
    // „Elevated bird dog”. Wiersz ma dostać nową nazwę, a nie bliźniaka.
    await fetch(`${ADRES}/api/plany`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ klient: "Bird Dog Test", wersja: 1 }),
    });
    const plany = await (await fetch(`${ADRES}/api/plany`)).json() as { id: string; klient: string }[];
    const id = plany.find((p) => p.klient === "Bird Dog Test")!.id;
    const { zapisany } = await (await fetch(`${ADRES}/api/plany/${id}`)).json() as any;
    zapisany.plan.sloty[1].cwiczenieId = "EX-0167";
    await fetch(`${ADRES}/api/plany/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: zapisany.plan, dataStartu: null, status: "szkic" }),
    });

    const odp = await fetch(`${ADRES}/api/plany/${id}/eksport`);
    if (odp.status === 503) {
      t.skip("eksport niedostępny w tym środowisku");
      return;
    }
    assert.equal(odp.status, 200);
    const plik = join(katalog, "bird-dog.xlsx");
    writeFileSync(plik, Buffer.from(await odp.arrayBuffer()));
    const wiersze = JSON.parse(execFileSync("python3", ["-c",
      "import sys, json, openpyxl; ws = openpyxl.load_workbook(sys.argv[1])['BAZA']; "
      + "print(json.dumps([r[0] for r in ws.iter_rows(min_row=3, values_only=True) "
      + "if r[7] == 'EX-0167' or (r[0] or '').lower().endswith('bird dog') and 'row' not in (r[0] or '').lower()]))",
      plik], { encoding: "utf-8" }));
    assert.deepEqual(wiersze, ["Elevated bird dog"]);
  });

  test("nieistniejący plan — 404, bez pliku", async () => {
    const odp = await fetch(`${ADRES}/api/plany/nie-ma-takiego-1/eksport`);
    assert.equal(odp.status, 404);
  });
});
