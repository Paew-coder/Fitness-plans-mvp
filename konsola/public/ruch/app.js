/**
 * Analiza ruchu — ekran (07.10.2026).
 *
 * film (kamera albo plik) → MediaPipe klatka po klatce → 33 punkty na klatkę
 * → kąty i trajektorie → zatrzymana klatka z punktami → sugerowana pozycja.
 *
 * Logika bez DOM siedzi w osobnych modułach (szkielet, geometria, przebieg,
 * profile, sesja) i ma testy w `konsola/testy/analiza-ruchu.test.ts`.
 * Tu jest tylko ekran.
 */
import { analizujWideo, MODELE, przewin, utworzDetektor, WERSJA_MEDIAPIPE } from "./detektor.js";
import { KAT, KATY, katyKlatki, pewny, punktyKlatki, stronaBlizejKamery, ujecieNagrania } from "./geometria.js";
import { chwilaKlatki, katySesji, klatkaWChwili, seria, trajektoria, zakresRuchu } from "./przebieg.js";
import { katStrony, PROFIL, PROFILE, powtorzeniaProfilu, punktStrony } from "./profile.js";
import { kolorPunktu, KOLORY_TRAJEKTORII, punktPodPalcem, rysujKlatke } from "./rysowanie.js";
import {
  BladSesji, doCSV, doJSON, klatekZSylwetka, klatkaZWyniku, nowaSesja, opisSugestii, skutekSugestii,
  sugestieKlatki, ustawSugestie, usunSugestie, zJSON,
} from "./sesja.js";
import { GLOWNE_PUNKTY, nazwaPunktu, stronaPunktu } from "./szkielet.js";
import { wykresKatow } from "./wykres.js";

const $ = (s) => document.querySelector(s);
const el = (tag, klasa, tekst) => {
  const e = document.createElement(tag);
  if (klasa) e.className = klasa;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
};
const liczba = (n, miejsc = 0) => (n === null || n === undefined ? "—"
  : Number(n).toFixed(miejsc).replace(".", ",").replace(/^-0(,0+)?$/, "0$1"));
const sekundy = (ms) => `${liczba(ms / 1000, 2)} s`;

/* ── stan ekranu ────────────────────────────────────────────────── */

const stan = {
  sesja: null,
  katy: { "2d": null, "3d": null },
  uklad: "2d",
  strona: "auto",
  stronaAuto: "L",
  biezaca: 0,
  wybrany: null,
  wszystkie: false,
  pokazKaty: true,
  pokazTrajektorie: true,
  trajektorie: new Map(),        // id punktu → kolor (stały, póki wybrany)
  trybSugestii: false,
  maWideo: false,
  wideoUrl: null,
  powtorzenia: [],
  analiza: null,                  // { przerwij: bool } w trakcie
  wykres: null,
  odtwarzanie: null,              // zegar odtwarzania bez filmu
  pamiecTrajektorii: new Map(),   // id punktu → trajektoria (liczona raz na sesję)
};

const wideo = $("#wideo");
const plotno = $("#nakladka");
const ctx = plotno.getContext("2d");

const profil = () => PROFIL[stan.sesja?.cwiczenie ?? $("#cwiczenie").value] ?? PROFIL.przysiad;
const strona = () => (stan.strona === "auto" ? stan.stronaAuto : stan.strona);
const wymiary = () => ({ szerokosc: stan.sesja.wideo.szerokosc, wysokosc: stan.sesja.wideo.wysokosc });

/** Trajektoria punktu z pamięci — przy odtwarzaniu nakładka rysuje się co klatkę. */
function trajektoriaPunktu(id) {
  if (!stan.pamiecTrajektorii.has(id)) stan.pamiecTrajektorii.set(id, trajektoria(stan.sesja, id));
  return stan.pamiecTrajektorii.get(id);
}

function katyUkladu() {
  if (!stan.katy[stan.uklad]) stan.katy[stan.uklad] = katySesji(stan.sesja, stan.uklad);
  return stan.katy[stan.uklad];
}

/* ── komunikaty ─────────────────────────────────────────────────── */

function komunikat(tekst, { informacja = false } = {}) {
  const k = $("#komunikat");
  k.textContent = tekst ?? "";
  k.classList.toggle("ukryty", !tekst);
  k.classList.toggle("informacja", informacja);
}

/* ── wybór źródła ───────────────────────────────────────────────── */

for (const p of PROFILE) $("#cwiczenie").append(new Option(p.nazwa, p.id));
for (const m of MODELE) $("#model").append(new Option(m.nazwa, m.id, m.id === "full", m.id === "full"));
const pokazUjecie = () => { $("#wskazowka-ujecia").textContent = `Ujęcie: ${PROFIL[$("#cwiczenie").value].ujecie}`; };
$("#cwiczenie").addEventListener("change", () => {
  pokazUjecie();
  if (stan.sesja) {
    stan.sesja.cwiczenie = $("#cwiczenie").value;
    przygotujWyniki({ zachowajKlatke: true });
  }
});
pokazUjecie();

let ostatniPlik = null;

/**
 * Plik z którejkolwiek z dwóch kontrolek: film idzie do analizy, zapisana
 * analiza (.json) — na ekran. Trener, 09.10.2026: wybrał nagranie ekranu
 * przyciskiem „Wczytaj analizę (.json)” i „się nie da” — przycisk przyjmował
 * tylko JSON, więc film był wyszarzony. Teraz żadna droga nie jest ślepa.
 */
