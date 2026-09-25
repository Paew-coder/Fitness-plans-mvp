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

import { doliczBledy, pilnujBledow, podsumuj, sprawdz, zKonsola, type Srodowisko }
  from "./przegladarka.ts";

const PORT = 4189;
const ADRES = `http://127.0.0.1:${PORT}`;
const KLIENT = "Przegląd ekranu";
const PLAN = "przeglad-ekranu-1";
const KLIENT_PO_ZMIANIE = "Przegląd ekranów";
const KLIENT_Z_ARKUSZA = "Import przegladu";
const KLIENT_DO_USUNIECIA = "Do usuniecia";

/** iPhone 13 — ten sam ekran, na którym oglądamy aplikację klienta. */
const TELEFON = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
/**
 * iPad — szerokość laptopa, sterowanie palcem. Trener pracuje na zmianę na
 * laptopie i na iPadzie, a konsolę sprawdzaliśmy tylko na laptopie i na
 * telefonie: rozmiary pod palec włączały się poniżej 760 px, więc iPad
 * dostawał wersję dla myszy z przyciskami 14×11 px i objaśnieniami w dymkach.
 */
const IPAD_PION = { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true };
const IPAD_POZIOM = { viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true };

/**
 * Najmniejszy bok celu, poniżej którego trafianie palcem przestaje być
 * celowaniem. Zalecane 44 px to rozmiar, którego ciasna tabela planu nie
 * udźwignie — ten próg jest kompromisem i jest tu wpisany wprost, żeby było
 * widać, że to wybór, a nie przeoczenie.
 */
const MINIMALNY_CEL = 24;

await zKonsola(PORT, async (przegladarka, srodowisko) => {
  await przejdz(przegladarka, srodowisko);
});
podsumuj("wszystkie kontrolki konsoli działają");

