/**
 * Wyszukiwarka ćwiczeń w konsoli — wybór z całej bazy, także z bibliotek filmów.
 *
 * Trener, 09.10.2026: „chciałbym wykorzystać całą ich bibliotekę […] ćwiczenia
 * będę mógł wstawiać do planów treningowych w swojej aplikacji”. To kilka
 * tysięcy pozycji — lista rozwijana w każdym wierszu planu by tego nie
 * uniosła (i nie dałoby się w niej niczego znaleźć). Lista w wierszu zostaje
 * przy BAZIE trenera, a tu jest szukanie:
 *
 * - po słowach z nazwy, w dowolnej kolejności („bench db” znajdzie
 *   „2DB Bench Press”); skróty z bibliotek i pełne słowa są równoważne
 *   (DB = dumbbell, KB = kettlebell, SA = single arm…), polskie słowa też
 *   działają („przysiad”, „wiosłowanie”, „hantle”);
 * - filtr kategorii (domyślnie ta z szkieletu wiersza), źródła i „bez do
 *   weryfikacji”;
 * - ▶ przy ćwiczeniu z filmem otwiera tę samą kartę, którą widzi klient.
 */
import { otworzKarteCwiczenia, kartaOtwarta } from "/klient/karta-cwiczenia.js";

const el = (tag, klasa, tekst) => {
  const e = document.createElement(tag);
  if (klasa) e.className = klasa;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
};

export const ZRODLA = { "": "Wszystkie źródła", baza: "Twoja baza", tom: "Theory of Motion", catalyst: "Catalyst Athletics" };
const ILE_NARAZ = 150;

/** Grupy równoważnych zapisów — skróty z tytułów bibliotek i pełne słowa. */
const ROWNOWAZNE = [
  ["db", "dumbbell", "hantl"], ["kb", "kettlebell", "kettl"], ["bb", "barbell", "sztang"],
  ["sa", "single arm", "s/a", "1 arm", "one arm", "jednorącz"], ["sl", "single leg", "s/l", "1 leg", "jednonóż"],
  ["oh", "overhead", "nad głow"], ["alt", "alternating", "naprzemienn"], ["mb", "med ball", "medball", "piłka lekarsk"],
  ["sb", "stability ball", "swiss ball"], ["rdl", "romanian deadlift"], ["ohp", "overhead press", "military press"],
  ["iso", "isometric", "izo", "izometr"], ["pull up", "pullup", "pull-up", "podciąg"], ["push up", "pushup", "push-up", "pompk"],
  ["chin up", "chinup", "chin-up"], ["step up", "step-up", "stepup"], ["sit up", "sit-up", "situp"],
  ["squat", "przysiad"], ["deadlift", "martwy"], ["press", "wyciskan"], ["row", "wiosł"], ["lunge", "wykrok"],
  ["curl", "uginan"], ["extension", "wyprost"], ["raise", "unoszen", "wznos"], ["plank", "desk"], ["carry", "nosz", "spacer"],
  ["jump", "skok"], ["hop", "podskok"], ["bridge", "most"], ["hip thrust", "wypych"], ["calf", "łyd"],
  ["band", "gum"], ["cable", "wyciąg"], ["machine", "maszyn"], ["bench", "ławk"], ["crunch", "brzuszk", "spięci"],
  ["stretch", "rozciąg"], ["mobility", "mobiln"], ["swing", "wymach"], ["clean", "zarzut"], ["snatch", "rwan"], ["jerk", "podrzut"],
  ["fly", "flye", "rozpiętk"], ["shoulder", "bark"], ["glute", "pośladk"], ["hamstring", "dwugłow"], ["tricep", "triceps"],
  ["bicep", "biceps"], ["chest", "klat"], ["core", "tułów", "brzuch"], ["walk", "chód", "marsz"],
];
const male = (t) => t.toLocaleLowerCase("pl").replace(/[‘’]/g, "'");
/** Małe litery, interpunkcja → spacje, „2DB” → „2 db”; z odstępem na brzegach (granice słów). */
const oczysc = (t) => ` ${male(t).replace(/[^\p{L}\p{N}/']+/gu, " ").replace(/(\d)(db|kb)\b/g, "$1 $2").trim()} `;
const ucieczka = (t) => t.replace(/[/.*+?^${}()|[\]\\]/g, "\\$&");
/** Grupa → wzorzec „któryś zapis od początku słowa” — liczone raz. */
const WZORCE = ROWNOWAZNE.map((grupa) => ({ grupa, re: new RegExp(` (${grupa.map(ucieczka).join("|")})`) }));

