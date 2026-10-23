/**
 * Ruch w czasie: serie kątów, trajektorie punktów, wyszukiwanie klatki
 * i liczenie powtórzeń. Czysty moduł — bez DOM i bez MediaPipe.
 */
import { katyKlatki, pewny, punktyWUkladzie } from "./geometria.js";
import { PROG_WIDOCZNOSCI, rozwiazywacz } from "./szkielet.js";

/** Wymiary filmu sesji — do przeliczenia punktów znormalizowanych na piksele. */
export const wymiarySesji = (sesja) => ({ szerokosc: sesja.wideo.szerokosc, wysokosc: sesja.wideo.wysokosc });

/**
 * Kąty wszystkich klatek naraz: `[{id: wynik}]` (albo `null` bez sylwetki).
 * Liczone raz po analizie — wykres i tabela czytają z tej tablicy.
 */
export function katySesji(sesja, uklad = "2d") {
  const wymiary = wymiarySesji(sesja);
  return sesja.klatki.map((k) => katyKlatki(k, wymiary, { uklad }));
}

/** Seria jednego kąta: wartość na klatkę albo `null`, gdy niepewna lub brak. */
export function seria(katy, id) {
  return katy.map((k) => (pewny(k?.[id]) ? k[id].wartosc : null));
}

/**
 * Trajektoria punktu w pikselach: `[{t, x, y, v} | null]` na każdą klatkę.
 * Działa dla każdego z 33 landmarków i dla punktów pochodnych (głowa).
 */
export function trajektoria(sesja, id) {
  const wymiary = wymiarySesji(sesja);
  return sesja.klatki.map((k) => {
    const punkty = punktyWUkladzie(k, wymiary, "2d");
    if (!punkty) return null;
    const q = rozwiazywacz(punkty)(id);
    return q ? { t: k.t, x: q.x, y: q.y, v: q.v } : null;
  });
}

/**
 * Zakres ruchu punktu w pikselach — tylko z pewnych klatek.
 * `null`, gdy pewnych klatek nie ma.
 */
export function zakresRuchu(traj) {
  const pewne = traj.filter((q) => q && q.v >= PROG_WIDOCZNOSCI);
  if (pewne.length === 0) return null;
  const xs = pewne.map((q) => q.x);
  const ys = pewne.map((q) => q.y);
  return {
    poziomo: Math.max(...xs) - Math.min(...xs),
    pionowo: Math.max(...ys) - Math.min(...ys),
    klatek: pewne.length,
  };
}

/** Indeks klatki najbliższej czasowi `tMs` (klatki posortowane po `t`). */
export function klatkaDlaCzasu(klatki, tMs) {
  if (klatki.length === 0) return -1;
  let lo = 0;
  let hi = klatki.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (klatki[mid].t < tMs) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(klatki[lo - 1].t - tMs) <= Math.abs(klatki[lo].t - tMs)) return lo - 1;
  return lo;
}

/**
 * Klatka widoczna w chwili `tMs` — ostatnia, która już się zaczęła
 * (`t ≤ tMs`). Przy odtwarzaniu film pokazuje klatkę do chwili następnej,
 * więc „najbliższa” wyprzedzałaby obraz o pół klatki. −1 przed pierwszą.
 */
