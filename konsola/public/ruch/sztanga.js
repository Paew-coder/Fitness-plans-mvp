/**
 * Punkt sztangi — koniec gryfu na obrazie, śledzony klatka po klatce (24.10.2026).
 *
 * Trener przygotowuje badanie do doktoratu (przysiad high bar bez wskazówki,
 * high bar ze wskazówką, low bar; kamera z boku): „narzędzie musi odróżnić
 * high bar od low bar”. Obciążenie liczone w punkcie barku tego nie widzi —
 * sztanga leży wyżej albo niżej na plecach, a bark jest ten sam. Stąd punkt na
 * samym gryfie: trener zaznacza środek końca gryfu na pierwszej klatce, dalej
 * punkt idzie sam.
 *
 * Dwa sposoby śledzenia, oba bez bibliotek:
 * - „wzorzec” — wycinek obrazu wokół zaznaczonego punktu szukany w każdej
 *   następnej klatce, w oknie wokół przewidywanej pozycji: znormalizowana
 *   korelacja wzajemna (NCC) na jasności, najpierw co 2 px, potem co 1 px
 *   i dopasowanie paraboli (część piksela). Wzorzec odświeża się z każdą
 *   bardzo pewną klatką, a pozycję poprawia porównanie z wzorcem z punktu
 *   kontrolnego — bez tego błąd po trochu narasta (Matthews, Ishikawa,
 *   Baker 2004, „The template update problem”).
 * - „naklejka” — kolorowa naklejka na końcu gryfu: piksele w kolorze naklejki
 *   (odcień, nasycenie, jasność z miejsca zaznaczenia), plama najbliżej
 *   przewidywanej pozycji, punkt = jej środek. Pewniejsze — kolor się nie
 *   zmienia, gdy talerze się obracają albo zmienia się tło za gryfem.
 *
 * Pewność 0–1 w każdej klatce: wzorzec — wartość NCC; naklejka — zgodność
 * wielkości plamy z tą z punktu kontrolnego. Poniżej progu klatka jest
 * zgubiona („?”): nie wchodzi do wyników, a w następnej klatce szukanie idzie
 * w szerszym oknie.
 *
 * Obraz: `{ szerokosc, wysokosc, wytnij(x, y, w, h) → { data, width, height } }`
 * — RGBA jak `getImageData`; w przeglądarce płótno analizy (dłuższy bok
 * najwyżej 960 px), w testach sztuczny obraz. Współrzędne w pikselach tego
 * obrazu; do zapisu — znormalizowane 0–1, jak punkty MediaPipe.
 *
 * Czysty moduł: bez DOM, działa w przeglądarce i w testach Node.
 */

/** Ustawienia śledzenia — w pikselach obrazu analizy (dłuższy bok 960 px). Zapisują się w analizie. */
export const PARAMETRY_SLEDZENIA = {
  promienWzorca: 12,        // wzorzec 25 × 25 px wokół punktu
  promienOkna: 40,          // szukanie ±40 px wokół przewidywanej pozycji
  poszerzenie: 0.5,         // po każdej zgubionej klatce okno +50% (najwyżej ×3)
  odswiezenieWzorca: 0.8,   // wzorzec odświeża się przy NCC ≥ 0,8
  poprawkaZPierwszego: 3,   // ±3 px — porównanie z wzorcem z punktu kontrolnego
  odcien: 20,               // naklejka: ± stopni odcienia
  promienNaklejki: 30,      // naklejka: szukanie plamy przy zaznaczeniu
};

export const TRYBY_SLEDZENIA = {
  wzorzec: { nazwa: "koniec gryfu — wzór obrazu", prog: 0.6 },
  naklejka: { nazwa: "kolorowa naklejka na końcu gryfu", prog: 0.5 },
};

export const ZRODLA_PUNKTU = { sledzenie: "sledzenie", korekta: "korekta" };

const ogranicz = (v, min, max) => Math.min(max, Math.max(min, v));

/** Wycinek obrazu przycięty do jego granic (całe piksele). `null` — poza obrazem. */
function wytnij(obraz, x0, y0, w, h) {
  const xa = ogranicz(Math.floor(x0), 0, obraz.szerokosc);
  const ya = ogranicz(Math.floor(y0), 0, obraz.wysokosc);
  const xb = ogranicz(Math.floor(x0 + w), 0, obraz.szerokosc);
  const yb = ogranicz(Math.floor(y0 + h), 0, obraz.wysokosc);
  if (xb - xa < 1 || yb - ya < 1) return null;
  const d = obraz.wytnij(xa, ya, xb - xa, yb - ya);
  return { x0: xa, y0: ya, width: d.width, height: d.height, data: d.data };
}