async function przejdz(przegladarka: any, { api }: Srodowisko): Promise<void> {
  const s = await przegladarka.newPage({ viewport: { width: 1500, height: 1000 } });
  const bledyPrzegladarki = pilnujBledow(s);

  // Konsola pyta przed każdą operacją, która nadpisuje cudzą robotę. Bez tego
  // Playwright odrzuca pytanie po cichu i wychodzi, że przycisk nie działa.
  const pytania: string[] = [];
  const odpowiedzi: string[] = [];   // dla `prompt()` — po kolei, jak padają
  // Domyślnie zgadzamy się na wszystko. `odrzucaj` przestawia to na czas
  // jednej kontroli — bo przy ostrzeżeniu przed wysyłką połowa sprawy polega
  // na tym, że „nie" naprawdę zatrzymuje operację.
  let odrzucaj = false;
  s.on("dialog", (d: any) => {
    pytania.push(d.message());
    if (odrzucaj && d.type() !== "prompt") return void d.dismiss();
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
  //
  // Liczba wierszy PRZED zapisem, nie po nim. Wybranie ćwiczenia zmienia układ
  // tabeli: wiersz przestaje być pusty i pod nim ma stanąć następny wolny.
  // Dotąd działo się to dopiero po powrocie z serwera — 350 ms dławika plus
  // droga w obie strony. Na laptopie tego nie widać, na iPadzie przez internet
  // trener zdążył uznać, że nic się nie stało, i szukał wiersza przełączając
  // tygodnie tam i z powrotem. Dlatego sprawdzamy to w okienku krótszym niż
  // sam dławik: gdyby wiersz znów czekał na serwer, ta kontrola zapali się
  // na czerwono.
  const wierszeZDoborem = () =>
    s.locator("#dni tr").filter({ has: s.locator("td.cwiczenie select") }).count();
  const przedDoborem = await wierszeZDoborem();

  await wiersz(0).locator("td.cwiczenie select").selectOption({ label: "Barbell back squat" });
  await s.waitForTimeout(120);
  const zaraz = await wierszeZDoborem();
  sprawdz("następny wiersz pojawia się od razu, bez czekania na zapis",
    zaraz === przedDoborem + 1, `${przedDoborem} → ${zaraz} wierszy po 120 ms`);

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
  //
  // A1 musi trzymać ćwiczenie ZŁOŻONE, bo od tego zależy, czy dostanie
  // progresję bloku. Po przestawianiu wierszy w poprzedniej sekcji stoi tam
  // akcesorium — a akcesorium na pierwszym miejscu dnia bojem głównym nie jest
  // i nie ma być.
  await wiersz(0).locator("td.cwiczenie select").selectOption({ label: "Barbell bench press" });
  await zapisano();

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

  // I z powrotem to, co tu stało — dalsze sekcje liczą na ten sam plan.
  await wiersz(0).locator("td.cwiczenie select").selectOption({ label: "Barbell row" });
  await zapisano();

  // ── 8. podmiana ćwiczenia w slocie z przerobionymi treningami ─────
  // Zmiana ćwiczenia przepisywała cały cykl — razem z tygodniami, które klient
  // już zrobił. Ekran postępu twierdził wtedy, że podniósł te ciężary
  // w ćwiczeniu, którego nie robił. Konsola musi zapytać, od kiedy.
  const zOcena = await (async () => {
    const { zapisany } = await zBazy();
    const slot = zapisany.plan.sloty.find((x: any) => x.cwiczenieId === "EX-0010");
    slot.tygodnie["1"] = { ...(slot.tygodnie["1"] ?? {}), feedback: "za łatwe" };
    slot.tygodnie["2"] = { ...(slot.tygodnie["2"] ?? {}), feedback: "za łatwe" };
    zapisany.plan.serieMaksymalne = [
      ...zapisany.plan.serieMaksymalne.filter((x: any) => x.cwiczenieId !== "EX-0013"),
      { cwiczenieId: "EX-0013", ciezar: 100, powtorzenia: 3 },
    ];
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
  // Wybór po identyfikatorze, nie po nazwie — lista bywa zawężona szkieletem.
  await doPodmiany.locator("td.cwiczenie select").selectOption("EX-0013");
  await s.waitForSelector("#modal:not(.ukryty)", { timeout: 5000 });
  sprawdz("podmiana w przerobionym slocie pyta, od którego tygodnia",
    (await s.locator("#modal-tytul").innerText()).toLocaleLowerCase("pl").includes("przerobione"),
    await s.locator("#modal-tytul").innerText());

  await s.locator("#modal-body").getByRole("button", { name: /^Od T3$/ }).click();
  await zapisano();
  const poPodmianie = (await zBazy());
  const slotPo = poPodmianie.zapisany.plan.sloty.find((x: any) => x.positionId === zOcena);
  sprawdz("przerobione tygodnie zostają przy dawnym ćwiczeniu",
    slotPo?.cwiczenieId === "EX-0010"
    && poPodmianie.wynik.tygodnie[0].sloty
      .find((x: any) => x.positionId === zOcena)?.cwiczenie?.id === "EX-0010",
    `T1: ${poPodmianie.wynik.tygodnie[0].sloty
      .find((x: any) => x.positionId === zOcena)?.cwiczenie?.nazwa}`);
  sprawdz("od wskazanego tygodnia wchodzi nowe ćwiczenie",
    [3, 4, 5, 6].every((t) => poPodmianie.wynik.tygodnie[t - 1].sloty
      .find((x: any) => x.positionId === zOcena)?.cwiczenie?.id === "EX-0013"),
    `T3: ${poPodmianie.wynik.tygodnie[2].sloty
      .find((x: any) => x.positionId === zOcena)?.cwiczenie?.nazwa}`);
  sprawdz("podmienione tygodnie mają policzony ciężar, nie „ustaw ręcznie”",
    typeof poPodmianie.wynik.tygodnie[3].sloty
      .find((x: any) => x.positionId === zOcena)?.ciezar === "number",
    String(poPodmianie.wynik.tygodnie[3].sloty
      .find((x: any) => x.positionId === zOcena)?.ciezar));

  // ── 9. ciężar wpisany ręcznie ─────────────────────────────────────
  // Silnik od początku przyjmował `ciezarOverride`; brakowało miejsca, w którym
  // trener może go wpisać. Puste pole znaczy „licz automatem", tak samo jak
  // przy powtórzeniach.
  // Po podmianie ćwiczeń żadne nie ma już serii maksymalnej, a nadpisanie chcemy
  // sprawdzić tam, gdzie ciężar naprawdę się liczy — inaczej pokazalibyśmy
  // tylko, że da się wpisać liczbę w puste miejsce.
  await (async () => {
    const { zapisany } = await zBazy();
    const pierwsze = zapisany.plan.sloty.find((x: any) => x.cwiczenieId)!.cwiczenieId;
    zapisany.plan.serieMaksymalne = [
      ...zapisany.plan.serieMaksymalne.filter((x: any) => x.cwiczenieId !== pierwsze),
      { cwiczenieId: pierwsze, ciezar: 100, powtorzenia: 5 },
    ];
    await fetch(`${ADRES}/api/plany/${PLAN}`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: zapisany.plan, dataStartu: zapisany.dataStartu,
        status: zapisany.status }),
    });
  })();
  await s.reload({ waitUntil: "networkidle" });
  await s.locator("#lista-klientow .pozycja", { hasText: KLIENT })
    .getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-klient:not(.ukryty)");
  await s.locator("#lista-cykli").getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-plan:not(.ukryty)");

  // Bierzemy wiersz, w którym ciężar naprawdę się policzył — inaczej sprawdzenie
  // pokazałoby tylko, że da się wpisać liczbę tam, gdzie i tak nic nie było.
  const wszystkiePola = s.locator("#dni tr input.pole-ciezaru");
  let poleCiezaru = wszystkiePola.first();
  let liczony = await poleCiezaru.getAttribute("placeholder");
  for (let i = 0; i < await wszystkiePola.count(); i++) {
    const p = await wszystkiePola.nth(i).getAttribute("placeholder");
    if (p && Number.isFinite(Number(p.replace(",", ".")))) {
      poleCiezaru = wszystkiePola.nth(i);
      liczony = p;
      break;
    }
  }
  await poleCiezaru.fill("62.5");
  await poleCiezaru.blur();
  await zapisano();
  const zReczym = await zBazy();
  const nadpisany = zReczym.wynik.tygodnie[0].sloty.find((x: any) => x.ciezarNadpisany);
  sprawdz("ciężar wpisany ręcznie wygrywa z liczonym",
    nadpisany?.ciezar === 62.5, `liczony ${liczony} → ręczny ${nadpisany?.ciezar}`);
  sprawdz("kontrola planu wymienia ciężary ręczne",
    zReczym.uwagi.some((u: any) => u.kod === "CIEZAR_RECZNY" && u.pozycje[0] !== "0"),
    zReczym.uwagi.find((u: any) => u.kod === "CIEZAR_RECZNY")?.pozycje.join(", ") ?? "brak");

  await poleCiezaru.fill("");
  await poleCiezaru.blur();
  await zapisano();
  const bezRecznego = await zBazy();
  const wrocony = bezRecznego.wynik.tygodnie[0].sloty
    .find((x: any) => x.positionId === nadpisany?.positionId);
  sprawdz("wyczyszczenie pola wraca do ciężaru liczonego",
    wrocony?.ciezarNadpisany === false
    && String(wrocony?.ciezar).replace(".", ",") === liczony,
    `${wrocony?.ciezar} kg (liczony ${liczony})`);

  // ── 10. klient ocenia trening w trakcie pracy trenera ─────────────
  // Konsola trzyma plan w pamięci przeglądarki. Gdy klient w tym czasie oceni
  // serię, zapis trenera niósłby wersję sprzed oceny i kasował ją — razem
  // z podniesionym ciężarem w kolejnym tygodniu. Konsola ma to pogodzić sama.
  // Klient widzi tylko plan wysłany — bez tego nie ma czego oceniać.
  // Przestawiamy status z ekranu, żeby konsola miała go u siebie tak samo.
  await s.selectOption("#status-wybor", "wysłany");
  await s.waitForTimeout(800);
  // Po wysłaniu konsola sama pokazuje link dla klienta — zamykamy, żeby nie
  // zasłaniał reszty ekranu.
  await s.locator("#modal-zamknij").click({ timeout: 3000 }).catch(() => {});

  const bledyPrzedWyscigiem = bledyPrzegladarki.length;
  const przedOcena = await zBazy();
  const linkKlienta = await api(`/api/plany/${PLAN}/link`, "POST");
  const ciezarT2 = (o: any) => o.wynik.tygodnie[1].sloty[0].ciezar;

  await api(`/api/klient/${linkKlienta.token}/odczucie`, "POST",
    { positionId: przedOcena.zapisany.plan.sloty[0].positionId, tydzien: 1, feedback: "za łatwe" });
  const poOcenie = await zBazy();
  sprawdz("ocena klienta podnosi ciężar w kolejnym tygodniu",
    ciezarT2(poOcenie) > ciezarT2(przedOcena),
    `T2: ${ciezarT2(przedOcena)} → ${ciezarT2(poOcenie)} kg`);

  // Trener zmienia coś na swoim ekranie — konsola dalej ma kopię sprzed oceny.
  await s.selectOption("#czesc-planu", "intensywność");
  await zapisano();

  const poZapisie = await zBazy();
  sprawdz("zapis trenera nie skasował oceny klienta",
    poZapisie.zapisany.plan.sloty[0].tygodnie["1"]?.feedback === "za łatwe",
    String(poZapisie.zapisany.plan.sloty[0].tygodnie["1"]?.feedback));
  sprawdz("ciężar policzony z oceny został utrzymany",
    ciezarT2(poZapisie) === ciezarT2(poOcenie),
    `T2 ${ciezarT2(poZapisie)} kg (po ocenie było ${ciezarT2(poOcenie)})`);
  sprawdz("zmiana trenera też weszła",
    poZapisie.zapisany.plan.czescPlanu === "intensywność",
    poZapisie.zapisany.plan.czescPlanu);

  // Ocena musi być widoczna także wtedy, gdy nie przebiła zaokrąglenia.
  // Zgłoszone z użycia: „za trudne" przy sztandze poniżej 25 kg nie rusza
  // liczby, bo 5% nie sięga połowy skoku 2,5 kg — i wyglądało to dokładnie
  // tak samo jak ocena, której aplikacja nie przyjęła.
  await s.locator('#taby-tygodni button:has-text("T2")').first().click();
  await s.waitForTimeout(500);
  const znacznik = await s.locator("td.ciezar .znacznik-ocena").first()
    .innerText().catch(() => "");
  sprawdz("konsola pokazuje, o ile oceny przesuwają ciężar",
    /^\+5\s*%$/.test(znacznik.trim()), znacznik.trim() || "brak znacznika");
  await s.locator('#taby-tygodni button:has-text("T1")').first().click();
  await s.waitForTimeout(400);
  // Odrzucony zapis (409) jest tu **celem sprawdzenia**, nie awarią —
  // przeglądarka wypisuje go do konsoli i to jest w porządku.
  bledyPrzegladarki.splice(bledyPrzedWyscigiem);


  // ── 11. przełączniki planu ────────────────────────────────────────
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

  // Z powrotem na domyślny tryb — i to też ma się zapisać. Dalsze kontrole
  // sprawdzają przestawianie POJEDYNCZEGO ćwiczenia, więc plan musi stać
  // na czymś innym, bo inaczej nie byłoby widać żadnej różnicy.
  await s.selectOption("#tryb-akcesoriow", "trzymaj z bloku");
  await zapisano();
  sprawdz("i da się wrócić do trybu domyślnego",
    (await zBazy()).zapisany.plan.trybAkcesoriow === "trzymaj z bloku");

  // ── 11b. „licz z RPE" przy jednym ćwiczeniu ───────────────────────
  //
  // Zgłoszone z używania: „licz z RPE wydaje mi się że nie jest przydatny bo
  // zmienia wszystkie akcesoria naraz — zróbmy tak żeby dało się poszczególne
  // ćwiczenia przełączyć". Przełącznik przy planie zostaje jako wartość
  // domyślna; decyduje wiersz.
  const ciezaryTygodni = async (positionId: string) => {
    const { wynik } = await zBazy();
    return wynik.tygodnie.map((t: any) =>
      t.sloty.find((x: any) => x.positionId === positionId)?.ciezar);
  };
  const przedPrzestawieniem = await ciezaryTygodni("D1-S02");
  const sasiadPrzedTrybem = await ciezaryTygodni("D1-S01");

  await wiersz(1).hover();
  await wiersz(1).locator("td.lp button", { hasText: /^R$/ }).click();
  await zapisano();

  const zTrybem = await zBazy();
  const slotZTrybem = zTrybem.zapisany.plan.sloty.find((x: any) => x.positionId === "D1-S02");
  sprawdz("tryb ciężaru zapisuje się przy tym jednym ćwiczeniu",
    slotZTrybem?.trybCiezaru === "licz z RPE", String(slotZTrybem?.trybCiezaru));

  const poPrzestawieniu = await ciezaryTygodni("D1-S02");
  sprawdz("i naprawdę zmienia ciężary tego ćwiczenia",
    JSON.stringify(poPrzestawieniu) !== JSON.stringify(przedPrzestawieniem),
    `${JSON.stringify(przedPrzestawieniem)} → ${JSON.stringify(poPrzestawieniu)}`);
  sprawdz("a pozostałe ćwiczenia zostają nietknięte",
    JSON.stringify(await ciezaryTygodni("D1-S01")) === JSON.stringify(sasiadPrzedTrybem));
  sprawdz("przy Lp. widać znacznik RPE",
    await wiersz(1).locator(".znacznik-tryb").isVisible().catch(() => false));

  await wiersz(1).hover();
  await wiersz(1).locator("td.lp button", { hasText: /^R$/ }).click();
  await zapisano();
  const poCofnieciu = await zBazy();
  sprawdz("ponowne kliknięcie wraca do trybu z planu",
    poCofnieciu.zapisany.plan.sloty.find((x: any) => x.positionId === "D1-S02")?.trybCiezaru == null
    && JSON.stringify(await ciezaryTygodni("D1-S02")) === JSON.stringify(przedPrzestawieniem));

  // ── 11c. progresja boju w cz.1 i w cz.2 ───────────────────────────
  //
  // Odczytane z arkuszy trenera „Szablon 3 dni, 3 złożone cz.1 / cz.2",
  // Day I. Do tej pory aplikacja znała tylko cz.1, więc drugi cykl klienta
  // wychodził z liczbami pierwszego — te same 6×6 na RPE 6,5, mimo że klient
  // ma za sobą sześć tygodni i wyższy 1RM.
  //
  // Na osobnym planie, żeby nie ruszać tego, na którym stoi reszta przeglądu.
  await api("/api/plany", "POST", { klient: "Kontynuacja cyklu", wersja: 1 });
  const PLAN_KONT = "kontynuacja-cyklu-1";
  const wKont = await (await fetch(`${ADRES}/api/plany/${PLAN_KONT}`)).json();
  wKont.zapisany.plan.sloty[0].cwiczenieId = "EX-0011";   // Barbell bench press
  wKont.zapisany.plan.serieMaksymalne = [
    { cwiczenieId: "EX-0011", ciezar: 100, powtorzenia: 1 },
  ];
  const zapiszKont = async (plan: any) => {
    const teraz = await (await fetch(`${ADRES}/api/plany/${PLAN_KONT}`)).json();
    await fetch(`${ADRES}/api/plany/${PLAN_KONT}`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        plan, dataStartu: null, status: "szkic", zmieniony: teraz.zapisany.zmieniony,
      }),
    });
    return await (await fetch(`${ADRES}/api/plany/${PLAN_KONT}`)).json();
  };
  const schematBoju = (o: any) => o.wynik.tygodnie.map((t: any) => {
    const b = t.sloty.find((x: any) => x.lp === "A1." && x.cwiczenie);
    return `${b.serie}×${b.powtorzenia}@${b.rpe}`;
  }).join(" ");

  const naObjetosc = await zapiszKont(wKont.zapisany.plan);
  sprawdz("cz.1: bój idzie od 6×6 do 6×3",
    schematBoju(naObjetosc) === "6×6@6.5 5×6@7 5×5@7 4×5@7.5 5×4@7.5 6×3@7.5",
    schematBoju(naObjetosc));

  const naIntensywnosc = await zapiszKont(
    { ...naObjetosc.zapisany.plan, czescPlanu: "intensywność" });
  sprawdz("cz.2: bój idzie od 6×4 do 6×2",
    schematBoju(naIntensywnosc) === "6×4@7 6×4@7 5×4@7.5 5×3@7.5 5×3@8 6×2@8",
    schematBoju(naIntensywnosc));

  const ciezarT6 = (o: any) => o.wynik.tygodnie[5].sloty
    .find((x: any) => x.lp === "A1." && x.cwiczenie).ciezar;
  sprawdz("i kontynuacja kończy się na cięższej sztandze",
    ciezarT6(naIntensywnosc) > ciezarT6(naObjetosc),
    `cz.1 ${ciezarT6(naObjetosc)} kg → cz.2 ${ciezarT6(naIntensywnosc)} kg`);

  // Sprzątamy po sobie: dalsze sekcje liczą kartoteki na liście.
  await fetch(`${ADRES}/api/plany/${PLAN_KONT}`, { method: "DELETE" });
  const kontDoUsuniecia = (await (await fetch(`${ADRES}/api/klienci`)).json())
    .find((k: any) => k.nazwa === "Kontynuacja cyklu");
  if (kontDoUsuniecia) {
    await fetch(`${ADRES}/api/klienci/${kontDoUsuniecia.id}`, { method: "DELETE" });
  }

  // ── 12. TOP SET przy dowolnym ćwiczeniu ───────────────────────────
  //
  // Prośba wprost z używania: „możliwość kliknięcia obojętnie którego
  // ćwiczenia i dodania top setu". Dotąd TOP SET siedział na sztywno przy
  // pierwszym wierszu dnia i pokazywał się tylko wtedy, gdy stało tam
  // ćwiczenie złożone — więc trener nie mógł ani go przesunąć, ani zdjąć
  // stamtąd, gdzie go nie chciał.
  //
  // Układ tego planu jest do tego wymarzony: w pierwszym wierszu stoi
  // akcesorium (Barbell row), a przysiad — w drugim. Czyli dokładnie ten
  // przypadek, w którym dawniej TOP SET nie miał prawa się pojawić.
  const topSetDnia1 = async () =>
    (await zBazy()).zapisany.plan.topSety.filter((t: any) => t.dzien === 1);
  const przyciskTopSetu = (n: number) =>
    wiersz(n).locator("td.lp button", { hasText: /^T$/ });

  sprawdz("nowy plan nie dodaje TOP SETU sam z siebie",
    (await s.locator(".topset").count()) === 0 && !(await topSetDnia1())[0]?.wlaczony);

  await wiersz(1).hover();
  await przyciskTopSetu(1).click();
  await zapisano();
  const poDodaniu = await zBazy();
  const top1 = poDodaniu.zapisany.plan.topSety.find((t: any) => t.dzien === 1);
  sprawdz("TOP SET siada przy wskazanym ćwiczeniu, nie przy pierwszym wierszu",
    top1?.wlaczony === true && top1?.slotPositionId === "D1-S02",
    `${top1?.slotPositionId} · włączony: ${top1?.wlaczony}`);

  const topWTygodniu = (o: any, t: number) =>
    o.wynik.tygodnie[t - 1].topSety.find((x: any) => x.dzien === 1);

  /*
   * RPE TOP SETU rośnie przez cykl, a w T1 TOP SETU nie ma — tak jest w obu
   * arkuszach trenera. Plan stoi teraz na „intensywność", czyli cz.2:
   * 7 → 7,5 → 8 → 8,5 → 9.
   */
  sprawdz("w T1 TOP SETU nie ma i konsola mówi o tym wprost",
    topWTygodniu(poDodaniu, 1)?.rpe === null
    && (await s.locator(".topset").first().innerText()).includes("bez TOP SETU"),
    (await s.locator(".topset").first().innerText()).replace(/\n/g, " "));

  const rampa = (o: any) => [1, 2, 3, 4, 5, 6]
    .map((t) => topWTygodniu(o, t)?.rpe ?? "—").join(" ");
  sprawdz("RPE TOP SETU rośnie tydzień po tygodniu",
    rampa(poDodaniu) === "— 7 7.5 8 8.5 9", rampa(poDodaniu));

  await s.locator("#taby-tygodni button", { hasText: /^T2$/ }).click();
  await s.waitForTimeout(400);

  const wyliczonyTop = topWTygodniu(poDodaniu, 2);
  sprawdz("i silnik liczy dla niego ciężar",
    wyliczonyTop?.cwiczenie?.id === "EX-0010" && typeof wyliczonyTop?.ciezar === "number",
    `${wyliczonyTop?.cwiczenie?.nazwa ?? "brak"} · ${wyliczonyTop?.ciezar}`);
  sprawdz("pasek nad dniem pokazuje to ćwiczenie",
    (await s.locator(".topset").first().innerText()).includes("Barbell back squat"),
    (await s.locator(".topset").first().innerText()).replace(/\n/g, " "));

  // Kliknięcie w innym wierszu ma TOP SET PRZENIEŚĆ — w dniu jest jeden,
  // tak jak jeden wiersz TOP SET w arkuszu.
  await wiersz(0).hover();
  await przyciskTopSetu(0).click();
  await zapisano();
  const poPrzeniesieniu = await topSetDnia1();
  sprawdz("kliknięcie w innym wierszu przenosi TOP SET, nie dokłada drugiego",
    poPrzeniesieniu.length === 1 && poPrzeniesieniu[0].slotPositionId === "D1-S01",
    poPrzeniesieniu.map((t: any) => t.slotPositionId).join(", "));

  // Akcesorium też może mieć TOP SET — o tym decyduje trener, nie coeff.
  const topAkcesorium = topWTygodniu(await zBazy(), 2);
  sprawdz("TOP SET działa też przy akcesorium",
    topAkcesorium?.cwiczenie?.id === "EX-0016",
    topAkcesorium?.cwiczenie?.nazwa ?? "brak");

  // Pole RPE dotyczy tygodnia, który stoi na ekranie — jak serie i powtórzenia
  // niżej. Puste = liczba z szablonu, i tak ma zostać po wyczyszczeniu.
  const rpeTopSetu = () => s.locator(".topset input[type=number]").first();
  sprawdz("puste pole RPE podpowiada liczbę z szablonu",
    await rpeTopSetu().getAttribute("placeholder") === "7",
    String(await rpeTopSetu().getAttribute("placeholder")));

  await rpeTopSetu().fill("9.5");
  await rpeTopSetu().blur();
  await zapisano();
  const zRecznym = await zBazy();
  sprawdz("RPE TOP SETU zapisuje się przy tym jednym tygodniu",
    zRecznym.zapisany.plan.topSety.find((t: any) => t.dzien === 1)?.rpeTygodni?.["2"] === 9.5,
    JSON.stringify(zRecznym.zapisany.plan.topSety.find((t: any) => t.dzien === 1)?.rpeTygodni));
  sprawdz("i nie rusza pozostałych tygodni",
    rampa(zRecznym) === "— 9.5 7.5 8 8.5 9", rampa(zRecznym));

  await rpeTopSetu().fill("");
  await rpeTopSetu().blur();
  await zapisano();
  sprawdz("wyczyszczenie pola wraca do szablonu",
    topWTygodniu(await zBazy(), 2)?.rpe === 7,
    String(topWTygodniu(await zBazy(), 2)?.rpe));

  await s.locator(".topset button", { hasText: "✕" }).first().click();
  await zapisano();
  sprawdz("TOP SET da się zdjąć", (await topSetDnia1())[0]?.wlaczony === false);
  sprawdz("i pasek znika z ekranu", (await s.locator(".topset").count()) === 0);
  await s.locator("#taby-tygodni button", { hasText: /^T1$/ }).click();
  await s.waitForTimeout(400);

  // ── 13. moduł oddechu ─────────────────────────────────────────────
  await s.fill("#oddech-twot", "22");
  await s.locator("#oddech-twot").blur();
  await s.waitForTimeout(700);
  const oddech = (await zBazy()).moduly.oddech.dawka;
  sprawdz("moduł oddechu liczy dawkę", oddech !== null, oddech?.poziom ?? "brak");

  // ── 13b. kopiowanie parametrów jednego ćwiczenia ──────────────────
  //
  // Kopiowanie obejmowało kiedyś cały plan i robiło sześć identycznych
  // tygodni — czyli kasowało progresję jednym kliknięciem. Teraz dotyczy
  // wskazanego ćwiczenia; ta kontrola pilnuje obu stron naraz: że wskazane
  // się zmieniło i że sąsiad został nietknięty.
  await s.locator('#taby-tygodni button:has-text("T1")').first().click();
  await s.waitForTimeout(400);
  const przedKopia = await zBazy();
  const sasiadPrzed = JSON.stringify(
    przedKopia.zapisany.plan.sloty.find((x: any) => x.positionId === "D1-S02")?.tygodnie);

  await wiersz(0).hover();
  await wiersz(0).locator("td.lp button", { hasText: "»" }).click();
  await s.waitForTimeout(900);

  const poKopii = await zBazy();
  const boj = poKopii.zapisany.plan.sloty.find((x: any) => x.positionId === "D1-S01");
  const szkielet = (p: any) => JSON.stringify(
    { serie: p?.serie, powtorzenia: p?.powtorzenia, rpe: p?.rpe });
  const takiSamWeWszystkich = [2, 3, 4, 5, 6].every((t) =>
    szkielet(boj.tygodnie[String(t)]) === szkielet(boj.tygodnie["1"]));
  sprawdz("kopiowanie roznosi parametry wskazanego ćwiczenia",
    takiSamWeWszystkich, `T1 ${szkielet(boj.tygodnie["1"])} · T6 ${szkielet(boj.tygodnie["6"])}`);

  sprawdz("i nie dotyka pozostałych ćwiczeń",
    JSON.stringify(poKopii.zapisany.plan.sloty
      .find((x: any) => x.positionId === "D1-S02")?.tygodnie) === sasiadPrzed);

  // ── 13c. akcesorium na pierwszym miejscu dnia ─────────────────────
  //
  // Zgłoszone z używania: „SLDL balance" wstawiony jako pierwszy w dniu
  // dostawał progresję boju (6×6 na RPE 6,5) i TOP SET na jedno powtórzenie.
  // W BAZIE ma coeff 0,25 — to polecenie, którego nie da się wykonać sensownie.
  // Bojem głównym jest ćwiczenie złożone, nie miejsce w tabeli.
  //
  // Na osobnym planie, żeby nie ruszać tego, na którym stoi reszta przeglądu.
  await api("/api/plany", "POST", { klient: "Akcesorium w A1", wersja: 1 });
  const PLAN_AKC = "akcesorium-w-a1-1";
  const wAkc = await (await fetch(`${ADRES}/api/plany/${PLAN_AKC}`)).json();
  wAkc.zapisany.plan.sloty[0].cwiczenieId = "EX-0183";   // SLDL balance, coeff 0,25
  await fetch(`${ADRES}/api/plany/${PLAN_AKC}`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      plan: wAkc.zapisany.plan, dataStartu: null, status: "szkic",
      zmieniony: wAkc.zapisany.zmieniony,
    }),
  });
  const zAkcesorium = await (await fetch(`${ADRES}/api/plany/${PLAN_AKC}`)).json();
  const a1Akc = zAkcesorium.wynik.tygodnie[0].sloty.find((x: any) => x.lp === "A1." && x.cwiczenie);

  sprawdz("akcesorium w A1 liczy się jak akcesorium, nie jak bój główny",
    a1Akc?.serie === 3 && a1Akc?.rpe === 8,
    `${a1Akc?.serie} × ${a1Akc?.powtorzenia} @ RPE ${a1Akc?.rpe}`);

  // TOP SET nie pojawia się tu sam — i o to chodzi. Dodać go wolno przy
  // czymkolwiek (sekcja 12), ale to ma być decyzja trenera, a nie skutek
  // wpisania ćwiczenia w pierwszy wiersz dnia.
  const topAkc = zAkcesorium.wynik.tygodnie[0].topSety.find((t: any) => t.dzien === 1);
  sprawdz("i nie dostaje TOP SETU sam z siebie", !topAkc?.cwiczenie,
    topAkc?.cwiczenie?.nazwa ?? "brak");

  sprawdz("a kontrola planu mówi o tym wprost",
    zAkcesorium.uwagi.some((u: any) => u.kod === "POZYCJA_A_BEZ_BOJU"
      && u.pozycje.some((x: string) => x.includes("SLDL balance"))),
    zAkcesorium.uwagi.find((u: any) => u.kod === "POZYCJA_A_BEZ_BOJU")?.pozycje.join(", ") ?? "brak uwagi");

  /*
   * „SLDL balance" ma w BAZIE progresję „ręczne ustawienie" — i to jest
   * miejsce, w którym aplikacja najbardziej wyglądała na zepsutą.
   *
   * Zgłoszone z używania: trener wpisał serię maksymalną, w kolumnie ciężaru
   * zobaczył napis „ręczne ustawienie" i nie miał ani pola, żeby ten ciężar
   * ustawić, ani zdania, które by tłumaczyło dlaczego. Aplikacja pisała
   * „ustaw ręcznie" i nie dawała gdzie.
   */
  // Wchodzimy tam drogą trenera: lista klientów → kartoteka → plan.
  await s.goto(ADRES, { waitUntil: "networkidle" });
  await s.locator("#lista-klientow .pozycja")
    .filter({ hasText: "Akcesorium w A1" }).getByRole("button", { name: "Otwórz" }).click();
  await s.waitForSelector("#ekran-klient:not(.ukryty)", { timeout: 10000 });
  await s.locator("#lista-cykli").getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-plan:not(.ukryty)", { timeout: 10000 });
  await s.waitForTimeout(600);

  const wierszAkc = s.locator("#dni tr").filter({ hasText: "SLDL balance" }).first();
  const poleRecznegoCiezaru = wierszAkc.locator("td.ciezar input");
  sprawdz("przy „ręcznym ustawieniu” jest gdzie ten ciężar wpisać",
    (await poleRecznegoCiezaru.count()) === 1,
    `pól ciężaru w wierszu: ${await poleRecznegoCiezaru.count()}`);
  sprawdz("i pole mówi, że z 1RM nic tu nie wyjdzie",
    ((await poleRecznegoCiezaru.getAttribute("title")) ?? "").includes("nie liczy ciężaru z 1RM"),
    (await poleRecznegoCiezaru.getAttribute("title")) ?? "brak podpowiedzi");

  await poleRecznegoCiezaru.fill("12.5");
  await poleRecznegoCiezaru.blur();
  await s.waitForTimeout(900);
  const planPoRecznym = await (await fetch(`${ADRES}/api/plany/${PLAN_AKC}`)).json();
  const slotPoRecznym = planPoRecznym.wynik.tygodnie[0].sloty
    .find((x: any) => x.cwiczenie?.nazwa === "SLDL balance");
  sprawdz("wpisany ciężar naprawdę wchodzi do planu",
    slotPoRecznym?.ciezar === 12.5 && slotPoRecznym?.ciezarNadpisany === true,
    `${slotPoRecznym?.ciezar} · nadpisany: ${slotPoRecznym?.ciezarNadpisany}`);

  const wierszSerii = s.locator(".serie-max-wiersz").filter({ hasText: "SLDL balance" }).first();
  sprawdz("panel serii maksymalnych nie prosi o liczby, których nie użyje",
    (await wierszSerii.locator("input").count()) === 0
    && (await wierszSerii.innerText()).includes("nie z 1RM"),
    (await wierszSerii.innerText()).replace(/\n/g, " "));

  // ── 13d. 1RM policzone z serii roboczej klienta ───────────────────
  //
  // Klient zaczął cykl bez serii maksymalnych i dobrał ciężar według RPE;
  // pierwsza seria ustaliła 1RM. W polach konsoli stoi wtedy „1RM × 1" —
  // prawda dla silnika i arkusza, ale bez podpisu wyglądałaby jak seria do
  // odmowy, której nie było. Trener ma widzieć, skąd się wzięła ta liczba.
  const doKalibracji = await (await fetch(`${ADRES}/api/plany/${PLAN_AKC}`)).json();
  doKalibracji.zapisany.plan.sloty[1].cwiczenieId = "EX-0016";   // B1. Barbell row, bez 1RM
  await fetch(`${ADRES}/api/plany/${PLAN_AKC}`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      plan: doKalibracji.zapisany.plan, dataStartu: null, status: "wysłany",
      zmieniony: doKalibracji.zapisany.zmieniony,
    }),
  });
  const { token: tokenAkc } = await api(`/api/plany/${PLAN_AKC}/link`, "POST");
  await api(`/api/klient/${tokenAkc}/odczucie`, "POST",
    { positionId: "D1-S02", tydzien: 1, ciezarWykonany: 60, powtorzeniaWykonane: 8 });

  await s.goto(ADRES, { waitUntil: "networkidle" });
  await s.locator("#lista-klientow .pozycja")
    .filter({ hasText: "Akcesorium w A1" }).getByRole("button", { name: "Otwórz" }).click();
  await s.waitForSelector("#ekran-klient:not(.ukryty)", { timeout: 10000 });
  await s.locator("#lista-cykli").getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-plan:not(.ukryty)", { timeout: 10000 });
  await s.waitForTimeout(600);
  const wierszKalibracji = s.locator(".serie-max-wiersz").filter({ hasText: "Barbell row" }).first();
  const podpisKalibracji = await wierszKalibracji.locator(".kalibracja-zrodlo").innerText()
    .catch(() => "brak podpisu");
  sprawdz("trener widzi, że 1RM przyszło z serii roboczej klienta",
    podpisKalibracji.includes("z serii roboczej klienta") && podpisKalibracji.includes("60 kg × 8"),
    podpisKalibracji);

  // Wszystkie serie klienta pod ciężarem z planu. Do 23.09 trener nie widział
  // w tabeli, co klient podniósł, a baza trzymała tylko najcięższą serię.
  // Przykład trenera: plan na 80 kg, klient zrobił 90, potem 85 — samo „90"
  // mówi co innego niż „90 · 85".
  await api(`/api/klient/${tokenAkc}/odczucie`, "POST", {
    positionId: "D1-S02", tydzien: 1,
    serie: [{ ciezar: 60, powtorzenia: 8 }, { ciezar: 65, powtorzenia: 8 },
      { ciezar: 62.5, powtorzenia: 7 }],
  });
  await s.goto(ADRES, { waitUntil: "networkidle" });
  await s.locator("#lista-klientow .pozycja")
    .filter({ hasText: "Akcesorium w A1" }).getByRole("button", { name: "Otwórz" }).click();
  await s.waitForSelector("#ekran-klient:not(.ukryty)", { timeout: 10000 });
  await s.locator("#lista-cykli").getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-plan:not(.ukryty)", { timeout: 10000 });
  await s.waitForTimeout(600);
  // Po wybranym ćwiczeniu, nie po tekście: każdy wiersz ma listę rozwijaną
  // ze wszystkimi nazwami z BAZY, więc „wiersz z Barbell row" pasuje do każdego.
  const zrobione = await s.locator("#dni tr")
    .filter({ has: s.locator('select option[value="EX-0016"]:checked') }).first()
    .locator(".zrobione").innerText().catch(() => "brak linijki");
  sprawdz("trener widzi w tabeli wszystkie serie klienta, nie tylko najcięższą",
    zrobione.includes("60×8 · 65×8 · 62,5×7"), zrobione);

  // Wracamy na plan, na którym stoi reszta przeglądu — tą samą drogą, którą
  // trener wraca naprawdę. Bez tego kolejne sekcje klikałyby po ekranie planu,
  // który za chwilę kasujemy.
  await s.goto(ADRES, { waitUntil: "networkidle" });
  await s.locator("#lista-klientow .pozycja")
    .filter({ hasText: KLIENT }).getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-klient:not(.ukryty)", { timeout: 10000 });
  await s.locator("#lista-cykli").getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-plan:not(.ukryty)", { timeout: 10000 });
  await s.waitForTimeout(600);

  // Sprzątamy po sobie: dalsze sekcje liczą kartoteki na liście.
  await fetch(`${ADRES}/api/plany/${PLAN_AKC}`, { method: "DELETE" });
  const doUsuniecia = (await (await fetch(`${ADRES}/api/klienci`)).json())
    .find((k: any) => k.nazwa === "Akcesorium w A1");
  if (doUsuniecia) {
    await fetch(`${ADRES}/api/klienci/${doUsuniecia.id}`, { method: "DELETE" });
  }

  // ── 14. link dla klienta ──────────────────────────────────────────
  await s.click("#link-klienta");
  await s.waitForSelector("#modal:not(.ukryty)");
  const trescLinku = await s.locator("#modal-body").innerText();
  const link = trescLinku.match(/\/k\/\S+/)?.[0] ?? "";
  sprawdz("link dla klienta pokazuje adres", /^\/k\/[\w-]{16,}$/.test(link), link || "brak");

  // Sam `localhost` na telefonie klienta znaczy jego telefon — z takiego linku
  // nie da się skorzystać i nic tego nie tłumaczyło. Okno ma podać adres,
  // który da się wysłać: z numerami zamiast „localhost".
  const doWyslania = trescLinku
    .match(/http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/k\/\S+/g)
    ?.find((a) => !a.startsWith("http://127.")) ?? "";
  sprawdz("okno podaje adres, który da się wysłać na telefon",
    doWyslania !== "", doWyslania || "tylko localhost");
  await s.click("#modal-zamknij");

  // ── 15. eksport arkusza ───────────────────────────────────────────
  // Arkusz nie leci przez przeglądarkę — konsola zapisuje go na dysku i podaje
  // ścieżkę. Kontrola jest więc dwuczęściowa: co pokazała i czy plik jest.
  await s.click("#eksportuj");
  await s.waitForSelector("#modal:not(.ukryty)", { timeout: 30000 });
  const sciezka = (await s.locator("#modal-body code").innerText()).trim();
  sprawdz("eksport zapisuje arkusz na dysku",
    sciezka.endsWith(".xlsx") && existsSync(sciezka), sciezka);
  await s.click("#modal-zamknij");

  // ── 16. wysyłka planu ─────────────────────────────────────────────
  await s.selectOption("#status-wybor", "wysłany");
  await s.waitForTimeout(800);
  // Po wysłaniu konsola sama pokazuje link dla klienta — zamykamy, żeby nie
  // zasłaniał reszty ekranu.
  await s.locator("#modal-zamknij").click({ timeout: 3000 }).catch(() => {});
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
  // Podmiana z kroku 8 dotyczy tygodni od T3 — samo ćwiczenie slotu zostaje
  // tym, które klient przerobił, i takie wychodzi do arkusza.
  sprawdz("arkusz wraca z tymi samymi ćwiczeniami",
    wczytany.zapisany?.plan.sloty.slice(0, 2).map((x: any) => x.cwiczenieId).join(",")
      === "EX-0016,EX-0010",
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

  // ── 19b. przeciwwskazania oddechowe ───────────────────────────────
  //
  // „Któreś z przeciwwskazań" to twarde zatrzymanie modułu: po zaznaczeniu
  // drabina oddechowa przestaje być zadaniem, a staje się poleceniem ustalenia
  // ćwiczenia indywidualnie. Przez pierwsze wersje pole stało samo, bez listy —
  // trener musiał z pamięci wiedzieć, co się liczy. Lista ma iść z silnika,
  // bo przepisana do szablonu strony rozjechałaby się z tą, według której
  // moduł faktycznie się zatrzymuje.
  //
  // Sekcja pracuje na **własnym kliencie**. Pierwsza wersja otwierała klienta
  // z wcześniejszych kroków i sprawdzała plan po stałym identyfikatorze —
  // a po scaleniu kartotek ten klient ma trzy cykle i na ekranie stał inny
  // plan niż ten, o który pytałem przez API. Kontrola odpowiadała wtedy
  // na pytanie o cudzy rekord.
  const KLIENT_ODDECHU = "Oddech Test";
  const PLAN_ODDECHU = "oddech-test-1";
  await api("/api/plany", "POST", { klient: KLIENT_ODDECHU, wersja: 1 });

  await s.click("#wroc-do-klientow").catch(() => {});
  await s.waitForSelector("#ekran-lista:not(.ukryty)");
  await s.reload({ waitUntil: "networkidle" });
  await s.locator("#lista-klientow .pozycja", { hasText: KLIENT_ODDECHU })
    .getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-klient:not(.ukryty)");
  await s.locator("#lista-cykli").getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-plan:not(.ukryty)");
  await s.waitForTimeout(400);

  const ileWSilniku = (await api(`/api/plany/${PLAN_ODDECHU}`))
    .moduly.oddech.przeciwwskazaniaLista.length;
  const pozycje = await s.locator("#oddech-lista li").count();
  sprawdz("lista przeciwwskazań jest w konsoli, nie tylko w kodzie",
    pozycje === ileWSilniku && pozycje > 0, `${pozycje} z ${ileWSilniku}`);

  // `innerText` czyta to, co widać — a zwinięte `<details>` nie pokazuje nic.
  // Rozwinięcie jest częścią sprawdzenia: lista ma być do wywołania jednym
  // kliknięciem, a nie schowana na zawsze.
  await s.locator(".przeciwwskazania summary").click();
  const tresc = (await s.locator("#oddech-lista").innerText()).toLocaleLowerCase("pl");
  sprawdz("wymienia to, czego trener nie zgadnie z głowy",
    tresc.includes("padaczka") && tresc.includes("ciąża"),
    tresc.split("\n").slice(0, 2).join(" · "));

  // Zaznaczenie ma zatrzymać moduł, a nie tylko podkolorować pole.
  await s.fill("#oddech-twot", "28");
  await s.locator("#oddech-twot").blur();
  await s.waitForTimeout(700);
  sprawdz("wpisany wynik testu zapisuje się",
    (await api(`/api/plany/${PLAN_ODDECHU}`)).moduly.oddech.wejscie.twot === 28,
    String((await api(`/api/plany/${PLAN_ODDECHU}`)).moduly.oddech.wejscie.twot));

  await s.check("#oddech-przeciwwskazania");
  await s.waitForTimeout(900);
  const wynik = (await s.locator("#oddech-wynik").innerText()).toLocaleLowerCase("pl");
  sprawdz("zaznaczone przeciwwskazanie zatrzymuje drabinę oddechową",
    wynik.includes("indywidualnie") || wynik.includes("nie realizuj"),
    wynik.replace(/\s+/g, " ").slice(0, 60));

  // ── 19c. wysłanie planu, który nie jest gotowy ────────────────────
  //
  // Kontrola planu **nie blokuje** wysyłki — to jest decyzja trenera i tak ma
  // zostać. Ale musi paść wprost, bo klient zobaczy plan dokładnie takim,
  // jaki jest: bez serii maksymalnej nie ma z czego policzyć ciężaru i na
  // telefonie stanie „— brak 1RM" zamiast liczby.
  //
  // Ostrzeżenie żyło dotąd wyłącznie w przeglądarce i nie sprawdzało go nic.
  // Gdyby cicho przestało działać, trener wysyłałby niedokończone plany,
  // nie wiedząc o tym.
  const KLIENT_NIEGOTOWY = "Niegotowy Plan";
  const PLAN_NIEGOTOWY = "niegotowy-plan-1";
  {
    const { zapisany } = await api("/api/plany", "POST",
      { klient: KLIENT_NIEGOTOWY, wersja: 1 });
    const plan = zapisany.plan;
    plan.sloty[0].cwiczenieId = "EX-0010";
    plan.serieMaksymalne = [];   // trener zapomniał serii maksymalnej
    await api(`/api/plany/${PLAN_NIEGOTOWY}`, "PUT",
      { plan, dataStartu: null, status: "szkic" });
  }

  // Poprzednia sekcja zostawiła nas na ekranie planu — wracamy przeładowaniem.
  await s.reload({ waitUntil: "networkidle" });
  await s.waitForSelector("#ekran-lista:not(.ukryty)");
  await s.locator("#lista-klientow .pozycja", { hasText: KLIENT_NIEGOTOWY })
    .getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-klient:not(.ukryty)");
  await s.locator("#lista-cykli").getByRole("button", { name: "Otwórz" }).first().click();
  await s.waitForSelector("#ekran-plan:not(.ukryty)");
  await s.waitForTimeout(400);

  const pytanDo = pytania.length;
  odrzucaj = true;
  await s.selectOption("#status-wybor", "wysłany");
  await s.waitForTimeout(700);
  odrzucaj = false;

  const ostrzezenie = pytania.slice(pytanDo).join(" ");
  sprawdz("przed wysłaniem niedokończonego planu pada pytanie",
    ostrzezenie.toLocaleLowerCase("pl").includes("serii maksymalnej"),
    ostrzezenie.replace(/\s+/g, " ").slice(0, 70) || "nie zapytało wcale");

  // Połowa wartości ostrzeżenia to możliwość powiedzenia „nie".
  sprawdz("odmowa naprawdę zatrzymuje wysyłkę",
    (await api(`/api/plany/${PLAN_NIEGOTOWY}`)).zapisany.status === "szkic",
    (await api(`/api/plany/${PLAN_NIEGOTOWY}`)).zapisany.status);

  await s.selectOption("#status-wybor", "wysłany");
  await s.waitForTimeout(800);
  sprawdz("zgoda wysyła — kontrola ostrzega, nie zabrania",
    (await api(`/api/plany/${PLAN_NIEGOTOWY}`)).zapisany.status === "wysłany",
    (await api(`/api/plany/${PLAN_NIEGOTOWY}`)).zapisany.status);

  // ── 19b. laptop wygląda tak samo jak iPad ─────────────────────────
  //
  // Przyciski przy ćwiczeniu pokazywały się na laptopie dopiero po najechaniu,
  // a na iPadzie były zawsze — to samo miejsce na dwóch urządzeniach wyglądało
  // inaczej. Myszka odsunięta od tabeli: przyciski mają być i tak widoczne.
  await s.mouse.move(5, 5);
  const kryciePrzyciskow = await s.evaluate(() => {
    const e = document.querySelector("table.sloty .strzalki");
    return e ? Number(getComputedStyle(e).opacity) : null;
  });
  sprawdz("na laptopie przyciski przy ćwiczeniu widać bez najeżdżania",
    kryciePrzyciskow === 1, `opacity ${kryciePrzyciskow}`);
  sprawdz("na laptopie legenda znaków w tabeli jest widoczna",
    (await s.locator("#dni .legenda").innerText().catch(() => "")).includes("TOP SET"));

  // ── 19c. deload i tydzień maksów po cyklu ─────────────────────────
  //
  // Decyzje trenera z 25.09.2026: deload „jak T6, RPE o 1 niżej, bez TOP
  // SETU", maksy 1 × 1 @ RPE 10 wszystkie jednego dnia, najpierw deload.
  // Plan na ekranie ma w T1 przysiad — bój z listy do maksowania.
  const planZBazy = async () => (await api(`/api/plany/${PLAN_NIEGOTOWY}`)).zapisany.plan;
  const taby = async () => (await s.locator("#taby-tygodni button").allInnerTexts()).join(" ");
  // Wysłanie planu otwiera okno z linkiem dla klienta — zamykamy je.
  await s.locator("#modal-zamknij").click({ timeout: 3000 }).catch(() => {});
  await s.click("#przelacz-deload");
  await s.waitForTimeout(1200);
  sprawdz("„+ deload” dokłada zakładkę T7 i od razu ją pokazuje",
    (await taby()).includes("T7 deload")
    && (await s.locator("#taby-tygodni button.aktywny").innerText()) === "T7 deload"
    && (await planZBazy()).deload === true,
    await taby());
  sprawdz("w deloadzie stoi, skąd biorą się liczby",
    (await s.locator("#dni .opis-po-cyklu").innerText().catch(() => "")).includes("RPE o 1 niżej"));
  const przyciskiDeloadu = await s.locator("table.sloty .strzalki button").allInnerTexts();
  sprawdz("w deloadzie nie ma », T ani R — kopiowałyby deload na tygodnie pracy",
    przyciskiDeloadu.length > 0 && przyciskiDeloadu.every((t) => !["»", "T", "R"].includes(t)),
    przyciskiDeloadu.join(" "));

  await s.click("#przelacz-maksy");
  await s.waitForTimeout(1200);
  const wierszeMaksow = s.locator("table.sloty.maksy tbody tr");
  sprawdz("„+ maksy” dokłada T8 z przysiadem zaznaczonym domyślnie",
    (await taby()).includes("T8 maksy")
    && (await wierszeMaksow.filter({ hasText: "Barbell back squat" })
      .locator("input[type=checkbox]").isChecked()),
    `${await taby()} · ${(await wierszeMaksow.allInnerTexts()).join(" | ")}`);
  await wierszeMaksow.filter({ hasText: "Barbell back squat" }).locator("input[type=checkbox]").uncheck();
  await s.waitForTimeout(1200);
  sprawdz("odznaczenie zapisuje wybór, a pusty tydzień maksów dostaje ostrzeżenie",
    JSON.stringify((await planZBazy()).cwiczeniaMaksow) === "[]"
    && (await s.locator("#uwagi").innerText()).includes("Tydzień maksów nie ma ćwiczeń"),
    JSON.stringify((await planZBazy()).cwiczeniaMaksow));
  await wierszeMaksow.filter({ hasText: "Barbell back squat" }).locator("input[type=checkbox]").check();
  await s.waitForTimeout(1200);
  sprawdz("ponowne zaznaczenie wraca do przysiadu",
    JSON.stringify((await planZBazy()).cwiczeniaMaksow) === JSON.stringify(["EX-0010"]));
  const obciazenie = await s.locator("#obciazenie").innerText();
  sprawdz("obciążenie pokazuje tygodnie po cyklu bez oceny normą",
    obciazenie.includes("T7 deload") && obciazenie.includes("T8 maksy"),
    obciazenie.replace(/\n/g, " ").slice(-80));

  await s.click("#przelacz-deload");
  await s.waitForTimeout(1200);
  sprawdz("bez deloadu maksy są tygodniem siódmym",
    (await taby()).includes("T7 maksy") && !(await taby()).includes("deload"),
    await taby());

  // Pod datą startu stoi koniec cyklu — liczony z liczby tygodni, bo z maksami
  // cykl ma siedem tygodni. Poniedziałek 28.09 + 7 tygodni = niedziela 15.11.
  await s.locator("#data-startu").fill("2026-09-28");
  await s.locator("#data-startu").dispatchEvent("change");
  await s.waitForTimeout(900);
  // Trzecia część planu: hipertrofia (25.09.2026). Bój główny 4 × 12 bez
  // TOP SETU — przełącznik na ekranie ma to naprawdę zmienić w planie.
  await s.selectOption("#czesc-planu", "hipertrofia");
  await s.waitForTimeout(1200);
  const poHipertrofii = await api(`/api/plany/${PLAN_NIEGOTOWY}`);
  const bojT1 = poHipertrofii.wynik.tygodnie[0].sloty[0];
  sprawdz("„hipertrofia” w części planu daje bój 4 × 12 na RPE 8",
    poHipertrofii.zapisany.plan.czescPlanu === "hipertrofia"
    && bojT1.serie === 4 && bojT1.powtorzenia === 12 && bojT1.rpe === 8,
    `${poHipertrofii.zapisany.plan.czescPlanu} · ${bojT1.serie}×${bojT1.powtorzenia} @${bojT1.rpe}`);
  await s.selectOption("#czesc-planu", "objętość");
  await s.waitForTimeout(900);

  sprawdz("pod datą startu stoi koniec cyklu z tygodniami po cyklu",
    (await s.locator("#koniec-cyklu").innerText()) === "koniec: nd 15.11 · 7 tyg. · T4 od pn 19.10",
    await s.locator("#koniec-cyklu").innerText());

  // Szablon z Base44 (25.09.2026): „FBW 3 dni" z doborem ćwiczeń z planu
  // trenera. Plan ma już przysiad, więc konsola pyta — i to pytanie przyjmujemy.
  const pytanPrzedSzablonem = pytania.length;
  await s.selectOption("#szablon-planu", "fbw_3dni_6w");
  await s.waitForTimeout(1200);
  const poSzablonie = await api(`/api/plany/${PLAN_NIEGOTOWY}`);
  const dzien1 = poSzablonie.zapisany.plan.sloty.filter((x: any) => x.dzien === 1);
  sprawdz("szablon „FBW 3 dni” rozpisuje plan i pyta, zanim nadpisze dobór",
    pytania.length === pytanPrzedSzablonem + 1
    && dzien1[0].cwiczenieId === "EX-0011" && dzien1[4].kategoriaSzkieletu === "Tricep"
    && !dzien1[4].cwiczenieId
    && (await s.locator("#szablon-info").innerText()).includes("brak w BAZIE"),
    `${await s.locator("#szablon-info").innerText()}`);
  sprawdz("tabela pokazuje wyciskanie w A1 dnia I od razu",
    await s.locator("table.sloty").first().locator('select option[value="EX-0011"]:checked').count() === 1);

  // ── 20. konsola z telefonu i z iPada ──────────────────────────────
  //
  // Cały przegląd wyżej chodzi w oknie 1500×1000. Konsola ma style na telefon
  // od kilku rund, ale **nikt jej dotąd na telefonie nie oglądał** — a trener
  // zagląda w plan stojąc na siłowni, nie tylko siedząc przy biurku.
  //
  // Znalezione przy pierwszym takim spojrzeniu: strzałki przestawiania
  // ćwiczeń mają `opacity: 0` do czasu najechania myszą. Na telefonie
  // najechania nie ma, więc były niewidoczne **zawsze** — a `opacity: 0`
  // nie odbiera kliknięć, więc w każdym wierszu siedziały dwa niewidzialne
  // przyciski 14×11 px, gotowe przestawić plan przy nietrafionym dotknięciu.
  for (const [gdzie, urzadzenie] of [
    ["na telefonie", TELEFON], ["na iPadzie w pionie", IPAD_PION], ["na iPadzie w poziomie", IPAD_POZIOM],
  ] as const) {
    await sekcjaDotykowa(przegladarka, ADRES, PLAN, KLIENT_PO_ZMIANIE, gdzie, urzadzenie);
  }

  console.log(bledyPrzegladarki.length
    ? `\n  błędy w przeglądarce: ${JSON.stringify(bledyPrzegladarki.slice(0, 3))}`
    : "\n  błędów w przeglądarce: brak");
  doliczBledy(bledyPrzegladarki.length);
}


