/**
 * Kopie zapasowe — same, bez pamiętania o nich.
 *
 * Konsola chodzi na laptopie trenera i trzyma po sześć tygodni pracy każdego
 * klienta. Do tej pory jedyną kopią była ta zrobiona ręcznie poleceniem
 * `npm run kopia` — czyli, jak to z ręcznymi kopiami bywa, żadna. Jedno
 * kliknięcie „Usuń klienta" kasowało wszystko bezpowrotnie.
 *
 * Kopia robi się teraz raz na dobę przy starcie i **przed każdą migracją**.
 * Ten drugi moment jest ważniejszy: to jedyna chwila, w której aplikacja
 * przepisuje cudze dane.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KATALOG = mkdtempSync(join(tmpdir(), "kopie-test-"));
const KOPIE = join(KATALOG, "kopie");
process.env.BAZA_CRAFTMYPLAN = join(KATALOG, "test.db");
process.env.KOPIE_CRAFTMYPLAN = KOPIE;

const kopie = await import("../baza/kopie.ts");
const { baza, zamknij } = await import("../baza/polaczenie.ts");

const pliki = () => readdirSync(KOPIE).filter((f) => f.endsWith(".db")).sort();

before(() => {
  // Baza musi istnieć, żeby było co kopiować.
  baza().exec("SELECT 1");
});
after(() => {
  zamknij();
  rmSync(KATALOG, { recursive: true, force: true });
});
beforeEach(() => {
  rmSync(KOPIE, { recursive: true, force: true });
  mkdirSync(KOPIE, { recursive: true });
});

describe("kopia na żądanie", () => {
  test("powstaje plik, który da się otworzyć jako baza", async () => {
    const cel = await kopie.zrobKopie();
    assert.ok(cel, "kopia nie powstała");
    const d = new DatabaseSync(cel!, { readOnly: true });
    const tabele = d.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    d.close();
    assert.ok(tabele.some((t) => t.name === "plan"), "kopia nie zawiera tabel");
  });

  test("etykieta trafia do nazwy pliku", async () => {
    await kopie.zrobKopie("przed-czyms");
    assert.ok(pliki()[0]?.includes("przed-czyms"), pliki().join(", "));
  });
});

describe("kopia dobowa", () => {
  test("pierwsze wywołanie robi kopię", async () => {
    assert.ok(await kopie.kopiaJesliTrzeba(), "nie zrobiła pierwszej kopii");
    assert.equal(pliki().length, 1);
  });

  test("drugie wywołanie tego samego dnia już nie", async () => {
    await kopie.kopiaJesliTrzeba();
    const drugie = await kopie.kopiaJesliTrzeba();
    assert.equal(drugie, null, "zrobiła drugą kopię tego samego dnia");
    assert.equal(pliki().length, 1);
  });

  test("po upływie odstępu robi kolejną", async () => {
    await kopie.kopiaJesliTrzeba();
    // Odstęp zerowy znaczy „rób zawsze" — tak samo jak doba, która minęła.
    assert.ok(await kopie.kopiaJesliTrzeba(0));
    assert.equal(pliki().length, 2);
  });
});

describe("sprzątanie", () => {
  test("codziennych zostaje tyle, ile trzymamy", async () => {
    for (let i = 0; i < kopie.ILE_TRZYMAMY + 5; i++) {
      writeFileSync(join(KOPIE, `craftmyplan-2026-01-${String(i + 1).padStart(2, "0")}T00-00-00.db`), "x");
    }
    kopie.posprzataj();
    assert.equal(pliki().length, kopie.ILE_TRZYMAMY);
  });

  test("kopie sprzed migracji liczą się osobno i nie giną pod codziennymi", async () => {
    // Po nieudanej aktualizacji sięga się właśnie po tę jedną — a wtedy zwykle
    // minęło już trochę czasu i codzienne dawno by ją wypchnęły.
    writeFileSync(join(KOPIE, "craftmyplan-przed-migracja-v2-2026-01-01T00-00-00.db"), "x");
    for (let i = 0; i < kopie.ILE_TRZYMAMY + 5; i++) {
      writeFileSync(join(KOPIE, `craftmyplan-2026-02-${String(i + 1).padStart(2, "0")}T00-00-00.db`), "x");
    }
    kopie.posprzataj();
    assert.ok(pliki().some((f) => f.includes("przed-migracja")),
      "kopia sprzed migracji zniknęła pod codziennymi");
  });
});
