/**
 * Przegląd analizy ruchu na prawdziwym filmie (07.10.2026).
 *
 *   npm run przeglad-ruchu
 *
 * Prawdziwe MediaPipe w prawdziwym Chromium: wgranie filmu → analiza klatka
 * po klatce → kąty, powtórzenia, zatrzymana klatka, wybór punktu, sugerowana
 * pozycja, wykres, zapis JSON/CSV, wczytanie zapisu bez filmu, nagranie
 * kamerą. Liczby z MediaPipe nie są dokładne co do stopnia, więc kontrole
 * pilnują sensu (stanie ≈ wyprost, dół przysiadu ≈ duże zgięcie, tyle
 * powtórzeń, ile na filmie), a nie konkretnych wartości.
 *
 * Biblioteka i model idą z pamięci podręcznej na dysku (pobrane raz przez
 * curl), a przeglądarka dostaje je zamiast CDN — przegląd nie zależy od tego,
 * czy Chromium ma dostęp do internetu.
 *
 * Filmy (nie ma ich w repozytorium — licencje i rozmiar):
 *   WIDEO_PRZYSIAD_PRZOD — przysiady z przodu; oczekiwana liczba powtórzeń
 *                          w POWTORZEN_PRZOD (domyślnie 3)
 *   WIDEO_PRZYSIAD_BOK   — przysiad z boku
 *   KAMERA_Y4M           — opcjonalnie: film .y4m podawany jako kamera
 *   ZRZUTY               — katalog na zrzuty ekranu (opcjonalnie)
 * Format: WebM (VP8/VP9) — Chromium z Playwrighta nie odtwarza H.264.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { doliczBledy, pilnujBledow, podsumuj, sprawdz, wczytajPlaywrighta, zSerwerem } from "./przegladarka.ts";
import { doJSON, klatkaZWyniku, nowaSesja, zJSON } from "../public/ruch/sesja.js";
import { INDEKS, LANDMARKI } from "../public/ruch/szkielet.js";

const WERSJA = "0.10.35";
const PAMIEC = join(homedir(), ".cache", "craftmyplan", `mediapipe-${WERSJA}`);
const ZRZUTY = process.env.ZRZUTY ?? null;
const PRZOD = process.env.WIDEO_PRZYSIAD_PRZOD ?? null;
const BOK = process.env.WIDEO_PRZYSIAD_BOK ?? null;
const POWTORZEN_PRZOD = Number(process.env.POWTORZEN_PRZOD ?? 3);
const KAMERA = process.env.KAMERA_Y4M ?? null;

/** Biblioteka z npm i dwa modele — raz, potem z dysku. */
function przygotujMediaPipe(): void {
  mkdirSync(PAMIEC, { recursive: true });
  if (!existsSync(join(PAMIEC, "package", "vision_bundle.mjs"))) {
    const paczka = join(PAMIEC, "paczka.tgz");
    execFileSync("curl", ["-sSfL", "-o", paczka, `https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-${WERSJA}.tgz`]);
    execFileSync("tar", ["-xzf", paczka, "-C", PAMIEC]);
  }
  for (const m of ["lite", "full"]) {
    const plik = join(PAMIEC, `pose_landmarker_${m}.task`);
    if (!existsSync(plik)) {
      execFileSync("curl", ["-sSfL", "-o", plik,
        `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/1/pose_landmarker_${m}.task`]);
    }
  }
}

const TYPY: Record<string, string> = {
  ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm", ".task": "application/octet-stream",
};

/**
 * CDN i magazyn modeli → pliki z dysku; każde inne połączenie poza konsolę
 * jest blokowane i zapisywane. Film ma nie wychodzić z urządzenia, a od
 * MediaPipe 1.0 biblioteka sama wysyła statystyki do Google — ta lista
 * złapie to przy podbiciu wersji.
 */
const obcePolaczenia: string[] = [];

