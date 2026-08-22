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
  sprawdz("trening pokazuje ćwiczenia z planu", await karty.count() === 2,
    `${await karty.count()} ćwiczenia`);

  // ── 3. ciężar na ekranie to ciężar policzony ──────────────────────
  // Umowa całej aplikacji: klient widzi dokładnie tę liczbę, którą policzył
  // silnik. Rozjazd tutaj znaczy, że ktoś trenuje wg innych liczb niż trener.
  // Aplikacja pisze liczby po polsku, z przecinkiem — porównujemy wartości,
  // nie zapis.
  const naEkranie = await karty.first().locator(".zadanie .ciezar").innerText();
  sprawdz("ciężar na telefonie zgadza się z policzonym",
    Number(naEkranie.replace(",", ".").replace(/[^\d.]/g, "")) === cwiczenie(przedStart, 1).ciezar,
    `${naEkranie} ↔ ${cwiczenie(przedStart, 1).ciezar} kg`);

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

  // ── 11. waga ──────────────────────────────────────────────────────
  const poleWagi = s.locator("#postep input").last();
  await poleWagi.fill("81.5");
  await poleWagi.blur();
  await s.waitForTimeout(600);
  const waga = (await widok()).postep.waga.punkty;
  sprawdz("waga zapisuje się i widać ją u trenera",
    waga.at(-1)?.kg === 81.5, `${waga.length} pomiar(ów), ostatni ${waga.at(-1)?.kg} kg`);

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

  console.log(bledy.length
    ? `\n  błędy w przeglądarce: ${JSON.stringify(bledy.slice(0, 3))}`
    : "\n  błędów w przeglądarce: brak");
  doliczBledy(bledy.length);
});

podsumuj("cała pętla klienta działa");
