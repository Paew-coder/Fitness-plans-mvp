#!/usr/bin/env node
/**
 * Przegląd ekranu planu — klikanie po wszystkich kontrolkach, po kolei.
 *
 *   npm run przeglad-ekranu
 *
 * Po co osobne narzędzie: testy jednostkowe pilnują silnika i serwera, ale
 * nie dotykają tego, co dzieje się w przeglądarce. A tam psuje się najciszej.
 * Trzy błędy wyszły dopiero z kliknięcia, żaden nie był widoczny w kodzie
 * ani w `npm test`:
 *
 *   1. zakładki tygodni siedziały w `<label>`, więc każde kliknięcie trafiało
 *      w T1 — konsola pokazywała wyłącznie pierwszy tydzień;
 *   2. panel serii maksymalnych nie odrysowywał się po dobraniu ćwiczenia,
 *      więc pola na serię pojawiały się dopiero po ponownym otwarciu planu;
 *   3. pola serii maksymalnej kasowały się nawzajem — wpisanie ciężaru
 *      czyściło powtórzenia i odwrotnie, więc **nie dało się jej wpisać wcale**,
 *      a bez niej nie liczy się żaden ciężar.
 *
 * Każda kontrola sprawdza skutek **po stronie serwera**, nie to, co widać:
 * pytamy bazę, czy klik faktycznie coś zapisał. Ekran, który ładnie wygląda
 * i nic nie zapisuje, ma tu wypaść na czerwono.
 *
 * Wymaga Playwrighta z Chromium. Nie chodzi w `npm test`, bo tam przeglądarki
 * nie ma — to jest kontrola do puszczenia po zmianach w `public/`.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KATALOG = dirname(fileURLToPath(import.meta.url));
const KONSOLA = join(KATALOG, "..");
const PORT = 4189;
const ADRES = `http://127.0.0.1:${PORT}`;
const KLIENT = "Przegląd ekranu";
const PLAN = "przeglad-ekranu-1";

let bledow = 0;
function sprawdz(nazwa: string, warunek: boolean, szczegol = ""): void {
  console.log(`  ${warunek ? "✓" : "✗"} ${nazwa}${szczegol ? ` — ${szczegol}` : ""}`);
  if (!warunek) bledow++;
}

/**
 * Playwright bywa zainstalowany globalnie, a nie w tym projekcie — nie jest
 * jego zależnością, bo to narzędzie do ręcznego puszczania, nie do `npm test`.
 */
async function wczytajPlaywrighta(): Promise<{ chromium: any }> {
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

async function czekajNaSerwer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const o = await fetch(`${ADRES}/api/cwiczenia`);
      if (o.ok) return;
    } catch { /* jeszcze nie wstał */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("serwer konsoli nie wstał");
}

async function main(): Promise<void> {
  const { chromium } = await wczytajPlaywrighta();
  const katalog = mkdtempSync(join(tmpdir(), "craftmyplan-przeglad-"));
  const serwer = spawn("node", ["--no-warnings", "serwer.ts"], {
    cwd: KONSOLA,
    env: { ...process.env, PORT: String(PORT), BAZA_CRAFTMYPLAN: join(katalog, "przeglad.db") },
    stdio: "ignore",
  });

  const przegladarka = await (async () => {
    try {
      await czekajNaSerwer();
      await fetch(`${ADRES}/api/plany`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ klient: KLIENT, wersja: 1 }),
      });
      return await chromium.launch();
    } catch (e) {
      serwer.kill();
      rmSync(katalog, { recursive: true, force: true });
      throw e;
    }
  })();

  try {
    await przejdz(przegladarka);
  } finally {
    await przegladarka.close();
    serwer.kill();
    rmSync(katalog, { recursive: true, force: true });
  }
}