function jasnosci(wyc) {
  const g = new Float64Array(wyc.width * wyc.height);
  const d = wyc.data;
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return g;
}

/* ── wzorzec (NCC) ──────────────────────────────────────────────── */

/** Wzorzec wokół punktu: jasności minus średnia. `null` — za blisko brzegu albo obraz jednolity. */
function wzorzecW(obraz, x, y, r) {
  // Piksel i zajmuje odcinek [i, i + 1), jego środek to i + 0,5.
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const wyc = wytnij(obraz, cx - r, cy - r, 2 * r + 1, 2 * r + 1);
  if (!wyc || wyc.width !== 2 * r + 1 || wyc.height !== 2 * r + 1) return null;
  const g = jasnosci(wyc);
  const srednia = g.reduce((s, v) => s + v, 0) / g.length;
  let norma = 0;
  for (let i = 0; i < g.length; i++) { g[i] -= srednia; norma += g[i] * g[i]; }
  // Odchylenie jasności poniżej 2 (na 255) — jednolita plama, nie ma czego szukać.
  if (norma / g.length < 4) return { r, t: g, norma, plaski: true };
  return { r, t: g, norma, plaski: false };
}

/**
 * Najlepsze miejsce wzorca w oknie ±`promien` wokół `srodek`.
 * Zwraca `{ x, y, ncc }` (środek wzorca, z częścią piksela) albo `null`.
 */
function szukajWzorca(obraz, wz, srodek, promien) {
  const { r, t, norma } = wz;
  if (!(norma > 0)) return null;
  const R = Math.ceil(promien);
  const wyc = wytnij(obraz, Math.floor(srodek.x) - R - r, Math.floor(srodek.y) - R - r, 2 * (R + r) + 1, 2 * (R + r) + 1);
  if (!wyc) return null;
  const { width: gw, height: gh, x0, y0 } = wyc;
  const g = jasnosci(wyc);
  // Sumy całkowe jasności i jej kwadratu — średnia i wariancja okna w O(1).
  const W1 = gw + 1;
  const S = new Float64Array(W1 * (gh + 1));
  const S2 = new Float64Array(W1 * (gh + 1));
  for (let y = 0; y < gh; y++) {
    let wiersz = 0, wiersz2 = 0;
    for (let x = 0; x < gw; x++) {
      const v = g[y * gw + x];
      wiersz += v; wiersz2 += v * v;
      S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + wiersz;
      S2[(y + 1) * W1 + x + 1] = S2[y * W1 + x + 1] + wiersz2;
    }
  }
  const n = (2 * r + 1) * (2 * r + 1);
  const bok = 2 * r + 1;
  const ncc = (cx, cy) => {
    // cx, cy — środek w układzie wycinka; wzorzec musi się zmieścić.
    const xa = cx - r, ya = cy - r;
    if (xa < 0 || ya < 0 || xa + bok > gw || ya + bok > gh) return -Infinity;
    const suma = S[(ya + bok) * W1 + xa + bok] - S[ya * W1 + xa + bok] - S[(ya + bok) * W1 + xa] + S[ya * W1 + xa];
    const suma2 = S2[(ya + bok) * W1 + xa + bok] - S2[ya * W1 + xa + bok] - S2[(ya + bok) * W1 + xa] + S2[ya * W1 + xa];
    const war = suma2 - (suma * suma) / n;
    if (war <= 1e-6) return 0;
    let licznik = 0;
    for (let y = 0; y < bok; y++) {
      const o = (ya + y) * gw + xa;
      const ot = y * bok;
      for (let x = 0; x < bok; x++) licznik += g[o + x] * t[ot + x];
    }
    return licznik / Math.sqrt(war * norma);
  };
  const sx = Math.floor(srodek.x) - x0;
  const sy = Math.floor(srodek.y) - y0;
  let naj = { x: sx, y: sy, v: -Infinity };
  const sprawdz = (x, y) => {
    const v = ncc(x, y);
    if (v > naj.v) naj = { x, y, v };
  };
  // Co 2 px w całym oknie, potem co 1 px wokół najlepszego.
  for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) sprawdz(sx + dx, sy + dy);
  const zgrubny = naj;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) sprawdz(zgrubny.x + dx, zgrubny.y + dy);
  if (!Number.isFinite(naj.v)) return null;
  // Parabola przez sąsiadów — położenie z dokładnością do części piksela.
  const parabola = (a, b, c) => {
    const m = a - 2 * b + c;
    return Number.isFinite(a) && Number.isFinite(c) && m < 0 ? ogranicz((a - c) / (2 * m), -0.5, 0.5) : 0;
  };
  const px = parabola(ncc(naj.x - 1, naj.y), naj.v, ncc(naj.x + 1, naj.y));
  const py = parabola(ncc(naj.x, naj.y - 1), naj.v, ncc(naj.x, naj.y + 1));
  return { x: x0 + naj.x + px + 0.5, y: y0 + naj.y + py + 0.5, ncc: naj.v };
}

