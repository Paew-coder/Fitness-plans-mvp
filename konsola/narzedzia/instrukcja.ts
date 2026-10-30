#!/usr/bin/env node
/**
 * Instrukcja dla klienta — zrzuty, wideo i prezentacja z prawdziwej aplikacji.
 *
 *   npm run instrukcja
 *
 * Trener, 18.10.2026: „czy jesteś w stanie przygotować mi jakieś wideo /
 * prezentację / instrukcję używania tej aplikacji, którą będę mógł wysyłać
 * klientom przed ich pierwszym planem?”
 *
 * Wszystko powstaje z aplikacji klienta uruchomionej na świeżej bazie,
 * z planem przykładowego klienta („Jan Przykładowy” — żadnych prawdziwych
 * danych). Po zmianie w `public/klient/` wystarczy puścić to jeszcze raz
 * i instrukcja pokazuje aktualne ekrany. Wynik ląduje w `public/instrukcja/`:
 *
 *   ekrany/*.webp     zrzuty do strony `/instrukcja`
 *   film.mp4          pionowe wideo 1080×1920 (WhatsApp, Instagram)
 *   film-plakat.webp  pierwsza klatka filmu na stronie
 *   instrukcja.pdf    te same plansze jako prezentacja
 *
 * Wersja angielska (27.10.2026, do planów po angielsku):
 *
 *   npm run instrukcja -- en
 *
 * Ten sam przebieg na planie oznaczonym jako angielski („John Example”),
 * plansze po angielsku, wynik w `public/instrukcja/en/` — strona
 * `/instrukcja/en` (`en/index.html`, pisana ręcznie). Polskie pliki zostają.
 *
 * Wymaga Playwrighta z Chromium i ffmpeg z libx264 i libwebp.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { zKonsola, type Srodowisko } from "./przegladarka.ts";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Wersja angielska — dla klientów z planem po angielsku. */
const EN = process.argv.slice(2).includes("en");
const WYJSCIE = join(KONSOLA, "public", "instrukcja", ...(EN ? ["en"] : []));
const EKRANY = join(WYJSCIE, "ekrany");
const ROBOCZY = mkdtempSync(join(tmpdir(), "instrukcja-"));
const PORT = 4193;

/** iPhone: podpowiedź o ekranie głównym mówi wtedy o ikonie udostępniania. */
const TELEFON = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  colorScheme: "dark",
  locale: EN ? "en-GB" : "pl-PL",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    + "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};

/** Plan przykładowy: trzy dni, ćwiczenia z filmami, superserie B, C i D. */
const CWICZENIA: Record<string, string> = {
  "D1-S01": "EX-0010", "D1-S02": "EX-0059", "D1-S03": "EX-0077", "D1-S04": "EX-0168",
  "D1-S05": "EX-0128", "D1-S06": "EX-0086", "D1-S07": "EX-0050",
  "D2-S01": "EX-0011", "D2-S02": "EX-0184", "D2-S03": "EX-0042", "D2-S04": "EX-0102",
  "D2-S05": "EX-0132", "D2-S06": "EX-0170", "D2-S07": "EX-0181",
  "D3-S01": "EX-0053", "D3-S02": "EX-0111", "D3-S03": "EX-0158", "D3-S04": "EX-0121",
  "D3-S05": "EX-0029", "D3-S06": "EX-0107", "D3-S07": "EX-0150",
};

