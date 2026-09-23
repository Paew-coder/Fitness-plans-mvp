/**
 * Aplikacja klienta — dzisiejszy trening w telefonie.
 *
 * Zasada: na siłowni zasięg bywa żaden, więc nic nie może się zgubić.
 * Każde dotknięcie oceny zapisuje się lokalnie od razu, a wysyłka do serwera
 * czeka w kolejce, aż wróci połączenie.
 */

const TOKEN = location.pathname.split("/")[2] ?? "";
const KLUCZ_KOLEJKI = `kolejka-${TOKEN}`;
const KLUCZ_WIDOKU = `widok-${TOKEN}`;
const KLUCZ_HISTORII = `historia-${TOKEN}`;
const KLUCZ_INSTALACJI = `instalacja-${TOKEN}`;
const RZYMSKIE = ["I", "II", "III", "IV", "V"];

let widok = null;
let historia = null;           // wszystkie cykle — dociągana przy otwarciu postępu
let biezacy = null;            // { tydzien, dzien }
const otwarteWykonania = new Set();   // positionId z rozwiniętymi polami „co poszło"

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
  kolejka.dodaj({ sciezka, dane: { ...dane, planId: widok?.planId ?? null } });
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
  const cel = ustawEkran(e.state?.ekran ?? EKRAN_GLOWNY);
  // Gdy trafiliśmy gdzie indziej, niż mówił wpis (trening bez wybranego dnia),
  // prostujemy wpis — inaczej kolejne „wstecz" liczyłoby ekran, którego nie ma.
  if (cel !== e.state?.ekran) history.replaceState({ ekran: cel }, "");
});

// Wejściowy wpis dostaje własny stempel, żeby `popstate` wiedział, gdzie wylądował.
history.replaceState({ ekran: EKRAN_GLOWNY }, "");

