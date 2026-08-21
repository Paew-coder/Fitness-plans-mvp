/**
 * Wspólna obsługa przeglądów klikanych: serwer na czystej bazie, Chromium
 * i liczenie kontroli. Używają tego `przeglad-ekranow.ts` (konsola trenera)
 * i `przeglad-klienta.ts` (aplikacja na telefon).
 *
 * Wydzielone, bo to jedyny kawałek, który oba przeglądy mają identyczny —
 * a serwer stawiany na dwa sposoby prędzej czy później rozjeżdża się tak,
 * że jeden przegląd testuje co innego niż drugi.
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
export async function zKonsola(
  port: number,
  przebieg: (przegladarka: any, srodowisko: Srodowisko) => Promise<void>,
): Promise<void> {
  const { chromium } = await wczytajPlaywrighta();
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
  let przegladarka: any = null;
  try {
    serwer = spawn("node", ["--no-warnings", "serwer.ts"], {
      cwd: KONSOLA,
      env: { ...process.env, PORT: String(port), BAZA_CRAFTMYPLAN: join(katalog, "przeglad.db") },
      stdio: "ignore",
    });
    await czekajNaSerwer(adres);
    przegladarka = await chromium.launch();
    await przebieg(przegladarka, { adres, api });
  } finally {
    await przegladarka?.close();
    serwer?.kill();
    rmSync(katalog, { recursive: true, force: true });
  }
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

/** Zbiera to, co przeglądarka zgłasza jako błąd — cicha awaria to też awaria. */
export function pilnujBledow(s: any): string[] {
  const bledy: string[] = [];
  s.on("pageerror", (e: Error) => bledy.push(String(e)));
  s.on("console", (m: any) => { if (m.type() === "error") bledy.push(m.text()); });
  return bledy;
}