async function zasiej({ api }: Srodowisko): Promise<string> {
  const id = (await api("/api/plany", "POST", { klient: EN ? "John Example" : "Jan Przykładowy", wersja: 1 })).zapisany.id;
  await api(`/api/plany/${id}/szablon`, "POST", { szablonId: "fbw_3dni_6w" });
  const plan = (await api(`/api/plany/${id}`)).zapisany.plan;
  for (const s of plan.sloty) if (CWICZENIA[s.positionId]) s.cwiczenieId = CWICZENIA[s.positionId];
  // Boje i część akcesoriów z maksami, reszta bez — tak wygląda pierwszy plan:
  // klient widzi kartę „Skąd wziąć ciężary” i ćwiczenia z „dobierz”.
  plan.serieMaksymalne = [
    { cwiczenieId: "EX-0010", ciezar: 100, powtorzenia: 5 },
    { cwiczenieId: "EX-0011", ciezar: 80, powtorzenia: 5 },
    { cwiczenieId: "EX-0053", ciezar: 130, powtorzenia: 5 },
    { cwiczenieId: "EX-0059", ciezar: 30, powtorzenia: 8 },
    { cwiczenieId: "EX-0168", ciezar: 90, powtorzenia: 8 },
  ];
  await api(`/api/plany/${id}`, "PUT", { plan, dataStartu: null, status: "szkic" });
  await api(`/api/plany/${id}/tygodnie`, "POST", { tryb: "progresja", zrodlo: 1 });
  const zProgresja = (await api(`/api/plany/${id}`)).zapisany.plan;
  await api(`/api/plany/${id}`, "PUT", { plan: zProgresja, dataStartu: null, status: "wysłany" });
  if (EN) await api(`/api/plany/${id}/jezyk`, "PUT", { jezyk: "en" });
  return (await api(`/api/plany/${id}/link`, "POST")).sciezka;
}

/** Napisy przycisków, w które przegląd klika — w języku planu. */
const PRZYCISKI = EN
  ? { pominPrzerwe: "Skip rest", calyDzien: "Whole day as a list" }
  : { pominPrzerwe: "Pomiń przerwę", calyDzien: "Cały dzień na liście" };

// ── znaczniki na zrzutach ─────────────────────────────────────────────
const KOLOR = "#FFC857";

/** Żółta ramka wokół fragmentu albo kółko „tu dotknij” na przycisku. */
async function zaznacz(s: any, cel: any, rodzaj: "ramka" | "dotyk"): Promise<void> {
  const r = await cel.boundingBox();
  if (!r) throw new Error("Nie widać elementu do zaznaczenia");
  await s.evaluate(([r, rodzaj, kolor]: [any, string, string]) => {
    const d = document.createElement("div");
    d.className = "znacznik-instrukcji";
    const styl = d.style;
    styl.position = "fixed";
    styl.pointerEvents = "none";
    styl.zIndex = "9999";
    if (rodzaj === "ramka") {
      Object.assign(styl, {
        left: `${r.x - 6}px`, top: `${r.y - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`,
        border: `3px solid ${kolor}`, borderRadius: "16px", boxShadow: "0 0 0 6px rgba(255,200,87,.22)",
      });
    } else {
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      Object.assign(styl, {
        left: `${x - 27}px`, top: `${y - 27}px`, width: "54px", height: "54px", borderRadius: "50%",
        background: "rgba(255,200,87,.35)", border: `3px solid ${kolor}`,
        boxShadow: "0 0 0 10px rgba(255,200,87,.16)",
      });
    }
    document.body.append(d);
  }, [r, rodzaj, KOLOR]);
}
async function bezZnacznikow(s: any): Promise<void> {
  await s.evaluate(() => document.querySelectorAll(".znacznik-instrukcji").forEach((e) => e.remove()));
}

/** Przewija tak, żeby element stał `odGory` pikseli pod górą ekranu. */
async function ustaw(cel: any, odGory: number): Promise<void> {
  await cel.evaluate((e: Element, odGory: number) => {
    window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top - odGory);
  }, odGory);
  await cel.page().waitForTimeout(250);
}

const zrzuty = new Map<string, string>();
async function zrzut(s: any, nazwa: string): Promise<void> {
  const png = join(ROBOCZY, `${nazwa}.png`);
  await s.screenshot({ path: png });
  zrzuty.set(nazwa, png);
  await bezZnacznikow(s);
}