async function sekcjaDotykowa(
  przegladarka: any, adres: string, plan: string, klient: string,
  gdzie: string, urzadzenie: object,
): Promise<void> {
  const kontekst = await przegladarka.newContext(urzadzenie);
  const s = await kontekst.newPage();
  const bledy = pilnujBledow(s);
  try {
    await s.goto(`${adres}/?plan=${plan}`, { waitUntil: "networkidle" });
    await s.waitForSelector("#lista-klientow .pozycja", { timeout: 10000 });
    // Po nazwisku, nie „pierwszy z listy": kolejność jest alfabetyczna, więc
    // dołożenie klienta w innej sekcji podkładało tu plan bez ćwiczeń.
    await s.locator("#lista-klientow .pozycja", { hasText: klient })
      .getByRole("button", { name: "Otwórz" }).first().click();
    await s.waitForSelector("#ekran-klient:not(.ukryty)", { timeout: 10000 });
    // „2+1/12" miało objaśnienie tylko w dymku po najechaniu myszą.
    const sygnaly = await s.locator("#lista-cykli .sygnal").allInnerTexts();
    sprawdz(`${gdzie} aktywność klienta jest opisana słowami`,
      sygnaly.some((t) => /treningi: \d+ z \d+/.test(t))
      && sygnaly.every((t) => !/\d\+\d|\d\/\d/.test(t)),
      sygnaly.join(" | ") || "bez sygnałów");
    await s.locator("#lista-cykli").getByRole("button", { name: "Otwórz" }).first().click();
    await s.waitForSelector("#ekran-plan:not(.ukryty)", { timeout: 10000 });
    await s.waitForTimeout(600);

    sprawdz(`${gdzie} legenda znaków w tabeli jest widoczna`,
      (await s.locator("#dni .legenda").innerText().catch(() => "")).includes("TOP SET"),
      "legenda");

    // Nic nie może wystawać poza ekran. Sprawdzamy elementy, a nie szerokość
    // strony: `overflow-x: hidden` na `body` obcina to, co wystaje, więc sama
    // strona zawsze wygląda na dopasowaną — także wtedy, gdy nie jest.
    const wystajace = await s.evaluate(() => [...document.querySelectorAll("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > document.documentElement.clientWidth + 1;
      })
      .map((e) => `${e.tagName.toLowerCase()}.${(e.className || "").toString().split(" ")[0]}`)
      .slice(0, 4));
    sprawdz(`${gdzie} nic nie wystaje poza ekran`, wystajace.length === 0,
      wystajace.join(", ") || "czysto");

    // Ta jedna liczba jest powodem, dla którego trener otwiera plan z ręki.
    sprawdz(`${gdzie} kolumna z ciężarem jest widoczna`,
      await s.locator("table.sloty td.ciezar").first().isVisible());

    const strzalki = await s.evaluate(() => {
      const e = document.querySelector("table.sloty .strzalki");
      if (!e) return null;
      const st = getComputedStyle(e);
      return { krycie: Number(st.opacity), klikalne: st.pointerEvents !== "none" };
    });
    sprawdz(`${gdzie} strzałki przestawiania są widoczne`,
      strzalki !== null && strzalki.krycie > 0.9,
      strzalki ? `opacity ${strzalki.krycie}` : "nie ma ich wcale");

    // Druga strona tej samej sprawy: przycisk niewidoczny nie może być
    // klikalny. `opacity: 0` sam z siebie kliknięć nie odbiera.
    //
    // Pierwsza wersja tej kontroli pytała o `opacity` **samego przycisku** —
    // a przezroczystość siedzi na jego rodzicu, więc przy przywróconym błędzie
    // kontrola dalej świeciła na zielono. Krycie trzeba policzyć przez
    // wszystkich przodków, a zamiast zgadywać, czy da się kliknąć, zapytać
    // przeglądarkę wprost: co leży pod tym punktem.
    const ukrytaKlikalna = await s.evaluate(() => {
      const krycie = (e: Element): number => {
        let w = 1;
        for (let p: Element | null = e; p; p = p.parentElement) {
          w *= Number(getComputedStyle(p).opacity);
        }
        return w;
      };
      return [...document.querySelectorAll("button, a")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          if (r.width === 0 || krycie(e) > 0.05) return false;
          const pod = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return pod === e || e.contains(pod);
        })
        .map((e) => `${e.tagName.toLowerCase()}.${(e.className || "").toString().split(" ")[0]}`);
    });
    sprawdz(`${gdzie} nie ma przycisków niewidocznych, a klikalnych`, ukrytaKlikalna.length === 0,
      ukrytaKlikalna.join(", ") || "czysto");

    const male = await s.evaluate((prog: number) =>
      [...document.querySelectorAll("button, select, input, a")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && Math.min(r.width, r.height) < prog;
        })
        .map((e) => {
          const r = e.getBoundingClientRect();
          return `${e.tagName.toLowerCase()}.${(e.className || "").toString().split(" ")[0]}`
            + ` ${Math.round(r.width)}×${Math.round(r.height)}`;
        })
        .slice(0, 5), MINIMALNY_CEL);
    // Zalecane 44 px to rozmiar, którego ciasna tabela planu nie udźwignie —
    // trzymamy próg, poniżej którego celowanie przestaje być celowaniem.
    sprawdz(`${gdzie} żaden cel nie jest mniejszy niż ${MINIMALNY_CEL} px`, male.length === 0,
      male.join(", ") || "czysto");

    // Strzałka ma nie tylko wyglądać na klikalną, ale działać — i to z palca.
    //
    // `locator.click()` Playwrighta trafia także w przycisk przezroczysty,
    // bo sprawdza `visibility`, a nie `opacity`. Przy przywróconym błędzie
    // ta kontrola przechodziła — czyli odpowiadała na pytanie „czy serwer
    // przyjmie żądanie", a nie „czy człowiek to zrobi". Dlatego najpierw
    // pytamy przeglądarkę, co leży pod środkiem strzałki, a potem dotykamy
    // ekranu w tym punkcie, zamiast wołać przycisk po nazwie.
    const cel = await s.evaluate(() => {
      const b = document.querySelectorAll("table.sloty tr")[1]
        ?.querySelectorAll("button.mikro")[1];
      if (!b) return null;
      // Tabela stoi pod ustawieniami i legendą, czyli poniżej pierwszego
      // ekranu — człowiek najpierw przewija. Bez tego `elementFromPoint`
      // pytał o punkt poza ekranem i dostawał pustkę.
      b.scrollIntoView({ block: "center" });
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      let krycie = 1;
      for (let p: Element | null = b; p; p = p.parentElement) {
        krycie *= Number(getComputedStyle(p).opacity);
      }
      return { x, y, krycie, trafia: document.elementFromPoint(x, y) === b };
    });
    sprawdz(`${gdzie} w strzałkę da się trafić palcem, widząc ją`,
      cel !== null && cel.trafia && cel.krycie > 0.9,
      cel ? `krycie ${cel.krycie}, pod palcem ${cel.trafia ? "strzałka" : "co innego"}`
        : "nie ma strzałek");

    const przed = await s.locator("table.sloty td.cwiczenie select").first().inputValue();
    if (cel) await s.touchscreen.tap(cel.x, cel.y);
    await s.waitForTimeout(900);
    const po = await s.locator("table.sloty td.cwiczenie select").first().inputValue();
    sprawdz(`${gdzie} dotknięcie strzałki przestawia ćwiczenie`, przed !== po,
      `${przed || "—"} → ${po || "—"}`);

    // „0 z 2 + 1 zaczęty" łamało się na iPadzie na trzy linijki w wąskiej
    // kolumnie, a „+" czytał się jak dodawanie. Otwieramy cykl, w którym
    // klient ocenił ćwiczenie bez „Zakończ trening" — zaczęty tydzień jest
    // tam na pewno.
    await s.goto(`${adres}/?plan=${plan}`, { waitUntil: "networkidle" });
    await s.waitForSelector("#lista-klientow .pozycja", { timeout: 10000 });
    await s.locator("#lista-klientow .pozycja", { hasText: klient })
      .getByRole("button", { name: "Otwórz" }).first().click();
    await s.waitForSelector("#ekran-klient:not(.ukryty)", { timeout: 10000 });
    await s.locator("#lista-cykli .pozycja", { hasText: "zaczęty" })
      .getByRole("button", { name: "Otwórz" }).first().click();
    await s.waitForSelector("#ekran-plan:not(.ukryty)", { timeout: 10000 });
    await s.waitForTimeout(600);
    const realizacja = await s.evaluate(() => [...document.querySelectorAll(
      "#realizacja .wiersz-miary .wartosc")].map((e) => ({
      tekst: (e as HTMLElement).innerText,
      linie: Math.round(e.getBoundingClientRect().height
        / parseFloat(getComputedStyle(e).lineHeight || "16")),
    })));
    const zaczety = realizacja.find((x) => x.tekst.includes("zaczęt"));
    sprawdz(`${gdzie} realizacja: zaczęty tydzień w jednej linii, bez „+”`,
      !!zaczety && zaczety.linie <= 1 && !zaczety.tekst.includes("+"),
      zaczety ? `„${zaczety.tekst.replace(/\n/g, "⏎")}" · ${zaczety.linie} linii`
        : "brak zaczętego tygodnia");
  } finally {
    console.log(bledy.length
      ? `  błędy ${gdzie}: ${JSON.stringify(bledy.slice(0, 2))}`
      : `  błędów ${gdzie}: brak`);
    doliczBledy(bledy.length);
    await kontekst.close();
  }
}