const zapisAnalizy = (plik) => /\.json$/i.test(plik.name) || /json/.test(plik.type);

async function otworzPlik(plik) {
  if (zapisAnalizy(plik)) return otworzZapis(plik);
  ostatniPlik = plik;
  if (await zaladujWideo(plik)) await analizuj(plik.name);
}

for (const pole of ["#plik-wideo", "#plik-analizy"]) {
  $(pole).addEventListener("change", async (e) => {
    const plik = e.target.files?.[0];
    e.target.value = "";
    if (plik) await otworzPlik(plik);
  });
}

$("#analizuj-ponownie").addEventListener("click", async () => {
  if (!stan.maWideo) return;
  await analizuj(stan.sesja?.wideo.nazwa ?? ostatniPlik?.name ?? "nagranie");
});

/** Zapisana wcześniej analiza (.json z „Pobierz analizę”) — bez ponownego liczenia. */
async function otworzZapis(plik) {
  try {
    const sesja = zJSON(await plik.text());
    zatrzymaj();
    zwolnijWideo();
    stan.sesja = sesja;
    $("#cwiczenie").value = PROFIL[sesja.cwiczenie] ? sesja.cwiczenie : "ogolny";
    pokazUjecie();
    komunikat(`Wczytano analizę „${sesja.wideo.nazwa ?? plik.name}”. Film można dołączyć niżej, w „Zapis”.`, { informacja: true });
    przygotujWyniki();
  } catch (blad) {
    komunikat(blad instanceof BladSesji ? blad.message : `Nie udało się wczytać pliku: ${blad.message}`);
  }
}

$("#plik-dolacz").addEventListener("change", async (e) => {
  const plik = e.target.files?.[0];
  e.target.value = "";
  if (!plik || !stan.sesja) return;
  if (!(await zaladujWideo(plik))) return;
  const roznica = Math.abs(wideo.videoWidth / wideo.videoHeight - stan.sesja.wideo.szerokosc / stan.sesja.wideo.wysokosc);
  if (roznica > 0.02) {
    komunikat("Ten film ma inne proporcje niż analiza — to chyba inne nagranie. Punkty nie trafiłyby w sylwetkę.");
    zwolnijWideo();
    pokazKlatke(stan.biezaca);
    return;
  }
  komunikat("");
  pokazKlatke(stan.biezaca);
});

function zwolnijWideo() {
  if (stan.wideoUrl) URL.revokeObjectURL(stan.wideoUrl);
  stan.wideoUrl = null;
  stan.maWideo = false;
  wideo.removeAttribute("src");
  wideo.load();
  odswiezZrodlo();
}

/** Wczytuje film do odtwarzacza. `false` — przeglądarka go nie otworzy. */
async function zaladujWideo(plik) {
  komunikat("");
  zatrzymaj();
  if (stan.wideoUrl) URL.revokeObjectURL(stan.wideoUrl);
  stan.wideoUrl = URL.createObjectURL(plik);
  const gotowe = new Promise((ok) => {
    const sprzatnij = () => {
      wideo.removeEventListener("loadeddata", udane);
      wideo.removeEventListener("error", nieudane);
    };
    const udane = () => { sprzatnij(); ok(true); };
    const nieudane = () => { sprzatnij(); ok(false); };
    wideo.addEventListener("loadeddata", udane);
    wideo.addEventListener("error", nieudane);
  });
  wideo.src = stan.wideoUrl;
  wideo.load();
  const ok = await gotowe;
  if (!ok || !wideo.videoWidth) {
    komunikat("Ta przeglądarka nie odtworzy tego filmu. Nagrania HEVC z iPhone'a otwiera Safari; "
      + "w Chrome nagraj w trybie „Najbardziej zgodny” albo przez „Nagraj kamerą”.");
    stan.maWideo = false;
    odswiezZrodlo();
    return false;
  }
  stan.maWideo = true;
  odswiezZrodlo();
  return true;
}

function odswiezZrodlo() {
  $("#analizuj-ponownie").classList.toggle("ukryty", !stan.maWideo || !stan.sesja);
  $("#dolacz-wideo-rzad").classList.toggle("ukryty", !stan.sesja || stan.maWideo);
  $("#bez-filmu").classList.toggle("ukryty", stan.maWideo);
  wideo.classList.toggle("ukryty", !stan.maWideo);
}

/* ── analiza ────────────────────────────────────────────────────── */

