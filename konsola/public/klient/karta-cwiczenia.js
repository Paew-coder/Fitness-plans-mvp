/**
 * Karta ćwiczenia z filmem — w aplikacji, bez wychodzenia do YouTube.
 *
 * Trener, 09.10.2026 (test biblioteki OPEX Fitness): „użytkownik otwiera
 * ćwiczenie, widzi odtwarzacz na karcie, uruchamia nagranie bez opuszczania
 * aplikacji, zatrzymuje, wznawia, przewija, zamyka kartę i wraca do treningu
 * — bez utraty wpisanych ciężarów i powtórzeń”.
 *
 * - Karta to warstwa nad ekranem, nie nowy ekran: nic pod nią nie jest
 *   przerysowywane, więc wpisane (jeszcze niezapisane) liczby zostają.
 * - Systemowe „wstecz” zamyka kartę zamiast cofać ekran — aplikacja przy
 *   cofnięciu rysuje ekran od nowa, co skasowałoby wpisane liczby.
 * - Film z YouTube: oficjalny IFrame Player API, `playsinline=1` (iPhone
 *   nie przechodzi na pełny ekran), domena youtube-nocookie.com (tryb
 *   ochrony prywatności: bez ciasteczek śledzących przed odtworzeniem).
 *   Oznaczeń YouTube nie ukrywamy; pod filmem podpis i link do oryginału.
 * - Strona ma `Referrer-Policy: no-referrer` (link klienta niesie token).
 *   YouTube wymaga dziś nagłówka Referer od osadzonego odtwarzacza (bez
 *   niego błąd 153), więc ramka dostaje własną politykę
 *   `strict-origin-when-cross-origin`: YouTube widzi tylko domenę, nigdy
 *   adresu z tokenem.
 * - Własny plik (MP4/WebM, `typ: "plik"`) gra w zwykłym `<video>` — tak
 *   podmienimy filmy YouTube na własne bez zmian w aplikacji.
 */

const HOST_YT = "https://www.youtube-nocookie.com";
const API_YT = "https://www.youtube.com/iframe_api";

const el = (tag, klasa, tekst) => {
  const e = document.createElement(tag);
  if (klasa) e.className = klasa;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
};

/**
 * Przycisk filmu przy ćwiczeniu. Z kartą — otwiera kartę w aplikacji;
 * bez karty — dotychczasowy link (nowa karta przeglądarki). `null`, gdy
 * nie ma ani jednego, ani drugiego.
 */
export function przyciskFilmu(film, karta, tekst = "▶ film") {
  if (karta?.wideo) {
    const b = el("button", "film film-karta", tekst);
    b.type = "button";
    b.setAttribute("aria-haspopup", "dialog");
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      otworzKarteCwiczenia(karta, b);
    });
    return b;
  }
  if (film && /^https?:\/\//.test(film)) {
    const a = el("a", "film", tekst);
    a.href = film;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }
  return null;
}

/* ── IFrame Player API — wczytany raz, przy pierwszym filmie ─────── */

let apiYT = null;

/**
 * Skrypt API wczytany raz. Nieudana próba (błąd sieci albo 20 s ciszy)
 * nie zostaje zapamiętana — następna próba zaczyna od nowa. Przegląd filmu
 * złapał to 09.10.2026: po jednym przekroczeniu czasu karta już nigdy
 * nie dostawała API, do przeładowania strony.
 */
function wczytajApiYT() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiYT) {
    apiYT = new Promise((gotowe, blad) => {
      const poprzedni = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        poprzedni?.();
        gotowe(window.YT);
      };
      const nieudane = (komunikat) => () => { apiYT = null; s.remove(); blad(new Error(komunikat)); };
      const s = document.createElement("script");
      s.src = API_YT;
      s.async = true;
      s.onerror = nieudane("nie udało się wczytać odtwarzacza YouTube");
      document.head.append(s);
      setTimeout(() => { if (!window.YT?.Player) nieudane("odtwarzacz YouTube nie odpowiada")(); }, 20_000);
    });
  }
  return apiYT;
}

/** Druga próba po chwili — sieć na siłowni bywa kapryśna. */
const apiYTzPonowieniem = () => wczytajApiYT()
  .catch(() => new Promise((r) => setTimeout(r, 1500)).then(wczytajApiYT));

/** Stany odtwarzacza YouTube → słowo w `data-stan` (czytają je przeglądy). */
const STANY_YT = { "-1": "nieuruchomiony", 0: "koniec", 1: "gra", 2: "pauza", 3: "buforuje", 5: "gotowy" };

