/**
 * Kąty i położenia segmentów z punktów jednej klatki.
 *
 * Dwa układy:
 * - **2D (obraz)** — piksele klatki. Tak liczą Kinovea i większość aplikacji
 *   trenerskich; najpewniejsze przy ujęciu dokładnie z boku albo z przodu.
 * - **3D (model)** — `worldLandmarks` MediaPipe: metry, środek między
 *   biodrami. Mniej zależne od ustawienia kamery, ale głębia jest szacowana.
 *
 * Konwencje kliniczne (trener jest fizjoterapeutą): zgięcie kolana, biodra
 * i łokcia 0° = wyprost; zgięcie grzbietowe stopy 0° = goleń prostopadle do
 * stopy, plus = goleń pochylona nad palce. Oś Y obrazu i modelu rośnie w dół,
 * więc pion „w górę” to (0, −1).
 *
 * Każdy kąt wraca z `pewnosc` — najmniejszą widocznością użytych punktów.
 * Poniżej `PROG_WIDOCZNOSCI` wartość dalej jest, ale ekran ją wycisza,
 * a wykres pomija.
 */
import { GLOWNE_PUNKTY, INDEKS, LANDMARKI, PROG_WIDOCZNOSCI, rozwiazywacz } from "./szkielet.js";

const STOPNIE = 180 / Math.PI;

const wektor = (a, b) => ({ x: b.x - a.x, y: b.y - a.y, z: (b.z ?? 0) - (a.z ?? 0) });
const dlugosc = (u, trzyD) => Math.hypot(u.x, u.y, trzyD ? u.z : 0);

/** Kąt między wektorami w stopniach, 0–180. `null`, gdy któryś ma długość 0. */
export function katMiedzy(u, v, trzyD = false) {
  const du = dlugosc(u, trzyD);
  const dv = dlugosc(v, trzyD);
  if (du === 0 || dv === 0) return null;
  const iloczyn = u.x * v.x + u.y * v.y + (trzyD ? u.z * v.z : 0);
  return Math.acos(Math.min(1, Math.max(-1, iloczyn / (du * dv)))) * STOPNIE;
}

/** Kąt w wierzchołku `b` między ramionami do `a` i do `c`, 0–180. */
export function katPrzy(a, b, c, trzyD = false) {
  return katMiedzy(wektor(b, a), wektor(b, c), trzyD);
}

const PION_W_GORE = { x: 0, y: -1, z: 0 };

/**
 * Definicje kątów. `grupa` łączy stronę lewą i prawą (np. „kolano”), żeby
 * profil ćwiczenia mógł prosić o „kolano po stronie bliżej kamery”.
 * `tylko2D` — miary odniesione do pionu/poziomu obrazu albo do kierunku
 * patrzenia; w modelu 3D nie mają jednoznacznego odpowiednika.
 */
export const KATY = [
  ...strony("kolano", "Zgięcie kolana", "0° = wyprost", (p, s, d) =>
    zgiecie(p(`${s}_hip`), p(`${s}_knee`), p(`${s}_ankle`), d)),
  ...strony("biodro", "Zgięcie biodra", "0° = tułów w linii z udem", (p, s, d) =>
    zgiecie(p(`${s}_shoulder`), p(`${s}_hip`), p(`${s}_knee`), d)),
  ...strony("skokowy", "Zgięcie grzbietowe stopy", "0° = goleń prostopadle do stopy, + = goleń nad palcami", (p, s, d) =>
    grzbietowe(p(`${s}_knee`), p(`${s}_ankle`), p(`${s}_heel`), p(`${s}_foot_index`), d), { widacZ: "boku" }),
  ...strony("lokiec", "Zgięcie łokcia", "0° = wyprost", (p, s, d) =>
    zgiecie(p(`${s}_shoulder`), p(`${s}_elbow`), p(`${s}_wrist`), d)),
  ...strony("ramie", "Ramię względem tułowia", "0° = ramię wzdłuż tułowia, 90° = w przód lub w bok, 180° = nad głową", (p, s, d) =>
    przy(p(`${s}_hip`), p(`${s}_shoulder`), p(`${s}_elbow`), d)),
  {
    id: "tulow", grupa: "tulow", strona: null, nazwa: "Pochylenie tułowia",
    opis: "0° = tułów pionowo (linia biodra–barki względem pionu)",
    licz: (p, d) => wzgledemPionu(p("srodek_bioder"), p("srodek_barkow"), d),
  },
  {
    id: "glowa_tulow", grupa: "glowa_tulow", strona: null, nazwa: "Głowa względem tułowia",
    opis: "0° = głowa w przedłużeniu tułowia (linia barki–uszy względem linii biodra–barki)",
    licz: (p, d) => {
      const biodra = p("srodek_bioder");
      const barki = p("srodek_barkow");
      const glowa = p("glowa");
      return wynik(katMiedzy(wektor(biodra, barki), wektor(barki, glowa), d), biodra, barki, glowa);
    },
  },
  {
    id: "glowa_przod", grupa: "glowa_przod", strona: null, tylko2D: true, jednostka: "%",
    nazwa: "Głowa przed barkami",
    opis: "poziomo, w % długości tułowia; + = głowa przed linią barków (w stronę patrzenia)",
    licz: (p) => {
      const biodra = p("srodek_bioder");
      const barki = p("srodek_barkow");
      const glowa = p("glowa");
      const tulow = dlugosc(wektor(biodra, barki), false);
      if (!tulow) return null;
      const kierunek = Math.sign(p("nose").x - glowa.x) || 1;
      return wynik(((glowa.x - barki.x) * kierunek / tulow) * 100, biodra, barki, glowa, p("nose"));
    },
  },
  {
    id: "barki_przechyl", grupa: "barki_przechyl", strona: null, tylko2D: true, widacZ: "przodu",
    nazwa: "Przechył linii barków",
    opis: "względem poziomu; + = lewy bark niżej. Do ujęcia z przodu lub z tyłu",
    licz: (p) => przechyl(p("left_shoulder"), p("right_shoulder")),
  },
  {
    id: "miednica_przechyl", grupa: "miednica_przechyl", strona: null, tylko2D: true, widacZ: "przodu",
    nazwa: "Przechył linii bioder",
    opis: "względem poziomu; + = lewe biodro niżej. Do ujęcia z przodu lub z tyłu",
    licz: (p) => przechyl(p("left_hip"), p("right_hip")),
  },
];

