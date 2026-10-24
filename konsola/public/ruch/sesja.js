/**
 * Sesja analizy ruchu — jeden film, wszystkie klatki, sugerowane pozycje.
 *
 * Format (`craftmyplan/analiza-ruchu`, wersja 2) jest jednym plikiem JSON:
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
 * Wersja 2 (24.10.2026, punkt sztangi do badania trenera) dokłada — wszystko
 * opcjonalne, więc pliki wersji 1 otwierają się bez zmian:
 *   klatki[].sztanga  — `{ x, y, pewnosc, zrodlo }`: koniec gryfu w tej klatce,
 *               x i y znormalizowane 0–1, pewność 0–1, źródło „sledzenie”
 *               albo „korekta” (punkt postawiony przez trenera)
 *   sztanga   — ustawienia śledzenia: `{ tryb, prog, parametry, narzedzie }`
 *   srodekCiezkosci — jak dotąd, plus `pasmo` (śródstopie, % stopy od pięty)
 *               i miejsce obciążenia „sztanga”
 *   badanie   — `{ kodOsoby, warunek }` (kod, nigdy imię)
 *   narzedzie — wersja narzędzia i parametry analizy z chwili zapisu
 *               (`opisNarzedzia`) — do zacytowania w artykule
 *
 * Zawsze zapisują się wszystkie 33 punkty, nie tylko główne — przyszła
 * analiza (także AI) ma mieć pełne dane. Kąty się nie zapisują: liczy się je
 * z punktów, więc poprawka wzoru działa też na stare nagrania.
 *
 * Czysty moduł: bez DOM, działa w przeglądarce i w testach Node.
 */
import { KATY, katyKlatki, punktyKlatki } from "./geometria.js";
import { GLOWNE_PUNKTY, LANDMARKI, LICZBA_LANDMARKOW, nazwaPunktu } from "./szkielet.js";
import { miarySrodkaPowtorzen, pasmoZUstawien, WYNIKI } from "./miary-srodka.js";
import { fpsZKlatek, MODELE_SRODKA, odciecieDlaFps, POPRAWKA_DWOCH_PRZEJSC, srodekSesji, wzgledemStop } from "./srodek.js";
import { PARAMETRY_SLEDZENIA, progSesji, punktySztangi, TRYBY_SLEDZENIA, ZRODLA_PUNKTU } from "./sztanga.js";

export const FORMAT = "craftmyplan/analiza-ruchu";
export const WERSJA = 2;

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
    if (k.sztanga !== undefined && k.sztanga !== null) {
      const q = k.sztanga;
      const ok = [q.x, q.y, q.pewnosc].every((v) => typeof v === "number" && v >= 0 && v <= 1)
        && Object.values(ZRODLA_PUNKTU).includes(q.zrodlo);
      if (!ok) throw new BladSesji(`Klatka ${k.i}: punkt sztangi jest uszkodzony.`);
    }
  }
  s.sugestie = Array.isArray(s.sugestie) ? s.sugestie : [];
  return s;
}

/** Zapis zawsze w bieżącej wersji formatu — plik wersji 1 po otwarciu i zapisie staje się wersją 2. */
export function doJSON(sesja) {
  return JSON.stringify({ ...sesja, wersja: WERSJA });
}

/** Ile klatek ma wykrytą sylwetkę. */
export function klatekZSylwetka(sesja) {
  return sesja.klatki.filter((k) => k.p).length;
}