/* ── naklejka (kolor) ───────────────────────────────────────────── */

function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max > 0 ? d / max : 0, v: max / 255 };
}

const roznicaOdcieni = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Maska pikseli w kolorze naklejki w wycinku (1 = pasuje). */
function maskaKoloru(wyc, kolor, odcien) {
  const m = new Uint8Array(wyc.width * wyc.height);
  const d = wyc.data;
  for (let i = 0, j = 0; j < m.length; i += 4, j++) {
    const q = hsv(d[i], d[i + 1], d[i + 2]);
    if (q.s >= kolor.sMin && q.v >= kolor.vMin && roznicaOdcieni(q.h, kolor.h) <= odcien) m[j] = 1;
  }
  return m;
}

/** Spójne plamy maski (sąsiedztwo 4): `[{ pole, x, y }]` — środek w układzie obrazu. */
function plamy(maska, wyc) {
  const { width: w, height: h, x0, y0 } = wyc;
  const odwiedzone = new Uint8Array(maska.length);
  const wynik = [];
  const kolejka = new Int32Array(maska.length);
  for (let start = 0; start < maska.length; start++) {
    if (!maska[start] || odwiedzone[start]) continue;
    let glowa = 0, ogon = 0, sx = 0, sy = 0, pole = 0;
    kolejka[ogon++] = start;
    odwiedzone[start] = 1;
    while (glowa < ogon) {
      const i = kolejka[glowa++];
      const x = i % w, y = (i - x) / w;
      sx += x; sy += y; pole++;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && maska[j] && !odwiedzone[j]) { odwiedzone[j] = 1; kolejka[ogon++] = j; }
      }
    }
    // Środek piksela = +0,5 (piksel (0,0) zajmuje 0–1).
    wynik.push({ pole, x: x0 + sx / pole + 0.5, y: y0 + sy / pole + 0.5 });
  }
  return wynik;
}

/* ── śledzenie ──────────────────────────────────────────────────── */

/**
 * Śledzenie jednego punktu przez kolejne klatki.
 *
 *   const s = utworzSledzenie({ tryb: "naklejka" });
 *   s.start(obraz, x, y)  // klatka z punktem kontrolnym → { x, y, pewnosc: 1 } albo { blad }
 *   s.krok(obraz)         // każda następna → { x, y, pewnosc, pewny }
 *
 * W trybie naklejki punkt kontrolny przeskakuje na środek naklejki (tam, gdzie
 * będzie potem śledzony) — bez skoku w następnej klatce.
 */