async function analizuj(nazwa) {
  zatrzymaj();
  const maksFps = Number($("#gestosc").value) || null;
  const model = $("#model").value;
  const panel = $("#panel-postepu");
  panel.classList.remove("ukryty");
  $("#pasek-postepu").removeAttribute("value");
  $("#opis-postepu").textContent = "Wczytuję model MediaPipe… Za pierwszym razem trwa to kilka sekund.";
  stan.analiza = { przerwij: false };
  let detektor;
  try {
    detektor = await utworzDetektor(model);
  } catch (blad) {
    panel.classList.add("ukryty");
    stan.analiza = null;
    komunikat(`Nie udało się wczytać MediaPipe (${blad.message}). Sprawdź połączenie z internetem — model pobiera się raz.`);
    return;
  }
  const sesja = nowaSesja({
    cwiczenie: $("#cwiczenie").value,
    wideo: { nazwa, szerokosc: wideo.videoWidth, wysokosc: wideo.videoHeight, czasTrwania: null },
    analiza: { biblioteka: `@mediapipe/tasks-vision ${WERSJA_MEDIAPIPE}`, model: `pose_landmarker_${model}`,
      delegat: detektor.delegat, maksFps },
  });
  const start = performance.now();
  try {
    const wynik = await analizujWideo(wideo, detektor, {
      maksFps,
      naKlatke: (t, w) => sesja.klatki.push(klatkaZWyniku(sesja.klatki.length, t, w?.landmarki, w?.swiat)),
      postep: (ulamek) => {
        $("#pasek-postepu").value = ulamek;
        $("#opis-postepu").textContent = `Analiza klatka po klatce: ${sesja.klatki.length} klatek, ${liczba(ulamek * 100)}% filmu`
          + ` · ${detektor.delegat === "GPU" ? "karta graficzna" : "procesor"}`;
      },
      przerwano: () => stan.analiza?.przerwij,
    });
    sesja.wideo.czasTrwania = Math.round(wynik.czas * 1000);
    sesja.analiza.tryb = wynik.tryb;
    if (wynik.uzupelnione) sesja.analiza.uzupelnioneKlatki = wynik.uzupelnione;
    sesja.analiza.fps = Math.round(fpsSesji(sesja) * 100) / 100;
    sesja.analiza.czasAnalizyMs = Math.round(performance.now() - start);
    if (wynik.przerwano) {
      komunikat(sesja.klatki.length > 1
        ? `Analiza przerwana po ${sesja.klatki.length} klatkach — pokazuję to, co zdążyła policzyć.`
        : "Analiza przerwana.", { informacja: true });
    }
  } catch (blad) {
    komunikat(`Analiza się nie udała: ${blad.message}`);
    console.error(blad);
  } finally {
    detektor.zamknij();
    panel.classList.add("ukryty");
    stan.analiza = null;
  }
  if (sesja.klatki.length === 0) return;
  if (klatekZSylwetka(sesja) === 0) {
    komunikat("MediaPipe nie znalazł sylwetki w żadnej klatce. Cała osoba powinna być w kadrze, w dobrym świetle.");
  }
  stan.sesja = sesja;
  przygotujWyniki();
}

$("#przerwij").addEventListener("click", () => {
  if (stan.analiza) stan.analiza.przerwij = true;
});

/** Klatki na sekundę z samych klatek (mediana odstępów) — do odtwarzania bez filmu. */
function fpsSesji(sesja) {
  const odstepy = sesja.klatki.slice(1).map((k, i) => k.t - sesja.klatki[i].t).sort((a, b) => a - b);
  const mediana = odstepy[Math.floor(odstepy.length / 2)];
  return mediana > 0 ? 1000 / mediana : 30;
}

/** Po analizie albo wczytaniu: kąty, strona, powtórzenia, wykres, pierwsza klatka. */
function przygotujWyniki({ zachowajKlatke = false } = {}) {
  const s = stan.sesja;
  stan.katy = { "2d": null, "3d": null };
  stan.pamiecTrajektorii = new Map();
  stan.stronaAuto = stronaBlizejKamery(s.klatki);
  if (!zachowajKlatke) {
    stan.biezaca = 0;
    stan.wybrany = null;
    stan.trybSugestii = false;
    stan.trajektorie = new Map();
    for (const rdzen of profil().trajektorie) dodajTrajektorie(punktStrony(rdzen, strona()));
  }
  $("#widok-analizy").classList.remove("ukryty");
  odswiezZrodlo();
  const { szerokosc, wysokosc } = s.wideo;
  const scena = $("#scena");
  scena.style.aspectRatio = `${szerokosc} / ${wysokosc}`;
  // Pionowy film z telefonu nie ma zająć całego ekranu w pionie.
  scena.style.width = `min(100%, calc(68vh * ${szerokosc / wysokosc}))`;
  $("#suwak").max = String(s.klatki.length - 1);
  const zSylwetka = klatekZSylwetka(s);
  const a = s.analiza ?? {};
  const widok = ujecieNagrania(s.klatki, s.wideo);
  $("#info-analizy").textContent = [
    `${s.wideo.nazwa ?? "nagranie"} · ${s.wideo.szerokosc}×${s.wideo.wysokosc}`,
    `sylwetka w ${zSylwetka} z ${s.klatki.length} klatek`,
    widok === "przod" ? "ujęcie z przodu — zgięcia kolan i bioder dokładniej w 3D"
      : widok === "bok" ? "ujęcie z boku" : widok === "skos" ? "ujęcie skośne — kąty 2D przybliżone, porównaj z 3D" : null,
    a.model ? `${a.model.replace("pose_landmarker_", "model ")}${a.delegat ? ` (${a.delegat})` : ""}` : null,
    s.klatki.length > 1 ? `${liczba(fpsSesji(s), 1)} kl./s` : null,
    a.czasAnalizyMs ? `analiza ${liczba(a.czasAnalizyMs / 1000, 1)} s` : null,
  ].filter(Boolean).join(" · ");
  przeliczWyniki();
  dopasujPlotno();
  pokazKlatke(Math.min(stan.biezaca, s.klatki.length - 1));
}

