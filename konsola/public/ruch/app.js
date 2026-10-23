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
import { GLOWNE_PUNKTY, lustro, nazwaPunktu, punktWidoczny, stronaPunktu, ukryteBezStrony } from "./szkielet.js";
import { MODELE_SRODKA, srodekSesji, wzgledemStop } from "./srodek.js";
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

// Punkty schowane z obrazu (23.10.2026) — ustawienie trenera na tym urządzeniu,
// nie część analizy: zapis JSON ma zawsze wszystkie 33 punkty.
const KLUCZ_UKRYTYCH = "craftmyplan-ruch-ukryte-punkty";
function wczytajUkryte() {
  try {
    const lista = JSON.parse(localStorage.getItem(KLUCZ_UKRYTYCH) ?? "[]");
    return new Set(Array.isArray(lista) ? lista.filter((id) => GLOWNE_PUNKTY.includes(id)) : []);
  } catch {
    return new Set();
  }
}
function zapiszUkryte() {
  try { localStorage.setItem(KLUCZ_UKRYTYCH, JSON.stringify([...stan.ukryte])); } catch { /* bez pamięci — tylko do zamknięcia karty */ }
}

const stan = {
  sesja: null,
  katy: { "2d": null, "3d": null },
  uklad: "2d",
  strona: "auto",
  stronaAuto: "L",
  biezaca: 0,
  wybrany: null,
  wszystkie: false,
  ukryte: wczytajUkryte(),        // główne punkty schowane z obrazu
  pokazKaty: true,
  pokazTrajektorie: true,
  pokazSrodek: true,
  srodek: null,                   // środek ciężkości całego nagrania (srodekSesji) + droga
  ujecie: null,                   // „bok” / „przod” / „skos” — z całego nagrania
  wykresSrodka: null,
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
    wpiszUstawieniaSrodka(sesja.srodekCiezkosci);
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
  stan.ujecie = widok;
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
const KROTKO = { kolano: "kolano", biodro: "biodro", skokowy: "zgięcie grzb.", tulow: "tułów", lokiec: "łokieć", ramie: "ramię" };

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
  przeliczSrodek();
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
  stan.wykresSrodka?.ustawBiezaca(stan.biezaca);
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
    ukryte: stan.ukryte,
    wybrany: stan.wybrany,
    katy: stan.pokazKaty ? katyKlatki(k, wymiary()) : null,
    strona: strona(),
    trajektorie,
    sugestie: sugestieKlatki(stan.sesja, stan.biezaca),
    srodek: stan.pokazSrodek ? opcjeSrodka() : null,
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
  rysujOdczytSrodka();
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
    { wszystkie: stan.wszystkie, ukryte: stan.ukryte, zasieg: e.pointerType === "touch" ? 36 : 22 });
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
  if (!stan.sesja) return;
  przeliczWyniki();
  rysuj();
});

/* ── punkty na obrazie ──────────────────────────────────────────── */

// Trener, 23.10.2026: „chciałbym móc obserwować tylko punkty po prawej
// stronie bez lewej w niektórych sytuacjach”. Wybór dotyczy tylko obrazu.
function opisUkrytych() {
  const widoczne = GLOWNE_PUNKTY.length - stan.ukryte.size;
  if (stan.ukryte.size === 0) return "wszystkie";
  for (const [s, opis] of [["P", "tylko prawa strona"], ["L", "tylko lewa strona"]]) {
    const wzor = ukryteBezStrony(s);
    if (wzor.size === stan.ukryte.size && [...wzor].every((id) => stan.ukryte.has(id))) return opis;
  }
  return widoczne === 0 ? "żaden — sam film" : `${widoczne} z ${GLOWNE_PUNKTY.length}`;
}

// Układ jak ciało (trener, 23.10.2026: „ułóż te punkty w sposób bardziej
// przejrzysty”): wiersze od głowy do stóp, kolumny — strona lewa i prawa,
// jak w tabeli kątów. Pole w nagłówku kolumny — cała strona naraz.
const STAWY = ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"];
const STRONY = [["L", "left", "Lewa"], ["P", "right", "Prawa"]];

