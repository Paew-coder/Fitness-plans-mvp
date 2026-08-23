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
        return { wyslane: false, odrzucone };   // brak sieci — próbujemy później
      }
      if (odp.ok) {
        widok = await odp.json();
        zapiszWidokLokalnie();
      } else if (odp.status >= 500) {
        return { wyslane: false, odrzucone };   // serwer ma zły dzień, nie zadanie
      } else {
        odrzucone++;   // 4xx — tego zadania nie da się zapisać, wyrzucamy je
      }
      k = this.wczytaj().slice(1);
      this.zapisz(k);
    }
    return { wyslane: true, odrzucone };
  },
};

function zapiszWidokLokalnie() {
  try { localStorage.setItem(KLUCZ_WIDOKU, JSON.stringify(widok)); } catch { /* pełna pamięć */ }
}

function pokazStanPolaczenia(online) {
  $("#stan-polaczenia").classList.toggle("ukryty", online);
}

async function synchronizuj(odswiez = true) {
  const { wyslane, odrzucone } = await kolejka.wyslij();
  pokazStanPolaczenia(wyslane);
  if (odrzucone > 0) pokazOdrzucone(odrzucone);
  if (wyslane && odswiez) rysuj();
}

/**
 * Zadania, których serwer nie przyjmie nigdy — najczęściej dlatego, że trener
 * zdążył zmienić plan. Milczenie byłoby tu najgorsze: klient ma prawo wiedzieć,
 * że tych ocen u trenera nie ma.
 */
function pokazOdrzucone(ile) {
  const pasek = $("#stan-polaczenia");
  pasek.textContent = ile === 1
    ? "Jedna ocena nie została zapisana — trener zmienił plan."
    : `${ile} ocen nie zostało zapisanych — trener zmienił plan.`;
  pasek.classList.remove("ukryty");
  setTimeout(() => {
    pasek.textContent = TEKST_OFFLINE;
    pokazStanPolaczenia(navigator.onLine);
  }, 6000);
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
  "#ekran-trening": () => rysujTrening(),
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
  const cel = id === "#ekran-trening" && !biezacy ? EKRAN_GLOWNY : id;
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

  const brakuje = widok.doZmierzenia.filter((p) => !p.oneRM);
  $("#pomiary-baner").classList.toggle("ukryty", brakuje.length === 0);
  const zrobione = widok.tygodnie.flatMap((t) => t.dni).filter((d) => d.ukonczony).length;
  const wszystkie = widok.tygodnie.flatMap((t) => t.dni).length;
  $("#podtytul").textContent = `${zrobione} z ${wszystkie} treningów za Tobą`;

  rysujTygodnie();
  rysujInstalacje();
  if (biezacy) rysujTrening();
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
  waga.append(el("div", "modul-tytul", "Waga"));
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
  if (p.waga.punkty.length > 1) {
    waga.append(el("p", "brama", p.waga.punkty
      .slice(-6)
      .map((x) => `${x.data.slice(5)} ${liczba(x.kg)}`)
      .join("  ·  ")));
  }
  kontener.append(waga);

  // ćwiczenia
  if (p.cwiczenia.length === 0) {
    kontener.append(el("p", "drobne srodek",
      "Wpisuj przy ćwiczeniach, ile faktycznie podniosłeś — tutaj zobaczysz, jak to rośnie."));
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
      ? `${liczba(d.topSet.ciezar)} kg` : String(d.topSet.ciezar || "—")));
    top.append(wiersz);
    top.append(el("div", "drobne", `1 powtórzenie · RPE ${liczba(d.topSet.rpe)}`));
  } else {
    top.classList.add("ukryty");
  }

  // ćwiczenia
  const kontener = $("#cwiczenia");
  kontener.replaceChildren();
  for (const c of d.cwiczenia) {
    const karta = el("div", `cwiczenie ${"BCDE".includes(c.grupa) ? "grupa" : ""}`);

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

    const zadanie = el("div", "zadanie");
    if (typeof c.ciezar === "number") {
      zadanie.append(el("span", "ciezar", `${liczba(c.ciezar)} kg`));
    } else {
      zadanie.append(el("span", "brak", String(c.ciezar || "—")));
    }
    zadanie.append(el("span", "schemat", `${c.serie} × ${c.powtorzenia} · RPE ${liczba(c.rpe)}`));
    if (c.jednostronne) zadanie.append(el("span", "na-strone", "na stronę"));
    karta.append(zadanie);

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
    kontener.append(karta);
  }

  $("#zakoncz").textContent = d.ukonczony ? "Trening zakończony ✓" : "Zakończ trening";
  $("#zakoncz").disabled = d.ukonczony;
}