/** Dla słowa z zapytania — wszystkie zapisy, z których którykolwiek może pasować. */
function warianty(slowo) {
  const w = new Set([slowo]);
  for (const grupa of ROWNOWAZNE) {
    if (grupa.some((g) => g === slowo || (slowo.length >= 3 && g.startsWith(slowo)) || (g.length >= 4 && slowo.startsWith(g)))) {
      for (const g of grupa) w.add(g);
    }
  }
  return [...w];
}

/** Tekst, w którym szukamy: nazwa, jej skróty rozwinięte w obie strony i kategoria. */
function tekstDoSzukania(c) {
  const t = oczysc(c.nazwa);
  const dopiski = WZORCE.filter((w) => w.re.test(t)).flatMap((w) => w.grupa);
  return `${t}${dopiski.join(" ")} ${male(c.kategoria)} `;
}

/** Krótkie zapisy (do 3 znaków: „sa”, „db”, „row”) tylko od początku słowa — inaczej „sa” łapie „russian”. */
const pasuje = (tekst, x) => (x.length <= 3 ? tekst.includes(` ${x}`) : tekst.includes(x));

/** Słowa zapytania: „przysiad goblet” → [[warianty], [warianty]]. Frazy z ROWNOWAZNE (np. „single arm”) jako jedno słowo. */
function slowaZapytania(zapytanie) {
  let q = oczysc(zapytanie);
  const frazy = [];
  for (const grupa of ROWNOWAZNE) {
    for (const g of grupa) {
      if (g.includes(" ") && q.includes(` ${g} `)) { frazy.push(g); q = q.replace(` ${g} `, " "); }
    }
  }
  return [...frazy, ...q.split(/\s+/).filter(Boolean)].map(warianty);
}

let indeks = null;   // WeakMap ćwiczenie → tekst do szukania

/**
 * Wyniki dla filtrów — najpierw BAZA trenera, potem trafienia od początku nazwy, krótsze wyżej.
 * Ćwiczeń ukrytych przez trenera (arkusz weryfikacji) nie podsuwa — poza tym, które już stoi w slocie.
 */
export function szukajCwiczen(cwiczenia, { zapytanie = "", kategoria = "", zrodlo = "", bezWeryfikacji = false, wybraneId = null } = {}) {
  indeks ??= new WeakMap();
  const slowa = slowaZapytania(zapytanie);
  const pierwsze = male(zapytanie).trim().split(/\s+/)[0] ?? "";
  const wyniki = [];
  for (const c of cwiczenia) {
    if (c.ukryte && c.id !== wybraneId) continue;   // usunięte przez trenera — chyba że już stoi w slocie
    if (kategoria && c.kategoria !== kategoria) continue;
    if (zrodlo === "baza" && c.biblioteka) continue;
    if (zrodlo && zrodlo !== "baza" && c.biblioteka !== zrodlo) continue;
    if (bezWeryfikacji && c.uwagi?.startsWith("DO WERYFIKACJI")) continue;
    let tekst = indeks.get(c);
    if (tekst === undefined) { tekst = tekstDoSzukania(c); indeks.set(c, tekst); }
    if (!slowa.every((w) => w.some((x) => pasuje(tekst, x)))) continue;
    wyniki.push(c);
  }
  const ocena = (c) => (c.biblioteka ? 2 : 0) + (pierwsze && male(c.nazwa).startsWith(pierwsze) ? 0 : 1);
  return wyniki.sort((a, b) => ocena(a) - ocena(b) || a.nazwa.length - b.nazwa.length || a.nazwa.localeCompare(b.nazwa, "pl"));
}

