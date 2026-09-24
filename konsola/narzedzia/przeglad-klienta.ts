#!/usr/bin/env node
/**
 * Przegląd aplikacji klienta — klikanie po telefonie, po kolei.
 *
 *   npm run przeglad-klienta
 *
 * To jedyny ekran w całym projekcie, którego **nie ogląda trener**. Klient
 * otwiera link na siłowni, między seriami, często bez zasięgu — i albo działa,
 * albo nie ma komu tego zgłosić. Przegląd konsoli wykrył cztery błędy
 * niewidoczne w testach; ta powierzchnia zasługuje na to samo traktowanie.
 *
 * Idzie pętlą, dla której cała aplikacja powstała: klient dostaje policzony
 * ciężar → ocenia serię → **ocena zmienia ciężar w kolejnym tygodniu**.
 * Ostatni krok jest tu najważniejszy: to jest ta jedna rzecz, której arkusz
 * nie umiał, i jedyna, przez którą warto było to przepisywać.
 *
 * Wymaga Playwrighta z Chromium. Nie chodzi w `npm test`, bo tam przeglądarki
 * nie ma — to kontrola do puszczenia po zmianach w `public/klient/`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { czekajNa, doliczBledy, pilnujBledow, podsumuj, sprawdz, zKonsola, type Srodowisko }
  from "./przegladarka.ts";

const PORT = 4192;
const KLIENT = "Klient telefon";
const PLAN = "klient-telefon-1";
/** iPhone 13 — realny ekran, na którym to naprawdę bywa otwierane. */
const TELEFON = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

/**
 * Plan gotowy do wysłania: bój główny, akcesorium, serie maksymalne dla obu
 * i progresja z szablonu. Sianie idzie przez API konsoli, a nie przez klikanie —
 * układanie planu sprawdza `przeglad-ekranow.ts`, tu chodzi o telefon.
 */
async function zasiej({ api }: Srodowisko): Promise<string> {
  await api("/api/plany", "POST", { klient: KLIENT, wersja: 1 });

  const { zapisany } = await api(`/api/plany/${PLAN}`);
  const plan = zapisany.plan;
  plan.sloty[0].cwiczenieId = "EX-0010";   // A1. bój główny
  plan.sloty[1].cwiczenieId = "EX-0016";   // B1. akcesorium
  // Ćwiczenie na masie ciała — nie ma przy nim czego mierzyć. W planie musi
  // być, żeby ekran pomiarów miał co pokazać w sekcji 9b.
  plan.sloty[2].cwiczenieId = "EX-0050";   // B2. Dead bug straight legs
  plan.serieMaksymalne = [
    { cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 3 },
    { cwiczenieId: "EX-0016", ciezar: 70, powtorzenia: 5 },
  ];
  await api(`/api/plany/${PLAN}`, "PUT", { plan, dataStartu: null, status: "szkic" });
  await api(`/api/plany/${PLAN}/tygodnie`, "POST", { tryb: "progresja", zrodlo: 1 });

  const zProgresja = (await api(`/api/plany/${PLAN}`)).zapisany.plan;
  await api(`/api/plany/${PLAN}`, "PUT",
    { plan: zProgresja, dataStartu: null, status: "wysłany" });

  return (await api(`/api/plany/${PLAN}/link`, "POST")).sciezka;
}

