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
import { zJSON } from "../public/ruch/sesja.js";

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
      const wiersze = await s.locator("#tabela-powtorzen tr.klikalny").count();
      sprawdz("tabela powtórzeń ma wiersz na każde", wiersze === st.powtorzenia);
      // Z przodu: zgięcia grzbietowego stopy nie widać (było −19°), a rozstaw kolan do stóp — tak.
      sprawdz("rozpoznane ujęcie z przodu", (await s.textContent("#info-analizy"))!.includes("ujęcie z przodu"));
      const kolumny = await s.$$eval("#tabela-powtorzen tr", (tr) => tr.map((w) => [...w.children].map((c) => c.textContent)));
      const iStopa = kolumny[0]!.indexOf("stopa");
      const iKolana = kolumny[0]!.indexOf("kolana/stopy");
      sprawdz("z przodu: stopa „—”, kolana/stopy z liczbą",
        kolumny.slice(1).every((w) => w[iStopa] === "—" && /\d/.test(w[iKolana] ?? "")),
        kolumny.slice(1).map((w) => `${w[iStopa]} / ${w[iKolana]}`).join(", "));

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
