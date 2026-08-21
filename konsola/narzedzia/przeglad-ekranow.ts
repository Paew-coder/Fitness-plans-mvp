#!/usr/bin/env node
/**
 * Przegląd ekranów konsoli — klikanie po wszystkich kontrolkach, po kolei.
 *
 *   npm run przeglad-ekranow
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
 * Idzie tą samą drogą co trener: lista klientów → nowy plan → ułożenie cyklu →
 * eksport i wysyłka → wczytanie arkusza z powrotem → kartoteka klienta.
 *
 * Wymaga Playwrighta z Chromium. Nie chodzi w `npm test`, bo tam przeglądarki
 * nie ma — to jest kontrola do puszczenia po zmianach w `public/`.
 */
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { doliczBledy, pilnujBledow, podsumuj, sprawdz, zKonsola } from "./przegladarka.ts";

const PORT = 4189;
const ADRES = `http://127.0.0.1:${PORT}`;
const KLIENT = "Przegląd ekranu";
const PLAN = "przeglad-ekranu-1";
const KLIENT_PO_ZMIANIE = "Przegląd ekranów";
const KLIENT_Z_ARKUSZA = "Import przegladu";
const KLIENT_DO_USUNIECIA = "Do usuniecia";

await zKonsola(PORT, async (przegladarka) => { await przejdz(przegladarka); });
podsumuj("wszystkie kontrolki konsoli działają");

