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
let biezacy = null;   // { tydzien, dzien }

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

async function synchronizuj() {
  const udalo = await kolejka.wyslij();
  pokazStanPolaczenia(udalo);
  if (udalo) rysuj();
}

addEventListener("online", synchronizuj);
addEventListener("offline", () => pokazStanPolaczenia(false));

// ── wysyłanie z natychmiastowym efektem lokalnym ───────────────────
async function wyslij(sciezka, dane, zmienLokalnie) {
  zmienLokalnie();
  zapiszWidokLokalnie();
  rysuj();
  kolejka.dodaj({ sciezka, dane });
  await synchronizuj();
}

// ── ekrany ─────────────────────────────────────────────────────────
function pokazEkran(id) {
  for (const e of document.querySelectorAll(".ekran")) e.classList.add("ukryty");
  $(id).classList.remove("ukryty");
  scrollTo(0, 0);
}

function rysuj() {
  if (!widok) return;
  $("#tytul").textContent = `${widok.klient} ${widok.wersja}.0`;

  const brakuje = widok.doZmierzenia.filter((p) => !p.oneRM);
  $("#pomiary-baner").classList.toggle("ukryty", brakuje.length === 0);
  const zrobione = widok.tygodnie.flatMap((t) => t.dni).filter((d) => d.ukonczony).length;
  const wszystkie = widok.tygodnie.flatMap((t) => t.dni).length;
  $("#podtytul").textContent = `${zrobione} z ${wszystkie} treningów za Tobą`;

  rysujTygodnie();
  if (biezacy) rysujTrening();
  rysujPomiary();
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
    kontener.append(karta);
  }

  $("#zakoncz").textContent = d.ukonczony ? "Trening zakończony ✓" : "Zakończ trening";
  $("#zakoncz").disabled = d.ukonczony;
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

    const zapisz = () => {
      const ciezar = Number(wCiezar.value) || 0;
      const powtorzenia = Number(wPowt.value) || 0;
      wyslij("/serie", { cwiczenieId: p.cwiczenieId, ciezar, powtorzenia }, () => {
        p.ciezar = ciezar || null;
        p.powtorzenia = powtorzenia || null;
      });
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
