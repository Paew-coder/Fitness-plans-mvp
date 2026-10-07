/**
 * Sesja analizy ruchu — jeden film, wszystkie klatki, sugerowane pozycje.
 *
 * Format (`craftmyplan/analiza-ruchu`, wersja 1) jest jednym plikiem JSON:
 *
 *   wideo     — nazwa pliku, szerokość, wysokość, czas trwania (ms)
 *   analiza   — model MediaPipe, wersja biblioteki, gęstość (kl./s)
 *   landmarki — 33 identyfikatory w kolejności indeksów (schemat danych)
 *   klatki    — `{ i, t, p, w }`: numer, czas od początku filmu w ms,
 *               `p` = 33 × [x, y, z, widoczność, obecność] znormalizowane 0–1,
 *               `w` = 33 × [x, y, z] w metrach (model 3D), `null` bez sylwetki
 *   sugestie  — `{ id, klatka, t, punkt, x, y, autor, notatka }`:
 *               „● obecna pozycja → ○ sugerowana”, x i y znormalizowane
 *
 * Zawsze zapisują się wszystkie 33 punkty, nie tylko główne — przyszła
 * analiza (także AI) ma mieć pełne dane. Kąty się nie zapisują: liczy się je
 * z punktów, więc poprawka wzoru działa też na stare nagrania.
 *
 * Czysty moduł: bez DOM, działa w przeglądarce i w testach Node.
 */
import { KATY, katyKlatki, punktyKlatki } from "./geometria.js";
import { GLOWNE_PUNKTY, LANDMARKI, LICZBA_LANDMARKOW, nazwaPunktu } from "./szkielet.js";

export const FORMAT = "craftmyplan/analiza-ruchu";
export const WERSJA = 1;

const zaokr = (n, miejsc) => {
  const m = 10 ** miejsc;
  return Math.round(n * m) / m;
};

export function nowaSesja({ cwiczenie, wideo, analiza }) {
  return {
    format: FORMAT,
    wersja: WERSJA,
    utworzono: new Date().toISOString(),
    cwiczenie,
    wideo: {
      nazwa: wideo.nazwa ?? null,
      szerokosc: wideo.szerokosc,
      wysokosc: wideo.wysokosc,
      czasTrwania: wideo.czasTrwania ?? null,
    },
    analiza: { ...analiza },
    landmarki: LANDMARKI.map((l) => l.id),
    klatki: [],
    sugestie: [],
  };
}

/**
 * Klatka z wyniku MediaPipe. `landmarki` — `result.landmarks[0]`,
 * `swiat` — `result.worldLandmarks[0]`; brak sylwetki → `p: null`.
 * Pięć miejsc po przecinku w obrazie to setne części piksela nawet przy 4K.
 */
export function klatkaZWyniku(i, t, landmarki, swiat) {
  const ok = Array.isArray(landmarki) && landmarki.length === LICZBA_LANDMARKOW;
  return {
    i,
    t: zaokr(t, 1),
    p: ok ? landmarki.map((l) => [
      zaokr(l.x, 5), zaokr(l.y, 5), zaokr(l.z, 5),
      zaokr(l.visibility ?? 0, 3), zaokr(l.presence ?? l.visibility ?? 0, 3),
    ]) : null,
    w: ok && Array.isArray(swiat) && swiat.length === LICZBA_LANDMARKOW
      ? swiat.map((l) => [zaokr(l.x, 4), zaokr(l.y, 4), zaokr(l.z, 4)])
      : null,
  };
}

export class BladSesji extends Error {}

/** Sesja z tekstu JSON — z kontrolą, że to nasz format i dane mają sens. */
export function zJSON(tekst) {
  let s;
  try {
    s = JSON.parse(tekst);
  } catch {
    throw new BladSesji("To nie jest plik JSON.");
  }
  if (s?.format !== FORMAT) throw new BladSesji("To nie jest plik analizy ruchu CraftMyPlan.");
  if (s.wersja > WERSJA) throw new BladSesji(`Plik jest z nowszej wersji (${s.wersja}) — odśwież stronę.`);
  if (!(s.wideo?.szerokosc > 0) || !(s.wideo?.wysokosc > 0)) throw new BladSesji("Brakuje wymiarów filmu.");
  if (!Array.isArray(s.klatki) || s.klatki.length === 0) throw new BladSesji("Plik nie ma żadnych klatek.");
  for (const k of s.klatki) {
    if (typeof k.t !== "number") throw new BladSesji("Klatka bez czasu.");
    if (k.p !== null && (!Array.isArray(k.p) || k.p.length !== LICZBA_LANDMARKOW)) {
      throw new BladSesji(`Klatka ${k.i} nie ma ${LICZBA_LANDMARKOW} punktów.`);
    }
  }
  s.sugestie = Array.isArray(s.sugestie) ? s.sugestie : [];
  return s;
}