const liczbaCSV = (n, miejsc) => (n === null || n === undefined ? "" : String(zaokr(n, miejsc)).replace(".", ","));
const tekstCSV = (t) => (t === null || t === undefined ? "" : /[;"\r\n]/.test(String(t)) ? `"${String(t).replace(/"/g, '""')}"` : String(t));

/**
 * Ustawienia obliczeń środka ciężkości zapisane w sesji, w postaci dla
 * `srodekSesji` — tak samo w CSV, w tabeli i po ponownym otwarciu pliku.
 */
export function ustawieniaObliczen(sesja) {
  const u = sesja.srodekCiezkosci;
  if (!u?.model || !MODELE_SRODKA[u.model]) return null;
  return {
    model: u.model,
    konczyny: u.konczyny ?? "obie",
    wygladzanie: u.wygladzanie !== false,
    obciazenie: u.obciazenieKg > 0 ? { kg: u.obciazenieKg, masaCiala: u.masaCiala, miejsce: u.miejsce ?? "barki" } : null,
    pasmo: pasmoZUstawien(u.pasmo),
  };
}

/** Środek ciężkości sesji z jej zapisanych ustawień (`null` — bez wybranego modelu). */
export function srodekZUstawien(sesja) {
  const u = ustawieniaObliczen(sesja);
  return u ? srodekSesji(sesja, { ...u, fps: fpsZKlatek(sesja.klatki) }) : null;
}

/**
 * Wersja narzędzia i parametry analizy — do zapisu w JSON i CSV (trener:
 * „chcę zamrozić wersję do badania i zacytować ją w artykule”). `wersja` —
 * numer z package.json + skrót commita (np. „0.2.0+a1b2c3d”).
 */
export function opisNarzedzia(sesja, wersja) {
  const u = ustawieniaObliczen(sesja);
  const fps = fpsZKlatek(sesja.klatki);
  const tryb = sesja.sztanga?.tryb ?? null;
  return {
    nazwa: "CraftMyPlan — analiza ruchu",
    wersja: wersja ?? null,
    parametry: {
      mediapipe: sesja.analiza?.biblioteka ?? null,
      modelSylwetki: sesja.analiza?.model ?? null,
      modelSegmentow: u ? MODELE_SRODKA[u.model].nazwa : null,
      konczyny: u?.konczyny ?? null,
      filtr: u?.wygladzanie ? "Butterworth 2. rzędu, w przód i w tył (bez przesunięcia w czasie)" : u ? "bez wygładzania" : null,
      odciecieHz: u?.wygladzanie ? zaokr(odciecieDlaFps(fps), 2) : null,
      poprawkaDwochPrzejsc: u?.wygladzanie ? POPRAWKA_DWOCH_PRZEJSC : null,
      klatekNaSekunde: zaokr(fps, 2),
      pasmoSrodstopia: u?.pasmo ?? null,
      obciazenie: u?.obciazenie ? { ...u.obciazenie } : null,
      sledzenieSztangi: tryb ? {
        tryb, nazwa: TRYBY_SLEDZENIA[tryb]?.nazwa ?? tryb, prog: progSesji(sesja),
        parametry: { ...PARAMETRY_SLEDZENIA, ...(sesja.sztanga?.parametry ?? {}) },
      } : null,
    },
  };
}

/** Kolumny parametrów — te same w obu CSV, w każdym wierszu (arkusz można sortować i łączyć). */
function kolumnyParametrow(sesja) {
  const o = opisNarzedzia(sesja, sesja.narzedzie?.wersja);
  const p = o.parametry;
  return [
    ["wersja_narzedzia", tekstCSV(o.wersja)],
    ["kod_osoby", tekstCSV(sesja.badanie?.kodOsoby)],
    ["warunek", tekstCSV(sesja.badanie?.warunek)],
    ["model_segmentow", tekstCSV(sesja.srodekCiezkosci?.model)],
    ["strona_konczyn", tekstCSV(p.konczyny)],
    ["filtr", p.filtr === null ? "" : sesja.srodekCiezkosci?.wygladzanie === false ? "brak" : "butterworth2_filtfilt"],
    ["odciecie_hz", liczbaCSV(p.odciecieHz, 2)],
    ["pasmo_srodstopia_od_proc", liczbaCSV(p.pasmoSrodstopia?.[0], 1)],
    ["pasmo_srodstopia_do_proc", liczbaCSV(p.pasmoSrodstopia?.[1], 1)],
    ["tryb_sledzenia_sztangi", tekstCSV(p.sledzenieSztangi?.tryb)],
    ["prog_pewnosci_sztangi", liczbaCSV(p.sledzenieSztangi?.prog, 2)],
    ["obciazenie_kg", liczbaCSV(p.obciazenie?.kg, 1)],
    ["masa_ciala_kg", liczbaCSV(p.obciazenie?.masaCiala, 1)],
    ["miejsce_obciazenia", tekstCSV(p.obciazenie?.miejsce)],
  ];
}

/**
 * CSV do arkusza: jedna klatka w wierszu — czas, główne punkty w pikselach
 * z widocznością i wszystkie kąty (2D). Średnik i przecinek dziesiętny, bo
 * tak otwiera polski Excel. Pełne 33 punkty są w JSON-ie.
 * Z wybranym modelem segmentów (23.10.2026) — na końcu środek ciężkości:
 * x, y w pikselach, pewność (1/0), położenie względem stóp w % (bez
 * wygładzenia i wygładzone, jeśli wygładzanie jest włączone).
 * Od 24.10.2026 dalej, na końcu: punkt sztangi (gdy jest), trzy wyniki osobno
 * (ciało, sztanga, układ — piksele i % stopy, surowe i wygładzone) i kolumny
 * parametrów z wersją narzędzia.
 */
export function doCSV(sesja) {
  const wymiary = { szerokosc: sesja.wideo.szerokosc, wysokosc: sesja.wideo.wysokosc };
  const srodek = srodekZUstawien(sesja);
  const zSztanga = sesja.klatki.some((k) => k.sztanga);
  const sztanga = zSztanga ? punktySztangi(sesja) : null;
  const wyniki = srodek ? WYNIKI.filter(({ id }) => srodek.wyniki[id]) : [];
  const parametry = srodek || zSztanga ? kolumnyParametrow(sesja) : [];
  const naglowek = ["klatka", "t_ms",
    ...GLOWNE_PUNKTY.flatMap((id) => [`${id}_x_px`, `${id}_y_px`, `${id}_widocznosc`]),
    ...KATY.map((k) => `${k.id}${k.jednostka === "%" ? "_proc" : "_st"}`),
    ...(srodek ? ["srodek_ciezkosci_x_px", "srodek_ciezkosci_y_px", "srodek_ciezkosci_pewny",
      "srodek_wzgledem_stop_proc", "srodek_wzgledem_stop_proc_wygladzony"] : []),
    ...(zSztanga ? ["sztanga_punkt_x_px", "sztanga_punkt_y_px", "sztanga_pewnosc", "sztanga_pewna", "sztanga_zrodlo"] : []),
    ...wyniki.flatMap(({ id }) => [`${id}_x_px`, `${id}_y_px`, `${id}_x_px_wygladzony`, `${id}_y_px_wygladzony`,
      `${id}_wzgledem_stop_proc`, `${id}_wzgledem_stop_proc_wygladzony`, `${id}_od_piety_px`, `${id}_od_piety_px_wygladzony`]),
    ...parametry.map(([n]) => n)];
  const wiersze = sesja.klatki.map((k, n) => {
    const punkty = punktyKlatki(k, wymiary);
    const katy = katyKlatki(k, wymiary);
    const w = srodek?.klatki[n];
    const q = sztanga?.[n];
    return [k.i, liczbaCSV(k.t, 1),
      ...(punkty.length
        ? punkty.flatMap((q) => [liczbaCSV(q.x, 1), liczbaCSV(q.y, 1), liczbaCSV(q.v, 3)])
        : GLOWNE_PUNKTY.flatMap(() => ["", "", ""])),
      ...KATY.map((d) => liczbaCSV(katy?.[d.id]?.wartosc, 1)),
      ...(srodek ? [liczbaCSV(w?.x, 1), liczbaCSV(w?.y, 1), w ? (w.pewny ? "1" : "0") : "",
        liczbaCSV(w ? wzgledemStop(w) : null, 1), liczbaCSV(srodek.wzgledemGladkie[n], 1)] : []),
      ...(zSztanga ? [liczbaCSV(q?.x, 1), liczbaCSV(q?.y, 1), liczbaCSV(q?.pewnosc, 3), q ? (q.pewny ? "1" : "0") : "", q?.zrodlo ?? ""] : []),
      ...wyniki.flatMap(({ id }) => {
        const s = srodek.wyniki[id];
        return [liczbaCSV(s.x[n], 1), liczbaCSV(s.y[n], 1), liczbaCSV(s.xGladkie[n], 1), liczbaCSV(s.yGladkie[n], 1),
          liczbaCSV(s.wzgledem[n], 1), liczbaCSV(s.wzgledemGladkie[n], 1), liczbaCSV(s.piksele[n], 1), liczbaCSV(s.pikseleGladkie[n], 1)];
      }),
      ...parametry.map(([, v]) => v),
    ].join(";");
  });
  return [naglowek.join(";"), ...wiersze].join("\r\n") + "\r\n";
}

/**
 * CSV powtórzeń (24.10.2026): jeden wiersz = powtórzenie × wynik (ciało,
 * sztanga, układ) × seria (surowa, wygładzona) — układ „długi”, który SPSS,
 * R czy Excel czytają od razu. `powtorzenia` — `[{ numer, poczatek, dol, koniec }]`
 * (jak w tabeli powtórzeń na ekranie). Miary w % stopy i w pikselach.
 */
export function doCSVPowtorzen(sesja, powtorzenia) {
  const srodek = srodekZUstawien(sesja);
  const u = ustawieniaObliczen(sesja);
  const parametry = kolumnyParametrow(sesja);
  const naglowek = ["plik_filmu", "powtorzenie", "wynik", "seria",
    "klatka_poczatek", "klatka_dol", "klatka_koniec", "t_poczatek_ms", "t_dol_ms", "t_koniec_ms",
    "start_proc", "start_px",
    "przesuniecie_do_palcow_zejscie_proc", "przesuniecie_do_palcow_zejscie_px", "najdalej_do_palcow_zejscie_proc",
    "najdalej_do_palcow_zejscie_px", "klatka_najdalej_do_palcow",
    "w_najglebszym_punkcie_proc", "w_najglebszym_punkcie_px",
    "zakres_przod_tyl_proc", "zakres_przod_tyl_px", "zakres_zejscie_proc", "zakres_zejscie_px",
    "zakres_wstawanie_proc", "zakres_wstawanie_px",
    "czas_w_srodstopiu_proc", "klatek_z_wynikiem", "klatek_w_powtorzeniu",
    ...parametry.map(([n]) => n)];
  const wiersze = [];
  if (srodek) {
    const t = (i) => liczbaCSV(sesja.klatki[i]?.t, 1);
    for (const [seria, gladkie] of [["surowa", false], ["wygladzona", true]]) {
      if (gladkie && !u.wygladzanie) continue;
      const miary = miarySrodkaPowtorzen(srodek.wyniki, powtorzenia, { pasmo: u.pasmo, gladkie });
      for (const r of miary) {
        for (const { id } of WYNIKI) {
          const m = r[id];
          if (!m) continue;
          wiersze.push([tekstCSV(sesja.wideo.nazwa), r.numer, id, seria,
            r.poczatek, r.dol, r.koniec, t(r.poczatek), t(r.dol), t(r.koniec),
            liczbaCSV(m.start?.proc, 2), liczbaCSV(m.start?.px, 1),
            liczbaCSV(m.doPalcow?.proc, 2), liczbaCSV(m.doPalcow?.px, 1), liczbaCSV(m.doPalcow?.polozenieProc, 2),
            liczbaCSV(m.doPalcow?.polozeniePx, 1), m.doPalcow ? m.doPalcow.klatka : "",
            liczbaCSV(m.wDole?.proc, 2), liczbaCSV(m.wDole?.px, 1),
            liczbaCSV(m.zakres.proc, 2), liczbaCSV(m.zakres.px, 1), liczbaCSV(m.zakresZejscie.proc, 2), liczbaCSV(m.zakresZejscie.px, 1),
            liczbaCSV(m.zakresWstawanie.proc, 2), liczbaCSV(m.zakresWstawanie.px, 1),
            liczbaCSV(m.wPasmie, 1), m.klatekZWynikiem, m.klatekWPowtorzeniu,
            ...parametry.map(([, v]) => v)].join(";"));
        }
      }
    }
  }
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