/** Kąt po identyfikatorze. */
export const KAT = Object.fromEntries(KATY.map((k) => [k.id, k]));

function strony(grupa, nazwa, opis, licz, dodatki = {}) {
  return [["left", "L"], ["right", "P"]].map(([s, litera]) => ({
    id: `${grupa}_${litera.toLowerCase()}`, grupa, strona: litera,
    nazwa: `${nazwa} ${litera}`, opis, ...dodatki,
    licz: (p, d) => licz(p, s, d),
  }));
}

/** Wynik z pewnością = najmniejsza widoczność użytych punktów. */
function wynik(wartosc, ...punkty) {
  if (wartosc === null || wartosc === undefined || Number.isNaN(wartosc)) return null;
  return { wartosc, pewnosc: Math.min(...punkty.map((q) => q?.v ?? 0)) };
}

function zgiecie(a, b, c, d) {
  const k = katPrzy(a, b, c, d);
  return wynik(k === null ? null : 180 - k, a, b, c);
}

function przy(a, b, c, d) {
  return wynik(katPrzy(a, b, c, d), a, b, c);
}

/**
 * Stopa krótsza na obrazie niż 40 % goleni (z boku ~55 %) to stopa ustawiona w stronę
 * kamery (ujęcie z przodu): jej kierunek na płaskim obrazie jest przypadkowy,
 * a kąt wychodził od −90° do +40° (przegląd ruchu, 07.10.2026). Taki wynik
 * zostaje, ale jako niepewny — z powodem do pokazania.
 */
const MIN_STOPA_DO_GOLENI = 0.4;

function grzbietowe(kolano, kostka, pieta, palce, d) {
  const golen = wektor(kostka, kolano);
  const stopa = wektor(pieta, palce);
  const k = katMiedzy(golen, stopa, d);
  const w = wynik(k === null ? null : 90 - k, kolano, kostka, pieta, palce);
  if (w && !d && dlugosc(stopa, false) < MIN_STOPA_DO_GOLENI * dlugosc(golen, false)) {
    return { ...w, pewnosc: Math.min(w.pewnosc, 0.2), powod: "stopa skierowana do kamery — z tego ujęcia kąta nie widać (spróbuj 3D albo ujęcia z boku)" };
  }
  return w;
}

function wzgledemPionu(dol, gora, d) {
  return wynik(katMiedzy(wektor(dol, gora), PION_W_GORE, d), dol, gora);
}

function przechyl(lewy, prawy) {
  const dx = Math.abs(prawy.x - lewy.x);
  const dy = lewy.y - prawy.y;              // + = lewy niżej (oś Y w dół)
  if (dx === 0 && dy === 0) return null;
  return wynik(Math.atan2(dy, dx) * STOPNIE, lewy, prawy);
}

/**
 * Punkty klatki w wybranym układzie.
 *
 * 2D: znormalizowane 0–1 → piksele (`wymiary` = szerokość i wysokość filmu).
 * Bez tego kąt na filmie 16:9 wychodzi zniekształcony — x i y MediaPipe są
 * normalizowane osobno do szerokości i wysokości.
 * 3D: metry modelu; widoczność bierzemy z punktów obrazu (model jej nie ma).
 */
export function punktyWUkladzie(klatka, wymiary, uklad = "2d") {
  if (!klatka?.p) return null;
  if (uklad === "3d") {
    if (!klatka.w) return null;
    return klatka.w.map(([x, y, z], i) => ({ x, y, z, v: klatka.p[i][3] }));
  }
  const { szerokosc, wysokosc } = wymiary;
  return klatka.p.map(([x, y, z, v]) => ({ x: x * szerokosc, y: y * wysokosc, z: z * szerokosc, v }));
}

