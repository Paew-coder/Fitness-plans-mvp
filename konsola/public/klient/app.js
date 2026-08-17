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
const RZYMSKIE = ["I", "II", "III", "IV", "V"];

let widok = null;
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

// ── kolejka offline ────────────────────────────────────────────────
const kolejka = {
  wczytaj: () => JSON.parse(localStorage.getItem(KLUCZ_KOLEJKI) || "[]"),
  zapisz: (k) => localStorage.setItem(KLUCZ_KOLEJKI, JSON.stringify(k)),
  dodaj(zadanie) {
    const k = this.wczytaj();
    k.push(zadanie);
    this.zapisz(k);
  },
  async wyslij() {
    let k = this.wczytaj();
    while (k.length > 0) {
      const zadanie = k[0];
      try {
        const odp = await fetch(`/api/klient/${TOKEN}${zadanie.sciezka}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(zadanie.dane),
        });
        if (!odp.ok) throw new Error("serwer odrzucił");
        widok = await odp.json();
        zapiszWidokLokalnie();
      } catch {
        return false;      // brak sieci — próbujemy później
      }
      k = this.wczytaj().slice(1);
      this.zapisz(k);
    }
    return true;
  },
};

function zapiszWidokLokalnie() {
  try { localStorage.setItem(KLUCZ_WIDOKU, JSON.stringify(widok)); } catch { /* pełna pamięć */ }
}

function pokazStanPolaczenia(online) {
  $("#stan-polaczenia").classList.toggle("ukryty", online);
}

async function synchronizuj(odswiez = true) {
  const udalo = await kolejka.wyslij();
  pokazStanPolaczenia(udalo);
  if (udalo && odswiez) rysuj();
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
  kolejka.dodaj({ sciezka, dane });
  await synchronizuj(odswiez);
}

// ── ekrany ─────────────────────────────────────────────────────────
function pokazEkran(id) {
  for (const e of document.querySelectorAll(".ekran")) e.classList.add("ukryty");
  $(id).classList.remove("ukryty");
  scrollTo(0, 0);
}

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
  if (biezacy) rysujTrening();
  if (pomiary) rysujPomiary();
  rysujModuly();
  if (pomiary) rysujPostep();
}

/**
 * Postęp klienta. Wszystko liczy się z tego, co sam wpisał przy ćwiczeniach —
 * nie ma tu osobnego formularza do wypełniania poza wagą.
 */
function rysujPostep() {
  const p = widok.postep;
  const kontener = $("#postep");
  kontener.replaceChildren();
  if (!p) return;

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
      const dzisiaj = new Date().toISOString().slice(0, 10);
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
      if (j.strefa) dane.push(`${j.strefa.odUd}–${j.strefa.doUd} ud/min`);
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
        rysujTrening();
        pokazEkran("#ekran-trening");
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

// ── obsługa przycisków ─────────────────────────────────────────────
$("#wroc-z-treningu").onclick = () => { biezacy = null; pokazEkran("#ekran-tygodnie"); };
$("#wroc-z-pomiarow").onclick = () => pokazEkran("#ekran-tygodnie");
$("#do-pomiarow").onclick = () => pokazEkran("#ekran-pomiary");
$("#pokaz-pomiary").onclick = () => pokazEkran("#ekran-pomiary");
$("#pokaz-moduly").onclick = () => pokazEkran("#ekran-moduly");
$("#wroc-z-modulow").onclick = () => pokazEkran("#ekran-tygodnie");
$("#pokaz-postep").onclick = () => pokazEkran("#ekran-postep");
$("#wroc-z-postepu").onclick = () => pokazEkran("#ekran-tygodnie");

$("#zakoncz").onclick = () => {
  const d = dzienBiezacy();
  if (!d || d.ukonczony) return;
  wyslij("/dzien", { dzien: d.dzien, tydzien: biezacy.tydzien }, () => {
    d.ukonczony = true;
    for (const c of d.cwiczenia) c.feedback ??= "OK";
  });
  pokazEkran("#ekran-tygodnie");
};

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
      widok = await odp.json();
      zapiszWidokLokalnie();
      pokazStanPolaczenia(true);
      rysuj();
    } else if (!zapamietany) {
      document.body.innerHTML =
        '<p style="padding:2rem;text-align:center">Link nieaktualny.<br>Poproś trenera o nowy.</p>';
      return;
    }
  } catch {
    pokazStanPolaczenia(false);
    if (!zapamietany) {
      document.body.innerHTML =
        '<p style="padding:2rem;text-align:center">Brak połączenia i nic zapisanego.<br>Otwórz raz z zasięgiem.</p>';
      return;
    }
  }

  await synchronizuj();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/klient/sw.js").catch(() => { /* nieistotne */ });
  }
})();