/** Podpisy przy końcach linii wykresu — krótkie, żeby się mieściły. */
const KROTKO = { kolano: "kolano", biodro: "biodro", skokowy: "stopa", tulow: "tułów", lokiec: "łokieć", ramie: "ramię" };

/** To, co zależy od układu (2D/3D) i strony: wykres, powtórzenia, trajektorie. */
function przeliczWyniki() {
  const katy = katyUkladu();
  const p = profil();
  stan.powtorzenia = powtorzeniaProfilu(p, katy, strona());
  const czasy = stan.sesja.klatki.map((k) => k.t);
  const serie = p.wykres.map((grupa, n) => {
    const id = katStrony(grupa, strona());
    return { id, nazwa: KAT[id].nazwa, krotko: KROTKO[grupa] ?? grupa,
      kolor: `var(--seria-${n + 1})`, wartosci: seria(katy, id) };
  });
  $("#legenda").replaceChildren(...serie.map((s) => {
    const poz = el("span", "pozycja-legendy");
    const znak = el("span", "znak-serii");
    znak.style.background = s.kolor;
    poz.append(znak, s.nazwa);
    return poz;
  }), el("span", "pozycja-legendy", stan.uklad === "3d" ? "· układ 3D (model)" : "· układ 2D (obraz)"));
  const dane = { czasy, serie, powtorzenia: stan.powtorzenia, biezaca: stan.biezaca, naWybor: (i) => { zatrzymaj(); pokazKlatke(i); } };
  if (stan.wykres) stan.wykres.odswiez(dane);
  else stan.wykres = wykresKatow($("#wykres"), dane);
  rysujPowtorzenia(katy);
  rysujWyborTrajektorii();
}

/* ── klatka: obraz, tabele, sugestie ────────────────────────────── */

let licznikPrzewijania = 0;

async function pokazKlatke(i, { przewinFilm = true } = {}) {
  const s = stan.sesja;
  if (!s) return;
  stan.biezaca = Math.max(0, Math.min(s.klatki.length - 1, i));
  const k = s.klatki[stan.biezaca];
  $("#suwak").value = String(stan.biezaca);
  $("#czas").textContent = `${sekundy(k.t)} · klatka ${stan.biezaca + 1}/${s.klatki.length}`;
  stan.wykres?.ustawBiezaca(stan.biezaca);
  rysuj();
  odswiezPanele();
  if (przewinFilm && stan.maWideo && wideo.paused) {
    const moje = ++licznikPrzewijania;
    await przewin(wideo, chwilaKlatki(s, stan.biezaca) / 1000);
    if (moje !== licznikPrzewijania) return;
  }
}

function rysuj() {
  if (!stan.sesja) return;
  const k = stan.sesja.klatki[stan.biezaca];
  const dpr = window.devicePixelRatio || 1;
  const trajektorie = stan.pokazTrajektorie ? [...stan.trajektorie].map(([id, kolor]) => ({
    id, kolor, biezacy: stan.biezaca,
    punkty: trajektoriaPunktu(id).map((q) => (q && q.v >= 0.5
      ? { x: q.x / stan.sesja.wideo.szerokosc, y: q.y / stan.sesja.wideo.wysokosc } : null)),
  })) : [];
  rysujKlatke(ctx, {
    dpr,
    klatka: k,
    wszystkie: stan.wszystkie,
    wybrany: stan.wybrany,
    katy: stan.pokazKaty ? katyKlatki(k, wymiary()) : null,
    strona: strona(),
    trajektorie,
    sugestie: sugestieKlatki(stan.sesja, stan.biezaca),
  });
}

function dopasujPlotno() {
  const r = plotno.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (plotno.width !== w || plotno.height !== h) {
    plotno.width = w;
    plotno.height = h;
  }
  rysuj();
}
new ResizeObserver(dopasujPlotno).observe($("#scena"));

function odswiezPanele() {
  const s = stan.sesja;
  const k = s.klatki[stan.biezaca];
  $("#tytul-klatki").textContent = `Klatka ${stan.biezaca + 1} · ${sekundy(k.t)}`;
  rysujTabeleKatow(k);
  rysujTabelePunktow(k);
  rysujSugestie();
}

/** Kąty bieżącej klatki: grupy ze stroną w dwóch kolumnach (L, P), reszta w jednej. */
function rysujTabeleKatow(k) {
  const tabela = $("#tabela-katow");
  const katy = katyUkladu()[stan.biezaca];
  const naglowek = el("tr");
  naglowek.append(el("th", null, "Kąt"), el("th", "liczba", "L"), el("th", "liczba", "P"));
  const wiersze = [naglowek];
  if (!katy) {
    const w = el("tr");
    const td = el("td", "niepewny", k.p ? "W układzie 3D ta klatka nie ma punktów modelu." : "W tej klatce nie wykryto sylwetki.");
    td.colSpan = 3;
    w.append(td);
    tabela.replaceChildren(...wiersze, w);
    return;
  }
  const grupy = [...new Set(KATY.map((d) => d.grupa))];
  for (const g of grupy) {
    const defs = KATY.filter((d) => d.grupa === g);
    const w = el("tr");
    const nazwa = el("td");
    nazwa.append(defs[0].nazwa.replace(/ [LP]$/, ""), el("span", "opis-kata", defs[0].opis));
    w.append(nazwa);
    const komorka = (d) => {
      const wynik = katy[d.id];
      const td = el("td", "liczba");
      if (!wynik) { td.textContent = "—"; return td; }
      td.textContent = `${liczba(wynik.wartosc)}${d.jednostka ?? "°"}`;
      if (!pewny(wynik)) {
        td.classList.add("niepewny");
        td.title = wynik.powod ? `niepewne — ${wynik.powod}` : `niepewne — punkt słabo widoczny (${liczba(wynik.pewnosc * 100)}%)`;
        td.textContent += "?";
      }
      return td;
    };
    if (defs.length === 2) w.append(komorka(defs[0]), komorka(defs[1]));
    else {
      const td = komorka(defs[0]);
      td.colSpan = 2;
      w.append(td);
    }
    wiersze.push(w);
  }
  tabela.replaceChildren(...wiersze);
}