/**
 * Wszystkie kąty jednej klatki: `{ id: {wartosc, pewnosc} | null }`.
 * `zamiany` — punkty podstawione (sugerowana pozycja), w pikselach dla 2D.
 */
export function katyKlatki(klatka, wymiary, { uklad = "2d", zamiany = {} } = {}) {
  const punkty = punktyWUkladzie(klatka, wymiary, uklad);
  if (!punkty) return null;
  const p = rozwiazywacz(punkty, zamiany);
  const trzyD = uklad === "3d";
  // Ujęcie liczone z obrazu, bez sugestii — sugestia nie obraca kamery.
  const widok = trzyD ? null : ujecie(punktyWUkladzie(klatka, wymiary, "2d"));
  const wyniki = {};
  for (const k of KATY) {
    if (trzyD && k.tylko2D) { wyniki[k.id] = null; continue; }
    const w = k.licz(p, trzyD);
    wyniki[k.id] = w && widok && k.widacZ && niewidoczneZ(k.widacZ, widok)
      ? { ...w, pewnosc: Math.min(w.pewnosc, 0.2),
          powod: `ujęcie ${widok === "bok" ? "z boku" : "z przodu"} — ten kąt widać ${k.widacZ === "boku" ? "z boku" : "z przodu lub z tyłu"}` }
      : w;
  }
  return wyniki;
}

const niewidoczneZ = (widacZ, widok) => (widacZ === "boku" ? widok === "przod" : widok === "bok");

/**
 * Ujęcie klatki z proporcji sylwetki na obrazie: szerokość barków (i bioder)
 * do długości tułowia. Z przodu barki są szerokie (~0,75 tułowia), z boku
 * prawie się nakrywają (~0,15). Pomiędzy — skos.
 *
 * Kąt w 2D ma sens tylko w płaszczyźnie, którą kamera widzi: zgięcie
 * grzbietowe stopy z przodu wychodziło −90…+40° (przegląd ruchu,
 * 07.10.2026), a przechył barków z boku to szum. Takie kąty zostają, ale
 * jako niepewne, z powodem.
 */
export function ujecie(punkty) {
  if (!punkty) return null;
  const p = rozwiazywacz(punkty);
  const barki = p("srodek_barkow");
  const biodra = p("srodek_bioder");
  const tulow = Math.hypot(barki.x - biodra.x, barki.y - biodra.y);
  if (!tulow) return null;
  const szerokosc = (Math.abs(p("left_shoulder").x - p("right_shoulder").x)
    + Math.abs(p("left_hip").x - p("right_hip").x)) / 2;
  const r = szerokosc / tulow;
  return r < 0.3 ? "bok" : r > 0.5 ? "przod" : "skos";
}

/** Ujęcie całego nagrania — najczęstsze wśród klatek z sylwetką. */
export function ujecieNagrania(klatki, wymiary) {
  const ile = { bok: 0, przod: 0, skos: 0 };
  for (const k of klatki) {
    const u = ujecie(punktyWUkladzie(k, wymiary, "2d"));
    if (u) ile[u]++;
  }
  const [naj, n] = Object.entries(ile).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? naj : null;
}

/**
 * Główne punkty klatki w pikselach: `[{id, x, y, v}]` w kolejności
 * `GLOWNE_PUNKTY`. `wszystkie` — dodatkowo pozostałe landmarki.
 */
export function punktyKlatki(klatka, wymiary, { wszystkie = false } = {}) {
  const punkty = punktyWUkladzie(klatka, wymiary, "2d");
  if (!punkty) return [];
  const p = rozwiazywacz(punkty);
  const ids = wszystkie
    ? [...GLOWNE_PUNKTY, ...LANDMARKI.map((l) => l.id).filter((id) => !GLOWNE_PUNKTY.includes(id))]
    : GLOWNE_PUNKTY;
  return ids.map((id) => ({ id, ...p(id) }));
}

/**
 * Strona bliżej kamery — ta, której bark, biodro, kolano i staw skokowy
 * MediaPipe widzi lepiej przez całe nagranie. Przy ujęciu z przodu obie
 * są podobne; wtedy „L”.
 */
export function stronaBlizejKamery(klatki) {
  const suma = { L: 0, P: 0 };
  for (const k of klatki) {
    if (!k.p) continue;
    for (const [s, przedrostek] of [["L", "left"], ["P", "right"]]) {
      for (const czesc of ["shoulder", "hip", "knee", "ankle"]) {
        suma[s] += k.p[INDEKS[`${przedrostek}_${czesc}`]][3];
      }
    }
  }
  return suma.P > suma.L ? "P" : "L";
}

/** Czy wynik kąta jest wystarczająco pewny, żeby go pokazać na wykresie. */
export const pewny = (w) => !!w && w.pewnosc >= PROG_WIDOCZNOSCI;