// ── przejście po aplikacji ────────────────────────────────────────────
async function zrobZrzuty(przegladarka: any, srodowisko: Srodowisko): Promise<void> {
  const sciezka = await zasiej(srodowisko);
  const kontekst = await przegladarka.newContext(TELEFON);
  // Karta „Jak korzystać z aplikacji” na górze strony głównej — w samej
  // instrukcji zbędna (link do siebie samej); zrzuty pokazują plan.
  await kontekst.addInitScript((klucz: string) => localStorage.setItem(klucz, "usunieta"),
    `instrukcja-${sciezka.split("/")[2]}`);
  const s = await kontekst.newPage();
  await s.goto(`${srodowisko.adres}${sciezka}`, { waitUntil: "networkidle" });
  if (EN) await s.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 10000 });
  await s.waitForTimeout(400);

  await zrzut(s, "glowna");
  await zaznacz(s, s.locator("#nastepny-trening"), "dotyk");
  await zrzut(s, "glowna-dotyk");

  await ustaw(s.locator("#pomiary-baner"), 70);
  await zaznacz(s, s.locator("#pomiary-baner"), "ramka");
  await zrzut(s, "ciezary");

  await s.locator("#rpe-baner details.rpe summary").click();
  await ustaw(s.locator("#rpe-baner"), 60);
  await zaznacz(s, s.locator("#rpe-baner details.rpe"), "ramka");
  await zrzut(s, "rpe");
  await s.locator("#rpe-baner details.rpe summary").click();

  await ustaw(s.locator("#baner-instalacji"), 120);
  await zaznacz(s, s.locator("#baner-instalacji"), "ramka");
  await zrzut(s, "instalacja");

  // Lista dnia. „Jak trenować” zwijamy — na zrzucie mają być ćwiczenia.
  await s.evaluate(() => window.scrollTo(0, 0));
  await s.click("#nastepny-trening");
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  await s.waitForTimeout(300);
  await s.locator("#jak-trenowac > summary").click();
  await s.waitForTimeout(200);
  const b1 = s.locator('#cwiczenia [data-position="D1-S02"]');
  const b2 = s.locator('#cwiczenia [data-position="D1-S03"]');
  await ustaw(b1, 110);
  const b1r = await b1.boundingBox();
  const b2r = await b2.boundingBox();
  await s.evaluate(([a, b, kolor]: [any, any, string]) => {
    const d = document.createElement("div");
    d.className = "znacznik-instrukcji";
    Object.assign(d.style, {
      position: "fixed", pointerEvents: "none", zIndex: "9999",
      left: `${a.x - 8}px`, top: `${a.y - 6}px`, width: `${a.width + 14}px`,
      height: `${b.y + b.height - a.y + 12}px`, border: `3px solid ${kolor}`, borderRadius: "16px",
      boxShadow: "0 0 0 6px rgba(255,200,87,.22)",
    });
    document.body.append(d);
  }, [b1r, b2r, KOLOR]);
  await zrzut(s, "superseria");

  // Karta z „dobierz” — wpisana pierwsza seria. W planie 8 powtórzeń przy
  // RPE 8, a wpisane 10: trener, 19.10.2026 — dobierając ciężar nie trzeba
  // trzymać się liczby powtórzeń; zrobione 10 z tym samym zapasem się wpisuje,
  // a ciężar się dostosuje.
  const wiersz = b2.locator(".wykonanie-pola input");
  await ustaw(b2, 100);
  await wiersz.nth(0).fill("30");
  await wiersz.nth(1).fill("10");
  await wiersz.nth(1).press("Tab");
  await s.waitForTimeout(700);
  await s.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const karta = s.locator('#cwiczenia [data-position="D1-S03"]');
  await ustaw(karta, 100);
  await zaznacz(s, karta.locator(".wykonanie").first(), "ramka");
  await zrzut(s, "karta");
  await zaznacz(s, karta.locator(".zadanie-blok").first(), "ramka");
  await zaznacz(s, karta.locator(".wykonanie-pola input").first(), "ramka");
  await zaznacz(s, karta.locator(".wykonanie-pola input").nth(1), "ramka");
  await zrzut(s, "dobor");

  // Ocena na liście: A1 „OK”.
  const a1 = s.locator('#cwiczenia [data-position="D1-S01"]');
  await a1.locator(".oceny button", { hasText: "OK" }).click();
  await s.waitForTimeout(400);
  await ustaw(a1.locator(".oceny"), 330);
  await zaznacz(s, a1.locator(".oceny"), "ramka");
  await zrzut(s, "ocena");

  // Prowadzenie seria po serii.
  await s.evaluate(() => window.scrollTo(0, 0));
  await s.click("#prowadz");
  await s.waitForSelector("#ekran-seria:not(.ukryty)");
  await s.waitForTimeout(400);
  await zrzut(s, "prowadzenie");
  const pola = s.locator("#panel input");
  await ustaw(pola.first(), 300);
  await zaznacz(s, pola.first(), "ramka");
  await zaznacz(s, s.locator("#panel button.glowny").first(), "dotyk");
  await zrzut(s, "prowadzenie-dotyk");
  await s.locator("#panel button.glowny").first().click();
  await s.waitForTimeout(1300);
  await zaznacz(s, s.locator("#panel button", { hasText: PRZYCISKI.pominPrzerwe }), "dotyk");
  await zrzut(s, "przerwa");

  // Koniec treningu z listy.
  await s.locator("#panel button", { hasText: PRZYCISKI.pominPrzerwe }).click();
  await s.waitForTimeout(300);
  await s.locator("#panel", { hasText: PRZYCISKI.calyDzien }).getByText(PRZYCISKI.calyDzien).click();
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  // Przycisk stoi na samym dole strony — bez zapasu pod spodem nie da się
  // go przewinąć na wysokość, którą widać w ramce telefonu na planszy.
  await s.addStyleTag({ content: "body { padding-bottom: 60vh !important; }" });
  await ustaw(s.locator("#zakoncz"), 470);
  await zaznacz(s, s.locator("#zakoncz"), "dotyk");
  await zrzut(s, "zakoncz");
  await s.click("#zakoncz");
  await s.waitForTimeout(800);
  await s.addStyleTag({ content: "body { padding-bottom: calc(2rem + env(safe-area-inset-bottom)) !important; }" });
  if (await s.locator("#ekran-trening").isVisible()) await s.click("#wroc-z-treningu");
  await s.waitForSelector("#ekran-tygodnie:not(.ukryty)");
  await s.evaluate(() => window.scrollTo(0, 0));
  await s.waitForTimeout(300);
  await zaznacz(s, s.locator(".naglowek-planu"), "ramka");
  await zrzut(s, "koniec");

  // Serie maksymalne.
  await s.locator("#pokaz-pomiary").click();
  await s.waitForSelector("#ekran-pomiary:not(.ukryty)");
  await s.waitForTimeout(300);
  await zrzut(s, "maksy");
  await kontekst.close();
}