function rysujTabelePunktow(k) {
  const tabela = $("#tabela-punktow");
  const naglowek = el("tr");
  naglowek.append(el("th", null, "Punkt"), el("th", "liczba", "x"), el("th", "liczba", "y"), el("th", "liczba", "widoczność"));
  const punkty = punktyKlatki(k, wymiary(), { wszystkie: stan.wszystkie });
  const wiersze = punkty.map((q) => {
    const w = el("tr", `klikalny${q.id === stan.wybrany ? " wybrany" : ""}`);
    w.dataset.punkt = q.id;
    const nazwa = el("td");
    const znak = el("span", "znak-strony");
    znak.style.background = stronaPunktu(q.id) ? kolorPunktu(q.id) : "var(--tekst-blady)";
    nazwa.append(znak, nazwaPunktu(q.id));
    const v = el("td", `liczba${q.v < 0.5 ? " niepewny" : ""}`, `${liczba(q.v * 100)}%`);
    w.append(nazwa, el("td", "liczba", liczba(q.x)), el("td", "liczba", liczba(q.y)), v);
    w.addEventListener("click", () => wybierzPunkt(q.id));
    return w;
  });
  if (wiersze.length === 0) {
    const w = el("tr");
    const td = el("td", "niepewny", "W tej klatce nie wykryto sylwetki.");
    td.colSpan = 4;
    w.append(td);
    wiersze.push(w);
  }
  tabela.replaceChildren(naglowek, ...wiersze);
}

function wybierzPunkt(id) {
  stan.wybrany = id;
  if (!id) ustawTrybSugestii(false);
  rysuj();
  odswiezPanele();
}

/* ── sugerowana pozycja ─────────────────────────────────────────── */

function ustawTrybSugestii(wlaczony) {
  stan.trybSugestii = wlaczony && !!stan.wybrany;
  $("#scena").classList.toggle("tryb-sugestii", stan.trybSugestii);
  $("#instrukcja-sugestii").classList.toggle("ukryty", !stan.trybSugestii);
  const przycisk = $("#zaznacz-sugestie");
  przycisk.classList.toggle("aktywny", stan.trybSugestii);
  przycisk.textContent = stan.trybSugestii ? "Gotowe" : "Zaznacz sugerowaną pozycję";
}

$("#zaznacz-sugestie").addEventListener("click", () => {
  zatrzymaj();
  ustawTrybSugestii(!stan.trybSugestii);
});

function rysujSugestie() {
  const s = stan.sesja;
  $("#wybrany-punkt").textContent = stan.wybrany
    ? `Wybrany punkt: ${nazwaPunktu(stan.wybrany)} (klatka ${stan.biezaca + 1}).`
    : "Wybierz punkt na obrazie albo w tabeli punktów.";
  $("#zaznacz-sugestie").disabled = !stan.wybrany || !s.klatki[stan.biezaca].p;

  const naKlatce = sugestieKlatki(s, stan.biezaca);
  const skutek = skutekSugestii(s, stan.biezaca);
  $("#sugestie-klatki").replaceChildren(...naKlatce.map((sg) => {
    const ramka = el("div", "sugestia");
    const naglowek = el("div", "naglowek-sugestii");
    const usun = el("button", "link", "Usuń");
    usun.type = "button";
    usun.addEventListener("click", () => {
      usunSugestie(s, sg.id);
      rysuj();
      rysujSugestie();
    });
    naglowek.append(`● ${nazwaPunktu(sg.punkt)} → ○ sugerowana`, usun);
    const notatka = el("input");
    notatka.placeholder = "Notatka (np. „biodra dalej w tył”)";
    notatka.value = sg.notatka ?? "";
    notatka.addEventListener("input", () => { sg.notatka = notatka.value; });
    ramka.append(naglowek, notatka);
    return ramka;
  }));
  if (skutek.length) {
    const ramka = el("div", "sugestia");
    ramka.append(el("div", "naglowek-sugestii", "Jak to zmienia kąty (2D)"));
    const lista = el("ul");
    for (const r of skutek) lista.append(el("li", null, `${r.nazwa}: ${liczba(r.przed)}${r.jednostka} → ${liczba(r.po)}${r.jednostka}`));
    ramka.append(lista);
    $("#sugestie-klatki").append(ramka);
  }

  const inne = s.sugestie.filter((sg) => sg.klatka !== stan.biezaca);
  $("#naglowek-wszystkich-sugestii").classList.toggle("ukryty", inne.length === 0);
  $("#wszystkie-sugestie").replaceChildren(...inne.map((sg) => {
    const w = el("div", "sugestia-wiersz");
    const idz = el("button", "link", "Pokaż");
    idz.type = "button";
    idz.addEventListener("click", () => { zatrzymaj(); pokazKlatke(sg.klatka); });
    w.append(opisSugestii(sg), idz);
    return w;
  }));
}