/** `pomiary: false` zostawia pola serii maksymalnych w spokoju — patrz `zapisz` niżej. */
function rysuj({ pomiary = true } = {}) {
  if (!widok) return;
  $("#tytul").textContent = `${widok.klient} ${widok.wersja}.0`;

  // Bez ćwiczeń, przy których nie ma czego mierzyć (masa ciała, czas…).
  // Liczone razem z nimi nie schodziły nigdy do zera — i baner o brakujących
  // ciężarach wisiał przez cały cykl w każdym planie z choćby jednym plankiem.
  const brakuje = widok.doZmierzenia.filter((p) => !p.oneRM && !p.bezSerii);
  $("#pomiary-baner").classList.toggle("ukryty", brakuje.length === 0);
  $("#pomiary-tresc").textContent = brakuje.length === 1
    ? "W jednym ćwiczeniu nie znam jeszcze Twojego ciężaru. Wybierz, jak go ustalić."
    : `W ${brakuje.length} ćwiczeniach nie znam jeszcze Twoich ciężarów. `
      + "Wybierz, jak je ustalić.";
  if (!$("#rpe-baner").firstChild) $("#rpe-baner").append(objasnienieRPE());
  const zrobione = widok.tygodnie.flatMap((t) => t.dni).filter((d) => d.ukonczony).length;
  const wszystkie = widok.tygodnie.flatMap((t) => t.dni).length;
  $("#podtytul").textContent = `${zrobione} z ${wszystkie} treningów za Tobą`;

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
    w.append(el("span", "nazwa", `Tydzień ${t.tydzien}`));
    const kropki = el("span", "tresc kropki");
    for (let i = 0; i < t.zDnia; i++) {
      kropki.append(el("span", `kropka ${i < t.ukonczonych ? "zrobiona" : ""}`, "●"));
    }
    w.append(kropki);
    f.append(w);
  }
  kontener.append(f);

  // waga
  const waga = el("div", "cwiczenie");
  waga.append(el("div", "modul-tytul", "Waga ciała"));
  const ostatnia = p.waga.punkty.at(-1);
  waga.append(el("div", "modul-poziom", ostatnia
    ? `${liczba(ostatnia.kg)} kg${p.waga.zmianaKg ? `  (${zeZnakiem(p.waga.zmianaKg)} kg)` : ""}`
    : "—"));
  const poleWagi = el("div", "wykonanie-pola");
  const wKg = el("input");
  wKg.type = "number";
  wKg.inputMode = "decimal";
  wKg.min = "0";
  wKg.step = "0.1";
  wKg.placeholder = "kg";
  wKg.onchange = () => {
    const kg = Number(wKg.value) || 0;
    if (kg <= 0) return;
    wyslij("/waga", { kg }, () => {
      // Dzień lokalny telefonu, nie UTC. Ważenie o wpół do pierwszej w nocy
      // lądowało pod wczorajszą datą, bo w UTC to jeszcze wczoraj — a serwer
      // zapisywał je pod dzisiejszą. Na ekranie pojawiały się dwa wpisy.
      const dzisiaj = new Date().toLocaleDateString("sv-SE");
      p.waga.punkty = [...p.waga.punkty.filter((x) => x.data !== dzisiaj), { data: dzisiaj, kg }];
    }, { odswiez: false });
    wKg.value = "";
  };
  poleWagi.append(wKg, el("span", "razy", "dziś"));
  waga.append(poleWagi);
  waga.append(el("p", "brama",
    "Ile ważysz Ty, nie sztanga. Najlepiej rano, po przebudzeniu."));
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
    karta.append(el("div", "modul-poziom", c.zmianaKg === 0
      ? "bez zmiany"
      : `${zeZnakiem(c.zmianaKg)} kg${c.zmianaProc ? `  (${zeZnakiem(c.zmianaProc)}%)` : ""}`));
    for (const punkt of c.punkty) {
      const w = el("div", "modul-blok");
      w.append(el("span", "nazwa", `Tydzień ${punkt.tydzien}`));
      w.append(el("span", "tresc",
        `${liczba(punkt.ciezar)} kg × ${punkt.powtorzenia}  ·  1RM ≈ ${liczba(punkt.oneRM)} kg`));
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

  if (dawka) {
    const karta = el("div", "cwiczenie");
    karta.append(el("div", "modul-tytul", "Oddech"));
    if (dawka.zatrzymane) {
      karta.append(el("p", "brama", dawka.brama));
    } else {
      karta.append(el("div", "modul-poziom", `${dawka.poziom} · ${dawka.czestotliwosc}`));
      for (const [nazwa, tresc] of [
        ["A — rozgrzewka", dawka.blokA], ["B — praca", dawka.blokB], ["C — wyciszenie", dawka.blokC],
      ]) {
        const w = el("div", "modul-blok");
        w.append(el("span", "nazwa", nazwa), el("span", "tresc", tresc));
        karta.append(w);
      }
      karta.append(el("p", "brama", dawka.brama));
    }
    kontener.append(karta);
  }

  for (const t of tygodnie) {
    const karta = el("div", "cwiczenie");
    karta.append(el("div", "modul-tytul",
      `Bieg · tydzień ${t.tydzien}${t.tydzien === 4 ? " (lżejszy)" : ""}`));
    for (const j of t.jednostki) {
      const w = el("div", "modul-jednostka");
      w.append(el("span", "nazwa", j.opis));
      const dane = [`${j.minutRazem} min`];
      if (j.tempoTekst) dane.push(`${j.tempoTekst} min/km`);
      // Bez wieku i bez zmierzonego HR max tętna nie da się policzyć —
      // a to zwykłe niedopełnione pole, nie awaria. Silnik oddaje wtedy
      // , więc sam obiekt nie wystarcza za warunek. Pytamy
      // o liczbę, bo to ona ma się tu pokazać.
      if (j.strefa?.odUd != null) dane.push(`${j.strefa.odUd}–${j.strefa.doUd} ud/min`);
      if (j.dystansKm !== null) dane.push(`≈ ${liczba(j.dystansKm)} km`);
      w.append(el("span", "dane", dane.join("  ·  ")));
      karta.append(w);
    }
    kontener.append(karta);
  }
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

/** Skąd się wziął ciężar — w tym treningu, w którym go policzyliśmy. */
const notkaKalibracji = (k) => el("p", "kalibracja",
  `✓ Policzone z Twojej serii: ${liczba(k.ciezar)} kg × ${k.powtorzenia} `
  + `przy RPE ${liczba(k.rpe)}`);

/** Pierwszy trening, którego klient jeszcze nie zrobił — tam prowadzi „zacznij od razu". */
function pierwszyNiezrobiony() {
  for (const t of widok.tygodnie) {
    const d = t.dni.find((x) => !x.ukonczony);
    if (d) return { tydzien: t.tydzien, dzien: d.dzien };
  }
  return null;
}

function rysujTygodnie() {
  const kontener = $("#tygodnie");
  kontener.replaceChildren();

  for (const t of widok.tygodnie) {
    const blok = el("div", "tydzien");
    blok.append(el("div", "tydzien-tytul", `Tydzień ${t.tydzien} z 6`));

    for (const d of t.dni) {
      const kafel = el("button", `dzien-kafel ${d.ukonczony ? "zrobiony" : ""}`);
      kafel.append(el("span", "nazwa", `Dzień ${RZYMSKIE[d.dzien - 1]}`));
      kafel.append(el("span", "ile", `${d.cwiczenia.length} ćwiczeń`));
      if (d.ukonczony) kafel.append(el("span", "ptaszek", "✓"));
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

  $("#trening-tytul").textContent =
    `Dzień ${RZYMSKIE[d.dzien - 1]} · tydzień ${biezacy.tydzien}`;
  const ocenione = d.cwiczenia.filter((c) => c.feedback).length;
  $("#trening-postep").textContent = d.ukonczony
    ? "Trening zakończony"
    : `${ocenione} z ${d.cwiczenia.length} ocenionych`;

  // TOP SET
  const top = $("#topset");
  top.replaceChildren();
  if (d.topSet?.cwiczenie) {
    top.classList.remove("ukryty");
    top.append(el("div", "etykieta", "TOP SET"));
    const wiersz = el("div", "wiersz");
    wiersz.append(el("span", "", d.topSet.cwiczenie.nazwa));
    wiersz.append(el("span", "ciezar", typeof d.topSet.ciezar === "number"
      ? `${liczba(d.topSet.ciezar)} kg`
      : d.topSet.ciezar === "— brak 1RM" ? "dobierz" : String(d.topSet.ciezar || "—")));
    top.append(wiersz);
    top.append(el("div", "drobne", `1 powtórzenie · RPE ${liczba(d.topSet.rpe)}`));
    if (d.topSet.ciezar === "— brak 1RM") top.append(el("div", "drobne", jakDobrac(1, d.topSet.rpe)));
    const stanTop = stanProwadzenia(d);
    const tuTop = stanTop?.tu?.typ === "topset";
    top.classList.toggle("biezace", tuTop);
    if (tuTop || stanTop?.zrobione.has("topset")) {
      top.append(przyciskStanu(tuTop ? "▶ Tu jesteś" : "✓ zrobione", tuTop,
        (k) => k.typ === "topset"));
    }
  } else {
    top.classList.add("ukryty");
  }

  // ćwiczenia
  const stan = stanProwadzenia(d);
  const kontener = $("#cwiczenia");
  kontener.replaceChildren(...d.cwiczenia.map((c) => kartaCwiczenia(c, stan)));

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
 * Zadanie serii jako równe kolumny: podpis nad liczbą — CIĘŻAR · POWT. · RPE.
 *
 * Wcześniej ciężar stał dużą czcionką, a powtórzenia, serie i RPE drobnym
 * szarym drukiem obok, i czytały się jak dopisek. Zgłoszone z testów: taki
 * zapis jest mało czytelny — a na sali powtórzenia są tak samo ważne jak
 * kilogramy. Ciężar zostaje pierwszy, bo to on idzie na sztangę.
 */
function kolumnyZadania({ ciezar, dobierz, serie, powtorzenia, rpe, jednostronne }) {
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
  if (typeof ciezar === "number") kolumna("kolumna-ciezar", "Ciężar", liczba(ciezar), "kg");
  else if (dobierz) kolumna("kolumna-ciezar slowo dobierz", "Ciężar", "dobierz");
  else kolumna("kolumna-ciezar slowo", "Ciężar", String(ciezar || "—"));
  if (serie != null) kolumna("kolumna-serie", "Serie", String(serie));
  kolumna("kolumna-powt", serie != null ? "Powt." : "Powtórzenia", String(powtorzenia ?? "—"),
    null, jednostronne ? "na stronę" : null);
  kolumna("kolumna-rpe", "RPE", liczba(rpe));
  return siatka;
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
function kartaCwiczenia(c, stan = null) {
  const tuJestes = stan?.tu?.positionId === c.positionId;
  const karta = el("div",
    `cwiczenie ${"BCDE".includes(c.grupa) ? "grupa" : ""} ${tuJestes ? "biezace" : ""}`);
  karta.dataset.position = c.positionId;

  const gora = el("div", "cwiczenie-gora");
  gora.append(el("span", "lp", c.lp || ""));
  gora.append(el("span", "nazwa", c.nazwa));
  if (c.film) {
    const a = el("a", "film", "▶ film");
    a.href = c.film;
    a.target = "_blank";
    a.rel = "noopener";
    gora.append(a);
  }
  karta.append(gora);

  if (stan) {
    const pasuje = (k) => k.positionId === c.positionId;
    const jego = stan.kroki.filter(pasuje);
    const ile = jego.filter((k) => stan.zrobione.has(k.klucz)).length;
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

  // Bez 1RM zamiast „— brak 1RM", które brzmiało jak awaria, stoi zaproszenie
  // do dobrania ciężaru. Klient nie musi wiedzieć, co to 1RM.
  karta.append(kolumnyZadania({
    ciezar: c.ciezar, dobierz: c.dobierzCiezar, serie: c.serie,
    powtorzenia: c.powtorzenia, rpe: c.rpe, jednostronne: c.jednostronne,
  }));
  if (c.dobierzCiezar) karta.append(doborCiezaru(c));
  if (c.kalibracja) karta.append(notkaKalibracji(c.kalibracja));

  const oceny = el("div", "oceny");
  for (const [wartosc, etykieta, klasa] of [
    ["za trudne", "Za trudne", "trudne"],
    ["OK", "OK", "ok"],
    ["za łatwe", "Za łatwe", "latwe"],
  ]) {
    const b = el("button",
      `ocena-przycisk ${c.feedback === wartosc ? `wybrana ${klasa}` : ""}`, etykieta);
    b.onclick = () => {
      const nowa = c.feedback === wartosc ? null : wartosc;
      wyslij("/odczucie",
        { positionId: c.positionId, tydzien: biezacy.tydzien, feedback: nowa },
        () => { c.feedback = nowa; });
    };
    oceny.append(b);
  }
  karta.append(oceny);
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
  return {
    ciezar: wlasna?.ciezar ?? poprzednia?.ciezar ?? (typeof c.ciezar === "number" ? c.ciezar : null),
    powtorzenia: wlasna?.powtorzenia ?? poprzednia?.powtorzenia ?? (c.powtorzenia || null),
  };
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
    () => { c.serieWykonane = serie; },
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
  const otwarte = otwarteWykonania.has(c.positionId) || (c.dobierzCiezar && !seriaWpisana(c));

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
   * Bez szarych liczb w polach. Były tu podpowiedzi (poprzednia seria albo
   * plan) i zgłoszone z testów wyszło, że na ekranie nie da się ich odróżnić
   * od wpisanych: jedna niepełna seria („18 kg" bez powtórzeń) i pusty wiersz
   * z podpowiedziami 18 × 8 wyglądały jak dwie zapisane serie. Tu puste pole
   * jest puste, a zapisuje się dokładnie to, co w nim stoi. Wygodne liczby
   * z góry zostały tam, gdzie się je zatwierdza przyciskiem — w prowadzeniu.
   */
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
      serie[i] = {
        ciezar: bezCiezaru ? null : Number(String(wCiezar.value).replace(",", ".")) || null,
        powtorzenia: Number(wPowt.value) || null,
      };
      zapisz();
    };
    wCiezar.onchange = zmien;
    wPowt.onchange = zmien;
    if (!bezCiezaru) w.append(wCiezar, el("span", "razy", "kg ×"));
    w.append(wPowt, el("span", "razy", "powt."));
    return w;
  };

  const wierszy = Math.max(planowane, serie.length);
  for (let i = 0; i < wierszy; i++) pola.append(wiersz(i));

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
  if (d.topSet?.cwiczenie) {
    kroki.push({
      typ: "topset",
      klucz: "topset",
      rpe: d.topSet.rpe,
      nazwa: d.topSet.cwiczenie.nazwa,
      ciezar: d.topSet.ciezar,
      przerwa: d.topSet.przerwaSekundy ?? PRZERWA_GDY_BRAK,
      koniecRundy: true,
    });
  }

  const grupy = [];
  for (const c of d.cwiczenia) {
    const ostatnia = grupy[grupy.length - 1];
    if (ostatnia && c.grupa && ostatnia.litera === c.grupa) ostatnia.cwiczenia.push(c);
    else grupy.push({ litera: c.grupa, cwiczenia: [c] });
  }

  for (const g of grupy) {
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
  const pasuje = (p) => p && p.planId === widok.planId
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

  $("#seria-tytul").textContent =
    `Dzień ${RZYMSKIE[d.dzien - 1]} · tydzień ${prowadzenie.tydzien}`;
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
    ...(kroki.some((k) => k.typ === "topset")
      ? [{ etykieta: "TOP", nazwa: "TOP SET", grupa: "TOP", pasuje: (k) => k.typ === "topset" }]
      : []),
    ...d.cwiczenia.map((c) => ({
      etykieta: (c.lp || "").replace(/\.$/, "") || "•",
      nazwa: c.nazwa,
      // Ćwiczenie bez numeru nie należy do żadnej superserii — stoi osobno.
      grupa: c.grupa || `bez-${c.positionId}`,
      pasuje: (k) => k.positionId === c.positionId,
    })),
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
    b.dataset.lp = poz.etykieta;
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

/** Nagłówek panelu: numer w planie, nazwa, film. */
function gloweczka(lp, nazwa, film) {
  const gora = el("div", "panel-gora");
  if (lp) gora.append(el("span", "lp", lp));
  gora.append(el("span", "nazwa", nazwa));
  if (film) {
    const a = el("a", "film", "▶ film");
    a.href = film;
    a.target = "_blank";
    a.rel = "noopener";
    gora.append(a);
  }
  return gora;
}

function panelTopSetu(k, kroki) {
  const karta = el("div", "panel-karta topset-panel");
  karta.append(el("div", "etykieta", "TOP SET"));
  karta.append(gloweczka("", k.nazwa, null));
  const bezCiezaru = k.ciezar === "— brak 1RM";
  karta.append(kolumnyZadania({
    ciezar: k.ciezar, dobierz: bezCiezaru, powtorzenia: 1, rpe: k.rpe,
  }));
  if (bezCiezaru) karta.append(el("p", "dobor", jakDobrac(1, k.rpe)));
  karta.append(el("p", "drobne",
    "Jedno ciężkie powtórzenie przed pracą. Wyniku nie wpisujesz — "
    + "to sprawdzian dnia, nie pomiar."));

  const zrobione = el("button", "glowny szeroki",
    prowadzenie.zrobione.includes(k.klucz) ? "Dalej" : "Zrobione");
  zrobione.onclick = () => dalej(k, kroki);
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

  karta.append(gloweczka(c.lp, c.nazwa, c.film));
  karta.append(el("div", "seria-numer",
    `Seria ${k.seria} z ${k.zSerii}${k.wGrupie ? ` · superseria ${k.litera}` : ""}`));

  karta.append(kolumnyZadania({
    ciezar: c.ciezar, dobierz: c.dobierzCiezar,
    powtorzenia: c.powtorzenia, rpe: c.rpe, jednostronne: c.jednostronne,
  }));
  if (c.dobierzCiezar) karta.append(doborCiezaru(c));
  if (c.kalibracja) karta.append(notkaKalibracji(c.kalibracja));

  // Co już poszło w tym treningu przy tym ćwiczeniu.
  const wpisane = serieCwiczenia(c.positionId).filter(Boolean);
  if (wpisane.length > 0) {
    const pasek = el("div", "serie-wpisane");
    wpisane.forEach((s, i) => {
      if (!s.ciezar && !s.powtorzenia) return;
      pasek.append(el("span", "chip", `${i + 1}: ${zapisSerii(s)}`));
    });
    if (pasek.childElementCount > 0) karta.append(pasek);
  }

  // Pola „co poszło" od razu z prawdziwymi liczbami: poprzednia seria, a przy
  // pierwszej plan. Klient zmienia tylko to, co było inaczej, i dotyka
  // „Zakończ serię" — zapisuje się dokładnie to, co widać w polach.
  //
  // Wcześniej stały tu szare podpowiedzi z planu, a zapisywało się tylko to,
  // co klient wpisał sam. Zgłoszone z testów: przy „9 kg · 10 powt." wpisane
  // samo „11" zapisało się jako 11 powtórzeń bez ciężaru, choć na ekranie
  // stało 9. Pusty zostaje tylko ciężar, którego nie ma skąd wziąć — przy
  // ćwiczeniu, w którym klient dopiero go dobiera.
  const bezCiezaru = BEZ_POLA_CIEZARU.includes(c.ciezar);
  const podpowiedz = podpowiedzSerii(c, k.seria - 1, serieCwiczenia(c.positionId));

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
  karta.append(pola);

  // Odczucie pytamy przy ostatniej serii — wcześniej klient nie wie jeszcze,
  // jak było, a pytany przy każdej serii przestaje odpowiadać.
  if (k.ostatniaSeria) {
    karta.append(el("div", "pytanie", "Jak było to ćwiczenie?"));
    const oceny = el("div", "oceny");
    for (const [wartosc, etykieta, klasa] of [
      ["za trudne", "Za trudne", "trudne"],
      ["OK", "OK", "ok"],
      ["za łatwe", "Za łatwe", "latwe"],
    ]) {
      const b = el("button",
        `ocena-przycisk ${c.feedback === wartosc ? `wybrana ${klasa}` : ""}`, etykieta);
      b.onclick = () => {
        const nowa = c.feedback === wartosc ? null : wartosc;
        wyslij("/odczucie",
          { positionId: c.positionId, tydzien: prowadzenie.tydzien, feedback: nowa },
          () => { c.feedback = nowa; }, { odswiez: false });
        rysujPanel();
      };
      oceny.append(b);
    }
    karta.append(oceny);
  }

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
  const bezOceny = d.cwiczenia.filter((c) => !c.feedback).length;
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

  const naglowki = el("div", "etykiety");
  naglowki.append(el("span", "", "ciężar"), el("span", "", "powt."), el("span", "", "1RM"));

  if (widok.doZmierzenia.some((p) => !p.bezSerii)) {
    kontener.append(el("p", "wskazowka-pomiarow",
      `Jedna seria do odmowy, przy dobrej technice. Najwyżej ${MAKS_POWTORZEN} `
      + "powtórzeń — jeśli wychodzi więcej, dołóż kilogramów i spróbuj ponownie."));
  }

  for (const p of widok.doZmierzenia) {
    const karta = el("div", "pomiar");
    const nazwa = el("div", "nazwa", p.nazwa);
    if (p.film) {
      const a = el("a", "film", " ▶");
      a.href = p.film; a.target = "_blank"; a.rel = "noopener";
      nazwa.append(a);
    }
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
      kontener.append(karta);
      continue;
    }

    // 1RM policzone z serii roboczej. Pola zostają puste — wpisana tu seria
    // maksymalna zastąpi to wyliczenie, i klient ma to wiedzieć, zanim wpisze.
    if (p.kalibracja) {
      karta.append(el("p", "powod",
        `Policzone z Twojej serii na treningu: ${liczba(p.kalibracja.ciezar)} kg × `
        + `${p.kalibracja.powtorzenia} przy RPE ${liczba(p.kalibracja.rpe)}. `
        + "Seria maksymalna wpisana niżej zastąpi to wyliczenie."));
    }

    karta.append(naglowki.cloneNode(true));

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
    const rm = el("span", "rm", p.oneRM ? `${liczba(p.oneRM)} kg` : "—");

    // Bez przerysowania — inaczej po wpisaniu ciężaru znika pole powtórzeń
    // spod palca. 1RM aktualizujemy punktowo, gdy wróci z serwera.
    const zapisz = async () => {
      const ciezar = Number(wCiezar.value) || 0;
      const powtorzenia = Number(wPowt.value) || 0;
      if (ciezar === (p.ciezar ?? 0) && powtorzenia === (p.powtorzenia ?? 0)) return;
      // Seria liczy się tylko w komplecie. Połowa pary kasowała na serwerze
      // poprzedni wpis, zanim klient zdążył dopisać drugie pole — a przy
      // ćwiczeniu policzonym z serii roboczej znaczyło to utratę 1RM
      // i ciężarów w całym planie. Oba pola puste to świadome wyczyszczenie.
      if ((ciezar > 0) !== (powtorzenia > 0)) return;
      await wyslij("/serie", { cwiczenieId: p.cwiczenieId, ciezar, powtorzenia }, () => {
        p.ciezar = ciezar || null;
        p.powtorzenia = powtorzenia || null;
      }, { odswiez: false });
      const swiezy = widok?.doZmierzenia.find((x) => x.cwiczenieId === p.cwiczenieId);
      if (swiezy) {
        p.oneRM = swiezy.oneRM;
        rm.textContent = swiezy.oneRM ? `${liczba(swiezy.oneRM)} kg` : "—";
      }
      rysuj({ pomiary: false });   // baner „uzupełnij 1RM" i ciężary w planie
    };
    wCiezar.onchange = zapisz;
    wPowt.onchange = zapisz;

    pola.append(wCiezar, wPowt, rm);
    karta.append(pola);
    kontener.append(karta);
  }
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