// ── plansze filmu i prezentacji ───────────────────────────────────────
type Plansza = { tytul: string; tresc: string; ekran: string };

const PLANSZE_PL: Plansza[] = [
  { tytul: "Twój plan treningowy w telefonie",
    tresc: "Minuta o tym, jak otworzyć plan, zrobić trening i dać trenerowi znać, jak poszło.",
    ekran: "glowna" },
  { tytul: "Otwórz link od trenera",
    tresc: "To Twój plan na cały cykl. Na górze zawsze czeka następny trening — dotknij, żeby zacząć.",
    ekran: "glowna-dotyk" },
  { tytul: "Dodaj do ekranu głównego",
    tresc: "iPhone: ikona udostępniania → „Do ekranu początkowego”. Android: menu ⋮ → „Dodaj do ekranu głównego”.",
    ekran: "instalacja" },
  { tytul: "Skąd wziąć ciężary?",
    tresc: "Zacznij od razu i dobierz ciężar według RPE — albo zrób najpierw serie maksymalne.",
    ekran: "ciezary" },
  { tytul: "Co to jest RPE?",
    tresc: "Ile powtórzeń zostaje w zapasie. RPE 8 to seria, po której dwa czyste powtórzenia byłyby jeszcze możliwe.",
    ekran: "rpe" },
  { tytul: "Trening z listy",
    tresc: "Wszystkie ćwiczenia dnia, przy każdym ▶ film z techniką. B1 i B2 to superseria — robisz je na zmianę.",
    ekran: "superseria" },
  { tytul: "Wpisz swoją serię",
    tresc: "Ciężar inny niż w planie? Wpisz go — od tej serii aplikacja przeliczy resztę planu.",
    ekran: "karta" },
  { tytul: "Dobierasz ciężar? Powtórzenia nie są sztywne",
    tresc: "Plan: 8 powtórzeń przy RPE 8. Wyszło 10 i nadal 2 w zapasie? Wpisz 10 — ciężary na resztę planu pójdą w górę.",
    ekran: "dobor" },
  { tytul: "Oceń ćwiczenie",
    tresc: "Za trudne — będzie lżej. Za łatwe — ciężej. Ćwiczenia bez oceny zapiszą się jako OK.",
    ekran: "ocena" },
  { tytul: "Albo: seria po serii",
    tresc: "„▶ Prowadź mnie” pokazuje jedną serię naraz: ciężar, powtórzenia i rozgrzewkę.",
    ekran: "prowadzenie-dotyk" },
  { tytul: "Przerwa liczy się sama",
    tresc: "Odpocznij. Przerwę możesz pominąć albo wydłużyć o 30 sekund.",
    ekran: "przerwa" },
  { tytul: "Na koniec: Zakończ trening",
    tresc: "Wszystko zapisuje się od razu — także bez zasięgu. Wyśle się, gdy wróci sieć.",
    ekran: "zakoncz" },
  { tytul: "Gotowe. Dobrego treningu!",
    tresc: "Pytania o plan albo ćwiczenia? Napisz do swojego trenera.",
    ekran: "koniec" },
];