function polePunktu(id) {
  const pole = el("input");
  pole.type = "checkbox";
  pole.dataset.punkt = id;
  pole.setAttribute("aria-label", nazwaPunktu(id));
  pole.checked = !stan.ukryte.has(id);
  pole.addEventListener("change", () => {
    if (pole.checked) stan.ukryte.delete(id);
    else stan.ukryte.add(id);
    zmienionoUkryte();
  });
  return pole;
}

function rysujWyborPunktow() {
  $("#opis-punktow").textContent = opisUkrytych();
  const naglowek = el("tr");
  naglowek.append(el("th"));
  for (const [s, przedrostek, nazwa] of STRONY) {
    const ids = STAWY.map((staw) => `${przedrostek}_${staw}`);
    const widoczne = ids.filter((id) => !stan.ukryte.has(id)).length;
    const pole = el("input");
    pole.type = "checkbox";
    pole.dataset.strona = s;
    pole.setAttribute("aria-label", `${nazwa} strona — wszystkie punkty`);
    pole.checked = widoczne === ids.length;
    pole.indeterminate = widoczne > 0 && widoczne < ids.length;
    pole.addEventListener("change", () => {
      for (const id of ids) (pole.checked ? stan.ukryte.delete(id) : stan.ukryte.add(id));
      zmienionoUkryte();
    });
    const znak = el("span", "znak-strony");
    znak.style.background = kolorPunktu(`${przedrostek}_shoulder`);
    const etykieta = el("label");
    etykieta.append(pole, znak, nazwa);
    const th = el("th");
    th.append(etykieta);
    naglowek.append(th);
  }
  const glowa = el("tr");
  const poleGlowy = el("td", "srodek-punktow");
  poleGlowy.colSpan = 2;
  poleGlowy.append(polePunktu("glowa"));
  glowa.append(el("th", null, nazwaPunktu("glowa")), poleGlowy);
  const wiersze = STAWY.map((staw) => {
    const w = el("tr");
    w.append(el("th", null, nazwaPunktu(`left_${staw}`).replace(/ L$/, "")));
    for (const [, przedrostek] of STRONY) {
      const td = el("td");
      td.append(polePunktu(`${przedrostek}_${staw}`));
      w.append(td);
    }
    return w;
  });
  $("#wybor-punktow").replaceChildren(naglowek, glowa, ...wiersze);
}

function zmienionoUkryte() {
  zapiszUkryte();
  rysujWyborPunktow();
  rysujWyborTrajektorii();
  rysuj();
}

for (const przycisk of document.querySelectorAll(".szybki-wybor-punktow button")) {
  przycisk.addEventListener("click", () => {
    const s = przycisk.dataset.strona || null;
    stan.ukryte = ukryteBezStrony(s);
    // Jedna strona na obrazie — trajektorie przechodzą na nią (te same stawy,
    // te same kolory), inaczej schowane punkty zabrałyby je z obrazu.
    if (s) {
      const nowe = new Map();
      for (const [id, kolor] of stan.trajektorie) {
        const cel = stronaPunktu(id) && stronaPunktu(id) !== s ? lustro(id) : id;
        if (!nowe.has(cel)) nowe.set(cel, kolor);
      }
      stan.trajektorie = nowe;
    }
    // Jedna strona na obrazie — kąty (tabela, wykres, powtórzenia) też z niej.
    if (s && $("#strona").value !== s) {
      $("#strona").value = s;
      $("#strona").dispatchEvent(new Event("change"));
    }
    zmienionoUkryte();
  });
}
rysujWyborPunktow();