async function podmienZrodla(kontekst: any, adres: string): Promise<void> {
  await kontekst.route("**/*", async (trasa: any) => {
    const url = trasa.request().url();
    if (url.startsWith(adres) || url.startsWith("blob:") || url.startsWith("data:")) return trasa.continue();
    if (url.startsWith(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${WERSJA}/`)
      || url.startsWith("https://storage.googleapis.com/mediapipe-models/")) return trasa.fallback();
    obcePolaczenia.push(url);
    return trasa.abort();
  });
  await kontekst.route(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${WERSJA}/**`, async (trasa: any) => {
    const sciezka = new URL(trasa.request().url()).pathname.split(`@${WERSJA}/`)[1]!;
    const plik = join(PAMIEC, "package", sciezka);
    if (!existsSync(plik)) return trasa.fulfill({ status: 404, body: "brak" });
    await trasa.fulfill({ status: 200, body: readFileSync(plik), headers: {
      "content-type": TYPY[sciezka.slice(sciezka.lastIndexOf("."))] ?? "application/octet-stream",
      "access-control-allow-origin": "*",
    } });
  });
  await kontekst.route("https://storage.googleapis.com/mediapipe-models/**", async (trasa: any) => {
    const nazwa = new URL(trasa.request().url()).pathname.split("/").pop()!;
    const plik = join(PAMIEC, nazwa);
    if (!existsSync(plik)) return trasa.fulfill({ status: 404, body: "brak" });
    await trasa.fulfill({ status: 200, body: readFileSync(plik), headers: {
      "content-type": "application/octet-stream", "access-control-allow-origin": "*",
    } });
  });
}

const stanEkranu = (s: any) => s.evaluate(() => (window as any).__analizaRuchu.stan());
const sesjaEkranu = (s: any) => s.evaluate(() => (window as any).__analizaRuchu.sesja());

async function czekajNaAnalize(s: any, ms = 300_000): Promise<boolean> {
  try {
    await s.waitForSelector("#widok-analizy:not(.ukryty)", { timeout: ms });
    await s.waitForSelector("#panel-postepu.ukryty", { state: "attached", timeout: ms });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sztuczna analiza z przodu (bez MediaPipe i bez filmu): lewa strona osoby po
 * prawej stronie obrazu, prawa po lewej, lekki ruch w dół i w górę. Do kontroli
 * ekranu, które nie potrzebują prawdziwego nagrania.
 */
function sztucznaAnaliza(): string {
  const W = 1280, H = 720;
  const sesja = nowaSesja({ cwiczenie: "przysiad", wideo: { nazwa: "sztuczna.webm", szerokosc: W, wysokosc: H },
    analiza: { biblioteka: "sztuczna", model: "brak" } });
  const os: Record<string, [number, number]> = {
    nose: [0, 110], left_ear: [25, 105], right_ear: [-25, 105], left_eye: [12, 100], right_eye: [-12, 100],
    left_eye_inner: [6, 100], right_eye_inner: [-6, 100], left_eye_outer: [18, 100], right_eye_outer: [-18, 100],
    mouth_left: [10, 125], mouth_right: [-10, 125],
    shoulder: [90, 180], elbow: [110, 280], wrist: [115, 370], pinky: [118, 395], index: [112, 400], thumb: [100, 390],
    hip: [70, 400], knee: [75, 520], ankle: [75, 640], heel: [75, 660], foot_index: [85, 680],
  };
  for (let i = 0; i < 12; i++) {
    const dy = 40 * Math.sin((i / 11) * Math.PI);
    const landmarki = LANDMARKI.map((l) => {
      const czesc = l.id.replace(/^(left|right)_/, "");
      const [dx, y] = os[l.id] ?? os[czesc]!;
      const x = os[l.id] ? dx : l.strona === "L" ? dx : -dx;
      const nogi = ["knee", "ankle", "heel", "foot_index"].includes(czesc);
      return { x: (640 + x + (nogi ? 0 : -dy * 0.7)) / W, y: (y + (nogi ? 0 : dy)) / H, z: 0, visibility: 0.95, presence: 0.95 };
    });
    sesja.klatki.push(klatkaZWyniku(i, i * 40, landmarki, null));
  }
  return doJSON(sesja);
}

/**
 * Sztuczny przysiad z boku (23.10.2026, środek ciężkości): osoba zwrócona
 * w prawo, lewa strona bliżej kamery (prawa słabo widoczna i przesunięta —
 * jak zgadywana przez MediaPipe). Goleń, udo i tułów pochylają się
 * i wracają — jedno powtórzenie.
 */
function sztucznyPrzysiadZBoku(): string {
  const W = 1280, H = 720;
  const sesja = nowaSesja({ cwiczenie: "przysiad", wideo: { nazwa: "przysiad-bok.webm", szerokosc: W, wysokosc: H },
    analiza: { biblioteka: "sztuczna", model: "brak" } });
  const rad = (st: number) => (st * Math.PI) / 180;
  for (let i = 0; i < 40; i++) {
    const g = Math.sin((i / 39) * Math.PI);   // 0 → 1 → 0
    const [a, b, c] = [5 + 30 * g, 5 + 85 * g, 5 + 40 * g];
    const kostka = { x: 600, y: 640 };
    const kolano = { x: kostka.x + 190 * Math.sin(rad(a)), y: kostka.y - 190 * Math.cos(rad(a)) };
    const biodro = { x: kolano.x - 190 * Math.sin(rad(b)), y: kolano.y - 190 * Math.cos(rad(b)) };
    const bark = { x: biodro.x + 250 * Math.sin(rad(c)), y: biodro.y - 250 * Math.cos(rad(c)) };
    const ucho = { x: bark.x + 60 * Math.sin(rad(c)) + 10, y: bark.y - 60 * Math.cos(rad(c)) };
    const px: Record<string, { x: number; y: number }> = {
      ear: ucho, eye: { x: ucho.x + 20, y: ucho.y - 5 }, eye_inner: { x: ucho.x + 22, y: ucho.y - 5 },
      eye_outer: { x: ucho.x + 18, y: ucho.y - 5 }, mouth: { x: ucho.x + 22, y: ucho.y + 20 },
      shoulder: bark, elbow: { x: bark.x + 110, y: bark.y + 10 }, wrist: { x: bark.x + 220, y: bark.y + 15 },
      pinky: { x: bark.x + 245, y: bark.y + 20 }, index: { x: bark.x + 250, y: bark.y + 15 }, thumb: { x: bark.x + 240, y: bark.y + 10 },
      hip: biodro, knee: kolano, ankle: kostka, heel: { x: kostka.x - 30, y: kostka.y + 15 }, foot_index: { x: kostka.x + 130, y: kostka.y + 15 },
    };
    const landmarki = LANDMARKI.map((l) => {
      const czesc = l.id === "nose" ? "eye" : l.id.startsWith("mouth_") ? "mouth" : l.id.replace(/^(left|right)_/, "");
      const q = px[czesc]!;
      const prawa = l.strona === "P";
      return { x: (q.x + (prawa ? 12 : 0)) / W, y: q.y / H, z: 0, visibility: prawa ? 0.3 : 0.95, presence: prawa ? 0.3 : 0.95 };
    });
    sesja.klatki.push(klatkaZWyniku(i, i * 33.3, landmarki, null));
  }
  return doJSON(sesja);
}

/** Piksele nakładki w kolorze środka ciężkości (#33d6ff): droga, pion, obwódka symbolu. */
const pikseleSrodka = (s: any) => s.evaluate(() => {
  const c = document.querySelector("#nakladka") as HTMLCanvasElement;
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 200 && d[i]! < 110 && d[i + 1]! > 180 && d[i + 2]! > 220) n++;
  return n;
});

/** Ile pikseli nakładki ma pełny kolor trajektorii barku (fiolet) i biodra (zieleń). */
const koloryTrajektorii = (s: any) => s.evaluate(() => {
  const c = document.querySelector("#nakladka") as HTMLCanvasElement;
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  let fiolet = 0, ziel = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 200) continue;
    const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
    if (r > 120 && r < 170 && g > 110 && g < 155 && b > 205) fiolet++;
    if (r < 70 && g > 150 && g < 200 && b > 95 && b < 150) ziel++;
  }
  return { fiolet, ziel };
});

/** Ile pikseli nakładki ma kolor lewej (pomarańczowy) i prawej (niebieski) strony. */
const koloryNakladki = (s: any) => s.evaluate(() => {
  const c = document.querySelector("#nakladka") as HTMLCanvasElement;
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  let lewa = 0, prawa = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 200) continue;
    const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
    if (r > 200 && g > 80 && g < 130 && b < 90) lewa++;
    if (r < 90 && g > 110 && g < 160 && b > 200) prawa++;
  }
  return { lewa, prawa };
});

/**
 * Pozycja punktu z bieżącej klatki na ekranie (do kliknięcia). Najpierw
 * obraz na ekran — kliknięcie w przycisk z boku przewija stronę, a współrzędne
 * sprzed przewinięcia trafiałyby obok.
 */
async function punktNaEkranie(s: any, indeks: number): Promise<{ x: number; y: number }> {
  await s.locator("#scena").scrollIntoViewIfNeeded();
  return s.evaluate((i: number) => {
    const a = (window as any).__analizaRuchu;
    const k = a.sesja().klatki[a.stan().biezaca];
    const r = document.querySelector("#nakladka")!.getBoundingClientRect();
    return { x: r.left + k.p[i][0] * r.width, y: r.top + k.p[i][1] * r.height };
  }, indeks);
}

async function zrzut(s: any, nazwa: string, selektor?: string): Promise<void> {
  if (!ZRZUTY) return;
  mkdirSync(ZRZUTY, { recursive: true });
  const sciezka = join(ZRZUTY, `${nazwa}.png`);
  if (selektor) await s.locator(selektor).screenshot({ path: sciezka });
  else await s.screenshot({ path: sciezka, fullPage: false });
}

przygotujMediaPipe();
const { chromium } = await wczytajPlaywrighta();
const robocze = mkdtempSync(join(tmpdir(), "craftmyplan-ruch-"));