const BLEDY_YT = {
  2: "nieprawidłowy identyfikator filmu",
  5: "przeglądarka nie odtworzy tego filmu",
  100: "film usunięty albo prywatny",
  101: "właściciel nie pozwala odtwarzać filmu poza YouTube",
  150: "właściciel nie pozwala odtwarzać filmu poza YouTube",
  153: "YouTube nie dostał adresu strony (Referer)",
};

/* ── karta ──────────────────────────────────────────────────────── */

let otwarta = null;   // { tlo, odtwarzacz, poprzedniFokus, wHistorii }
let pominPowrot = false;

export const kartaOtwarta = () => otwarta !== null;

/**
 * Dla obsługi „wstecz” w aplikacji: `true`, gdy to cofnięcie zrobiła sama
 * karta, zamykana przyciskiem — wtedy ekranu nie wolno przerysować.
 * Zwraca `true` raz.
 */
export function powrotZKarty() {
  const byl = pominPowrot;
  pominPowrot = false;
  return byl;
}

/**
 * Otwiera kartę. `zrodlo` — przycisk, który ją otworzył (wraca na niego
 * fokus po zamknięciu).
 */
export function otworzKarteCwiczenia(karta, zrodlo = null) {
  if (otwarta) zamknijKarte();
  const tlo = el("div", "karta-cw-tlo");
  const okno = el("div", "karta-cw");
  okno.setAttribute("role", "dialog");
  okno.setAttribute("aria-modal", "true");
  okno.setAttribute("aria-labelledby", "karta-cw-tytul");
  okno.dataset.cwiczenie = karta.cwiczenieId;

  const naglowek = el("div", "karta-cw-naglowek");
  const tytuly = el("div", "karta-cw-tytuly");
  const h = el("h2", "", karta.nazwaPl ?? karta.nazwaEn);
  h.id = "karta-cw-tytul";
  tytuly.append(h);
  if (karta.nazwaPl) tytuly.append(el("p", "karta-cw-en", karta.nazwaEn));
  const x = el("button", "karta-cw-x", "✕");
  x.type = "button";
  x.setAttribute("aria-label", "Zamknij kartę ćwiczenia");
  x.onclick = () => zamknijKarte();
  naglowek.append(tytuly, x);
  okno.append(naglowek);

  const ramka = el("div", "karta-cw-film");
  ramka.dataset.stan = "laduje";
  okno.append(ramka);
  const odtwarzacz = karta.wideo ? wstawFilm(ramka, karta.wideo) : null;

  if (karta.wideo) {
    const z = karta.wideo.zrodlo;
    const podpis = el("p", "karta-cw-zrodlo", `Film: ${z.nazwa}${z.platforma ? ` / ${z.platforma}` : ""}`);
    if (karta.wideo.link) {
      const a = el("a", "", z.platforma === "YouTube" ? "Otwórz na YouTube ↗" : "Otwórz u źródła ↗");
      a.href = karta.wideo.link;
      a.target = "_blank";
      a.rel = "noopener";
      podpis.append(" · ", a);
    }
    okno.append(podpis);
  }

  const opis = el("dl", "karta-cw-opis");
  const wiersz = (etykieta, wartosc) => {
    if (!wartosc || (Array.isArray(wartosc) && wartosc.length === 0)) return;
    opis.append(el("dt", "", etykieta), el("dd", "", Array.isArray(wartosc) ? wartosc.join(", ") : wartosc));
  };
  wiersz("Główne mięśnie", karta.miesnieGlowne);
  wiersz("Mięśnie pomocnicze", karta.miesniePomocnicze);
  wiersz("Sprzęt", karta.sprzet);
  wiersz("Kategoria", karta.rodzaj);
  wiersz("Wzorzec ruchu", karta.kategoria);
  if (opis.children.length) okno.append(opis);

  const wroc = el("button", "glowny szeroki karta-cw-wroc", "Wróć do treningu");
  wroc.type = "button";
  wroc.onclick = () => zamknijKarte();
  okno.append(wroc);

  tlo.append(okno);
  tlo.addEventListener("click", (e) => { if (e.target === tlo) zamknijKarte(); });
  document.body.append(tlo);
  document.body.classList.add("karta-cw-otwarta");

  // „Wstecz” ma zamknąć kartę, nie cofnąć ekranu treningu.
  history.pushState({ ...(history.state ?? {}), karta: true }, "");
  otwarta = { tlo, odtwarzacz, poprzedniFokus: zrodlo ?? document.activeElement, wHistorii: true };
  document.addEventListener("keydown", naKlawisz);
  x.focus();
}

function naKlawisz(e) {
  if (e.key === "Escape") zamknijKarte();
}