/**
 * Przycisk filmów ćwiczenia: „▶” albo „▶ 3” przy kilku nagraniach; `null`, gdy
 * nie ma czego pokazać. Link YouTube z arkusza (ćwiczenie BAZY bez wpisu
 * w filmach) też liczy się jako film — serwer da go w podglądzie.
 */
export function opisFilmow(c) {
  if (c?.filmow > 0) {
    return {
      etykieta: c.filmow > 1 ? `▶ ${c.filmow}` : "▶",
      tytul: c.filmow > 1 ? `Filmy: ${c.filmow} nagrania — podgląd` : "Podgląd filmu",
    };
  }
  if (c?.filmZArkusza) return { etykieta: "▶", tytul: "Podgląd filmu z linku w arkuszu" };
  return null;
}

/** Karta ćwiczenia z filmami nad bieżącym ekranem (ta sama co u klienta). */
export async function podgladFilmow(id, przycisk, api) {
  try {
    const karta = await api(`/api/karta-cwiczenia?id=${encodeURIComponent(id)}`);
    if (karta) otworzKarteCwiczenia(karta, przycisk, { tekstZamkniecia: "Zamknij podgląd" });
  } catch { /* api pokazało błąd */ }
}

let otwarta = null;

/**
 * Okno wyszukiwarki. `naWybor(id)` — po kliknięciu ćwiczenia (okno się zamyka).
 * `kategoria` — filtr na start (kategoria szkieletu wiersza).
 */
