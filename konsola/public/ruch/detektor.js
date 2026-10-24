/**
 * MediaPipe Pose Landmarker w przeglądarce — i analiza filmu klatka po klatce.
 *
 * Film nie opuszcza urządzenia: model działa w przeglądarce (WebAssembly,
 * na karcie graficznej, gdy jest prawdziwa). Z internetu pobiera się tylko
 * biblioteka i model — raz, potem z pamięci przeglądarki.
 *
 * **Wersja 0.10.35, nie 1.x — celowo.** Od 1.0 MediaPipe co minutę wysyła
 * do Google statystyki użycia (`odml.pa.googleapis.com`), a jego
 * dokumentacja przerzuca na właściciela aplikacji obowiązek zebrania na to
 * zgody (RODO). 0.10.35 nie wysyła nic. Przegląd ruchu blokuje i liczy każde
 * połączenie poza bibliotekę i model, więc podbicie wersji z telemetrią
 * nie przejdzie po cichu.
 *
 * Wersja przypięta na sztywno: nowa może zmienić wyniki, a analiza ma być
 * powtarzalna.
 */

export const WERSJA_MEDIAPIPE = "0.10.35";
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${WERSJA_MEDIAPIPE}`;

export const ZRODLA = {
  biblioteka: `${CDN}/vision_bundle.mjs`,
  wasm: `${CDN}/wasm`,
  modele: {
    lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    heavy: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
  },
};

export const MODELE = [
  { id: "lite", nazwa: "szybki (6 MB)" },
  { id: "full", nazwa: "standardowy (9 MB)" },
  { id: "heavy", nazwa: "dokładny (30 MB, wolny)" },
];

let biblioteka = null;
let pliki = null;

async function wczytajBiblioteke() {
  if (!biblioteka) {
    biblioteka = await import(ZRODLA.biblioteka);
    pliki = await biblioteka.FilesetResolver.forVisionTasks(ZRODLA.wasm);
  }
  return biblioteka;
}

/** Połączenia z samej biblioteki — przegląd porównuje je z `POLACZENIA`. */
export async function polaczeniaBiblioteki() {
  const { PoseLandmarker } = await wczytajBiblioteke();
  return PoseLandmarker.POSE_CONNECTIONS.map((c) => [c.start, c.end]);
}

/**
 * Czy „karta graficzna” to tylko jej programowa podróbka (SwiftShader,
 * llvmpipe). Na takiej MediaPipe liczy klatkę ~0,6 s zamiast ~0,07 s na
 * procesorze — zmierzone 07.10.2026. Wtedy od razu procesor.
 */
function grafikaProgramowa() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return true;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const nazwa = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|software|basic render/i.test(nazwa);
  } catch {
    return true;
  }
}

/**
 * Nowy detektor do jednego przebiegu analizy. Tryb VIDEO śledzi sylwetkę
 * między klatkami i wymaga rosnących znaczników czasu — dlatego każda
 * analiza dostaje świeży detektor, zamiast ciągnąć stan poprzedniego filmu.
 *
 * Karta graficzna, gdy jest prawdziwa; w razie kłopotu — procesor.
 */
export async function utworzDetektor(model = "full") {
  const { PoseLandmarker } = await wczytajBiblioteke();
  const opcje = (delegate) => ({
    baseOptions: { modelAssetPath: ZRODLA.modele[model] ?? ZRODLA.modele.full, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  let landmarker = null;
  let delegat = grafikaProgramowa() ? "CPU" : "GPU";
  if (delegat === "GPU") {
    try {
      landmarker = await PoseLandmarker.createFromOptions(pliki, opcje("GPU"));
    } catch {
      delegat = "CPU";
    }
  }
  if (!landmarker) landmarker = await PoseLandmarker.createFromOptions(pliki, opcje("CPU"));
  let ostatni = -1;
  return {
    delegat,
    model,
    /** Sylwetka z obrazu w chwili `tMs` — `{landmarki, swiat}` albo `null`. */
    wykryj(obraz, tMs) {
      const znacznik = Math.max(ostatni + 1, Math.round(tMs));
      ostatni = znacznik;
      const wynik = landmarker.detectForVideo(obraz, znacznik);
      const landmarki = wynik.landmarks?.[0];
      if (!landmarki?.length) return null;
      return { landmarki, swiat: wynik.worldLandmarks?.[0] ?? null };
    },
    zamknij() {
      try { landmarker.close(); } catch { /* już zamknięty */ }
    },
  };
}

/**
 * Nagrania z MediaRecorder w Chrome mają czas trwania `Infinity`, dopóki
 * nie przewinie się ich na koniec. Bez tego nie wiadomo, ile filmu zostało.
 */
export async function ustalCzasTrwania(wideo) {
  if (Number.isFinite(wideo.duration) && wideo.duration > 0) return wideo.duration;
  await new Promise((gotowe) => {
    const po = () => { wideo.removeEventListener("durationchange", po); gotowe(); };
    wideo.addEventListener("durationchange", po);
    wideo.currentTime = 1e7;
    setTimeout(po, 3000);
  });
  const czas = wideo.duration;
  await przewin(wideo, 0);
  return Number.isFinite(czas) ? czas : 0;
}

/** Przewinięcie filmu i poczekanie, aż klatka będzie gotowa do odczytu. */
export function przewin(wideo, sekundy) {
  return new Promise((gotowe) => {
    if (!wideo.seeking && Math.abs(wideo.currentTime - sekundy) < 1e-4 && wideo.readyState >= 2) return gotowe();
    const koniec = () => {
      clearTimeout(zegar);
      wideo.removeEventListener("seeked", koniec);
      gotowe();
    };
    // Safari potrafi nie zgłosić „seeked” przy przewinięciu o ułamek klatki.
    const zegar = setTimeout(koniec, 4000);
    wideo.addEventListener("seeked", koniec);
    wideo.currentTime = sekundy;
  });
}

/** Największy bok obrazu podawanego do MediaPipe — więcej nie poprawia wyniku, tylko spowalnia. */
const MAKS_BOK = 960;

/** Wymiary płótna analizy (dłuższy bok najwyżej 960 px) — na nim liczy się sylwetka i śledzi sztanga. */
export function wymiaryAnalizy(wideo) {
  const skala = Math.min(1, MAKS_BOK / Math.max(wideo.videoWidth, wideo.videoHeight));
  return { szerokosc: Math.round(wideo.videoWidth * skala), wysokosc: Math.round(wideo.videoHeight * skala) };
}

/**
 * Analiza całego filmu, klatka po klatce.
 *
 * Każda klatka trafia na płótno (to płótno, a nie sam `<video>`, idzie do
 * MediaPipe — obrót nagrania z telefonu jest już na nim uwzględniony).
 *
 * Sposób główny: **odtwarzanie z pauzą na każdej klatce**
 * (`requestVideoFrameCallback`). Dekoder idzie po kolei, więc każda klatka
 * filmu jest policzona dokładnie raz, z jej prawdziwym czasem. Przewijanie
 * co 1/30 s (sposób zapasowy, dla przeglądarek bez tej funkcji) dekoduje
 * film od ostatniej klatki kluczowej przy każdym kroku — zmierzone: 120 ms
 * na samo przewinięcie, sześć razy wolniej w sumie.
 *
 * `maksFps` — ile klatek na sekundę najwyżej (np. 30 przy nagraniu 60 kl./s);
 * `null` — każda klatka filmu.
 * `naKlatke(t, wynik, obraz)`, `postep(ulamek)`, `przerwano()` → `true` kończy.
 * `obraz` — piksele płótna tej klatki (`wytnij(x, y, w, h)`), do śledzenia
 * sztangi w tym samym przejściu (24.10.2026); przy `odczyt: true` płótno jest
 * ustawione na częste odczyty.
 */
export async function analizujWideo(wideo, detektor, { maksFps = null, naKlatke, postep, przerwano, odczyt = false }) {
  return przejdzFilm(wideo, {
    maksFps, postep, przerwano, odczyt,
    naObraz: (tMs, plotno, obraz) => naKlatke(tMs, detektor.wykryj(plotno, tMs), obraz),
  });
}

/**
 * Przejście przez film klatka po klatce — to samo co przy analizie, bez
 * MediaPipe (24.10.2026: ponowne śledzenie sztangi po korekcie trenera).
 * `od` — `{ sekundy, tMs }`: od której klatki (przewinięcie i jej czas);
 * `doSekundy` — klatki późniejsze już nie idą do `naObraz(tMs, plotno, obraz)`.
 */
export async function przejdzFilm(wideo, { maksFps = null, od = null, doSekundy = Infinity, naObraz, postep, przerwano, odczyt = false }) {
  const czas = await ustalCzasTrwania(wideo);
  const plotno = document.createElement("canvas");
  const { szerokosc, wysokosc } = wymiaryAnalizy(wideo);
  plotno.width = szerokosc;
  plotno.height = wysokosc;
  const ctx = plotno.getContext("2d", odczyt ? { willReadFrequently: true } : undefined);
  const obraz = { szerokosc: plotno.width, wysokosc: plotno.height, wytnij: (x, y, w, h) => ctx.getImageData(x, y, w, h) };
  const policz = (tMs, zrodlo = wideo) => {
    ctx.drawImage(zrodlo, 0, 0, plotno.width, plotno.height);
    naObraz(tMs, plotno, obraz);
  };
  const tryb = "requestVideoFrameCallback" in HTMLVideoElement.prototype ? "odtwarzanie" : "przewijanie";
  const wynik = tryb === "odtwarzanie"
    ? await przezOdtwarzanie(wideo, czas, { maksFps, od, doSekundy, policz, postep, przerwano })
    : await przezPrzewijanie(wideo, czas, { fps: maksFps ?? 30, od, doSekundy, policz, postep, przerwano });
  return { ...wynik, tryb, czas };
}

/**
 * Odstęp między klatkami filmu — z kilku pierwszych klatek odtworzonych
 * bez liczenia (bez obciążenia przeglądarka ich nie gubi). Przeglądarka nie
 * podaje liczby klatek na sekundę, a bez niej nie widać, że klatki brakuje.
 */
async function zmierzKrok(wideo, od = 0) {
  await przewin(wideo, od);
  const czasy = [];
  await new Promise((gotowe) => {
    const straz = setTimeout(gotowe, 3000);
    const naKlatke = (_teraz, meta) => {
      czasy.push(meta.mediaTime);
      if (czasy.length >= 8 || wideo.ended) { clearTimeout(straz); return gotowe(); }
      wideo.requestVideoFrameCallback(naKlatke);
    };
    wideo.requestVideoFrameCallback(naKlatke);
    wideo.play().catch(() => { clearTimeout(straz); gotowe(); });
  });
  wideo.pause();
  const odstepy = czasy.slice(1).map((t, i) => t - czasy[i]).filter((d) => d > 0.001);
  return odstepy.length ? Math.min(...odstepy) : Infinity;
}

async function przezOdtwarzanie(wideo, czas, { maksFps, od = null, doSekundy = Infinity, policz, postep, przerwano }) {
  const tempo = wideo.playbackRate;
  wideo.playbackRate = 1;
  // Najkrótszy widziany odstęp między klatkami = odstęp klatek filmu. Przy
  // limicie kl./s krok analizy jest rzadszy, ale nigdy gęstszy niż film.
  let krokFilmu = await zmierzKrok(wideo, od?.sekundy ?? 0);
  const krokAnalizy = () => (maksFps ? Math.max(krokFilmu, 1 / maksFps) : krokFilmu);
  const minOdstep = maksFps ? 1 / maksFps - 0.002 : 0;
  let przerwane = false;
  let skonczone = false;
  let uzupelnione = 0;
  // Bieżąca klatka odłożona na bok, gdy trzeba się cofnąć po zgubione.
  const odlozona = document.createElement("canvas");
  const uzupelnij = async (od, doT, ile) => {
    for (let k = 1; k <= ile; k++) {
      const tm = od + ((doT - od) * k) / (ile + 1);
      await przewin(wideo, tm + (Number.isFinite(krokFilmu) ? krokFilmu / 4 : 0));
      policz(tm * 1000);
      uzupelnione++;
    }
  };

  /*
   * Pierwsza klatka filmu — zanim ruszy odtwarzanie. Trener, 23.10.2026:
   * „aplikacja ucina mi początek filmu, gdzie osoba stoi prosto przed
   * przysiadem”. Odtwarzanie zgłasza dopiero klatkę, która pokaże się po
   * starcie — pierwsza (już widoczna po przewinięciu) przepadała zawsze,
   * a gdy start trwa dłużej (Safari, pierwsze uruchomienie modelu), także
   * cały początek: przerwa przed pierwszą zgłoszoną klatką nie była
   * uzupełniana. Teraz klatka 0 jest liczona tutaj, a przerwa za nią —
   * jak każda inna niżej.
   */
  await przewin(wideo, od?.sekundy ?? 0);
  policz(od?.tMs ?? 0);
  let ostatnia = (od?.tMs ?? 0) / 1000;
  // Ta sama klatka zgłoszona drugi raz (po starcie albo po uzupełnianiu).
  const taSama = (t) => t - ostatnia < (Number.isFinite(krokFilmu) ? krokFilmu / 2 : 1e-4);

  await new Promise((koniec) => {
    let straznik = null;
    const pilnuj = () => {
      clearTimeout(straznik);
      // Odtwarzanie utknęło (brak klatek przez 8 s) — kończymy tym, co jest.
      straznik = setTimeout(zakoncz, 8000);
    };
    const zakoncz = () => {
      skonczone = true;
      clearTimeout(straznik);
      wideo.removeEventListener("ended", zakoncz);
      wideo.pause();
      koniec();
    };
    const naKlatkeFilmu = async (_teraz, meta) => {
      // Spóźniona klatka po „ended” — analiza już zamknięta.
      if (skonczone) return;
      wideo.pause();
      clearTimeout(straznik);
      if (przerwano?.()) { przerwane = true; return zakoncz(); }
      const t = meta.mediaTime;
      // Do zadanej klatki (ponowne śledzenie do następnego punktu kontrolnego).
      if (t > doSekundy + 1e-4) return zakoncz();
      if (!taSama(t) && t - ostatnia >= minOdstep) {
        const odstep = t - ostatnia;
        const krok = krokAnalizy();
        /*
         * Zgubione klatki. Przy obciążonym procesorze przeglądarka potrafi
         * pokazać dwie klatki w jednym odświeżeniu ekranu i wywołać nas tylko
         * dla drugiej — przegląd ruchu złapał 5 zgubionych na 293
         * (07.10.2026). Wtedy odkładamy bieżącą klatkę, cofamy się po
         * brakujące (przewinięcie — wolne, ale to rzadkie), liczymy je
         * po kolei i dopiero potem bieżącą. Znaczniki czasu dalej rosną.
         * Przy limicie kl./s — co krok analizy (pomijanie gęstszych klatek
         * jest zamierzone, dziura dłuższa niż krok — nie).
         */
        if (Number.isFinite(krok) && odstep > 1.5 * krok) {
          odlozona.width = wideo.videoWidth;
          odlozona.height = wideo.videoHeight;
          odlozona.getContext("2d").drawImage(wideo, 0, 0);
          await uzupelnij(ostatnia, t, Math.round(odstep / krok) - 1);
          policz(t * 1000, odlozona);
          await przewin(wideo, t + (Number.isFinite(krokFilmu) ? krokFilmu / 4 : 0));
        } else {
          policz(t * 1000);
        }
        if (!maksFps) krokFilmu = Math.min(krokFilmu, odstep);
        ostatnia = t;
      }
      postep?.(czas > 0 ? Math.min(1, t / czas) : 0);
      if (wideo.ended || skonczone) return zakoncz();
      pilnuj();
      wideo.requestVideoFrameCallback(naKlatkeFilmu);
      wideo.play().catch(zakoncz);
    };
    wideo.addEventListener("ended", zakoncz);
    wideo.requestVideoFrameCallback(naKlatkeFilmu);
    pilnuj();
    wideo.play().catch(zakoncz);
  });

  /*
   * Ostatnia klatka: „ended” przychodzi, zanim odtwarzanie zgłosi ostatnią
   * pokazaną klatkę. Najwyżej trzy kroki — dźwięk dłuższy niż obraz nie ma
   * dorobić serii kopii ostatniej klatki.
   */
  const krok = krokAnalizy();
  if (!przerwane && doSekundy === Infinity && Number.isFinite(krok) && Number.isFinite(krokFilmu)) {
    const brakuje = Math.min(3, Math.floor((czas - krokFilmu / 2 - ostatnia) / krok));
    if (brakuje > 0) await uzupelnij(ostatnia, ostatnia + krok * (brakuje + 1), brakuje);
  }
  wideo.playbackRate = tempo;
  return { przerwano: przerwane, uzupelnione };
}

async function przezPrzewijanie(wideo, czas, { fps, od = null, doSekundy = Infinity, policz, postep, przerwano }) {
  wideo.pause();
  // Ostatnia klatka trochę przed końcem: przewinięcie dokładnie na koniec
  // potrafi dać pusty obraz.
  const wszystkie = Math.max(1, Math.floor((czas - 0.001) * fps) + 1);
  for (let i = Math.round((od?.sekundy ?? 0) * fps); i < wszystkie; i++) {
    if (przerwano?.()) return { przerwano: true };
    if (i / fps > doSekundy + 1e-4) break;
    await przewin(wideo, i / fps);
    policz((i / fps) * 1000);
    postep?.((i + 1) / wszystkie);
    // Oddech dla przeglądarki — pasek postępu i przycisk „Przerwij” żyją.
    if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
  }
  return { przerwano: false };
}