/** Te same plansze po angielsku — do filmu i PDF-u w `instrukcja/en/`. */
const PLANSZE_EN: Plansza[] = [
  { tytul: "Your training plan on your phone",
    tresc: "One minute on how to open your plan, do a workout and let your coach know how it went.",
    ekran: "glowna" },
  { tytul: "Open the link from your coach",
    tresc: "This is your plan for the whole cycle. Your next workout is always waiting at the top — tap it to start.",
    ekran: "glowna-dotyk" },
  { tytul: "Add it to your home screen",
    tresc: "iPhone: share icon → “Add to Home Screen”. Android: menu ⋮ → “Add to Home screen”.",
    ekran: "instalacja" },
  { tytul: "Where your weights come from",
    tresc: "Start right away and choose the weight by RPE — or do max sets first.",
    ekran: "ciezary" },
  { tytul: "What is RPE?",
    tresc: "How many reps you have left in reserve. RPE 8 is a set after which two more clean reps would still be possible.",
    ekran: "rpe" },
  { tytul: "Training from the list",
    tresc: "All of the day's exercises, each with a ▶ technique video. B1 and B2 are a superset — you alternate them.",
    ekran: "superseria" },
  { tytul: "Log your set",
    tresc: "Different weight than planned? Enter it — the app will recalculate the rest of the plan from that set.",
    ekran: "karta" },
  { tytul: "Choosing the weight? Reps aren't fixed",
    tresc: "Plan: 8 reps at RPE 8. Got 10 and still had 2 in reserve? Enter 10 — the weights for the rest of the plan go up.",
    ekran: "dobor" },
  { tytul: "Rate the exercise",
    tresc: "Too hard — it gets lighter. Too easy — heavier. Exercises without a rating are saved as OK.",
    ekran: "ocena" },
  { tytul: "Or: set by set",
    tresc: "“▶ Guide me” shows one set at a time: weight, reps and warm-up.",
    ekran: "prowadzenie-dotyk" },
  { tytul: "Rest is timed for you",
    tresc: "Take your rest. You can skip it or add 30 seconds.",
    ekran: "przerwa" },
  { tytul: "At the end: Finish workout",
    tresc: "Everything saves right away — even without signal. It syncs when you're back online.",
    ekran: "zakoncz" },
  { tytul: "Done. Have a great workout!",
    tresc: "Questions about your plan or the exercises? Message your coach.",
    ekran: "koniec" },
];
const PLANSZE = EN ? PLANSZE_EN : PLANSZE_PL;