/* ── dotyk na obrazie ───────────────────────────────────────────── */

let przeciaganie = false;

function punktNaPlotnie(e) {
  const r = plotno.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r };
}

plotno.addEventListener("pointerdown", (e) => {
  if (!stan.sesja) return;
  zatrzymaj();
  const { x, y, r } = punktNaPlotnie(e);
  if (stan.trybSugestii && stan.wybrany) {
    ustawSugestie(stan.sesja, { klatka: stan.biezaca, punkt: stan.wybrany, x, y });
    przeciaganie = true;
    plotno.setPointerCapture(e.pointerId);
    rysuj();
    rysujSugestie();
    return;
  }
  const id = punktPodPalcem(stan.sesja.klatki[stan.biezaca], x * r.width, y * r.height, r.width, r.height,
    { wszystkie: stan.wszystkie, zasieg: e.pointerType === "touch" ? 36 : 22 });
  wybierzPunkt(id);
});
plotno.addEventListener("pointermove", (e) => {
  if (!przeciaganie) return;
  const { x, y } = punktNaPlotnie(e);
  ustawSugestie(stan.sesja, { klatka: stan.biezaca, punkt: stan.wybrany, x, y });
  rysuj();
});
const koniecPrzeciagania = () => {
  if (!przeciaganie) return;
  przeciaganie = false;
  rysujSugestie();
};
plotno.addEventListener("pointerup", koniecPrzeciagania);
plotno.addEventListener("pointercancel", koniecPrzeciagania);

/* ── odtwarzanie i klatki ───────────────────────────────────────── */

function zatrzymaj() {
  if (!wideo.paused) wideo.pause();
  if (stan.odtwarzanie) {
    clearInterval(stan.odtwarzanie);
    stan.odtwarzanie = null;
  }
  $("#odtworz").textContent = "▶︎";
  $("#odtworz").setAttribute("aria-label", "Odtwórz");
}

function odtworz() {
  if (!stan.sesja) return;
  const tempo = Number($("#tempo").value);
  $("#odtworz").textContent = "❚❚";
  $("#odtworz").setAttribute("aria-label", "Pauza");
  if (stan.biezaca >= stan.sesja.klatki.length - 1) pokazKlatke(0, { przewinFilm: !stan.maWideo });
  if (stan.maWideo) {
    wideo.playbackRate = tempo;
    if (stan.biezaca === 0) wideo.currentTime = 0;
    wideo.play().catch(() => zatrzymaj());
    sledzFilm();
    return;
  }
  // Bez filmu — sam szkielet, klatka po klatce w tempie nagrania.
  const fps = fpsSesji(stan.sesja);
  stan.odtwarzanie = setInterval(() => {
    if (stan.biezaca >= stan.sesja.klatki.length - 1) return zatrzymaj();
    pokazKlatke(stan.biezaca + 1, { przewinFilm: false });
  }, 1000 / (fps * tempo));
}

/** Podczas odtwarzania nakładka idzie za filmem — klatka najbliższa bieżącemu czasowi. */
function sledzFilm() {
  const krok = () => {
    if (wideo.paused || wideo.ended) {
      if (wideo.ended) zatrzymaj();
      return;
    }
    const i = Math.max(0, klatkaWChwili(stan.sesja.klatki, wideo.currentTime * 1000));
    if (i !== stan.biezaca) pokazKlatke(i, { przewinFilm: false });
    if ("requestVideoFrameCallback" in wideo) wideo.requestVideoFrameCallback(krok);
    else requestAnimationFrame(krok);
  };
  if ("requestVideoFrameCallback" in wideo) wideo.requestVideoFrameCallback(krok);
  else requestAnimationFrame(krok);
}
wideo.addEventListener("ended", zatrzymaj);

$("#odtworz").addEventListener("click", () => {
  const gra = stan.maWideo ? !wideo.paused : !!stan.odtwarzanie;
  if (gra) zatrzymaj();
  else odtworz();
});
$("#klatka-wstecz").addEventListener("click", () => { zatrzymaj(); pokazKlatke(stan.biezaca - 1); });
$("#klatka-dalej").addEventListener("click", () => { zatrzymaj(); pokazKlatke(stan.biezaca + 1); });
$("#suwak").addEventListener("input", (e) => { zatrzymaj(); pokazKlatke(Number(e.target.value)); });
$("#tempo").addEventListener("change", () => { if (!wideo.paused) wideo.playbackRate = Number($("#tempo").value); });

document.addEventListener("keydown", (e) => {
  if (!stan.sesja || ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); zatrzymaj(); pokazKlatke(stan.biezaca - 1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); zatrzymaj(); pokazKlatke(stan.biezaca + 1); }
  else if (e.key === " ") { e.preventDefault(); $("#odtworz").click(); }
});

/* ── przełączniki ───────────────────────────────────────────────── */

