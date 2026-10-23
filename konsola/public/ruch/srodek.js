/**
 * Środek ciężkości ciała — metoda segmentowa na punktach MediaPipe (23.10.2026).
 *
 * Trener: „dodajmy do aplikacji możliwość analizy środka ciężkości metodą
 * segmentową — De Leva razem z rozróżnieniem na płeć, plus wygładzenie
 * trajektorii”. Ta sama metoda co w jego pracy magisterskiej (punkty
 * segmentów na zdjęciu → średnia ważona masą), tylko w każdej klatce.
 *
 * Model segmentów:
 * - de Leva P. (1996) Adjustments to Zatsiorsky–Seluyanov's segment inertia
 *   parameters. J Biomech 29(9):1223–1230, Tabela 4 — osobno kobiety
 *   i mężczyźni. Końce segmentów to u de Levy środki stawów; tu przybliżają je
 *   punkty MediaPipe (szacowane z obrazu, bez definicji anatomicznej).
 * - Braune i Fischer — wartości z pracy magisterskiej trenera (Ryc. 3),
 *   do porównań z nią.
 *
 * Przybliżenia (opisane też trenerowi na ekranie):
 * - głowa: środek uszu (de Leva liczy ją od szczytu głowy, którego MediaPipe
 *   nie ma; w pracy magisterskiej — „otwór ucha zewnętrznego”),
 * - tułów: od środka barków do środka bioder (u de Levy: wcięcie jarzmowe
 *   mostka albo środek stawów ramiennych → środek stawów biodrowych),
 * - ręka: od nadgarstka do głowy III kości śródręcza, przybliżonej punktem
 *   na 1/3 drogi od punktu palca wskazującego do małego.
 *
 * Czysty moduł: bez DOM, działa w przeglądarce i w testach Node.
 */
import { punktyWUkladzie } from "./geometria.js";
import { wypelnijLuki } from "./przebieg.js";
import { PROG_WIDOCZNOSCI, rozwiazywacz } from "./szkielet.js";

/**
 * Masa segmentu (% masy ciała; kończyny — jedna strona) i położenie jego
 * środka ciężkości (ułamek długości od pierwszego końca). Głowa — punkt.
 */
export const MODELE_SRODKA = {
  "deleva-k": {
    nazwa: "de Leva (1996) — kobieta",
    glowa: 6.68,
    tulow: [42.57, 0.4151], ramie: [2.55, 0.5754], przedramie: [1.38, 0.4559], reka: [0.56, 0.7474],
    udo: [14.78, 0.3612], podudzie: [4.81, 0.4416], stopa: [1.29, 0.4014],
    dlon: 1 / 3,
  },
  "deleva-m": {
    nazwa: "de Leva (1996) — mężczyzna",
    glowa: 6.94,
    tulow: [43.46, 0.4486], ramie: [2.71, 0.5772], przedramie: [1.62, 0.4574], reka: [0.61, 0.7900],
    udo: [14.16, 0.4095], podudzie: [4.33, 0.4459], stopa: [1.37, 0.4415],
    dlon: 1 / 3,
  },
  // Praca magisterska (Ryc. 3): ręka — „środek okręgu lub 3–4 kość
  // śródręcza”, czyli w połowie śródręcza (od nadgarstka do nasady palców,
  // między III a IV kością).
  "braune-fischer": {
    nazwa: "Braune i Fischer — jak w pracy magisterskiej",
    glowa: 7,
    tulow: [43, 0.44], ramie: [3, 0.47], przedramie: [2, 0.42], reka: [1, 0.5],
    udo: [12, 0.44], podudzie: [5, 0.42], stopa: [2, 0.44],
    dlon: 1 / 2,
  },
};

/** Kończyny: segment, pierwszy i drugi koniec (bez przedrostka strony). */
const KONCZYNY = [
  ["ramie", "shoulder", "elbow"],
  ["przedramie", "elbow", "wrist"],
  ["reka", "wrist", "dlon"],
  ["udo", "hip", "knee"],
  ["podudzie", "knee", "ankle"],
  ["stopa", "heel", "foot_index"],
];

/** Suma mas modelu (%), kończyny liczone dwa razy. */
export function masaModelu(model) {
  const m = MODELE_SRODKA[model];
  return m.glowa + m.tulow[0] + 2 * KONCZYNY.reduce((s, [seg]) => s + m[seg][0], 0);
}

/** Średnia ważona punktów `{x, y, masa}` — tak jak w pracy magisterskiej (Ryc. 7–8). */
export function sredniaWazona(punkty) {
  const masa = punkty.reduce((s, q) => s + q.masa, 0);
  if (!(masa > 0)) return null;
  return {
    x: punkty.reduce((s, q) => s + q.x * q.masa, 0) / masa,
    y: punkty.reduce((s, q) => s + q.y * q.masa, 0) / masa,
  };
}

const naOdcinku = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, v: Math.min(a.v, b.v) });