await zKonsola(PORT, async (przegladarka, srodowisko) => {
  const sciezka = await zasiej(srodowisko);
  const { adres, api } = srodowisko;
  const kontekst = await przegladarka.newContext(TELEFON);
  const s = await kontekst.newPage();
  const bledy = pilnujBledow(s);

  /** Widok prosto z serwera — sprawdzamy skutek dotknięcia, nie sam ekran. */
  const token = sciezka.replace("/k/", "");
  const widok = async () => await api(`/api/klient/${token}`);
  const cwiczenie = (w: any, tydzien: number, i = 0) =>
    w.tygodnie[tydzien - 1].dni[0].cwiczenia[i];

  await s.goto(`${adres}${sciezka}`, { waitUntil: "networkidle" });

  // ── 1. wejście z linku ────────────────────────────────────────────
  sprawdz("link otwiera plan klienta",
    (await s.locator("#tytul").innerText()).includes(KLIENT),
    await s.locator("#tytul").innerText());

  // Podpowiedź o dodaniu do ekranu głównego ma milczeć, dopóki aplikacja się
  // do czegoś nie przyda. Sprawdzamy to tutaj, zanim klient cokolwiek zrobi.
  sprawdz("przed pierwszym treningiem podpowiedź o instalacji milczy",
    !(await s.locator("#baner-instalacji").isVisible()));

  const przedStart = await widok();
  sprawdz("tygodnie są do wyboru",
    await s.locator("#tygodnie .tydzien").count() === 6,
    `${await s.locator("#tygodnie .tydzien").count()} tygodni`);

  // ── 2. otwarcie treningu ──────────────────────────────────────────
  await s.locator("#tygodnie .dzien-kafel").first().click();
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  const karty = s.locator("#cwiczenia .cwiczenie");
  sprawdz("trening pokazuje ćwiczenia z planu", await karty.count() === 3,
    `${await karty.count()} ćwiczenia`);

  // ── 3. ciężar na ekranie to ciężar policzony ──────────────────────
  // Umowa całej aplikacji: klient widzi dokładnie tę liczbę, którą policzył
  // silnik. Rozjazd tutaj znaczy, że ktoś trenuje wg innych liczb niż trener.
  // Aplikacja pisze liczby po polsku, z przecinkiem — porównujemy wartości,
  // nie zapis.
  const naEkranie = await karty.first().locator(".kolumna-ciezar .wartosc").innerText();
  sprawdz("ciężar na telefonie zgadza się z policzonym",
    Number(naEkranie.replace(",", ".").replace(/[^\d.]/g, "")) === cwiczenie(przedStart, 1).ciezar,
    `${naEkranie} ↔ ${cwiczenie(przedStart, 1).ciezar} kg`);

  // Powtórzenia tą samą wielkością co ciężar — zgłoszone z testów: duży
  // ciężar obok drobnych powtórzeń czytał się jak ciężar z dopiskiem.
  const rozmiar = async (klasa: string) => await karty.first()
    .locator(`${klasa} .wartosc`).evaluate((e) => getComputedStyle(e).fontSize);
  sprawdz("powtórzenia i serie są tak samo czytelne jak ciężar",
    await rozmiar(".kolumna-ciezar") === await rozmiar(".kolumna-powt")
    && await rozmiar(".kolumna-ciezar") === await rozmiar(".kolumna-serie"),
    `ciężar ${await rozmiar(".kolumna-ciezar")} · powt. ${await rozmiar(".kolumna-powt")}`);

  // ── 4. ocena serii ────────────────────────────────────────────────
  await karty.first().getByRole("button", { name: "Za łatwe" }).click();
  await s.waitForTimeout(600);
  sprawdz("ocena zapisuje się", cwiczenie(await widok(), 1).feedback === "za łatwe",
    String(cwiczenie(await widok(), 1).feedback));

  // ── 5. pętla adaptacji ────────────────────────────────────────────
  // Rzecz, dla której to powstało: „za łatwe" ma podnieść ciężar w T2.
  const poOcenie = await widok();
  sprawdz("ocena zmienia ciężar w kolejnym tygodniu",
    cwiczenie(poOcenie, 2).ciezar > cwiczenie(przedStart, 2).ciezar,
    `T2: ${cwiczenie(przedStart, 2).ciezar} → ${cwiczenie(poOcenie, 2).ciezar} kg`);

  // ── 6. co faktycznie poszło ───────────────────────────────────────
  await karty.first().getByRole("button", { name: /zapisz, co poszło/ }).click();
  const pola = karty.first().locator(".wykonanie-pola input");
  await pola.nth(0).fill("95");
  await pola.nth(1).fill("5");
  await pola.nth(1).blur();
  await s.waitForTimeout(600);
  const wykonane = cwiczenie(await widok(), 1);
  sprawdz("wykonanie zapisuje się w komplecie",
    wykonane.ciezarWykonany === 95 && wykonane.powtorzeniaWykonane === 5,
    `${wykonane.ciezarWykonany} kg × ${wykonane.powtorzeniaWykonane}`);

  // ── 7. domknięcie treningu ────────────────────────────────────────
  await s.click("#zakoncz");
  await s.waitForSelector("#ekran-tygodnie:not(.ukryty)");
  const poZakonczeniu = await widok();
  sprawdz("zakończony trening jest zakończony",
    poZakonczeniu.tygodnie[0].dni[0].ukonczony === true);
  sprawdz("nieocenione ćwiczenia dostają OK, nie pustkę",
    cwiczenie(poZakonczeniu, 1, 1).feedback === "OK",
    String(cwiczenie(poZakonczeniu, 1, 1).feedback));

  // ── 8. podpowiedź o dodaniu do ekranu głównego ────────────────────
  // Aplikacja ma ikonę i działa bez zasięgu, ale nikt sam nie odkrywa, że da
  // się ją dodać. Podpowiedź ma się jednak odezwać dopiero wtedy, gdy zdążyła
  // się do czegoś przydać — i tylko raz.
  // (trening domknięty w kroku 7, więc teraz podpowiedź ma prawo się pojawić)
  await s.reload({ waitUntil: "networkidle" });
  await s.waitForTimeout(500);
  sprawdz("po domkniętym treningu podpowiedź się pokazuje",
    await s.locator("#baner-instalacji").isVisible(),
    (await s.locator("#instalacja-tresc").innerText()).slice(0, 60));

  await s.click("#instalacja-nie");
  await s.reload({ waitUntil: "networkidle" });
  await s.waitForTimeout(500);
  sprawdz("„nie teraz” znaczy nigdy więcej",
    !(await s.locator("#baner-instalacji").isVisible()));

  // ── 9. seria maksymalna z telefonu ────────────────────────────────
  await s.click("#pokaz-pomiary");
  await s.waitForSelector("#ekran-pomiary:not(.ukryty)");
  const pomiar = s.locator("#pomiary .pomiar").first().locator("input");
  await pomiar.nth(0).fill("125");
  await pomiar.nth(1).fill("2");
  await pomiar.nth(1).blur();
  await s.waitForTimeout(700);
  const poPomiarze = await widok();
  const zmierzone = poPomiarze.doZmierzenia[0];
  sprawdz("seria maksymalna z telefonu daje nowe 1RM",
    zmierzone.ciezar === 125 && zmierzone.powtorzenia === 2 && zmierzone.oneRM > 127,
    `${zmierzone.ciezar}×${zmierzone.powtorzenia} → 1RM ${zmierzone.oneRM}`);

  // ── 9b. ćwiczenia, przy których nie ma czego mierzyć ──────────────
  //
  // Zgłoszone z używania: trener wpisał przy „Dead bug izo + OH" maksa
  // 10 kg × 15, a w planie zobaczył „masa ciała" i uznał, że aplikacja
  // zgubiła jego liczby. Nic nie zgubiła — tylko nigdzie nie było napisane,
  // że przy tym ćwiczeniu nie ma czego liczyć. Teraz jest, i to w miejscu,
  // w którym człowiek chciałby te liczby wpisać.
  //
  // Od 24.09.2026 sam „Dead bug izo + OH" ma ręczne ustawienie ciężaru
  // (decyzja trenera), więc masę ciała sprawdza tu jego krewniak.
  const kartyPomiarow = s.locator("#pomiary .pomiar");
  const bezSerii = kartyPomiarow.filter({ hasText: "Dead bug straight legs" }).first();
  sprawdz("ćwiczenie na masie ciała zostaje na liście pomiarów",
    await bezSerii.isVisible());
  sprawdz("ale zamiast pól ma napisane dlaczego",
    (await bezSerii.locator("input").count()) === 0
    && (await bezSerii.innerText()).includes("masie ciała"),
    (await bezSerii.innerText()).replace(/\n/g, " "));
  sprawdz("a nad listą stoi, skąd biorą się te piętnaście powtórzeń",
    (await s.locator(".wskazowka-pomiarow").innerText()).includes("15"),
    (await s.locator(".wskazowka-pomiarow").innerText()).slice(0, 80));

  // Za dużo powtórzeń: serwer odmawia, a klient ma zobaczyć DLACZEGO.
  // Wcześniej każda odmowa mówiła „trener zmienił plan" — przy serii na 16
  // powtórzeń była to nieprawda, z której nie dało się niczego wywnioskować.
  //
  // Odmowa to tu wynik, nie usterka, więc 400 w konsoli przeglądarki jest
  // oczekiwane i nie liczy się do błędów.
  const bledyPrzedOdmowa = bledy.length;
  const zMaksem = kartyPomiarow.filter({ hasText: "Barbell row" }).first().locator("input");
  await zMaksem.nth(0).fill("40");
  await zMaksem.nth(1).fill("16");
  await zMaksem.nth(1).blur();
  await s.waitForTimeout(900);
  const pasek = await s.locator("#stan-polaczenia").innerText();
  sprawdz("przy 16 powtórzeniach klient czyta, co zrobić",
    pasek.includes("15") && /dołóż|Dołóż/.test(pasek), pasek);
  bledy.splice(bledyPrzedOdmowa);

  // Pole i tak nie powinno na to pozwolić — granica stoi przy nim, nie tylko
  // na serwerze. To druga linia tej samej obrony, nie jej zamiennik.
  sprawdz("pole powtórzeń samo pilnuje granicy",
    await zMaksem.nth(1).getAttribute("max") === "15");
  await zMaksem.nth(1).fill("5");
  await zMaksem.nth(1).blur();
  await s.waitForTimeout(700);

  // ── 10. ekran postępu ──────────────────────────────────────────────
  await s.click("#wroc-z-pomiarow");
  await s.click("#pokaz-postep");
  await s.waitForSelector("#ekran-postep:not(.ukryty)");
  await s.waitForTimeout(600);
  // `innerText` oddaje tekst po stylach, a nagłówki kart są wersalikami —
  // porównanie wprost szukałoby napisu, którego na ekranie nie ma.
  const tekstPostepu = await s.locator("#postep").innerText();
  sprawdz("ekran postępu pokazuje wykonaną pracę",
    tekstPostepu.toLocaleLowerCase("pl").includes("barbell back squat"),
    tekstPostepu.replace(/\n/g, " · ").slice(0, 160));
  // Jeden tydzień z wpisami — nie ma z czym porównać. Dawniej stało tu
  // „bez zmiany", czyli wniosek, którego z jednego pomiaru nie da się wyciągnąć.
  // Potem „Pierwszy pomiar" — mylące, gdy ćwiczenie było robione wcześniej,
  // tylko bez wpisanych serii. Teraz mówi, co się liczy.
  sprawdz("przy jednym tygodniu nie ma udawanego „bez zmiany”",
    tekstPostepu.includes("wpisy z jednego tygodnia") && !tekstPostepu.includes("bez zmiany"),
    tekstPostepu.split("\n").find((l) => l.includes("tygodnia") || l.includes("zmian")) ?? "—");
  sprawdz("i jedno zdanie, że liczą się tygodnie z wpisanym ciężarem",
    tekstPostepu.includes("sama ocena ich nie ma"));

  // ── 11. waga ──────────────────────────────────────────────────────
  //
  // „Waga" na tym ekranie znaczyła dwie rzeczy naraz: wagę ciała w polu
  // i ciężar na sztandze w zdaniu tuż pod nim. Zdanie o ciężarach stało luzem
  // pod kartą wagi i czytało się jak jej podpis — pierwsze pytanie trenera po
  // otwarciu tego ekranu brzmiało dokładnie „o co tu chodzi z tą wagą".
  const kartaWagi = s.locator("#postep .cwiczenie").filter({ has: s.locator("input") });
  const tekstWagi = (await kartaWagi.innerText()).toLocaleLowerCase("pl");
  // Tytuł „Waga ciała" mówi, że chodzi o ciało. Zdanie pod polem mówi, co
  // wpisać — dawne „Ile ważysz Ty, nie sztanga" trener uznał za dziwne.
  sprawdz("karta wagi mówi, co wpisać",
    tekstWagi.includes("waga ciała") && tekstWagi.includes("dzisiejszą wagę")
    && !tekstWagi.includes("sztanga"),
    tekstWagi.replace(/\n/g, " · ").slice(0, 110));
  sprawdz("zdanie o podnoszonych ciężarach nie stoi w karcie wagi",
    !tekstWagi.includes("podniosłeś"), tekstWagi.replace(/\n/g, " · ").slice(0, 90));

  // Zgłoszone z testów: wpisanej wagi nie dało się zatwierdzić — nie było
  // przycisku, a po zapisie (stuknięciem obok) nic się na ekranie nie zmieniało.
  const poleWagi = kartaWagi.locator("input");
  await poleWagi.fill("81.5");
  await kartaWagi.getByRole("button", { name: "Zapisz" }).click();
  await s.waitForTimeout(600);
  const poZapisie = await kartaWagi.innerText();
  sprawdz("wagę zatwierdza przycisk, a zapisana widać od razu",
    poZapisie.includes("81,5 kg") && poZapisie.includes("✓ Zapisano"),
    poZapisie.replace(/\n/g, " · ").slice(0, 90));
  const waga = (await widok()).postep.waga.punkty;
  sprawdz("waga zapisuje się i widać ją u trenera",
    waga.at(-1)?.kg === 81.5, `${waga.length} pomiar(ów), ostatni ${waga.at(-1)?.kg} kg`);
  await poleWagi.fill("8150");
  await kartaWagi.getByRole("button", { name: "Zapisz" }).click();
  sprawdz("waga spoza świata dostaje zdanie przy polu, a nie cichą odmowę",
    (await kartaWagi.innerText()).includes("Wpisz wagę w kilogramach"),
    (await kartaWagi.innerText()).replace(/\n/g, " · ").slice(0, 90));

  // ── 12. kolejka offline nie blokuje się na odrzuconym zadaniu ─────
  // Scenariusz z życia: klient ocenia trening bez zasięgu, a w tym czasie
  // trener wyjmuje jedno z ćwiczeń z planu. Ocena tego ćwiczenia nie da się
  // już zapisać nigdy — i wcześniej zostawała na czele kolejki, blokując
  // wszystko, co klient ocenił po niej.
  await s.click("#wroc-z-postepu");
  const bledyPrzedOffline = bledy.length;
  await kontekst.setOffline(true);
  await s.locator("#tygodnie .dzien-kafel").first().click();
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  await karty.nth(0).getByRole("button", { name: "Za trudne" }).click();
  await karty.nth(1).getByRole("button", { name: "Za trudne" }).click();
  await s.waitForTimeout(400);
  const wKolejce = await s.evaluate(() =>
    JSON.parse(localStorage.getItem(`kolejka-${location.pathname.split("/").pop()}`) || "[]").length);
  sprawdz("bez zasięgu oceny czekają w kolejce", wKolejce === 2, `${wKolejce} zadania`);

  const { zapisany } = await api(`/api/plany/${PLAN}`);
  zapisany.plan.sloty[0].cwiczenieId = null;
  await api(`/api/plany/${PLAN}`, "PUT",
    { plan: zapisany.plan, dataStartu: zapisany.dataStartu, status: zapisany.status });

  await kontekst.setOffline(false);
  await s.waitForTimeout(2500);
  const poSynchronizacji = await s.evaluate(() =>
    JSON.parse(localStorage.getItem(`kolejka-${location.pathname.split("/").pop()}`) || "[]").length);
  sprawdz("odrzucone zadanie nie blokuje kolejki", poSynchronizacji === 0,
    `${poSynchronizacji} zadań zostało w kolejce`);
  sprawdz("ocena, którą dało się zapisać, doszła do trenera",
    cwiczenie(await widok(), 1, 0).feedback === "za trudne",
    String(cwiczenie(await widok(), 1, 0).feedback));
  // Ten krok celowo rozłącza sieć i celowo wysyła zapis, który serwer musi
  // odrzucić — zgłoszenia przeglądarki z tego okna są spodziewane. Reszta
  // przebiegu dalej ma być czysta.
  bledy.splice(bledyPrzedOffline);

  // ── 13. druga strona pętli: konsola trenera ───────────────────────
  // Ocena z telefonu ma dojść do trenera jako realizacja, nie tylko jako liczba
  // w bazie — inaczej nie ma po czym poznać, że klient w ogóle ćwiczy.
  const uTrenera = await api(`/api/plany/${PLAN}`);
  const realizacja = uTrenera.realizacja ?? uTrenera.zapisany.plan;
  sprawdz("trener widzi ocenę klienta w swoim planie",
    uTrenera.zapisany.plan.sloty[0].tygodnie["1"].feedback === "za łatwe",
    String(uTrenera.zapisany.plan.sloty[0].tygodnie["1"].feedback));
  sprawdz("trener widzi domknięty trening",
    JSON.stringify(realizacja).includes("true"));

  // ── 14. postęp przez dwa cykle ────────────────────────────────────
  // Blok „Przez wszystkie cykle" pokazuje się dopiero od drugiego cyklu, więc
  // jednocyklowe przejście nigdy go nie dotykało. A to jest jedyne miejsce,
  // w którym klient widzi, że przez pół roku coś się w ogóle zmieniło.
  const drugi = await api(`/api/plany/${PLAN}/kopia`, "POST", { wersja: 2 });
  await api(`/api/plany/${drugi.zapisany.id}`, "PUT", {
    plan: drugi.zapisany.plan, dataStartu: null, status: "wysłany",
    zmieniony: drugi.zapisany.zmieniony,
  });
  // Klient podnosi w drugim cyklu więcej niż w pierwszym — trajektoria ma rosnąć.
  await api(`/api/klient/${token}/serie`, "POST",
    { cwiczenieId: "EX-0010", ciezar: 135, powtorzenia: 3 });
  await api(`/api/klient/${token}/odczucie`, "POST",
    { positionId: "D1-S01", tydzien: 1, ciezarWykonany: 115, powtorzeniaWykonane: 5, feedback: "OK" });

  await s.reload({ waitUntil: "networkidle" });
  await s.waitForTimeout(600);
  sprawdz("telefon sam przeszedł na nowy cykl",
    (await s.locator("#tytul").innerText()).includes("2.0"),
    await s.locator("#tytul").innerText());

  await s.click("#pokaz-postep");
  await s.waitForSelector("#ekran-postep:not(.ukryty)");
  await s.waitForTimeout(800);
  const postep = (await s.locator("#postep").innerText()).toLocaleLowerCase("pl");
  sprawdz("ekran postępu pokazuje blok „przez wszystkie cykle”",
    postep.includes("przez wszystkie cykle"),
    postep.split("\n").find((l) => l.includes("cykl")) ?? "brak");
  sprawdz("widać trajektorię 1RM przez cykle",
    /\d+.*→.*\d+/.test(await s.locator("#postep").innerText()),
    (await s.locator("#postep").innerText()).split("\n")
      .find((l) => l.includes("→"))?.slice(0, 60) ?? "brak strzałki");
  await s.click("#wroc-z-postepu");

  // ── 15. czy poprawka w ogóle dociera do klienta ───────────────────
  // Worker odpowiada z cache, żeby aplikacja otwierała się bez zasięgu — ale
  // gdyby na tym poprzestał, plik raz zapisany zostawałby u klienta na zawsze
  // i żadna poprawka nigdy by do niego nie dotarła. Sprawdzamy to jedynym
  // sposobem, który cokolwiek dowodzi: podmieniając plik na dysku.
  const plikAplikacji = join(import.meta.dirname, "..", "public", "klient", "app.js");
  const oryginal = readFileSync(plikAplikacji, "utf-8");
  try {
    writeFileSync(plikAplikacji, `${oryginal}\nwindow.__nowaWersja = true;\n`);

    await s.reload({ waitUntil: "networkidle" });
    await s.waitForTimeout(1200);   // odświeżenie w tle ma zdążyć zapisać
    await s.reload({ waitUntil: "networkidle" });
    await s.waitForTimeout(400);

    const doszlo = await s.evaluate(() => (window as any).__nowaWersja === true);
    sprawdz("nowa wersja aplikacji dociera do klienta z cache",
      doszlo, doszlo ? "przy drugim otwarciu" : "nie doszła wcale");
  } finally {
    writeFileSync(plikAplikacji, oryginal);
  }

  // ── 16. przycisk „wstecz" telefonu ────────────────────────────────
  // Aplikacja przełącza ekrany w miejscu, pod jednym adresem. Dopóki nie
  // zostawiała po sobie śladu w historii, systemowe „wstecz" z otwartego
  // treningu nie wracało do listy dni, tylko wychodziło ze strony — a po
  // dodaniu aplikacji do ekranu głównego po prostu ją zamykało. To ruch,
  // który klient na siłowni wykonuje odruchowo.
  //
  // Druga strona tego samego: aplikacja nie ma prawa zatrzymywać klienta
  // u siebie. „Wstecz" z listy tygodni musi wyjść — pułapka byłaby gorsza
  // od błędu, który to naprawia. Dlatego wchodzimy tu z innej strony,
  // żeby w ogóle było dokąd wyjść.
  const t2 = await kontekst.newPage();
  await t2.goto(`${adres}/klient/manifest.json`, { waitUntil: "load" });
  await t2.goto(`${adres}${sciezka}`, { waitUntil: "networkidle" });
  await t2.waitForSelector("#ekran-tygodnie:not(.ukryty)");

  await t2.goBack({ waitUntil: "load" });
  sprawdz("„wstecz” z listy tygodni wychodzi z aplikacji",
    !t2.url().includes("/k/"), t2.url().replace(adres, ""));

  await t2.goForward({ waitUntil: "networkidle" });
  await t2.waitForSelector("#ekran-tygodnie:not(.ukryty)");
  await t2.locator("#tygodnie .dzien-kafel").first().click();
  await t2.waitForSelector("#ekran-trening:not(.ukryty)");

  // Tak samo, jak zadziałałby przycisk telefonu — bez pośrednictwa Playwrighta.
  await t2.evaluate(() => history.back());
  const wrocilo = await czekajNa(t2, "#ekran-tygodnie:not(.ukryty)");
  sprawdz("„wstecz” z treningu wraca do listy dni, a nie zamyka aplikacji",
    wrocilo && t2.url().includes("/k/"),
    t2.url().includes("/k/") ? t2.url().replace(adres, "") : "wyszło z aplikacji");

  // Gdy poprzednia kontrola padła, aplikacji nie ma już na ekranie i dalsze
  // „wstecz" nie miałoby czego dotykać. Zamiast zgłaszać przy tym trzy kolejne
  // fałszywe ✓, mówimy wprost, że dalej nie ma po czym chodzić.
  if (!wrocilo) {
    console.log("      dalsze kontrole „wstecz” pomijam — aplikacja wyszła z ekranu");
    doliczBledy(3);
  } else {
    // „W przód" po powrocie: wybranego dnia już nie ma, więc ekran treningu
    // byłby pusty. Zamiast pustki ma zostać lista.
    await t2.evaluate(() => history.forward());
    await t2.waitForTimeout(300);
    sprawdz("„w przód” nie pokazuje treningu bez wybranego dnia",
      await t2.locator("#ekran-tygodnie:not(.ukryty)").count() === 1,
      await t2.locator("#ekran-trening:not(.ukryty)").count() === 1
        ? "pusty ekran treningu" : "lista tygodni");

    // Ekrany poboczne tak samo — postęp klient otwiera częściej niż trening.
    await t2.click("#pokaz-postep");
    await t2.waitForSelector("#ekran-postep:not(.ukryty)");
    await t2.evaluate(() => history.back());
    sprawdz("„wstecz” z postępu też wraca do listy",
      await czekajNa(t2, "#ekran-tygodnie:not(.ukryty)")
        && t2.url().includes("/k/"));

    // Chodzenie po aplikacji nie może puchnąć w historii: gdyby każdy ekran
    // dokładał wpis, klient po kwadransie klikania musiałby dotknąć „wstecz"
    // trzydzieści razy, żeby wyjść.
    const przed = await t2.evaluate(() => history.length);
    for (const gdzie of ["#pokaz-pomiary", "#pokaz-postep", "#pokaz-pomiary"]) {
      await t2.click(gdzie);
      await t2.waitForTimeout(150);
      await t2.evaluate(() => history.back());
      await t2.waitForTimeout(150);
    }
    const po = await t2.evaluate(() => history.length);
    sprawdz("chodzenie po ekranach nie zapycha historii", po === przed,
      `${przed} → ${po} wpisów`);
  }
  await t2.close();

  // ── 17. oddech i bieg ─────────────────────────────────────────────
  // Praca obok siłowni: drabina oddechowa i sześciotygodniowy plan biegowy.
  // Matematyka obu ma testy w silniku, ale **cała droga od trenera do telefonu
  // nie była dotąd przejechana ani razu** — ani trasa `/moduly`, ani ekran.
  await s.reload({ waitUntil: "networkidle" });
  await s.waitForSelector("#ekran-tygodnie:not(.ukryty)");
  sprawdz("bez modułów przycisk „Oddech i bieg” milczy",
    await s.locator("#pokaz-moduly.ukryty").count() === 1);

  const biezacyPlan = (await widok()).planId;
  await api(`/api/plany/${biezacyPlan}/moduly`, "PUT", {
    oddech: { twot: 28, przeciwwskazania: false },
    bieg: { wiek: 34, dystansTestowy: 3, czasTestowy: 18, jednostekWTygodniu: 3 },
  });
  await s.reload({ waitUntil: "networkidle" });
  await s.waitForSelector("#pokaz-moduly:not(.ukryty)", { timeout: 3000 });
  await s.click("#pokaz-moduly");
  await s.waitForSelector("#ekran-moduly:not(.ukryty)");

  // Tytuły modułów idą przez `text-transform: uppercase`, więc porównanie
  // z tekstem źródłowym odpowiadałoby na pytanie o kod, a nie o ekran.
  const modulyNaEkranie = async () =>
    (await s.locator("#moduly").innerText()).toLocaleLowerCase("pl");

  const moduly = await modulyNaEkranie();
  sprawdz("klient widzi dawkę oddechową",
    moduly.includes("oddech") && /rozgrzewka|praca|wyciszenie/.test(moduly),
    moduly.split("\n").find((l) => l.includes("·"))?.slice(0, 60) ?? "brak");
  sprawdz("klient widzi sześć tygodni biegu",
    (moduly.match(/bieg · tydzień/g) ?? []).length === 6,
    `${(moduly.match(/bieg · tydzień/g) ?? []).length} tygodni`);
  sprawdz("tydzień czwarty jest oznaczony jako lżejszy",
    moduly.includes("(lżejszy)"));
  sprawdz("przy podanym wieku widać zakres tętna",
    /\d+–\d+ ud\/min/.test(moduly),
    moduly.split("\n").find((l) => l.includes("ud/min"))?.slice(0, 60) ?? "brak");

  // Wiek i zmierzone HR max to pola, których trener bardzo często nie ma.
  // Bez żadnego z nich tętna nie da się policzyć — i na telefonie wyświetlało
  // się wtedy „null–null ud/min", bo warunek stał na obiekcie strefy zamiast
  // na liczbie. Reszta planu biegowego jest wtedy nadal poprawna.
  await api(`/api/plany/${biezacyPlan}/moduly`, "PUT", {
    bieg: { wiek: null, hrMaxZmierzone: null, dystansTestowy: 3, czasTestowy: 18,
      jednostekWTygodniu: 3 },
  });
  await s.reload({ waitUntil: "networkidle" });
  await s.click("#pokaz-moduly");
  await s.waitForSelector("#ekran-moduly:not(.ukryty)");
  const bezWieku = await modulyNaEkranie();
  sprawdz("bez wieku i tętna nie pokazujemy „null”",
    !/null|undefined|nan\b/.test(bezWieku),
    bezWieku.split("\n").find((l) => /null|undefined|nan\b/.test(l))?.slice(0, 60) ?? "czysto");
  sprawdz("plan biegowy bez tętna dalej ma treść",
    (bezWieku.match(/bieg · tydzień/g) ?? []).length === 6 && /\d+ min/.test(bezWieku),
    `${(bezWieku.match(/bieg · tydzień/g) ?? []).length} tygodni`);

  // Trasa `/moduly` zapisywała dotąd cokolwiek, co przyszło.
  const smieci = await fetch(`${adres}/api/plany/${biezacyPlan}/moduly`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ oddech: "trzydzieści sekund" }),
  });
  sprawdz("tekst zamiast wyniku testu jest odrzucany", smieci.status === 400,
    `kod ${smieci.status}`);

  // ── 18. trener poprawia plan, klient stoi na siłowni ──────────────
  //
  // Cofnięcie planu do szkicu to zwykła czynność: trener otwiera cykl, żeby go
  // poprawić. Do tej pory kosztowało to klienta dwie rzeczy naraz. Serwer
  // odmawiał zapisów kodem 409, a kolejka w telefonie traktuje 4xx jako „tego
  // nigdy się nie uda zapisać" i **wyrzucała oceny z odbytego treningu**.
  // Aplikacja zaś zastępowała cały ekran komunikatem „trener przygotowuje
  // plan" — czyli zabierała klientowi trening, który miał przed sobą.
  const planTeraz = (await widok()).planId;
  const przedZmiana = await api(`/api/plany/${planTeraz}`);

  // Poprzednia sekcja zostawiła aplikację na ekranie „Oddech i bieg".
  await s.reload({ waitUntil: "networkidle" });
  await s.waitForSelector("#ekran-tygodnie:not(.ukryty)");

  const bledyPrzedSzkicem = bledy.length;
  await kontekst.setOffline(true);
  await s.locator("#tygodnie .dzien-kafel").nth(1).click();
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  await s.locator("#cwiczenia .cwiczenie").first()
    .getByRole("button", { name: "Za łatwe" }).click();
  await s.waitForTimeout(400);

  await api(`/api/plany/${planTeraz}`, "PUT", {
    plan: przedZmiana.zapisany.plan, dataStartu: przedZmiana.zapisany.dataStartu,
    status: "szkic",
  });

  await kontekst.setOffline(false);
  await s.reload({ waitUntil: "networkidle" });
  await s.waitForTimeout(1500);

  sprawdz("klient nie traci treningu, gdy trener poprawia plan",
    await czekajNa(s, "#ekran-tygodnie:not(.ukryty)")
      && await s.locator("#tygodnie .tydzien").count() === 6,
    `${await s.locator("#tygodnie .tydzien").count()} tygodni na ekranie`);
  sprawdz("aplikacja mówi, dlaczego nie ma nowego planu",
    await s.locator("#baner-przygotowania:not(.ukryty)").count() === 1);

  const wKolejcePoSzkicu = await s.evaluate(() =>
    JSON.parse(localStorage.getItem(`kolejka-${location.pathname.split("/").pop()}`) || "[]").length);
  sprawdz("zaległa ocena nie zostaje w kolejce", wKolejcePoSzkicu === 0,
    `${wKolejcePoSzkicu} zadań`);

  const poSzkicu = await api(`/api/plany/${planTeraz}`);
  sprawdz("ocena z odbytego treningu doszła do trenera",
    poSzkicu.zapisany.wykonania.some((w: any) => w.feedback === "za łatwe"),
    `${poSzkicu.zapisany.wykonania.length} wykonań w bazie`);
  await api(`/api/plany/${planTeraz}`, "PUT", {
    plan: przedZmiana.zapisany.plan, dataStartu: przedZmiana.zapisany.dataStartu,
    status: "wysłany",
  });
  await s.reload({ waitUntil: "networkidle" });
  await s.waitForTimeout(500);
  sprawdz("po ponownym wysłaniu plan wraca na telefon",
    await s.locator("#baner-przygotowania.ukryty").count() === 1
      && await s.locator("#tygodnie .tydzien").count() === 6);

  // Ten krok celowo rozłącza sieć, więc zgłoszenie przeglądarki o braku
  // połączenia jest spodziewane. Czyścimy je dopiero tutaj — przy sprzątaniu
  // od razu po kontrolach błąd dolatywał już po nim i psuł podsumowanie.
  bledy.splice(bledyPrzedSzkicem);

  // ── 19. podmiana ćwiczenia w przerobionym tygodniu ────────────────
  //
  // Slot trzyma jedno ćwiczenie na cały cykl, więc podmiana w środku opisuje
  // nową nazwą także tygodnie już zrobione. Kilogramy z nich nie mogą stać
  // pod cudzą nazwą — ale i nie mogą po prostu zniknąć, bo to jest własna
  // historia klienta. Wracają jako wpis do odczytu, pod prawdziwą nazwą.
  const planDoPodmiany = (await widok()).planId;
  const stanPrzed = await api(`/api/plany/${planDoPodmiany}`);
  const slotPierwszy = stanPrzed.zapisany.plan.sloty
    .find((s: any) => s.cwiczenieId)!;

  await api(`/api/klient/${sciezka.replace("/k/", "")}/odczucie`, "POST", {
    planId: planDoPodmiany, positionId: slotPierwszy.positionId, tydzien: 1,
    feedback: "OK", ciezarWykonany: 88, powtorzeniaWykonane: 6,
  });

  const zPodmiana = (await api(`/api/plany/${planDoPodmiany}`)).zapisany;
  const staraNazwa = (await api("/api/cwiczenia"))
    .find((c: any) => c.id === slotPierwszy.cwiczenieId)!.nazwa;
  const slot = zPodmiana.plan.sloty.find((s: any) => s.positionId === slotPierwszy.positionId)!;
  slot.cwiczenieId = "EX-0013";
  for (const tydzien of [2, 3, 4, 5, 6]) delete slot.tygodnie[tydzien];
  await api(`/api/plany/${planDoPodmiany}`, "PUT", {
    plan: zPodmiana.plan, dataStartu: zPodmiana.dataStartu, status: "wysłany",
    zmieniony: zPodmiana.zmieniony,
  });

  await s.reload({ waitUntil: "networkidle" });
  await s.waitForSelector("#ekran-tygodnie:not(.ukryty)");
  await s.locator("#tygodnie .dzien-kafel").first().click();
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  await s.waitForTimeout(400);

  const slad = await s.locator("#cwiczenia .wczesniej").first().innerText()
    .catch(() => "");
  sprawdz("klient widzi, co robił w tym miejscu przed podmianą",
    slad.includes(staraNazwa) && /88/.test(slad), slad.replace(/\s+/g, " ").slice(0, 70));

  const polaPierwszego = s.locator("#cwiczenia .cwiczenie").first()
    .locator(".wykonanie-pola input");
  sprawdz("pola nowego ćwiczenia zostają puste",
    await polaPierwszego.count() === 0 || await polaPierwszego.nth(0).inputValue() === "",
    await polaPierwszego.count() ? await polaPierwszego.nth(0).inputValue() : "pola zwinięte");

  // ── 20. domknięcie cyklu ──────────────────────────────────────────
  //
  // Ostatni trening kończył się dotąd tak samo jak każdy inny: lista samych
  // ptaszków i cisza. Klient zostawał bez odpowiedzi na pytanie „i co teraz",
  // a trener — bez sygnału, że ma pisać kolejny cykl. Sprawdzone: klient
  // z kompletem domkniętych treningów nie pojawiał się w panelu „wymaga
  // uwagi" ani razu, bo powody końca cyklu liczą się z daty startu, a ta
  // bywa pusta.
  const planDomykany = (await widok()).planId;
  sprawdz("przed końcem cyklu domknięcie milczy",
    await s.locator("#baner-koniec.ukryty").count() === 1);

  const doOdhaczenia = (await api(`/api/plany/${planDomykany}`)).zapisany.plan.sloty
    .filter((s: any) => s.cwiczenieId);
  const dniPlanu = [...new Set(doOdhaczenia.map((s: any) => s.dzien))] as number[];
  for (let tydzien = 1; tydzien <= 6; tydzien++) {
    for (const dzien of dniPlanu) {
      await api(`/api/klient/${sciezka.replace("/k/", "")}/dzien`, "POST",
        { planId: planDomykany, dzien, tydzien });
    }
  }

  await s.reload({ waitUntil: "networkidle" });
  await s.waitForTimeout(800);
  const domkniecie = await s.locator("#baner-koniec:not(.ukryty)").innerText().catch(() => "");
  sprawdz("po ostatnim treningu klient wie, że skończył",
    domkniecie.toLocaleLowerCase("pl").includes("cykl zrobiony"),
    domkniecie.replace(/\s+/g, " ").slice(0, 60));
  sprawdz("i wie, co dalej — bez szukania nowego linku",
    /ten sam link/i.test(domkniecie));

  const wUwadze = await api("/api/uwaga");
  sprawdz("trener widzi, że jest komu napisać nowy cykl",
    wUwadze.some((w: any) => w.powody.some((p: any) => p.rodzaj === "zrobiony")),
    JSON.stringify(wUwadze.flatMap((w: any) => w.powody.map((p: any) => p.rodzaj))));

  // ── 21. plan, którego trener nie wypełnił ─────────────────────────
  //
  // Wszystkie sekcje powyżej sieją plan **z progresją**, więc żadna nie
  // dotykała drogi, którą trener idzie naprawdę: wybiera ćwiczenia, wpisuje
  // serie maksymalne i wysyła. Tą drogą bój główny trafiał na telefon jako
  // `1 × 6` — jedna seria. Zgłoszone z prawdziwego użycia, nie z testu.
  const GOLY = "goly-plan";
  await api("/api/plany", "POST", { klient: GOLY, wersja: 1 });
  const idGolego = (await api("/api/plany")).find((p: any) => p.klient === GOLY).id;
  const golyPlan = (await api(`/api/plany/${idGolego}`)).zapisany.plan;
  golyPlan.sloty[0].cwiczenieId = "EX-0010";   // A1. bój główny
  golyPlan.sloty[1].cwiczenieId = "EX-0016";   // B1. akcesorium
  // B2 — druga połowa superserii i ćwiczenie na masie ciała naraz. Obie te
  // rzeczy sprawdza sekcja 22; tu wystarczy je postawić w planie.
  golyPlan.sloty[2].cwiczenieId = "EX-0050";   // B2. Dead bug straight legs
  golyPlan.serieMaksymalne = [
    { cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 3 },
    { cwiczenieId: "EX-0016", ciezar: 70, powtorzenia: 5 },
  ];
  /*
   * TOP SET przy akcesorium w B1 — nie przy pierwszym wierszu dnia.
   *
   * Trener stawia TOP SET kliknięciem, przy tym ćwiczeniu, przy którym chce.
   * Na telefonie ma się wtedy pojawić właśnie to ćwiczenie; wcześniej TOP SET
   * brał ćwiczenie z pierwszego wiersza i tylko wtedy, gdy stało tam coś
   * złożonego, więc takiego układu nie dało się nawet zapisać.
   */
  //
  // RPE wpisane wprost w T1: szablon w pierwszym tygodniu TOP SETU nie
  // przewiduje (tak jest w arkuszach), a wpisana liczba ma to przebijać.
  // Klient otwiera właśnie T1, więc ta kontrola sprawdza obie rzeczy naraz.
  golyPlan.topSety = golyPlan.topSety.map((t: any) => t.dzien === 1
    ? { ...t, wlaczony: true, rpeTygodni: { 1: 8 },
        slotPositionId: golyPlan.sloty[1].positionId }
    : t);
  // Żadnej progresji, żadnego wpisanego pola — dokładnie tak, jak wyszedł
  // plan Tomka.
  await api(`/api/plany/${idGolego}`, "PUT",
    { plan: golyPlan, dataStartu: null, status: "wysłany" });
  const golySciezka = (await api(`/api/plany/${idGolego}/link`, "POST")).sciezka;

  await s.goto(`${adres}${golySciezka}`, { waitUntil: "networkidle" });
  await s.locator("#tygodnie .dzien-kafel").first().click();
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  const schematy = await s.locator("#cwiczenia .kolumna-serie .wartosc").allInnerTexts();

  sprawdz("niewypełniony plan nie każe robić jednej serii",
    schematy.length > 0 && schematy.every((t) => t.trim() !== "1"),
    `serie: ${schematy.join(" | ") || "brak ćwiczeń"}`);

  const pasekTopSetu = await s.locator("#topset").innerText().catch(() => "");
  sprawdz("TOP SET postawiony przy akcesorium dochodzi na telefon",
    pasekTopSetu.includes("Barbell row") && /RPE\s*8/.test(pasekTopSetu),
    pasekTopSetu.replace(/\n/g, " ") || "pusto");

  const golyWidok = await api(`/api/klient/${golySciezka.replace("/k/", "")}`);
  const golyBoj = golyWidok.tygodnie[0].dni[0].cwiczenia[0];
  sprawdz("bój główny dostaje liczby z szablonu 5.18",
    golyBoj.serie === 6 && golyBoj.powtorzenia === 6 && golyBoj.rpe === 6.5,
    `${golyBoj.serie} × ${golyBoj.powtorzenia} · RPE ${golyBoj.rpe}`);


  /** Licznik pokazuje „2:30" — przeglądarka liczy w sekundach, my też. */
  const sekundy = (t: string) => {
    const [m, sek] = t.split(":").map(Number);
    return (m ?? 0) * 60 + (sek ?? 0);
  };
  // Zakres, nie równość: między kliknięciem a odczytem licznik zdąży tyknąć.
  const wZakresie = (t: string, od: number, doo: number) =>
    sekundy(t) >= od && sekundy(t) <= doo;

  // ── 22. prowadzenie seria po serii ────────────────────────────────
  //
  // Drugi tryb tego samego treningu: jeden panel naraz i licznik przerwy.
  // Plan z sekcji 21 nadaje się do tego najlepiej — ma TOP SET, bój główny
  // i superserię B1/B2, czyli wszystkie trzy rodzaje kroków.
  await s.click("#prowadz");
  await s.waitForSelector("#ekran-seria:not(.ukryty)");

  const panel = s.locator("#panel");
  /** Numer serii z kolumny SERIA: „1 z 6". */
  const seriaNaPanelu = async () => (await panel.locator(".kolumna-seria .wartosc").innerText()
    .catch(() => "")).replace(/\s+/g, " ").trim();
  sprawdz("prowadzenie zaczyna od TOP SETU",
    (await panel.innerText()).includes("TOP SET")
    && (await panel.innerText()).includes("Barbell row"),
    (await panel.innerText()).replace(/\n/g, " ").slice(0, 70));

  // TOP SET stoi przy akcesorium (coeff 0,75) — przerwa ma trwać 2 minuty,
  // nie trzy. To jest ta liczba, którą silnik wylicza z `coeff`.
  await panel.getByRole("button", { name: "Zrobione" }).click();
  await s.waitForSelector("#licznik");
  sprawdz("po serii wchodzi przerwa z odliczaniem",
    wZakresie(await s.locator("#licznik").innerText(), 110, 120),
    await s.locator("#licznik").innerText());

  // „+30 s” ma przedłużać, a nie zaczynać od nowa.
  const przedDolozeniem = await s.locator("#licznik").innerText();
  await panel.getByRole("button", { name: "+30 s" }).click();
  sprawdz("„+30 s” dokłada do trwającej przerwy",
    sekundy(await s.locator("#licznik").innerText()) - sekundy(przedDolozeniem) >= 29,
    `${przedDolozeniem} → ${await s.locator("#licznik").innerText()}`);

  await panel.getByRole("button", { name: "Pomiń przerwę" }).click();
  await s.waitForSelector("#panel .panel-pola");
  sprawdz("po przerwie wchodzi pierwsza seria boju głównego",
    await seriaNaPanelu() === "1 z 6",
    (await panel.innerText()).replace(/\n/g, " ").slice(0, 60));

  // Seria wpisana na panelu ma trafić do trenera tą samą drogą, co z listy.
  const polaPanelu = panel.locator(".panel-pola input");
  await polaPanelu.nth(0).fill("100");
  await polaPanelu.nth(1).fill("6");
  await panel.getByRole("button", { name: "Zakończ serię" }).click();
  await s.waitForTimeout(700);
  const poPierwszej = (await api(`/api/klient/${golySciezka.replace("/k/", "")}`))
    .tygodnie[0].dni[0].cwiczenia[0];
  sprawdz("seria z panelu dochodzi do trenera",
    poPierwszej.ciezarWykonany === 100 && poPierwszej.powtorzeniaWykonane === 6,
    `${poPierwszej.ciezarWykonany} kg × ${poPierwszej.powtorzeniaWykonane}`);

  // Bój główny (coeff 1,0) odpoczywa trzy minuty.
  await s.waitForSelector("#licznik");
  sprawdz("przerwa po boju głównym jest dłuższa niż po akcesorium",
    wZakresie(await s.locator("#licznik").innerText(), 170, 180),
    await s.locator("#licznik").innerText());
  await panel.getByRole("button", { name: "Pomiń przerwę" }).click();
  await s.waitForSelector("#panel .panel-pola");

  // Druga seria lżejsza od pierwszej. Do trenera ma iść najcięższa, bo to ona
  // opisuje, co klient udźwignął — ostatnia jest zwykle najsłabsza.
  await polaPanelu.nth(0).fill("90");
  await polaPanelu.nth(1).fill("6");
  await panel.getByRole("button", { name: "Zakończ serię" }).click();
  await s.waitForTimeout(700);
  const poDrugiej = (await api(`/api/klient/${golySciezka.replace("/k/", "")}`))
    .tygodnie[0].dni[0].cwiczenia[0];
  sprawdz("do 1RM idzie najcięższa seria, nie ostatnia",
    poDrugiej.ciezarWykonany === 100,
    `${poDrugiej.ciezarWykonany} kg`);
  sprawdz("a do trenera trafiają obie serie, nie jedna",
    JSON.stringify(poDrugiej.serieWykonane)
      === JSON.stringify([{ ciezar: 100, powtorzenia: 6 }, { ciezar: 90, powtorzenia: 6 }]),
    JSON.stringify(poDrugiej.serieWykonane));
  await panel.getByRole("button", { name: "Pomiń przerwę" }).click();
  await s.waitForSelector("#panel .panel-pola");
  sprawdz("kafelki serii mają podpis",
    (await panel.locator(".serie-wpisane").innerText()).startsWith("Poprzednie serie:"),
    (await panel.locator(".serie-wpisane").innerText()).replace(/\n/g, " "));
  const wysokosc = async (sel: string) => await panel.locator(sel)
    .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  sprawdz("numer serii jest duży, a RPE drobne",
    await wysokosc(".kolumna-seria .wartosc") === await wysokosc(".kolumna-ciezar .wartosc")
    && await wysokosc(".rpe-linia") < await wysokosc(".kolumna-seria .wartosc") / 2
    // Samo „RPE 6,5" — bez dopisku „3–4 w zapasie" (trener, 24.09).
    && /^RPE [\d,]+$/.test((await panel.locator(".rpe-linia").innerText()).trim()),
    `seria ${await wysokosc(".kolumna-seria .wartosc")}px · RPE ${await wysokosc(".rpe-linia")}px · `
    + `„${await panel.locator(".rpe-linia").innerText()}"`);
  sprawdz("wpisane serie widać na panelu",
    (await panel.locator(".serie-wpisane .chip").allInnerTexts()).join(" ").includes("90"),
    (await panel.locator(".serie-wpisane .chip").allInnerTexts()).join(" | "));

  // Miejsce w treningu przeżywa zamknięcie aplikacji. Na siłowni telefon
  // gaśnie, wypada z kieszeni i bywa zamykany — bez tego klient wracał na
  // początek dnia i nie miał jak trafić tam, gdzie skończył.
  await s.reload({ waitUntil: "networkidle" });
  await s.locator("#tygodnie .dzien-kafel").first().click();
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  sprawdz("przerwany trening zaprasza z powrotem, a nie od nowa",
    (await s.locator("#prowadz").innerText()).includes("Wróć"),
    await s.locator("#prowadz").innerText());
  await s.click("#prowadz");
  await s.waitForSelector("#ekran-seria:not(.ukryty)");
  sprawdz("prowadzenie wraca w to samo miejsce",
    await seriaNaPanelu() === "3 z 6",
    (await panel.innerText()).replace(/\n/g, " ").slice(0, 60));
  sprawdz("wpisane wcześniej serie przeżyły zamknięcie aplikacji",
    (await panel.locator(".serie-wpisane .chip").allInnerTexts()).length === 2,
    (await panel.locator(".serie-wpisane .chip").allInnerTexts()).join(" | "));

  // Reszta boju głównego — po niej wchodzi superseria B1/B2.
  for (let i = 3; i <= 6; i++) {
    await panel.getByRole("button", { name: "Zakończ serię" }).click();
    await s.waitForTimeout(150);
    if (await s.locator("#licznik").count() > 0) {
      await panel.getByRole("button", { name: "Pomiń przerwę" }).click();
    }
    await s.waitForSelector("#panel .panel-pola");
  }
  sprawdz("po boju głównym wchodzi superseria",
    (await panel.innerText()).includes("superseria B"),
    (await panel.innerText()).replace(/\n/g, " ").slice(0, 60));

  // Gdzie jestem — mapa dnia nad panelem: A1 zrobione, B1 tu.
  const kafel = (etykieta: string) => panel.locator(`.kafel-mapy[data-lp="${etykieta}"]`);
  sprawdz("mapa dnia pokazuje, co zrobione i przy czym stoisz",
    await kafel("A1").getAttribute("class").then((k) => k?.includes("zrobione"))
    && await kafel("B1").getAttribute("class").then((k) => k?.includes("tu")),
    (await panel.locator(".kafel-mapy").allInnerTexts()).join(" "));

  // Kafelki jednej superserii razem, między literami odstęp: TOP | A1 | B1 B2.
  const grupyMapy = await panel.locator(".grupa-mapy").evaluateAll((grupy) =>
    grupy.map((g) => [...g.querySelectorAll<HTMLElement>(".kafel-mapy")]
      .map((k) => k.dataset.lp).join(" ")));
  sprawdz("mapa grupuje kafelki po literze superserii",
    JSON.stringify(grupyMapy) === JSON.stringify(["TOP", "A1", "B1 B2"]),
    grupyMapy.join(" | "));

  // Wyjście na listę w środku treningu — ma być widać, gdzie się jest.
  await panel.getByRole("button", { name: "Cały dzień na liście" }).click();
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  const kartaA1 = s.locator('#cwiczenia [data-position="D1-S01"]');
  const kartaB1 = s.locator('#cwiczenia [data-position="D1-S02"]');
  sprawdz("na liście dnia widać, gdzie jesteś w treningu",
    (await kartaB1.locator(".stan-prowadzenia").innerText()).includes("Tu jesteś · seria 1 z 3")
    && await kartaB1.evaluate((e) => e.classList.contains("biezace"))
    && (await kartaA1.locator(".stan-prowadzenia").innerText()).includes("zrobione"),
    `A1: ${await kartaA1.locator(".stan-prowadzenia").innerText().catch(() => "—")} · `
    + `B1: ${await kartaB1.locator(".stan-prowadzenia").innerText().catch(() => "—")}`);
  sprawdz("przycisk prowadzenia mówi, dokąd wraca",
    (await s.locator("#prowadz").innerText()).includes("B1."),
    await s.locator("#prowadz").innerText());

  await kartaB1.locator(".stan-prowadzenia").click();
  await s.waitForSelector("#ekran-seria:not(.ukryty)");
  sprawdz("„Tu jesteś” wraca do panelu w to samo miejsce",
    await seriaNaPanelu() === "1 z 3" && (await panel.innerText()).includes("superseria B"),
    (await panel.innerText()).replace(/\n/g, " ").slice(0, 70));

  // Powrót do zrobionego ćwiczenia z mapy — do poprawki, bez przerwy,
  // i jednym dotknięciem z powrotem tam, gdzie się skończyło.
  await kafel("A1").click();
  const przeglad = await panel.innerText();
  sprawdz("mapa przenosi do zrobionego ćwiczenia i mówi, że jest zrobione",
    await seriaNaPanelu() === "1 z 6" && przeglad.includes("już zrobiona")
    && przeglad.includes("Zapisz poprawkę"),
    przeglad.replace(/\n/g, " ").slice(0, 110));
  await polaPanelu.nth(0).fill("102.5");
  await panel.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await s.waitForTimeout(600);
  sprawdz("poprawka wraca tam, gdzie się skończyło — bez przerwy",
    await s.locator("#licznik").count() === 0
    && await seriaNaPanelu() === "1 z 3" && (await panel.innerText()).includes("superseria B"),
    (await panel.innerText()).replace(/\n/g, " ").slice(0, 70));
  const bojPoPoprawce = (await api(`/api/klient/${golySciezka.replace("/k/", "")}`))
    .tygodnie[0].dni[0].cwiczenia[0].serieWykonane;
  sprawdz("poprawka trafia do trenera",
    bojPoPoprawce[0]?.ciezar === 102.5 && bojPoPoprawce.length === 6,
    JSON.stringify(bojPoPoprawce.slice(0, 2)));

  // Superseria idzie naprzemiennie i **bez przerwy w środku rundy**: po B1
  // od razu B2, dopiero potem odliczanie. Tak się je robi na sali.
  const pierwszeWRundzie = await panel.locator(".panel-gora .nazwa").innerText();
  // Zgłoszone z testów: przy „9 kg · 10 powt." klient zmienił tylko
  // powtórzenia na 11 i zapisało się „11" bez ciężaru — bo 9 w polu było
  // tylko szarą podpowiedzią. Pola mają stać z prawdziwymi liczbami.
  sprawdz("pierwsza seria ma w polach liczby z planu, nie szare podpowiedzi",
    await polaPanelu.nth(0).inputValue() !== "" && await polaPanelu.nth(1).inputValue() !== "",
    `${await polaPanelu.nth(0).inputValue()} kg × ${await polaPanelu.nth(1).inputValue()}`);
  await polaPanelu.nth(1).fill("9");
  await panel.getByRole("button", { name: "Zakończ serię" }).click();
  await s.waitForTimeout(150);
  sprawdz("między B1 a B2 nie ma przerwy",
    await s.locator("#licznik").count() === 0,
    await s.locator("#licznik").count() === 0 ? "brak licznika" : "licznik jest");
  const drugieWRundzie = await panel.locator(".panel-gora .nazwa").innerText();
  sprawdz("po B1 wchodzi B2, nie druga seria B1",
    pierwszeWRundzie !== drugieWRundzie,
    `${pierwszeWRundzie} → ${drugieWRundzie}`);

  // Zaczęte ćwiczenie nie może wyglądać jak skończone: licznik zamiast zieleni.
  const ramka = async (etykieta: string) =>
    await kafel(etykieta).evaluate((e) => getComputedStyle(e).borderColor);
  sprawdz("zaczęte ćwiczenie ma licznik i nie jest zielone jak zrobione",
    (await kafel("B1").innerText()).includes("1/3")
    && await ramka("B1") !== await ramka("A1"),
    `B1: „${await kafel("B1").innerText()}" ${await ramka("B1")} · A1: ${await ramka("A1")}`);

  // B2 to ćwiczenie na masie ciała — pola na kilogramy nie ma czym wypełnić.
  await s.waitForTimeout(500);
  const wiosloPoZmianie = (await api(`/api/klient/${golySciezka.replace("/k/", "")}`))
    .tygodnie[0].dni[0].cwiczenia[1];
  sprawdz("zmiana samych powtórzeń zostawia ciężar",
    wiosloPoZmianie.serieWykonane[0]?.ciezar === wiosloPoZmianie.ciezar
    && wiosloPoZmianie.serieWykonane[0]?.powtorzenia === 9,
    JSON.stringify(wiosloPoZmianie.serieWykonane[0]));

  sprawdz("przy masie ciała nie ma pola na kilogramy",
    await panel.locator(".panel-pola input").count() === 1,
    `${await panel.locator(".panel-pola input").count()} pola`);

  await panel.getByRole("button", { name: "Zakończ serię" }).click();
  await s.waitForSelector("#licznik");
  sprawdz("przerwa wchodzi dopiero po całej rundzie superserii",
    wZakresie(await s.locator("#licznik").innerText(), 110, 120),
    await s.locator("#licznik").innerText());

  // Przerwa liczona ze znacznika końca, a nie z odejmowania sekundy co
  // tyknięcie. Telefon na siłowni leży zablokowany, a przeglądarka w tle
  // zwalnia licznik albo zatrzymuje go zupełnie — po powrocie ma być prawda.
  await s.reload({ waitUntil: "networkidle" });
  await s.locator("#tygodnie .dzien-kafel").first().click();
  await s.click("#prowadz");
  await s.waitForSelector("#ekran-seria:not(.ukryty)");
  sprawdz("przerwa liczy się dalej mimo zamknięcia aplikacji",
    await s.locator("#licznik").count() === 1
    && wZakresie(await s.locator("#licznik").innerText(), 100, 119),
    await s.locator("#licznik").innerText().catch(() => "brak licznika"));

  await panel.getByRole("button", { name: "Pomiń przerwę" }).click();

  // Do końca dnia — ostatni panel domyka trening tak samo, jak przycisk
  // na liście.
  for (let i = 0; i < 20; i++) {
    if (await panel.getByRole("button", { name: "Zakończ trening" }).count() > 0) break;
    if (await s.locator("#licznik").count() > 0) {
      await panel.getByRole("button", { name: "Pomiń przerwę" }).click();
    } else {
      await panel.getByRole("button", { name: "Zakończ serię" }).click();
    }
    await s.waitForTimeout(120);
  }
  sprawdz("ostatni panel domyka trening",
    await panel.getByRole("button", { name: "Zakończ trening" }).count() === 1);
  sprawdz("po ostatniej serii nie ma już przerwy",
    await s.locator("#licznik").count() === 0);

  await panel.getByRole("button", { name: "Zakończ trening" }).click();
  await s.waitForSelector("#ekran-tygodnie:not(.ukryty)");
  await s.waitForTimeout(500);
  const poProwadzeniu = await api(`/api/klient/${golySciezka.replace("/k/", "")}`);
  sprawdz("trening z prowadzenia jest zakończony",
    poProwadzeniu.tygodnie[0].dni[0].ukonczony === true);

  // Serie z prowadzenia widać też na liście dnia — w jednej linijce, żeby nie
  // zasypywać klienta liczbami. Rozwinięte: wiersz na serię, ale tylko wpisane
  // i jeden pusty na następną, nie cały formularz naraz.
  await s.locator("#tygodnie .dzien-kafel").first().click();
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  const kartaBoju = s.locator('#cwiczenia [data-position="D1-S01"]');
  const linijkaBoju = await kartaBoju.locator(".wykonanie-opis").innerText();
  sprawdz("lista pokazuje wszystkie serie w jednej linijce",
    linijkaBoju.includes("Zrobione: 102,5 · 90 · 90 · 90 · 90 · 90 kg × 6"), linijkaBoju);
  sprawdz("po treningu lista pokazuje zapis, a nie formularz na wierzchu",
    await kartaBoju.locator(".wykonanie-pola.ukryty").count() === 1
    && (await kartaBoju.locator(".wykonanie-przelacz").innerText()).includes("edytuj"),
    await kartaBoju.locator(".wykonanie-przelacz").innerText());
  await kartaBoju.locator(".wykonanie-przelacz").click();
  sprawdz("rozwinięte: wiersz na każdą wpisaną serię",
    await kartaBoju.locator(".wiersz-serii").count() === 6,
    `${await kartaBoju.locator(".wiersz-serii").count()} wierszy`);

  // Edycja z listy służy do poprawki — literówka w kilogramach szłaby prosto
  // do propozycji 1RM. Poprawka ma trafić do trenera tą samą drogą.
  const kartaWioslowania = s.locator('#cwiczenia [data-position="D1-S02"]');
  await kartaWioslowania.locator(".wykonanie-przelacz").click();
  const drugiWiersz = kartaWioslowania.locator(".wiersz-serii").nth(1).locator("input");
  await drugiWiersz.nth(1).fill("8");
  await drugiWiersz.nth(1).blur();
  await s.waitForTimeout(600);
  const wioslowanieZListy = (await api(`/api/klient/${golySciezka.replace("/k/", "")}`))
    .tygodnie[0].dni[0].cwiczenia[1];
  sprawdz("poprawka z listy trafia do trenera tą samą drogą",
    wioslowanieZListy.serieWykonane[1]?.powtorzenia === 8
    && wioslowanieZListy.serieWykonane[0]?.powtorzenia === 9,
    JSON.stringify(wioslowanieZListy.serieWykonane));
  await s.click("#wroc-z-treningu");
  await s.waitForSelector("#ekran-tygodnie:not(.ukryty)");

  // Drugi tydzień boju głównego: mniej kilogramów, więcej powtórzeń. Nagłówek
  // karty w postępie ma mówić o sile (1RM), nie o kilogramach na sztandze.
  await api(`/api/klient/${golySciezka.replace("/k/", "")}/odczucie`, "POST",
    { positionId: "D1-S01", tydzien: 2, serie: [{ ciezar: 95, powtorzenia: 8 }] });
  await s.reload({ waitUntil: "networkidle" });
  await s.click("#pokaz-postep");
  await s.waitForSelector("#ekran-postep:not(.ukryty)");
  await s.waitForTimeout(500);
  const kartaPostepuBoju = s.locator("#postep .cwiczenie").filter({ hasText: /barbell back squat/i });
  const naglowekPostepu = await kartaPostepuBoju.first().locator(".modul-poziom").innerText();
  sprawdz("postęp ćwiczenia porównuje 1RM, a nie kilogramy na sztandze",
    /^1RM ≈ [\d,]+ → [\d,]+ kg/.test(naglowekPostepu), naglowekPostepu);
  await s.click("#wroc-z-postepu");
  await s.waitForSelector("#ekran-tygodnie:not(.ukryty)");


  // ── 23. start bez serii maksymalnych ──────────────────────────────
  //
  // Druga droga na start cyklu: klient nie robi serii do odmowy, tylko od
  // razu trenuje i dobiera ciężar według RPE. Pierwsza wpisana seria ma się
  // zamienić w 1RM, a z niego w ciężary na cały plan.
  //
  // Wiosłowanie celowo w A1: trener rozstrzygnął 22.09, że bojem głównym nie
  // jest, więc ma tu dostać progresję akcesorium, nie szablon boju.
  const BEZ_MAKSOW = "bez-maksow";
  await api("/api/plany", "POST", { klient: BEZ_MAKSOW, wersja: 1 });
  const idBezMaksow = (await api("/api/plany")).find((p: any) => p.klient === BEZ_MAKSOW).id;
  const planBezMaksow = (await api(`/api/plany/${idBezMaksow}`)).zapisany.plan;
  planBezMaksow.sloty[0].cwiczenieId = "EX-0016";   // A1. Barbell row — bez 1RM
  planBezMaksow.sloty[1].cwiczenieId = "EX-0050";   // B1. Dead bug — masa ciała
  planBezMaksow.sloty[2].cwiczenieId = "EX-0010";   // B2. Barbell back squat — bez 1RM
  await api(`/api/plany/${idBezMaksow}`, "PUT",
    { plan: planBezMaksow, dataStartu: null, status: "wysłany" });
  const sciezkaBezMaksow = (await api(`/api/plany/${idBezMaksow}/link`, "POST")).sciezka;
  const widokBezMaksow = async () =>
    await api(`/api/klient/${sciezkaBezMaksow.replace("/k/", "")}`);

  const wioslowanie = (await widokBezMaksow()).tygodnie[0].dni[0].cwiczenia[0];
  sprawdz("wiosłowanie w A1 dostaje progresję akcesorium, nie boju",
    wioslowanie.serie === 3,
    `${wioslowanie.serie} × ${wioslowanie.powtorzenia} · RPE ${wioslowanie.rpe}`);

  await s.goto(`${adres}${sciezkaBezMaksow}`, { waitUntil: "networkidle" });
  const baner = await s.locator("#pomiary-baner:not(.ukryty)").innerText().catch(() => "");
  sprawdz("bez 1RM klient dostaje dwie drogi na start",
    baner.includes("Zacznij trening od razu") && baner.includes("Najpierw serie maksymalne"),
    baner.replace(/\s+/g, " ").slice(0, 80));
  // Ćwiczenie na masie ciała nie liczy się do brakujących. Liczone razem
  // z nimi nie schodziły nigdy do zera i baner wisiał przez cały cykl.
  sprawdz("ćwiczenie na masie ciała nie liczy się do brakujących ciężarów",
    baner.includes("W 2 ćwiczeniach"),
    (await s.locator("#pomiary-tresc").innerText()).slice(0, 60));

  await s.locator("#rpe-baner summary").click();
  sprawdz("objaśnienie RPE rozwija się przy banerze",
    (await s.locator("#rpe-baner details").innerText()).includes("RPE 8")
    && (await s.locator("#rpe-baner details").innerText()).includes("2 w zapasie"));

  await s.click("#od-razu");
  await s.waitForSelector("#ekran-seria:not(.ukryty)");
  const panelDoboru = await panel.innerText();
  sprawdz("„zacznij od razu” prowadzi prosto do pierwszej serii",
    panelDoboru.includes("Barbell row") && await seriaNaPanelu() === "1 z 3",
    panelDoboru.replace(/\n/g, " ").slice(0, 60));
  sprawdz("zamiast „— brak 1RM” jest zaproszenie do dobrania ciężaru",
    /dobierz/i.test(panelDoboru) && /mieć jeszcze [\d–]+ w zapasie/.test(panelDoboru)
    && !panelDoboru.includes("brak 1RM"),
    panelDoboru.replace(/\n/g, " ").slice(0, 120));

  await polaPanelu.nth(0).fill("60");
  await polaPanelu.nth(1).fill(String(wioslowanie.powtorzenia));
  await panel.getByRole("button", { name: "Zakończ serię" }).click();
  await s.waitForTimeout(700);

  const poKalibracji = (await api(`/api/plany/${idBezMaksow}`));
  const wpisKalibracji = poKalibracji.zapisany.plan.serieMaksymalne
    .find((x: any) => x.cwiczenieId === "EX-0016");
  sprawdz("pierwsza seria ustala 1RM, z opisem skąd",
    wpisKalibracji?.kalibracja?.ciezar === 60,
    JSON.stringify(wpisKalibracji ?? null).slice(0, 90));
  const ciezaryCyklu = poKalibracji.wynik.tygodnie.map((t: any) => t.sloty[0].ciezar);
  sprawdz("z jednej serii liczy się cały cykl",
    ciezaryCyklu.every((c: unknown) => typeof c === "number"),
    ciezaryCyklu.join(" · "));

  await panel.getByRole("button", { name: "Pomiń przerwę" }).click();
  await s.waitForSelector("#panel .panel-pola");
  const drugaSeria = await panel.innerText();
  sprawdz("druga seria ma już ciężar — ten, który klient podniósł",
    drugaSeria.includes("60 kg") && await seriaNaPanelu() === "2 z 3",
    drugaSeria.replace(/\n/g, " ").slice(0, 70));
  sprawdz("i mówi, skąd go wzięła",
    drugaSeria.includes("Policzone z Twojej serii"),
    await panel.locator(".kalibracja").innerText().catch(() => "brak notki"));
  sprawdz("instrukcja doboru znika, gdy ciężar już jest",
    !drugaSeria.includes("Weź taki ciężar"),
    drugaSeria.includes("Weź taki ciężar") ? "instrukcja dalej wisi" : "czysto");

  // To samo z listy dnia — tak to wyszło na żywym planie: seria wpisana
  // w „co poszło", a instrukcja doboru i napis „dobierz ciężar" wiszą dalej,
  // bo zapis z listy celowo nie przerysowuje ekranu.
  await s.click("#wroc-z-serii");
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  const kartaPrzysiadu = () => s.locator('#cwiczenia [data-position="D1-S03"]');
  sprawdz("na liście ćwiczenie bez ciężaru ma instrukcję i pola na wierzchu",
    (await kartaPrzysiadu().innerText()).includes("Weź taki ciężar")
    && await kartaPrzysiadu().locator(".wykonanie-pola:not(.ukryty) input").count() > 0,
    (await kartaPrzysiadu().innerText()).replace(/\n/g, " ").slice(0, 80));
  const przysiad = (await widokBezMaksow()).tygodnie[0].dni[0].cwiczenia
    .find((c: any) => c.positionId === "D1-S03");
  // Wiersz na każdą serię z planu i żadnych szarych liczb w polach. Zgłoszone
  // z testów: niepełna seria i pusty wiersz z podpowiedziami wyglądały jak dwie
  // zapisane serie przy trzech w planie.
  sprawdz("wierszy tyle, ile serii w planie",
    await kartaPrzysiadu().locator(".wiersz-serii").count() === przysiad.serie,
    `${await kartaPrzysiadu().locator(".wiersz-serii").count()} wierszy przy ${przysiad.serie} seriach`);
  const podpowiedzi = await kartaPrzysiadu().locator(".wiersz-serii input")
    .evaluateAll((pola) => pola.map((p) => (p as HTMLInputElement).placeholder));
  sprawdz("puste pole nie udaje liczby",
    podpowiedzi.every((p) => !/\d/.test(p)), podpowiedzi.join(" "));

  // Sam ciężar, bez powtórzeń — tak, jak wyszło na planie Marka X przy B2.
  // Seria ma być widać jako niepełną i ma być powiedziane, czego brakuje.
  const polaPrzysiadu = kartaPrzysiadu().locator(".wykonanie-pola input");
  await polaPrzysiadu.nth(0).fill("80");
  await polaPrzysiadu.nth(0).blur();
  await s.waitForTimeout(700);
  const polowka = await kartaPrzysiadu().innerText();
  sprawdz("seria bez powtórzeń jest widać jako niepełna",
    polowka.includes("Zrobione: 80 kg") && polowka.includes("Dopisz powtórzenia"),
    polowka.replace(/\n/g, " ").slice(0, 120));

  await polaPrzysiadu.nth(1).fill(String(przysiad.powtorzenia));
  await polaPrzysiadu.nth(1).blur();
  await s.waitForTimeout(800);
  const poWpisie = await kartaPrzysiadu().innerText();
  sprawdz("po wpisaniu serii na liście instrukcja znika bez wychodzenia z ekranu",
    !poWpisie.includes("Weź taki ciężar") && !/dobierz/i.test(poWpisie),
    poWpisie.replace(/\n/g, " ").slice(0, 90));
  sprawdz("a w jej miejscu jest policzony ciężar",
    poWpisie.includes("80 kg") && poWpisie.includes("Policzone z Twojej serii"),
    poWpisie.replace(/\n/g, " ").slice(0, 90));

  await s.click("#wroc-z-treningu");
  await s.waitForSelector("#ekran-tygodnie:not(.ukryty)");
  sprawdz("po kalibracji baner o brakujących ciężarach znika",
    await s.locator("#pomiary-baner.ukryty").count() === 1);

  await s.click("#pokaz-pomiary");
  await s.waitForSelector("#ekran-pomiary:not(.ukryty)");
  const pomiarWioslowania = await s.locator("#pomiary .pomiar").first().innerText();
  sprawdz("na ekranie serii maksymalnych widać, skąd jest 1RM",
    pomiarWioslowania.includes("Policzone z Twojej serii na treningu"),
    pomiarWioslowania.replace(/\n/g, " ").slice(0, 90));
  sprawdz("a pola nie udają serii, której nie było",
    await s.locator("#pomiary .pomiar").first().locator("input").first().inputValue() === "",
    await s.locator("#pomiary .pomiar").first().locator("input").first().inputValue());


  // ── 24. słaby zasięg nie gubi serii ───────────────────────────────
  //
  // Kolejka wysyła zapisy po kolei. Odpowiedź na pierwszy niesie stan sprzed
  // drugiego — a była przyjmowana jako cały widok, także wtedy, gdy drugi
  // jeszcze czekał. Gdy drugi nie przeszedł (zasięg zgasł), telefon zostawał
  // z widokiem bez serii, którą klient właśnie wpisał, a kolejna seria tego
  // ćwiczenia zapisywała się na tej nieaktualnej liście — i poprzednia
  // przepadała. Na sali ze słabym zasięgiem: zwykła sytuacja.
  await s.click("#wroc-z-pomiarow");
  await s.waitForSelector("#ekran-tygodnie:not(.ukryty)");
  await s.locator("#tygodnie .dzien-kafel").first().click();
  await s.waitForSelector("#ekran-trening:not(.ukryty)");

  // Zerwane połączenie jest tu celowe — przeglądarka zgłasza je jako błąd
  // ładowania, a to nie jest awaria aplikacji. Tak samo jak w sekcji 12.
  const bledyPrzedZasiegiem = bledy.length;
  let zapisowOdczucia = 0;
  await s.route("**/odczucie", async (trasa) => {
    zapisowOdczucia += 1;
    if (zapisowOdczucia === 1) {                 // pierwszy przechodzi, ale powoli
      await new Promise((r) => setTimeout(r, 900));
      return trasa.continue();
    }
    return trasa.abort();                        // drugi — zasięg zgasł
  });

  const kartaWiosla = s.locator('#cwiczenia [data-position="D1-S01"]');
  const kartaPrzysiaduB2 = s.locator('#cwiczenia [data-position="D1-S03"]');
  const rozwin = async (karta: typeof kartaWiosla) => {
    if (await karta.locator(".wykonanie-pola.ukryty").count() > 0) {
      await karta.locator(".wykonanie-przelacz").click();
    }
  };
  await rozwin(kartaWiosla);
  const wiosloDruga = kartaWiosla.locator(".wiersz-serii").nth(1).locator("input");
  await wiosloDruga.nth(0).fill("62.5");
  await wiosloDruga.nth(1).fill("8");
  await wiosloDruga.nth(1).blur();
  await rozwin(kartaPrzysiaduB2);
  const przysiadDruga = kartaPrzysiaduB2.locator(".wiersz-serii").nth(1).locator("input");
  await przysiadDruga.nth(0).fill("85");
  await przysiadDruga.nth(1).fill("6");
  await przysiadDruga.nth(1).blur();
  await s.waitForTimeout(1800);

  // Ekran od nowa — z tego, co telefon ma w pamięci.
  await s.click("#wroc-z-treningu");
  await s.waitForSelector("#ekran-tygodnie:not(.ukryty)");
  await s.locator("#tygodnie .dzien-kafel").first().click();
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  const przysiadWPamieci = await kartaPrzysiaduB2.locator(".wykonanie-opis").innerText();
  sprawdz("seria wpisana bez zasięgu zostaje w telefonie",
    przysiadWPamieci.includes("85"), przysiadWPamieci);

  await s.unroute("**/odczucie");
  bledy.splice(bledyPrzedZasiegiem);
  await s.reload({ waitUntil: "networkidle" });
  await s.waitForTimeout(800);
  const poZasiegu = (await widokBezMaksow()).tygodnie[0].dni[0].cwiczenia;
  const wiosloPoZasiegu = poZasiegu.find((c: any) => c.positionId === "D1-S01").serieWykonane;
  const przysiadPoZasiegu = poZasiegu.find((c: any) => c.positionId === "D1-S03").serieWykonane;
  sprawdz("po powrocie zasięgu obie serie są u trenera",
    wiosloPoZasiegu.length === 2 && wiosloPoZasiegu[1].ciezar === 62.5
    && przysiadPoZasiegu.length === 2 && przysiadPoZasiegu[1].ciezar === 85,
    `wiosło ${JSON.stringify(wiosloPoZasiegu)} · przysiad ${JSON.stringify(przysiadPoZasiegu)}`);

  // ── 25. ciężar ustawiany ręcznie, którego trener nie wpisał ────────
  //
  // Zgłoszone przy „Dead bug izo + OH" (od 24.09 „ręczne ustawienie"):
  // w panelu pole kg stało na wierzchu, a na liście w kolumnie ciężaru
  // wisiał napis z BAZY, pola chowały się pod „+ zapisz, co poszło"
  // i wyglądało, że z listy ciężaru wpisać się nie da.
  const RECZNY = "reczny";
  await api("/api/plany", "POST", { klient: RECZNY, wersja: 1 });
  const idRecznego = (await api("/api/plany")).find((p: any) => p.klient === RECZNY).id;
  const planReczny = (await api(`/api/plany/${idRecznego}`)).zapisany.plan;
  planReczny.sloty[0].cwiczenieId = "EX-0010";   // A1. bój główny
  planReczny.sloty[1].cwiczenieId = "EX-0016";   // B1. akcesorium
  planReczny.sloty[2].cwiczenieId = "EX-0049";   // B2. Dead bug izo + OH — ręcznie
  planReczny.serieMaksymalne = [
    { cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 3 },
    { cwiczenieId: "EX-0016", ciezar: 70, powtorzenia: 5 },
  ];
  await api(`/api/plany/${idRecznego}`, "PUT",
    { plan: planReczny, dataStartu: null, status: "wysłany" });
  const sciezkaRecznego = (await api(`/api/plany/${idRecznego}/link`, "POST")).sciezka;

  await s.goto(`${adres}${sciezkaRecznego}`, { waitUntil: "networkidle" });
  await s.locator("#tygodnie .dzien-kafel").first().click();
  await s.waitForSelector("#ekran-trening:not(.ukryty)");
  const deadBug = s.locator('#cwiczenia [data-position="D1-S03"]');
  await deadBug.scrollIntoViewIfNeeded();
  sprawdz("ręczny ciężar bez wpisu trenera: w kolumnie „dobierz”, nie napis z BAZY",
    (await deadBug.locator(".kolumna-ciezar").innerText()).includes("dobierz")
    && !(await deadBug.innerText()).includes("ręczne ustawienie"),
    (await deadBug.locator(".kolumna-ciezar").innerText()).replace(/\n/g, " "));
  sprawdz("pod spodem jedno zdanie, że ciężar dobiera klient",
    await deadBug.locator(".dobor-wlasny").isVisible());
  const polaDeadBuga = deadBug.locator(".wykonanie-pola");
  sprawdz("pola na kg są na liście od razu, bez szukania „zapisz, co poszło”",
    await polaDeadBuga.isVisible()
    && await polaDeadBuga.locator('input[placeholder="kg"]').count() === 3,
    `${await polaDeadBuga.locator('input[placeholder="kg"]').count()} pól kg`);

  const pierwszy = polaDeadBuga.locator(".wiersz-serii").first().locator("input");
  await pierwszy.nth(0).fill("2");
  await pierwszy.nth(0).blur();
  await pierwszy.nth(1).fill("10");
  await pierwszy.nth(1).blur();
  await s.waitForTimeout(900);
  sprawdz("po pierwszej pełnej serii zdanie znika, a zapis zostaje",
    await deadBug.locator(".dobor-wlasny").count() === 0
    && (await deadBug.locator(".wykonanie-opis").innerText()).includes("2"),
    await deadBug.locator(".wykonanie-opis").innerText());
  const wpisRecznego = (await api(`/api/plany/${idRecznego}`)).zapisany.wykonania
    .find((w: any) => w.positionId === "D1-S03");
  sprawdz("trener dostaje ciężar wpisany na liście",
    wpisRecznego?.serie?.[0]?.ciezar === 2 && wpisRecznego?.serie?.[0]?.powtorzenia === 10,
    JSON.stringify(wpisRecznego?.serie));

  // Z listy prosto do panelu dowolnego ćwiczenia — tu B2, choć A1 i B1
  // nikt jeszcze nie ruszył. W prowadzeniu to samo słowo w kolumnie, a pole
  // kg podpowiada ciężar wpisany przed chwilą na liście — to te same dane.
  const zacznijB2 = deadBug.getByRole("button", { name: "▶ Zacznij to ćwiczenie" });
  sprawdz("każde nietknięte ćwiczenie ma na liście wejście do panelu",
    await zacznijB2.isVisible()
    && await s.locator("#cwiczenia .stan-prowadzenia.start").count() === 3,
    `${await s.locator("#cwiczenia .stan-prowadzenia.start").count()} z 3`);
  await zacznijB2.click();
  await s.waitForSelector("#ekran-seria:not(.ukryty)");
  await s.waitForTimeout(300);
  sprawdz("przycisk otwiera panel od razu na tym ćwiczeniu, nie od początku dnia",
    (await s.locator("#panel").innerText()).includes("Dead bug izo + OH")
    && (await s.locator("#panel .kolumna-seria").innerText()).includes("1"),
    (await s.locator("#panel .kolumna-seria").innerText()).replace(/\n/g, " "));
  sprawdz("w panelu też „dobierz”, a pole kg ma ciężar z listy",
    (await s.locator("#panel .kolumna-ciezar").innerText()).includes("dobierz")
    && await s.locator('#panel .panel-pola input[placeholder="kg"]').inputValue() === "2",
    `${(await s.locator("#panel .kolumna-ciezar").innerText()).replace(/\n/g, " ")} · `
    + `kg: ${await s.locator('#panel .panel-pola input[placeholder="kg"]').inputValue()}`);

  console.log(bledy.length
    ? `\n  błędy w przeglądarce: ${JSON.stringify(bledy.slice(0, 3))}`
    : "\n  błędów w przeglądarce: brak");
  doliczBledy(bledy.length);
});

podsumuj("cała pętla klienta działa");