export function otworzWyszukiwarke({ cwiczenia, kategorie, kategoria = "", wybraneId = null, naWybor, api }) {
  zamknijWyszukiwarke();
  const tlo = el("div", "wyszukiwarka-tlo");
  const okno = el("div", "wyszukiwarka");
  okno.setAttribute("role", "dialog");
  okno.setAttribute("aria-modal", "true");
  okno.setAttribute("aria-label", "Wybór ćwiczenia");

  const gora = el("div", "wyszukiwarka-gora");
  gora.append(el("h3", "", "Wybierz ćwiczenie"));
  const x = el("button", "wyszukiwarka-x", "✕");
  x.type = "button";
  x.setAttribute("aria-label", "Zamknij");
  x.onclick = () => zamknijWyszukiwarke();
  gora.append(x);

  const pole = el("input", "wyszukiwarka-pole");
  pole.type = "search";
  pole.placeholder = "Szukaj: np. goblet squat, wiosłowanie hantlem, KB swing…";
  pole.autocomplete = "off";
  pole.spellcheck = false;

  const filtry = el("div", "wyszukiwarka-filtry");
  const wybKat = el("select");
  wybKat.setAttribute("aria-label", "Kategoria");
  for (const [v, t] of [["", "Wszystkie kategorie"], ...kategorie.map((k) => [k, k])]) {
    const o = el("option", "", t); o.value = v; wybKat.append(o);
  }
  wybKat.value = kategoria ?? "";
  const wybZr = el("select");
  wybZr.setAttribute("aria-label", "Źródło");
  for (const [v, t] of Object.entries(ZRODLA)) {
    const o = el("option", "", t); o.value = v; wybZr.append(o);
  }
  const bezWer = el("label", "wyszukiwarka-bez");
  const pBezWer = el("input");
  pBezWer.type = "checkbox";
  bezWer.append(pBezWer, " bez „do weryfikacji”");
  filtry.append(wybKat, wybZr, bezWer);

  const licznik = el("p", "wyszukiwarka-licznik");
  const lista = el("ul", "wyszukiwarka-lista");
  lista.setAttribute("role", "listbox");
  const wiecej = el("button", "wyszukiwarka-wiecej", "Pokaż więcej");
  wiecej.type = "button";

  okno.append(gora, pole, filtry, licznik, lista, wiecej);
  tlo.append(okno);
  document.body.append(tlo);
  document.body.classList.add("wyszukiwarka-otwarta");

  let wyniki = [];
  let pokazane = ILE_NARAZ;
  let aktywny = 0;

  const zaznacz = (i) => {
    const wiersze = lista.querySelectorAll(".wyszukiwarka-wynik");
    if (!wiersze.length) return;
    aktywny = Math.max(0, Math.min(wiersze.length - 1, i));
    wiersze.forEach((w, j) => w.setAttribute("aria-selected", String(j === aktywny)));
    wiersze[aktywny].scrollIntoView({ block: "nearest" });
  };

  const wybierz = (c) => {
    zamknijWyszukiwarke();
    naWybor(c.id);
  };

  const rysuj = () => {
    lista.replaceChildren();
    const ile = wyniki.length;
    licznik.textContent = ile === 0 ? "Nic nie pasuje — zmień słowa albo filtry."
      : `${ile} ${ile === 1 ? "ćwiczenie" : ile % 10 >= 2 && ile % 10 <= 4 && (ile % 100 < 10 || ile % 100 >= 20) ? "ćwiczenia" : "ćwiczeń"}`
        + (ile > pokazane ? ` · pokazuję ${pokazane}` : "");
    for (const c of wyniki.slice(0, pokazane)) {
      const li = el("li", "wyszukiwarka-wynik");
      li.setAttribute("role", "option");
      li.dataset.id = c.id;
      if (c.id === wybraneId) li.classList.add("obecne");
      const opis = el("div", "wyszukiwarka-opis");
      const nazwa = el("span", "wyszukiwarka-nazwa", c.nazwa + (c.jednostronne ? "  ↔" : ""));
      const meta = el("span", "wyszukiwarka-meta",
        [c.kategoria, `coeff ${String(c.coeff).replace(".", ",")}`, c.progresja,
          c.biblioteka ? ZRODLA[c.biblioteka] : "Twoja baza"].join(" · "));
      opis.append(nazwa, meta);
      if (c.uwagi?.startsWith("DO WERYFIKACJI")) {
        const z = el("span", "wyszukiwarka-weryfikacja", "do weryfikacji");
        z.title = c.uwagi;
        opis.append(z);
      }
      li.append(opis);
      const filmy = opisFilmow(c);
      if (filmy) {
        const p = el("button", "wyszukiwarka-film", filmy.etykieta);
        p.type = "button";
        p.title = filmy.tytul;
        p.onclick = (e) => { e.stopPropagation(); podgladFilmow(c.id, p, api); };
        li.append(p);
      }
      li.onclick = () => wybierz(c);
      lista.append(li);
    }
    wiecej.classList.toggle("ukryty", wyniki.length <= pokazane);
    zaznacz(0);
  };

  const odswiez = () => {
    wyniki = szukajCwiczen(cwiczenia, {
      zapytanie: pole.value, kategoria: wybKat.value, zrodlo: wybZr.value, bezWeryfikacji: pBezWer.checked, wybraneId,
    });
    pokazane = ILE_NARAZ;
    rysuj();
  };
  let zwloka = null;
  pole.addEventListener("input", () => { clearTimeout(zwloka); zwloka = setTimeout(odswiez, 120); });
  for (const f of [wybKat, wybZr, pBezWer]) f.addEventListener("change", odswiez);
  wiecej.onclick = () => { pokazane += ILE_NARAZ; rysuj(); };

  pole.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); zaznacz(aktywny + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); zaznacz(aktywny - 1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(zwloka);
      if (zwloka) { odswiez(); zwloka = null; }
      const c = wyniki[aktywny];
      if (c) wybierz(c);
    }
  });
  const naKlawisz = (e) => { if (e.key === "Escape" && !kartaOtwarta()) zamknijWyszukiwarke(); };
  document.addEventListener("keydown", naKlawisz);
  tlo.addEventListener("click", (e) => { if (e.target === tlo) zamknijWyszukiwarke(); });

  otwarta = { tlo, naKlawisz, poprzedniFokus: document.activeElement };
  odswiez();
  pole.focus();
}

export function zamknijWyszukiwarke() {
  if (!otwarta) return;
  const { tlo, naKlawisz, poprzedniFokus } = otwarta;
  otwarta = null;
  document.removeEventListener("keydown", naKlawisz);
  tlo.remove();
  document.body.classList.remove("wyszukiwarka-otwarta");
  if (poprzedniFokus?.isConnected) poprzedniFokus.focus({ preventScroll: true });
}

export const wyszukiwarkaOtwarta = () => otwarta !== null;