export function utworzSledzenie({ tryb = "wzorzec", parametry = {} } = {}) {
  const P = { ...PARAMETRY_SLEDZENIA, ...parametry };
  const prog = TRYBY_SLEDZENIA[tryb]?.prog ?? TRYBY_SLEDZENIA.wzorzec.prog;
  let ostatni = null;      // ostatnia pewna pozycja
  let poprzedni = null;    // pewna pozycja przed nią (do prędkości)
  let zgubione = 0;
  let wz0 = null, wzBiezacy = null;   // wzorce: z punktu kontrolnego i ostatni
  let kolor = null, pole0 = 0;        // naklejka

  const przewidywana = () => (ostatni && poprzedni
    ? { x: 2 * ostatni.x - poprzedni.x, y: 2 * ostatni.y - poprzedni.y }
    : ostatni);
  const promien = () => P.promienOkna * (1 + P.poszerzenie * Math.min(zgubione, 4));

  function zapamietaj(q, pewnosc) {
    if (pewnosc >= prog) {
      poprzedni = zgubione === 0 ? ostatni : null;
      ostatni = { x: q.x, y: q.y };
      zgubione = 0;
    } else {
      zgubione++;
      poprzedni = null;
    }
  }

  function startWzorca(obraz, x, y) {
    const wz = wzorzecW(obraz, x, y, P.promienWzorca);
    if (!wz) return { blad: "Punkt jest za blisko brzegu obrazu." };
    // Środek piksela pod palcem — w tym samym układzie, w którym wychodzą następne klatki.
    x = Math.floor(x) + 0.5;
    y = Math.floor(y) + 0.5;
    wz0 = wz;
    wzBiezacy = wz;
    ostatni = { x, y };
    poprzedni = null;
    zgubione = 0;
    return { x, y, pewnosc: 1, pewny: true,
      ostrzezenie: wz.plaski ? "W tym miejscu obraz jest jednolity — śledzenie może się gubić. Lepiej z naklejką." : null };
  }

  function krokWzorca(obraz) {
    const cel = przewidywana();
    let z = szukajWzorca(obraz, wzBiezacy, cel, promien());
    if (!z) { zapamietaj(cel, 0); return { x: cel.x, y: cel.y, pewnosc: 0, pewny: false }; }
    if (wzBiezacy !== wz0) {
      const z0 = szukajWzorca(obraz, wz0, z, P.poprawkaZPierwszego);
      if (z0 && z0.ncc >= prog) z = { x: z0.x, y: z0.y, ncc: Math.max(z0.ncc, z.ncc) };
    }
    const pewnosc = ogranicz(z.ncc, 0, 1);
    zapamietaj(z, pewnosc);
    if (pewnosc >= P.odswiezenieWzorca) {
      const nowy = wzorzecW(obraz, z.x, z.y, P.promienWzorca);
      if (nowy && !nowy.plaski) wzBiezacy = nowy;
    }
    return { x: z.x, y: z.y, pewnosc, pewny: pewnosc >= prog };
  }

  function startNaklejki(obraz, x, y) {
    const R = P.promienNaklejki;
    const wyc = wytnij(obraz, x - R, y - R, 2 * R + 1, 2 * R + 1);
    if (!wyc) return { blad: "Punkt jest poza obrazem." };
    // Kolor z miejsca zaznaczenia: średnia z 3 × 3 pikseli.
    const lx = ogranicz(Math.floor(x) - wyc.x0, 1, wyc.width - 2);
    const ly = ogranicz(Math.floor(y) - wyc.y0, 1, wyc.height - 2);
    let r = 0, g = 0, b = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = ((ly + dy) * wyc.width + lx + dx) * 4;
      r += wyc.data[i]; g += wyc.data[i + 1]; b += wyc.data[i + 2];
    }
    const q = hsv(r / 9, g / 9, b / 9);
    if (q.s < 0.25 || q.v < 0.15) {
      return { blad: "W tym miejscu nie ma wyraźnego koloru — dotknij samej naklejki (najlepiej jaskrawej: różowej, zielonej, pomarańczowej)." };
    }
    const wzor = { h: q.h, sMin: Math.max(0.25, 0.5 * q.s), vMin: Math.max(0.15, 0.4 * q.v) };
    const maska = maskaKoloru(wyc, wzor, P.odcien);
    // Plama, której środek jest najbliżej palca — i nie dalej niż jej rozmiar (albo 8 px).
    let naj = null;
    for (const p of plamy(maska, wyc)) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (!naj || d < naj.d) naj = { ...p, d };
    }
    if (!naj || naj.d > Math.max(8, Math.sqrt(naj.pole))) return { blad: "Nie widzę tu naklejki — dotknij środka naklejki." };
    kolor = wzor;
    pole0 = naj.pole;
    ostatni = { x: naj.x, y: naj.y };
    poprzedni = null;
    zgubione = 0;
    return { x: naj.x, y: naj.y, pewnosc: 1, pewny: true,
      ostrzezenie: naj.pole < 12 ? "Naklejka jest na obrazie bardzo mała — śledzenie może się gubić." : null };
  }

  function krokNaklejki(obraz) {
    const cel = przewidywana();
    const R = promien();
    const wyc = wytnij(obraz, cel.x - R, cel.y - R, 2 * R + 1, 2 * R + 1);
    let naj = null;
    if (wyc) {
      for (const p of plamy(maskaKoloru(wyc, kolor, P.odcien), wyc)) {
        const zgodnosc = Math.min(p.pole / pole0, pole0 / p.pole);
        if (zgodnosc < 0.25) continue;
        const d = Math.hypot(p.x - cel.x, p.y - cel.y);
        if (!naj || d < naj.d) naj = { ...p, d, zgodnosc };
      }
    }
    if (!naj) { zapamietaj(cel, 0); return { x: cel.x, y: cel.y, pewnosc: 0, pewny: false }; }
    zapamietaj(naj, naj.zgodnosc);
    return { x: naj.x, y: naj.y, pewnosc: naj.zgodnosc, pewny: naj.zgodnosc >= prog };
  }

  return {
    tryb,
    prog,
    parametry: P,
    start: (obraz, x, y) => (tryb === "naklejka" ? startNaklejki(obraz, x, y) : startWzorca(obraz, x, y)),
    krok: (obraz) => {
      if (!ostatni) throw new Error("Śledzenie bez punktu startowego.");
      return tryb === "naklejka" ? krokNaklejki(obraz) : krokWzorca(obraz);
    },
  };
}