export function klatkaWChwili(klatki, tMs) {
  let lo = 0;
  let hi = klatki.length - 1;
  let wynik = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (klatki[mid].t <= tMs + 0.5) { wynik = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return wynik;
}

/**
 * Chwila, na którą przewinąć film, żeby pokazał klatkę `i`.
 *
 * Klatki z odtwarzania mają prawdziwe czasy z filmu — przewinięcie dokładnie
 * na nie bywa o ułamek milisekundy za wcześnie i pokazuje poprzednią, więc
 * celujemy w środek klatki. Klatki z przewijania (co 1/30 s) to chwile, nie
 * klatki filmu — tam dokładnie w ich czas, bo tak je liczono.
 */
export function chwilaKlatki(sesja, i) {
  const k = sesja.klatki[i];
  if (sesja.analiza?.tryb !== "odtwarzanie") return k.t;
  const nastepna = sesja.klatki[i + 1];
  const odstep = nastepna ? nastepna.t - k.t : i > 0 ? k.t - sesja.klatki[i - 1].t : 0;
  return k.t + odstep / 2;
}

/**
 * Krótkie luki (do `maksLuki` klatek) wypełnione liniowo; dłuższe zostają `null`.
 * Pojedyncza niepewna klatka w środku zejścia nie ma rozcinać powtórzenia.
 */
export function wypelnijLuki(wartosci, maksLuki = 5) {
  const w = [...wartosci];
  let i = 0;
  while (i < w.length) {
    if (w[i] !== null) { i++; continue; }
    let j = i;
    while (j < w.length && w[j] === null) j++;
    const przed = i - 1;
    if (przed >= 0 && j < w.length && j - i <= maksLuki) {
      for (let k = i; k < j; k++) w[k] = w[przed] + ((w[j] - w[przed]) * (k - przed)) / (j - przed);
    }
    i = j;
  }
  return w;
}

/** Średnia krocząca, wyśrodkowana; `null` pomijane. */
export function wygladz(wartosci, okno = 5) {
  const pol = Math.floor(okno / 2);
  return wartosci.map((v, i) => {
    if (v === null) return null;
    let suma = 0;
    let n = 0;
    for (let k = Math.max(0, i - pol); k <= Math.min(wartosci.length - 1, i + pol); k++) {
      if (wartosci[k] !== null) { suma += wartosci[k]; n++; }
    }
    return suma / n;
  });
}

function percentyl(posortowane, p) {
  const i = (posortowane.length - 1) * p;
  const d = Math.floor(i);
  const g = Math.ceil(i);
  return posortowane[d] + (posortowane[g] - posortowane[d]) * (i - d);
}

/**
 * Powtórzenia z sygnału, który rośnie w dole ruchu (np. zgięcie kolana
 * w przysiadzie).
 *
 * Progi liczone z samego nagrania: poziom „góry” (10. percentyl) i „dołu”
 * (90. percentyl). Wejście w dół powyżej 60 % zakresu, wyjście poniżej 30 % —
 * histereza, żeby drżenie przy progu nie liczyło się jako dwa powtórzenia.
 * Początek i koniec powtórzenia to miejsca, gdzie sygnał schodzi do 15 %
 * zakresu (stanie przed i po nie wlicza się do czasu ruchu).
 *
 * `minAmplituda` — poniżej tej różnicy góra–dół to nie jest powtórzenie
 * (np. samo stanie z drobnym ruchem).
 */
export function wykryjPowtorzenia(wartosci, { minAmplituda = 25, okno = 5 } = {}) {
  const sygnal = wygladz(wypelnijLuki(wartosci), okno);
  const znane = sygnal.filter((v) => v !== null).sort((a, b) => a - b);
  if (znane.length < 3) return [];
  const gora = percentyl(znane, 0.1);
  const dol = percentyl(znane, 0.9);
  const amplituda = dol - gora;
  if (amplituda < minAmplituda) return [];
  const wejscie = gora + 0.6 * amplituda;
  const wyjscie = gora + 0.3 * amplituda;
  const spoczynek = gora + 0.15 * amplituda;

  const powtorzenia = [];
  let wDole = false;
  let start = -1;
  for (let i = 0; i < sygnal.length; i++) {
    const v = sygnal[i];
    if (v === null) continue;
    if (!wDole && v > wejscie) { wDole = true; start = i; }
    else if (wDole && v < wyjscie) {
      powtorzenia.push({ wejscie: start, wyjscie: i });
      wDole = false;
    }
  }

  return powtorzenia.map((p, n) => {
    const poprzedniKoniec = n > 0 ? powtorzenia[n - 1].wyjscie : 0;
    const nastepnyStart = n < powtorzenia.length - 1 ? powtorzenia[n + 1].wejscie : sygnal.length - 1;
    let poczatek = p.wejscie;
    while (poczatek > poprzedniKoniec && sygnal[poczatek - 1] !== null && sygnal[poczatek - 1] > spoczynek) poczatek--;
    if (poczatek > poprzedniKoniec && sygnal[poczatek - 1] !== null) poczatek--;
    let koniec = p.wyjscie;
    while (koniec < nastepnyStart && sygnal[koniec + 1] !== null && sygnal[koniec + 1] > spoczynek) koniec++;
    if (koniec < nastepnyStart && sygnal[koniec + 1] !== null) koniec++;
    let szczyt = p.wejscie;
    for (let i = p.wejscie; i <= p.wyjscie; i++) {
      if (sygnal[i] !== null && sygnal[i] > sygnal[szczyt]) szczyt = i;
    }
    return { poczatek, szczyt, koniec };
  });
}

/** Największa pewna wartość kąta w zakresie klatek `[od, do]` i jej klatka. */
export function maksimum(wartosci, od, doKlatki) {
  let naj = null;
  for (let i = od; i <= doKlatki; i++) {
    const v = wartosci[i];
    if (v !== null && v !== undefined && (naj === null || v > naj.wartosc)) naj = { wartosc: v, klatka: i };
  }
  return naj;
}