async function przejdz(przegladarka: any): Promise<void> {
  const bledyPrzegladarki: string[] = [];
  const s = await przegladarka.newPage({ viewport: { width: 1500, height: 1000 } });
  s.on("pageerror", (e: Error) => bledyPrzegladarki.push(String(e)));
  s.on("console", (m: any) => { if (m.type() === "error") bledyPrzegladarki.push(m.text()); });

  // Konsola pyta przed każdą operacją, która nadpisuje cudzą robotę. Bez tego
  // Playwright odrzuca pytanie po cichu i wychodzi, że przycisk nie działa.
  const pytania: string[] = [];
  s.on("dialog", (d: any) => { pytania.push(d.message()); d.accept(); });

  /** Stan prosto z serwera — sprawdzamy skutek kliknięcia, nie sam ekran. */
  const zBazy = async () => await (await fetch(`${ADRES}/api/plany/${PLAN}`)).json();
  const zapisano = () => s.waitForFunction(
    () => document.querySelector("#zapis")?.textContent === "zapisano", null, { timeout: 8000 });

  await s.goto(ADRES, { waitUntil: "networkidle" });
  await s.locator("#lista-klientow .pozycja", { hasText: KLIENT })
    .getByRole("button", { name: "Otwórz" }).click();
  await s.locator("#lista-cykli").getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-plan:not(.ukryty)");

  const wiersz = (n: number) =>
    s.locator("#dni tr").filter({ has: s.locator("td.cwiczenie select") }).nth(n);

  // ── 1. dobór ćwiczenia ────────────────────────────────────────────
  await wiersz(0).locator("td.cwiczenie select").selectOption({ label: "Barbell back squat" });
  await zapisano();
  sprawdz("wybór ćwiczenia zapisuje się",
    (await zBazy()).zapisany.plan.sloty[0].cwiczenieId === "EX-0010");

  // ── 2. panel serii maksymalnych po doborze, bez przeładowania ─────
  const serie = s.locator(".serie-max-wiersz");
  sprawdz("panel serii maksymalnych odrysowuje się od razu",
    await serie.first().isVisible().catch(() => false));

  // ── 3. seria maksymalna — oba pola razem ──────────────────────────
  await serie.first().locator("input").nth(0).fill("120");
  await serie.first().locator("input").nth(1).fill("3");
  await serie.first().locator("input").nth(1).blur();
  await zapisano();
  const poSerii = await zBazy();
  sprawdz("seria maksymalna zapisuje się w komplecie",
    poSerii.zapisany.plan.serieMaksymalne.length === 1,
    JSON.stringify(poSerii.zapisany.plan.serieMaksymalne));
  sprawdz("z serii wychodzi 1RM i policzony ciężar",
    poSerii.wynik.tygodnie[0].sloty[0].oneRM > 0
    && typeof poSerii.wynik.tygodnie[0].sloty[0].ciezar === "number",
    `1RM ${poSerii.wynik.tygodnie[0].sloty[0].oneRM} → ${poSerii.wynik.tygodnie[0].sloty[0].ciezar} kg`);

  // ── 4. serie / powtórzenia / RPE w bieżącym tygodniu ──────────────
  const liczby = () => wiersz(0).locator("td.liczba input");
  await liczby().nth(0).fill("5");
  await liczby().nth(1).fill("5");
  await liczby().nth(2).fill("7.5");
  await liczby().nth(2).blur();
  await zapisano();
  const t1 = (await zBazy()).zapisany.plan.sloty[0].tygodnie["1"];
  sprawdz("serie/powtórzenia/RPE zapisują się w T1",
    t1.serie === 5 && t1.powtorzenia === 5 && t1.rpe === 7.5, JSON.stringify(t1));

  // ── 5. zakładki tygodni ───────────────────────────────────────────
  await s.locator("#taby-tygodni button", { hasText: /^T3$/ }).click();
  sprawdz("zakładka tygodnia przełącza widok",
    (await s.locator("#taby-tygodni button.aktywny").textContent()) === "T3");
  await liczby().nth(2).fill("9");
  await liczby().nth(2).blur();
  await zapisano();
  const tygodnie = (await zBazy()).zapisany.plan.sloty[0].tygodnie;
  sprawdz("RPE z T3 nie nadpisuje T1",
    tygodnie["1"].rpe === 7.5 && tygodnie["3"].rpe === 9,
    `T1 ${tygodnie["1"].rpe} · T3 ${tygodnie["3"].rpe}`);
  await s.locator("#taby-tygodni button", { hasText: /^T1$/ }).click();

  // ── 6. drugie ćwiczenie i przenoszenie slotów ─────────────────────
  await wiersz(1).locator("td.cwiczenie select").selectOption({ label: "Barbell row" });
  await zapisano();
  await wiersz(1).hover();
  await wiersz(1).locator("button.mikro").first().click();
  await s.waitForTimeout(600);
  const kolejnosc = (await zBazy()).zapisany.plan.sloty.slice(0, 2).map((x: any) => x.cwiczenieId);
  sprawdz("strzałka przenosi ćwiczenie", kolejnosc[0] === "EX-0016", kolejnosc.join(" → "));

  // ── 7. progresja z szablonu i kopiowanie tygodnia ─────────────────
  pytania.length = 0;
  await s.click("#progresja-szablonu");
  await s.waitForTimeout(800);
  const poProgresji = (await zBazy()).zapisany.plan.sloty
    .find((x: any) => x.cwiczenieId === "EX-0010")?.tygodnie;
  sprawdz("progresja z szablonu pyta przed nadpisaniem",
    pytania.some((p) => p.includes("Na pewno")), pytania[0]?.split("\n")[0] ?? "nie zapytała");
  sprawdz("progresja z szablonu wypełnia sześć tygodni akcesorium",
    [1, 2, 3, 4, 5, 6].every((t) => poProgresji?.[t]?.serie === 3),
    // Powtórzeń akcesoriów szablon nie podaje — liczy je automat, i tak ma zostać.
    [1, 2, 3, 4, 5, 6].map((t) =>
      `${poProgresji?.[t]?.serie}×${poProgresji?.[t]?.powtorzenia ?? "auto"}@${poProgresji?.[t]?.rpe}`).join(" "));

  const bojA1 = (await zBazy()).zapisany.plan.sloty.find((x: any) => x.lp?.startsWith("A"))?.tygodnie;
  sprawdz("bój główny dostaje progresję boju, nie akcesorium",
    bojA1?.["1"]?.serie === 6 && bojA1["1"].powtorzenia === 6 && bojA1["1"].rpe === 6.5
    && bojA1["6"].serie === 6 && bojA1["6"].powtorzenia === 3,
    `T1 ${bojA1?.["1"]?.serie}×${bojA1?.["1"]?.powtorzenia}@${bojA1?.["1"]?.rpe} · T6 ${bojA1?.["6"]?.serie}×${bojA1?.["6"]?.powtorzenia}@${bojA1?.["6"]?.rpe}`);

  // ── 8. przełączniki planu ─────────────────────────────────────────
  await s.selectOption("#tryb-akcesoriow", "licz z RPE");
  await zapisano();
  await s.selectOption("#czesc-planu", "intensywność");
  await zapisano();
  await s.fill("#data-startu", "2026-09-01");
  await zapisano();
  const ustawienia = await zBazy();
  sprawdz("tryb akcesoriów zapisany", ustawienia.zapisany.plan.trybAkcesoriow === "licz z RPE");
  sprawdz("część planu zapisana", ustawienia.zapisany.plan.czescPlanu === "intensywność");
  sprawdz("data startu zapisana", ustawienia.zapisany.dataStartu === "2026-09-01");

  // ── 9. TOP SET ────────────────────────────────────────────────────
  await s.locator(".topset input[type=checkbox]").first().uncheck();
  await zapisano();
  sprawdz("TOP SET da się wyłączyć", (await zBazy()).zapisany.plan.topSety[0].wlaczony === false);

  // ── 10. moduł oddechu ─────────────────────────────────────────────
  await s.fill("#oddech-twot", "22");
  await s.locator("#oddech-twot").blur();
  await s.waitForTimeout(700);
  const oddech = (await zBazy()).moduly.oddech.dawka;
  sprawdz("moduł oddechu liczy dawkę", oddech !== null, oddech?.poziom ?? "brak");

  // ── 11. link dla klienta ──────────────────────────────────────────
  await s.click("#link-klienta");
  await s.waitForSelector("#modal:not(.ukryty)");
  const link = await s.locator("#modal-body").innerText();
  sprawdz("link dla klienta pokazuje adres", /\/k\/[a-z0-9]+/i.test(link),
    link.match(/\/k\/\S+/)?.[0] ?? "brak");
  await s.click("#modal-zamknij");

  // ── 12. eksport arkusza ───────────────────────────────────────────
  // Arkusz nie leci przez przeglądarkę — konsola zapisuje go na dysku i podaje
  // ścieżkę. Kontrola jest więc dwuczęściowa: co pokazała i czy plik jest.
  await s.click("#eksportuj");
  await s.waitForSelector("#modal:not(.ukryty)", { timeout: 30000 });
  const sciezka = (await s.locator("#modal-body code").innerText()).trim();
  sprawdz("eksport zapisuje arkusz na dysku",
    sciezka.endsWith(".xlsx") && existsSync(sciezka), sciezka);
  await s.click("#modal-zamknij");

  // ── 13. wysyłka planu ─────────────────────────────────────────────
  await s.selectOption("#status-wybor", "wysłany");
  await s.waitForTimeout(800);
  sprawdz("plan da się wysłać", (await zBazy()).zapisany.status === "wysłany");

  console.log(bledyPrzegladarki.length
    ? `\n  błędy w przeglądarce: ${JSON.stringify(bledyPrzegladarki.slice(0, 3))}`
    : "\n  błędów w przeglądarce: brak");
  bledow += bledyPrzegladarki.length;
}

await main();
console.log(bledow === 0
  ? "\n  ✓ wszystkie kontrolki ekranu planu działają\n"
  : `\n  ✗ ${bledow} kontrolek nie działa\n`);
process.exit(bledow === 0 ? 0 : 1);
