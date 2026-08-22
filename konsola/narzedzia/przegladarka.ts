/**
 * Wspólne rusztowanie kontroli, które potrzebują działającej konsoli: serwer
 * na czystej bazie, Chromium i liczenie wyników. Używają tego przeglądy
 * klikane (`przeglad-ekranow.ts`, `przeglad-klienta.ts`) i sprawdzenie
 * pełnego kółka przez arkusz (`sprawdz-kolko.ts`).
 *
 * Wydzielone, bo to jedyny kawałek, który mają identyczny — a serwer stawiany
 * na trzy sposoby prędzej czy później rozjeżdża się tak, że jedna kontrola
 * sprawdza co innego niż druga.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");

let bledow = 0;

export function sprawdz(nazwa: string, warunek: boolean, szczegol = ""): void {
  console.log(`  ${warunek ? "✓" : "✗"} ${nazwa}${szczegol ? ` — ${szczegol}` : ""}`);
  if (!warunek) bledow++;
}

export function doliczBledy(ile: number): void {
  bledow += ile;
}

/** Wypisuje podsumowanie i kończy proces kodem, który widzi powłoka. */
export function podsumuj(coDziala: string): never {
  console.log(bledow === 0
    ? `\n  ✓ ${coDziala}\n`
    : `\n  ✗ ${bledow} kontrolek nie działa\n`);
  process.exit(bledow === 0 ? 0 : 1);
}

/**
 * Playwright bywa zainstalowany globalnie, a nie w tym projekcie — nie jest
 * jego zależnością, bo to narzędzie do ręcznego puszczania, nie do `npm test`.
 */
export async function wczytajPlaywrighta(): Promise<{ chromium: any }> {
  try {
    return await import("playwright");
  } catch { /* spróbujemy globalnie */ }
  try {
    const globalny = execFileSync("npm", ["root", "-g"], { encoding: "utf-8" }).trim();
    return await import(join(globalny, "playwright", "index.mjs"));
  } catch {
    console.error("Brakuje Playwrighta. Zainstaluj: npm i -g playwright && npx playwright install chromium");
    process.exit(2);
  }
}

export type Srodowisko = {
  adres: string;
  /** Wywołanie API konsoli — do zasiania danych i do sprawdzania skutków. */
  api: (sciezka: string, metoda?: string, cialo?: unknown) => Promise<any>;
};

/**
 * Stawia konsolę na świeżej bazie w katalogu tymczasowym, uruchamia Chromium
 * i oddaje jedno i drugie. Po wszystkim sprząta — także wtedy, gdy przegląd
 * się wywali, bo inaczej po każdym nieudanym przebiegu zostaje wiszący serwer.
 */
export async function zSerwerem(
  port: number,
  przebieg: (srodowisko: Srodowisko) => Promise<void>,
): Promise<void> {
  const katalog = mkdtempSync(join(tmpdir(), "craftmyplan-przeglad-"));
  const adres = `http://127.0.0.1:${port}`;

  const api = async (sciezka: string, metoda = "GET", cialo?: unknown) => {
    const odp = await fetch(`${adres}${sciezka}`, {
      method: metoda,
      headers: cialo ? { "content-type": "application/json" } : {},
      body: cialo ? JSON.stringify(cialo) : undefined,
    });
    return await odp.json();
  };

  let serwer: ChildProcess | null = null;
  try {
    serwer = spawn("node", ["--no-warnings", "serwer.ts"], {
      cwd: KONSOLA,
      env: {
        ...process.env,
        PORT: String(port),
        BAZA_CRAFTMYPLAN: join(katalog, "przeglad.db"),
        KOPIE_CRAFTMYPLAN: join(katalog, "kopie"),
      },
      stdio: process.env.PRZEGLAD_GLOSNO ? "inherit" : "ignore",
    });
    await czekajNaSerwer(adres);
    await przebieg({ adres, api });
  } finally {
    serwer?.kill();
    rmSync(katalog, { recursive: true, force: true });
  }
}

/** To samo, plus Chromium — dla kontroli, które klikają po ekranie. */
export async function zKonsola(
  port: number,
  przebieg: (przegladarka: any, srodowisko: Srodowisko) => Promise<void>,
): Promise<void> {
  const { chromium } = await wczytajPlaywrighta();
  await zSerwerem(port, async (srodowisko) => {
    const przegladarka = await chromium.launch();
    try {
      await przebieg(przegladarka, srodowisko);
    } finally {
      await przegladarka.close();
    }
  });
}

async function czekajNaSerwer(adres: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${adres}/api/cwiczenia`)).ok) return;
    } catch { /* jeszcze nie wstał */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("serwer konsoli nie wstał");
}

/**
 * Czeka na element i **oddaje odpowiedź zamiast rzucać wyjątkiem**.
 *
 * `waitForSelector` po upływie czasu przerywa cały przegląd, więc jedna
 * regresja zabiera ze sobą wszystkie kontrole stojące za nią — a to właśnie
 * wtedy najbardziej chce się wiedzieć, co jeszcze przestało działać.
 * Tutaj brak elementu to zwykłe `false`, które idzie wprost do `sprawdz`.
 */
export async function czekajNa(s: any, selektor: string, ms = 3000): Promise<boolean> {
  try {
    await s.waitForSelector(selektor, { timeout: ms });
    return true;
  } catch {
    return false;
  }
}

/** Zbiera to, co przeglądarka zgłasza jako błąd — cicha awaria to też awaria. */
export function pilnujBledow(s: any): string[] {
  const bledy: string[] = [];
  s.on("pageerror", (e: Error) => bledy.push(String(e)));
  s.on("console", (m: any) => { if (m.type() === "error") bledy.push(m.text()); });
  return bledy;
}