/**
 * Zamknięcie: zatrzymanie i usunięcie odtwarzacza, zdjęcie warstwy,
 * fokus z powrotem na przycisk filmu. Ekran pod spodem nietknięty.
 * `zHistorii` — zamyka „wstecz” (wpis historii już zdjęty).
 */
export function zamknijKarte({ zHistorii = false } = {}) {
  if (!otwarta) return;
  const { tlo, odtwarzacz, poprzedniFokus, wHistorii } = otwarta;
  otwarta = null;
  document.removeEventListener("keydown", naKlawisz);
  try { odtwarzacz?.zatrzymaj(); } catch { /* odtwarzacz mógł się nie wczytać */ }
  tlo.remove();
  document.body.classList.remove("karta-cw-otwarta");
  if (wHistorii && !zHistorii && history.state?.karta) {
    pominPowrot = true;
    history.back();
  }
  if (poprzedniFokus?.isConnected) poprzedniFokus.focus({ preventScroll: true });
}

/* ── odtwarzacze ────────────────────────────────────────────────── */

function wstawFilm(ramka, wideo) {
  if (wideo.typ === "youtube") return filmYouTube(ramka, wideo);
  if (wideo.typ === "plik") return filmZPliku(ramka, wideo);
  ramka.dataset.stan = "brak";
  return null;
}

function komunikatWRamce(ramka, tekst, wideo) {
  const k = el("div", "karta-cw-komunikat");
  k.append(el("p", "", tekst));
  if (wideo?.link) {
    const a = el("a", "", "Otwórz film na YouTube ↗");
    a.href = wideo.link;
    a.target = "_blank";
    a.rel = "noopener";
    k.append(a);
  }
  ramka.append(k);
}

function filmYouTube(ramka, wideo) {
  if (!navigator.onLine) {
    ramka.dataset.stan = "offline";
    komunikatWRamce(ramka, "Film wymaga internetu. Trening działa dalej bez niego — wpisane liczby się nie zgubią.");
    return null;
  }
  // Ramkę stawiamy sami, żeby dać jej politykę Referer (patrz wyżej);
  // API podpina się do istniejącej ramki z `enablejsapi=1`.
  const parametry = new URLSearchParams({ enablejsapi: "1", playsinline: "1", rel: "0", origin: location.origin });
  const iframe = el("iframe");
  iframe.src = `${HOST_YT}/embed/${encodeURIComponent(wideo.youtubeId)}?${parametry}`;
  iframe.title = wideo.tytul;
  iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen");
  iframe.setAttribute("allowfullscreen", "");
  ramka.append(iframe);

  let gracz = null;
  apiYTzPonowieniem().then((YT) => {
    if (!iframe.isConnected) return;
    gracz = new YT.Player(iframe, {
      host: HOST_YT,
      events: {
        onReady: () => {
          ramka.dataset.stan = "gotowy";
          ramka._gracz = gracz;   // dla przeglądu: getVideoData, getPlayerState
        },
        onStateChange: (e) => { ramka.dataset.stan = STANY_YT[e.data] ?? String(e.data); },
        onError: (e) => {
          ramka.dataset.stan = `blad-${e.data}`;
          komunikatWRamce(ramka, `Tego filmu nie da się odtworzyć w aplikacji: ${BLEDY_YT[e.data] ?? `błąd YouTube ${e.data}`}.`, wideo);
        },
      },
    });
  }).catch(() => {
    // Bez API ramka i tak gra (przyciski YouTube w środku) — tracimy tylko
    // stan i obsługę błędów.
    ramka.dataset.stan = "bez-api";
  });
  return {
    zatrzymaj() {
      try { gracz?.stopVideo?.(); gracz?.destroy?.(); } catch { /* już zniszczony */ }
      iframe.remove();
    },
  };
}

function filmZPliku(ramka, wideo) {
  const v = el("video");
  v.src = wideo.plik;
  v.controls = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.preload = "metadata";
  v.title = wideo.tytul;
  const stan = (s) => () => { ramka.dataset.stan = s; };
  v.addEventListener("loadedmetadata", stan("gotowy"));
  v.addEventListener("playing", stan("gra"));
  v.addEventListener("pause", stan("pauza"));
  v.addEventListener("waiting", stan("buforuje"));
  v.addEventListener("ended", stan("koniec"));
  v.addEventListener("error", () => {
    ramka.dataset.stan = "blad";
    komunikatWRamce(ramka, "Nie udało się wczytać filmu.");
  });
  ramka.append(v);
  return {
    zatrzymaj() {
      v.pause();
      v.removeAttribute("src");
      v.load();
      v.remove();
    },
  };
}