// Rozwinięte od razu; zwinięcie zostaje na tym urządzeniu.
const KLUCZ_ZWINIECIA_PUNKTOW = "craftmyplan-ruch-punkty-zwiniete";
try { if (localStorage.getItem(KLUCZ_ZWINIECIA_PUNKTOW) === "1") $("#punkty-obrazu").open = false; } catch { /* bez pamięci */ }
$("#punkty-obrazu").addEventListener("toggle", () => {
  try {
    if ($("#punkty-obrazu").open) localStorage.removeItem(KLUCZ_ZWINIECIA_PUNKTOW);
    else localStorage.setItem(KLUCZ_ZWINIECIA_PUNKTOW, "1");
  } catch { /* bez pamięci */ }
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
  /*
   * Kąty dwa razy (trener, 23.10.2026): największe w całym ruchu — jak dotąd
   * — i w najgłębszym punkcie, czyli tam, gdzie w pracy magisterskiej
   * „sczytywał zakresy w stawach” (biodro najniżej). Dwa wiersze na
   * powtórzenie, te same kolumny jedna pod drugą — tabela mieści się obok
   * filmu, a wartości da się porównać wzrokiem. Nazwy pełne, bez „stopa”
   * zamiast zgięcia grzbietowego stawu skokowego.
   */
  const procent = (v) => (v === null || v === undefined ? "—" : `${liczba(v)}%`);
  const czasy = [
    ["ruch", (r) => sekundy(r.czas * 1000)],
    ["w dół", (r) => sekundy(r.zejscie * 1000)],
    ["w górę", (r) => sekundy(r.wstawanie * 1000)],
  ];
  const katyKolumny = [
    ["zgięcie kolana", "kolano"], ["zgięcie biodra", "biodro"],
    ["zgięcie grzbietowe stawu skokowego", "skokowy"], ["pochylenie tułowia", "tulow"],
  ];
  const wDole = [
    ["biodro względem kolana", (r) => (r.glebokosc === null ? "—"
      : `${r.glebokosc > 0 ? "pod" : "nad"} ${liczba(Math.abs(r.glebokosc))}%`)],
    ["rozstaw kolan do stóp", (r) => (r.kolanaDoStop === null ? "—" : liczba(r.kolanaDoStop, 2))],
    ...(stan.srodek ? [[`środek ciężkości ${konczynySrodka() === "obie" ? "między stopami" : "nad stopą"}`,
      (r) => procent(stan.srodek.wzgledemGladkie[r.dol])]] : []),
  ];
  // Czasy w wierszu nad kątami — osiem kolumn zamiast dwunastu mieści się obok filmu i na iPadzie.
  const liczbaKolumn = 1 + katyKolumny.length + wDole.length;
  const naglowek = el("tr");
  for (const nazwa of ["", ...katyKolumny.map(([n]) => n), ...wDole.map(([n]) => n)]) {
    naglowek.append(el("th", "liczba", nazwa));
  }
  const wiersze = podsumowanie.flatMap((r) => {
    const doDolu = () => { zatrzymaj(); pokazKlatke(r.dol); };
    const opis = el("tr", "klikalny wiersz-powtorzenia");
    const maks = el("tr", "klikalny wiersz-maks");
    const dol = el("tr", "klikalny wiersz-dol");
    for (const w of [opis, maks, dol]) {
      w.title = "Pokaż najgłębszy punkt tego powtórzenia";
      w.addEventListener("click", doDolu);
    }
    const tytul = el("td", "", `Powtórzenie ${r.numer} · ${czasy.map(([n, f]) => `${n} ${f(r)}`).join(" · ")}`);
    tytul.colSpan = liczbaKolumn;
    opis.append(tytul);
    maks.append(el("td", "rodzaj-wiersza", "największe w ruchu"));
    dol.append(el("td", "rodzaj-wiersza", "w najgłębszym punkcie"));
    for (const [, klucz] of katyKolumny) {
      maks.append(el("td", "liczba", st(r[`${klucz}Maks`])));
      dol.append(el("td", "liczba", st(r[`${klucz}Dol`])));
    }
    for (const [, f] of wDole) {
      maks.append(el("td", "liczba", ""));
      dol.append(el("td", "liczba", f(r)));
    }
    return [opis, maks, dol];
  });
  if (wiersze.length === 0) {
    const w = el("tr");
    const td = el("td", "niepewny", "Nie znalazłem pełnego powtórzenia (zejście i powrót).");
    td.colSpan = liczbaKolumn;
    w.append(td);
    wiersze.push(w);
  }
  tabela.replaceChildren(naglowek, ...wiersze);
  $("#opis-powtorzen").textContent = `Strona ${strona() === "L" ? "lewa" : "prawa"}, kąty ${stan.uklad === "3d" ? "3D" : "2D"}. `
    + "„Największe w ruchu” — najwięcej, ile było w powtórzeniu (każdy kąt w swojej klatce). "
    + "„W najgłębszym punkcie” — wszystko z jednej klatki: tej, w której biodro jest najniżej na obrazie "
    + "(jak krętarz najbliżej podłoża); wiersz przenosi do niej. "
    + "Biodro względem kolana: o ile biodro jest niżej („pod”) albo wyżej („nad”) niż kolano, w % długości uda — "
    + "„pod” = poniżej równoległej. "
    + "Rozstaw kolan do stóp: odległość kolan do odległości stawów skokowych, tylko przy ujęciu z przodu "
    + "(z boku kolana się nakrywają — wtedy „—”); poniżej 1 = kolana do środka, powyżej 1 = na zewnątrz."
    + (stan.srodek ? ` Środek ciężkości: ${konczynySrodka() === "obie" ? "lewa stopa 0%, prawa 100%" : "pięta 0%, palce 100%"}.` : "");
}

/* ── środek ciężkości ───────────────────────────────────────────── */

// Trener, 23.10.2026: „dodajmy możliwość analizy środka ciężkości metodą
// segmentową — De Leva razem z rozróżnieniem na płeć, plus wygładzenie”.
// Ustawienia z pól panelu; zapisują się w analizie (JSON) — po ponownym
// otwarciu wynik jest ten sam.
function ustawieniaSrodka() {
  const liczbaPola = (sel) => {
    const v = Number(String($(sel).value).replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  return {
    model: MODELE_SRODKA[$("#model-srodka").value] ? $("#model-srodka").value : null,
    obciazenieKg: liczbaPola("#obciazenie-kg") ?? 0,
    miejsce: $("#miejsce-obciazenia").value,
    masaCiala: liczbaPola("#masa-ciala"),
    wygladzanie: $("#wygladzanie-srodka").checked,
  };
}

function wpiszUstawieniaSrodka(u) {
  $("#model-srodka").value = u?.model && MODELE_SRODKA[u.model] ? u.model : "";
  $("#obciazenie-kg").value = String(u?.obciazenieKg ?? 0);
  $("#miejsce-obciazenia").value = u?.miejsce === "dlonie" ? "dlonie" : "barki";
  $("#masa-ciala").value = u?.masaCiala ? String(u.masaCiala) : "";
  $("#wygladzanie-srodka").checked = u?.wygladzanie !== false;
  // Analiza z obciążeniem — pola od razu widać.
  if (u?.obciazenieKg > 0) $("#obciazenie-srodka").open = true;
  rysujOpisObciazenia();
}

// „60 kg”, „62,5 kg” — bez „,0” przy pełnych kilogramach.
const kg = (v) => liczba(v, Number.isInteger(v) ? 0 : 1);

function rysujOpisObciazenia() {
  const u = ustawieniaSrodka();
  $("#opis-obciazenia").textContent = u.obciazenieKg > 0
    ? `${kg(u.obciazenieKg)} kg ${u.miejsce === "dlonie" ? "w dłoniach" : "na barkach"}`
      + (u.masaCiala ? ` · masa ciała ${kg(u.masaCiala)} kg` : " · brak masy ciała")
    : "bez obciążenia";
}

// Z boku dalsza ręka i noga są zasłonięte — liczymy stronę z „Strona ciała”
// podwójnie; z przodu i ze skosu — obie strony.
const konczynySrodka = () => (stan.ujecie === "bok" ? strona() : "obie");

function przeliczSrodek() {
  const s = stan.sesja;
  if (!s) return;
  const u = ustawieniaSrodka();
  const konczyny = konczynySrodka();
  if (u.model) s.srodekCiezkosci = { ...u, konczyny };
  else delete s.srodekCiezkosci;
  stan.srodek = null;
  if (u.model) {
    stan.srodek = srodekSesji(s, {
      model: u.model, konczyny, wygladzanie: u.wygladzanie, fps: fpsSesji(s),
      obciazenie: u.obciazenieKg > 0 ? { kg: u.obciazenieKg, masaCiala: u.masaCiala, miejsce: u.miejsce } : null,
    });
    const { szerokosc, wysokosc } = s.wideo;
    stan.srodek.droga = stan.srodek.xGladkie.map((x, i) => (x === null || stan.srodek.yGladkie[i] === null
      ? null : { x: x / szerokosc, y: stan.srodek.yGladkie[i] / wysokosc }));
  }
  rysujWykresSrodka();
  rysujOpisSrodka();
  rysujOdczytSrodka();
  rysujWyborModeluSrodka();
  rysujOpisObciazenia();
}

// Przy przełączniku „środek ciężkości” widać, czy model jest wybrany.
// Trener, 23.10.2026: „nie widzę środka ciężkości na nagraniu” — przełącznik
// był zaznaczony, ale płeć wybiera się w panelu niżej, a tego nic nie mówiło.
function rysujWyborModeluSrodka() {
  const przycisk = $("#wybierz-model-srodka");
  const model = ustawieniaSrodka().model;
  przycisk.classList.toggle("brak", !model);
  przycisk.textContent = model ? `${MODELE_SRODKA[model].nazwa} · zmień` : "wybierz płeć osoby →";
  przycisk.title = model ? "Zmień model segmentów w panelu „Środek ciężkości”"
    : "Środek ciężkości liczy się po wybraniu płci osoby (modelu segmentów) w panelu „Środek ciężkości”";
}

function pokazPanelSrodka() {
  const panel = $("#panel-srodka");
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
  panel.classList.add("podswietlony");
  setTimeout(() => panel.classList.remove("podswietlony"), 1800);
  $("#model-srodka").focus({ preventScroll: true });
}

function opcjeSrodka() {
  const s = stan.srodek;
  const w = s?.klatki[stan.biezaca];
  if (!w) return null;
  const { szerokosc, wysokosc } = stan.sesja.wideo;
  const i = stan.biezaca;
  return {
    x: (s.xGladkie[i] ?? w.x) / szerokosc,
    y: (s.yGladkie[i] ?? w.y) / wysokosc,
    pewny: w.pewny,
    podloga: w.stopy.podloga / wysokosc,
    droga: s.droga,
    biezacy: i,
  };
}

const opisSkali = () => (konczynySrodka() === "obie"
  ? ["między stopami", "lewa stopa 0% → prawa 100%"]
  : ["nad stopą", "pięta 0% → palce 100%"]);

function rysujOdczytSrodka() {
  const p = $("#odczyt-srodka");
  const s = stan.srodek;
  if (!stan.sesja) return;
  if (!s) {
    p.textContent = "Wybierz model segmentów (płeć osoby) — środek ciężkości policzy się w każdej klatce.";
    return;
  }
  const i = stan.biezaca;
  const w = s.klatki[i];
  p.replaceChildren();
  if (!w) { p.append(`Klatka ${i + 1}: MediaPipe nie znalazł tu sylwetki.`); return; }
  const v = s.wzgledemGladkie[i] ?? wzgledemStop(w);
  const [gdzie, skala] = opisSkali();
  p.append(`Klatka ${i + 1}: środek ciężkości ${gdzie} `, el("strong", null, v === null ? "—" : `${liczba(v)}%`), ` (${skala})`);
  if (!w.pewny) {
    p.append(el("span", "niepewny", ` · ? niepewny — słabo widoczne punkty części ciała o masie ${liczba(w.niepewnaMasa * 100)}% ciała`));
  }
  const u = ustawieniaSrodka();
  if (u.obciazenieKg > 0 && !u.masaCiala) p.append(el("span", "niepewny", " · podaj masę ciała, żeby doliczyć obciążenie"));
}

function rysujOpisSrodka() {
  const u = ustawieniaSrodka();
  const konczyny = konczynySrodka();
  const czesci = [
    "Metoda segmentowa: środek ciężkości każdej części ciała (głowa, tułów, ramiona, przedramiona, dłonie, uda, podudzia, stopy)"
      + " z punktów MediaPipe, a potem średnia ważona ich masą — w każdej klatce.",
  ];
  if (u.model) {
    czesci.push(`${MODELE_SRODKA[u.model].nazwa}.`);
    czesci.push(konczyny === "obie"
      ? "Ujęcie z przodu albo skośne — obie strony ciała osobno; wynik to położenie między stopami."
      : `Ujęcie z boku — strona ${konczyny === "L" ? "lewa" : "prawa"} (pole „Strona ciała”) liczona podwójnie, bo dalsza ręka`
        + " i noga są zasłonięte; wynik to położenie nad stopą.");
    czesci.push("Przybliżenia: punkty MediaPipe zamiast środków stawów, głowa — środek uszu, tułów — od środka barków do środka bioder.");
    if (u.wygladzanie) czesci.push("Wygładzanie: filtr Butterwortha 6 Hz w przód i w tył (bez przesunięcia w czasie); blada linia — bez wygładzania.");
    if (u.obciazenieKg > 0) {
      czesci.push(u.masaCiala
        ? `Obciążenie ${kg(u.obciazenieKg)} kg ${u.miejsce === "dlonie" ? "w dłoniach" : "na barkach"} doliczone do ${kg(u.masaCiala)} kg masy ciała.`
        : "Obciążenie nie jest doliczone — brakuje masy ciała.");
    }
    czesci.push("„?” — klatka niepewna: słabo widoczne punkty części ciała o łącznej masie ponad 10% ciała.");
  }
  $("#opis-srodka").textContent = czesci.join(" ");
}

function rysujWykresSrodka() {
  const kontener = $("#wykres-srodka");
  const s = stan.srodek;
  kontener.classList.toggle("ukryty", !s);
  if (!s) return;
  const [gdzie] = opisSkali();
  const serie = [{ id: "srodek", nazwa: `środek ciężkości ${gdzie}`, krotko: "ŚC", kolor: "var(--srodek)", wartosci: s.wzgledemGladkie }];
  if (ustawieniaSrodka().wygladzanie) {
    serie.unshift({ id: "srodek-surowy", nazwa: "bez wygładzania", krotko: "", kolor: "var(--srodek-blady)", wartosci: s.wzgledem });
  }
  const dane = {
    czasy: stan.sesja.klatki.map((k) => k.t), serie, powtorzenia: stan.powtorzenia, biezaca: stan.biezaca,
    naWybor: (i) => { zatrzymaj(); pokazKlatke(i); },
    jednostka: "%", krokSiatki: 25, zakres: [0, 100], opis: "Środek ciężkości w czasie",
  };
  if (stan.wykresSrodka) stan.wykresSrodka.odswiez(dane);
  else stan.wykresSrodka = wykresKatow(kontener, dane);
}

for (const [pole, zdarzenie] of [["#model-srodka", "change"], ["#obciazenie-kg", "input"], ["#miejsce-obciazenia", "change"],
  ["#masa-ciala", "input"], ["#wygladzanie-srodka", "change"]]) {
  $(pole).addEventListener(zdarzenie, () => {
    if (!stan.sesja) return;
    przeliczSrodek();
    rysujPowtorzenia(katyUkladu());
    rysuj();
  });
}
$("#pokaz-srodek").addEventListener("change", (e) => {
  stan.pokazSrodek = e.target.checked;
  // Zaznaczony bez modelu — od razu tam, gdzie się go wybiera.
  if (stan.pokazSrodek && !ustawieniaSrodka().model) pokazPanelSrodka();
  rysuj();
});
$("#wybierz-model-srodka").addEventListener("click", pokazPanelSrodka);

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
    // Wybrana, ale punkt schowany w „Punkty na obrazie” — drogi na obrazie nie ma.
    if (stan.trajektorie.has(id) && !punktWidoczny(id, stan.ukryte)) {
      etykieta.classList.add("schowana");
      etykieta.title = "Punkt schowany w „Punkty na obrazie” — jego droga nie rysuje się na obrazie";
      etykieta.append(el("span", "dopisek-schowana", "schowany"));
    }
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
    powtorzenia: stan.powtorzenia.length, trajektorie: [...stan.trajektorie.keys()], maWideo: stan.maWideo,
    ukryte: [...stan.ukryte],
    srodek: stan.srodek ? {
      model: ustawieniaSrodka().model, konczyny: konczynySrodka(),
      x: stan.srodek.xGladkie[stan.biezaca] ?? stan.srodek.klatki[stan.biezaca]?.x ?? null,
      y: stan.srodek.yGladkie[stan.biezaca] ?? stan.srodek.klatki[stan.biezaca]?.y ?? null,
      wzgledem: stan.srodek.wzgledemGladkie[stan.biezaca] ?? null,
      pewny: stan.srodek.klatki[stan.biezaca]?.pewny ?? null,
    } : null }),
};