const dataUrl = (plik: string, typ = "image/png") =>
  `data:${typ};base64,${readFileSync(plik).toString("base64")}`;

function htmlPlanszy(p: Plansza, numer: number, ile: number): string {
  const licznik = numer === 1 ? "" : `${numer - 1} / ${ile - 1}`;
  return `<!doctype html><html lang="${EN ? "en" : "pl"}"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; color: #E9EBF2;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: radial-gradient(130% 60% at 50% 0%, #232A4D 0%, #0F1117 62%); }
    .gora { position: absolute; left: 90px; right: 90px; top: 96px; display: flex;
      justify-content: space-between; font-size: 30px; font-weight: 700; letter-spacing: .16em;
      text-transform: uppercase; color: #7B93FF; }
    .licznik { color: #6E7688; letter-spacing: .06em; }
    .tekst { position: absolute; left: 90px; right: 90px; top: 178px; }
    h1 { margin: 0; font-size: ${p.tytul.length > 26 ? 70 : 78}px; line-height: 1.06; font-weight: 800;
      letter-spacing: -.02em; }
    p { margin: 30px 0 0; font-size: 40px; line-height: 1.32; color: #B9BFD0; }
    .telefon { position: absolute; left: 50%; top: 600px; width: 700px; transform: translateX(-50%);
      border: 12px solid #262B38; border-bottom: none; border-radius: 76px 76px 0 0; overflow: hidden;
      box-shadow: 0 40px 140px rgba(0,0,0,.65), 0 0 0 2px #343A4A; background: #0F1117; }
    .telefon img { display: block; width: 100%; }
  </style></head><body>
    <div class="gora"><span>CraftMyPlan</span><span class="licznik">${licznik}</span></div>
    <div class="tekst"><h1>${p.tytul}</h1><p>${p.tresc}</p></div>
    <div class="telefon"><img src="${dataUrl(zrzuty.get(p.ekran)!)}"></div>
    <script>
      // Telefon zaraz pod tekstem — tytuł i opis mają od dwóch do pięciu linijek.
      const dol = document.querySelector(".tekst").getBoundingClientRect().bottom;
      document.querySelector(".telefon").style.top = Math.max(480, Math.round(dol + 80)) + "px";
    </script>
  </body></html>`;
}