/**
 * Co faktycznie poszło na sztandze. Ocena mówi „jak było", to mówi „ile było" —
 * i dopiero z tego da się policzyć nowe 1RM bez proszenia o serię maksymalną.
 *
 * Pola są zwinięte, bo na siłowni nikt nie chce wypełniać formularza. Kto chce,
 * dotyka „zapisz ciężar" i wpisuje; kto nie chce, ocenia i idzie dalej.
 */
function polaWykonania(c) {
  const blok = el("div", "wykonanie");
  const maDane = c.ciezarWykonany != null || c.powtorzeniaWykonane != null;
  const otwarte = maDane || otwarteWykonania.has(c.positionId);

  const przelacz = el("button", "wykonanie-przelacz",
    maDane ? "✎ zmień, co poszło" : "+ zapisz, co poszło");
  const pola = el("div", `wykonanie-pola ${otwarte ? "" : "ukryty"}`);

  przelacz.onclick = () => {
    const zwiniete = pola.classList.toggle("ukryty");
    if (zwiniete) otwarteWykonania.delete(c.positionId);
    else { otwarteWykonania.add(c.positionId); pola.querySelector("input").focus(); }
  };

  const wCiezar = el("input");
  wCiezar.placeholder = typeof c.ciezar === "number" ? liczba(c.ciezar) : "kg";
  wCiezar.value = c.ciezarWykonany ?? "";
  const wPowt = el("input");
  wPowt.placeholder = String(c.powtorzenia ?? "powt.");
  wPowt.value = c.powtorzeniaWykonane ?? "";
  for (const i of [wCiezar, wPowt]) {
    i.type = "number";
    i.inputMode = "decimal";
    i.min = "0";
  }

  const zapisz = () => {
    const ciezarWykonany = Number(wCiezar.value) || null;
    const powtorzeniaWykonane = Number(wPowt.value) || null;
    if (ciezarWykonany === c.ciezarWykonany && powtorzeniaWykonane === c.powtorzeniaWykonane) return;
    wyslij("/odczucie",
      { positionId: c.positionId, tydzien: biezacy.tydzien, ciezarWykonany, powtorzeniaWykonane },
      () => { c.ciezarWykonany = ciezarWykonany; c.powtorzeniaWykonane = powtorzeniaWykonane; },
      { odswiez: false });
    przelacz.textContent = "✎ zmień, co poszło";
  };
  wCiezar.onchange = zapisz;
  wPowt.onchange = zapisz;

  pola.append(wCiezar, el("span", "razy", "kg ×"), wPowt, el("span", "razy", "powt."));
  blok.append(przelacz, pola);
  return blok;
}

function rysujPomiary() {
  const kontener = $("#pomiary");
  kontener.replaceChildren();

  const naglowki = el("div", "etykiety");
  naglowki.append(el("span", "", "ciężar"), el("span", "", "powt."), el("span", "", "1RM"));

  for (const p of widok.doZmierzenia) {
    const karta = el("div", "pomiar");
    const nazwa = el("div", "nazwa", p.nazwa);
    if (p.film) {
      const a = el("a", "film", " ▶");
      a.href = p.film; a.target = "_blank"; a.rel = "noopener";
      nazwa.append(a);
    }
    karta.append(nazwa, naglowki.cloneNode(true));

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
    const rm = el("span", "rm", p.oneRM ? `${liczba(p.oneRM)} kg` : "—");

    // Bez przerysowania — inaczej po wpisaniu ciężaru znika pole powtórzeń
    // spod palca. 1RM aktualizujemy punktowo, gdy wróci z serwera.
    const zapisz = async () => {
      const ciezar = Number(wCiezar.value) || 0;
      const powtorzenia = Number(wPowt.value) || 0;
      if (ciezar === (p.ciezar ?? 0) && powtorzenia === (p.powtorzenia ?? 0)) return;
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
$("#pokaz-pomiary").onclick = () => otworz("#ekran-pomiary");
$("#pokaz-moduly").onclick = () => otworz("#ekran-moduly");
$("#pokaz-postep").onclick = () => otworz("#ekran-postep");

$("#zakoncz").onclick = () => {
  const d = dzienBiezacy();
  if (!d || d.ukonczony) return;
  wyslij("/dzien", { dzien: d.dzien, tydzien: biezacy.tydzien }, () => {
    d.ukonczony = true;
    for (const c of d.cwiczenia) c.feedback ??= "OK";
  });
  wroc();
};

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
      // między cyklami: link jest stały, plan się zmienia. Nie kasujemy tego,
      // co zapisane lokalnie — poprzedni cykl zostaje do wglądu offline.
      if (swiezy.czekaNaPlan) {
        komunikat(`Cześć ${swiezy.klient}!`,
          "Trener przygotowuje Twój plan. Ten link zostaje ten sam — "
          + "otwórz go ponownie, gdy dostaniesz wiadomość.");
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
})();
