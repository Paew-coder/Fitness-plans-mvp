/**
 * Aplikacja klienta — dzisiejszy trening w telefonie.
 *
 * Zasada: na siłowni zasięg bywa żaden, więc nic nie może się zgubić.
 * Każde dotknięcie oceny zapisuje się lokalnie od razu, a wysyłka do serwera
 * czeka w kolejce, aż wróci połączenie.
 */

import { kartaOtwarta, powrotZKarty, przyciskFilmu, zamknijKarte } from "./karta-cwiczenia.js";

const TOKEN = location.pathname.split("/")[2] ?? "";
const KLUCZ_KOLEJKI = `kolejka-${TOKEN}`;
const KLUCZ_WIDOKU = `widok-${TOKEN}`;
const KLUCZ_HISTORII = `historia-${TOKEN}`;
const KLUCZ_INSTALACJI = `instalacja-${TOKEN}`;
const KLUCZ_ZWINIECIA_POMIAROW = `pomiary-zwiniete-${TOKEN}`;
const RZYMSKIE = ["I", "II", "III", "IV", "V"];

let widok = null;
let historia = null;           // wszystkie cykle — dociągana przy otwarciu postępu
let biezacy = null;            // { tydzien, dzien }
const otwarteWykonania = new Set();   // positionId z rozwiniętymi polami „co poszło"

/**
 * Cykl (`planId`), w którym klient zwinął baner „Skąd wziąć ciężary” —
 * albo `null`, gdy baner jest rozwinięty (prośba trenera z 10.10.2026).
 *
 * Pamiętany per cykl, nie na zawsze: nowy plan przynosi nowe ćwiczenia bez
 * ciężarów i wtedy wybór drogi znów jest potrzebny, więc baner wraca cały.
 * Zmienna trzyma stan także wtedy, gdy telefon nie da zapisać nic do pamięci
 * (tryb prywatny) — inaczej każde przerysowanie rozwijałoby baner z powrotem.
 */
/** Cykl i jego reset — po „↺ Resetuj plan” baner wraca rozwinięty, jak przy nowym planie. */
const kluczZwiniecia = () => `${widok?.planId}${widok?.resetOd ? `@${widok.resetOd}` : ""}`;
let pomiaryZwinieteW = (() => {
  try { return localStorage.getItem(KLUCZ_ZWINIECIA_POMIAROW); } catch { return null; }
})();

const $ = (s) => document.querySelector(s);
const el = (tag, klasa, tekst) => {
  const e = document.createElement(tag);
  if (klasa) e.className = klasa;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
};
const liczba = (n) => Number(n).toFixed(1).replace(".", ",").replace(",0", "");

const TEKST_OFFLINE = "Offline — zapiszę, gdy wróci zasięg";
/** Tabela RPE kończy się na piętnastu powtórzeniach — tyle samo, co POWT_MAX w silniku. */
const MAKS_POWTORZEN = 15;