async function zrobPlansze(przegladarka: any): Promise<string[]> {
  const s = await (await przegladarka.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
  const pliki: string[] = [];
  for (const [i, p] of PLANSZE.entries()) {
    await s.setContent(htmlPlanszy(p, i + 1, PLANSZE.length), { waitUntil: "load" });
    const plik = join(ROBOCZY, `plansza-${String(i + 1).padStart(2, "0")}.png`);
    await s.screenshot({ path: plik });
    pliki.push(plik);
  }

  // Prezentacja: te same plansze, strona po stronie. JPEG zamiast PNG —
  // PDF z dwunastoma pełnymi PNG ważyłby kilkanaście megabajtów.
  const strony = pliki.map((plik) => {
    const jpg = plik.replace(/\.png$/, ".jpg");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", plik, "-q:v", "3", jpg]);
    return `<img src="${dataUrl(jpg, "image/jpeg")}">`;
  });
  await s.setContent(`<!doctype html><html><head><style>
      @page { size: 1080px 1920px; margin: 0; }
      body { margin: 0; } img { display: block; width: 1080px; height: 1920px; break-after: page; }
    </style></head><body>${strony.join("")}</body></html>`, { waitUntil: "load" });
  await s.pdf({ path: join(WYJSCIE, "instrukcja.pdf"), width: "1080px", height: "1920px",
    printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  return pliki;
}

/** Czas planszy: tyle, żeby spokojnie przeczytać tytuł i zdanie pod nim. */
const czasPlanszy = (p: Plansza) =>
  Math.min(8.5, Math.max(4.5, 2 + (p.tytul.length + p.tresc.length) / 22));

function zrobFilm(plansze: string[]): void {
  const PRZEJSCIE = 0.5;
  const czasy = PLANSZE.map(czasPlanszy);
  const wejscia = plansze.flatMap((plik, i) =>
    ["-framerate", "30", "-loop", "1", "-t", czasy[i].toFixed(2), "-i", plik]);
  const filtry: string[] = [];
  let poprzedni = "[0:v]";
  let suma = 0;
  for (let i = 1; i < plansze.length; i++) {
    suma += czasy[i - 1];
    const wyjscie = i === plansze.length - 1 ? "[film]" : `[v${i}]`;
    filtry.push(`${poprzedni}[${i}:v]xfade=transition=fade:duration=${PRZEJSCIE}:`
      + `offset=${(suma - i * PRZEJSCIE).toFixed(2)}${wyjscie}`);
    poprzedni = wyjscie;
  }
  execFileSync("ffmpeg", ["-v", "error", "-y", ...wejscia,
    "-filter_complex", filtry.join(";"), "-map", "[film]",
    "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", join(WYJSCIE, "film.mp4")]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", plansze[0],
    "-vf", "scale=540:-1", "-c:v", "libwebp", "-quality", "82", join(WYJSCIE, "film-plakat.webp")]);
}

/** Zrzuty, które pokazuje strona `/instrukcja` (reszta jest tylko na planszach). */
const NA_STRONE = ["glowna", "instalacja", "ciezary", "maksy", "rpe", "superseria", "ocena",
  "dobor", "prowadzenie", "przerwa", "zakoncz", "koniec"];

/** Zrzuty na stronę: szerokość 780 px (ostre na telefonie), WebP. */
function zapiszEkrany(): void {
  rmSync(EKRANY, { recursive: true, force: true });
  mkdirSync(EKRANY, { recursive: true });
  for (const nazwa of NA_STRONE) {
    const png = zrzuty.get(nazwa);
    if (!png) throw new Error(`Brak zrzutu „${nazwa}” — strona instrukcji go pokazuje`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png,
      "-vf", "scale=780:-1", "-c:v", "libwebp", "-quality", "80", join(EKRANY, `${nazwa}.webp`)]);
  }
}

try {
  mkdirSync(WYJSCIE, { recursive: true });
  await zKonsola(PORT, async (przegladarka, srodowisko) => {
    await zrobZrzuty(przegladarka, srodowisko);
    zapiszEkrany();
    const plansze = await zrobPlansze(przegladarka);
    zrobFilm(plansze);
  });
  console.log(`Gotowe: ${WYJSCIE}`);
} finally {
  if (!process.env.INSTRUKCJA_ZOSTAW) rmSync(ROBOCZY, { recursive: true, force: true });
  else console.log(`Pliki robocze: ${ROBOCZY}`);
}