/**
 * Środek ciężkości jednej klatki, w pikselach obrazu.
 *
 * `konczyny`: "obie" — każda strona osobno (ujęcie z przodu, skos);
 * "L" / "P" — tylko ta strona, liczona podwójnie (ujęcie z boku: dalsza ręka
 * i noga są zasłonięte, MediaPipe je zgaduje — tak samo liczył trener w pracy,
 * „RA 3+3%”). Wtedy tułów też z tej strony (bark → biodro), bo z boku obie
 * strony leżą na sobie.
 * `obciazenie`: `{ kg, masaCiala, miejsce: "barki" | "dlonie" }` — sztanga albo
 * hantle jako dodatkowa masa w tym miejscu.
 *
 * Zwraca `{ x, y, pewny, niepewnaMasa, segmenty, stopy }` albo `null`.
 * `pewny` — punkty segmentów o łącznej masie powyżej 10% są słabo widoczne
 * (poniżej progu widoczności) → wynik niepewny.
 */
export function srodekKlatki(klatka, wymiary, { model, konczyny = "obie", obciazenie = null }) {
  const m = MODELE_SRODKA[model];
  const punkty = punktyWUkladzie(klatka, wymiary, "2d");
  if (!m || !punkty) return null;
  const p0 = rozwiazywacz(punkty);
  const p = (id) => {
    const dlon = /^(left|right)_dlon$/.exec(id);
    if (!dlon) return p0(id);
    // Nasada palców: od punktu palca wskazującego w stronę małego.
    return naOdcinku(p0(`${dlon[1]}_index`), p0(`${dlon[1]}_pinky`), m.dlon);
  };
  const strony = konczyny === "L" ? [["left", 2]] : konczyny === "P" ? [["right", 2]] : [["left", 1], ["right", 1]];

  const segmenty = [];
  const dodaj = (id, strona, a, b, [masa, u]) => {
    const q = naOdcinku(p(a), p(b), u);
    segmenty.push({ id, strona, x: q.x, y: q.y, masa, pewny: q.v >= PROG_WIDOCZNOSCI });
  };
  const glowa = p("glowa");
  segmenty.push({ id: "glowa", strona: null, x: glowa.x, y: glowa.y, masa: m.glowa, pewny: glowa.v >= PROG_WIDOCZNOSCI });
  if (strony.length === 1) {
    const s = strony[0][0];
    dodaj("tulow", null, `${s}_shoulder`, `${s}_hip`, m.tulow);
  } else {
    dodaj("tulow", null, "srodek_barkow", "srodek_bioder", m.tulow);
  }
  for (const [s, razy] of strony) {
    for (const [seg, a, b] of KONCZYNY) {
      dodaj(seg, s === "left" ? "L" : "P", `${s}_${a}`, `${s}_${b}`, [m[seg][0] * razy, m[seg][1]]);
    }
  }

  let srodek = sredniaWazona(segmenty);
  if (!srodek) return null;
  const masa = segmenty.reduce((s, q) => s + q.masa, 0);
  const niepewnaMasa = segmenty.filter((q) => !q.pewny).reduce((s, q) => s + q.masa, 0) / masa;

  if (obciazenie?.kg > 0 && obciazenie.masaCiala > 0) {
    const miejsce = obciazenie.miejsce === "dlonie"
      ? sredniaWazona(segmenty.filter((q) => q.id === "reka").map((q) => ({ ...q, masa: 1 })))
      : strony.length === 1 ? p(`${strony[0][0]}_shoulder`) : p("srodek_barkow");
    srodek = sredniaWazona([
      { ...srodek, masa: obciazenie.masaCiala },
      { x: miejsce.x, y: miejsce.y, masa: obciazenie.kg },
    ]);
  }

  // Stopy do odniesienia: przy jednej stronie — jej pięta i palce; przy obu — stawy skokowe.
  const stopy = strony.length === 1
    ? { pieta: p(`${strony[0][0]}_heel`), palce: p(`${strony[0][0]}_foot_index`) }
    : { lewa: p("left_ankle"), prawa: p("right_ankle"),
        podloga: Math.max(...["left_heel", "right_heel", "left_foot_index", "right_foot_index"].map((id) => p(id).y)) };
  if (strony.length === 1) stopy.podloga = Math.max(stopy.pieta.y, stopy.palce.y);

  return { x: srodek.x, y: srodek.y, pewny: niepewnaMasa <= 0.1, niepewnaMasa, segmenty, stopy };
}

/**
 * Położenie środka ciężkości względem stóp, w procentach:
 * - jedna strona (z boku): nad stopą — pięta 0%, palce 100% (poniżej 0 — za
 *   piętą, powyżej 100 — przed palcami); kierunek stopy z obrazu, więc
 *   działa przy osobie zwróconej w lewo i w prawo,
 * - obie strony (z przodu): między stopami — lewa 0%, prawa 100%.
 * `null`, gdy stopa jest na obrazie za krótka, żeby to policzyć.
 */
