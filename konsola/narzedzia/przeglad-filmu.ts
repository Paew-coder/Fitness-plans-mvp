/**
 * Przegląd karty ćwiczenia z filmem OPEX (09.10.2026).
 *
 *   npm run przeglad-filmu
 *
 * Prawdziwa aplikacja klienta i prawdziwy odtwarzacz YouTube (IFrame Player
 * API) w Chromium, na telefonie i na komputerze. Aplikacja stoi pod
 * udawanym adresem https://craftmyplan.test z tym samym nagłówkiem
 * `Referrer-Policy: no-referrer` co na serwerze — tak jak w produkcji
 * (od tej polityki zależy, czy YouTube w ogóle odtworzy osadzony film).
 *
 * Czego ten przegląd **nie potwierdzi** i co wypisuje do sprawdzenia ręcznie:
 * samo odtwarzanie obrazu. YouTube strumieniuje film z własnych serwerów
 * i wymaga przy tym weryfikacji przeglądarki; w środowisku bez pełnego
 * dostępu do sieci odtwarzacz zostaje na „buforuje”. Wtedy kontrola mówi
 * wprost „do sprawdzenia ręcznie”, zamiast udawać, że działa.
 *
 * Opcjonalnie WIDEO_TESTOWE=…/film.webm — sprawdza też ścieżkę „własny plik”
 * (odtwarzanie, pauza, przewijanie w pełni, bo plik jest lokalny).
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { doliczBledy, podsumuj, sprawdz, wczytajPlaywrighta, zSerwerem } from "./przegladarka.ts";

const ADRES_APLIKACJI = "https://craftmyplan.test";
const ID_FILMU = "ejI1Nlsul9k";
const ZRZUTY = process.env.ZRZUTY ?? null;
const WIDEO_TESTOWE = process.env.WIDEO_TESTOWE ?? null;
const PROXY = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? null;

const doRecznego: string[] = [];

async function zrzut(s: any, nazwa: string): Promise<void> {
  if (!ZRZUTY) return;
  mkdirSync(ZRZUTY, { recursive: true });
  await s.screenshot({ path: join(ZRZUTY, `${nazwa}.png`) });
}

const { chromium } = await wczytajPlaywrighta();

await zSerwerem(4241, async ({ adres, api }) => {
  // ── plan z Barbell bench press (EX-0011) i ćwiczeniem bez karty ──────
  console.log("\n  Biblioteka i plan");
  const cwiczenia = await api("/api/cwiczenia");
  const lawka = cwiczenia.filter((c: any) => c.nazwa.toLowerCase() === "barbell bench press");
  sprawdz("Barbell bench press jest w bibliotece ćwiczeń — raz, jako EX-0011, z filmem OPEX",
    lawka.length === 1 && lawka[0].id === "EX-0011" && lawka[0].wideo?.youtubeId === ID_FILMU
      && lawka[0].nazwaPl === "Wyciskanie sztangi leżąc",
    `${lawka.length}× ${lawka[0]?.id} · ${lawka[0]?.wideo?.zrodlo?.nazwa}`);

  /** Plan z wyciskaniem (EX-0011) na A1 i hantlami (EX-0059, bez karty) — osobny na każde urządzenie. */
  async function planZWyciskaniem(klient: string): Promise<{ sciezka: string; blad: string | null }> {
    await api("/api/plany", "POST", { klient, wersja: 1 });
    const id = (await api("/api/plany")).find((p: any) => p.klient === klient).id;
    const o = await api(`/api/plany/${id}`);
    const plan = o.zapisany.plan;
    plan.sloty[0].cwiczenieId = "EX-0011";
    plan.sloty[1].cwiczenieId = "EX-0059";
    plan.serieMaksymalne = [{ cwiczenieId: "EX-0011", ciezar: 100, powtorzenia: 1 },
      { cwiczenieId: "EX-0059", ciezar: 30, powtorzenia: 10 }];
    const zapis = await api(`/api/plany/${id}`, "PUT", { plan, dataStartu: null, status: "wysłany", zmieniony: o.zapisany.zmieniony });
    const { sciezka } = await api(`/api/plany/${id}/link`, "POST");
    return { sciezka, blad: zapis.blad ?? null };
  }
  const pierwszy = await planZWyciskaniem("Film Telefon");
  sprawdz("ćwiczenie dodaje się do planu jak każde inne (zapis planu przechodzi)", !pierwszy.blad, pierwszy.blad ?? "");

  const przegladarka = await chromium.launch({
    ...(PROXY ? { proxy: { server: PROXY } } : {}),
  });
  try {
    for (const ekran of [
      { nazwa: "telefon", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
      { nazwa: "komputer", viewport: { width: 1280, height: 800 } },
    ]) {
      console.log(`\n  ${ekran.nazwa}`);
      const kontekst = await przegladarka.newContext({
        viewport: ekran.viewport, isMobile: ekran.isMobile ?? false, hasTouch: ekran.hasTouch ?? false,
        deviceScaleFactor: ekran.deviceScaleFactor ?? 1, colorScheme: "dark",
        ignoreHTTPSErrors: true, serviceWorkers: "block",
      });
      // Aplikacja pod adresem https jak w produkcji, z nagłówkami Caddy.
      await kontekst.route(`${ADRES_APLIKACJI}/**`, async (trasa: any) => {
        const u = new URL(trasa.request().url());
        if (u.pathname === "/test-film.webm" && WIDEO_TESTOWE) {
          // Z zakresami bajtów, jak zwykły serwer plików — bez nich przeglądarka
          // nie przewinie filmu (a Safari w ogóle go nie odtworzy).
          const caly = readFileSync(WIDEO_TESTOWE);
          const zakres = /bytes=(\d+)-(\d*)/.exec((await trasa.request().allHeaders()).range ?? "");
          if (!zakres) return trasa.fulfill({ status: 200, body: caly, headers: { "content-type": "video/webm", "accept-ranges": "bytes" } });
          const od = Number(zakres[1]);
          const doB = zakres[2] ? Number(zakres[2]) : caly.length - 1;
          return trasa.fulfill({ status: 206, body: caly.subarray(od, doB + 1), headers: {
            "content-type": "video/webm", "accept-ranges": "bytes", "content-range": `bytes ${od}-${doB}/${caly.length}` } });
        }
        // Prosto do lokalnej konsoli z Node — `trasa.fetch` poszłoby przez
        // serwer pośredniczący przeglądarki, który adresu lokalnego nie zna.
        const z = trasa.request();
        const cialo = z.postDataBuffer();
        const odp = await fetch(`${adres}${u.pathname}${u.search}`, {
          method: z.method(),
          headers: Object.fromEntries(Object.entries(await z.allHeaders())
            .filter(([k]) => !k.startsWith(":") && !["host", "content-length"].includes(k))) as Record<string, string>,
          body: cialo && z.method() !== "GET" ? cialo : undefined,
        });
        const naglowki = Object.fromEntries(odp.headers.entries());
        delete naglowki["content-encoding"];
        delete naglowki["content-length"];
        await trasa.fulfill({ status: odp.status, body: Buffer.from(await odp.arrayBuffer()),
          headers: { ...naglowki, "referrer-policy": "no-referrer", "x-frame-options": "DENY" } });
      });
      const s = await kontekst.newPage();
      // Każda nowa karta przeglądarki po tej chwili = film otworzył się poza aplikacją.
      const nowe: string[] = [];
      kontekst.on("page", (p: any) => nowe.push(p.url()));
      const bledy: string[] = [];
      // Błędy z ramki YouTube (np. „writeEmbed is not defined”, gdy jej skrypt
      // nie doszedł przez sieć) to nie błędy aplikacji — poznać je po stosie.
      s.on("pageerror", (e: Error) => {
        if (!/youtube|ytimg|google|gstatic/.test(e.stack ?? "") && !/writeEmbed/.test(String(e))) {
          bledy.push(`${e} [${(e.stack ?? "").split("\n").slice(1, 3).join(" ").trim() || "bez stosu"}]`);
        }
      });
      s.on("console", (m: any) => {
        // Komunikaty z ramki YouTube to sprawa YouTube, nie aplikacji.
        const zrodlo = m.location()?.url ?? "";
        if (m.type() === "error" && zrodlo.startsWith(ADRES_APLIKACJI)) bledy.push(m.text());
      });

      const { sciezka } = ekran.nazwa === "telefon" ? pierwszy : await planZWyciskaniem("Film Komputer");
      await s.goto(`${ADRES_APLIKACJI}${sciezka}`);
      await s.locator("#tygodnie .dzien-kafel").first().click();
      await s.waitForSelector("#ekran-trening:not(.ukryty)");
      const karta = s.locator('#cwiczenia [data-position="D1-S01"]');
      const inna = s.locator('#cwiczenia [data-position="D1-S02"]');
      sprawdz("na liście: przy wyciskaniu przycisk filmu w aplikacji, przy innym ćwiczeniu dotychczasowy link",
        await karta.locator("button.film-karta").count() === 1
          && await inna.locator('a.film[target="_blank"]').count() === 1);

      // Wpisane ciężary i powtórzenia przed otwarciem filmu.
      await karta.getByRole("button", { name: /zapisz, co poszło/ }).click();
      const pola = karta.locator(".wykonanie-pola input");
      await pola.nth(0).fill("87.5");
      await pola.nth(1).fill("5");
      const przewiniecie = await s.evaluate(() => scrollY);
      const adresPrzed = s.url();

      await karta.locator("button.film-karta").click();
      const okno = s.locator(".karta-cw");
      sprawdz("karta ćwiczenia otwiera się nad treningiem", await okno.isVisible().catch(() => false));
      const tekst = (await okno.innerText().catch(() => "")).replace(/\s+/g, " ");
      sprawdz("karta: nazwa polska i angielska, mięśnie, sprzęt, kategoria, źródło filmu",
        ["Wyciskanie sztangi leżąc", "Barbell Bench Press", "mięsień piersiowy większy",
          "triceps, przednia część mięśnia naramiennego", "sztanga, ławka pozioma", "trening siłowy",
          "Film: OPEX Fitness / YouTube"].every((t) => tekst.includes(t)), tekst.slice(0, 200));

      const iframe = okno.locator(".karta-cw-film iframe");
      const src = await iframe.getAttribute("src").catch(() => "") ?? "";
      const u = new URL(src || "about:blank");
      sprawdz("odtwarzacz YouTube: właściwy film, playsinline=1, API włączone, adres aplikacji jako origin",
        u.hostname === "www.youtube-nocookie.com" && u.pathname === `/embed/${ID_FILMU}`
          && u.searchParams.get("playsinline") === "1" && u.searchParams.get("enablejsapi") === "1"
          && u.searchParams.get("origin") === ADRES_APLIKACJI, src);
      sprawdz("ramka wysyła do YouTube tylko domenę (strict-origin-when-cross-origin), adres z tokenem nie wychodzi",
        await iframe.getAttribute("referrerpolicy") === "strict-origin-when-cross-origin");

      // Wymiary: 16:9 na całą szerokość karty, bez przewijania w bok.
      const ramka = await okno.locator(".karta-cw-film").boundingBox();
      const oknoBox = await okno.boundingBox();
      const wbok = await s.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      const wrocBox = await okno.getByRole("button", { name: "Wróć do treningu" }).boundingBox();
      sprawdz("cała karta na ekranie bez przewijania: film, opis i „Wróć do treningu” widoczne od razu",
        !!wrocBox && wrocBox.y + wrocBox.height <= ekran.viewport.height,
        `dół przycisku ${Math.round((wrocBox?.y ?? 0) + (wrocBox?.height ?? 0))} / ${ekran.viewport.height} px`);
      sprawdz("odtwarzacz 16:9, mieści się na ekranie, bez przewijania w bok",
        !!ramka && Math.abs(ramka.height - ramka.width * 9 / 16) < 2 && ramka.width <= ekran.viewport.width
          && oknoBox!.width <= ekran.viewport.width && !wbok,
        `${Math.round(ramka?.width ?? 0)}×${Math.round(ramka?.height ?? 0)} px, karta ${Math.round(oknoBox?.width ?? 0)} px`);

      // IFrame Player API: odtwarzacz gotowy i to ten film. Sieć tej maszyny
      // do YouTube bywa zrywana — wtedy karta zamknięta i otwarta jeszcze raz
      // (najwyżej trzy podejścia), a wynik mówi, za którym razem się udało.
      const czekajNaGotowy = () => s.waitForFunction(() => {
        const st = document.querySelector(".karta-cw-film")?.getAttribute("data-stan") ?? "";
        return st !== "laduje" && st !== "bez-api";
      }, null, { timeout: 30_000 }).then(() => true).catch(() => false);
      let gotowy = await czekajNaGotowy();
      let podejscie = 1;
      while (!gotowy && podejscie < 3) {
        podejscie++;
        await s.keyboard.press("Escape");
        await karta.locator("button.film-karta").click();
        gotowy = await czekajNaGotowy();
      }
      if (podejscie > 1 && gotowy) console.log(`  … odtwarzacz YouTube wczytał się za ${podejscie}. podejściem (zrywana sieć tej maszyny)`);
      const stanPoWczytaniu = await okno.locator(".karta-cw-film").getAttribute("data-stan");
      // „bez-api” = skrypt YouTube nie przyszedł przez sieć ani razu (aplikacja
      // ponawia sama). To stan sieci tej maszyny, nie błąd aplikacji — kontrola
      // nie udaje wtedy wyniku w żadną stronę, tylko trafia do sprawdzenia ręcznie.
      // „laduje” po 30 s (API jest, odtwarzacz milczy) zostaje błędem.
      const bezSieci = !gotowy && stanPoWczytaniu === "bez-api";
      if (bezSieci) {
        console.log(`  ⚠ nie sprawdzone: skrypt YouTube nie doszedł przez sieć tej maszyny (${podejscie} podejścia) — `
          + "API, właściwy film i start do sprawdzenia ręcznie");
        doRecznego.push(`${ekran.nazwa}: czy karta pokazuje odtwarzacz z filmem „Barbell Bench Press - OPEX Exercise Library”`);
      }
      const dane = await s.evaluate(() => {
        const g = (document.querySelector(".karta-cw-film") as any)?._gracz;
        return g ? { ...g.getVideoData(), stan: g.getPlayerState() } : null;
      });
      if (!bezSieci) sprawdz("IFrame Player API gotowy, odtwarzacz zgłasza właściwy film (OPEX, ejI1Nlsul9k)",
        gotowy && dane?.video_id === ID_FILMU && dane?.title === "Barbell Bench Press - OPEX Exercise Library"
          && dane?.isPlayable === true && !String(stanPoWczytaniu).startsWith("blad"),
        `${stanPoWczytaniu} · ${dane?.video_id} · ${dane?.title}`);

      // Start przyciskiem odtwarzacza (jak palcem), bez wychodzenia z aplikacji.
      if (ekran.nazwa === "telefon") await zrzut(s, "film-telefon-karta");
      const klik = bezSieci ? null : await s.frameLocator(".karta-cw-film iframe").locator(".ytp-large-play-button")
        .click({ timeout: 10_000 }).then(() => "dotknięcie przycisku odtwarzacza")
        .catch(() => null);
      // Gdy przycisku YouTube nie da się tu dotknąć (interfejs odtwarzacza nie
      // doczytał się przez sieć), start tą samą drogą co aplikacja: API.
      const jak = klik ?? await s.evaluate(() => {
        (document.querySelector(".karta-cw-film") as any)?._gracz?.playVideo();
        return "playVideo() z IFrame Player API";
      });
      const ruszyl = await s.waitForFunction(() => {
        const st = document.querySelector(".karta-cw-film")?.getAttribute("data-stan");
        return st === "gra" || st === "buforuje" || st?.startsWith("blad");
      }, null, { timeout: 20_000 }).then(() => true).catch(() => false);
      const gra = await s.waitForFunction(() => document.querySelector(".karta-cw-film")?.getAttribute("data-stan") === "gra",
        null, { timeout: 20_000 }).then(() => true).catch(() => false);
      const stanPoStarcie = await okno.locator(".karta-cw-film").getAttribute("data-stan");
      if (!bezSieci) sprawdz("start przyjęty przez odtwarzacz w aplikacji (gra albo buforuje), bez błędu YouTube",
        ruszyl && !String(stanPoStarcie).startsWith("blad"), `${jak} → ${stanPoStarcie}`);
      if (gra) {
        const t1 = await s.evaluate(() => (document.querySelector(".karta-cw-film") as any)._gracz.getCurrentTime());
        await s.evaluate(() => (document.querySelector(".karta-cw-film") as any)._gracz.pauseVideo());
        await s.waitForTimeout(800);
        const pauza = await okno.locator(".karta-cw-film").getAttribute("data-stan");
        await s.evaluate(() => (document.querySelector(".karta-cw-film") as any)._gracz.seekTo(5, true));
        await s.waitForTimeout(1200);
        const t2 = await s.evaluate(() => (document.querySelector(".karta-cw-film") as any)._gracz.getCurrentTime());
        sprawdz("film gra, pauza i przewijanie działają", t1 > 0 && pauza === "pauza" && Math.abs(t2 - 5) < 1.5,
          `${t1.toFixed(1)} s → pauza → ${t2.toFixed(1)} s`);
      } else {
        console.log(`  … film nie doszedł do odtwarzania (stan: ${stanPoStarcie}) — tu sieć do serwerów wideo YouTube jest ograniczona`);
        if (!doRecznego.some((r) => r.startsWith("odtwarzanie"))) doRecznego.push(
          "odtwarzanie obrazu, pauza, wznowienie i przewijanie w karcie (iPhone/iPad w Safari i komputer)");
      }
      sprawdz("film gra w aplikacji: adres strony bez zmian, żadnej nowej karty przeglądarki",
        s.url() === adresPrzed && nowe.length === 0, nowe.join(" "));

      // Zamknięcie i powrót do treningu.
      await okno.getByRole("button", { name: "Wróć do treningu" }).click();
      await s.waitForTimeout(300);
      sprawdz("„Wróć do treningu” zamyka kartę i zatrzymuje odtwarzacz",
        await s.locator(".karta-cw-tlo").count() === 0 && await s.locator(".karta-cw-film iframe").count() === 0);
      sprawdz("po powrocie wpisany ciężar i powtórzenia są na miejscu, ekran nie przewinięty",
        await pola.nth(0).inputValue() === "87.5" && await pola.nth(1).inputValue() === "5"
          && Math.abs(await s.evaluate(() => scrollY) - przewiniecie) < 2
          && await s.locator("#ekran-trening:not(.ukryty)").count() === 1,
        `${await pola.nth(0).inputValue()} kg × ${await pola.nth(1).inputValue()}`);

      // Systemowe „wstecz” zamyka kartę, nie cofa z treningu.
      await karta.locator("button.film-karta").click();
      await s.goBack();
      await s.waitForTimeout(400);
      sprawdz("„wstecz” w przeglądarce zamyka kartę i zostaje na treningu",
        await s.locator(".karta-cw-tlo").count() === 0 && await s.locator("#ekran-trening:not(.ukryty)").count() === 1
          && await pola.nth(0).inputValue() === "87.5");
      await karta.locator("button.film-karta").click();
      await s.keyboard.press("Escape");
      await s.waitForTimeout(300);
      sprawdz("Esc też zamyka", await s.locator(".karta-cw-tlo").count() === 0);
      // Po zamknięciu „wstecz” dalej prowadzi z treningu do listy (historia nie rozjechana).
      await s.goBack();
      await s.waitForTimeout(400);
      sprawdz("po zamknięciu karty „wstecz” wraca z treningu do listy tygodni jak dotąd",
        await s.locator("#ekran-trening.ukryty").count() === 1);
      await s.locator("#tygodnie .dzien-kafel").first().click();
      await s.waitForSelector("#ekran-trening:not(.ukryty)");

      // W trakcie prowadzenia serii: film z nagłówka panelu, wpisany ciężar zostaje.
      await s.click("#prowadz");
      await s.waitForSelector("#ekran-seria:not(.ukryty)");
      // Pierwszy panel bywa TOP SETEM — karta jest przy obu.
      const przyciskPanelu = s.locator("#panel .panel-gora button.film-karta");
      const polePanelu = s.locator('#panel input[placeholder="kg"]').first();
      const maPole = await polePanelu.count() > 0;
      if (maPole) await polePanelu.fill("90");
      await przyciskPanelu.click();
      const wPanelu = await s.locator(".karta-cw").isVisible().catch(() => false);
      await s.locator(".karta-cw").getByRole("button", { name: "Wróć do treningu" }).click();
      await s.waitForTimeout(300);
      sprawdz("w trakcie serii: film z nagłówka panelu, po powrocie wpisany ciężar zostaje",
        wPanelu && await s.locator("#ekran-seria:not(.ukryty)").count() === 1
          && (!maPole || await polePanelu.inputValue() === "90"),
        maPole ? `pole: ${await polePanelu.inputValue()}` : "panel bez pola ciężaru");

      // Własny plik zamiast YouTube — ta sama karta, inny typ filmu.
      if (WIDEO_TESTOWE && existsSync(WIDEO_TESTOWE) && ekran.nazwa === "telefon") {
        await s.evaluate(async (adres) => {
          const m = await import("/klient/karta-cwiczenia.js");
          m.otworzKarteCwiczenia({ cwiczenieId: "EX-0011", nazwa: "Barbell bench press", nazwaEn: "Barbell Bench Press",
            nazwaPl: "Wyciskanie sztangi leżąc", kategoria: "Upper push horizontal", rodzaj: "trening siłowy",
            miesnieGlowne: [], miesniePomocnicze: [], sprzet: [],
            wideo: { typ: "plik", plik: `${adres}/test-film.webm`, tytul: "test", link: null,
              zrodlo: { nazwa: "CraftMyPlan", platforma: "własne", url: null } } });
        }, ADRES_APLIKACJI);
        const v = s.locator(".karta-cw-film video");
        await s.waitForFunction(() => (document.querySelector(".karta-cw-film video") as HTMLVideoElement)?.readyState >= 1,
          null, { timeout: 10_000 }).catch(() => null);
        const wynik = await v.evaluate(async (w: HTMLVideoElement) => {
          w.muted = true;
          await w.play();
          await new Promise((r) => setTimeout(r, 1200));
          const t1 = w.currentTime;
          w.pause();
          const pauza = w.paused;
          w.currentTime = 2;
          await new Promise((r) => w.addEventListener("seeked", r, { once: true }));
          return { t1, pauza, t2: w.currentTime, playsinline: w.hasAttribute("playsinline"), controls: w.controls };
        });
        sprawdz("własny plik wideo w tej samej karcie: gra, pauza, przewijanie, playsinline",
          wynik.t1 > 0.5 && wynik.pauza && Math.abs(wynik.t2 - 2) < 0.1 && wynik.playsinline && wynik.controls,
          JSON.stringify(wynik));
        await s.keyboard.press("Escape");
      }

      if (ekran.nazwa === "komputer") {
        await s.click("#wroc-z-serii").catch(() => null);
        await s.locator('#cwiczenia [data-position="D1-S01"] button.film-karta').click().catch(() => null);
        await s.waitForTimeout(1500);
        await zrzut(s, "film-komputer-karta");
        await s.keyboard.press("Escape");
      }

      console.log(`  błędów aplikacji w przeglądarce: ${bledy.length ? bledy.join(" | ") : "brak"}`);
      doliczBledy(bledy.length);
      await kontekst.close();
    }
  } finally {
    await przegladarka.close();
  }
});

if (doRecznego.length) {
  console.log("\n  Do sprawdzenia ręcznie na urządzeniu (tu niemożliwe):");
  for (const r of doRecznego) console.log(`  • ${r}`);
}
podsumuj("karta ćwiczenia z filmem działa");
