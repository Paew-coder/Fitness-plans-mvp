/**
 * Czego serwerowi nie wolno zrobić: przewrócić się.
 *
 * Błąd, po którym ten plik powstał, był najpoważniejszy z dotychczasowych.
 * Zwykłe `GET /klient/` **kładło cały proces konsoli** — bez hasła, jednym
 * żądaniem, z dowolnego miejsca w sieci:
 *
 *   1. `/klient/` wskazuje katalog, a `existsSync` jest dla katalogu prawdziwe;
 *   2. serwer wysyłał nagłówki i dopiero potem próbował odczytać katalog
 *      jako plik — wyjątek leciał **po** rozpoczęciu odpowiedzi;
 *   3. obsługa błędu chciała odpowiedzieć drugi raz, `writeHead` rzucał
 *      ERR_HTTP_HEADERS_SENT już spoza bloku `try` i proces kończył się.
 *
 * Konsola znikała razem z dostępem wszystkich klientów. A `/klient/` było
 * dokładnie tym adresem, który otwierała aplikacja dodana do ekranu głównego,
 * bo `start_url` w manifeście prowadził do katalogu zamiast do linku klienta.
 *
 * Test wysyła serię żądań, po których serwer ma **dalej odpowiadać**.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4196;
const ADRES = `http://127.0.0.1:${PORT}`;

let katalog = "";
let serwer: ChildProcess | null = null;

/** `null`, gdy serwer w ogóle nie odpowiedział — czyli gdy go już nie ma. */
async function kod(sciezka: string): Promise<number | null> {
  try {
    return (await fetch(`${ADRES}${sciezka}`)).status;
  } catch {
    return null;
  }
}

before(async () => {
  katalog = mkdtempSync(join(tmpdir(), "craftmyplan-odpornosc-"));
  serwer = spawn("node", ["--no-warnings", "serwer.ts"], {
    cwd: KONSOLA,
    env: { ...process.env, PORT: String(PORT), BAZA_CRAFTMYPLAN: join(katalog, "test.db"),
      KOPIE_CRAFTMYPLAN: join(katalog, "kopie") },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${ADRES}/api/cwiczenia`)).ok) break; } catch { /* czekamy */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(() => {
  serwer?.kill();
  rmSync(katalog, { recursive: true, force: true });
});

describe("żądania, które kładły serwer", () => {
  const zabojcze = [
    "/klient/",              // katalog aplikacji klienta — start_url z manifestu
    "/klient",               // to samo bez ukośnika
    "/",                     // katalog główny public/ (obsługiwany jako index.html)
    "/api/",                 // katalog, który wygląda jak adres API
  ];

  for (const sciezka of zabojcze) {
    test(`${sciezka} nie kończy procesu`, async () => {
      await kod(sciezka);
      assert.notEqual(await kod("/api/cwiczenia"), null,
        `serwer przestał odpowiadać po żądaniu ${sciezka}`);
    });
  }

  test("katalog to nie plik — odpowiedź jest, ale to 404", async () => {
    assert.equal(await kod("/klient/"), 404);
  });

  test("po serii takich żądań konsola dalej pracuje", async () => {
    for (const s of [...zabojcze, ...zabojcze]) await kod(s);
    assert.equal(await kod("/api/cwiczenia"), 200);
  });
});

describe("wyjście poza katalog publiczny", () => {
  for (const sciezka of [
    "/../serwer.ts",
    "/../../etc/passwd",
    "/klient/../../magazyn.ts",
    "/%2e%2e/serwer.ts",
  ]) {
    test(`${sciezka} nie wydaje pliku spoza public/`, async () => {
      const odp = await fetch(`${ADRES}${sciezka}`);
      const tresc = odp.ok ? await odp.text() : "";
      assert.equal(tresc.includes("magazyn") && tresc.includes("import"), false,
        "wyszedł plik z kodem serwera");
      assert.equal(tresc.includes("root:"), false, "wyszedł plik systemowy");
    });
  }

  test("serwer żyje po próbach wyjścia poza katalog", async () => {
    assert.equal(await kod("/api/cwiczenia"), 200);
  });
});

describe("manifest aplikacji klienta", () => {
  /**
   * `start_url` rozwiązuje się względem manifestu, czyli do `/klient/` —
   * adresu bez tokenu. Aplikacja dodana do ekranu głównego otwierałaby pustkę,
   * a przy okazji kładła serwer. Bez tego pola przeglądarka używa adresu
   * otwartej strony, czyli `/k/<token>`, i to jest jedyne poprawne zachowanie.
   */
  test("manifest nie narzuca adresu startowego", () => {
    const manifest = JSON.parse(
      readFileSync(join(KONSOLA, "public", "klient", "manifest.json"), "utf-8"));
    assert.equal("start_url" in manifest, false,
      "start_url prowadziłby aplikację do adresu bez tokenu klienta");
    assert.equal(manifest.scope, "/", "zakres musi obejmować /k/<token>");
  });
});