async function przejdz(przegladarka: any): Promise<void> {
  const s = await przegladarka.newPage({ viewport: { width: 1500, height: 1000 } });
  const bledyPrzegladarki = pilnujBledow(s);

  // Konsola pyta przed każdą operacją, która nadpisuje cudzą robotę. Bez tego
  // Playwright odrzuca pytanie po cichu i wychodzi, że przycisk nie działa.
  const pytania: string[] = [];
  const odpowiedzi: string[] = [];   // dla `prompt()` — po kolei, jak padają
  s.on("dialog", (d: any) => {
    pytania.push(d.message());
    d.accept(d.type() === "prompt" ? (odpowiedzi.shift() ?? "") : undefined);
  });

  /** Stan prosto z serwera — sprawdzamy skutek kliknięcia, nie sam ekran. */
  const zBazy = async () => await (await fetch(`${ADRES}/api/plany/${PLAN}`)).json();
  const zapisano = () => s.waitForFunction(
    () => document.querySelector("#zapis")?.textContent === "zapisano", null, { timeout: 8000 });

  await s.goto(ADRES, { waitUntil: "networkidle" });

  // ═══ EKRAN LISTY ═══════════════════════════════════════════════════
  await s.fill('#form-nowy [name="klient"]', KLIENT);
  await s.fill('#form-nowy [name="wersja"]', "1");
  await s.click("#form-nowy button[type=submit]");
  await s.waitForSelector("#ekran-plan:not(.ukryty)", { timeout: 10000 });
  const zalozony = await (await fetch(`${ADRES}/api/plany`)).json();
  sprawdz("nowy plan zakłada się z listy",
    zalozony.some((x: any) => x.id === PLAN), zalozony.map((x: any) => x.id).join(", "));

  // ═══ EKRAN PLANU ═══════════════════════════════════════════════════

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

  // ── 8. podmiana ćwiczenia, które klient już ocenił ────────────────
  // Mnożnik adaptacji liczy się z odczuć slotu, nie ćwiczenia. Po podmianie
  // oceny poprzedniego ćwiczenia działałyby dalej — na ciężar czegoś, czego
  // klient nie robił. Konsola musi o tym powiedzieć w chwili podmiany.
  const zOcena = await (async () => {
    const { zapisany } = await zBazy();
    const slot = zapisany.plan.sloty.find((x: any) => x.cwiczenieId === "EX-0010");
    slot.tygodnie["1"] = { ...(slot.tygodnie["1"] ?? {}), feedback: "za łatwe" };
    slot.tygodnie["2"] = { ...(slot.tygodnie["2"] ?? {}), feedback: "za łatwe" };
    await fetch(`${ADRES}/api/plany/${PLAN}`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: zapisany.plan, dataStartu: zapisany.dataStartu,
        status: zapisany.status }),
    });
    return slot.positionId;
  })();
  // Oceny dopisaliśmy z boku, więc ekran trzeba wczytać na nowo — tą samą
  // drogą, którą trener wraca do planu: lista → kartoteka → cykl.
  await s.reload({ waitUntil: "networkidle" });
  await s.locator("#lista-klientow .pozycja", { hasText: KLIENT })
    .getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-klient:not(.ukryty)");
  await s.locator("#lista-cykli").getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-plan:not(.ukryty)");

  const wierszZOcena = s.locator("#dni tr").filter({ has: s.locator("td.cwiczenie select") })
    .filter({ has: s.locator(`td:text-is("${zOcena}")`) });
  const doPodmiany = (await wierszZOcena.count()) > 0
    ? wierszZOcena.first()
    : s.locator("#dni tr").filter({ has: s.locator("td.cwiczenie select") }).nth(1);
  // Wybór po identyfikatorze, nie po nazwie — lista bywa zawężona szkieletem,
  // a to samo ćwiczenie ma w niej różne podpisy.
  await doPodmiany.locator("td.cwiczenie select").selectOption("EX-0013");
  await s.waitForSelector("#modal:not(.ukryty)", { timeout: 5000 });
  // `innerText` oddaje tekst po stylach, a nagłówki modala są wersalikami.
  sprawdz("podmiana ocenionego ćwiczenia pyta o oceny",
    (await s.locator("#modal-tytul").innerText()).toLocaleLowerCase("pl").includes("ocenił"),
    await s.locator("#modal-tytul").innerText());

  await s.locator("#modal-body").getByRole("button", { name: "Wyczyść oceny" }).click();
  await zapisano();
  const poWyczyszczeniu = (await zBazy()).zapisany.plan.sloty
    .find((x: any) => x.positionId === zOcena)?.tygodnie;
  sprawdz("wyczyszczenie zdejmuje oceny ze slotu",
    !poWyczyszczeniu?.["1"]?.feedback && !poWyczyszczeniu?.["2"]?.feedback,
    JSON.stringify(poWyczyszczeniu?.["1"] ?? {}));
  sprawdz("parametry tygodnia zostają po wyczyszczeniu ocen",
    poWyczyszczeniu?.["1"]?.serie > 0, JSON.stringify(poWyczyszczeniu?.["1"] ?? {}));

  // ── 9. przełączniki planu ─────────────────────────────────────────
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

  // ── 10. TOP SET ────────────────────────────────────────────────────
  await s.locator(".topset input[type=checkbox]").first().uncheck();
  await zapisano();
  sprawdz("TOP SET da się wyłączyć", (await zBazy()).zapisany.plan.topSety[0].wlaczony === false);

  // ── 11. moduł oddechu ─────────────────────────────────────────────
  await s.fill("#oddech-twot", "22");
  await s.locator("#oddech-twot").blur();
  await s.waitForTimeout(700);
  const oddech = (await zBazy()).moduly.oddech.dawka;
  sprawdz("moduł oddechu liczy dawkę", oddech !== null, oddech?.poziom ?? "brak");

  // ── 12. link dla klienta ──────────────────────────────────────────
  await s.click("#link-klienta");
  await s.waitForSelector("#modal:not(.ukryty)");
  const link = (await s.locator("#modal-body").innerText()).match(/\/k\/\S+/)?.[0] ?? "";
  sprawdz("link dla klienta pokazuje adres", /^\/k\/[\w-]{16,}$/.test(link), link || "brak");
  await s.click("#modal-zamknij");

  // ── 13. eksport arkusza ───────────────────────────────────────────
  // Arkusz nie leci przez przeglądarkę — konsola zapisuje go na dysku i podaje
  // ścieżkę. Kontrola jest więc dwuczęściowa: co pokazała i czy plik jest.
  await s.click("#eksportuj");
  await s.waitForSelector("#modal:not(.ukryty)", { timeout: 30000 });
  const sciezka = (await s.locator("#modal-body code").innerText()).trim();
  sprawdz("eksport zapisuje arkusz na dysku",
    sciezka.endsWith(".xlsx") && existsSync(sciezka), sciezka);
  await s.click("#modal-zamknij");

  // ── 14. wysyłka planu ─────────────────────────────────────────────
  await s.selectOption("#status-wybor", "wysłany");
  await s.waitForTimeout(800);
  sprawdz("plan da się wysłać", (await zBazy()).zapisany.status === "wysłany");

  // ═══ KARTOTEKA KLIENTA ═════════════════════════════════════════════
  const klienci = async () => await (await fetch(`${ADRES}/api/klienci`)).json();

  await s.click("#wroc");
  await s.waitForSelector("#ekran-klient:not(.ukryty)");
  sprawdz("z planu wraca się do kartoteki jego klienta",
    (await s.locator("#nazwa-klienta").innerText()).includes(KLIENT),
    await s.locator("#nazwa-klienta").innerText());

  // ── 14. nowy cykl ─────────────────────────────────────────────────
  // Drugi cykl powstaje jako kopia poprzedniego — po to, żeby nie układać
  // tego samego szkieletu od zera co sześć tygodni.
  await s.click("#nowy-cykl");
  await s.waitForSelector("#ekran-plan:not(.ukryty)", { timeout: 10000 });
  const drugi = await (await fetch(`${ADRES}/api/plany/przeglad-ekranu-2`)).json();
  sprawdz("nowy cykl kopiuje poprzedni",
    drugi.zapisany?.wersja === 2 && drugi.zapisany.status === "szkic"
    && drugi.zapisany.plan.sloty[0].cwiczenieId === "EX-0016",
    `wersja ${drugi.zapisany?.wersja} · ${drugi.zapisany?.status}`);
  await s.click("#wroc");
  await s.waitForSelector("#ekran-klient:not(.ukryty)");

  // ── 15. poprawienie nazwy ─────────────────────────────────────────
  // Literówka w nazwisku nie może rozdzielić historii, więc identyfikator
  // klienta zostaje ten sam — zmienia się tylko to, co widać.
  odpowiedzi.push(KLIENT_PO_ZMIANIE);
  await s.click("#zmien-nazwe");
  await s.waitForTimeout(600);
  const poZmianie = (await klienci()).find((k: any) => k.id === "przeglad-ekranu");
  sprawdz("zmiana nazwy nie rusza identyfikatora",
    poZmianie?.nazwa === KLIENT_PO_ZMIANIE && poZmianie.cykli === 2,
    `${poZmianie?.nazwa} · ${poZmianie?.cykli} cykle`);

  // ── 16. link dla klienta z kartoteki ──────────────────────────────
  await s.click("#link-klienta-karta");
  await s.waitForSelector("#modal:not(.ukryty)");
  const linkKarty = (await s.locator("#modal-body").innerText()).match(/\/k\/\S+/)?.[0] ?? "";
  sprawdz("link z kartoteki jest ten sam co z planu", linkKarty === link, linkKarty || "brak");
  await s.click("#modal-zamknij");

  // ═══ POWRÓT NA LISTĘ: WCZYTANIE ARKUSZA ════════════════════════════
  await s.click("#wroc-do-klientow");
  await s.waitForSelector("#ekran-lista:not(.ukryty)");

  // ── 17. import wyeksportowanego arkusza ───────────────────────────
  // Ten sam plik, który przed chwilą wyszedł z eksportu, ma wrócić z tymi
  // samymi ćwiczeniami. To domyka kółko konsola → arkusz → konsola.
  await s.fill('#form-import [name="klient"]', KLIENT_Z_ARKUSZA);
  await s.fill('#form-import [name="wersja"]', "1");
  // Chromium pod Playwrightem gubi po cichu plik, którego ścieżka ma polskie
  // znaki — a eksport nazywa pliki nazwiskiem klienta. To ograniczenie samego
  // sterowania przeglądarką, nie konsoli, więc kopiujemy plik obok pod nazwą
  // bez ogonków i wczytujemy tę kopię.
  const kopiaArkusza = join(tmpdir(), "przeglad-ekranow.xlsx");
  copyFileSync(sciezka, kopiaArkusza);
  await s.setInputFiles('#form-import [name="plik"]', kopiaArkusza);
  await s.click("#form-import button[type=submit]");
  await s.waitForSelector("#ekran-plan:not(.ukryty)", { timeout: 60000 });
  const wczytany = await (await fetch(`${ADRES}/api/plany/import-przegladu-1`)).json();
  // Drugi slot to EX-0013 — ćwiczenie podmienione w kroku 8.
  sprawdz("arkusz wraca z tymi samymi ćwiczeniami",
    wczytany.zapisany?.plan.sloty.slice(0, 2).map((x: any) => x.cwiczenieId).join(",")
      === "EX-0016,EX-0013",
    wczytany.zapisany?.plan.sloty.slice(0, 2).map((x: any) => x.cwiczenieId).join(" → ") ?? "brak");
  // Arkusz był potrzebny tylko na tę jedną kontrolę — katalog eksportów należy
  // do trenera i nie ma w nim zostawać plik po przeglądzie.
  rmSync(sciezka, { force: true });
  rmSync(kopiaArkusza, { force: true });

  // ── 18. scalenie dwóch kartotek ───────────────────────────────────
  // Dwie kartoteki tej samej osoby biorą się z literówki. Scalenie przenosi
  // cykle zamiast kazać wpisywać je od nowa.
  await s.click("#wroc");
  await s.waitForSelector("#ekran-klient:not(.ukryty)");
  await s.click("#polacz-klienta");
  await s.waitForSelector("#modal:not(.ukryty)");
  await s.locator("#modal-body select").selectOption("przeglad-ekranu");
  await s.locator("#modal-body").getByRole("button", { name: "Połącz" }).click();
  await s.waitForTimeout(900);
  const poScaleniu = await klienci();
  sprawdz("scalenie przenosi cykle i zamyka drugą kartotekę",
    poScaleniu.length === 1 && poScaleniu[0].cykli === 3,
    poScaleniu.map((k: any) => `${k.nazwa}: ${k.cykli}`).join(" · "));

  // ── 19. usunięcie kartoteki ───────────────────────────────────────
  await s.click("#wroc-do-klientow");
  await s.waitForSelector("#ekran-lista:not(.ukryty)");
  await s.fill('#form-nowy [name="klient"]', KLIENT_DO_USUNIECIA);
  await s.fill('#form-nowy [name="wersja"]', "1");
  await s.click("#form-nowy button[type=submit]");
  await s.waitForSelector("#ekran-plan:not(.ukryty)", { timeout: 10000 });
  await s.click("#wroc");
  await s.waitForSelector("#ekran-klient:not(.ukryty)");
  await s.click("#usun-klienta");
  await s.waitForSelector("#ekran-lista:not(.ukryty)", { timeout: 10000 });
  const poUsunieciu = await klienci();
  sprawdz("usunięcie kartoteki zabiera ją z listy",
    poUsunieciu.length === 1 && poUsunieciu[0].id === "przeglad-ekranu",
    poUsunieciu.map((k: any) => k.nazwa).join(" · "));

  console.log(bledyPrzegladarki.length
    ? `\n  błędy w przeglądarce: ${JSON.stringify(bledyPrzegladarki.slice(0, 3))}`
    : "\n  błędów w przeglądarce: brak");
  doliczBledy(bledyPrzegladarki.length);
}