$("#pokaz-katy").addEventListener("change", (e) => { stan.pokazKaty = e.target.checked; rysuj(); });
$("#pokaz-trajektorie").addEventListener("change", (e) => { stan.pokazTrajektorie = e.target.checked; rysuj(); });
$("#wszystkie-punkty").addEventListener("change", (e) => {
  stan.wszystkie = e.target.checked;
  rysuj();
  odswiezPanele();
  rysujWyborTrajektorii();
});
$("#uklad").addEventListener("change", (e) => {
  stan.uklad = e.target.value;
  przeliczWyniki();
  odswiezPanele();
});
$("#strona").addEventListener("change", (e) => {
  stan.strona = e.target.value;
  przeliczWyniki();
  rysuj();
});

/* ── powtórzenia ────────────────────────────────────────────────── */

function rysujPowtorzenia(katy) {
  const p = profil();
  const panel = $("#panel-powtorzen");
  panel.classList.toggle("ukryty", !p.powtorzenia);
  if (!p.powtorzenia) return;
  const tabela = $("#tabela-powtorzen");
  const podsumowanie = p.podsumowanie(stan.sesja, katy, strona(), stan.powtorzenia);
  const st = (m) => (m ? `${liczba(m.wartosc)}°` : "—");
  const kolumny = [
    ["#", (r) => String(r.numer)],
    ["ruch", (r) => sekundy(r.czas * 1000)],
    ["w dół", (r) => sekundy(r.zejscie * 1000)],
    ["w górę", (r) => sekundy(r.wstawanie * 1000)],
    ["kolano", (r) => st(r.kolanoMaks)],
    ["biodro", (r) => st(r.biodroMaks)],
    ["stopa", (r) => st(r.skokowyMaks)],
    ["tułów", (r) => st(r.tulowMaks)],
    ["biodro vs kolano", (r) => (r.glebokosc === null ? "—"
      : `${r.glebokosc > 0 ? "pod" : "nad"} ${liczba(Math.abs(r.glebokosc))}%`)],
    ["kolana/stopy", (r) => (r.kolanaDoStop === null ? "—" : liczba(r.kolanaDoStop, 2))],
  ];
  const naglowek = el("tr");
  for (const [nazwa] of kolumny) naglowek.append(el("th", "liczba", nazwa));
  const wiersze = podsumowanie.map((r) => {
    const w = el("tr", "klikalny");
    w.title = "Pokaż dół tego powtórzenia";
    for (const [, f] of kolumny) w.append(el("td", "liczba", f(r)));
    w.addEventListener("click", () => { zatrzymaj(); pokazKlatke(r.szczyt); });
    return w;
  });
  if (wiersze.length === 0) {
    const w = el("tr");
    const td = el("td", "niepewny", "Nie znalazłem pełnego powtórzenia (zejście i powrót).");
    td.colSpan = kolumny.length;
    w.append(td);
    wiersze.push(w);
  }
  tabela.replaceChildren(naglowek, ...wiersze);
  $("#opis-powtorzen").textContent = `Strona ${strona() === "L" ? "lewa" : "prawa"}, kąty ${stan.uklad === "3d" ? "3D" : "2D"}; `
    + "kolano, biodro, stopa (zgięcie grzbietowe) i tułów — największe w powtórzeniu. Wiersz przenosi do dołu powtórzenia. "
    + "Biodro vs kolano: w dole, z obrazu, w % długości uda — „pod” = poniżej równoległej. "
    + "Kolana/stopy: rozstaw kolan do rozstawu stawów skokowych w dole, przy ujęciu z przodu; poniżej 1 = kolana do środka.";
}

/* ── trajektorie ────────────────────────────────────────────────── */

function dodajTrajektorie(id) {
  if (stan.trajektorie.has(id) || stan.trajektorie.size >= KOLORY_TRAJEKTORII.length) return;
  const zajete = new Set(stan.trajektorie.values());
  stan.trajektorie.set(id, KOLORY_TRAJEKTORII.find((k) => !zajete.has(k)));
}

function rysujWyborTrajektorii() {
  const lista = $("#wybor-trajektorii");
  lista.replaceChildren(...GLOWNE_PUNKTY.map((id) => {
    const etykieta = el("label");
    const pole = el("input");
    pole.type = "checkbox";
    pole.checked = stan.trajektorie.has(id);
    pole.disabled = !pole.checked && stan.trajektorie.size >= KOLORY_TRAJEKTORII.length;
    pole.addEventListener("change", () => {
      if (pole.checked) dodajTrajektorie(id);
      else stan.trajektorie.delete(id);
      rysujWyborTrajektorii();
      rysuj();
    });
    etykieta.append(pole);
    if (stan.trajektorie.has(id)) {
      const znak = el("span", "znak-serii");
      znak.style.background = stan.trajektorie.get(id);
      etykieta.append(znak);
    }
    etykieta.append(nazwaPunktu(id));
    return etykieta;
  }));
  const tabela = $("#tabela-trajektorii");
  const naglowek = el("tr");
  naglowek.append(el("th", null, "Punkt"), el("th", "liczba", "ruch poziomo"), el("th", "liczba", "ruch pionowo"), el("th", "liczba", "klatek"));
  const wiersze = [...stan.trajektorie.keys()].map((id) => {
    const z = zakresRuchu(trajektoriaPunktu(id));
    const w = el("tr");
    const nazwa = el("td");
    const znak = el("span", "znak-serii");
    znak.style.background = stan.trajektorie.get(id);
    nazwa.append(znak, nazwaPunktu(id));
    w.append(nazwa,
      el("td", "liczba", z ? `${liczba(z.poziomo)} px` : "—"),
      el("td", "liczba", z ? `${liczba(z.pionowo)} px` : "—"),
      el("td", "liczba", z ? String(z.klatek) : "0"));
    return w;
  });
  tabela.replaceChildren(naglowek, ...wiersze);
}