export function doJSON(sesja) {
  return JSON.stringify(sesja);
}

/** Ile klatek ma wykrytą sylwetkę. */
export function klatekZSylwetka(sesja) {
  return sesja.klatki.filter((k) => k.p).length;
}

const liczbaCSV = (n, miejsc) => (n === null || n === undefined ? "" : String(zaokr(n, miejsc)).replace(".", ","));

/**
 * CSV do arkusza: jedna klatka w wierszu — czas, główne punkty w pikselach
 * z widocznością i wszystkie kąty (2D). Średnik i przecinek dziesiętny, bo
 * tak otwiera polski Excel. Pełne 33 punkty są w JSON-ie.
 */
export function doCSV(sesja) {
  const wymiary = { szerokosc: sesja.wideo.szerokosc, wysokosc: sesja.wideo.wysokosc };
  const naglowek = ["klatka", "t_ms",
    ...GLOWNE_PUNKTY.flatMap((id) => [`${id}_x_px`, `${id}_y_px`, `${id}_widocznosc`]),
    ...KATY.map((k) => `${k.id}${k.jednostka === "%" ? "_proc" : "_st"}`)];
  const wiersze = sesja.klatki.map((k) => {
    const punkty = punktyKlatki(k, wymiary);
    const katy = katyKlatki(k, wymiary);
    return [k.i, liczbaCSV(k.t, 1),
      ...(punkty.length
        ? punkty.flatMap((q) => [liczbaCSV(q.x, 1), liczbaCSV(q.y, 1), liczbaCSV(q.v, 3)])
        : GLOWNE_PUNKTY.flatMap(() => ["", "", ""])),
      ...KATY.map((d) => liczbaCSV(katy?.[d.id]?.wartosc, 1)),
    ].join(";");
  });
  return [naglowek.join(";"), ...wiersze].join("\r\n") + "\r\n";
}

/* ── sugerowane pozycje ─────────────────────────────────────────── */

let licznik = 0;
const noweId = () => `s${Date.now().toString(36)}${(licznik++).toString(36)}`;

/**
 * Sugerowana pozycja punktu na klatce — „● obecna → ○ sugerowana”.
 * Na jednej klatce jeden punkt ma najwyżej jedną sugestię: ponowne
 * zaznaczenie przesuwa ją, zamiast dokładać drugą.
 * `autor` — "trener" teraz, "ai" w przyszłości (ten sam zapis).
 */
export function ustawSugestie(sesja, { klatka, punkt, x, y, autor = "trener", notatka = "" }) {
  const k = sesja.klatki[klatka];
  if (!k) throw new BladSesji("Nie ma takiej klatki.");
  const istniejaca = sesja.sugestie.find((s) => s.klatka === klatka && s.punkt === punkt);
  const dane = { x: zaokr(clamp01(x), 5), y: zaokr(clamp01(y), 5) };
  if (istniejaca) {
    Object.assign(istniejaca, dane);
    return istniejaca;
  }
  const nowa = { id: noweId(), klatka, t: k.t, punkt, ...dane, autor, notatka };
  sesja.sugestie.push(nowa);
  return nowa;
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));

export function usunSugestie(sesja, id) {
  sesja.sugestie = sesja.sugestie.filter((s) => s.id !== id);
}

export const sugestieKlatki = (sesja, klatka) => sesja.sugestie.filter((s) => s.klatka === klatka);

/**
 * Co zmienia sugestia: kąty klatki teraz i po podstawieniu sugerowanych
 * punktów (wszystkich z tej klatki naraz). Tylko kąty, które się ruszyły.
 * Liczone w 2D — sugestia jest zaznaczana na obrazie.
 */
export function skutekSugestii(sesja, klatka) {
  const k = sesja.klatki[klatka];
  const sugestie = sugestieKlatki(sesja, klatka);
  if (!k?.p || sugestie.length === 0) return [];
  const wymiary = { szerokosc: sesja.wideo.szerokosc, wysokosc: sesja.wideo.wysokosc };
  const zamiany = Object.fromEntries(sugestie.map((s) => [s.punkt,
    { x: s.x * wymiary.szerokosc, y: s.y * wymiary.wysokosc }]));
  const przed = katyKlatki(k, wymiary);
  const po = katyKlatki(k, wymiary, { zamiany });
  return KATY
    .map((d) => ({ id: d.id, nazwa: d.nazwa, jednostka: d.jednostka ?? "°",
      przed: przed[d.id]?.wartosc ?? null, po: po[d.id]?.wartosc ?? null }))
    .filter((r) => r.przed !== null && r.po !== null && Math.abs(r.po - r.przed) >= 0.5);
}

/** Opis sugestii do listy: „biodro L, klatka 37”. */
export const opisSugestii = (s) => `${nazwaPunktu(s.punkt)}, klatka ${s.klatka + 1}`;