/**
 * Cała sekwencja obrazów od punktu kontrolnego w pierwszym: `[{x, y, pewnosc, pewny}]`.
 * (Do testów i do śledzenia bez filmu w pamięci.)
 */
export function sledzSekwencje(obrazy, { tryb = "wzorzec", x, y, parametry } = {}) {
  const s = utworzSledzenie({ tryb, parametry });
  const pierwszy = s.start(obrazy[0], x, y);
  if (pierwszy.blad) throw new Error(pierwszy.blad);
  return [pierwszy, ...obrazy.slice(1).map((o) => s.krok(o))];
}

/* ── punkt sztangi w zapisie ────────────────────────────────────── */

const zaokr = (n, miejsc) => Math.round(n * 10 ** miejsc) / 10 ** miejsc;

/** Punkt do zapisu w klatce: x, y znormalizowane 0–1 (jak MediaPipe), pewność, źródło. */
export function punktDoZapisu(q, szerokosc, wysokosc, zrodlo = ZRODLA_PUNKTU.sledzenie) {
  return {
    x: zaokr(ogranicz(q.x / szerokosc, 0, 1), 5),
    y: zaokr(ogranicz(q.y / wysokosc, 0, 1), 5),
    pewnosc: zaokr(ogranicz(q.pewnosc, 0, 1), 3),
    zrodlo,
  };
}

/** Próg pewności sesji — zapisany przy śledzeniu (zmiana progu w kodzie nie zmienia starych analiz). */
export const progSesji = (sesja) => sesja.sztanga?.prog ?? TRYBY_SLEDZENIA[sesja.sztanga?.tryb]?.prog ?? TRYBY_SLEDZENIA.wzorzec.prog;

/** Czy punkt sztangi w klatce jest pewny (korekta trenera — zawsze). */
export const pewnySztangi = (punkt, prog) => !!punkt && (punkt.zrodlo === ZRODLA_PUNKTU.korekta || punkt.pewnosc >= prog);

/** Czy sesja ma choć jeden punkt sztangi. */
export const maSztange = (sesja) => sesja.klatki.some((k) => k.sztanga);

/** Punkty sztangi w pikselach filmu: `[{ x, y, pewny, pewnosc, zrodlo } | null]` — tyle, ile klatek. */
export function punktySztangi(sesja) {
  const { szerokosc, wysokosc } = sesja.wideo;
  const prog = progSesji(sesja);
  return sesja.klatki.map((k) => (k.sztanga ? {
    x: k.sztanga.x * szerokosc, y: k.sztanga.y * wysokosc,
    pewny: pewnySztangi(k.sztanga, prog), pewnosc: k.sztanga.pewnosc, zrodlo: k.sztanga.zrodlo,
  } : null));
}

/** Pierwsza klatka po `od` z punktem kontrolnym (korektą trenera) — tam kończy się ponowne śledzenie. */
export function nastepnyPunktKontrolny(klatki, od) {
  for (let i = od + 1; i < klatki.length; i++) if (klatki[i].sztanga?.zrodlo === ZRODLA_PUNKTU.korekta) return i;
  return klatki.length;
}

/** Podsumowanie śledzenia: ile klatek z punktem, ile pewnych, które zgubione, które to punkty kontrolne. */
export function podsumowanieSledzenia(sesja) {
  const prog = progSesji(sesja);
  const zgubione = [];
  const kontrolne = [];
  let zPunktem = 0;
  sesja.klatki.forEach((k, i) => {
    if (!k.sztanga) return;
    zPunktem++;
    if (k.sztanga.zrodlo === ZRODLA_PUNKTU.korekta) kontrolne.push(i);
    if (!pewnySztangi(k.sztanga, prog)) zgubione.push(i);
  });
  return { klatek: sesja.klatki.length, zPunktem, pewnych: zPunktem - zgubione.length, zgubione, kontrolne, prog };
}