export function wzgledemStop(wynik) {
  if (!wynik) return null;
  const { stopy } = wynik;
  const [od, doP] = stopy.pieta ? [stopy.pieta, stopy.palce] : [stopy.lewa, stopy.prawa];
  const dl = doP.x - od.x;
  if (Math.abs(dl) < 5) return null;
  return ((wynik.x - od.x) / dl) * 100;
}

/* ── wygładzanie ────────────────────────────────────────────────── */

/**
 * Filtr dolnoprzepustowy Butterwortha 2. rzędu, przepuszczony w przód
 * i w tył (bez przesunięcia w czasie) — standard w biomechanice dla
 * trajektorii punktów (Winter: 4–8 Hz). Częstotliwość odcięcia poprawiona
 * o współczynnik 0,802, bo dwa przejścia obniżają ją same (Winter).
 *
 * `null` w danych: luki do 5 klatek wypełniane liniowo, dłuższe dzielą
 * nagranie na kawałki filtrowane osobno i zostają `null`. Kawałek krótszy
 * niż 6 klatek zostaje bez zmian.
 */
export function wygladzTrajektorie(wartosci, fps, odciecie = 6) {
  const fc = Math.min(odciecie, fps * 0.4);
  if (!(fc > 0) || wartosci.length < 6) return [...wartosci];
  const wypelnione = wypelnijLuki(wartosci, 5);
  const wynik = [...wypelnione];
  let i = 0;
  while (i < wypelnione.length) {
    if (wypelnione[i] === null) { i++; continue; }
    let j = i;
    while (j < wypelnione.length && wypelnione[j] !== null) j++;
    if (j - i >= 6) {
      const gladkie = filtrujWObieStrony(wypelnione.slice(i, j), fps, fc / 0.802);
      for (let k = i; k < j; k++) wynik[k] = gladkie[k - i];
    }
    i = j;
  }
  return wynik;
}

function filtrujWObieStrony(x, fps, fc) {
  const K = Math.tan(Math.PI * Math.min(fc, fps * 0.49) / fps);
  const norma = 1 / (1 + Math.SQRT2 * K + K * K);
  const b0 = K * K * norma;
  const b1 = 2 * b0;
  const a1 = 2 * (K * K - 1) * norma;
  const a2 = (1 - Math.SQRT2 * K + K * K) * norma;
  // Odbicie na końcach (nieparzyste) — mniej zakłóceń na brzegach.
  const pad = Math.min(x.length - 1, 15);
  const n = x.length;
  const z = [
    ...Array.from({ length: pad }, (_, k) => 2 * x[0] - x[pad - k]),
    ...x,
    ...Array.from({ length: pad }, (_, k) => 2 * x[n - 1] - x[n - 2 - k]),
  ];
  const jedenRaz = (we) => {
    const wy = new Array(we.length);
    let x1 = we[0], x2 = we[0], y1 = we[0], y2 = we[0];
    for (let k = 0; k < we.length; k++) {
      const y = b0 * we[k] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = we[k]; y2 = y1; y1 = y;
      wy[k] = y;
    }
    return wy;
  };
  const tam = jedenRaz(z);
  const zPowrotem = jedenRaz(tam.reverse()).reverse();
  return zPowrotem.slice(pad, pad + n);
}

/* ── całe nagranie ──────────────────────────────────────────────── */

/** Klatki na sekundę z samych klatek (mediana odstępów). */
export function fpsZKlatek(klatki) {
  const odstepy = klatki.slice(1).map((k, i) => k.t - klatki[i].t).sort((a, b) => a - b);
  const mediana = odstepy[Math.floor(odstepy.length / 2)];
  return mediana > 0 ? 1000 / mediana : 30;
}

/**
 * Środek ciężkości we wszystkich klatkach.
 * `ustawienia`: `{ model, konczyny, obciazenie, wygladzanie, fps }`.
 * Zwraca `{ klatki: [wynik|null], x, y, wzgledem, xGladkie, yGladkie, wzgledemGladkie }`
 * — serie pełne (do zapisu) i wygładzone (do ekranu, gdy wygładzanie włączone;
 * inaczej te same). Niepewne klatki mają `null` w seriach.
 */
export function srodekSesji(sesja, { model, konczyny = "obie", obciazenie = null, wygladzanie = true, fps = fpsZKlatek(sesja.klatki) }) {
  const wymiary = { szerokosc: sesja.wideo.szerokosc, wysokosc: sesja.wideo.wysokosc };
  const klatki = sesja.klatki.map((k) => srodekKlatki(k, wymiary, { model, konczyny, obciazenie }));
  const pewne = (f) => klatki.map((w) => (w?.pewny ? f(w) : null));
  const x = pewne((w) => w.x);
  const y = pewne((w) => w.y);
  const wzgledem = pewne((w) => wzgledemStop(w));
  const gladz = (seria) => (wygladzanie ? wygladzTrajektorie(seria, fps) : seria);
  return { klatki, x, y, wzgledem, xGladkie: gladz(x), yGladkie: gladz(y), wzgledemGladkie: gladz(wzgledem) };
}