await zSerwerem(4231, async ({ adres }) => {
  const argumenty = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
  if (KAMERA) argumenty.push(`--use-file-for-fake-video-capture=${KAMERA}`);
  const przegladarka = await chromium.launch({ args: argumenty });
  try {
    const kontekst = await przegladarka.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    await podmienZrodla(kontekst, adres);
    const s = await kontekst.newPage();
    const bledy = pilnujBledow(s);

    // ── wejście z konsoli ─────────────────────────────────────────
    console.log("\n  Wejście");
    await s.goto(adres);
    const link = s.locator('a[href="/ruch/"]');
    sprawdz("na ekranie głównym konsoli jest link „Analiza ruchu”", await link.count() === 1);
    await link.click();
    await s.waitForSelector("#plik-wideo", { state: "attached" });
    // Moduł strony uruchamia się po wczytaniu dokumentu — dopiero wtedy listy są wypełnione.
    await s.waitForFunction(() => (document.querySelector("#model") as HTMLSelectElement).options.length > 0);
    sprawdz("strona analizy ruchu otwiera się pod /ruch/", s.url().endsWith("/ruch/"));
    sprawdz("domyślnie: przysiad, model standardowy, każda klatka filmu",
      await s.inputValue("#cwiczenie") === "przysiad" && await s.inputValue("#model") === "full"
        && await s.inputValue("#gestosc") === "0");

    // Połączenia szkieletu = te z biblioteki (żeby się nie rozjechały przy zmianie wersji).
    const polaczenia = await s.evaluate(async () => {
      const d = await import("/ruch/detektor.js");
      const sz = await import("/ruch/szkielet.js");
      const klucz = (p: number[]) => `${Math.min(p[0], p[1])}-${Math.max(p[0], p[1])}`;
      const zBiblioteki = new Set((await d.polaczeniaBiblioteki()).map(klucz));
      const nasze = new Set(sz.POLACZENIA.map(klucz));
      return { zgodne: zBiblioteki.size === nasze.size && [...nasze].every((k) => zBiblioteki.has(k)), ile: zBiblioteki.size };
    });
    sprawdz("połączenia szkieletu = POSE_CONNECTIONS z MediaPipe", polaczenia.zgodne, `${polaczenia.ile} par`);

    // Plik, którego przeglądarka nie odtworzy — komunikat, nie cisza.
    const smiec = join(robocze, "zepsuty.mp4");
    writeFileSync(smiec, Buffer.alloc(4096, 7));
    await s.setInputFiles("#plik-wideo", smiec);
    await s.waitForSelector("#komunikat:not(.ukryty)", { timeout: 10_000 }).catch(() => null);
    sprawdz("film, którego przeglądarka nie otworzy — czytelny komunikat",
      (await s.textContent("#komunikat"))?.includes("nie odtworzy") ?? false, (await s.textContent("#komunikat")) ?? "");

    // ── punkty na obrazie (23.10.2026) — bez filmu ───────────────
    // Trener: „chciałbym móc obserwować tylko punkty po prawej stronie bez lewej”.
    console.log("\n  Punkty na obrazie");
    const plikSztuczny = join(robocze, "sztuczna-analiza.json");
    writeFileSync(plikSztuczny, sztucznaAnaliza());
    await s.evaluate(() => localStorage.clear());
    await s.reload();
    await s.setInputFiles("#plik-analizy", plikSztuczny);
    await s.waitForSelector("#widok-analizy:not(.ukryty)", { timeout: 10_000 });
    await s.waitForTimeout(300);
    sprawdz("„Punkty na obrazie” pod przełącznikami, od razu rozwinięte, domyślnie wszystkie",
      await s.locator("#punkty-obrazu[open]").count() === 1 && await s.textContent("#opis-punktow") === "wszystkie");
    // Trener, 23.10.2026: „ułóż te punkty w sposób bardziej przejrzysty”.
    const uklad = await s.evaluate(() => [...document.querySelectorAll("#wybor-punktow tr")].map((w) =>
      [...w.children].map((k) => k.textContent!.trim() || (k.querySelector("input") ? "☐" : "")).join("|")));
    sprawdz("układ jak ciało: wiersze od głowy do stóp, kolumny Lewa i Prawa",
      uklad.join(" / ") === "|Lewa|Prawa / głowa|☐ / bark|☐|☐ / łokieć|☐|☐ / nadgarstek|☐|☐ / biodro|☐|☐ / kolano|☐|☐ / staw skokowy|☐|☐",
      uklad.join(" / "));
    const przed = await koloryNakladki(s);
    sprawdz("kontrola: na obrazie są punkty obu stron (pomarańczowe i niebieskie)", przed.lewa > 50 && przed.prawa > 50,
      `lewa ${przed.lewa} px, prawa ${przed.prawa} px`);
    // Trajektorie tylko przy widocznych punktach (trener, 23.10.2026: „jeżeli
    // któryś z tych punktów nie jest oznaczony, np. bark, to nie wyświetla się
    // jego trajektoria”). Klatka w środku ruchu — przebyta droga pełnym kolorem.
    for (let i = 0; i < 6; i++) await s.click("#klatka-dalej");
    const drogi = (await stanEkranu(s)).trajektorie as string[];
    const bark = drogi.find((id) => id.endsWith("_shoulder"))!;
    const zBarkiem = await koloryTrajektorii(s);
    sprawdz("kontrola: trajektorie barku (fiolet) i biodra (zieleń) na obrazie",
      zBarkiem.fiolet > 20 && zBarkiem.ziel > 20, `${drogi.join(", ")} · fiolet ${zBarkiem.fiolet} px, zieleń ${zBarkiem.ziel} px`);
    await s.locator(`#wybor-punktow input[data-punkt="${bark}"]`).uncheck();
    const bezBarku = await koloryTrajektorii(s);
    sprawdz("schowany bark — jego trajektorii nie ma, biodro zostaje",
      bezBarku.fiolet === 0 && bezBarku.ziel > 20, `fiolet ${bezBarku.fiolet} px, zieleń ${bezBarku.ziel} px`);
    sprawdz("…na liście trajektorii bark oznaczony „schowany”",
      (await s.locator("#wybor-trajektorii label.schowana").allTextContents()).join().includes("schowany"));
    await zrzut(s, "ruch-trajektorie-schowany", "#wybor-trajektorii");
    await s.locator(`#wybor-punktow input[data-punkt="${bark}"]`).check();
    sprawdz("bark z powrotem — trajektoria wraca", (await koloryTrajektorii(s)).fiolet > 20
      && await s.locator("#wybor-trajektorii label.schowana").count() === 0);
    await s.click('.szybki-wybor-punktow button[data-strona="P"]');
    await s.waitForTimeout(200);
    const drogiPrawe = (await stanEkranu(s)).trajektorie as string[];
    const kolorPrawej = await koloryTrajektorii(s);
    sprawdz("„Tylko prawa strona” przenosi trajektorie na prawą — drogi barku i biodra dalej widać",
      drogiPrawe.length === drogi.length && drogiPrawe.every((id) => id === "glowa" || id.startsWith("right_"))
        && kolorPrawej.fiolet > 20 && kolorPrawej.ziel > 20,
      `${drogiPrawe.join(", ")} · fiolet ${kolorPrawej.fiolet} px, zieleń ${kolorPrawej.ziel} px`);
    const poPrawej = await koloryNakladki(s);
    const stPrawa = await stanEkranu(s);
    sprawdz("„Tylko prawa strona”: lewej strony nie ma na obrazie, prawa jest",
      poPrawej.lewa === 0 && poPrawej.prawa > 50, `lewa ${poPrawej.lewa} px, prawa ${poPrawej.prawa} px`);
    sprawdz("…opis „tylko prawa strona”, kąty przestawione na prawą, sześć lewych punktów schowanych",
      await s.textContent("#opis-punktow") === "tylko prawa strona" && stPrawa.strona === "P"
        && stPrawa.ukryte.length === 6 && stPrawa.ukryte.every((id: string) => id.startsWith("left_")));
    sprawdz("…tabela punktów dalej ma obie strony (dane się nie zmieniają)",
      await s.locator('#tabela-punktow tr[data-punkt="left_knee"]').count() === 1);
    const kolanoL = await punktNaEkranie(s, INDEKS.left_knee!);
    await s.mouse.click(kolanoL.x, kolanoL.y);
    sprawdz("…dotknięcie schowanego kolana L go nie wybiera", (await stanEkranu(s)).wybrany !== "left_knee",
      (await stanEkranu(s)).wybrany ?? "nic");
    await s.locator('#wybor-punktow input[data-punkt="glowa"]').uncheck();
    sprawdz("odznaczenie jednego punktu — opis „6 z 13”", await s.textContent("#opis-punktow") === "6 z 13");
    await s.locator('#wybor-punktow input[data-punkt="right_knee"]').uncheck();
    const kolumnaP = s.locator('#wybor-punktow input[data-strona="P"]');
    sprawdz("część prawej strony schowana — pole „Prawa” w nagłówku pół-zaznaczone",
      await kolumnaP.evaluate((p: HTMLInputElement) => p.indeterminate && !p.checked));
    await kolumnaP.click();
    sprawdz("pole „Prawa” w nagłówku pokazuje całą prawą stronę", await s.textContent("#opis-punktow") === "6 z 13"
      && await s.locator('#wybor-punktow input[data-punkt="right_knee"]').isChecked());
    await kolumnaP.click();
    sprawdz("…a drugie kliknięcie chowa całą prawą stronę", await s.textContent("#opis-punktow") === "0 z 13"
      || await s.textContent("#opis-punktow") === "żaden — sam film");
    await kolumnaP.click();
    await s.reload();
    await s.setInputFiles("#plik-analizy", plikSztuczny);
    await s.waitForSelector("#widok-analizy:not(.ukryty)", { timeout: 10_000 });
    await s.waitForTimeout(300);
    sprawdz("wybór zostaje po ponownym otwarciu strony", await s.textContent("#opis-punktow") === "6 z 13"
      && (await koloryNakladki(s)).lewa === 0);
    for (const [nazwa, w, h] of [["telefon", 390, 844], ["ipad-pion", 820, 1180]] as const) {
      await s.setViewportSize({ width: w, height: h });
      await s.waitForTimeout(300);
      sprawdz(`${nazwa}: rozwinięty wybór punktów bez przewijania w bok`,
        await s.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await zrzut(s, `ruch-punkty-${nazwa}`, "#punkty-obrazu");
    }
    await s.setViewportSize({ width: 1366, height: 900 });
    await zrzut(s, "ruch-punkty-laptop", "#punkty-obrazu");
    await s.click("#punkty-obrazu summary");
    sprawdz("da się zwinąć — w nagłówku „rozwiń”", await s.locator("#punkty-obrazu:not([open])").count() === 1
      && await s.evaluate(() => getComputedStyle(document.querySelector("#punkty-obrazu summary")!, "::after").content) === '"rozwiń"');
    await s.reload();
    await s.setInputFiles("#plik-analizy", plikSztuczny);
    await s.waitForSelector("#widok-analizy:not(.ukryty)", { timeout: 10_000 });
    sprawdz("zwinięcie zostaje po ponownym otwarciu strony", await s.locator("#punkty-obrazu:not([open])").count() === 1);
    await s.click("#punkty-obrazu summary");
    await s.click('.szybki-wybor-punktow button[data-strona=""]');
    await s.waitForTimeout(200);
    const poWszystkich = await koloryNakladki(s);
    sprawdz("„Wszystkie” przywraca obie strony", await s.textContent("#opis-punktow") === "wszystkie"
      && poWszystkich.lewa > 50 && poWszystkich.prawa > 50);
    await s.evaluate(() => localStorage.clear());
    await s.reload();

    // ── środek ciężkości (23.10.2026) — bez filmu ────────────────
    // Trener: „dodajmy możliwość analizy środka ciężkości metodą segmentową —
    // De Leva razem z rozróżnieniem na płeć, plus wygładzenie trajektorii”.
    console.log("\n  Środek ciężkości");
    const plikBok = join(robocze, "przysiad-bok.json");
    writeFileSync(plikBok, sztucznyPrzysiadZBoku());
    await s.goto(`${adres}/ruch/`);
    await s.setInputFiles("#plik-analizy", plikBok);
    await s.waitForSelector("#widok-analizy:not(.ukryty)", { timeout: 10_000 });
    await s.waitForTimeout(300);
    sprawdz("panel „Środek ciężkości”: bez wybranego modelu — prośba o wybór, bez symbolu na obrazie i bez wykresu",
      (await s.textContent("#odczyt-srodka"))!.includes("Wybierz model segmentów")
        && await pikseleSrodka(s) === 0 && await s.locator("#wykres-srodka.ukryty").count() === 1);
    // Trener, 23.10.2026: „nie widzę środka ciężkości na nagraniu” — przełącznik był
    // zaznaczony, a płeć wybiera się w panelu niżej. Teraz prośba stoi przy przełączniku.
    const wybor = s.locator("#wybierz-model-srodka");
    await zrzut(s, "ruch-srodek-bez-modelu", ".przelaczniki");
    sprawdz("przy przełączniku „środek ciężkości” wyraźna prośba o wybór płci, gdy model nie jest wybrany",
      await wybor.isVisible() && (await wybor.textContent())!.includes("wybierz płeć") && await wybor.evaluate((b: Element) => b.classList.contains("brak")));
    await wybor.click();
    await s.waitForTimeout(700);
    sprawdz("…kliknięcie prowadzi do wyboru modelu w panelu (panel na ekranie, lista wyboru aktywna)",
      await s.evaluate(() => {
        const r = document.querySelector("#panel-srodka")!.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0 && document.activeElement?.id === "model-srodka";
      }));
    const modele = await s.locator("#model-srodka option").allTextContents();
    sprawdz("modele: de Leva kobieta i mężczyzna, Braune i Fischer z pracy magisterskiej",
      ["de Leva (1996) — kobieta", "de Leva (1996) — mężczyzna", "Braune i Fischer — jak w pracy magisterskiej"]
        .every((m) => modele.includes(m)), modele.join(" | "));
    await s.selectOption("#model-srodka", "deleva-k");
    await s.waitForTimeout(200);
    for (let i = 0; i < 19; i++) await s.click("#klatka-dalej");
    const k1 = (await stanEkranu(s)).srodek;
    sprawdz("z boku: lewa strona (bliżej kamery) liczona podwójnie, wynik „nad stopą” w %",
      k1?.konczyny === "L" && (await s.textContent("#odczyt-srodka"))!.includes("nad stopą")
        && typeof k1.wzgledem === "number" && k1.pewny === true,
      `${(await s.textContent("#odczyt-srodka"))!.trim()}`);
    sprawdz("na obrazie symbol, pion do stóp i droga środka ciężkości", await pikseleSrodka(s) > 100, `${await pikseleSrodka(s)} px`);
    sprawdz("…a przy przełączniku nazwa wybranego modelu zamiast prośby",
      (await wybor.textContent())!.startsWith("de Leva (1996) — kobieta") && !await wybor.evaluate((b: Element) => b.classList.contains("brak")));
    sprawdz("wykres środka ciężkości w % — linia wygładzona i blada bez wygładzania",
      await s.locator("#wykres-srodka:not(.ukryty) path.wykres-linia").count() === 2
        && (await s.locator("#wykres-srodka .wykres-opis").allTextContents()).includes("100%"));
    // Trener, 23.10.2026: „sczytywałem zakresy w stawach w najgłębszym momencie
    // przysiadu — czy możemy też dodać coś takiego, bez usuwania tego, co już mamy?”
    const naglowkiTabeli = await s.locator("#tabela-powtorzen tr:first-child th").allTextContents();
    const rodzaje = await s.locator("#tabela-powtorzen td.rodzaj-wiersza").allTextContents();
    const opisPowtorzenia = (await s.locator("#tabela-powtorzen tr.wiersz-powtorzenia").first().textContent())!;
    sprawdz("tabela powtórzeń: wiersz z czasami, pod nim „największe w ruchu” i „w najgłębszym punkcie”",
      JSON.stringify(rodzaje) === JSON.stringify(["największe w ruchu", "w najgłębszym punkcie"])
        && /^Powtórzenie 1 · ruch [\d,]+ s · w dół [\d,]+ s · w górę [\d,]+ s$/.test(opisPowtorzenia.trim()),
      `${opisPowtorzenia.trim()} | ${rodzaje.join(" | ")}`);
    sprawdz("…pełne nazwy kolumn: zgięcie grzbietowe stawu skokowego, biodro względem kolana, rozstaw kolan do stóp, środek ciężkości",
      ["zgięcie kolana", "zgięcie biodra", "zgięcie grzbietowe stawu skokowego", "pochylenie tułowia",
        "biodro względem kolana", "rozstaw kolan do stóp", "środek ciężkości nad stopą"].every((n) => naglowkiTabeli.includes(n))
        && !naglowkiTabeli.includes("stopa"),
      naglowkiTabeli.join(" | "));
    sprawdz("…tabela mieści się w panelu na laptopie (bez przewijania w bok)",
      await s.locator("#tabela-powtorzen").evaluate((e: Element) => e.scrollWidth <= e.parentElement!.clientWidth + 1));
    await s.locator("#tabela-powtorzen tr.wiersz-dol").first().click();
    await s.waitForTimeout(300);
    const najglebiej = await s.evaluate(() => {
      const a = (window as any).__analizaRuchu;
      const ses = a.sesja();
      const y = (i: number) => ses.klatki[i].p[23][1];   // left_hip — strona bliżej kamery
      const naj = ses.klatki.reduce((m: number, _k: any, i: number) => (y(i) > y(m) ? i : m), 0);
      return { tu: a.stan().biezaca, naj, ytu: y(a.stan().biezaca), ynaj: y(naj) };
    });
    sprawdz("wiersz przenosi do klatki, w której biodro jest najniżej",
      najglebiej.ytu === najglebiej.ynaj, `klatka ${najglebiej.tu + 1} (najniżej: ${najglebiej.naj + 1})`);
    const kolumnaKolana = naglowkiTabeli.indexOf("zgięcie kolana");
    const kolanoWDole = (await s.locator("#tabela-powtorzen tr.wiersz-dol").first().locator("td").nth(kolumnaKolana).textContent())!.trim();
    const kolanoZTabeliKatow = (await s.locator("#tabela-katow tr", { hasText: "Zgięcie kolana" }).locator("td").nth(1).textContent())!.trim();
    sprawdz("…a „w najgłębszym punkcie” to kąty z tej jednej klatki (zgodne z tabelą kątów obok)",
      !!kolanoWDole && kolanoWDole === kolanoZTabeliKatow, `${kolanoWDole} vs ${kolanoZTabeliKatow}`);
    sprawdz("tabela kątów obok: „Zgięcie grzbietowe stawu skokowego”",
      await s.locator("#tabela-katow", { hasText: "Zgięcie grzbietowe stawu skokowego" }).count() === 1);
    await s.selectOption("#model-srodka", "deleva-m");
    await s.waitForTimeout(150);
    const k2 = (await stanEkranu(s)).srodek;
    sprawdz("mężczyzna — inne proporcje, inny wynik niż u kobiety", Math.abs(k2.wzgledem - k1.wzgledem) > 0.05,
      `K ${k1.wzgledem.toFixed(1)}% · M ${k2.wzgledem.toFixed(1)}%`);
    sprawdz("obciążenie zwinięte, w nagłówku „bez obciążenia”",
      await s.locator("#obciazenie-srodka:not([open])").count() === 1
        && await s.textContent("#opis-obciazenia") === "bez obciążenia");
    await s.click("#obciazenie-srodka summary");
    await s.fill("#obciazenie-kg", "60");
    await s.waitForTimeout(150);
    sprawdz("obciążenie bez masy ciała — prośba o masę, wynik bez obciążenia",
      (await s.textContent("#odczyt-srodka"))!.includes("podaj masę ciała")
        && Math.abs((await stanEkranu(s)).srodek.y - k2.y) < 1e-6);
    await s.fill("#masa-ciala", "60");
    await s.waitForTimeout(150);
    const k3 = (await stanEkranu(s)).srodek;
    sprawdz("…w nagłówku obciążenia: „60 kg na barkach · masa ciała 60 kg”",
      await s.textContent("#opis-obciazenia") === "60 kg na barkach · masa ciała 60 kg",
      (await s.textContent("#opis-obciazenia")) ?? "");
    sprawdz("60 kg na barkach przy 60 kg masy ciała — środek wyżej, w stronę barków", k3.y < k2.y - 20,
      `y ${k2.y.toFixed(0)} → ${k3.y.toFixed(0)} px`);
    await s.uncheck("#wygladzanie-srodka");
    await s.waitForTimeout(150);
    sprawdz("bez wygładzania — jedna linia na wykresie",
      await s.locator("#wykres-srodka path.wykres-linia").count() === 1);
    await s.check("#wygladzanie-srodka");
    await s.uncheck("#pokaz-srodek");
    sprawdz("przełącznik „środek ciężkości” chowa symbol z obrazu", await pikseleSrodka(s) === 0);
    await s.check("#pokaz-srodek");
    await s.selectOption("#model-srodka", "deleva-k");
    await s.fill("#obciazenie-kg", "0");
    const [pobranieAnalizy] = await Promise.all([s.waitForEvent("download"), s.click("#pobierz-json")]);
    const plikZSrodkiem = join(robocze, "z-srodkiem.json");
    await pobranieAnalizy.saveAs(plikZSrodkiem);
    const [pobranieTabeli] = await Promise.all([s.waitForEvent("download"), s.click("#pobierz-csv")]);
    const csvZSrodkiem = join(robocze, "z-srodkiem.csv");
    await pobranieTabeli.saveAs(csvZSrodkiem);
    sprawdz("CSV: kolumny środka ciężkości na końcu",
      readFileSync(csvZSrodkiem, "utf-8").split("\r\n")[0]!.endsWith("srodek_wzgledem_stop_proc;srodek_wzgledem_stop_proc_wygladzony"));
    await s.reload();
    await s.setInputFiles("#plik-analizy", plikZSrodkiem);
    await s.waitForSelector("#widok-analizy:not(.ukryty)", { timeout: 10_000 });
    await s.waitForTimeout(300);
    sprawdz("zapisana analiza wraca z modelem i wynikiem (de Leva — kobieta, masa ciała)",
      await s.inputValue("#model-srodka") === "deleva-k" && await s.inputValue("#masa-ciala") === "60"
        && (await s.textContent("#odczyt-srodka"))!.includes("nad stopą"));
    // Trener, 23.10.2026: „żeby było możliwe obserwowanie jednocześnie nagrania
    // i wykresu środka ciężkości”. Szeroki ekran — obok filmu; wąski — pod nim.
    const ramka = (sel: string) => s.locator(sel).first().evaluate((e: Element) => {
      const r = e.getBoundingClientRect();
      return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right };
    });
    {
      const scena = await ramka("#scena");
      const panelSrodka = await ramka("#panel-srodka");
      const wykres = await ramka("#wykres-srodka");
      sprawdz("szeroki ekran: środek ciężkości w prawej kolumnie, obok filmu — wykres na wysokości filmu",
        panelSrodka.left >= scena.right && wykres.top < scena.bottom,
        `film ${Math.round(scena.top)}–${Math.round(scena.bottom)} px, wykres od ${Math.round(wykres.top)} px`);
    }
    for (const [nazwa, w, h] of [["telefon", 390, 844], ["ipad-pion", 820, 1180]] as const) {
      await s.setViewportSize({ width: w, height: h });
      await s.waitForTimeout(300);
      sprawdz(`${nazwa}: panel środka ciężkości bez przewijania w bok`,
        await s.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      const przelaczniki = await ramka(".przelaczniki");
      const panelSrodka = await ramka("#panel-srodka");
      const punktyObrazu = await ramka("#punkty-obrazu");
      sprawdz(`${nazwa}: środek ciężkości zaraz pod filmem i przełącznikami`,
        panelSrodka.top >= przelaczniki.bottom && panelSrodka.bottom <= punktyObrazu.top,
        `przełączniki do ${Math.round(przelaczniki.bottom)}, panel ${Math.round(panelSrodka.top)}–${Math.round(panelSrodka.bottom)}, punkty od ${Math.round(punktyObrazu.top)}`);
      await zrzut(s, `ruch-srodek-${nazwa}`, "#panel-srodka");
    }
    await s.setViewportSize({ width: 1366, height: 900 });
    await zrzut(s, "ruch-powtorzenia", "#panel-powtorzen");
    await s.evaluate(() => scrollTo(0, 0));
    await zrzut(s, "ruch-szeroki");
    for (let i = 0; i < 19; i++) await s.click("#klatka-dalej");
    await zrzut(s, "ruch-srodek-obraz", "#scena");
    await zrzut(s, "ruch-srodek-przelaczniki", ".przelaczniki");
    await zrzut(s, "ruch-srodek-panel", "#panel-srodka");
    // Z przodu — obie strony osobno, położenie między stopami.
    await s.setInputFiles("#plik-analizy", plikSztuczny);
    await s.waitForSelector("#widok-analizy:not(.ukryty)", { timeout: 10_000 });
    await s.selectOption("#model-srodka", "deleva-m");
    await s.waitForTimeout(200);
    const przod = (await stanEkranu(s)).srodek;
    sprawdz("z przodu: obie strony osobno, położenie między stopami",
      przod?.konczyny === "obie" && (await s.textContent("#odczyt-srodka"))!.includes("między stopami"),
      (await s.textContent("#odczyt-srodka"))!.trim());

    // ── początek filmu (23.10.2026) ───────────────────────────────
    // Trener: „aplikacja ucina mi początek filmu, gdzie osoba stoi prosto przed
    // przysiadem — potrzebuję filmów od samego początku, tak jak je prześlę”.
    // Film z licznikiem klatek (ffmpeg): pierwsza klatka analizy ma być
    // pierwszą klatką filmu, bez względu na to, jak szybko ruszy odtwarzanie.
    console.log("\n  Początek filmu");
    const licznik = join(robocze, "licznik.webm");
    let maFfmpeg = true;
    try {
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=4:size=640x360:rate=30",
        "-c:v", "libvpx", "-b:v", "800k", "-g", "60", licznik]);
    } catch { maFfmpeg = false; }
    if (!maFfmpeg) console.log("  — pominięty (brak ffmpeg)");
    for (const [opis, gestosc, obciazenie] of maFfmpeg ? [
      ["każda klatka", "0", "nie"], ["każda klatka, obciążony procesor", "0", "stale"],
      ["każda klatka, wolny start odtwarzania (jak Safari)", "0", "start"], ["najwyżej 15 kl./s", "15", "nie"],
      ["najwyżej 15 kl./s, wolny start odtwarzania", "15", "start"],
    ] as const : []) {
      await s.goto(`${adres}/ruch/`);
      await s.waitForFunction(() => (document.querySelector("#model") as HTMLSelectElement).options.length > 0);
      await s.selectOption("#gestosc", gestosc);
      if (obciazenie === "stale") {
        await s.evaluate(() => {
          (window as any).__obciazenie = setInterval(() => {
            const t = performance.now();
            while (performance.now() - t < 30) { /* zajęty */ }
          }, 40);
        });
      }
      if (obciazenie === "start") {
        // Film rusza, a przeglądarka przez 1,2 s nie zgłasza klatek (start
        // analizy: drugie play() — pierwsze mierzy odstęp klatek).
        await s.evaluate(() => {
          const play = HTMLMediaElement.prototype.play;
          let ile = 0;
          HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
            const wynik = play.call(this);
            if (++ile === 2) { const t = performance.now(); while (performance.now() - t < 1200) { /* zajęty */ } }
            return wynik;
          };
        });
      }
      await s.setInputFiles("#plik-wideo", licznik);
      const ok = await czekajNaAnalize(s, 120_000);
      if (obciazenie === "stale") await s.evaluate(() => clearInterval((window as any).__obciazenie));
      const ses = ok ? await sesjaEkranu(s) : null;
      const pierwsza = ses?.klatki[0]?.t ?? NaN;
      const oczekiwane = gestosc === "0" ? 120 : 60;
      const czasy = (ses?.klatki ?? []).map((k: any) => k.t);
      const najwiekszaPrzerwa = Math.max(...czasy.slice(1).map((t: number, i: number) => t - czasy[i]!));
      sprawdz(`${opis}: analiza od pierwszej klatki filmu, bez dziury na początku`,
        // Przerwa do 1,5 kroku jest dopuszczalna z założenia (dłuższą analiza uzupełnia).
        ok && pierwsza < 1 && Math.abs(czasy.length - oczekiwane) <= 2 && najwiekszaPrzerwa <= (gestosc === "0" ? 50.5 : 100.5),
        `pierwsza klatka ${pierwsza} ms, ${czasy.length} klatek (film: ${oczekiwane}), największa przerwa ${najwiekszaPrzerwa.toFixed(1)} ms`);
      const film = ok ? await s.evaluate(() => (document.querySelector("#wideo") as HTMLVideoElement).currentTime) : NaN;
      sprawdz(`${opis}: po analizie film stoi na początku`, film < 0.05, `${film} s`);
    }

    // ── przysiad z przodu ─────────────────────────────────────────
    if (!PRZOD) console.log("\n  Przysiad z przodu — pominięty (brak WIDEO_PRZYSIAD_PRZOD)");
    else {
      console.log("\n  Przysiad z przodu");
      const start = Date.now();
      await s.setInputFiles("#plik-wideo", PRZOD);
      const gotowe = await czekajNaAnalize(s);
      const sesja = await sesjaEkranu(s);
      sprawdz("analiza kończy się i pokazuje wyniki", gotowe && !!sesja,
        `${((Date.now() - start) / 1000).toFixed(1)} s, ${sesja?.analiza?.delegat ?? "?"}`);
      if (sesja) {
        const z = sesja.klatki.filter((k: any) => k.p);
        // Każda klatka filmu dokładnie raz: równe odstępy (film ma stałe tempo), żadnej luki.
        const odstepy = sesja.klatki.slice(1).map((k: any, i: number) => k.t - sesja.klatki[i].t).sort((a: number, b: number) => a - b);
        const mediana = odstepy[Math.floor(odstepy.length / 2)];
        const oczekiwane = Math.round(sesja.wideo.czasTrwania / mediana);
        sprawdz("każda klatka filmu dokładnie raz (odtwarzanie z pauzą, bez przewijania)",
          sesja.analiza.tryb === "odtwarzanie" && Math.abs(sesja.klatki.length - oczekiwane) <= 2
            && odstepy[0] > mediana * 0.9 && odstepy[odstepy.length - 1] < mediana * 1.1,
          `${sesja.klatki.length} klatek co ${mediana.toFixed(1)} ms, film ${sesja.wideo.czasTrwania} ms, ${sesja.analiza.tryb}`
            + `, uzupełnione ${sesja.analiza.uzupelnioneKlatki ?? 0}`);
        sprawdz("sylwetka wykryta w ≥ 90% klatek", z.length / sesja.klatki.length >= 0.9, `${z.length}/${sesja.klatki.length}`);
        sprawdz("każda klatka z sylwetką ma 33 punkty obrazu i 33 punkty 3D, z widocznością",
          z.every((k: any) => k.p.length === 33 && k.w?.length === 33 && k.p.every((q: number[]) => q.length === 5)));
        // W modelu 3D oś Y w dół (jak w obrazie) — na tym opiera się pochylenie tułowia w 3D.
        const yBarkow = z.reduce((a: number, k: any) => a + k.w[11][1] + k.w[12][1], 0);
        const yBioder = z.reduce((a: number, k: any) => a + k.w[23][1] + k.w[24][1], 0);
        sprawdz("model 3D: barki nad biodrami przy osi Y w dół", yBarkow < yBioder);
      }
      const st = await stanEkranu(s);
      sprawdz(`powtórzenia: ${POWTORZEN_PRZOD}, jak na filmie`, st.powtorzenia === POWTORZEN_PRZOD, `${st.powtorzenia}`);
      const wiersze = await s.locator("#tabela-powtorzen tr.wiersz-dol").count();
      sprawdz("tabela powtórzeń ma wiersze na każde", wiersze === st.powtorzenia);
      // Z przodu: zgięcia grzbietowego stopy nie widać (było −19°), a rozstaw kolan do stóp — tak.
      sprawdz("rozpoznane ujęcie z przodu", (await s.textContent("#info-analizy"))!.includes("ujęcie z przodu"));
      const naglowki = await s.$$eval("#tabela-powtorzen tr:first-child th", (th) => th.map((c) => c.textContent));
      const wDole = await s.$$eval("#tabela-powtorzen tr.wiersz-dol", (tr) => tr.map((w) => [...w.children].map((c) => c.textContent)));
      const iStopa = naglowki.indexOf("zgięcie grzbietowe stawu skokowego");
      const iKolana = naglowki.indexOf("rozstaw kolan do stóp");
      sprawdz("z przodu: zgięcie grzbietowe „—”, rozstaw kolan do stóp z liczbą",
        wDole.every((w) => w[iStopa] === "—" && /\d/.test(w[iKolana] ?? "")),
        wDole.map((w) => `${w[iStopa]} / ${w[iKolana]}`).join(", "));

      // Dół pierwszego powtórzenia — kliknięcie w wiersz.
      await s.locator("#tabela-powtorzen tr.klikalny").first().click();
      await s.waitForTimeout(300);
      const dol = await stanEkranu(s);
      const katy = await s.evaluate(() => {
        const a = (window as any).__analizaRuchu;
        return import("/ruch/geometria.js").then((g) => {
          const ses = a.sesja();
          const wym = { szerokosc: ses.wideo.szerokosc, wysokosc: ses.wideo.wysokosc };
          return {
            dol: g.katyKlatki(ses.klatki[a.stan().biezaca], wym),
            dol3d: g.katyKlatki(ses.klatki[a.stan().biezaca], wym, { uklad: "3d" }),
            start: g.katyKlatki(ses.klatki.find((k: any) => k.p), wym),
          };
        });
      });
      sprawdz("na starcie stoi: zgięcie kolan < 25°", katy.start.kolano_l.wartosc < 25 && katy.start.kolano_p.wartosc < 25,
        `L ${katy.start.kolano_l.wartosc.toFixed(0)}°, P ${katy.start.kolano_p.wartosc.toFixed(0)}°`);
      sprawdz("w dole przysiadu kolana mocno zgięte (3D > 70°)",
        katy.dol3d.kolano_l.wartosc > 70 && katy.dol3d.kolano_p.wartosc > 70,
        `3D: L ${katy.dol3d.kolano_l.wartosc.toFixed(0)}°, P ${katy.dol3d.kolano_p.wartosc.toFixed(0)}° · `
        + `2D: L ${katy.dol.kolano_l.wartosc.toFixed(0)}°, P ${katy.dol.kolano_p.wartosc.toFixed(0)}°`);
      const czasFilmu = await s.evaluate(() => (document.querySelector("#wideo") as HTMLVideoElement).currentTime);
      const klatki = (await sesjaEkranu(s)).klatki;
      const tKlatki = klatki[dol.biezaca].t / 1000;
      const tNastepnej = (klatki[dol.biezaca + 1]?.t ?? Infinity) / 1000;
      sprawdz("film stoi na tej samej klatce co nakładka", czasFilmu >= tKlatki && czasFilmu < tNastepnej,
        `film ${czasFilmu.toFixed(3)} s, klatka ${tKlatki.toFixed(3)}–${tNastepnej.toFixed(3)} s`);
      await zrzut(s, "ruch-przod-dol");
      await zrzut(s, "ruch-przod-scena", "#scena");

      // ── zatrzymana klatka: punkty ─────────────────────────────────
      console.log("\n  Zatrzymana klatka");
      sprawdz("tabela punktów: 13 głównych", await s.locator("#tabela-punktow tr.klikalny").count() === 13);
      await s.check("#wszystkie-punkty");
      sprawdz("„wszystkie 33 punkty” — 34 wiersze (z głową)", await s.locator("#tabela-punktow tr.klikalny").count() === 34);
      await s.uncheck("#wszystkie-punkty");
      sprawdz("tabela kątów: kolano, biodro, staw skokowy, łokieć, ramię, tułów, głowa, barki, biodra",
        await s.locator("#tabela-katow tr").count() === 11);

      const przed = (await stanEkranu(s)).biezaca;
      await s.click("#klatka-dalej");
      await s.waitForTimeout(150);
      await s.keyboard.press("ArrowRight");
      await s.waitForTimeout(150);
      sprawdz("klatka dalej: przycisk i strzałka", (await stanEkranu(s)).biezaca === przed + 2);
      await s.keyboard.press("ArrowLeft");
      await s.keyboard.press("ArrowLeft");
      await s.waitForTimeout(300);
      sprawdz("strzałka w lewo wraca", (await stanEkranu(s)).biezaca === przed);

      // Wybór punktu dotknięciem: lewe biodro.
      const biodro = await punktNaEkranie(s, 23);
      await s.mouse.click(biodro.x, biodro.y);
      sprawdz("kliknięcie w biodro wybiera biodro L", (await stanEkranu(s)).wybrany === "left_hip", (await stanEkranu(s)).wybrany ?? "nic");
      sprawdz("wiersz punktu podświetlony", await s.locator('#tabela-punktow tr.wybrany[data-punkt="left_hip"]').count() === 1);

      // Sugerowana pozycja: 40 px w bok i w dół.
      await s.click("#zaznacz-sugestie");
      const biodroPo = await punktNaEkranie(s, 23);
      await s.mouse.click(biodroPo.x - 40, biodroPo.y + 30);
      const sugestie = (await sesjaEkranu(s)).sugestie;
      sprawdz("sugerowana pozycja zapisana przy biodrze L na tej klatce",
        sugestie.length === 1 && sugestie[0].punkt === "left_hip" && sugestie[0].klatka === przed, JSON.stringify(sugestie[0] ?? null));
      const skutek = await s.textContent("#sugestie-klatki");
      sprawdz("panel pokazuje, jak sugestia zmienia kąty", (skutek ?? "").includes("→") && (skutek ?? "").includes("Zgięcie"),
        (skutek ?? "").replace(/\s+/g, " ").slice(0, 160));
      // Przeciągnięcie poprawia tę samą sugestię, nie dokłada drugiej.
      await s.mouse.move(biodroPo.x - 40, biodroPo.y + 30);
      await s.mouse.down();
      await s.mouse.move(biodroPo.x - 60, biodroPo.y + 40, { steps: 4 });
      await s.mouse.up();
      const poPrzeciagnieciu = (await sesjaEkranu(s)).sugestie;
      sprawdz("przeciągnięcie przesuwa sugestię, nie dokłada drugiej", poPrzeciagnieciu.length === 1
        && poPrzeciagnieciu[0].x < sugestie[0].x);
      await s.fill("#sugestie-klatki input", "biodra dalej w tył");
      await s.click("#zaznacz-sugestie");
      await zrzut(s, "ruch-przod-sugestia");

      // ── wykres i 3D ──────────────────────────────────────────────
      console.log("\n  Wykres, 3D, strona");
      sprawdz("wykres: cztery linie (kolano, biodro, staw skokowy, tułów)", await s.locator("#wykres path.wykres-linia").count() === 4);
      await s.locator("#wykres svg").scrollIntoViewIfNeeded();
      const ramka = await s.locator("#wykres svg").boundingBox();
      await s.mouse.click(ramka.x + ramka.width * 0.5, ramka.y + ramka.height * 0.5);
      const poWykresie = (await stanEkranu(s)).biezaca;
      const n = (await sesjaEkranu(s)).klatki.length;
      sprawdz("kliknięcie w wykres przewija do tej chwili", poWykresie > n * 0.3 && poWykresie < n * 0.7, `${poWykresie}/${n}`);
      await s.selectOption("#uklad", "3d");
      sprawdz("3D: miary względem obrazu znikają (głowa przed barkami „—”)",
        (await s.textContent("#tabela-katow"))!.includes("—"));
      await s.selectOption("#uklad", "2d");
      await s.selectOption("#strona", "P");
      sprawdz("strona prawa: wykres i powtórzenia po prawej", (await stanEkranu(s)).strona === "P");
      await s.selectOption("#strona", "auto");

      // ── odtwarzanie ───────────────────────────────────────────────
      await s.click("#klatka-wstecz");
      const przedOdtworzeniem = (await stanEkranu(s)).biezaca;
      await s.selectOption("#tempo", "1");
      await s.click("#odtworz");
      await s.waitForTimeout(1200);
      await s.click("#odtworz");
      const poOdtworzeniu = (await stanEkranu(s)).biezaca;
      sprawdz("odtwarzanie: nakładka idzie za filmem", poOdtworzeniu > przedOdtworzeniem + 10, `${przedOdtworzeniem} → ${poOdtworzeniu}`);

      // ── zapis ─────────────────────────────────────────────────────
      console.log("\n  Zapis i wczytanie");
      const [pobranieJson] = await Promise.all([s.waitForEvent("download"), s.click("#pobierz-json")]);
      const plikJson = join(robocze, pobranieJson.suggestedFilename());
      await pobranieJson.saveAs(plikJson);
      const zapisana = zJSON(readFileSync(plikJson, "utf-8"));
      sprawdz("JSON: nasz format, wszystkie klatki, 33 punkty, sugestia z notatką",
        zapisana.klatki.length === n && zapisana.landmarki.length === 33
          && zapisana.sugestie[0]?.notatka === "biodra dalej w tył",
        pobranieJson.suggestedFilename());
      const [pobranieCsv] = await Promise.all([s.waitForEvent("download"), s.click("#pobierz-csv")]);
      const plikCsv = join(robocze, "a.csv");
      await pobranieCsv.saveAs(plikCsv);
      const csv = readFileSync(plikCsv, "utf-8");
      sprawdz("CSV: BOM dla Excela, nagłówek i wiersz na klatkę",
        csv.startsWith("﻿klatka;t_ms;glowa_x_px") && csv.trim().split("\r\n").length === n + 1);

      // Wczytanie zapisu bez filmu, potem dołączenie filmu.
      await s.reload();
      sprawdz("przycisk zapisanej analizy opisany słowami, z wyjaśnieniem pliku .json",
        (await s.textContent('label[for="plik-analizy"]')) === "Otwórz zapisaną analizę"
          && (await s.textContent("#panel-zrodla"))!.includes("plik .json, który pobierasz po analizie"));
      await s.setInputFiles("#plik-analizy", plikJson);
      await s.waitForSelector("#widok-analizy:not(.ukryty)", { timeout: 10_000 }).catch(() => null);
      const bezFilmu = await stanEkranu(s);
      sprawdz("wczytana analiza bez filmu: sam szkielet, te same powtórzenia",
        !bezFilmu.maWideo && bezFilmu.powtorzenia === st.powtorzenia
          && await s.locator("#bez-filmu:not(.ukryty)").count() === 1);
      await s.click("#klatka-dalej");
      sprawdz("bez filmu klatki też się przewijają", (await stanEkranu(s)).biezaca === 1);
      sprawdz("sugestia z pliku jest na liście", (await s.textContent("#wszystkie-sugestie"))!.includes("biodro L"));
      await s.setInputFiles("#plik-dolacz", PRZOD);
      await s.waitForTimeout(1500);
      sprawdz("dołączony film wraca pod szkielet bez ponownej analizy", (await stanEkranu(s)).maWideo
        && (await sesjaEkranu(s)).klatki.length === n);

      // ── ekrany: telefon i iPad ───────────────────────────────────
      console.log("\n  Ekrany");
      for (const [nazwa, w, h] of [["telefon", 390, 844], ["ipad-pion", 820, 1180], ["ipad-poziom", 1180, 820]] as const) {
        await s.setViewportSize({ width: w, height: h });
        await s.waitForTimeout(400);
        const przewijanieWbok = await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        const scena = await s.locator("#scena").boundingBox();
        sprawdz(`${nazwa}: bez przewijania w bok, film mieści się na ekranie`, !przewijanieWbok && scena.width <= w,
          `scena ${Math.round(scena.width)}×${Math.round(scena.height)}`);
        await zrzut(s, `ruch-${nazwa}`);
      }
      await s.setViewportSize({ width: 1366, height: 900 });
    }

    // ── przysiad z boku ───────────────────────────────────────────
    if (!BOK) console.log("\n  Przysiad z boku — pominięty (brak WIDEO_PRZYSIAD_BOK)");
    else {
      console.log("\n  Przysiad z boku");
      await s.goto(`${adres}/ruch/`);
      // Obciążony procesor: co 40 ms 30 ms zajętego wątku. Wtedy przeglądarka
      // gubi klatki przy odtwarzaniu — a analiza ma je odzyskać (07.10.2026).
      await s.evaluate(() => {
        (window as any).__obciazenie = setInterval(() => {
          const t = performance.now();
          while (performance.now() - t < 30) { /* zajęty */ }
        }, 40);
      });
      // Trener, 09.10.2026: film wybrany przyciskiem zapisanej analizy był
      // wyszarzony. Teraz każdy z dwóch przycisków przyjmuje film i JSON.
      await s.setInputFiles("#plik-analizy", BOK);
      sprawdz("analiza filmu z boku (wybranego przyciskiem zapisanej analizy, przy obciążonym procesorze)",
        await czekajNaAnalize(s));
      await s.evaluate(() => clearInterval((window as any).__obciazenie));
      const sesja = await sesjaEkranu(s);
      const odstepy = sesja.klatki.slice(1).map((k: any, i: number) => k.t - sesja.klatki[i].t).sort((a: number, b: number) => a - b);
      const mediana = odstepy[Math.floor(odstepy.length / 2)];
      sprawdz("zgubione przy odtwarzaniu klatki odzyskane — każda klatka filmu jest",
        Math.abs(sesja.klatki.length - Math.round(sesja.wideo.czasTrwania / mediana)) <= 2
          && odstepy[odstepy.length - 1] < mediana * 1.5,
        `${sesja.klatki.length} klatek, uzupełnione ${sesja.analiza.uzupelnioneKlatki ?? 0}, `
          + `największa przerwa ${odstepy[odstepy.length - 1].toFixed(1)} ms`);
      const z = sesja.klatki.filter((k: any) => k.p).length;
      sprawdz("sylwetka w ≥ 90% klatek", z / sesja.klatki.length >= 0.9, `${z}/${sesja.klatki.length}`);
      const st = await stanEkranu(s);
      const wyniki = await s.evaluate(() => {
        const a = (window as any).__analizaRuchu;
        return Promise.all([import("/ruch/przebieg.js"), import("/ruch/profile.js")]).then(([p, pr]) => {
          const ses = a.sesja();
          const katy = p.katySesji(ses);
          const s = a.stan().strona.toLowerCase();
          const kol = p.seria(katy, `kolano_${s}`).filter((v: any) => v !== null);
          const bio = p.seria(katy, `biodro_${s}`).filter((v: any) => v !== null);
          const tul = p.seria(katy, "tulow").filter((v: any) => v !== null);
          return { kolMin: Math.min(...kol), kolMax: Math.max(...kol), bioMax: Math.max(...bio), tulMax: Math.max(...tul) };
        });
      });
      // Ten film zaczyna się już w lekkim ugięciu i urywa przy wstawaniu —
      // pilnujemy zakresu ruchu, nie samego stania.
      sprawdz("z boku: zakres zgięcia kolana ≥ 70°, w dole > 110°", wyniki.kolMax - wyniki.kolMin >= 70 && wyniki.kolMax > 110,
        `kolano ${wyniki.kolMin.toFixed(0)}–${wyniki.kolMax.toFixed(0)}°, biodro do ${wyniki.bioMax.toFixed(0)}°, tułów do ${wyniki.tulMax.toFixed(0)}°, strona ${st.strona}`);
      sprawdz("z boku: jedno powtórzenie", st.powtorzenia === 1, `${st.powtorzenia}`);
      await s.locator("#tabela-powtorzen tr.klikalny").first().click().catch(() => null);
      await s.waitForTimeout(300);
      await zrzut(s, "ruch-bok-dol");
      await zrzut(s, "ruch-bok-scena", "#scena");
    }

    // ── nagranie kamerą ───────────────────────────────────────────
    console.log("\n  Nagranie kamerą");
    await s.goto(`${adres}/ruch/`);
    await s.selectOption("#model", "lite");
    await s.click("#nagraj");
    const podglad = await s.waitForFunction(() => {
      const v = document.querySelector("#podglad-kamery") as HTMLVideoElement;
      return v.videoWidth > 0;
    }, null, { timeout: 10_000 }).then(() => true).catch(() => false);
    sprawdz("kamera: podgląd na żywo", podglad);
    await s.click("#start-nagrywania");
    await s.waitForTimeout(KAMERA ? 4000 : 2000);
    await s.click("#stop-nagrywania");
    const poNagraniu = await czekajNaAnalize(s, 120_000);
    const nagranie = await sesjaEkranu(s);
    sprawdz("nagranie idzie prosto do analizy (czas trwania znany mimo MediaRecorder)",
      poNagraniu && nagranie?.klatki.length > 20 && nagranie.wideo.czasTrwania > 1000,
      `${nagranie?.klatki.length ?? 0} klatek, ${nagranie?.wideo.czasTrwania ?? 0} ms, ${nagranie?.wideo.nazwa ?? ""}`);
    if (KAMERA) {
      const z = nagranie.klatki.filter((k: any) => k.p).length;
      sprawdz("z kamery (film przysiadu jako kamera): sylwetka wykryta", z / nagranie.klatki.length > 0.8, `${z}/${nagranie.klatki.length}`);
    }

    sprawdz("żadnego połączenia poza konsolę, bibliotekę i model (film i statystyki zostają na urządzeniu)",
      obcePolaczenia.length === 0, obcePolaczenia.slice(0, 3).join(" "));
    // MediaPipe pisze swój dziennik (INFO, ostrzeżenia glog „W1007 …”) przez
    // console.error — to nie są błędy strony. Prawdziwe błędy („E…”) zostają.
    const bledyBezOczekiwanych = bledy.filter((b) => !b.includes("zepsuty.mp4")
      && !/MEDIA_ERR|DEMUXER|Format error/i.test(b) && !/^(INFO|WARNING):|^[IW]\d{4} /.test(b));
    console.log(`\n  błędów w przeglądarce: ${bledyBezOczekiwanych.length ? bledyBezOczekiwanych.join(" | ") : "brak"}`);
    doliczBledy(bledyBezOczekiwanych.length);
  } finally {
    await przegladarka.close();
  }
});

podsumuj("analiza ruchu działa na prawdziwym filmie");