/* ── zapis ──────────────────────────────────────────────────────── */

function pobierz(tresc, nazwa, typ) {
  const url = URL.createObjectURL(new Blob([tresc], { type: typ }));
  const a = el("a");
  a.href = url;
  a.download = nazwa;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const nazwaPliku = (rozszerzenie) => {
  const baza = (stan.sesja.wideo.nazwa ?? "nagranie").replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-");
  return `analiza-${baza}-${stan.sesja.utworzono.slice(0, 10)}.${rozszerzenie}`;
};

$("#pobierz-json").addEventListener("click", () => pobierz(doJSON(stan.sesja), nazwaPliku("json"), "application/json"));
// BOM na początku — bez niego Excel czyta polskie znaki jako krzaki.
$("#pobierz-csv").addEventListener("click", () => pobierz(`﻿${doCSV(stan.sesja)}`, nazwaPliku("csv"), "text/csv;charset=utf-8"));

/* ── nagrywanie kamerą ──────────────────────────────────────────── */

const nagrywanie = { strumien: null, rekorder: null, kawalki: [], kamera: "environment", start: 0, zegar: null };

function typNagrania() {
  const kandydaci = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return kandydaci.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? "";
}

async function wlaczKamere() {
  zatrzymajKamere();
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(window.isSecureContext
      ? "Ta przeglądarka nie daje dostępu do kamery."
      : "Kamera działa tylko przez https (albo na tym samym komputerze, localhost).");
  }
  nagrywanie.strumien = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: nagrywanie.kamera, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    audio: false,
  });
  $("#podglad-kamery").srcObject = nagrywanie.strumien;
}

function zatrzymajKamere() {
  nagrywanie.strumien?.getTracks().forEach((t) => t.stop());
  nagrywanie.strumien = null;
  clearInterval(nagrywanie.zegar);
  $("#czas-nagrania").textContent = "";
}

$("#nagraj").addEventListener("click", async () => {
  komunikat("");
  zatrzymaj();
  try {
    await wlaczKamere();
    $("#panel-nagrywania").classList.remove("ukryty");
    $("#start-nagrywania").classList.remove("ukryty");
    $("#stop-nagrywania").classList.add("ukryty");
  } catch (blad) {
    komunikat(blad.name === "NotAllowedError"
      ? "Przeglądarka nie dostała zgody na kamerę. Zezwól w ustawieniach strony i spróbuj jeszcze raz."
      : `Nie udało się włączyć kamery: ${blad.message}`);
  }
});

$("#zmien-kamere").addEventListener("click", async () => {
  if (nagrywanie.rekorder?.state === "recording") return;
  nagrywanie.kamera = nagrywanie.kamera === "environment" ? "user" : "environment";
  try { await wlaczKamere(); } catch (blad) { komunikat(`Nie udało się przełączyć kamery: ${blad.message}`); }
});

$("#start-nagrywania").addEventListener("click", () => {
  if (!nagrywanie.strumien) return;
  const typ = typNagrania();
  nagrywanie.kawalki = [];
  nagrywanie.rekorder = new MediaRecorder(nagrywanie.strumien, typ ? { mimeType: typ } : undefined);
  nagrywanie.rekorder.ondataavailable = (e) => { if (e.data.size) nagrywanie.kawalki.push(e.data); };
  nagrywanie.rekorder.onstop = async () => {
    const typPliku = nagrywanie.rekorder.mimeType || typ || "video/webm";
    const rozszerzenie = typPliku.includes("mp4") ? "mp4" : "webm";
    const plik = new File(nagrywanie.kawalki, `nagranie-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${rozszerzenie}`, { type: typPliku });
    zatrzymajKamere();
    $("#panel-nagrywania").classList.add("ukryty");
    ostatniPlik = plik;
    if (await zaladujWideo(plik)) await analizuj(plik.name);
  };
  nagrywanie.rekorder.start(250);
  nagrywanie.start = performance.now();
  nagrywanie.zegar = setInterval(() => {
    $("#czas-nagrania").textContent = `● ${liczba((performance.now() - nagrywanie.start) / 1000, 1)} s`;
  }, 200);
  $("#start-nagrywania").classList.add("ukryty");
  $("#stop-nagrywania").classList.remove("ukryty");
});

$("#stop-nagrywania").addEventListener("click", () => {
  if (nagrywanie.rekorder?.state === "recording") nagrywanie.rekorder.stop();
});

$("#anuluj-nagrywanie").addEventListener("click", () => {
  if (nagrywanie.rekorder?.state === "recording") {
    nagrywanie.rekorder.onstop = null;
    nagrywanie.rekorder.stop();
  }
  zatrzymajKamere();
  $("#panel-nagrywania").classList.add("ukryty");
});

/* Dla przeglądu ruchu (Playwright): stan ekranu bez sięgania do środka modułu. */
window.__analizaRuchu = {
  sesja: () => stan.sesja,
  stan: () => ({ biezaca: stan.biezaca, wybrany: stan.wybrany, strona: strona(), uklad: stan.uklad,
    powtorzenia: stan.powtorzenia.length, trajektorie: [...stan.trajektorie.keys()], maWideo: stan.maWideo }),
};