// ── kolejka offline ────────────────────────────────────────────────
const kolejka = {
  wczytaj: () => JSON.parse(localStorage.getItem(KLUCZ_KOLEJKI) || "[]"),
  zapisz: (k) => localStorage.setItem(KLUCZ_KOLEJKI, JSON.stringify(k)),
  dodaj(zadanie) {
    const k = this.wczytaj();
    k.push(zadanie);
    this.zapisz(k);
  },
  /**
   * Opróżnianie kolejki. Rozróżnienie, które tu stoi, jest ważniejsze niż
   * wygląda: **brak sieci** znaczy „spróbuj później", a **odmowa serwera**
   * znaczy „to się nigdy nie uda". Wcześniej jedno i drugie kończyło się tak
   * samo — zadanie zostawało na czele kolejki, a każda kolejna ocena lądowała
   * za nim i nie wychodziła nigdy. Klient oceniał, ekran potwierdzał, a do
   * trenera nie docierało już nic.
   */
  async wyslij() {
    let k = this.wczytaj();
    let odrzucone = 0;
    let powodOdmowy = null;   // to, co serwer napisał przy pierwszej odmowie
    /*
     * Widok z serwera przyjmujemy dopiero po opróżnieniu kolejki.
     *
     * Odpowiedź na zapis niesie stan sprzed zapisów, które czekają za nim.
     * Przyjmowana od razu zdejmowała z telefonu serię wpisaną przed chwilą —
     * a gdy następny zapis nie przeszedł (zasięg zgasł), telefon zostawał
     * z tym nieaktualnym widokiem. Kolejna seria tego ćwiczenia zapisywała
     * się wtedy na starej liście i poprzednia przepadała, także u trenera.
     * Odpowiedź na ostatni zapis zna wszystkie wcześniejsze.
     */
    let ostatniWidok = null;
    while (k.length > 0) {
      const zadanie = k[0];
      let odp;
      try {
        odp = await fetch(`/api/klient/${TOKEN}${zadanie.sciezka}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(zadanie.dane),
        });
      } catch {
        return { wyslane: false, odrzucone, powodOdmowy };   // brak sieci — próbujemy później
      }
      if (odp.ok) {
        const swiezy = await odp.json();
        // Odpowiedź bez planu znaczy „zapisane, ale trener właśnie poprawia
        // cykl". Podmiana widoku na taką odpowiedź skasowałaby klientowi
        // z pamięci trening, który ma przed sobą na ekranie.
        if (swiezy?.planId) ostatniWidok = swiezy;
      } else if (odp.status >= 500) {
        return { wyslane: false, odrzucone, powodOdmowy };   // serwer ma zły dzień, nie zadanie
      } else {
        // 4xx — tego zadania nie da się zapisać, wyrzucamy je. Ale zabieramy
        // ze sobą powód: serwer wie, dlaczego odmówił, i to jedyne miejsce,
        // w którym da się to klientowi powiedzieć.
        odrzucone++;
        if (powodOdmowy === null) {
          powodOdmowy = await odp.json().then((b) => b?.blad ?? null).catch(() => null);
        }
      }
      k = this.wczytaj().slice(1);
      this.zapisz(k);
    }
    if (ostatniWidok) {
      widok = ostatniWidok;
      zapiszWidokLokalnie();
    }
    return { wyslane: true, odrzucone, powodOdmowy };
  },
};

function zapiszWidokLokalnie() {
  try { localStorage.setItem(KLUCZ_WIDOKU, JSON.stringify(widok)); } catch { /* pełna pamięć */ }
}

function pokazStanPolaczenia(online) {
  $("#stan-polaczenia").classList.toggle("ukryty", online);
}

/**
 * Trwające opróżnianie kolejki. Naraz może trwać tylko jedno.
 *
 * Bez tego dwa szybkie zapisy — ciężar, a zaraz po nim powtórzenia —
 * opróżniały kolejkę równolegle: te same zadania szły dwa razy, a odpowiedź
 * na starsze przychodziła czasem później i nadpisywała świeższy widok.
 * Na ekranie wyglądało to tak, jakby wpis nie zadziałał: seria, która przed
 * chwilą ustaliła ciężar, wracała do „dobierz ciężar", bo karta rysowała się
 * z odpowiedzi sprzed kalibracji. Łańcuch zamiast równoległości: każde
 * opróżnianie czeka na poprzednie, więc ostatnia odpowiedź jest zawsze
 * odpowiedzią na ostatni zapis.
 */
let oproznianie = Promise.resolve();

async function synchronizuj(odswiez = true) {
  const teraz = oproznianie.then(() => kolejka.wyslij());
  oproznianie = teraz.catch(() => {});
  const { wyslane, odrzucone, powodOdmowy } = await teraz;
  pokazStanPolaczenia(wyslane);
  if (odrzucone > 0) pokazOdrzucone(odrzucone, powodOdmowy);
  if (wyslane && odswiez) rysuj();
}

/**
 * Zadania, których serwer nie przyjmie nigdy. Milczenie byłoby tu najgorsze:
 * klient ma prawo wiedzieć, że tego u trenera nie ma.
 *
 * Powód mówi serwer, my go tylko przepisujemy. Wcześniej stało tu na sztywno
 * „trener zmienił plan" — i przy serii maksymalnej na 16 powtórzeń było to
 * po prostu nieprawdą. Klient dostawał wyjaśnienie, które nie miało nic
 * wspólnego z tym, co zrobił, i nie miał jak się domyślić, że chodzi
 * o liczbę powtórzeń.
 */
function pokazOdrzucone(ile, powod) {
  const pasek = $("#stan-polaczenia");
  pasek.textContent = powod
    ? powod
    : (ile === 1
      ? "Jeden wpis nie został zapisany — trener zmienił plan."
      : `${ile} wpisów nie zostało zapisanych — trener zmienił plan.`);
  pasek.classList.remove("ukryty");
  setTimeout(() => {
    pasek.textContent = TEKST_OFFLINE;
    pokazStanPolaczenia(navigator.onLine);
  }, powod ? 9000 : 6000);
}

addEventListener("online", synchronizuj);
addEventListener("offline", () => pokazStanPolaczenia(false));

// ── wysyłanie z natychmiastowym efektem lokalnym ───────────────────
//
// `odswiez: false` zostawia ekran w spokoju. Potrzebne tam, gdzie klient
// właśnie pisze: przerysowanie podmieniłoby pole pod palcem i na telefonie
// zamknęłoby klawiaturę w połowie wpisywania.
async function wyslij(sciezka, dane, zmienLokalnie, { odswiez = true } = {}) {
  zmienLokalnie();
  zapiszWidokLokalnie();
  if (odswiez) rysuj();
  // Zadanie zapamiętuje cykl, którego dotyczy. Klient bywa offline przez kilka
  // dni; gdy w międzyczasie trener wyśle kolejny plan, ocena ma trafić do tego
  // treningu, który się faktycznie odbył, a nie do nowego cyklu.
  // I znacznik resetu planu, który telefon widział — zapis sprzed „↺ Resetuj
  // plan” serwer odrzuci, zamiast przywrócić wyczyszczony trening.
  kolejka.dodaj({ sciezka, dane: { ...dane, planId: widok?.planId ?? null, resetOd: widok?.resetOd ?? null } });
  await synchronizuj(odswiez);
}

// ── ekrany a przycisk „wstecz" ─────────────────────────────────────
//
// Aplikacja ma jeden adres i pięć ekranów przełączanych w miejscu. Bez tego,
// co niżej, systemowe „wstecz" nie cofało między ekranami, tylko wychodziło
// ze strony — a w aplikacji dodanej do ekranu głównego po prostu ją zamykało.
// Klient w środku treningu dotyka „wstecz" odruchowo, żeby wrócić do listy
// dni; na telefonie to ruch wykonywany bez zastanowienia, więc musi znaczyć
// to, co znaczy wszędzie indziej.
//
// Głębokość jest zawsze jedna: każdy ekran otwiera się z listy tygodni i do
// niej wraca, więc jeden wpis w historii wystarczy na cały ruch po aplikacji.
// „Wstecz" z samej listy wychodzi ze strony — i tak ma być. Zatrzymywanie
// klienta w aplikacji na siłę byłoby gorsze od błędu, który to naprawia.
const EKRAN_GLOWNY = "#ekran-tygodnie";

/** Co trzeba przygotować przy wejściu — tak samo z dotknięcia, jak z historii. */
const PRZYGOTUJ = {
  // Lista i serie maksymalne rysują się od nowa przy każdym wejściu. Zapisy
  // z treningu idą bez przerysowania (klient pisze), a jeden z nich potrafi
  // zmienić to, co widać gdzie indziej: seria przy ćwiczeniu bez 1RM ustala
  // je i baner „brakuje ciężarów" ma zniknąć, zanim klient na niego spojrzy.
  [EKRAN_GLOWNY]: () => rysuj({ pomiary: false }),
  "#ekran-pomiary": () => rysujPomiary(),
  "#ekran-trening": () => rysujTrening(),
  "#ekran-seria": () => rysujSerie(),
  "#ekran-postep": async () => { await wczytajHistorie(); rysujPostep(); },
};

const naPodekranie = () =>
  Boolean(history.state?.ekran) && history.state.ekran !== EKRAN_GLOWNY;

function pokazEkran(id) {
  for (const e of document.querySelectorAll(".ekran")) e.classList.add("ukryty");
  // Znak zapytania nie jest ostrożnością na wszelki wypadek: gdy zamiast planu
  // stoi komunikat („trener przygotowuje plan"), ekranów nie ma w ogóle,
  // a „wstecz" nadal da się dotknąć.
  $(id)?.classList.remove("ukryty");
  scrollTo(0, 0);
}

/** Rysuje ekran. Historii nie dotyka — od tego są `otworz` i `wroc`. */
function ustawEkran(id) {
  // Po powrocie z treningu nie ma już wybranego dnia, więc „w przód" pokazałoby
  // pusty ekran. Zamiast tego wracamy do listy.
  const cel = ["#ekran-trening", "#ekran-seria"].includes(id) && !biezacy ? EKRAN_GLOWNY : id;
  if (cel === EKRAN_GLOWNY) biezacy = null;
  pokazEkran(cel);
  PRZYGOTUJ[cel]?.();
  return cel;
}

/** Otwarcie ekranu — zostawia ślad w historii, żeby „wstecz" miało dokąd wrócić. */
function otworz(id) {
  const glebiej = !naPodekranie();
  const wpis = { ekran: ustawEkran(id) };
  if (glebiej && wpis.ekran !== EKRAN_GLOWNY) history.pushState(wpis, "");
  else history.replaceState(wpis, "");
}

/** Powrót do listy tygodni — tą samą drogą, co systemowe „wstecz". */
function wroc() {
  if (naPodekranie()) history.back();   // resztę dorysuje `popstate`
  else ustawEkran(EKRAN_GLOWNY);
}

addEventListener("popstate", (e) => {
  // Karta ćwiczenia z filmem (09.10.2026) leży nad ekranem i ma własny wpis
  // w historii. „Wstecz” przy otwartej karcie zamyka tylko ją, a cofnięcie
  // zrobione przez samą kartę nie przerysowuje ekranu — inaczej przepadłyby
  // wpisane, jeszcze niezapisane ciężary i powtórzenia.
  if (kartaOtwarta()) { zamknijKarte({ zHistorii: true }); return; }
  if (powrotZKarty()) return;
  const cel = ustawEkran(e.state?.ekran ?? EKRAN_GLOWNY);
  // Gdy trafiliśmy gdzie indziej, niż mówił wpis (trening bez wybranego dnia),
  // prostujemy wpis — inaczej kolejne „wstecz" liczyłoby ekran, którego nie ma.
  if (cel !== e.state?.ekran) history.replaceState({ ekran: cel }, "");
});

// Wejściowy wpis dostaje własny stempel, żeby `popstate` wiedział, gdzie wylądował.
history.replaceState({ ekran: EKRAN_GLOWNY }, "");

/** `pomiary: false` zostawia pola serii maksymalnych w spokoju — patrz `wyslijPomiar` niżej. */
function rysuj({ pomiary = true } = {}) {
  if (!widok) return;
  // Samo imię klienta. „Marek X 1.0" — numer wersji był dla trenera,
  // klientowi nic nie mówił; cykl stoi w podtytule (26.09.2026).
  $("#tytul").textContent = widok.klient;

  // Bez ćwiczeń, przy których nie ma czego mierzyć (masa ciała, czas…).
  // Liczone razem z nimi nie schodziły nigdy do zera — i baner o brakujących
  // ciężarach wisiał przez cały cykl w każdym planie z choćby jednym plankiem.
  const brakuje = widok.doZmierzenia.filter((p) => !p.oneRM && !p.bezSerii);
  $("#pomiary-baner").classList.toggle("ukryty", brakuje.length === 0);
  $("#pomiary-baner").open = pomiaryZwinieteW !== kluczZwiniecia();
  // Zwinięty baner to jedna linijka — liczba zostaje, żeby było widać, że
  // sprawa nie jest zamknięta. Krótko, jak „0 z 1” przy tygodniu: dłuższe
  // „brakuje w 6 ćwiczeniach” łamało się na telefonie w pół frazy.
  // Rozwinięty mówi to samo pełnym zdaniem niżej.
  $("#pomiary-licznik").textContent = `${brakuje.length} do ustalenia`;
  $("#pomiary-tresc").textContent = brakuje.length === 1
    ? "W jednym ćwiczeniu nie znam jeszcze Twojego ciężaru. Wybierz, jak go ustalić."
    : `W ${brakuje.length} ćwiczeniach nie znam jeszcze Twoich ciężarów. `
      + "Wybierz, jak je ustalić.";
  if (!$("#rpe-baner").firstChild) $("#rpe-baner").append(objasnienieRPE());
  const zrobione = widok.tygodnie.flatMap((t) => t.dni).filter((d) => d.ukonczony).length;
  const wszystkie = widok.tygodnie.flatMap((t) => t.dni).length;
  $("#podtytul").textContent = `Cykl ${widok.wersja} · ${zrobione} z ${wszystkie} treningów za Tobą`;

  // Domknięcie cyklu. Ostatni trening kończył się dotąd tak samo jak każdy
  // inny — lista samych ptaszków i cisza. To jest ta chwila, w której klient
  // ma prawo wiedzieć, że skończył i że trener już o tym wie.
  const domkniety = wszystkie > 0 && zrobione >= wszystkie;
  $("#baner-koniec").classList.toggle("ukryty", !domkniety);
  if (domkniety) {
    const serie = widok.tygodnie
      .flatMap((t) => t.dni).flatMap((d) => d.cwiczenia)
      .filter((c) => c.ciezarWykonany != null).length;
    $("#koniec-tresc").textContent =
      `Sześć tygodni, ${wszystkie} treningów`
      + (serie ? `, ${serie} zapisanych serii` : "")
      + ". Trener widzi, że skończyłeś, i przygotuje kolejny cykl — "
      + "ten sam link pokaże go, gdy będzie gotowy.";
  }

  rysujTygodnie();
  rysujInstalacje();
  if (biezacy) rysujTrening();
  // Panel prowadzenia przerysowujemy tylko wtedy, gdy klient w nim akurat nie
  // pisze: podmiana pola pod palcem zamyka na telefonie klawiaturę w połowie
  // wpisywanej liczby.
  if (biezacy && !$("#ekran-seria").classList.contains("ukryty")
    && !$("#ekran-seria").contains(document.activeElement)) rysujSerie();
  if (pomiary) rysujPomiary();
  rysujModuly();
  if (pomiary) rysujPostep();
}

/**
 * Postęp klienta. Wszystko liczy się z tego, co sam wpisał przy ćwiczeniach —
 * nie ma tu osobnego formularza do wypełniania poza wagą.
 */
/**
 * Historia przez wszystkie cykle.
 *
 * Pobierana osobno i tylko przy otwarciu ekranu postępu: widok treningu wraca
 * z serwera przy każdym dotknięciu oceny, a historii nie ma po co przeliczać
 * dwadzieścia razy w trakcie jednego treningu. Zapisujemy ją lokalnie, więc
 * przy następnym wejściu widać ją od razu, także bez zasięgu.
 */
async function wczytajHistorie() {
  const zapamietana = localStorage.getItem(KLUCZ_HISTORII);
  if (zapamietana && !historia) {
    try { historia = JSON.parse(zapamietana); } catch { /* uszkodzone — pobierzemy */ }
  }
  try {
    const odp = await fetch(`/api/klient/${TOKEN}/historia`);
    if (odp.ok) {
      historia = await odp.json();
      try { localStorage.setItem(KLUCZ_HISTORII, JSON.stringify(historia)); } catch { /* pełna pamięć */ }
    }
  } catch { /* brak sieci — zostaje zapamiętana */ }
}

/** `100 → 112,5 → 125` */
function ciagLiczb(wartosci) {
  return wartosci.map((w) => liczba(w)).join(" → ");
}

function rysujHistorie(kontener) {
  if (!historia || historia.razem.cykli < 2) return;

  const blok = el("div", "cwiczenie");
  blok.append(el("div", "modul-tytul", "Przez wszystkie cykle"));

  const miesiace = historia.razem.dniWspolpracy === null
    ? null : Math.round(historia.razem.dniWspolpracy / 30);
  const czesci = [`${historia.razem.cykli} cykle`];
  if (miesiace) czesci.push(`${miesiace} ${miesiace === 1 ? "miesiąc" : "miesięcy"}`);
  if (historia.razem.zaplanowanych > 0) {
    czesci.push(`${historia.razem.ukonczonych} z ${historia.razem.zaplanowanych} treningów`);
  }
  blok.append(el("div", "modul-poziom", czesci.join(" · ")));

  if (historia.cwiczenia.length === 0) {
    blok.append(el("p", "brama",
      "Gdy to samo ćwiczenie wróci w kolejnym cyklu, zobaczysz tu, jak zmienił się ciężar."));
  }
  for (const c of historia.cwiczenia) {
    const w = el("div", "modul-blok");
    w.append(el("span", "nazwa", c.nazwa));
    const zmiana = c.zmianaProc === null ? ""
      : `  (${c.zmianaProc > 0 ? "+" : ""}${String(c.zmianaProc).replace(".", ",")}%)`;
    w.append(el("span", "tresc", `${ciagLiczb(c.punkty.map((p) => p.oneRM))} kg${zmiana}`));
    blok.append(w);
  }
  blok.append(el("p", "brama", "Szacowany ciężar maksymalny na wejściu w każdy cykl."));
  kontener.append(blok);
}

function rysujPostep() {
  const p = widok.postep;
  const kontener = $("#postep");
  kontener.replaceChildren();
  if (!p) return;

  rysujHistorie(kontener);

  // frekwencja
  const f = el("div", "cwiczenie");
  f.append(el("div", "modul-tytul", "Frekwencja"));
  f.append(el("div", "modul-poziom",
    `${p.frekwencja.ukonczonych} z ${p.frekwencja.zaplanowanych} treningów`));
  for (const t of p.frekwencja.tygodnie) {
    const w = el("div", "modul-blok");
    w.append(el("span", "nazwa", `Tydzień ${t.numer ?? t.tydzien}${dopisekTygodnia(t.rodzaj)}`));
    const kropki = el("span", "tresc kropki");
    for (let i = 0; i < t.zDnia; i++) {
      kropki.append(el("span", `kropka ${i < t.ukonczonych ? "zrobiona" : ""}`, "●"));
    }
    w.append(kropki);
    f.append(w);
  }
  kontener.append(f);

  // waga
  //
  // Zgłoszone z testów: wpisanej wagi nie dało się zatwierdzić. Zapis szedł
  // dopiero po stuknięciu obok pola — nic o tym nie mówiło — a po nim pole
  // się czyściło, u góry dalej stało „—" i wyglądało to, jakby wpis zniknął.
  // Teraz jest przycisk (i Enter), a zapisana waga pokazuje się od razu.
  const waga = el("div", "cwiczenie");
  waga.append(el("div", "modul-tytul", "Waga ciała"));
  const ostatnia = p.waga.punkty.at(-1);
  const poziom = el("div", "modul-poziom", ostatnia
    ? `${liczba(ostatnia.kg)} kg${p.waga.zmianaKg ? `  (${zeZnakiem(p.waga.zmianaKg)} kg)` : ""}`
    : "—");
  waga.append(poziom);
  const formularz = el("form", "pole-wagi");
  const wKg = el("input");
  wKg.type = "number";
  wKg.inputMode = "decimal";
  wKg.min = "0";
  wKg.step = "0.1";
  wKg.placeholder = "np. 78,5";
  wKg.setAttribute("aria-label", "Dzisiejsza waga w kg");
  const zapiszWage = el("button", "glowny", "Zapisz");
  zapiszWage.type = "submit";
  formularz.append(wKg, el("span", "razy", "kg"), zapiszWage);
  const potwierdzenie = el("p", "potwierdzenie-wagi ukryty");
  formularz.onsubmit = (e) => {
    e.preventDefault();
    const kg = Number(String(wKg.value).replace(",", ".")) || 0;
    // Te same granice co na serwerze — lepiej powiedzieć przy polu, niż
    // żeby zapis odbił się od serwera bez słowa wyjaśnienia.
    if (kg < 20 || kg > 400) {
      potwierdzenie.textContent = "Wpisz wagę w kilogramach, np. 78,5.";
      potwierdzenie.classList.remove("ukryty");
      potwierdzenie.classList.add("blad");
      wKg.focus();
      return;
    }
    wyslij("/waga", { kg }, () => {
      // Dzień lokalny telefonu, nie UTC. Ważenie o wpół do pierwszej w nocy
      // lądowało pod wczorajszą datą, bo w UTC to jeszcze wczoraj — a serwer
      // zapisywał je pod dzisiejszą. Na ekranie pojawiały się dwa wpisy.
      const dzisiaj = new Date().toLocaleDateString("sv-SE");
      p.waga.punkty = [...p.waga.punkty.filter((x) => x.data !== dzisiaj), { data: dzisiaj, kg }];
    }, { odswiez: false });
    wKg.value = "";
    wKg.blur();
    poziom.textContent = `${liczba(kg)} kg`;
    potwierdzenie.textContent = `✓ Zapisano: ${liczba(kg)} kg · dziś`;
    potwierdzenie.classList.remove("ukryty", "blad");
  };
  waga.append(formularz, potwierdzenie);
  waga.append(el("p", "brama",
    "Wpisz swoją dzisiejszą wagę — najlepiej zmierzoną rano, po przebudzeniu."));
  if (p.waga.punkty.length > 1) {
    waga.append(el("p", "brama", p.waga.punkty
      .slice(-6)
      .map((x) => `${x.data.slice(5)} ${liczba(x.kg)}`)
      .join("  ·  ")));
  }
  kontener.append(waga);

  // ćwiczenia
  //
  // To zdanie stało wcześniej luzem pod kartą wagi — i czytało się jak jej
  // podpis. „Waga" znaczy wtedy dwie różne rzeczy w odległości dwóch linijek:
  // wagę ciała w polu wyżej i ciężar na sztandze w zdaniu niżej. Pierwsze
  // pytanie trenera po otwarciu tego ekranu brzmiało dokładnie „o co tu chodzi
  // z tą wagą". Zdanie dostaje więc własną kartę z własnym tytułem.
  if (p.cwiczenia.length === 0) {
    const pusta = el("div", "cwiczenie");
    pusta.append(el("div", "modul-tytul", "Ciężary na ćwiczeniach"));
    pusta.append(el("p", "brama",
      "Wpisuj przy ćwiczeniach, ile faktycznie podniosłeś — tutaj zobaczysz, jak to rośnie."));
    kontener.append(pusta);
    return;
  }
  for (const c of p.cwiczenia) {
    const karta = el("div", "cwiczenie");
    karta.append(el("div", "modul-tytul", c.nazwa));
    // Nagłówek z siły (szacowane 1RM), nie z kilogramów na sztandze — te
    // zmienia sam plan. Przy jednym tygodniu nie ma z czym porównać, więc
    // zamiast „bez zmiany" mówimy wprost, że to pierwszy pomiar.
    //
    // Liczą się tylko tygodnie z wpisanym ciężarem i powtórzeniami. Zgłoszone
    // z testów: „Pierwszy pomiar" przy ćwiczeniu robionym już wcześniej —
    // wtedy tylko ocenionym, bez serii. Stąd zdanie, co się tu liczy.
    //
    // Ciężar ustawiany ręcznie (bez1RM) porównuje same kilogramy.
    const jedenTydzien = (c.tygodni ?? 1) < 2;
    const [od, do_] = c.bez1RM
      ? [c.ciezarPierwszy, c.ciezarOstatni] : [c.oneRMPierwszy, c.oneRMOstatni];
    const co = c.bez1RM ? "Ciężar" : "1RM ≈";
    karta.append(el("div", "modul-poziom", jedenTydzien
      ? "Na razie wpisy z jednego tygodnia — zmianę zobaczysz po kolejnym"
      : od === do_
        ? `${co} ${liczba(do_)} kg — bez zmiany`
        : `${co} ${liczba(od)} → ${liczba(do_)} kg`
          + (!c.bez1RM && c.zmiana1RMProc != null ? `  (${zeZnakiem(c.zmiana1RMProc)}%)` : "")));
    if (jedenTydzien) {
      karta.append(el("p", "drobne",
        "Liczą się tygodnie z wpisanym ciężarem i powtórzeniami — sama ocena ich nie ma."));
    }
    for (const punkt of c.punkty) {
      const w = el("div", "modul-blok");
      w.append(el("span", "nazwa",
        `Tydzień ${punkt.numer ?? punkt.tydzien}${dopisekTygodnia(punkt.rodzaj)}`));
      w.append(el("span", "tresc", `${liczba(punkt.ciezar)} kg × ${punkt.powtorzenia}`
        + (punkt.oneRM != null ? `  ·  1RM ≈ ${liczba(punkt.oneRM)} kg` : "")));
      karta.append(w);
    }
    kontener.append(karta);
  }
}

const zeZnakiem = (n) => `${n > 0 ? "+" : ""}${liczba(n)}`;

/**
 * Oddech i bieg — to, co klient robi między treningami na siłowni.
 * Trener wypełnia dane w konsoli; tutaj są tylko do czytania.
 */
function rysujModuly() {
  const m = widok.moduly;
  const dawka = m?.oddech?.dawka ?? null;
  const tygodnie = m?.bieg?.tygodnie ?? [];
  const jest = Boolean(dawka) || tygodnie.length > 0;

  $("#pokaz-moduly").classList.toggle("ukryty", !jest);
  const kontener = $("#moduly");
  kontener.replaceChildren();
  if (!jest) return;

  if (dawka) kontener.append(kartaOddechu(dawka, m.oddech));

  if (tygodnie.length > 0) {
    // Zasady z arkusza (BIEG) jednym akapitem — raz, nad tygodniami.
    kontener.append(el("p", "modul-wstep",
      "Biegnij czas, nie kilometry — dystans to szacunek. Tempo jest celem, tętno podajemy "
      + "tylko orientacyjnie. Jeśli na biegu spokojnym nie da się mówić pełnym zdaniem, zwolnij "
      + "niezależnie od zegarka. Tydzień 4 jest celowo lżejszy."));
  }
  // Rozwinięty tydzień, w którym klient jest w planie siłowym; reszta zwinięta.
  const biezacy = Math.min(pierwszyNiezrobiony()?.tydzien ?? 1, 6);
  for (const t of tygodnie) {
    const karta = el("details", "cwiczenie modul-bieg");
    karta.open = t.tydzien === biezacy;
    const naglowek = el("summary", "modul-tytul");
    naglowek.append(el("span", "", `Bieg · tydzień ${t.tydzien}${t.tydzien === 4 ? " (lżejszy)" : ""}`),
      el("span", "modul-ile", `${t.jednostki.length} ${odmiana(t.jednostki.length, ["bieg", "biegi", "biegów"])}`
        + ` · ${t.jednostki.reduce((a, j) => a + j.minutRazem, 0)} min`));
    karta.append(naglowek);
    for (const j of t.jednostki) karta.append(jednostkaBiegu(j));
    kontener.append(karta);
  }
}

/** „05:15" → „5:15". */
const tempoKrotko = (t) => (t || "").replace(/^0/, "");

/**
 * Jedna jednostka biegowa — od 27.09.2026 rozpisana na tempie i czasie
 * (trener): nazwa i czas, duże tempo części głównej, przebieg krok po kroku,
 * a drobno szacowany dystans i tętno „orientacyjnie".
 */
function jednostkaBiegu(j) {
  const w = el("div", "jednostka-biegu");
  const gora = el("div", "jb-gora");
  gora.append(el("span", "nazwa", j.typ), el("span", "czas", `${j.minutRazem} min`));
  w.append(gora);
  if (j.tempoTekst) {
    const tempo = el("div", "jb-tempo");
    tempo.append(el("span", "duze", tempoKrotko(j.tempoTekst)), el("span", "jednostka", " /km"));
    if (j.powtorzen) tempo.append(el("span", "dopisek", " na odcinkach"));
    w.append(tempo);
  }
  if (j.kroki?.length > 1) {
    const lista = el("ol", "jb-kroki");
    for (const k of j.kroki) lista.append(el("li", "", k));
    w.append(lista);
  }
  const drobne = [];
  if (j.powtorzen && j.tempoSpokojneTekst) {
    drobne.push(`rozgrzewka, trucht i schłodzenie: ${tempoKrotko(j.tempoSpokojneTekst)} /km`);
  }
  if (j.dystansKm !== null) drobne.push(`≈ ${liczba(j.dystansKm)} km`);
  // Bez wieku i bez zmierzonego HR max tętna nie da się policzyć — to zwykłe
  // niedopełnione pole, nie awaria. Pytamy o liczbę, bo to ona ma się pokazać.
  if (j.strefa?.odUd != null) drobne.push(`tętno orientacyjnie ${j.strefa.odUd}–${j.strefa.doUd}`);
  if (drobne.length) w.append(el("div", "jb-drobne", drobne.join(" · ")));
  return w;
}

/**
 * Trening oddechowy — dawka z testu TWOT i przy każdym kroku to, JAK go
 * zrobić: teksty trenera z arkusza (zakładka ODDECH). Do 27.09.2026 klient
 * widział samą dawkę w skrótach („Breathe Light, głód powietrza 3/10") i nie
 * było wiadomo, o co chodzi.
 */
function kartaOddechu(dawka, oddech) {
  const o = oddech.objasnienia ?? {};
  const karta = el("div", "cwiczenie modul-oddech");
  karta.append(el("div", "modul-tytul", "Trening oddechowy"));
  if (dawka.zatrzymane) {
    karta.append(el("p", "brama", dawka.brama));
    return karta;
  }
  if (o.wstep) karta.append(el("p", "modul-wstep", o.wstep));
  karta.append(el("div", "modul-poziom", dawka.czestotliwosc.replace("×/tydz", "× w tygodniu")));
  const twot = oddech.wejscie?.twot;
  karta.append(el("div", "drobne",
    `Poziom: ${dawka.poziom}${twot != null ? ` · Twój wynik TWOT: ${liczba(twot)} s` : ""}`));

  const kroki = el("ol", "kroki-oddechu");
  for (const [litera, nazwa, tresc] of [
    ["A", "Rozgrzewka", dawka.blokA], ["B", "Praca", dawka.blokB], ["C", "Wyciszenie", dawka.blokC],
  ]) {
    const k = el("li", "krok-oddechu");
    k.append(el("div", "krok-nazwa", nazwa), el("div", "krok-dawka", tresc));
    // Technika tylko tam, gdzie jest co robić — „bez bezdechów" jej nie ma.
    if (!/^bez /.test(tresc)) {
      for (const t of o.technika?.[litera] ?? []) {
        const p = el("p", "krok-jak");
        p.append(el("strong", "", `${t.nazwa}: `), document.createTextNode(t.tekst));
        k.append(p);
      }
    }
    kroki.append(k);
  }
  karta.append(kroki);
  karta.append(el("p", "brama", dawka.brama));

  if (o.przerwij?.length) {
    const stop = el("div", "oddech-stop");
    stop.append(el("strong", "", "Przerwij, gdy: "), document.createTextNode(o.przerwij.join(" ")));
    karta.append(stop);
  }
  for (const [tytul, punkty] of [
    ["Jak zmierzyć TWOT?", [...(o.pomiar ?? []), ...(o.coMowi ?? [])]],
    ["Kiedy powtórzyć test?", o.retest ?? []],
  ]) {
    if (!punkty.length) continue;
    const d = el("details", "rpe");
    d.append(el("summary", "", tytul));
    const lista = el("ul", "punkty");
    for (const p of punkty) lista.append(el("li", "", p));
    d.append(lista);
    karta.append(d);
  }
  return karta;
}

// ── dobieranie ciężaru według RPE ──────────────────────────────────
//
// Druga droga na start cyklu: bez serii maksymalnych. Klient bierze się od
// razu za trening, dobiera ciężar tak, żeby zgadzał się z RPE z planu, i wpisuje
// serię — serwer liczy z niej 1RM, a z niego resztę planu (`kalibracja.ts`).
//
// Cała ta droga stoi na jednym warunku: klient musi wiedzieć, co znaczy
// „RPE 8". Stąd objaśnienie przy każdym miejscu, w którym ma dobrać ciężar —
// zwinięte, bo po pierwszym treningu nikt go już nie potrzebuje.

/**
 * Ile powtórzeń w zapasie przy danym RPE: 8 → „2", 7,5 → „2–3".
 * To definicja skali, nie reguła planu — dlatego może stać w telefonie.
 */
const wZapasie = (rpe) => {
  const z = 10 - rpe;
  return Number.isInteger(z) ? String(z) : `${Math.floor(z)}–${Math.ceil(z)}`;
};

/** Jedno zdanie: jaki ciężar wziąć, żeby zgadzał się z planem. */
function jakDobrac(powtorzenia, rpe) {
  if (rpe >= 10) return `Weź taki ciężar, żeby ${powtorzenia}. powtórzenie było ostatnim, `
    + "jakie zrobisz czysto.";
  return `Weź taki ciężar, żeby po ${powtorzenia}. powtórzeniu mieć jeszcze `
    + `${wZapasie(rpe)} w zapasie.`;
}

/** „Co to jest RPE?" — zwinięte objaśnienie skali. */
function objasnienieRPE() {
  const d = el("details", "rpe");
  d.append(el("summary", "", "Co to jest RPE?"));
  d.append(el("p", "", "RPE mówi, jak ciężka ma być seria. Najprościej liczyć, "
    + "ile powtórzeń zostaje Ci w zapasie — ile jeszcze zrobiłbyś czysto, "
    + "gdybyś nie przerwał."));
  const tabela = el("div", "rpe-tabela");
  for (const [rpe, opis] of [
    ["10", "nic w zapasie — więcej się nie da"],
    ["9", "1 w zapasie"],
    ["8", "2 w zapasie"],
    ["7", "3 w zapasie"],
    ["6", "4 i więcej"],
  ]) {
    tabela.append(el("span", "rpe-liczba", `RPE ${rpe}`), el("span", "", opis));
  }
  d.append(tabela);
  d.append(el("p", "", "Połówki leżą pomiędzy: RPE 7,5 to 2–3 w zapasie."));
  d.append(el("p", "", "Przykład: „8 powt. · RPE 8” — ciężar, przy którym po ósmym "
    + "powtórzeniu czujesz, że dwa kolejne jeszcze byś zrobił. Wyszło za lekko? "
    + "Dołóż w następnej serii i wpisz ją — policzę od nowa."));
  return d;
}

/** Dla ćwiczenia bez ciężaru: jak go dobrać i co się stanie z wpisaną serią. */
function wskazowkaDoboru(c) {
  const blok = el("div", "dobor");
  blok.append(el("p", "", `${jakDobrac(c.powtorzenia, c.rpe)} `
    + "Wpisz, co podniosłeś — z tej serii policzę Twoje ciężary na cały plan."));
  blok.append(objasnienieRPE());
  return blok;
}

/** Na panelu stoi „dobierz” — ciężaru z planu jeszcze nie ma, klient go wybiera. */
const dobieraCiezar = (c) => Boolean(c.dobierzCiezar || c.ciezarWybieraKlient);

/** Zamiast „Za ciężko albo za lekko?” przy dobieraniu ciężaru — co zrobić zamiast oceny. */
const bezOcenyPrzyDoborze = () => el("p", "drobne bez-oceny-doboru",
  "Za lekko albo za ciężko? Nic nie klikaj — zmień ciężar w następnej serii i wpisz go. "
  + "Ocena pojawi się, gdy ciężar będzie już ustalony.");

/** Czy przy ćwiczeniu jest już pełna seria — ta, z której policzymy ciężar. */
const seriaWpisana = (c) =>
  (c.serieWykonane ?? []).some((x) => x?.ciezar > 0 && x?.powtorzenia > 0)
  || (c.ciezarWykonany > 0 && c.powtorzeniaWykonane > 0);

/**
 * Instrukcja doboru ciężaru — tylko do chwili, w której klient wpisze serię.
 *
 * Zgłoszone z testów na żywym planie: po wpisaniu serii instrukcja wisiała
 * dalej i wyglądało to tak, jakby wpis nie zadziałał. Po wpisie zostaje jedno
 * zdanie. Zwykle widać je ułamek sekundy, zanim wróci policzony ciężar —
 * na dłużej zostaje tylko bez zasięgu, kiedy seria czeka w kolejce.
 */
function doborCiezaru(c) {
  if (seriaWpisana(c)) {
    return el("p", "dobor dobor-zapisane", "✓ Seria zapisana — z niej policzę Twój ciężar.");
  }
  // Seria bez pary — sam ciężar albo same powtórzenia. Z niej nic się nie
  // policzy, a bez tego zdania klient widzi tylko, że instrukcja dalej wisi.
  const polowka = (c.serieWykonane ?? []).find((x) => !pustaSeria(x));
  if (polowka) {
    const blok = wskazowkaDoboru(c);
    blok.prepend(el("p", "dobor-brakuje", polowka.ciezar
      ? "Dopisz powtórzenia do serii — bez nich nie policzę ciężaru."
      : "Dopisz ciężar do serii — bez niego nie policzę reszty planu."));
    return blok;
  }
  return wskazowkaDoboru(c);
}

/**
 * Ciężar „ręcznie", a trener go nie wpisał — klient dobiera go sam.
 *
 * Zgłoszone przy „Dead bug izo + OH": w panelu pole kg stało na wierzchu,
 * a na liście w kolumnie ciężaru wisiał napis z BAZY „ręczne ustawienie",
 * a pola chowały się pod „+ zapisz, co poszło". Teraz w kolumnie stoi
 * „dobierz", pola są otwarte, a zdanie znika po pierwszej pełnej serii.
 * Bez RPE-owej instrukcji z `wskazowkaDoboru` — nic się tu nie liczy z 1RM.
 */
const wlasnyCiezarDoWpisania = (c) => c.ciezarWybieraKlient && !seriaWpisana(c);
const wskazowkaWlasnegoCiezaru = () => el("p", "dobor dobor-wlasny",
  "Ciężar dobierasz sam — wpisz, z jakim robisz serie. Zostanie na kolejne tygodnie.");

/** Skąd się wziął ciężar — w tym treningu, w którym go policzyliśmy. */
const notkaKalibracji = (k) => el("p", "kalibracja",
  `✓ Policzone z Twojej serii: ${liczba(k.ciezar)} kg × ${k.powtorzenia} `
  + `przy RPE ${liczba(k.rpe)}`);

/**
 * Tygodnie po cyklu (decyzja trenera z 25.09.2026): deload — lżej, RPE niżej,
 * bez TOP SETU; maksy — jedno powtórzenie na maksa w każdym boju, jednego
 * dnia. Numer na ekranie przychodzi z serwera: bez deloadu maksy są siódme.
 */
const tydzienWidoku = (nr) => widok.tygodnie.find((x) => x.tydzien === nr);
/** `1 ćwiczenie · 2 ćwiczenia · 5 ćwiczeń` — ta sama reguła co w konsoli. */
function odmiana(n, [jeden, kilka, wiele]) {
  const ostatnia = n % 10;
  const dwie = n % 100;
  if (n === 1) return jeden;
  if (ostatnia >= 2 && ostatnia <= 4 && !(dwie >= 12 && dwie <= 14)) return kilka;
  return wiele;
}
const numerTygodnia = (t) => t?.numer ?? t?.tydzien;
const dopisekTygodnia = (rodzaj) =>
  rodzaj === "deload" ? " · deload" : rodzaj === "maksy" ? " · maksy" : "";
const nazwaDnia = (t, d) =>
  t?.rodzaj === "maksy" ? "Dzień maksów" : `Dzień ${RZYMSKIE[d.dzien - 1]}`;
const OPIS_TYGODNIA = {
  deload: "Tydzień lżejszy: RPE niżej, bez TOP SETU — odpoczynek przed kolejnym cyklem.",
  maksy: "Jedno powtórzenie na maksa w każdym boju — wszystko jednego dnia.",
};

/**
 * Próba maksymalna — co zrobić i co wpisać. Ciężar w planie to obecne 1RM:
 * punkt odniesienia, nie polecenie. Wynik wchodzi do kolejnego cyklu.
 */
function wskazowkaMaksu(c) {
  if (seriaWpisana(c)) {
    return el("p", "dobor dobor-zapisane", "✓ Wynik zapisany — trener dostanie go do kolejnego cyklu.");
  }
  return el("p", "dobor dobor-maks",
    "Rozgrzej się stopniowo, potem jedno powtórzenie na maksa (RPE 10). "
    + (typeof c.ciezar === "number"
      ? `Twoje obecne 1RM to ${liczba(c.ciezar)} kg — jeśli idzie lekko, dołóż. `
      : "")
    + "Wpisz ciężar, który udało się podnieść.");
}

/**
 * Licznik pod tytułem dnia. Próby maksymalnej się nie ocenia — liczy się,
 * ile wyników jest wpisanych. Osobno, bo wpis wyniku nie przerysowuje listy.
 */
function pokazPostepTreningu(d) {
  const t = tydzienWidoku(biezacy.tydzien);
  const wpisane = d.cwiczenia.filter((c) => seriaWpisana(c)).length;
  // Bez „ocenionych": w panelu „OK" się nie klika (brak oceny = OK), więc
  // licznik ocen nic by nie mówił. Liczy ćwiczenia, w których coś się już
  // działo — wpisana seria albo ocena.
  const zaczete = d.cwiczenia.filter((c) => seriaWpisana(c) || c.feedback).length;
  $("#trening-postep").textContent = d.ukonczony
    ? "Trening zakończony"
    : t?.rodzaj === "maksy"
      ? `${wpisane} z ${d.cwiczenia.length} wyników wpisanych`
      : `${zaczete} z ${d.cwiczenia.length} ćwiczeń zaczętych`;
}

/**
 * Rozgrzewka na początek dnia — to, co trener wpisał przy dniu w konsoli
 * (25.09.2026). Zwijana: rozwinięta, dopóki w dniu nic nie jest zrobione,
 * potem zwinięta, żeby nie zabierała miejsca w środku treningu.
 */
function kartaRozgrzewki(r, otwarta) {
  const karta = el("details", "rozgrzewka");
  karta.open = otwarta;
  karta.append(el("summary", "", "Rozgrzewka"));
  const lista = el("ul", "rozgrzewka-lista");
  for (const linia of r.linie) lista.append(el("li", "", linia));
  karta.append(lista);
  // Tylko http(s) — serwer sprawdza to samo, a tu i tak nie ufamy.
  if (r.film && /^https?:\/\//.test(r.film)) {
    const a = el("a", "film", "▶ film");
    a.href = r.film;
    a.target = "_blank";
    a.rel = "noopener";
    karta.append(a);
  }
  return karta;
}

/** Czy w dniu jest już cokolwiek zrobione — wtedy rozgrzewka się zwija. */
const cosZrobione = (d) => d.ukonczony
  || d.cwiczenia.some((c) => seriaWpisana(c) || (c.serieWykonane ?? []).some((x) => !pustaSeria(x)));

/** Pierwszy trening, którego klient jeszcze nie zrobił — tam prowadzi „zacznij od razu". */
function pierwszyNiezrobiony() {
  for (const t of widok.tygodnie) {
    const d = t.dni.find((x) => !x.ukonczony);
    if (d) return { tydzien: t.tydzien, dzien: d.dzien };
  }
  return null;
}

/** Tygodnie rozwinięte albo zwinięte ręką klienta — wygrywają z domyślnym. */
const rozwinieteTygodnie = new Map();

function rysujTygodnie() {
  const kontener = $("#tygodnie");
  kontener.replaceChildren();

  // Przycisk do następnego treningu — pierwszego niedomkniętego. Zaczęty,
  // a niedomknięty (klient wyszedł w połowie) to „wróć", nie „następny".
  const cel = pierwszyNiezrobiony();
  const nastepny = $("#nastepny-trening");
  nastepny.classList.toggle("ukryty", !cel);
  if (cel) {
    const t = tydzienWidoku(cel.tydzien);
    const d = t.dni.find((x) => x.dzien === cel.dzien);
    const zaczety = d.cwiczenia.some((c) => c.feedback
      || (c.serieWykonane ?? []).some((x) => !pustaSeria(x)));
    nastepny.textContent = `▶ ${zaczety ? "Wróć do treningu" : "Następny trening"}: `
      + `tydzień ${numerTygodnia(t)} · ${nazwaDnia(t, d)}`;
    nastepny.onclick = () => {
      biezacy = { ...cel };
      otworz("#ekran-trening");
    };
  }

  // Rozwinięty jest tydzień następnego treningu, reszta zwinięta do jednej
  // linijki (26.09.2026). Osiemnaście jednakowych kafelków „Dzień I · 7 ćwiczeń"
  // trzeba było przewijać, żeby znaleźć, gdzie się jest. Po całym cyklu —
  // ostatni tydzień.
  const biezacyTydzien = cel?.tydzien ?? widok.tygodnie.at(-1)?.tydzien;
  for (const t of widok.tygodnie) {
    const blok = el("details", `tydzien ${t.rodzaj ? `po-cyklu ${t.rodzaj}` : ""}`);
    blok.open = rozwinieteTygodnie.get(t.tydzien) ?? t.tydzien === biezacyTydzien;
    const zrobioneDni = t.dni.filter((d) => d.ukonczony).length;
    const naglowek = el("summary", "tydzien-tytul");
    naglowek.append(
      el("span", "tydzien-nazwa",
        `Tydzień ${numerTygodnia(t)} z ${widok.tygodnie.length}${dopisekTygodnia(t.rodzaj)}`),
      el("span", `tydzien-stan${zrobioneDni === t.dni.length ? " caly" : ""}`,
        `${zrobioneDni === t.dni.length ? "✓ " : ""}${zrobioneDni} z ${t.dni.length}`),
    );
    // Klik, a nie zdarzenie „toggle": to drugie strzela też przy ustawieniu
    // `open` wyżej i zapamiętałoby domyślny stan jako wybór klienta — tydzień 1
    // zostałby rozwinięty na zawsze.
    naglowek.addEventListener("click", () => rozwinieteTygodnie.set(t.tydzien, !blok.open));
    blok.append(naglowek);
    if (t.rodzaj) blok.append(el("p", "drobne opis-tygodnia", OPIS_TYGODNIA[t.rodzaj] ?? ""));

    for (const d of t.dni) {
      const nastepny = cel && cel.tydzien === t.tydzien && cel.dzien === d.dzien;
      const kafel = el("button",
        `dzien-kafel${d.ukonczony ? " zrobiony" : ""}${nastepny ? " nastepny" : ""}`);
      const n = d.cwiczenia.length;
      const gora = el("span", "kafel-gora");
      gora.append(el("span", "nazwa", nazwaDnia(t, d)));
      gora.append(el("span", "ile", t.rodzaj === "maksy"
        ? `${n} ${odmiana(n, ["bój", "boje", "bojów"])}`
        : `${n} ${odmiana(n, ["ćwiczenie", "ćwiczenia", "ćwiczeń"])}`));
      if (d.ukonczony) gora.append(el("span", "ptaszek", "✓"));
      kafel.append(gora);
      // Co to za dzień — pierwsze ćwiczenia jedną linijką. „Dzień II" nic nie
      // mówi, „Barbell back squat · Barbell row…" od razu.
      const sklad = d.cwiczenia.map((c) => c.nazwa).filter(Boolean).join(" · ");
      if (sklad) kafel.append(el("span", "sklad", sklad));
      kafel.onclick = () => {
        biezacy = { tydzien: t.tydzien, dzien: d.dzien };
        otworz("#ekran-trening");
      };
      blok.append(kafel);
    }
    kontener.append(blok);
  }
}

function dzienBiezacy() {
  const t = widok.tygodnie.find((x) => x.tydzien === biezacy.tydzien);
  return t?.dni.find((d) => d.dzien === biezacy.dzien) ?? null;
}

function rysujTrening() {
  const d = dzienBiezacy();
  if (!d) return;

  const t = tydzienWidoku(biezacy.tydzien);
  $("#trening-tytul").textContent = `${nazwaDnia(t, d)} · tydzień ${numerTygodnia(t)}`;
  pokazPostepTreningu(d);
  // W dniu maksów ocen nie ma, a serwer niczego za klienta nie dopisuje.
  $("#notka-ok").classList.toggle("ukryty", t?.rodzaj === "maksy");

  // TOP SETY nie stoją już nad listą — każdy idzie przed swoim ćwiczeniem
  // (niżej, w `kontener`), bo w dniu może ich być kilka (27.09.2026).
  $("#topset").classList.add("ukryty");

  // ćwiczenia
  const stan = stanProwadzenia(d);
  const kontener = $("#cwiczenia");
  const opis = t?.rodzaj ? [el("p", "drobne opis-tygodnia", OPIS_TYGODNIA[t.rodzaj] ?? "")] : [];
  const rozgrzewka = d.rozgrzewka ? [kartaRozgrzewki(d.rozgrzewka, !cosZrobione(d))] : [];
  const topy = topSetyDnia(d);
  // TOP SET, którego ćwiczenia nie ma na liście (nie powinno się zdarzyć),
  // staje na początku — tak jak dawniej stał każdy.
  const bezCwiczenia = topy.filter((ts) => !d.cwiczenia.some((c) => c.positionId === ts.positionId));
  kontener.replaceChildren(...opis, ...rozgrzewka,
    ...bezCwiczenia.map((ts) => kartaTopSetu(ts, d, stan)),
    ...d.cwiczenia.flatMap((c) => [
      ...topy.filter((ts) => ts.positionId === c.positionId).map((ts) => kartaTopSetu(ts, d, stan)),
      kartaCwiczenia(c, stan),
    ]));

  $("#zakoncz").textContent = d.ukonczony ? "Trening zakończony ✓" : "Zakończ trening";
  $("#zakoncz").disabled = d.ukonczony;

  // Wejście w prowadzenie. Po domkniętym treningu nie ma dokąd prowadzić,
  // a w środku zaczętego przycisk musi mówić „wróć", nie „zacznij" — inaczej
  // wygląda jak propozycja rozpoczęcia wszystkiego od nowa.
  // Przycisk mówi, dokąd wraca — lista pokazuje to samo przy ćwiczeniu.
  $("#prowadz").classList.toggle("ukryty", d.ukonczony);
  $("#prowadz").textContent = !stan
    ? "▶ Prowadź mnie seria po serii"
    : stan.tu
      ? `▶ Wróć do treningu — ${opisKroku(stan.tu, d)}`
      : "▶ Wszystkie serie zrobione — zakończ trening";
}

/**
 * Zadanie serii jako równe kolumny z podpisem nad liczbą, a pod nimi drobno RPE.
 *
 * Dwie rundy uwag z testów. Najpierw: duży ciężar obok drobnych powtórzeń
 * i serii czytał się jak ciężar z dopiskiem — stąd równe kolumny. Potem:
 * w panelu za mało widać, **która to seria**, a za bardzo RPE, które po
 * pierwszym tygodniu nie jest już tak ważne (ciężar jest policzony). Seria
 * dostała więc własną kolumnę, a RPE zeszło do drobnej linijki pod spodem.
 */
function kolumnyZadania({
  seria, zSerii, ciezar, dobierz, serie, powtorzenia, rpe, jednostronne, podpisCiezaru = "Ciężar",
  dopisekCiezaru = null, dopisekPowtorzen = null,
}) {
  const blok = el("div", "zadanie-blok");
  const siatka = el("div", "zadanie-kolumny");
  const kolumna = (klasa, podpis, wartosc, jednostka, dopisek) => {
    const k = el("div", `kolumna ${klasa}`);
    k.append(el("span", "podpis", podpis));
    const w = el("span", "wartosc", wartosc);
    if (jednostka) w.append(el("small", "", ` ${jednostka}`));
    k.append(w);
    if (dopisek) k.append(el("span", "dopisek", dopisek));
    siatka.append(k);
  };
  if (seria != null) kolumna("kolumna-seria", "Seria", String(seria), `z ${zSerii}`);
  if (typeof ciezar === "number") {
    kolumna("kolumna-ciezar", podpisCiezaru, liczba(ciezar), "kg", dopisekCiezaru);
  }
  else if (dobierz) kolumna("kolumna-ciezar slowo dobierz", podpisCiezaru, "dobierz");
  else kolumna("kolumna-ciezar slowo", podpisCiezaru, String(ciezar || "—"));
  if (serie != null) kolumna("kolumna-serie", "Serie", String(serie));
  kolumna("kolumna-powt", serie != null ? "Powt." : "Powtórzenia", String(powtorzenia ?? "—"),
    null, [jednostronne ? "na stronę" : null, dopisekPowtorzen].filter(Boolean).join(" · ") || null);
  blok.append(siatka);
  // Samo „RPE 8", bez „2 w zapasie" — trener: dopisek zbędny. Co znaczy
  // RPE, mówi „Co to jest RPE?" tam, gdzie klient dobiera ciężar.
  if (rpe) blok.append(el("div", "rpe-linia", `RPE ${liczba(rpe)}`));
  return blok;
}

/**
 * „▶ Tu jesteś" albo „✓ zrobione" — dotknięcie wraca do panelu prowadzenia.
 * Przy „tu jesteś" dokładnie tam, gdzie klient wyszedł (z trwającą przerwą),
 * przy pozostałych — do tego ćwiczenia.
 */
function przyciskStanu(tekst, tuJestes, pasuje) {
  const b = el("button", `stan-prowadzenia ${tuJestes ? "tu" : ""}`, tekst);
  b.onclick = () => {
    const d = dzienBiezacy();
    if (!d) return;
    wczytajProwadzenie(d);
    if (!tuJestes) przejdzDoCwiczenia(krokiDnia(d), pasuje);
    otworz("#ekran-seria");
  };
  return b;
}

/**
 * Jedna karta ćwiczenia na liście dnia.
 *
 * `stan` to prowadzenie tego dnia (albo `null`). Klient wychodzi z panelu na
 * listę w środku treningu i ma od razu widzieć, gdzie jest: które ćwiczenia
 * ma za sobą, przy którym stoi i którą serię robi.
 */
/**
 * TOP SETY dnia z widoku. Od 27.09.2026 lista, każdy przy swoim ćwiczeniu.
 * Widok zapisany w telefonie przed tą zmianą ma jeden `topSet` bez ćwiczenia
 * — wtedy stoi on przed pierwszym ćwiczeniem dnia, jak dawniej.
 */
function topSetyDnia(d) {
  const lista = d.topSety ?? (d.topSet ? [{ ...d.topSet,
    positionId: d.topSet.positionId ?? d.cwiczenia[0]?.positionId }] : []);
  return lista.filter((ts) => ts?.cwiczenie);
}

/**
 * Rozgrzewka rampą przed pierwszą ciężką serią (trener, 02.10.2026). Kroki
 * i ciężary liczy silnik (`rampa.ts`): lekko × 8–10, 50 % × 5, 70 % × 3,
 * 85 % × 1. Serie rampy się nie zapisują.
 */
function blokRampy(r) {
  const blok = el("div", "rampa");
  blok.append(el("div", "rampa-tytul", "Rozgrzewka rampą"));
  const kroki = el("div", "rampa-kroki");
  const opis = el("p", "drobne");
  blok.append(kroki, opis);
  const potem = r.przed === "topset" ? "TOP SET" : "pierwsza seria robocza";
  const ciezaru = r.przed === "topset" ? "TOP SETU" : "pierwszej serii roboczej";
  let pole = null;
  /*
   * Bez ciężaru docelowego (klient dopiero dobiera) była sama „lekko × 8–10”
   * i ogólne zdanie — trener, 04.10.2026: „dziwny i niejasny”. Teraz pełny
   * schemat w procentach, a w panelu, gdy klient wpisze w pole ciężar, który
   * planuje, rampa liczy się w kilogramach — tą samą regułą co w silniku
   * (`krokiRampy`, schemat i skok przychodzą z serwera).
   */
  const rysuj = () => {
    const wpisany = pole ? Number(String(pole.value).replace(",", ".")) || null : null;
    const cel = r.cel ?? wpisany;
    const lista = r.cel != null ? r.kroki : cel && r.schemat ? krokiZCelu(cel, r.schemat, r.skok) : null;
    // Trener, 05.10.2026: przy „× 8–10”, „× 5” dopisać, że to powtórzenia.
    const krok = (ile, powtorzenia) => {
      const e = el("span", "rampa-krok", `${ile} × ${powtorzenia} `);
      e.append(el("span", "rampa-powt", "powt."));
      return e;
    };
    const ile = (k) => k.ciezar === null ? "lekko" : `${liczba(k.ciezar)} kg`;
    kroki.replaceChildren(...(lista
      ? lista.map((k) => krok(ile(k), k.powtorzenia))
      : r.schemat
        ? r.schemat.map((k) => krok(k.procent === null ? "lekko" : `${k.procent}%`, k.powtorzenia))
        : r.kroki.map((k) => krok(ile(k), k.powtorzenia))));
    opis.textContent = cel
      ? `Dalej ${potem} — ${liczba(cel)} kg.`
      : `Procenty liczysz od ciężaru ${ciezaru}, który dobierasz.`
        + (pole ? " Wpisz go w pole niżej — pokażę rampę w kilogramach." : "");
  };
  // Pole ciężaru powstaje w panelu później niż ramka — podpina się je osobno.
  blok.polacz = (p) => {
    if (r.cel != null || !p) return;
    pole = p;
    p.addEventListener("input", rysuj);
    rysuj();
  };
  rysuj();
  // Trener, 02.10.2026: „Tych serii nie wpisujesz” było nieintuicyjne — nie
  // wiadomo było, o które serie chodzi. Teraz wprost: rozgrzewkowe.
  blok.append(el("p", "drobne rampa-uwaga", r.przed === "topset"
    ? "Serii rozgrzewkowych nie wpisujesz — zapis zaczyna się od TOP SETU."
    : "Serii rozgrzewkowych nie wpisujesz — wpisujesz dopiero serie robocze."));
  return blok;
}

/** Kroki rampy do wpisanego ciężaru — ta sama reguła co `krokiRampy` w silniku. */
function krokiZCelu(cel, schemat, skok) {
  const s = Math.max(Number(skok) || 0, 0.5);
  const kroki = [];
  let poprzedni = 0;
  for (const { procent, powtorzenia } of schemat) {
    if (procent === null) { kroki.push({ ciezar: null, powtorzenia }); continue; }
    const ciezar = Number((Math.round((cel * procent / 100) / s) * s).toFixed(2));
    if (ciezar <= poprzedni || ciezar >= cel) continue;
    kroki.push({ ciezar, powtorzenia });
    poprzedni = ciezar;
  }
  return kroki;
}

/** TOP SET dnia po `positionId` — ten obiekt, który jest teraz w widoku. */
const topSetW = (d, positionId) => (d?.topSety ?? []).find((x) => x.positionId === positionId);

/**
 * Zapis TOP SETU od klienta: ocena („za trudne” / „za łatwe”, bez „OK”)
 * i ciężar, jeśli był inny niż w planie. Trener, 02.10.2026: **tylko
 * informacja dla niego** — serie robocze się od tego nie zmieniają.
 */
function zapiszTopSet(d, positionId, { feedback, kg }) {
  const ts = topSetW(d, positionId);
  const plan = typeof ts?.ciezar === "number" ? ts.ciezar : null;
  const inny = kg > 0 && kg !== plan ? kg : null;
  const klient = feedback || inny ? { ...(feedback ? { feedback } : {}), ...(inny ? { kg: inny } : {}) } : null;
  if (JSON.stringify(klient) === JSON.stringify(ts?.klient ?? null)) return;
  wyslij("/topset", { positionId, tydzien: biezacy.tydzien, feedback: feedback || null, kg: inny },
    () => { const teraz = topSetW(dzienBiezacy(), positionId); if (teraz) teraz.klient = klient; },
    { odswiez: false });
}

/**
 * Ocena TOP SETU — dwa przyciski, drugie dotknięcie zdejmuje. `poZmianie`
 * dostaje nową ocenę (albo `null`).
 */
function ocenyTopSetu(wybrana, poZmianie) {
  const oceny = el("div", "oceny oceny-topsetu");
  const przyciski = [];
  for (const [wartosc, etykieta, klasa] of [["za trudne", "Za trudne", "trudne"], ["za łatwe", "Za łatwe", "latwe"]]) {
    const b = el("button", "ocena-przycisk", etykieta);
    b.type = "button";
    b.onclick = () => {
      wybrana = wybrana === wartosc ? null : wartosc;
      for (const [x, w, k] of przyciski) x.className = `ocena-przycisk ${wybrana === w ? `wybrana ${k}` : ""}`;
      poZmianie(wybrana);
    };
    przyciski.push([b, wartosc, klasa]);
    oceny.append(b);
  }
  for (const [x, w, k] of przyciski) x.className = `ocena-przycisk ${wybrana === w ? `wybrana ${k}` : ""}`;
  return oceny;
}

/** Karta TOP SETU na liście dnia — przed ćwiczeniem, do którego należy. */
function kartaTopSetu(ts, d, stan) {
  const karta = el("div", "topset");
  karta.dataset.topset = ts.positionId;
  const lp = d.cwiczenia.find((c) => c.positionId === ts.positionId)?.lp;
  karta.append(el("div", "etykieta", lp ? `TOP SET · ${lp.replace(/\.$/, "")}` : "TOP SET"));
  const wiersz = el("div", "wiersz");
  wiersz.append(el("span", "", ts.cwiczenie.nazwa));
  wiersz.append(el("span", "ciezar", typeof ts.ciezar === "number"
    ? `${liczba(ts.ciezar)} kg`
    : ts.ciezar === "— brak 1RM" ? "dobierz" : String(ts.ciezar || "—")));
  karta.append(wiersz);
  karta.append(el("div", "drobne", `1 powtórzenie · RPE ${liczba(ts.rpe)}`));
  if (ts.ciezar === "— brak 1RM") karta.append(el("div", "drobne", jakDobrac(1, ts.rpe)));
  const klucz = `topset-${ts.positionId}`;
  const rampa = d.cwiczenia.find((c) => c.positionId === ts.positionId)?.rampa;
  if (rampa?.przed === "topset" && !d.ukonczony && !stan?.zrobione.has(klucz)) {
    karta.append(blokRampy(rampa));
  }
  // Ocena i inny ciężar — informacja dla trenera (02.10.2026).
  if (!d.ukonczony || ts.klient) {
    karta.append(el("p", "drobne podpowiedz-oceny",
      "Jeśli było OK — nic nie klikaj. Ocena idzie do trenera, serii roboczych nie zmienia."));
    karta.append(ocenyTopSetu(ts.klient?.feedback ?? null, (f) =>
      zapiszTopSet(d, ts.positionId, { feedback: f, kg: topSetW(d, ts.positionId)?.klient?.kg ?? 0 })));
    const inny = el("label", "inny-ciezar");
    const pole = el("input");
    pole.type = "number"; pole.inputMode = "decimal"; pole.min = "0"; pole.step = "0.5";
    pole.placeholder = "";
    pole.value = ts.klient?.kg ?? "";
    pole.onchange = () => zapiszTopSet(d, ts.positionId,
      { feedback: topSetW(d, ts.positionId)?.klient?.feedback ?? null, kg: Number(pole.value) || 0 });
    inny.append(el("span", "", "Inny ciężar niż w planie?"), pole, el("span", "", "kg"));
    karta.append(inny);
  }
  const pasuje = (k) => k.typ === "topset" && k.slotTopSetu === ts.positionId;
  const tu = stan?.tu?.klucz === klucz;
  karta.classList.toggle("biezace", tu);
  if (tu || stan?.zrobione.has(klucz)) {
    karta.append(przyciskStanu(tu ? "▶ Tu jesteś" : "✓ zrobione", tu, pasuje));
  } else if (!d.ukonczony) {
    const b = przyciskStanu("▶ Zacznij to ćwiczenie", false, pasuje);
    b.classList.add("start");
    karta.append(b);
  }
  return karta;
}

function kartaCwiczenia(c, stan = null) {
  const tuJestes = stan?.tu?.positionId === c.positionId;
  const karta = el("div",
    `cwiczenie ${"BCDE".includes(c.grupa) ? "grupa" : ""} ${tuJestes ? "biezace" : ""}`);
  karta.dataset.position = c.positionId;

  const gora = el("div", "cwiczenie-gora");
  gora.append(el("span", "lp", c.lp || ""));
  gora.append(el("span", "nazwa", c.nazwa));
  // Z kartą (opis + film w aplikacji) — przycisk; bez niej — link jak dotąd.
  const film = przyciskFilmu(c.film, c.karta);
  if (film) gora.append(film);
  karta.append(gora);

  const pasuje = (k) => k.positionId === c.positionId;
  const ile = stan ? stan.kroki.filter(pasuje).filter((k) => stan.zrobione.has(k.klucz)).length : 0;
  if (stan) {
    const jego = stan.kroki.filter(pasuje);
    if (tuJestes) {
      karta.append(przyciskStanu(`▶ Tu jesteś · seria ${stan.tu.seria} z ${stan.tu.zSerii}`,
        true, pasuje));
    } else if (jego.length > 0 && ile === jego.length) {
      karta.append(przyciskStanu("✓ zrobione", false, pasuje));
    } else if (ile > 0) {
      // Nie „zrobione" i nie na zielono — to słowo i ten kolor znaczą tu koniec.
      const b = przyciskStanu(`◐ zaczęte · ${ile} z ${jego.length} serii`, false, pasuje);
      b.classList.add("zaczete");
      karta.append(b);
    }
  }
  // Nietknięte ćwiczenie też ma wejście w prowadzenie — prosto do jego
  // pierwszej serii, niezależnie od kolejności. Zgłoszone z testów: z listy
  // dało się wrócić tylko do ćwiczeń już zaczętych, a klient na sali robi to,
  // co akurat wolne. Po domkniętym treningu nie ma dokąd prowadzić.
  if (!tuJestes && ile === 0 && !dzienBiezacy()?.ukonczony) {
    const b = przyciskStanu("▶ Zacznij to ćwiczenie", false, pasuje);
    b.classList.add("start");
    karta.append(b);
  }

  // Bez 1RM zamiast „— brak 1RM", które brzmiało jak awaria, stoi zaproszenie
  // do dobrania ciężaru. Klient nie musi wiedzieć, co to 1RM.
  karta.append(kolumnyZadania({
    ciezar: c.ciezar,
    dobierz: c.dobierzCiezar || c.ciezarWybieraKlient || (c.maks && typeof c.ciezar !== "number"),
    serie: c.serie, powtorzenia: c.powtorzenia, rpe: c.rpe, jednostronne: c.jednostronne,
    podpisCiezaru: c.maks ? "1RM teraz" : "Ciężar",
    // „jak w T1" — ręczny ciężar przeniesiony z tygodnia, w którym go wybrano.
    dopisekCiezaru: c.ciezarZTygodnia ? `jak w T${c.ciezarZTygodnia}` : null,
  }));
  const historia = linijkaOstatnio(c);
  if (historia) karta.append(historia);
  if (c.dobierzCiezar) karta.append(doborCiezaru(c));
  if (wlasnyCiezarDoWpisania(c)) karta.append(wskazowkaWlasnegoCiezaru());
  if (c.maks) karta.append(wskazowkaMaksu(c));
  if (c.kalibracja) karta.append(notkaKalibracji(c.kalibracja));
  // Rampa przed pierwszą serią roboczą — dopóki ćwiczenie nie jest zaczęte.
  if (c.rampa?.przed === "seria" && ile === 0 && !seriaWpisana(c) && !dzienBiezacy()?.ukonczony) {
    karta.append(blokRampy(c.rampa));
  }

  // Na liście „OK" zostaje (trener, 27.09.2026) — tu widać cały dzień naraz
  // i można nim odhaczyć ćwiczenie. Bez oceny przy końcu treningu serwer
  // i tak zapisuje OK.
  const oceny = el("div", "oceny");
  for (const [wartosc, etykieta, klasa] of [
    ["za trudne", "Za trudne", "trudne"],
    ["OK", "OK", "ok"],
    ["za łatwe", "Za łatwe", "latwe"],
  ]) {
    const b = el("button",
      `ocena-przycisk ${c.feedback === wartosc ? `wybrana ${klasa}` : ""}`, etykieta);
    b.onclick = async () => {
      const nowa = c.feedback === wartosc ? null : wartosc;
      if (nowa === "za łatwe" && !(await czyNaPewnoLatwe(c, biezacy.tydzien))) return;
      korektaZListy(c, nowa);
      wyslij("/odczucie",
        { positionId: c.positionId, tydzien: biezacy.tydzien, feedback: nowa },
        () => { c.feedback = nowa; });
    };
    oceny.append(b);
  }
  // Próby na RPE 10 nie ma jak ocenić „za łatwo" — liczy się wpisany wynik.
  if (!c.maks) karta.append(oceny);
  karta.append(polaWykonania(c));
  return karta;
}

/**
 * Jedna karta od nowa, z tego, co właśnie wróciło z serwera — reszta listy
 * zostaje nietknięta. Pomijamy, gdy klient pisze w tej karcie: podmiana pola
 * pod palcem zamyka na telefonie klawiaturę w połowie liczby.
 */
function odswiezKarte(positionId) {
  const stara = $(`#cwiczenia [data-position="${positionId}"]`);
  const c = dzienBiezacy()?.cwiczenia.find((x) => x.positionId === positionId);
  if (!stara || !c || stara.contains(document.activeElement)) return;
  stara.replaceWith(kartaCwiczenia(c, stanProwadzenia(dzienBiezacy())));
}

/**
 * Serie w jednej linijce: „80 · 90 · 85 · 80 kg × 6", a przy różnych
 * powtórzeniach „80×6 · 90×6 · 85×5".
 *
 * Jedna linijka, nie wiersz na serię: trener prosił, żeby nie zasypywać
 * klienta liczbami, a cztery serie w jednym zdaniu czyta się jednym rzutem oka.
 */
function opisSerii(serie) {
  const wszystkie = listaSerii(serie ?? []);
  // Dziura w środku zostaje na swoim miejscu jako „—": „— · 10×10 · 10×10"
  // mówi, że pierwsza seria nie jest wpisana, a nie że były dwie.
  if (wszystkie.some(pustaSeria)) {
    return wszystkie.map((x) => (pustaSeria(x) ? "—" : zapisSerii(x))).join(" · ");
  }
  const s = wszystkie;
  if (s.length === 0) return "";
  if (s.every((x) => !x.ciezar)) return `${s.map((x) => x.powtorzenia).join(" · ")} powt.`;
  const powt = s[0].powtorzenia;
  if (powt && s.every((x) => x.ciezar && x.powtorzenia === powt)) {
    return `${s.map((x) => liczba(x.ciezar)).join(" · ")} kg × ${powt}`;
  }
  return s.map(zapisSerii).join(" · ");
}

/**
 * „Ostatnio (T1): 60 · 62,5 kg × 8" — co klient zrobił przy tym ćwiczeniu
 * ostatnim razem. Jedna linijka, zawsze widoczna: na siłowni nikt niczego nie
 * rozwija (w Base44 była to zwijana sekcja). Liczy serwer, patrz `ostatnio`.
 *
 * Bez oceny. Dopisek „· za trudne" czytał się jak ocena zaznaczona z góry
 * w nowym treningu (trener, 25.09.2026). Ocena robi swoje w ciężarze —
 * tego tygodnia nie dotyczy i nie ma tu czego oglądać.
 */
function linijkaOstatnio(c) {
  const o = c.ostatnio;
  if (!o) return null;
  const kiedy = o.cykl ? `poprzedni cykl, T${o.tydzien}` : `T${o.tydzien}`;
  return el("p", "ostatnio", `Ostatnio (${kiedy}): ${opisSerii(o.serie)}`);
}

/** Serie ćwiczenia wpisane w tym treningu — ze wszystkich stron te same dane. */
const serieWykonane = (c) => c.serieWykonane ?? [];

/**
 * Jedna seria słowami: „9×11", a bez ciężaru „11 powt.", bez powtórzeń „10 kg".
 * Goła liczba („1: 11") nie mówiła, czy to kilogramy, czy powtórzenia.
 */
const zapisSerii = (x) => (x.ciezar && x.powtorzenia ? `${liczba(x.ciezar)}×${x.powtorzenia}`
  : x.ciezar ? `${liczba(x.ciezar)} kg` : `${x.powtorzenia} powt.`);

/**
 * Liczby, które pokazujemy w polach serii `i`: to, co już wpisane, a gdy
 * czegoś brak — poprzednia seria, a przy pierwszej plan.
 *
 * Zgłoszone z testów: pole ciężaru pokazywało szare „9" z planu, klient
 * wpisał tylko powtórzenia i zapisało się „11" bez ciężaru — bo szara liczba
 * była tylko podpowiedzią. Od tego czasu obowiązuje jedna zasada: **liczba,
 * którą widać w polu, to liczba, która się zapisze.**
 */
function podpowiedzSerii(c, i, serie) {
  const wlasna = serie[i];
  const poprzednia = serie[i - 1];
  // Ocena „za trudne / za łatwe" przy poprzedniej serii: ta dostaje ciężar
  // ±5 % od tego, co klient właśnie podniósł (trener, 26.09.2026).
  const korekta = prowadzenie?.korekty?.[c.positionId];
  // Poprzednia seria z inną liczbą powtórzeń niż w planie: ta wraca do
  // powtórzeń z planu, z ciężarem o tym samym wysiłku (04.10.2026).
  const dopasowany = !wlasna?.ciezar && !wlasna?.powtorzenia && poprzednia?.ciezar
    ? naPowtorzeniaPlanu(poprzednia.ciezar, poprzednia.powtorzenia, c) : null;
  const baza = dopasowany ?? poprzednia?.ciezar;
  const skorygowana = !wlasna?.ciezar && poprzednia?.ciezar && korekta?.od === i + 1;
  // Na masie ciała ocena zmienia powtórzenia następnej serii o ±1 (trener,
  // 02.10.2026: „miałem 10 powtórzeń, zaznaczyłem »za trudne«, a w kolejnej
  // serii znowu 10”). Dalsze serie idą za tym, co klient zrobił.
  const naPowtorzenia = !skorygowana && c.ciezar === "masa ciała" && !wlasna?.powtorzenia
    && poprzednia?.powtorzenia && korekta?.od === i + 1;
  return {
    ciezar: skorygowana
      ? poKorekcie(baza, korekta.kierunek, c.skokKg)
      : wlasna?.ciezar ?? baza ?? (typeof c.ciezar === "number" ? c.ciezar : null),
    powtorzenia: naPowtorzenia
      ? Math.max(1, poprzednia.powtorzenia + korekta.kierunek)
      : dopasowany !== null ? Number(c.powtorzenia)
      : wlasna?.powtorzenia ?? poprzednia?.powtorzenia ?? (c.powtorzenia || null),
    korekta: skorygowana || naPowtorzenia ? korekta.kierunek : 0,
    /** Ciężar, od którego liczona jest korekta — do opisu „o 5%” albo „o 1 kg”. */
    zCiezaru: skorygowana ? baza : null,
    /** Dopasowanie do powtórzeń z planu: z jakiej serii i na ile kg. */
    dopasowanie: dopasowany !== null
      ? { zKg: poprzednia.ciezar, zPowt: poprzednia.powtorzenia, kg: dopasowany } : null,
    /** Korekta poszła w powtórzenia, nie w ciężar (masa ciała). */
    korektaPowtorzen: Boolean(naPowtorzenia),
    /** Skąd ciężar w polu — do dopisku pod dużą liczbą. */
    zrodlo: skorygowana ? "korekta" : wlasna?.ciezar ? "wlasna" : dopasowany !== null ? "dopasowana"
      : poprzednia?.ciezar ? "poprzednia" : "plan",
  };
}

/** Korekta serii po ocenie: 5 %, jak korekta tygodnia z ocen. */
const KOREKTA_SERII = 0.05;

/**
 * Ciężar po korekcie ±5 %, zaokrąglony do skoku z BAZY (co najmniej 0,5 kg).
 * Gdy 5 % nie sięga skoku, ciężar i tak idzie o krok — klient powiedział
 * „za trudne" i ta sama liczba byłaby odpowiedzią „nie słyszę". Krok jak
 * w silniku (`krokWidoczny`, trener 02.10.2026: „nie wyłapało 5 kg — niech
 * przeskakuje na 4 kg”): do 10 kg o 1 kg do pełnych kilogramów, wyżej o skok.
 * Dotąd zawsze o skok, więc 5 kg przy skoku 2,5 spadało do 2,5.
 */
const MALY_CIEZAR_KG = 10;
/** „o 5%”, gdy tyle wyszło; przy małym ciężarze albo całym skoku — „o 1 kg”, „o 2,5 kg”. */
const oIle = (przed, po) => (przed && Math.abs(po - przed) / przed > 0.07
  ? `o ${liczba(Math.abs(po - przed))} kg` : "o 5%");
/**
 * Ciężar na powtórzenia z planu o tym samym wysiłku co zrobiona seria —
 * z tabeli RPE silnika (`widok.tabelaRPE`), przy RPE z planu. `null`, gdy
 * nie ma czego dopasowywać (te same powtórzenia, brak liczb, poza tabelą).
 *
 * Trener, 04.10.2026: „3 serie po 8 powtórzeń, a ktoś zrobi 10 w pierwszej —
 * aplikacja powinna dopasować ciężar do 8 powtórzeń, żeby spełniało to
 * założenia planu”. 12 kg × 10 przy RPE 8 to tyle co ~12,9 kg × 8 → 12,5 kg.
 */
function naPowtorzeniaPlanu(kg, powt, c) {
  const t = widok?.tabelaRPE;
  const plan = Number(c.powtorzenia);
  const rpe = Number(c.rpe);
  if (!t || !(kg > 0) || !(powt > 0) || !(plan > 0) || powt === plan || c.maks) return null;
  const zrobione = t[powt]?.[rpe];
  const docelowe = t[plan]?.[rpe];
  if (!zrobione || !docelowe) return null;
  const s = Math.max(Number(c.skokKg) || 0, 0.5);
  return Number((Math.round((kg * docelowe) / zrobione / s) * s).toFixed(2));
}

function poKorekcie(kg, kierunek, skok) {
  const s = Math.max(Number(skok) || 0, 0.5);
  let nowy = Math.round((kg * (1 + kierunek * KOREKTA_SERII)) / s) * s;
  if (nowy === kg) {
    nowy = kg > MALY_CIEZAR_KG ? kg + kierunek * s
      : kierunek < 0 ? Math.max(0.5, Math.ceil(kg - 1)) : Math.floor(kg + 1);
  }
  return Math.max(0, Number(nowy.toFixed(2)));
}

/**
 * Ocena w panelu — przy każdej serii, nie tylko przy ostatniej.
 *
 * Trener, 26.09.2026: „ktoś pierwszą serię zrobił normalnie, ale w drugiej
 * stwierdził, że jest za ciężko — wtedy aplikacja powinna mu już na trzeciej
 * pokazać ułatwioną wersję". I zaraz: „nie chciałbym, żeby ktoś pomyślał, że
 * w każdej serii musi kliknąć OK". Stąd przy seriach przed ostatnią tylko
 * „za trudne / za łatwe", bez „OK" i ze zdaniem, że nic nie trzeba klikać.
 * Od 27.09.2026 tak samo przy ostatniej („OK" zostało tylko na liście).
 *
 * Od 02.10.2026 ocena należy do jednej serii (`prowadzenie.ocenySerii`):
 * przy następnej przyciski są neutralne, a ponowne „za trudne” obniża
 * kolejną serię jeszcze raz. Do trenera i do kolejnych tygodni idzie ocena
 * z najpóźniejszej ocenionej serii; drugie dotknięcie zdejmuje ocenę tej
 * serii. „Za łatwe” w T1–T2 najpierw pokazuje okienko (`czyNaPewnoLatwe`).
 *
 * Bez przerysowania panelu: klient mógł już wpisać liczby tej serii,
 * a przerysowanie wracało do podpowiedzi i kasowało je (tak było przy
 * ocenie z ostatniej serii do 26.09).
 */
function ocenaWPanelu(k, c, wCiezar, bezCiezaru, wPowt) {
  const blok = el("div", "ocena-w-panelu");
  const ostatnia = k.ostatniaSeria;
  /*
   * Ocena należy do TEJ serii (trener, 02.10.2026): „za trudne” przy serii 1
   * zmniejsza serię 2, ale przy serii 2 przyciski wracają do neutralnych —
   * żeby dało się znowu kliknąć „za trudne” i zejść jeszcze niżej. Dotąd
   * stała zaznaczona i drugie dotknięcie ją zdejmowało zamiast obniżać.
   * Do trenera i do kolejnych tygodni idzie ostatnia ocena z serii.
   */
  prowadzenie.ocenySerii ??= {};
  const ocenySerii = (prowadzenie.ocenySerii[c.positionId] ??= {});
  const wczesniejsza = Object.keys(ocenySerii).map(Number).filter((n) => n < k.seria)
    .sort((a, b) => a - b).at(-1);
  // W panelu te same dwa przyciski przy każdej serii, także przy ostatniej —
  // bez „OK" (trener, 27.09.2026: „w panelach nie ma ono sensu", brak
  // kliknięcia i tak oznacza OK). Na liście „OK" zostaje.
  blok.append(el("div", "pytanie", "Za ciężko albo za lekko?"));
  blok.append(el("p", "drobne podpowiedz-oceny", !ostatnia
    ? "Jeśli jest OK — nic nie klikaj. Jeśli nie, dopasuję następną serię."
    : wczesniejsza
      ? `Ocena z serii ${wczesniejsza} („${ocenySerii[wczesniejsza]}”) zostaje dla kolejnych `
        + "tygodni. Kliknij, tylko jeśli ostatnia seria była inna."
      : "Jeśli było OK — nic nie klikaj. Ocena zmienia ciężar w kolejnych tygodniach."));
  const oceny = el("div", "oceny");
  const notka = el("p", "korekta-serii");
  const przyciski = [];
  const pokaz = () => {
    for (const [b, wartosc, klasa] of przyciski) {
      b.className = `ocena-przycisk ${ocenySerii[k.seria] === wartosc ? `wybrana ${klasa}` : ""}`;
    }
    const korekta = prowadzenie.korekty?.[c.positionId];
    const baza = Number(String(wCiezar.value).replace(",", ".")) || null;
    const powt = Number(wPowt?.value) || null;
    const nastepna = !ostatnia && korekta?.od === k.seria + 1;
    if (nastepna && !bezCiezaru && baza) {
      // Inne powtórzenia niż w planie — najpierw ten sam wysiłek na plan.
      const podstawa = naPowtorzeniaPlanu(baza, powt, c) ?? baza;
      const kg = poKorekcie(podstawa, korekta.kierunek, c.skokKg);
      notka.textContent = `Następna seria: ${liczba(kg)} kg`
        + `${podstawa !== baza ? ` × ${c.powtorzenia}` : ""} `
        + `(${korekta.kierunek < 0 ? "lżej" : "ciężej"} ${oIle(podstawa, kg)}).`;
    } else if (nastepna && c.ciezar === "masa ciała" && powt) {
      notka.textContent = `Następna seria: ${Math.max(1, powt + korekta.kierunek)} powt. `
        + `(o 1 ${korekta.kierunek < 0 ? "mniej" : "więcej"}).`;
    } else {
      notka.textContent = "";
    }
  };
  const warianty = [["za trudne", "Za trudne", "trudne"], ["za łatwe", "Za łatwe", "latwe"]];
  for (const [wartosc, etykieta, klasa] of warianty) {
    const b = el("button", "ocena-przycisk", etykieta);
    b.onclick = async () => {
      const nowa = ocenySerii[k.seria] === wartosc ? null : wartosc;
      if (nowa === "za łatwe" && !(await czyNaPewnoLatwe(c, prowadzenie.tydzien))) return;
      if (nowa) ocenySerii[k.seria] = nowa;
      else delete ocenySerii[k.seria];
      // Ocena tygodnia: z najpóźniejszej ocenionej serii; bez żadnej — brak.
      const numery = Object.keys(ocenySerii).map(Number).sort((a, b) => a - b);
      const tygodnia = numery.length ? ocenySerii[numery.at(-1)] : null;
      if (tygodnia !== (c.feedback ?? null)) {
        wyslij("/odczucie",
          { positionId: c.positionId, tydzien: prowadzenie.tydzien, feedback: tygodnia },
          () => { c.feedback = tygodnia; }, { odswiez: false });
      }
      if (!ostatnia) {
        prowadzenie.korekty ??= {};
        if (nowa) {
          prowadzenie.korekty[c.positionId] = { od: k.seria + 1, kierunek: nowa === "za trudne" ? -1 : 1 };
        } else if (prowadzenie.korekty[c.positionId]?.od === k.seria + 1) {
          delete prowadzenie.korekty[c.positionId];
        }
      }
      zapiszProwadzenie();
      pokaz();
    };
    przyciski.push([b, wartosc, klasa]);
    oceny.append(b);
  }
  // Zmiana liczby w polu zmienia i zapowiedź następnej serii.
  wCiezar.addEventListener("input", pokaz);
  wPowt?.addEventListener("input", pokaz);
  blok.append(oceny, notka);
  pokaz();
  return blok;
}

/**
 * Okienko z pytaniem — własne, nie `confirm()`: systemowe na iPadzie ma
 * nagłówek z adresem strony i nie mieści kilku akapitów. `true` po „tak”.
 */
function okienko({ tytul, akapity, tak, nie }) {
  return new Promise((rozstrzygnij) => {
    const tlo = el("div", "okienko-tlo");
    const karta = el("div", "okienko");
    karta.setAttribute("role", "dialog");
    karta.setAttribute("aria-modal", "true");
    karta.append(el("h2", "", tytul), ...akapity.map((t) => el("p", "", t)));
    const zamknij = (wynik) => { tlo.remove(); rozstrzygnij(wynik); };
    const bTak = el("button", "glowny szeroki", tak);
    const bNie = el("button", "poboczny szeroki", nie);
    bTak.onclick = () => zamknij(true);
    bNie.onclick = () => zamknij(false);
    tlo.onclick = (e) => { if (e.target === tlo) zamknij(false); };
    karta.append(bTak, bNie);
    tlo.append(karta);
    document.body.append(tlo);
    bNie.focus();
  });
}

/**
 * „Za łatwe” w pierwszych tygodniach — najpierw słowo wyjaśnienia.
 *
 * Trener, 02.10.2026: „pierwsze tygodnie nie powinny być skrajnie ciężkie,
 * więc użytkownik musi się liczyć z tym, że ćwiczenie i tak progresuje
 * trudnością do ostatniego tygodnia, a jak oznaczy od razu, że jest za lekkie,
 * to na koniec może się okazać już za ciężkie. Mimo wszystko musi mieć
 * możliwość zmiany — to tylko informacja”. Raz na ćwiczenie w tygodniu:
 * kto potwierdził, nie słyszy tego drugi raz przy kolejnej serii.
 */
const TYGODNIE_ROZRUCHU = [1, 2];
const uprzedzoneLatwe = new Set();

async function czyNaPewnoLatwe(c, tydzien) {
  if (c.maks || !TYGODNIE_ROZRUCHU.includes(tydzien) || tydzienWidoku(tydzien)?.rodzaj) return true;
  const klucz = `${widok?.planId}:${tydzien}:${c.positionId}`;
  if (uprzedzoneLatwe.has(klucz)) return true;
  const zapas = wZapasie(c.rpe);
  const ostatnia = Number(zapas.split("–").pop());
  const slowo = zapas === "1" ? "powtórzenie" : ostatnia <= 4 ? "powtórzenia" : "powtórzeń";
  const rpe = Number(c.rpe) > 0 && Number(c.rpe) < 10
    ? `W tym tygodniu celujemy w RPE ${liczba(c.rpe)}, czyli ${zapas} ${slowo} `
      + "w zapasie. Jeśli tyle mniej więcej Ci zostało, ćwiczenie jest "
      + "dokładnie takie, jakie ma być."
    : null;
  const tak = await okienko({
    tytul: "Plan dopiero się rozkręca",
    akapity: [
      "Pierwsze tygodnie są celowo lżejsze. Z każdym tygodniem ciężar i wysiłek "
        + "rosną — aż do ostatniego, najbardziej wymagającego tygodnia.",
      ...(rpe ? [rpe] : []),
      "„Za łatwe” podniesie ciężar we wszystkich kolejnych tygodniach. Wtedy "
        + "najtrudniejszy tydzień może okazać się za ciężki.",
      "Jeśli zapasu było wyraźnie więcej — śmiało, oznacz. To Twój plan.",
    ],
    tak: "Oznacz „za łatwe”",
    nie: "Zostaw bez zmiany",
  });
  if (tak) uprzedzoneLatwe.add(klucz);
  return tak;
}

/**
 * Ocena z listy dnia poprawia też dalsze serie tego dnia (trener, 02.10.2026:
 * „6 serii wyciskania, na 3 serii zaznaczy »za lekkie« — poprawia nie tylko
 * kolejne tygodnie, ale już kolejne serie w tym dniu”). Ten sam zapis co
 * w panelu prowadzenia (`prowadzenie.korekty`), więc lista i panel mówią to
 * samo: następna niewpisana seria ±5 % od ostatniej wpisanej, dalsze za nią.
 */
function korektaZListy(c, ocena) {
  const d = dzienBiezacy();
  if (!d || c.maks) return;
  const wpisane = listaSerii(serieWykonane(c)).length;
  wczytajProwadzenie(d);
  prowadzenie.korekty ??= {};
  if ((ocena === "za trudne" || ocena === "za łatwe") && wpisane > 0 && wpisane < (c.serie || 1)) {
    prowadzenie.korekty[c.positionId] = { od: wpisane + 1, kierunek: ocena === "za trudne" ? -1 : 1 };
  } else {
    delete prowadzenie.korekty[c.positionId];
  }
  zapiszProwadzenie();
}

const pustaSeria = (s) => !s || (!s.ciezar && !s.powtorzenia);

/**
 * Lista serii do wysłania: dziury wypełnione pustymi seriami (żeby kolejne nie
 * zmieniły numerów), puste z końca odcięte — serwer robi to samo.
 */
function listaSerii(serie) {
  const lista = Array.from(serie, (x) => x ?? { ciezar: null, powtorzenia: null });
  while (lista.length > 0 && pustaSeria(lista.at(-1))) lista.pop();
  return lista;
}

/**
 * Wysyłka wszystkich serii ćwiczenia. Telefon zmienia widok od razu;
 * najcięższą — tę, która idzie do 1RM — wylicza serwer.
 */
function wyslijSerie(c, serie) {
  return wyslij("/odczucie",
    { positionId: c.positionId, tydzien: biezacy.tydzien, serie },
    () => {
      c.serieWykonane = serie;
      // Karta nie przerysowuje się po zapisie, więc po pierwszej odpowiedzi
      // serwera trzyma obiekt z poprzedniego widoku. Zapis musi trafić też
      // do tego, który jest teraz w pamięci — inaczej licznik dnia i kopia
      // w telefonie (bez zasięgu) nie widziały drugiej połowy serii.
      const teraz = dzienBiezacy()?.cwiczenia.find((x) => x.positionId === c.positionId);
      if (teraz) teraz.serieWykonane = serie;
    },
    { odswiez: false });
}

/**
 * Co faktycznie poszło na sztandze. Ocena mówi „jak było", to mówi „ile było" —
 * i dopiero z tego da się policzyć nowe 1RM bez proszenia o serię maksymalną.
 *
 * Zwinięte, bo na siłowni nikt nie chce wypełniać formularza. Zwinięte pokazuje
 * wpisane serie w jednej linijce; rozwinięte — wiersz na serię, odsłaniane po
 * jednym: widać tylko te wpisane i jedną pustą na następną. Cztery puste wiersze
 * naraz wyglądałyby jak formularz do wypełnienia w całości, a nie trzeba.
 */
function polaWykonania(c) {
  const blok = el("div", "wykonanie");

  /**
   * Co klient robił w tym miejscu, zanim trener podmienił ćwiczenie.
   *
   * Tylko do odczytu i pod prawdziwą nazwą. Wpuszczenie tych liczb do pól
   * niżej dałoby się zapisać na nowo — już pod ćwiczeniem, którego wtedy
   * nie było.
   */
  if (c.wczesniej) {
    const w = c.wczesniej;
    const ile = [
      w.ciezarWykonany != null ? `${liczba(w.ciezarWykonany)} kg` : null,
      w.powtorzeniaWykonane != null ? `× ${w.powtorzeniaWykonane}` : null,
      w.feedback,
    ].filter(Boolean).join(" ");
    const wiersz = el("p", "wczesniej");
    wiersz.append(el("span", "etykieta", "Wcześniej tutaj: "),
      el("span", "nazwa", w.nazwa), el("span", "", ile ? ` — ${ile}` : ""));
    blok.append(wiersz);
  }

  const bezCiezaru = BEZ_POLA_CIEZARU.includes(c.ciezar);
  const planowane = Math.max(1, c.serie || 1);
  const serie = serieWykonane(c).map((x) => ({ ...x }));   // kopia robocza wierszy

  // Przy ćwiczeniu bez ciężaru pola są od razu na wierzchu, dopóki klient nie
  // wpisze serii: tu wpis nie jest dodatkiem, tylko jedynym źródłem ciężarów.
  const otwarte = otwarteWykonania.has(c.positionId)
    || ((c.dobierzCiezar || c.ciezarWybieraKlient || c.maks) && !seriaWpisana(c));

  // Po treningu: linijka, co poszło, i osobno „edytuj". Formularz na wierzchu
  // wyglądał jak coś do wypełnienia, a to jest zapis — do poprawienia literówki
  // albo do dopisania serii przez kogoś, kto trenuje z listy, nie z prowadzenia.
  const opisEl = el("span", "wykonanie-opis");
  const przelacz = el("button", "wykonanie-przelacz");
  const podpisz = () => {
    const opis = opisSerii(serie);
    opisEl.textContent = opis ? `Zrobione: ${opis}` : "";
    przelacz.textContent = opis ? "✎ edytuj" : "+ zapisz, co poszło";
  };
  podpisz();
  const pola = el("div", `wykonanie-pola ${otwarte ? "" : "ukryty"}`);

  przelacz.onclick = () => {
    const zwiniete = pola.classList.toggle("ukryty");
    if (zwiniete) otwarteWykonania.delete(c.positionId);
    else {
      otwarteWykonania.add(c.positionId);
      [...pola.querySelectorAll("input")].find((i) => i.value === "")?.focus();
    }
  };

  const zapisz = async () => {
    const lista = listaSerii(serie);
    if (JSON.stringify(lista) === JSON.stringify(serieWykonane(c))) return;
    const bylDobor = c.dobierzCiezar;
    const wysylka = wyslijSerie(c, lista);
    podpisz();
    if (!wlasnyCiezarDoWpisania(c)) {
      blok.closest(".cwiczenie")?.querySelector(".dobor-wlasny")?.remove();
    }
    // Próba maksymalna: zdanie „wpisz wynik" zmienia się w „wynik zapisany",
    // a licznik dnia liczy wpisane wyniki — bez przerysowania karty.
    if (c.maks) {
      blok.closest(".cwiczenie")?.querySelector(".dobor")?.replaceWith(wskazowkaMaksu(c));
      const d = dzienBiezacy();
      if (d) pokazPostepTreningu(d);
    }

    // Ćwiczenie bez ciężaru: ta seria właśnie go ustala. Instrukcja znika od
    // razu — bez przerysowania, bo klient może jeszcze stać w polu obok —
    // a gdy serwer odda policzony ciężar, karta rysuje się od nowa.
    if (bylDobor) {
      blok.closest(".cwiczenie")?.querySelector(".dobor")?.replaceWith(doborCiezaru(c));
      if (seriaWpisana(c)) {
        await wysylka;
        odswiezKarte(c.positionId);
      }
    }
  };

  /*
   * Wiersz na każdą serię z planu — przy 3 seriach trzy wiersze.
   *
   * Przed pierwszą wpisaną serią pola są puste. Były tu kiedyś szare
   * podpowiedzi (poprzednia seria albo plan) i zgłoszone z testów wyszło, że
   * nie da się ich odróżnić od wpisanych: niepełna seria („18 kg" bez
   * powtórzeń) i pusty wiersz z podpowiedziami 18 × 8 wyglądały jak dwie
   * zapisane serie.
   *
   * Po pierwszej pełnej serii kolejne wiersze wypełniają się same (trener,
   * 27.09.2026: „po wpisaniu pierwszej serii reszta powinna się sama
   * uzupełnić") — ale jako **propozycja**: przerywana ramka, blade liczby
   * i przycisk ✓. Zapisuje się dopiero po ✓ albo po poprawieniu liczby, więc
   * dalej zapisuje się dokładnie to, co klient zatwierdził, a nie to, co mu
   * się podsunęło. „✓ Pozostałe tak samo" zatwierdza wszystkie naraz — dla
   * tych, którzy wpisują po treningu.
   */
  // Ocena „za trudne / za łatwe” po wpisanych seriach — propozycje dalszych
  // idą ±5 % od ostatniej wpisanej (patrz `korektaZListy`).
  const korekta = () => (biezacy ? prowadzenieTegoDnia(dzienBiezacy())?.korekty?.[c.positionId] : null);
  const propozycja = (i) => {
    if (c.maks || !pustaSeria(serie[i])) return null;
    for (let j = i - 1; j >= 0; j--) {
      const s = serie[j];
      if (s?.powtorzenia && (bezCiezaru || s.ciezar)) {
        const k = korekta();
        const poOcenie = k?.od === j + 2;
        // Inne powtórzenia niż w planie — propozycja wraca do planu, z ciężarem
        // o tym samym wysiłku (04.10.2026).
        const dopasowany = bezCiezaru ? null : naPowtorzeniaPlanu(s.ciezar, s.powtorzenia, c);
        const baza = dopasowany ?? s.ciezar;
        const ciezar = bezCiezaru ? null
          : poOcenie ? poKorekcie(baza, k.kierunek, c.skokKg) : baza;
        // Masa ciała: ocena przestawia powtórzenia o ±1 (02.10.2026).
        const powtorzenia = poOcenie && c.ciezar === "masa ciała"
          ? Math.max(1, s.powtorzenia + k.kierunek)
          : dopasowany !== null ? Number(c.powtorzenia) : s.powtorzenia;
        return { ciezar, powtorzenia, zCiezaru: baza, dopasowany: dopasowany !== null };
      }
    }
    return null;
  };
  const wiersze = [];
  const stopka = el("div", "propozycje-stopka ukryty");
  const opisPropozycji = el("span", "opis-propozycji");
  const odswiezPropozycje = () => {
    wiersze.forEach((r, i) => {
      const p = propozycja(i);
      r.w.classList.toggle("proponowana", Boolean(p));
      r.potwierdz.classList.toggle("ukryty", !p);
      // Pod palcem niczego nie podmieniamy — klient może właśnie pisać.
      if (document.activeElement === r.wCiezar || document.activeElement === r.wPowt) return;
      if (p) {
        r.wCiezar.value = p.ciezar ?? "";
        r.wPowt.value = p.powtorzenia ?? "";
      } else if (pustaSeria(serie[i])) {
        r.wCiezar.value = "";
        r.wPowt.value = "";
      }
    });
    stopka.classList.toggle("ukryty", !wiersze.some((_, i) => propozycja(i)));
    // Skąd blade liczby — z poprzedniej serii albo po ocenie ±5 %.
    const pierwsza = wiersze.findIndex((_, i) => propozycja(i));
    const k = korekta();
    const poOcenie = pierwsza >= 0 && k?.od === pierwsza + 1;
    const p0 = pierwsza >= 0 ? propozycja(pierwsza) : null;
    const naPlan = p0?.dopasowany ? ` × ${p0.powtorzenia} (powtórzenia z planu)` : "";
    opisPropozycji.textContent = poOcenie && !bezCiezaru
      ? `Blade liczby to propozycja: ${liczba(p0.ciezar)} kg${naPlan} — `
        + `${k.kierunek < 0 ? "lżej" : "ciężej"} ${oIle(p0.zCiezaru, p0.ciezar)} po Twojej ocenie. `
        + "Po serii dotknij ✓ albo popraw."
      : p0?.dopasowany && !bezCiezaru
        ? `Blade liczby to propozycja: ${liczba(p0.ciezar)} kg × ${p0.powtorzenia} — tyle powtórzeń, `
          + "ile w planie, z ciężarem o tym samym wysiłku co Twoja seria. Po serii dotknij ✓ albo popraw."
      : poOcenie && c.ciezar === "masa ciała"
        ? `Blade liczby to propozycja: ${p0.powtorzenia} powt. — o 1 ${k.kierunek < 0 ? "mniej" : "więcej"} `
          + "po Twojej ocenie. Po serii dotknij ✓ albo popraw."
        : "Blade liczby to propozycja z poprzedniej serii — po serii dotknij ✓ albo popraw.";
  };
  const wiersz = (i) => {
    const w = el("div", "wiersz-serii");
    w.append(el("span", "nr", `${i + 1}.`));
    const wCiezar = el("input");
    wCiezar.placeholder = "kg";
    wCiezar.value = serie[i]?.ciezar ?? "";
    const wPowt = el("input");
    wPowt.placeholder = "powt.";
    wPowt.value = serie[i]?.powtorzenia ?? "";
    for (const x of [wCiezar, wPowt]) {
      x.type = "number";
      x.inputMode = "decimal";
      x.min = "0";
    }
    const zmien = () => {
      // Kto pisze, ten chce dalej pisać — karta odświeżona po zapisie zostaje
      // rozwinięta, zamiast chować wiersze spod palca.
      otwarteWykonania.add(c.positionId);
      // Poprawka w wierszu z propozycją zapisuje cały wiersz — tak, jak stoi.
      serie[i] = {
        ciezar: bezCiezaru ? null : Number(String(wCiezar.value).replace(",", ".")) || null,
        powtorzenia: Number(wPowt.value) || null,
      };
      zapisz();
      odswiezPropozycje();
    };
    wCiezar.onchange = zmien;
    wPowt.onchange = zmien;
    if (!bezCiezaru) w.append(wCiezar, el("span", "razy", "kg ×"));
    w.append(wPowt, el("span", "razy", "powt."));
    const potwierdz = el("button", "potwierdz-serie ukryty", "✓");
    potwierdz.title = "Zrobione tak, jak stoi";
    potwierdz.setAttribute("aria-label", `Seria ${i + 1} zrobiona tak, jak stoi`);
    potwierdz.onclick = () => {
      const p = propozycja(i);
      if (!p) return;
      otwarteWykonania.add(c.positionId);
      serie[i] = { ciezar: p.ciezar, powtorzenia: p.powtorzenia };
      zapisz();
      odswiezPropozycje();
    };
    w.append(potwierdz);
    wiersze.push({ w, wCiezar, wPowt, potwierdz });
    return w;
  };

  const wierszy = Math.max(planowane, serie.length);
  for (let i = 0; i < wierszy; i++) pola.append(wiersz(i));
  const wszystkie = el("button", "link wszystkie-tak-samo", "✓ Pozostałe serie tak samo");
  wszystkie.onclick = () => {
    otwarteWykonania.add(c.positionId);
    for (let i = 0; i < wiersze.length; i++) {
      const p = propozycja(i);
      if (p) serie[i] = { ciezar: p.ciezar, powtorzenia: p.powtorzenia };
    }
    zapisz();
    odswiezPropozycje();
  };
  stopka.append(opisPropozycji, wszystkie);
  pola.append(stopka);
  odswiezPropozycje();

  const naglowek = el("div", "wykonanie-naglowek");
  naglowek.append(opisEl, przelacz);
  blok.append(naglowek, pola);
  return blok;
}

// ── prowadzenie: seria po serii ────────────────────────────────────
//
// Drugi sposób na ten sam trening. Lista dnia zostaje i zostać musi — jest
// przeglądem: pokazuje wszystko naraz, pozwala wrócić do dowolnego ćwiczenia
// i niczego nie narzuca. Ale na sali klient nie przegląda, tylko wykonuje:
// seria, przerwa, następna. Ekran z dwunastoma ćwiczeniami wymaga wtedy od
// niego pamiętania, przy którym z nich jest — i to jest cała różnica między
// „mam plan w telefonie" a „telefon mnie prowadzi".
//
// Wybór należy do klienta: przycisk „Prowadź mnie" stoi nad listą, a wyjście
// z prowadzenia wraca dokładnie tam. Wpisane serie widać w obu miejscach,
// bo to te same dane.

const KLUCZ_PROWADZENIA = `prowadzenie-${TOKEN}`;
/** O ile jedno dotknięcie „+30 s" przedłuża przerwę. */
const DOLOZ_SEKUND = 30;
/**
 * Przerwa dla widoku zapisanego lokalnie, zanim serwer zaczął ją podawać.
 * Jedyne miejsce, w którym klient zna tę liczbę — regułę trzyma silnik
 * (`przerwa.ts`), tu stoi wyłącznie ratunek na stary zapis w pamięci.
 */
const PRZERWA_GDY_BRAK = 90;
/** Progresje, przy których kilogramów nie ma czego wpisywać. */
const BEZ_POLA_CIEZARU = ["masa ciała", "czas", "dystans"];

/** Stan jednego prowadzonego treningu. Naraz pamiętamy jeden — patrz `wczytajProwadzenie`. */
let prowadzenie = null;
/** Uchwyt odliczania. Jedyny w aplikacji — dlatego trzyma go zmienna, nie panel. */
let tykanie = null;

const czasTekst = (sek) => {
  const s = Math.max(0, Math.round(sek));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Dzień rozłożony na kroki — po jednym na każdą serię.
 *
 * Superserie idą naprzemiennie: B1 seria 1, B2 seria 1, przerwa, B1 seria 2…
 * Tak się je robi na sali i tak stoją w arkuszu — wspólna litera w `lp` to
 * właśnie superseria. Odliczanie wchodzi dopiero po ostatnim ćwiczeniu rundy;
 * między B1 a B2 przerwy nie ma, bo na tym polega superseria. Przerwa rundy
 * trwa tyle, ile każe jej najcięższe ćwiczenie — liczona wg lżejszego
 * odsyłałaby klienta do sztangi niedoodpoczętego przez cały plan.
 */
function krokiDnia(d) {
  const kroki = [];
  const topy = topSetyDnia(d);
  const krokTopSetu = (ts) => ({
    typ: "topset",
    klucz: `topset-${ts.positionId}`,
    // Nie `positionId` — ten klucz znaczy „seria tego ćwiczenia" i mapa dnia
    // liczyłaby TOP SET do jego serii.
    slotTopSetu: ts.positionId,
    lp: d.cwiczenia.find((c) => c.positionId === ts.positionId)?.lp ?? "",
    // Karta z filmem także przy TOP SECIE (09.10.2026) — to samo ćwiczenie.
    karta: d.cwiczenia.find((c) => c.positionId === ts.positionId)?.karta ?? null,
    rpe: ts.rpe,
    nazwa: ts.cwiczenie.nazwa,
    ciezar: ts.ciezar,
    przerwa: ts.przerwaSekundy ?? PRZERWA_GDY_BRAK,
    koniecRundy: true,
  });
  // TOP SET, którego ćwiczenia nie ma na liście, idzie na początek dnia.
  for (const ts of topy) {
    if (!d.cwiczenia.some((c) => c.positionId === ts.positionId)) kroki.push(krokTopSetu(ts));
  }

  const grupy = [];
  for (const c of d.cwiczenia) {
    const ostatnia = grupy[grupy.length - 1];
    if (ostatnia && c.grupa && ostatnia.litera === c.grupa) ostatnia.cwiczenia.push(c);
    else grupy.push({ litera: c.grupa, cwiczenia: [c] });
  }

  for (const g of grupy) {
    // TOP SET przed pracą swojego ćwiczenia, nie na początku dnia: A1 — TOP
    // SET i robocze, B1 — TOP SET i robocze (trener, 27.09.2026).
    for (const c of g.cwiczenia) {
      for (const ts of topy.filter((x) => x.positionId === c.positionId)) kroki.push(krokTopSetu(ts));
    }
    const rundy = Math.max(...g.cwiczenia.map((c) => c.serie || 1));
    for (let r = 1; r <= rundy; r++) {
      const wRundzie = g.cwiczenia.filter((c) => (c.serie || 1) >= r);
      const przerwa = Math.max(...wRundzie.map((c) => c.przerwaSekundy ?? PRZERWA_GDY_BRAK));
      wRundzie.forEach((c, i) => kroki.push({
        typ: "seria",
        klucz: `${c.positionId}#${r}`,
        positionId: c.positionId,
        seria: r,
        zSerii: c.serie || 1,
        wGrupie: g.cwiczenia.length > 1,
        litera: g.litera,
        koniecRundy: i === wRundzie.length - 1,
        ostatniaSeria: r === (c.serie || 1),
        przerwa,
      }));
    }
  }
  return kroki;
}

/**
 * Stan prowadzenia dla dnia, który klient właśnie otworzył.
 *
 * Pamiętamy **jeden** trening naraz. Klient robi jeden trening na raz i wraca
 * do tego samego; osobny wpis na każdy dzień cyklu byłby zapasem na sytuację,
 * która się nie zdarza, a kosztowałby pytanie „który z siedmiu zaczętych
 * treningów masz na myśli".
 *
 * Wpis z innego cyklu odpada po `planId`: gdy trener wyśle nowy plan w środku
 * tygodnia, numer kroku ze starego nie znaczy już nic.
 */
function prowadzenieTegoDnia(d) {
  // Po „↺ Resetuj plan” (10.10.2026) postęp sprzed resetu nie pasuje — klient
  // zaczyna trening od pierwszej serii, a nie tam, gdzie stał przed resetem.
  const pasuje = (p) => p && p.planId === widok.planId
    && (p.resetOd ?? null) === (widok.resetOd ?? null)
    && p.tydzien === biezacy.tydzien && p.dzien === d.dzien;
  if (pasuje(prowadzenie)) return prowadzenie;
  try {
    const zapisane = JSON.parse(localStorage.getItem(KLUCZ_PROWADZENIA) || "null");
    return pasuje(zapisane) ? zapisane : null;
  } catch { return null; }   // uszkodzony zapis — zaczynamy od zera
}

function wczytajProwadzenie(d) {
  prowadzenie = prowadzenieTegoDnia(d) ?? {
    planId: widok.planId,
    resetOd: widok.resetOd ?? null,
    tydzien: biezacy.tydzien,
    dzien: d.dzien,
    krok: 0,          // seria na ekranie — nie postęp; postęp to `zrobione`
    zrobione: [],     // klucze serii zatwierdzonych przyciskiem
    doKiedy: null,    // znacznik czasu końca przerwy, nie liczba sekund — patrz odliczanie
    przerwa: 0,
  };
  // Zapis sprzed 23.09 znał tylko numer kroku: wszystko przed nim było zrobione.
  if (!Array.isArray(prowadzenie.zrobione)) {
    prowadzenie.zrobione = krokiDnia(d).slice(0, prowadzenie.krok).map((k) => k.klucz);
  }
}

/**
 * Pierwsza niezrobiona seria po `od`, a gdy za nią nic nie zostało — pierwsza
 * niezrobiona od początku dnia. Klient, który przeskoczył ćwiczenie, bo
 * maszyna była zajęta, wraca do niego na końcu, zamiast je zgubić.
 * `kroki.length`, gdy zrobione jest wszystko.
 */
function nastepnaNiezrobiona(kroki, zrobione, od) {
  const po = kroki.findIndex((k, i) => i > od && !zrobione.has(k.klucz));
  if (po >= 0) return po;
  const odPoczatku = kroki.findIndex((k) => !zrobione.has(k.klucz));
  return odPoczatku >= 0 ? odPoczatku : kroki.length;
}

/**
 * Przejście do ćwiczenia: do pierwszej jego niezrobionej serii, a gdy
 * wszystkie są zrobione — do pierwszej, żeby dało się ją obejrzeć i poprawić.
 * Trwająca przerwa przepada: klient sam zdecydował, że idzie gdzie indziej.
 */
function przejdzDoCwiczenia(kroki, pasuje) {
  const zrobione = new Set(prowadzenie.zrobione);
  const niezrobiona = kroki.findIndex((k) => pasuje(k) && !zrobione.has(k.klucz));
  const pierwsza = kroki.findIndex(pasuje);
  if (pierwsza < 0) return;
  prowadzenie.krok = niezrobiona >= 0 ? niezrobiona : pierwsza;
  prowadzenie.doKiedy = null;
  prowadzenie.przerwa = 0;
  zapiszProwadzenie();
}

/**
 * Gdzie klient jest w prowadzonym treningu tego dnia — dla listy dnia.
 * `null`, gdy prowadzenia w tym dniu jeszcze nie było.
 */
function stanProwadzenia(d) {
  const p = prowadzenieTegoDnia(d);
  if (!p) return null;
  const kroki = krokiDnia(d);
  const zrobione = new Set(Array.isArray(p.zrobione)
    ? p.zrobione : kroki.slice(0, p.krok).map((k) => k.klucz));
  if (zrobione.size === 0) return null;
  return { kroki, zrobione, tu: p.krok < kroki.length ? kroki[p.krok] : null };
}

function zapiszProwadzenie() {
  try { localStorage.setItem(KLUCZ_PROWADZENIA, JSON.stringify(prowadzenie)); }
  catch { /* pełna pamięć — trening i tak się odbędzie */ }
}

/**
 * Serie wpisane w tym treningu przy tym ćwiczeniu — z widoku, czyli z serwera.
 * Do 23.09 żyły osobno w pamięci prowadzenia, tylko dla jednego treningu
 * i tylko w tym telefonie; lista dnia i trener widzieli z nich jedną.
 */
const serieCwiczenia = (positionId) =>
  dzienBiezacy()?.cwiczenia.find((x) => x.positionId === positionId)?.serieWykonane ?? [];

function rysujSerie() {
  const d = dzienBiezacy();
  if (!d) return;
  wczytajProwadzenie(d);
  rysujPanel();
}

function rysujPanel() {
  const d = dzienBiezacy();
  if (!d || !prowadzenie) return;
  const kroki = krokiDnia(d);
  const panel = $("#panel");
  panel.replaceChildren();

  const tp = tydzienWidoku(prowadzenie.tydzien);
  $("#seria-tytul").textContent = `${nazwaDnia(tp, d)} · tydzień ${numerTygodnia(tp)}`;
  const zrobione = new Set(prowadzenie.zrobione);
  const ileZrobionych = kroki.filter((k) => zrobione.has(k.klucz)).length;
  $("#seria-postep").textContent = prowadzenie.krok >= kroki.length
    ? "Wszystkie serie za Tobą"
    : `Seria ${prowadzenie.krok + 1} z ${kroki.length} · zrobione ${ileZrobionych}`;
  $("#pasek-wypelnienie").style.width =
    `${Math.round((100 * ileZrobionych) / Math.max(1, kroki.length))}%`;

  panel.append(mapaDnia(d, kroki, zrobione));

  if (prowadzenie.krok >= kroki.length) {
    zatrzymajOdliczanie();
    panel.append(panelKonca(d));
    return;
  }

  // Przerwa, która skończyła się, zanim ktokolwiek patrzył. Klient zamyka
  // aplikację w szatni i wraca do niej nazajutrz — bez tego wchodziłby na
  // licznik z zerem i na wibrację za trening sprzed doby.
  if (prowadzenie.doKiedy && zostaloSekund() <= 0) {
    prowadzenie.doKiedy = null;
    prowadzenie.przerwa = 0;
    zapiszProwadzenie();
  }

  const k = kroki[prowadzenie.krok];
  if (prowadzenie.doKiedy) {
    panel.append(panelPrzerwy(k, d));
    uruchomOdliczanie();
    return;
  }
  zatrzymajOdliczanie();
  // Rozgrzewka przed pierwszą serią — dopóki w dniu nic nie jest zrobione.
  if (d.rozgrzewka && zrobione.size === 0 && !cosZrobione(d)) {
    panel.append(kartaRozgrzewki(d.rozgrzewka, true));
  }
  if (zrobione.has(k.klucz)) panel.append(przegladZrobionej(k, kroki, zrobione, d));
  panel.append(k.typ === "topset" ? panelTopSetu(k, kroki) : panelSerii(k, kroki, d));
}

/**
 * Mapa dnia: ćwiczenia jako kafelki nad panelem — zrobione, zaczęte i to,
 * przy którym klient stoi. Dotknięcie przenosi do ćwiczenia.
 *
 * Dotąd dało się tylko cofać seria po serii, a przy superseriach „wstecz"
 * skakało naprzemiennie między dwoma ćwiczeniami — powrót do A1 z połowy
 * treningu wymagał kilkunastu dotknięć. Mapa działa też do przodu: maszyna
 * zajęta, więc klient robi najpierw co innego, a przeskoczone ćwiczenie
 * czeka na niego na końcu.
 */
function mapaDnia(d, kroki, zrobione) {
  const mapa = el("div", "mapa-dnia");
  const tu = kroki[prowadzenie.krok];
  const pozycje = [
    // TOP SET bez ćwiczenia na liście — osobno, na początku.
    ...kroki.filter((k) => k.typ === "topset" && !d.cwiczenia.some((c) => c.positionId === k.slotTopSetu))
      .map((k) => ({ etykieta: "TS", lp: "TOP", nazwa: `TOP SET · ${k.nazwa}`, grupa: "TOP",
        pasuje: (x) => x.klucz === k.klucz })),
    ...d.cwiczenia.flatMap((c) => {
      const lp = (c.lp || "").replace(/\.$/, "") || "•";
      // Ćwiczenie bez numeru nie należy do żadnej superserii — stoi osobno.
      const grupa = c.grupa || `bez-${c.positionId}`;
      return [
        // TOP SET tego ćwiczenia — kafelek „TS" tuż przed nim, w jego grupie.
        ...(kroki.some((k) => k.typ === "topset" && k.slotTopSetu === c.positionId)
          ? [{ etykieta: "TS", lp: `TS-${lp}`, nazwa: `TOP SET · ${c.nazwa}`, grupa,
            pasuje: (k) => k.typ === "topset" && k.slotTopSetu === c.positionId }]
          : []),
        { etykieta: lp, lp, nazwa: c.nazwa, grupa, pasuje: (k) => k.positionId === c.positionId },
      ];
    }),
  ];
  // Kafelki jednej litery stoją ciasno obok siebie, między literami jest
  // odstęp — B1 B2 to jedna superseria i ma to być widać na pierwszy rzut oka.
  let grupa = null;
  let biezacaGrupa = null;
  for (const poz of pozycje) {
    if (poz.grupa !== biezacaGrupa) {
      grupa = el("div", "grupa-mapy");
      mapa.append(grupa);
      biezacaGrupa = poz.grupa;
    }
    const jego = kroki.filter(poz.pasuje);
    if (jego.length === 0) continue;
    const ile = jego.filter((k) => zrobione.has(k.klucz)).length;
    const stan = ile === jego.length ? "zrobione" : ile > 0 ? "zaczete" : "";
    const b = el("button", `kafel-mapy ${stan} ${tu && poz.pasuje(tu) ? "tu" : ""}`,
      `${ile === jego.length ? "✓ " : ""}${poz.etykieta}`);
    b.dataset.lp = poz.lp;
    // Zaczęte — licznik zamiast koloru. Zielona ramka przy „2 z 3" wyglądała
    // na pierwszy rzut oka jak ćwiczenie skończone (zgłoszone z testów).
    if (stan === "zaczete") b.append(el("span", "licznik-mapy", ` ${ile}/${jego.length}`));
    b.title = `${poz.nazwa} — zrobione ${ile} z ${jego.length}`;
    b.onclick = () => { przejdzDoCwiczenia(kroki, poz.pasuje); rysujPanel(); };
    grupa.append(b);
  }
  // Grupa, w której żadne ćwiczenie nie miało kroków, nie zostawia dziury.
  for (const g of mapa.querySelectorAll(".grupa-mapy:empty")) g.remove();
  return mapa;
}

/**
 * Seria już zrobiona, otwarta jeszcze raz — z mapy albo strzałką wstecz.
 * Klient może ją poprawić, a jedno dotknięcie wraca tam, gdzie skończył.
 * Przerwy przy poprawce nie ma: to nie jest kolejna seria, tylko zapis.
 */
function przegladZrobionej(k, kroki, zrobione, d) {
  const blok = el("div", "przeglad-zrobionej");
  blok.append(el("span", "", "✓ Ta seria jest już zrobiona — możesz ją poprawić."));
  const cel = nastepnaNiezrobiona(kroki, zrobione, prowadzenie.krok);
  const wroc = el("button", "link", cel >= kroki.length
    ? "↩ Wróć do końca treningu"
    : `↩ Wróć do: ${opisKroku(kroki[cel], d)}`);
  wroc.onclick = () => {
    prowadzenie.krok = cel;
    zapiszProwadzenie();
    rysujPanel();
  };
  blok.append(wroc);
  return blok;
}

/** „C1. Incline dumbbell curl · seria 3 z 3" albo „TOP SET". */
function opisKroku(k, d) {
  if (k.typ === "topset") return `TOP SET · ${k.nazwa}`;
  const c = d.cwiczenia.find((x) => x.positionId === k.positionId);
  return `${c?.lp ?? ""} ${c?.nazwa ?? ""} · seria ${k.seria} z ${k.zSerii}`.trim();
}

/** Nagłówek panelu: numer w planie, nazwa, film (karta w aplikacji albo link). */
function gloweczka(lp, nazwa, film, karta = null) {
  const gora = el("div", "panel-gora");
  if (lp) gora.append(el("span", "lp", lp));
  gora.append(el("span", "nazwa", nazwa));
  const przycisk = przyciskFilmu(film, karta);
  if (przycisk) gora.append(przycisk);
  return gora;
}

function panelTopSetu(k, kroki) {
  const karta = el("div", "panel-karta topset-panel");
  karta.append(el("div", "etykieta", "TOP SET"));
  karta.append(gloweczka(k.lp || "", k.nazwa, null, k.karta ?? null));
  const bezCiezaru = k.ciezar === "— brak 1RM";
  karta.append(kolumnyZadania({
    ciezar: k.ciezar, dobierz: bezCiezaru, powtorzenia: 1, rpe: k.rpe,
  }));
  if (bezCiezaru) karta.append(el("p", "dobor", jakDobrac(1, k.rpe)));
  const d = dzienBiezacy();
  const rampa = d?.cwiczenia.find((c) => c.positionId === k.slotTopSetu)?.rampa;
  const ramkaRampy = rampa?.przed === "topset" && !prowadzenie.zrobione.includes(k.klucz)
    ? blokRampy(rampa) : null;
  if (ramkaRampy) karta.append(ramkaRampy);
  karta.append(el("p", "drobne", "Jedno ciężkie powtórzenie przed pracą — sprawdzian dnia."));

  /*
   * Ciężar i ocena TOP SETU (trener, 02.10.2026). Pole stoi z ciężarem
   * z planu — zmienia się tylko, gdy klient zrobił inny. Ocena bez „OK”,
   * jak przy seriach. Jedno i drugie idzie do trenera jako informacja;
   * serie robocze zostają, bo „top set mógłby być za ciężki, a robocze okej”.
   */
  const zapisany = topSetW(d, k.slotTopSetu)?.klient ?? null;
  const pole = el("input");
  pole.type = "number"; pole.inputMode = "decimal"; pole.min = "0"; pole.step = "0.5";
  pole.placeholder = "kg";
  pole.value = zapisany?.kg ?? (typeof k.ciezar === "number" ? k.ciezar : "");
  const pola = el("div", "pola-topsetu");
  pola.append(pole, el("span", "", "kg × 1"));
  karta.append(pola);
  ramkaRampy?.polacz(pole);
  let ocena = zapisany?.feedback ?? null;
  // TOP SET bez 1RM — klient sam dobiera ciężar jednego powtórzenia, więc tak
  // jak przy seriach: bez „za ciężko / za lekko” (trener, 10.10.2026).
  if (bezCiezaru) {
    karta.append(bezOcenyPrzyDoborze());
  } else {
    const blokOceny = el("div", "ocena-w-panelu");
    blokOceny.append(el("div", "pytanie", "Za ciężko albo za lekko?"));
    blokOceny.append(el("p", "drobne podpowiedz-oceny",
      "Jeśli było OK — nic nie klikaj. Ocena idzie do trenera, serii roboczych nie zmienia."));
    blokOceny.append(ocenyTopSetu(ocena, (f) => {
      ocena = f;
      zapiszTopSet(d, k.slotTopSetu, { feedback: f, kg: Number(pole.value) || 0 });
    }));
    karta.append(blokOceny);
  }

  const zrobione = el("button", "glowny szeroki",
    prowadzenie.zrobione.includes(k.klucz) ? "Dalej" : "Zrobione");
  zrobione.onclick = () => {
    zapiszTopSet(d, k.slotTopSetu, { feedback: ocena, kg: Number(pole.value) || 0 });
    dalej(k, kroki);
  };
  karta.append(zrobione);
  karta.append(cofnij());
  return karta;
}

function panelSerii(k, kroki, d) {
  const c = d.cwiczenia.find((x) => x.positionId === k.positionId);
  const karta = el("div", "panel-karta");
  if (!c) {
    // Trener podmienił ćwiczenie w trakcie treningu. Rzadkie, ale możliwe —
    // i lepiej przeskoczyć krok niż pokazać pusty panel.
    karta.append(el("p", "drobne", "Tego ćwiczenia nie ma już w planie."));
    const pomin = el("button", "glowny szeroki", "Dalej");
    pomin.onclick = () => dalej(k, kroki);
    karta.append(pomin);
    return karta;
  }

  karta.append(gloweczka(c.lp, c.nazwa, c.film, c.karta));
  if (k.wGrupie) karta.append(el("div", "seria-numer", `superseria ${k.litera}`));

  // Wcześniej stały tu szare podpowiedzi z planu, a zapisywało się tylko to,
  // co klient wpisał sam. Zgłoszone z testów: przy „9 kg · 10 powt." wpisane
  // samo „11" zapisało się jako 11 powtórzeń bez ciężaru, choć na ekranie
  // stało 9. Pusty zostaje tylko ciężar, którego nie ma skąd wziąć — przy
  // ćwiczeniu, w którym klient dopiero go dobiera.
  const bezCiezaru = BEZ_POLA_CIEZARU.includes(c.ciezar);
  const podpowiedz = podpowiedzSerii(c, k.seria - 1, serieCwiczenia(c.positionId));
  // Duża liczba mówi to samo co pole: dwie różne liczby na jednym ekranie
  // („50" wyżej, „45" w polu) każą zgadywać, która obowiązuje (trener,
  // 26.09.2026). Klient zrobił drugą serię na 45 — trzecia stoi na 45, a plan
  // zostaje w dopisku. Przy maksach nie: tam duża liczba to obecne 1RM,
  // a pole to próba.
  const zPola = !bezCiezaru && !c.maks && typeof podpowiedz.ciezar === "number"
    && podpowiedz.ciezar !== c.ciezar ? podpowiedz.ciezar : null;
  const skorygowany = podpowiedz.korekta && !bezCiezaru;

  // Powtórzenia po ocenie (masa ciała) — duża liczba mówi to samo co pole.
  const powtZPola = podpowiedz.korektaPowtorzen ? podpowiedz.powtorzenia : null;
  karta.append(kolumnyZadania({
    seria: k.seria, zSerii: k.zSerii, ciezar: zPola ?? c.ciezar,
    dobierz: c.dobierzCiezar || c.ciezarWybieraKlient || (c.maks && typeof c.ciezar !== "number"),
    powtorzenia: powtZPola ?? c.powtorzenia, rpe: c.rpe, jednostronne: c.jednostronne,
    dopisekPowtorzen: powtZPola !== null && c.powtorzenia ? `w planie ${c.powtorzenia}` : null,
    podpisCiezaru: c.maks ? "1RM teraz" : "Ciężar",
    // „jak w T1" — ręczny ciężar przeniesiony z tygodnia, w którym go wybrano.
    dopisekCiezaru: zPola === null ? (c.ciezarZTygodnia ? `jak w T${c.ciezarZTygodnia}` : null)
      : typeof c.ciezar === "number" ? `w planie ${liczba(c.ciezar)}`
      : podpowiedz.zrodlo === "korekta" ? "po Twojej ocenie"
      : podpowiedz.zrodlo === "dopasowana" ? `na ${c.powtorzenia} powt.`
      : podpowiedz.zrodlo === "poprzednia" ? `jak w serii ${k.seria - 1}` : null,
  }));
  const historia = linijkaOstatnio(c);
  if (historia) karta.append(historia);
  if (c.dobierzCiezar) karta.append(doborCiezaru(c));
  if (wlasnyCiezarDoWpisania(c)) karta.append(wskazowkaWlasnegoCiezaru());
  if (c.maks) karta.append(wskazowkaMaksu(c));
  if (c.kalibracja) karta.append(notkaKalibracji(c.kalibracja));
  // Rampa przed pierwszą serią roboczą (bez TOP SETU przy tym ćwiczeniu).
  const ramkaRampy = c.rampa?.przed === "seria" && k.seria === 1 && !prowadzenie.zrobione.includes(k.klucz)
    ? blokRampy(c.rampa) : null;
  if (ramkaRampy) karta.append(ramkaRampy);

  // Co już poszło w tym treningu przy tym ćwiczeniu.
  const wpisane = serieCwiczenia(c.positionId).filter(Boolean);
  if (wpisane.length > 0) {
    const pasek = el("div", "serie-wpisane");
    // Podpis przed kafelkami — goły „1: 10×9" nie mówił, co to jest.
    // „Poprzednie", gdy wszystkie są przed tą serią; przy powrocie do
    // zrobionej serii część jest za nią, więc wtedy po prostu „wpisane".
    const numery = wpisane.map((s, i) => (pustaSeria(s) ? null : i)).filter((i) => i !== null);
    pasek.append(el("span", "etykieta-serii",
      numery.every((i) => i < k.seria - 1) ? "Poprzednie serie:" : "Wpisane serie:"));
    /*
     * Kafelek to przycisk: dotknięcie otwiera tę serię do poprawki.
     *
     * Zgłoszone z testów: po wejściu w zrobione ćwiczenie dało się poprawić
     * tylko pierwszą serię — „Zapisz poprawkę" wraca tam, gdzie klient był,
     * a do serii 2 i 3 nie było drogi. Seria na ekranie jest podświetlona
     * i nieaktywna; seria ponad plan (klient zrobił więcej) nie ma kroku,
     * więc też nie prowadzi nigdzie.
     */
    let klikalnych = 0;
    wpisane.forEach((s, i) => {
      if (!s.ciezar && !s.powtorzenia) return;
      const tutaj = i + 1 === k.seria;
      const cel = kroki.findIndex((x) => x.klucz === `${c.positionId}#${i + 1}`);
      const chip = el("button", `chip ${tutaj ? "biezaca" : ""}`, `${i + 1}: ${zapisSerii(s)}`);
      chip.type = "button";
      chip.setAttribute("aria-label", `Seria ${i + 1}: ${zapisSerii(s)}${tutaj ? " — na ekranie" : " — popraw"}`);
      if (tutaj || cel < 0) chip.disabled = true;
      else {
        klikalnych += 1;
        chip.onclick = () => {
          prowadzenie.krok = cel;
          prowadzenie.doKiedy = null;
          prowadzenie.przerwa = 0;
          zapiszProwadzenie();
          rysujPanel();
        };
      }
      pasek.append(chip);
    });
    if (klikalnych > 0) pasek.append(el("span", "etykieta-serii", "dotknij, by poprawić"));
    if (numery.length > 0) karta.append(pasek);
  }

  // Pola „co poszło" od razu z prawdziwymi liczbami: poprzednia seria, a przy
  // pierwszej plan. Klient zmienia tylko to, co było inaczej, i dotyka
  // „Zakończ serię" — zapisuje się dokładnie to, co widać w polach.
  //
  const pola = el("div", "panel-pola");
  const wCiezar = el("input");
  wCiezar.placeholder = "kg";
  wCiezar.value = podpowiedz.ciezar ?? "";
  const wPowt = el("input");
  wPowt.placeholder = "powt.";
  wPowt.value = podpowiedz.powtorzenia ?? "";
  for (const i of [wCiezar, wPowt]) {
    i.type = "number";
    i.inputMode = "decimal";
    i.min = "0";
  }
  if (!bezCiezaru) pola.append(wCiezar, el("span", "razy", "kg ×"));
  pola.append(wPowt, el("span", "razy", "powt."));
  // Ciężar w polu to nie plan, tylko korekta po ocenie z poprzedniej serii —
  // mówimy wprost, skąd się wziął.
  if (skorygowany) {
    karta.append(el("p", "korekta-serii", `${podpowiedz.korekta < 0 ? "Lżej" : "Ciężej"} `
      + `${oIle(podpowiedz.zCiezaru, podpowiedz.ciezar)} `
      + `po Twojej ocenie „${podpowiedz.korekta < 0 ? "za trudne" : "za łatwe"}”: `
      + `${liczba(podpowiedz.ciezar)} kg.`));
  }
  if (podpowiedz.dopasowanie && !bezCiezaru) {
    const dp = podpowiedz.dopasowanie;
    karta.append(el("p", "korekta-serii dopasowanie-serii",
      `Na ${c.powtorzenia} powtórzeń z planu: ${liczba(dp.kg)} kg — tyle samo wysiłku co Twoja `
      + `seria ${k.seria - 1} (${liczba(dp.zKg)} kg × ${dp.zPowt}).`));
  }
  if (podpowiedz.korektaPowtorzen) {
    karta.append(el("p", "korekta-serii", `O 1 powtórzenie ${podpowiedz.korekta < 0 ? "mniej" : "więcej"} `
      + `po Twojej ocenie „${podpowiedz.korekta < 0 ? "za trudne" : "za łatwe"}”: `
      + `${podpowiedz.powtorzenia} powt.`));
  }
  karta.append(pola);
  // Klient dobiera ciężar: wpisany w pole przelicza rampę na kilogramy.
  ramkaRampy?.polacz(wCiezar);

  // Ocena przy każdej serii — przy wcześniejszych bez „OK", patrz ocenaWPanelu.
  // Bez oceny, gdy klient dopiero dobiera ciężar (trener, 10.10.2026: „jeżeli
  // ktoś ma na panelu »dobierz ciężar«, bo jeszcze nie robił tego ćwiczenia,
  // nie powinny być widoczne opcje za lekko / za ciężko”). Nie ma ciężaru
  // z planu, do którego by się odnosiła — a poszłaby do trenera i do kolejnych
  // tygodni jako korekta ciężaru, który klient sam wybrał. Za lekko? Dokłada
  // w następnej serii i ją wpisuje — od niej liczymy od nowa.
  if (!c.maks && !dobieraCiezar(c)) karta.append(ocenaWPanelu(k, c, wCiezar, bezCiezaru, wPowt));
  else if (dobieraCiezar(c)) karta.append(bezOcenyPrzyDoborze());

  const poprawka = prowadzenie.zrobione.includes(k.klucz);
  const zakoncz = el("button", "glowny szeroki", poprawka ? "Zapisz poprawkę" : "Zakończ serię");
  zakoncz.onclick = () => {
    zapiszSerie(k, c, bezCiezaru ? null : wCiezar.value, wPowt.value);
    dalej(k, kroki);
  };
  karta.append(zakoncz);
  karta.append(cofnij());
  return karta;
}

/** „← poprzednia" — jedno błędne dotknięcie nie może kosztować treningu. */
function cofnij() {
  const blok = el("div", "pod-panelem");
  if (prowadzenie.krok > 0) {
    const b = el("button", "link", "← poprzednia seria");
    b.onclick = () => {
      prowadzenie.krok = Math.max(0, prowadzenie.krok - 1);
      prowadzenie.doKiedy = null;
      zapiszProwadzenie();
      rysujPanel();
    };
    blok.append(b);
  }
  const lista = el("button", "link", "Cały dzień na liście");
  lista.onclick = () => otworz("#ekran-trening");
  blok.append(lista);
  return blok;
}

/**
 * Zapis jednej serii. Idzie cała lista serii ćwiczenia — serwer trzyma
 * wszystkie, a najcięższą (tę, z której liczy się 1RM) wylicza sam.
 */
function zapiszSerie(k, c, ciezarTekst, powtTekst) {
  const ciezar = Number(String(ciezarTekst ?? "").replace(",", ".")) || null;
  const powtorzenia = Number(powtTekst) || null;
  const serie = serieWykonane(c).slice();
  while (serie.length < k.seria - 1) serie.push({ ciezar: null, powtorzenia: null });
  serie[k.seria - 1] = { ciezar, powtorzenia };
  const lista = listaSerii(serie);
  if (JSON.stringify(lista) === JSON.stringify(serieWykonane(c))) return;
  wyslijSerie(c, lista);
}

/** Krok do przodu. Przerwa wchodzi po rundzie — i nigdy po ostatniej serii dnia. */
function dalej(k, kroki) {
  const zrobione = new Set(prowadzenie.zrobione);
  const poprawka = zrobione.has(k.klucz);
  zrobione.add(k.klucz);
  prowadzenie.zrobione = [...zrobione];
  const teraz = kroki.findIndex((x) => x.klucz === k.klucz);
  prowadzenie.krok = nastepnaNiezrobiona(kroki, zrobione, teraz);
  const koniecTreningu = prowadzenie.krok >= kroki.length;
  const zPrzerwa = !poprawka && !koniecTreningu && k.koniecRundy && k.przerwa > 0;
  prowadzenie.doKiedy = zPrzerwa ? Date.now() + k.przerwa * 1000 : null;
  prowadzenie.przerwa = zPrzerwa ? k.przerwa : 0;
  zapiszProwadzenie();
  rysujPanel();
}

function panelPrzerwy(nastepny, d) {
  const karta = el("div", "panel-karta przerwa");

  const pierscien = el("div", "pierscien");
  pierscien.id = "pierscien";
  const srodek = el("div", "pierscien-srodek");
  const licznik = el("div", "licznik", czasTekst(zostaloSekund()));
  licznik.id = "licznik";
  srodek.append(licznik, el("div", "etykieta", "PRZERWA"));
  pierscien.append(srodek);
  karta.append(pierscien);

  const opis = nastepny.typ === "topset"
    ? `TOP SET · ${nastepny.nazwa}`
    : (() => {
      const c = d.cwiczenia.find((x) => x.positionId === nastepny.positionId);
      return c ? `${c.lp} ${c.nazwa} · seria ${nastepny.seria} z ${nastepny.zSerii}` : "";
    })();
  karta.append(el("p", "dalej", `Dalej: ${opis}`));

  const akcje = el("div", "akcje-przerwy");
  const pomin = el("button", "glowny", "Pomiń przerwę");
  pomin.onclick = () => zakonczPrzerwe(false);
  const dodaj = el("button", "poboczny", `+${DOLOZ_SEKUND} s`);
  dodaj.onclick = () => {
    prowadzenie.doKiedy += DOLOZ_SEKUND * 1000;
    prowadzenie.przerwa += DOLOZ_SEKUND;
    zapiszProwadzenie();
    odswiezOdliczanie();
  };
  akcje.append(pomin, dodaj);
  karta.append(akcje);
  return karta;
}

/**
 * Odliczanie liczone ze **znacznika końca**, nie z odejmowania sekundy co tyknięcie.
 *
 * Telefon na siłowni leży zablokowany w kieszeni, a przeglądarka w tle zwalnia
 * albo zatrzymuje `setInterval`. Licznik odejmujący po jednym pokazałby po
 * powrocie czas, który nie minął — i odesłał klienta do sztangi za wcześnie
 * albo kazał mu czekać w nieskończoność. Ze znacznika wychodzi zawsze prawda,
 * choćby aplikacja nie tykała ani razu.
 */
const zostaloSekund = () =>
  prowadzenie?.doKiedy ? (prowadzenie.doKiedy - Date.now()) / 1000 : 0;

function uruchomOdliczanie() {
  if (tykanie) return;
  tykanie = setInterval(odswiezOdliczanie, 500);
}

function zatrzymajOdliczanie() {
  if (tykanie) { clearInterval(tykanie); tykanie = null; }
}

function odswiezOdliczanie() {
  if (!prowadzenie?.doKiedy) { zatrzymajOdliczanie(); return; }
  const zostalo = zostaloSekund();
  if (zostalo <= 0) { zakonczPrzerwe(true); return; }
  const licznik = $("#licznik");
  if (!licznik) { zatrzymajOdliczanie(); return; }   // panel zniknął spod licznika
  licznik.textContent = czasTekst(zostalo);
  const przeszlo = 100 * (1 - zostalo / Math.max(1, prowadzenie.przerwa));
  $("#pierscien")?.style.setProperty("--wypelnienie", `${Math.min(100, przeszlo)}%`);
}

/** `samo` = przerwa doszła do zera. Wtedy telefon ma dać znać — leży w kieszeni. */
function zakonczPrzerwe(samo) {
  zatrzymajOdliczanie();
  prowadzenie.doKiedy = null;
  prowadzenie.przerwa = 0;
  zapiszProwadzenie();
  // Wibracja działa na Androidzie; iPhone ją ignoruje i nic się nie dzieje.
  // Lepsze to niż nic — dźwięku nie odtworzymy, bo przeglądarka wymaga
  // dotknięcia ekranu tuż przed, a klient trzyma wtedy sztangę.
  if (samo) { try { navigator.vibrate?.([200, 100, 200]); } catch { /* brak wsparcia */ } }
  rysujPanel();
}

function panelKonca(d) {
  const karta = el("div", "panel-karta koniec-panel");
  karta.append(el("div", "duzy-znak", "✓"));
  karta.append(el("h2", "", "Wszystkie serie za Tobą"));

  const wpisane = d.cwiczenia.flatMap(serieWykonane).filter((s) => !pustaSeria(s)).length;
  const bezOceny = d.cwiczenia.filter((c) => !c.feedback && !c.maks).length;
  karta.append(el("p", "drobne",
    `Zapisanych serii: ${wpisane}.`
    + (bezOceny > 0 ? ` Ćwiczenia bez oceny (${bezOceny}) zapiszą się jako „OK".` : "")));

  const zakoncz = el("button", "glowny szeroki", d.ukonczony ? "Trening zakończony ✓" : "Zakończ trening");
  zakoncz.disabled = d.ukonczony;
  zakoncz.onclick = () => zakonczTrening();
  karta.append(zakoncz);

  const cofnijSie = el("button", "link", "← wróć do ostatniej serii");
  cofnijSie.onclick = () => {
    prowadzenie.krok = Math.max(0, prowadzenie.krok - 1);
    zapiszProwadzenie();
    rysujPanel();
  };
  const pod = el("div", "pod-panelem");
  pod.append(cofnijSie);
  karta.append(pod);
  return karta;
}

/** Domknięcie dnia — tak samo z listy, jak z prowadzenia. */
function zakonczTrening() {
  const d = dzienBiezacy();
  if (!d || d.ukonczony) return;
  wyslij("/dzien", { dzien: d.dzien, tydzien: biezacy.tydzien }, () => {
    d.ukonczony = true;
    for (const c of d.cwiczenia) c.feedback ??= "OK";
  });
  zatrzymajOdliczanie();
  wroc();
}

function rysujPomiary() {
  const kontener = $("#pomiary");
  kontener.replaceChildren();

  if (widok.doZmierzenia.some((p) => !p.bezSerii)) {
    kontener.append(el("p", "wskazowka-pomiarow",
      `Jedna seria do odmowy, przy dobrej technice. Najwyżej ${MAKS_POWTORZEN} `
      + "powtórzeń — jeśli wychodzi więcej, dołóż kilogramów i spróbuj ponownie. "
      + "Seria liczy się dopiero po „Zapisz”."));
  }

  for (const p of widok.doZmierzenia) kontener.append(kartaPomiaru(p));
}

/**
 * 1RM z ciężaru i powtórzeń — podgląd przed zapisem, z tabeli silnika, którą
 * przysyła serwer (`procent1RM`). `null`, gdy nie ma z czego (stary widok
 * w pamięci telefonu albo powtórzenia poza tabelą). Zapisane 1RM liczy serwer.
 */
function podglad1RM(ciezar, powtorzenia) {
  const procent = widok?.procent1RM?.[powtorzenia];
  if (!(ciezar > 0) || !(procent > 0)) return null;
  const x = ciezar / (procent / 100);
  return Math.round((x + Number.EPSILON * x) * 10) / 10;
}

/**
 * Skąd jest 1RM, które plan liczy teraz — w osobnej linijce nad polami.
 *
 * Trener 02.10.2026: 1RM policzone z serii na treningu stało w kolumnie obok
 * pustych pól serii maksymalnej, jakby z nich wyszło. Teraz liczba obok pól
 * to wyłącznie podgląd tego, co jest w polach.
 */
function zrodlo1RM(p) {
  const blok = el("div", "obecne-1rm");
  if (!p.oneRM) {
    blok.append(el("div", "wartosc-1rm", "Jeszcze bez 1RM"));
    blok.append(el("p", "powod",
      "Wpisz serię maksymalną albo zrób serię na treningu — policzę 1RM z niej."));
    return blok;
  }
  const wiersz = el("div", "wartosc-1rm");
  wiersz.append("Twoje 1RM teraz: ", el("strong", "", `${liczba(p.oneRM)} kg`));
  blok.append(wiersz);
  if (p.kalibracja) {
    blok.append(el("p", "powod",
      `Policzone z Twojej serii na treningu: ${liczba(p.kalibracja.ciezar)} kg × `
      + `${p.kalibracja.powtorzenia} przy RPE ${liczba(p.kalibracja.rpe)}.`));
  } else if (p.ciezar && p.powtorzenia) {
    const z = p.zastapionaKalibracja;
    blok.append(el("p", "powod",
      `Z serii maksymalnej: ${liczba(p.ciezar)} kg × ${p.powtorzenia}.`
      + (z?.oneRM ? ` Zastąpiła 1RM z treningu (${liczba(z.oneRM)} kg) — `
        + "po usunięciu serii wróci." : "")));
  } else {
    blok.append(el("p", "powod", "Ustawione przez trenera."));
  }
  return blok;
}

function kartaPomiaru(p) {
  const karta = el("div", "pomiar");
  karta.dataset.cwiczenie = p.cwiczenieId;
  const nazwa = el("div", "nazwa", p.nazwa);
  const film = przyciskFilmu(p.film, p.karta, " ▶");
  if (film) nazwa.append(film);
  karta.append(nazwa);

  /*
   * Ćwiczenia, przy których nie ma czego mierzyć — masa ciała, czas,
   * dystans, ciężar ustawiany wprost przez trenera.
   *
   * Zostają na liście, ale bez pól. Wcześniej pola były wszędzie: klient
   * wpisywał „10 kg × 15" przy ćwiczeniu na masie ciała, a w planie widział
   * „masa ciała" i miał prawo sądzić, że aplikacja zgubiła jego liczby.
   * Jedno zdanie zamiast dwóch pól kosztuje mniej niż kwadrans zastanawiania
   * się, co się zepsuło.
   */
  if (p.bezSerii) {
    karta.classList.add("bez-serii");
    karta.append(el("p", "powod", p.bezSerii));
    return karta;
  }

  karta.append(zrodlo1RM(p));

  const naglowki = el("div", "etykiety");
  naglowki.append(el("span", "", "ciężar"), el("span", "", "powt."), el("span", "", "1RM z serii"));
  karta.append(naglowki);

  const pola = el("div", "pola");
  const wCiezar = el("input");
  const wPowt = el("input");
  for (const [input, wartosc, tytul] of [
    [wCiezar, p.ciezar, "kg"], [wPowt, p.powtorzenia, "powt."],
  ]) {
    input.type = "number";
    input.inputMode = "decimal";
    input.min = "0";
    input.placeholder = tytul;
    input.value = wartosc ?? "";
  }
  // Tabela RPE kończy się na piętnastu powtórzeniach — powyżej nie ma
  // z czego policzyć ciężaru. Lepiej powiedzieć to przy polu niż odmówić
  // po wysłaniu.
  wPowt.max = String(MAKS_POWTORZEN);
  wPowt.title = `Najwyżej ${MAKS_POWTORZEN} powtórzeń — przy większej liczbie `
    + "dołóż kilogramów.";
  const rm = el("span", "rm", "—");
  pola.append(wCiezar, wPowt, rm);
  karta.append(pola);

  /*
   * Zapis dopiero przyciskiem (trener 02.10.2026: „wpisanie serii maksymalnej
   * zmienia ten RM bezpowrotnie — jak coś wpiszę testowo i usunę, to się
   * zapisuje”). Wcześniej seria szła na serwer przy wyjściu z pola i od razu
   * przestawiała ciężary w całym planie. Teraz pola tylko liczą podgląd obok,
   * a plan zmienia się po „Zapisz”.
   */
  const akcje = el("div", "akcje-pomiaru");
  const zapiszPrzycisk = el("button", "zapisz-pomiar", "Zapisz serię");
  const notka = el("p", "notka-pomiaru");
  akcje.append(zapiszPrzycisk);
  const maSerie = Boolean(p.ciezar && p.powtorzenia && !p.kalibracja);
  if (maSerie) {
    const usun = el("button", "link usun-pomiar", p.zastapionaKalibracja?.oneRM
      ? `Usuń serię — wróci 1RM z treningu (${liczba(p.zastapionaKalibracja.oneRM)} kg)`
      : "Usuń serię");
    usun.onclick = () => {
      // Bez kalibracji pod spodem usunięcie zostawia ćwiczenie bez 1RM —
      // a plan bez ciężarów. To nie może się stać jednym przypadkowym dotknięciem.
      if (!p.zastapionaKalibracja && !confirm(
        "Usunąć serię maksymalną? Ćwiczenie zostanie bez 1RM, dopóki nie wpiszesz "
        + "nowej serii albo nie zrobisz serii na treningu.")) return;
      wyslijPomiar(p, karta, 0, 0);
    };
    akcje.append(usun);
  }
  karta.append(akcje, notka);

  const odswiez = () => {
    const ciezar = Number(wCiezar.value) || 0;
    const powtorzenia = Number(wPowt.value) || 0;
    const pelna = ciezar > 0 && powtorzenia > 0;
    const bezZmian = ciezar === (maSerie ? p.ciezar : 0) && powtorzenia === (maSerie ? p.powtorzenia : 0);
    const wynik = pelna ? podglad1RM(ciezar, powtorzenia) : null;
    rm.textContent = wynik ? `${liczba(wynik)} kg` : "—";
    rm.classList.toggle("niezapisane", pelna && !bezZmian);
    zapiszPrzycisk.classList.toggle("ukryty", !pelna || bezZmian || powtorzenia > MAKS_POWTORZEN);
    notka.textContent = !pelna || bezZmian ? ""
      : powtorzenia > MAKS_POWTORZEN ? `Najwyżej ${MAKS_POWTORZEN} powtórzeń — dołóż kilogramów.`
        : p.kalibracja ? "Niezapisane. „Zapisz” zastąpi 1RM z treningu — usunięcie serii je przywróci."
          : "Niezapisane — plan zmieni się po „Zapisz”.";
  };
  wCiezar.oninput = odswiez;
  wPowt.oninput = odswiez;
  zapiszPrzycisk.onclick = () =>
    wyslijPomiar(p, karta, Number(wCiezar.value) || 0, Number(wPowt.value) || 0);
  wPowt.onkeydown = (e) => {
    if (e.key === "Enter" && !zapiszPrzycisk.classList.contains("ukryty")) zapiszPrzycisk.click();
  };
  odswiez();
  return karta;
}

/**
 * Zapis albo usunięcie (0 × 0) serii maksymalnej. Kartę rysuje od nowa —
 * zapis idzie przyciskiem, więc nikt nie pisze w tym momencie w polu.
 */
async function wyslijPomiar(p, karta, ciezar, powtorzenia) {
  await wyslij("/serie", { cwiczenieId: p.cwiczenieId, ciezar, powtorzenia }, () => {
    // Bez zasięgu karta ma od razu pokazać to, co pokaże serwer. Zmiana idzie
    // do widoku, który jest teraz w pamięci — karta mogła powstać z poprzedniego.
    p = widok?.doZmierzenia.find((x) => x.cwiczenieId === p.cwiczenieId) ?? p;
    if (ciezar > 0) {
      if (p.kalibracja) {
        p.zastapionaKalibracja = { oneRM: p.oneRM, ...p.kalibracja };
        p.kalibracja = null;
      }
      p.ciezar = ciezar;
      p.powtorzenia = powtorzenia;
      p.oneRM = podglad1RM(ciezar, powtorzenia) ?? p.oneRM;
    } else {
      const z = p.zastapionaKalibracja;
      p.ciezar = null;
      p.powtorzenia = null;
      p.oneRM = z?.oneRM ?? null;
      p.kalibracja = z ? { ciezar: z.ciezar, powtorzenia: z.powtorzenia, rpe: z.rpe } : null;
      p.zastapionaKalibracja = null;
    }
  }, { odswiez: false });
  const swiezy = widok?.doZmierzenia.find((x) => x.cwiczenieId === p.cwiczenieId) ?? p;
  if (karta.isConnected) karta.replaceWith(kartaPomiaru(swiezy));
  rysuj({ pomiary: false });   // baner „uzupełnij 1RM" i ciężary w planie
}

/**
 * Podpowiedź o dodaniu do ekranu głównego.
 *
 * Aplikacja ma ikonę, otwiera się na pełnym ekranie i działa bez zasięgu —
 * ale **nikt tego sam nie odkrywa**. Bez jednego zdania klient do końca cyklu
 * będzie otwierał link z SMS-a, czyli używał zakładki zamiast aplikacji.
 *
 * Trzy zasady, żeby to była podpowiedź, a nie naganianie:
 *   1. dopiero **po pierwszym domkniętym treningu** — zanim aplikacja się
 *      przyda, proszenie o miejsce na ekranie głównym jest bezczelne;
 *   2. **raz**; „nie teraz" znaczy nigdy więcej;
 *   3. nigdy, gdy aplikacja jest już dodana.
 *
 * Android daje na to zdarzenie i przycisk. iOS nie daje nic — tam zostaje
 * napisanie wprost, w co dotknąć, bo inaczej podpowiedź jest bezużyteczna.
 */
let zdarzenieInstalacji = null;

addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  zdarzenieInstalacji = e;
});

const jestDodana = () =>
  matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function odlozInstalacje() {
  try { localStorage.setItem(KLUCZ_INSTALACJI, "nie"); } catch { /* pełna pamięć */ }
  $("#baner-instalacji").classList.add("ukryty");
}

function moznaPokazacInstalacje() {
  if (jestDodana()) return false;
  try { if (localStorage.getItem(KLUCZ_INSTALACJI)) return false; } catch { return false; }
  // Dopiero gdy aplikacja zdążyła się do czegoś przydać.
  return (widok?.tygodnie ?? []).flatMap((t) => t.dni).some((d) => d.ukonczony);
}

function rysujInstalacje() {
  const baner = $("#baner-instalacji");
  if (!moznaPokazacInstalacje()) {
    baner.classList.add("ukryty");
    return;
  }

  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $("#instalacja-tresc").textContent = zdarzenieInstalacji
    ? "Dodaj tę stronę do ekranu głównego — otworzy się jak aplikacja, "
      + "na pełnym ekranie i bez szukania linku."
    : iOS
      ? "Dotknij ikony udostępniania na dole, potem „Do ekranu początkowego”. "
        + "Trening otworzy się jak aplikacja, bez szukania linku."
      : "W menu przeglądarki wybierz „Dodaj do ekranu głównego”. Trening "
        + "otworzy się jak aplikacja, bez szukania linku.";

  $("#zainstaluj").classList.toggle("ukryty", !zdarzenieInstalacji);
  baner.classList.remove("ukryty");
}

$("#instalacja-nie").onclick = odlozInstalacje;
$("#zainstaluj").onclick = async () => {
  if (!zdarzenieInstalacji) return;
  zdarzenieInstalacji.prompt();
  await zdarzenieInstalacji.userChoice;
  zdarzenieInstalacji = null;
  odlozInstalacje();   // niezależnie od decyzji — pytamy raz
};

// ── obsługa przycisków ─────────────────────────────────────────────
$("#wroc-z-treningu").onclick = wroc;
$("#wroc-z-pomiarow").onclick = wroc;
$("#wroc-z-modulow").onclick = wroc;
$("#wroc-z-postepu").onclick = wroc;
$("#do-pomiarow").onclick = () => otworz("#ekran-pomiary");
// Zwinięcie banera „Skąd wziąć ciężary”. Klik, a nie zdarzenie „toggle” —
// z tego samego powodu co przy tygodniach: „toggle” strzela też wtedy, gdy
// `rysuj` ustawia `open`, i zapisałby stan domyślny jako wybór klienta.
// W chwili kliknięcia `open` ma jeszcze stan sprzed przełączenia.
$("#pomiary-baner > summary").addEventListener("click", () => {
  const zwija = $("#pomiary-baner").open;
  pomiaryZwinieteW = zwija ? kluczZwiniecia() : null;
  try {
    if (zwija) localStorage.setItem(KLUCZ_ZWINIECIA_POMIAROW, pomiaryZwinieteW);
    else localStorage.removeItem(KLUCZ_ZWINIECIA_POMIAROW);
  } catch { /* pełna pamięć — zwinięcie trwa do zamknięcia aplikacji */ }
});
// Prosto w prowadzenie — tam każda seria ma własny panel z objaśnieniem, jak
// dobrać ciężar, a tego właśnie potrzebuje ktoś, kto zaczyna bez 1RM.
$("#od-razu").onclick = () => {
  const cel = pierwszyNiezrobiony();
  if (!cel) return;
  biezacy = cel;
  otworz("#ekran-seria");
};
$("#pokaz-pomiary").onclick = () => otworz("#ekran-pomiary");
$("#pokaz-moduly").onclick = () => otworz("#ekran-moduly");
$("#pokaz-postep").onclick = () => otworz("#ekran-postep");
$("#wroc-z-serii").onclick = () => otworz("#ekran-trening");
$("#prowadz").onclick = () => otworz("#ekran-seria");

// Powrót do aplikacji po zablokowanym ekranie. Bez tego licznik przerwy
// dochodził do zera w tle, a klient po odblokowaniu telefonu widział przez
// chwilę czas sprzed blokady — czyli dokładnie to, czemu znacznik końca
// zamiast odejmowania miał zapobiec.
addEventListener("visibilitychange", () => {
  if (!document.hidden && prowadzenie?.doKiedy) odswiezOdliczanie();
});

$("#zakoncz").onclick = () => zakonczTrening();

/** Cały ekran zastąpiony jednym komunikatem — bez planu nie ma czego rysować. */
function komunikat(tytul, tresc) {
  document.body.replaceChildren();
  const blok = el("div", "komunikat-pelny");
  blok.append(el("h1", "", tytul), el("p", "", tresc));
  document.body.append(blok);
}

// ── start ──────────────────────────────────────────────────────────
(async () => {
  // Najpierw to, co mamy lokalnie — żeby aplikacja otworzyła się bez sieci.
  const zapamietany = localStorage.getItem(KLUCZ_WIDOKU);
  if (zapamietany) {
    widok = JSON.parse(zapamietany);
    rysuj();
  }

  try {
    const odp = await fetch(`/api/klient/${TOKEN}`);
    if (odp.ok) {
      const swiezy = await odp.json();

      // Link działa, ale trener nie wysłał jeszcze planu. To normalny stan
      // między cyklami — i drugi, mniej oczywisty: trener cofnął plan do
      // szkicu, żeby go poprawić, a klient stoi właśnie na siłowni.
      //
      // Dopóki nie ma nic zapisanego, zostaje komunikat. Ale gdy klient ma
      // u siebie poprzedni cykl, zabranie mu go z ekranu jest najgorszym
      // z możliwych wyjść: traci trening, który miał przed sobą, a kolejka
      // z ocenami nie zostaje nawet wysłana — bo `return` był przed nią.
      if (swiezy.czekaNaPlan) {
        if (!zapamietany) {
          komunikat(`Cześć ${swiezy.klient}!`,
            "Trener przygotowuje Twój plan. Ten link zostaje ten sam — "
            + "otwórz go ponownie, gdy dostaniesz wiadomość.");
          return;
        }
        $("#baner-przygotowania").classList.remove("ukryty");
        pokazStanPolaczenia(true);
        await synchronizuj();
        zarejestrujWorkera();
        return;
      }

      widok = swiezy;
      zapiszWidokLokalnie();
      pokazStanPolaczenia(true);
      rysuj();
    } else if (!zapamietany) {
      komunikat("Link nieaktualny", "Poproś trenera o nowy.");
      return;
    }
  } catch {
    pokazStanPolaczenia(false);
    if (!zapamietany) {
      komunikat("Brak połączenia i nic zapisanego", "Otwórz raz z zasięgiem.");
      return;
    }
  }

  await synchronizuj();
  zarejestrujWorkera();
})();

function zarejestrujWorkera() {
  if ("serviceWorker" in navigator) {
    // Zakres jawnie z korzenia, bo klient otwiera `/k/<token>`, a plik workera
    // leży w `/klient/`. Domyślny zakres to katalog pliku — worker rejestrował
    // się poprawnie i nigdy nie przejmował strony, którą klient faktycznie
    // otwiera. Tryb offline był przez to ozdobą: bez zasięgu przeglądarka
    // pokazywała własny błąd, a zapisany lokalnie plan nie miał kto odczytać.
    // Szerszy zakres wymaga nagłówka `Service-Worker-Allowed` od serwera.
    navigator.serviceWorker.register("/klient/sw.js", { scope: "/" })
      .catch(() => { /* nieistotne — aplikacja działa, tylko bez trybu offline */ });
  }
}
