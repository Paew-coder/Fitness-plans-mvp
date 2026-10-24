/**
 * Analiza ruchu — czysta logika modułu `public/ruch/` (07.10.2026).
 *
 * MediaPipe i przeglądarka są poza tym testem (to robi `npm run przeglad-ruchu`
 * na prawdziwym filmie). Tu sprawdzamy to, co z punktów robi się dalej:
 * kąty w konwencji klinicznej, poprawkę na proporcje obrazu, pewność,
 * powtórzenia, zapis sesji i sugerowane pozycje — na sylwetkach, których
 * geometrię znamy dokładnie.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  GLOWNE_PUNKTY, grupaPunktu, INDEKS, LANDMARKI, POLACZENIA, punktWidoczny, rozwiazywacz, ukryteBezStrony,
} from "../public/ruch/szkielet.js";
import { KOLORY, punktPodPalcem, rysujKlatke } from "../public/ruch/rysowanie.js";
import {
  KATY, katPrzy, katyKlatki, punktyKlatki, punktyWUkladzie, stronaBlizejKamery, ujecie, ujecieNagrania,
} from "../public/ruch/geometria.js";
import {
  chwilaKlatki, katySesji, klatkaDlaCzasu, klatkaWChwili, seria, trajektoria, wygladz, wypelnijLuki, wykryjPowtorzenia, zakresRuchu,
} from "../public/ruch/przebieg.js";
import { PROFIL, powtorzeniaProfilu } from "../public/ruch/profile.js";
import {
  BladSesji, doCSV, doJSON, klatkaZWyniku, nowaSesja, skutekSugestii, ustawSugestie, usunSugestie, zJSON,
} from "../public/ruch/sesja.js";

const W = 1280;
const H = 720;
const WYMIARY = { szerokosc: W, wysokosc: H };
const rad = (st: number) => (st * Math.PI) / 180;

type P = { x: number; y: number };

/**
 * Sylwetka z boku, twarzą w prawo (+x), w pikselach. `a` — pochylenie
 * goleni w przód, `b` — uda w tył, `c` — tułowia w przód (stopnie od pionu).
 * Z budowy: zgięcie kolana = a + b, biodra = b + c, grzbietowe = a,
 * pochylenie tułowia = c.
 */
function sylwetkaZBoku(a: number, b: number, c: number, { widocznoscP = 0.3 } = {}) {
  const kostka = { x: 640, y: 620 };
  const kolano = { x: kostka.x + 180 * Math.sin(rad(a)), y: kostka.y - 180 * Math.cos(rad(a)) };
  const biodro = { x: kolano.x - 180 * Math.sin(rad(b)), y: kolano.y - 180 * Math.cos(rad(b)) };
  const bark = { x: biodro.x + 240 * Math.sin(rad(c)), y: biodro.y - 240 * Math.cos(rad(c)) };
  const ucho = { x: bark.x + 60 * Math.sin(rad(c)), y: bark.y - 60 * Math.cos(rad(c)) };
  const nos = { x: ucho.x + 25, y: ucho.y + 5 };
  const lokiec = { x: bark.x + 100, y: bark.y };
  const nadgarstek = { x: bark.x + 200, y: bark.y };
  const pieta = { x: kostka.x - 25, y: kostka.y + 15 };
  const palce = { x: kostka.x + 120, y: kostka.y + 15 };
  const px: Record<string, P> = {
    nose: nos, left_ear: ucho, right_ear: ucho, left_shoulder: bark, right_shoulder: bark,
    left_elbow: lokiec, right_elbow: lokiec, left_wrist: nadgarstek, right_wrist: nadgarstek,
    left_hip: biodro, right_hip: biodro, left_knee: kolano, right_knee: kolano,
    left_ankle: kostka, right_ankle: kostka, left_heel: pieta, right_heel: pieta,
    left_foot_index: palce, right_foot_index: palce,
  };
  return LANDMARKI.map((l) => {
    const q = px[l.id] ?? nos;
    const v = l.strona === "P" ? widocznoscP : 0.95;
    return { x: q.x / W, y: q.y / H, z: 0, visibility: v, presence: v };
  });
}

/** Ta sama sylwetka z przodu: barki 180 px, biodra 140 px szerokości, wszystko widoczne. */
function sylwetkaZPrzodu() {
  const punkty = sylwetkaZBoku(0, 0, 0, { widocznoscP: 0.95 });
  const przesun = (id: string, dx: number) => { punkty[INDEKS[id]] = { ...punkty[INDEKS[id]], x: punkty[INDEKS[id]].x + dx / W }; };
  for (const [czesc, pol] of [["shoulder", 90], ["elbow", 100], ["wrist", 100], ["hip", 70], ["knee", 70], ["ankle", 70], ["heel", 70], ["foot_index", 70]] as const) {
    przesun(`left_${czesc}`, pol);
    przesun(`right_${czesc}`, -pol);
  }
  return punkty;
}

const klatka = (punkty: ReturnType<typeof sylwetkaZBoku>, i = 0, t = 0) => klatkaZWyniku(i, t, punkty, null);
const okolo = (rzeczywista: number | undefined | null, oczekiwana: number, tol = 0.6) =>
  assert.ok(rzeczywista !== null && rzeczywista !== undefined && Math.abs(rzeczywista - oczekiwana) <= tol,
    `${rzeczywista} ≠ ${oczekiwana} (±${tol})`);

describe("szkielet MediaPipe", () => {
  test("33 punkty, unikalne identyfikatory, indeksy zgodne z MediaPipe", () => {
    assert.equal(LANDMARKI.length, 33);
    assert.equal(new Set(LANDMARKI.map((l) => l.id)).size, 33);
    assert.equal(INDEKS.nose, 0);
    assert.equal(INDEKS.left_shoulder, 11);
    assert.equal(INDEKS.left_hip, 23);
    assert.equal(INDEKS.right_foot_index, 32);
  });

  test("35 połączeń, wszystkie w zakresie, bez powtórzeń", () => {
    assert.equal(POLACZENIA.length, 35);
    const pary = new Set(POLACZENIA.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
    assert.equal(pary.size, 35);
    assert.ok(POLACZENIA.flat().every((i) => i >= 0 && i < 33));
  });

  test("główne punkty: głowa, barki, łokcie, nadgarstki, biodra, kolana, stawy skokowe", () => {
    assert.equal(GLOWNE_PUNKTY.length, 13);
    assert.equal(GLOWNE_PUNKTY[0], "glowa");
    for (const czesc of ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"]) {
      assert.ok(GLOWNE_PUNKTY.includes(`left_${czesc}`) && GLOWNE_PUNKTY.includes(`right_${czesc}`), czesc);
    }
  });

  test("głowa = środek uszu; z jednym uchem widocznym — to ucho; bez uszu — nos", () => {
    const punkty = LANDMARKI.map(() => ({ x: 0, y: 0, z: 0, v: 0.9 }));
    punkty[INDEKS.left_ear] = { x: 10, y: 20, z: 0, v: 0.9 };
    punkty[INDEKS.right_ear] = { x: 30, y: 40, z: 0, v: 0.9 };
    punkty[INDEKS.nose] = { x: 99, y: 99, z: 0, v: 0.9 };
    assert.deepEqual([rozwiazywacz(punkty)("glowa")!.x, rozwiazywacz(punkty)("glowa")!.y], [20, 30]);
    punkty[INDEKS.right_ear].v = 0.1;
    assert.equal(rozwiazywacz(punkty)("glowa")!.x, 10);
    punkty[INDEKS.left_ear].v = 0.1;
    assert.equal(rozwiazywacz(punkty)("glowa")!.x, 99);
  });
});

describe("kąty — konwencja kliniczna", () => {
  test("kąt w wierzchołku: prosty 90°, prosta linia 180°, punkt w punkcie — brak", () => {
    okolo(katPrzy({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }), 90, 1e-9);
    okolo(katPrzy({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }), 180, 1e-9);
    assert.equal(katPrzy({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 0 }), null);
  });

  test("stanie: zgięcia ~0°, tułów pionowo, głowa w linii tułowia", () => {
    const k = katyKlatki(klatka(sylwetkaZBoku(0, 0, 0)), WYMIARY)!;
    okolo(k.kolano_l!.wartosc, 0);
    okolo(k.biodro_l!.wartosc, 0);
    okolo(k.skokowy_l!.wartosc, 0);
    okolo(k.tulow!.wartosc, 0);
    okolo(k.glowa_tulow!.wartosc, 0);
  });

  test("przysiad: kolano = a + b, biodro = b + c, grzbietowe = a, tułów = c", () => {
    const k = katyKlatki(klatka(sylwetkaZBoku(30, 80, 40)), WYMIARY)!;
    okolo(k.kolano_l!.wartosc, 110);
    okolo(k.biodro_l!.wartosc, 120);
    okolo(k.skokowy_l!.wartosc, 30);
    okolo(k.tulow!.wartosc, 40);
  });

  test("proporcje obrazu: kąt liczony w pikselach, nie w 0–1 (inaczej 16:9 go zniekształca)", () => {
    // Udo pod 45° w pikselach; w liczbach 0–1 ten sam układ dałby ~29°.
    const k = katyKlatki(klatka(sylwetkaZBoku(0, 45, 0)), WYMIARY)!;
    okolo(k.kolano_l!.wartosc, 45);
  });

  test("łokieć: ręce wyprostowane w przód — zgięcie 0°, ramię względem tułowia 90°", () => {
    const k = katyKlatki(klatka(sylwetkaZBoku(0, 0, 0)), WYMIARY)!;
    okolo(k.lokiec_l!.wartosc, 0);
    okolo(k.ramie_l!.wartosc, 90);
  });

  test("głowa przed barkami: + gdy wysunięta w stronę patrzenia", () => {
    const punkty = sylwetkaZBoku(0, 0, 0);
    const k0 = katyKlatki(klatka(punkty), WYMIARY)!;
    okolo(k0.glowa_przod!.wartosc, 0, 0.1);
    // Uszy 24 px przed barkiem (tułów 240 px) → +10 %.
    for (const id of ["left_ear", "right_ear", "nose"]) punkty[INDEKS[id]].x += 24 / W;
    const k = katyKlatki(klatka(punkty), WYMIARY)!;
    okolo(k.glowa_przod!.wartosc, 10, 0.1);
    assert.ok(k.glowa_tulow!.wartosc > 5);
  });

  test("przechył linii barków i bioder: + gdy lewa strona niżej", () => {
    const punkty = sylwetkaZBoku(0, 0, 0);
    punkty[INDEKS.left_shoulder] = { ...punkty[INDEKS.left_shoulder], x: 540 / W, y: 300 / H };
    punkty[INDEKS.right_shoulder] = { ...punkty[INDEKS.right_shoulder], x: 740 / W, y: 300 / H, visibility: 0.9 };
    let k = katyKlatki(klatka(punkty), WYMIARY)!;
    okolo(k.barki_przechyl!.wartosc, 0);
    punkty[INDEKS.left_shoulder] = { ...punkty[INDEKS.left_shoulder], y: (300 + 200 * Math.tan(rad(10))) / H };
    k = katyKlatki(klatka(punkty), WYMIARY)!;
    okolo(k.barki_przechyl!.wartosc, 10);
  });

  test("pewność = najmniejsza widoczność użytych punktów; seria pomija niepewne", () => {
    const k = katyKlatki(klatka(sylwetkaZBoku(10, 10, 10)), WYMIARY)!;
    assert.equal(k.kolano_l!.pewnosc, 0.95);
    assert.equal(k.kolano_p!.pewnosc, 0.3);
    assert.deepEqual(seria([k], "kolano_p"), [null]);
    okolo(seria([k], "kolano_l")[0], 20);
  });

  test("stopa skierowana do kamery (ujęcie z przodu): kąt stawu skokowego niepewny, z powodem", () => {
    const punkty = sylwetkaZBoku(20, 20, 10);
    // Z przodu pięta i palce prawie w jednym miejscu obrazu.
    const kostka = punkty[INDEKS.left_ankle];
    punkty[INDEKS.left_heel] = { ...kostka, x: kostka.x - 3 / W, y: kostka.y + 12 / H };
    punkty[INDEKS.left_foot_index] = { ...kostka, x: kostka.x + 2 / W, y: kostka.y + 20 / H };
    const w = katyKlatki(klatka(punkty), WYMIARY)!.skokowy_l!;
    assert.ok(w.pewnosc < 0.5 && /kamery/.test(w.powod), JSON.stringify(w));
    assert.deepEqual(seria([katyKlatki(klatka(punkty), WYMIARY)!], "skokowy_l"), [null], "wykres go pomija");
  });

  test("ujęcie z boku i z przodu rozpoznane z proporcji barków i bioder do tułowia", () => {
    const zBoku = sylwetkaZBoku(0, 0, 0);
    assert.equal(ujecie(punktyWUkladzie(klatka(zBoku), WYMIARY, "2d")), "bok");
    const zPrzodu = sylwetkaZPrzodu();
    assert.equal(ujecie(punktyWUkladzie(klatka(zPrzodu), WYMIARY, "2d")), "przod");
    assert.equal(ujecieNagrania([klatka(zPrzodu), klatka(zPrzodu), klatka(zBoku)], WYMIARY), "przod");
  });

  test("kąt niewidoczny z danego ujęcia: niepewny, z powodem (stopa z przodu, przechył barków z boku)", () => {
    const zPrzodu = katyKlatki(klatka(sylwetkaZPrzodu()), WYMIARY)!;
    assert.ok(zPrzodu.skokowy_l!.pewnosc < 0.5 && /z przodu/.test(zPrzodu.skokowy_l!.powod), JSON.stringify(zPrzodu.skokowy_l));
    assert.ok(zPrzodu.barki_przechyl!.pewnosc >= 0.5, "z przodu przechył barków jest pewny");
    // Z boku barki prawie się nakrywają: 15 px w poziomie, 6 px w pionie.
    const bok = sylwetkaZBoku(20, 30, 10, { widocznoscP: 0.9 });
    bok[INDEKS.right_shoulder] = { ...bok[INDEKS.right_shoulder], x: bok[INDEKS.right_shoulder].x + 15 / W, y: bok[INDEKS.right_shoulder].y - 6 / H };
    const zBoku = katyKlatki(klatka(bok), WYMIARY)!;
    assert.ok(zBoku.barki_przechyl!.pewnosc < 0.5 && /z boku/.test(zBoku.barki_przechyl!.powod), JSON.stringify(zBoku.barki_przechyl));
    assert.ok(zBoku.skokowy_l!.pewnosc >= 0.5, "z boku zgięcie grzbietowe jest pewne");
    // 3D nie zależy od ujęcia kamery.
    const przod = sylwetkaZPrzodu();
    const swiat = przod.map((q) => ({ x: q.x, y: q.y, z: 0 }));
    const k3 = katyKlatki(klatkaZWyniku(0, 0, przod, swiat), WYMIARY, { uklad: "3d" })!;
    assert.ok(k3.skokowy_l && k3.skokowy_l.powod === undefined, JSON.stringify(k3.skokowy_l));
  });

  test("3D: kąty z punktów modelu (metry); miary względem obrazu — tylko w 2D", () => {
    const punkty = sylwetkaZBoku(0, 0, 0);
    const swiat = LANDMARKI.map(() => ({ x: 0, y: 0, z: 0 }));
    // Kolano zgięte 90° w głąb sceny — z boku obrazu tego nie widać.
    swiat[INDEKS.left_hip] = { x: 0, y: -0.4, z: 0 };
    swiat[INDEKS.left_knee] = { x: 0, y: 0, z: 0 };
    swiat[INDEKS.left_ankle] = { x: 0, y: 0, z: 0.4 };
    const k3 = katyKlatki(klatkaZWyniku(0, 0, punkty, swiat), WYMIARY, { uklad: "3d" })!;
    okolo(k3.kolano_l!.wartosc, 90);
    assert.equal(k3.glowa_przod, null);
    assert.equal(k3.barki_przechyl, null);
    assert.equal(katyKlatki(klatka(punkty), WYMIARY, { uklad: "3d" }), null, "bez punktów 3D — brak kątów 3D");
  });

  test("każda definicja kąta ma nazwę i opis", () => {
    for (const k of KATY) assert.ok(k.nazwa && k.opis, k.id);
  });
});

/** Dwa przysiady w 6 s, 30 kl./s; między nimi stanie. */
function sesjaPrzysiadow({ szum = 0 } = {}) {
  const sesja = nowaSesja({ cwiczenie: "przysiad", wideo: { nazwa: "test.webm", szerokosc: W, wysokosc: H, czasTrwania: 6000 }, analiza: { fps: 30 } });
  let ziarno = 7;
  const los = () => ((ziarno = (ziarno * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let i = 0; i <= 180; i++) {
    const t = (i / 30) * 1000;
    const s = t < 500 ? 0 : t < 2500 ? Math.sin(Math.PI * (t - 500) / 2000) : t < 3500 ? 0 : t < 5500 ? Math.sin(Math.PI * (t - 3500) / 2000) : 0;
    const g = Math.max(0, s + szum * los());
    sesja.klatki.push(klatkaZWyniku(i, t, sylwetkaZBoku(30 * g, 80 * g, 40 * g), null));
  }
  return sesja;
}

describe("ruch w czasie", () => {
  test("klatka najbliższa czasowi", () => {
    const klatki = [{ t: 0 }, { t: 33.3 }, { t: 66.7 }, { t: 100 }];
    assert.equal(klatkaDlaCzasu(klatki, 0), 0);
    assert.equal(klatkaDlaCzasu(klatki, 40), 1);
    assert.equal(klatkaDlaCzasu(klatki, 55), 2);
    assert.equal(klatkaDlaCzasu(klatki, 9999), 3);
    assert.equal(klatkaDlaCzasu([], 10), -1);
  });

  test("klatka widoczna w chwili: ostatnia, która już się zaczęła", () => {
    const klatki = [{ t: 0 }, { t: 41.7 }, { t: 83.4 }];
    assert.equal(klatkaWChwili(klatki, 0), 0);
    assert.equal(klatkaWChwili(klatki, 41), 0, "do 41,7 ms film pokazuje jeszcze klatkę 0");
    assert.equal(klatkaWChwili(klatki, 41.7), 1);
    assert.equal(klatkaWChwili(klatki, 500), 2);
    assert.equal(klatkaWChwili([{ t: 10 }], 0), -1);
  });

  test("przewinięcie na klatkę: z odtwarzania w środek klatki, z przewijania dokładnie w jej czas", () => {
    const klatki = [{ t: 0 }, { t: 41.7 }, { t: 83.4 }];
    okolo(chwilaKlatki({ klatki, analiza: { tryb: "odtwarzanie" } }, 1), 62.55, 0.01);
    okolo(chwilaKlatki({ klatki, analiza: { tryb: "odtwarzanie" } }, 2), 104.25, 0.01);
    assert.equal(chwilaKlatki({ klatki, analiza: { tryb: "przewijanie" } }, 1), 41.7);
    assert.equal(chwilaKlatki({ klatki }, 1), 41.7, "stary zapis bez trybu — jak przewijanie");
  });

  test("luki: krótkie wypełnione liniowo, długie zostają", () => {
    assert.deepEqual(wypelnijLuki([0, null, null, 30]), [0, 10, 20, 30]);
    assert.deepEqual(wypelnijLuki([0, null, null, null, 4], 2), [0, null, null, null, 4]);
    assert.deepEqual(wypelnijLuki([null, 1, null]), [null, 1, null]);
    assert.deepEqual(wygladz([0, 3, 6], 3), [1.5, 3, 4.5]);
  });

  test("trajektoria biodra i zakres ruchu w pikselach", () => {
    const sesja = sesjaPrzysiadow();
    const traj = trajektoria(sesja, "left_hip");
    assert.equal(traj.length, sesja.klatki.length);
    const z = zakresRuchu(traj)!;
    // Stanie: biodro 360 px nad kostką; dół: 180·cos30 + 180·cos80 ≈ 187 px.
    okolo(z.pionowo, 360 - (180 * Math.cos(rad(30)) + 180 * Math.cos(rad(80))), 1);
    assert.ok(z.poziomo > 50);
    assert.ok(trajektoria(sesja, "glowa").every((q) => q !== null));
  });

  test("dwa przysiady → dwa powtórzenia, dół w środku każdego", () => {
    const sesja = sesjaPrzysiadow({ szum: 0.03 });
    const katy = katySesji(sesja);
    const powt = wykryjPowtorzenia(seria(katy, "kolano_l"), { minAmplituda: 30 });
    assert.equal(powt.length, 2);
    okolo(sesja.klatki[powt[0].szczyt].t, 1500, 120);
    okolo(sesja.klatki[powt[1].szczyt].t, 4500, 120);
    assert.ok(powt[0].poczatek < powt[0].szczyt && powt[0].szczyt < powt[0].koniec);
    assert.ok(powt[0].koniec <= powt[1].poczatek);
  });

  test("wahanie przy progu w trakcie zejścia — jedno powtórzenie, nie dwa (histereza)", () => {
    // Zejście staje na chwilę ponad progiem wejścia (60 % zakresu), cofa się
    // poniżej niego, ale nie do progu wyjścia (30 %), i idzie dalej w dół.
    const sygnal = [
      ...Array(15).fill(0), 20, 40, ...Array(6).fill(70), ...Array(6).fill(50), ...Array(6).fill(70),
      85, ...Array(15).fill(100), 80, 50, 20, ...Array(15).fill(0),
    ];
    assert.equal(wykryjPowtorzenia(sygnal, { minAmplituda: 25 }).length, 1);
  });

  test("samo stanie z drżeniem — zero powtórzeń", () => {
    const drzenie = Array.from({ length: 120 }, (_, i) => 5 + 3 * Math.sin(i));
    assert.deepEqual(wykryjPowtorzenia(drzenie, { minAmplituda: 25 }), []);
  });

  test("profil przysiadu: powtórzenia z boku bliżej kamery i podsumowanie każdego", () => {
    const sesja = sesjaPrzysiadow();
    const katy = katySesji(sesja);
    assert.equal(stronaBlizejKamery(sesja.klatki), "L");
    const profil = PROFIL.przysiad;
    const powt = powtorzeniaProfilu(profil, katy, "L");
    const podsumowanie = profil.podsumowanie(sesja, katy, "L", powt);
    assert.equal(podsumowanie.length, 2);
    const p = podsumowanie[0];
    okolo(p.kolanoMaks.wartosc, 110, 1);
    okolo(p.biodroMaks.wartosc, 120, 1);
    okolo(p.skokowyMaks.wartosc, 30, 1);
    okolo(p.tulowMaks.wartosc, 40, 1);
    // Biodro nad kolanem o 180·cos80° ≈ 31 px przy udzie 180 px → ≈ −17 %.
    okolo(p.glebokosc, -100 * Math.cos(rad(80)), 1);
    assert.ok(p.zejscie > 0.5 && p.wstawanie > 0.5, `${p.zejscie} / ${p.wstawanie}`);
    // Profil „inne ćwiczenie” nie liczy powtórzeń.
    assert.deepEqual(powtorzeniaProfilu(PROFIL.ogolny, katy, "L"), []);
  });
});

describe("zapis sesji", () => {
  test("klatka z wyniku MediaPipe: 33 × 5 liczb, zaokrąglone; bez sylwetki — null", () => {
    const k = klatkaZWyniku(3, 100.04, sylwetkaZBoku(0, 0, 0), null);
    assert.equal(k.p!.length, 33);
    assert.equal(k.p![0].length, 5);
    assert.equal(k.t, 100);
    assert.ok(String(k.p![23][0]).split(".")[1]!.length <= 5);
    assert.equal(klatkaZWyniku(4, 133, [], null).p, null);
    assert.equal(klatkaZWyniku(4, 133, undefined, undefined).p, null);
  });

  test("JSON tam i z powrotem; obcy plik i zła liczba punktów — czytelny błąd", () => {
    const sesja = sesjaPrzysiadow();
    const wczytana = zJSON(doJSON(sesja));
    assert.deepEqual(wczytana.klatki[50], sesja.klatki[50]);
    assert.deepEqual(wczytana.landmarki, LANDMARKI.map((l) => l.id));
    assert.throws(() => zJSON("{nie json"), BladSesji);
    assert.throws(() => zJSON(JSON.stringify({ format: "inny" })), /nie jest plik analizy/);
    const zepsuta = JSON.parse(doJSON(sesja));
    zepsuta.klatki[0].p = zepsuta.klatki[0].p.slice(0, 17);
    assert.throws(() => zJSON(JSON.stringify(zepsuta)), /33 punktów/);
  });

  test("CSV: klatka w wierszu, czas, główne punkty w pikselach i kąty; średnik i przecinek", () => {
    const sesja = sesjaPrzysiadow();
    const csv = doCSV(sesja).trim().split("\r\n");
    assert.equal(csv.length, sesja.klatki.length + 1);
    const naglowek = csv[0]!.split(";");
    assert.deepEqual(naglowek.slice(0, 5), ["klatka", "t_ms", "glowa_x_px", "glowa_y_px", "glowa_widocznosc"]);
    assert.ok(naglowek.includes("left_knee_y_px") && naglowek.includes("kolano_l_st") && naglowek.includes("glowa_przod_proc"));
    const dol = csv[46]!.split(";");   // klatka 45 = 1,5 s — dół pierwszego przysiadu
    okolo(Number(dol[naglowek.indexOf("kolano_l_st")]!.replace(",", ".")), 110, 1);
    assert.ok(csv[1]!.includes(","), "przecinek dziesiętny");
  });

  test("sugerowana pozycja: jedna na punkt i klatkę, liczy skutek dla kątów, da się usunąć", () => {
    const sesja = sesjaPrzysiadow();
    const dol = 45;
    const biodro = sesja.klatki[dol].p![INDEKS.left_hip];
    // Biodro przesunięte w tył (−x) — tułów i biodro bardziej pochylone.
    const s = ustawSugestie(sesja, { klatka: dol, punkt: "left_hip", x: biodro[0] - 40 / W, y: biodro[1] });
    ustawSugestie(sesja, { klatka: dol, punkt: "left_hip", x: biodro[0] - 60 / W, y: biodro[1] });
    assert.equal(sesja.sugestie.length, 1, "druga sugestia tego samego punktu przesuwa pierwszą");
    assert.equal(sesja.sugestie[0].t, sesja.klatki[dol].t);
    assert.equal(sesja.sugestie[0].autor, "trener");
    const skutek = skutekSugestii(sesja, dol);
    const kolano = skutek.find((r) => r.id === "kolano_l")!;
    assert.ok(kolano && kolano.po !== kolano.przed, "zmiana biodra rusza kąt kolana");
    assert.ok(skutek.find((r) => r.id === "biodro_l"));
    assert.deepEqual(skutekSugestii(sesja, 0), [], "inna klatka — bez skutku");
    // Zapis i odczyt zachowuje sugestię.
    assert.equal(zJSON(doJSON(sesja)).sugestie[0].punkt, "left_hip");
    usunSugestie(sesja, s.id);
    assert.equal(sesja.sugestie.length, 0);
  });

  test("punkty klatki: 13 głównych, z opcją wszystkich 33 (+ głowa)", () => {
    const k = klatka(sylwetkaZBoku(0, 0, 0));
    assert.equal(punktyKlatki(k, WYMIARY).length, 13);
    assert.equal(punktyKlatki(k, WYMIARY, { wszystkie: true }).length, 34);
    const bark = punktyKlatki(k, WYMIARY).find((q) => q.id === "left_shoulder")!;
    okolo(bark.x, 640, 0.5);
  });
});

describe("punkty na obrazie — wybór trenera (23.10.2026)", () => {
  // Trener: „chciałbym móc obserwować tylko punkty po prawej stronie bez lewej”.
  test("każdy z 33 punktów należy do jednego z głównych: twarz → głowa, palce → nadgarstek, stopa → staw skokowy", () => {
    assert.deepEqual(
      ["nose", "left_eye", "right_ear", "mouth_left", "right_thumb", "left_index", "right_pinky",
        "left_foot_index", "right_heel", "left_knee", "glowa"].map(grupaPunktu),
      ["glowa", "glowa", "glowa", "glowa", "right_wrist", "left_wrist", "right_wrist",
        "left_ankle", "right_ankle", "left_knee", "glowa"]);
    for (const l of LANDMARKI) assert.ok(GLOWNE_PUNKTY.includes(grupaPunktu(l.id)), l.id);
  });

  test("„tylko prawa” chowa sześć punktów lewej strony, głowa zostaje", () => {
    assert.deepEqual([...ukryteBezStrony("P")].sort(),
      ["left_ankle", "left_elbow", "left_hip", "left_knee", "left_shoulder", "left_wrist"]);
    assert.ok([...ukryteBezStrony("L")].every((id) => id.startsWith("right_")));
    assert.equal(ukryteBezStrony(null).size, 0);
    // Lewe oko i ucho znikają razem z lewą stroną, ale nie przy schowanym jednym kolanie.
    assert.equal(punktWidoczny("left_eye", ukryteBezStrony("P")), false);
    assert.equal(punktWidoczny("right_eye", ukryteBezStrony("P")), true);
    assert.equal(punktWidoczny("left_eye", new Set(["left_knee"])), true);
    assert.equal(punktWidoczny("left_heel", new Set(["left_ankle"])), false);
    assert.equal(punktWidoczny("nose", new Set(["glowa"])), false);
  });

  /** Płótno, które zapisuje, co i jakim kolorem zostało narysowane. */
  function plotno() {
    const stan: Record<string, any> = { canvas: { width: W, height: H } };
    const kropki: { x: number; y: number; kolor: string }[] = [];
    const odcinki: { x: number; y: number }[][] = [];
    const kolory: string[] = [];
    const napisy: string[] = [];
    let start: { x: number; y: number } | null = null;
    const ctx = new Proxy(stan, {
      get(cel, nazwa: string) {
        if (nazwa in cel) return cel[nazwa];
        if (nazwa === "measureText") return () => ({ width: 20 });
        if (nazwa === "arc") return (x: number, y: number) => kropki.push({ x, y, kolor: cel.fillStyle });
        if (nazwa === "moveTo") return (x: number, y: number) => { start = { x, y }; };
        if (nazwa === "lineTo") return (x: number, y: number) => { odcinki.push([start!, { x, y }]); kolory.push(cel.strokeStyle); };
        if (nazwa === "fillText") return (tekst: string) => napisy.push(tekst);
        return () => {};
      },
      set(cel, nazwa: string, wartosc) { cel[nazwa] = wartosc; return true; },
    });
    return { ctx, kropki, odcinki, napisy, kolory };
  }

  const k = klatka(sylwetkaZPrzodu());
  const naObrazie = (id: string) => ({ x: k.p[INDEKS[id]][0] * W, y: k.p[INDEKS[id]][1] * H });
  // Lewe punkty z własnym miejscem — w sztucznej sylwetce uszy, oczy i usta obu stron leżą w jednym.
  const inne = LANDMARKI.filter((l) => l.strona !== "L").map((l) => naObrazie(l.id));
  const lewe = LANDMARKI.filter((l) => l.strona === "L").map((l) => naObrazie(l.id))
    .filter((q) => !inne.some((r) => Math.hypot(q.x - r.x, q.y - r.y) < 0.5));
  const dotyka = (o: { x: number; y: number }[]) => o.some((q) => lewe.some((l) => Math.hypot(q.x - l.x, q.y - l.y) < 0.5));

  test("tylko prawa strona: bez pomarańczowych kropek i bez linii do lewej strony — także przy 33 punktach", () => {
    const bez = plotno();
    rysujKlatke(bez.ctx, { klatka: k, wszystkie: true });
    assert.ok(bez.kropki.some((q) => q.kolor === KOLORY.L), "kontrola: bez wyboru lewa strona jest");
    assert.ok(bez.odcinki.some(dotyka), "kontrola: bez wyboru linie idą do lewej strony");

    const prawa = plotno();
    rysujKlatke(prawa.ctx, { klatka: k, wszystkie: true, ukryte: ukryteBezStrony("P") });
    assert.equal(prawa.kropki.filter((q) => q.kolor === KOLORY.L).length, 0);
    assert.ok(prawa.kropki.filter((q) => q.kolor === KOLORY.P).length >= 6 + 6, "prawe główne + palce i stopa");
    assert.ok(prawa.kropki.some((q) => q.kolor === KOLORY.srodek), "głowa zostaje");
    assert.ok(lewe.length >= 8);
    assert.ok(!prawa.odcinki.some(dotyka), "żadna linia nie dochodzi do lewej strony");
    assert.ok(prawa.odcinki.length > 5, "prawa strona ma swój szkielet");
  });

  test("kąt na obrazie tylko przy widocznym stawie; schowany punkt nie łapie się pod palcem", () => {
    const katy = katyKlatki(k, WYMIARY);
    const lewa = plotno();
    rysujKlatke(lewa.ctx, { klatka: k, katy, strona: "L", ukryte: ukryteBezStrony("P") });
    assert.equal(lewa.napisy.length, 0, "kąty lewej strony przy schowanej lewej — bez etykiet");
    const prawa = plotno();
    rysujKlatke(prawa.ctx, { klatka: k, katy, strona: "P", ukryte: ukryteBezStrony("P") });
    assert.ok(prawa.napisy.length > 0);

    const kolano = naObrazie("left_knee");
    assert.equal(punktPodPalcem(k, kolano.x, kolano.y, W, H), "left_knee");
    assert.equal(punktPodPalcem(k, kolano.x, kolano.y, W, H, { ukryte: ukryteBezStrony("P") }), null);
  });

  test("trajektoria schowanego punktu nie rysuje się na obrazie, reszta tak (23.10.2026)", () => {
    // Trener: „jeżeli któryś z tych punktów nie jest oznaczony, np. bark, to nie
    // wyświetla się jego trajektoria — wyświetlają się tylko te, które mają swój punkt”.
    const droga = [{ x: 0.4, y: 0.3 }, { x: 0.42, y: 0.35 }, { x: 0.44, y: 0.4 }];
    const trajektorie = [
      { id: "right_shoulder", kolor: "#9085e9", punkty: droga, biezacy: 2 },
      { id: "right_hip", kolor: "#1baf7a", punkty: droga, biezacy: 2 },
    ];
    const wszystkie = plotno();
    rysujKlatke(wszystkie.ctx, { klatka: k, trajektorie });
    assert.ok(wszystkie.kolory.includes("#9085e9") && wszystkie.kolory.includes("#1baf7a"), "kontrola: obie drogi są");
    const bezBarku = plotno();
    rysujKlatke(bezBarku.ctx, { klatka: k, trajektorie, ukryte: new Set(["right_shoulder"]) });
    assert.ok(!bezBarku.kolory.includes("#9085e9"), "droga barku zniknęła");
    assert.ok(bezBarku.kolory.includes("#1baf7a"), "droga biodra została");
  });
});

describe("środek ciężkości — metoda segmentowa (23.10.2026)", async () => {
  // Trener: „dodajmy możliwość analizy środka ciężkości metodą segmentową —
  // De Leva razem z rozróżnieniem na płeć, plus wygładzenie trajektorii”.
  const { MODELE_SRODKA, masaModelu, sredniaWazona, srodekKlatki, srodekSesji, wygladzTrajektorie, wzgledemStop } =
    await import("../public/ruch/srodek.js");

  test("modele: de Leva (K, M) i Braune–Fischer dają razem 100% masy ciała", () => {
    okolo(masaModelu("deleva-m"), 100, 0.011);
    okolo(masaModelu("deleva-k"), 100, 0.011);
    okolo(masaModelu("braune-fischer"), 100, 0.001);
    // Kobiety i mężczyźni się różnią — np. udo: 14,78% vs 14,16% masy, środek 36% vs 41% długości.
    assert.deepEqual(MODELE_SRODKA["deleva-k"].udo, [14.78, 0.3612]);
    assert.deepEqual(MODELE_SRODKA["deleva-m"].udo, [14.16, 0.4095]);
  });

  test("średnia ważona jak w pracy magisterskiej (Ryc. 7–8): Xc 3,69, Yc 4,84", () => {
    const x = [5.64, 2.44, 6.08, 8.72, 10.88, 3.16, 4.28, 3.32];
    const y = [7.80, 5.16, 6.40, 5.72, 5.72, 4.04, 3.48, 0.80];
    const masa = [7, 43, 6, 4, 2, 24, 10, 4];
    const w = sredniaWazona(x.map((xi, i) => ({ x: xi, y: y[i]!, masa: masa[i]! })))!;
    okolo(w.x, 3.6944, 0.0001);
    okolo(w.y, 4.8416, 0.0001);
  });

  test("z boku: jedna strona liczona podwójnie, druga (zgadywana) nie ma wpływu", () => {
    const punkty = sylwetkaZBoku(20, 60, 30);   // prawa strona słabo widoczna (0,3)
    const w = srodekKlatki(klatka(punkty), WYMIARY, { model: "deleva-m", konczyny: "L" })!;
    const kon = w.segmenty.filter((q: any) => q.strona);
    assert.ok(kon.every((q: any) => q.strona === "L") && kon.length === 6);
    okolo(kon.find((q: any) => q.id === "udo").masa, 2 * 14.16, 1e-9);
    okolo(w.segmenty.reduce((s: number, q: any) => s + q.masa, 0), 100, 0.011);
    // Prawa strona w zupełnie innym miejscu — wynik ten sam.
    const zepsute = punkty.map((q, i) => (LANDMARKI[i]!.strona === "P" ? { ...q, x: 0.05, y: 0.05 } : q));
    const w2 = srodekKlatki(klatka(zepsute), WYMIARY, { model: "deleva-m", konczyny: "L" })!;
    okolo(w2.x, w.x, 1e-6);
    okolo(w2.y, w.y, 1e-6);
    assert.equal(w.pewny, true);
    // Obie strony przy słabo widocznej prawej — ponad 10% masy niepewne.
    const obie = srodekKlatki(klatka(punkty), WYMIARY, { model: "deleva-m", konczyny: "obie" })!;
    assert.equal(obie.pewny, false);
  });

  test("środek uda u de Levy: 40,95% (M) i 36,12% (K) długości od biodra", () => {
    const k = klatka(sylwetkaZBoku(10, 50, 20));
    const p = (id: string) => ({ x: k.p![INDEKS[id]][0] * W, y: k.p![INDEKS[id]][1] * H });
    for (const [model, u] of [["deleva-m", 0.4095], ["deleva-k", 0.3612]] as const) {
      const udo = srodekKlatki(k, WYMIARY, { model, konczyny: "L" })!.segmenty.find((q: any) => q.id === "udo");
      okolo(udo.x, p("left_hip").x + (p("left_knee").x - p("left_hip").x) * u, 1e-6);
      okolo(udo.y, p("left_hip").y + (p("left_knee").y - p("left_hip").y) * u, 1e-6);
    }
  });

  test("nad stopą: pięta 0%, palce 100% — tak samo przy osobie zwróconej w lewo", () => {
    const punkty = sylwetkaZBoku(25, 70, 35);
    const k = klatka(punkty);
    const w = srodekKlatki(k, WYMIARY, { model: "deleva-k", konczyny: "L" })!;
    const pieta = k.p![INDEKS.left_heel][0] * W;
    const palce = k.p![INDEKS.left_foot_index][0] * W;
    okolo(wzgledemStop(w)!, ((w.x - pieta) / (palce - pieta)) * 100, 1e-6);
    // Lustro (osoba zwrócona w drugą stronę) — ten sam wynik, z dokładnością do zaokrągleń zapisu.
    const lustro = punkty.map((q) => ({ ...q, x: 1 - q.x }));
    const wL = srodekKlatki(klatka(lustro), WYMIARY, { model: "deleva-k", konczyny: "L" })!;
    okolo(wzgledemStop(wL)!, wzgledemStop(w)!, 0.01);
  });

  test("z przodu: między stopami — lewa 0%, prawa 100%", () => {
    const k = klatka(sylwetkaZPrzodu());
    const w = srodekKlatki(k, WYMIARY, { model: "deleva-m", konczyny: "obie" })!;
    const lewa = k.p![INDEKS.left_ankle][0] * W;
    const prawa = k.p![INDEKS.right_ankle][0] * W;
    okolo(wzgledemStop(w)!, ((w.x - lewa) / (prawa - lewa)) * 100, 1e-6);
  });

  test("obciążenie: tyle samo kg na barkach co masa ciała — środek w połowie drogi do barku", () => {
    const k = klatka(sylwetkaZBoku(25, 70, 35));
    const bez = srodekKlatki(k, WYMIARY, { model: "deleva-m", konczyny: "L" })!;
    const z = srodekKlatki(k, WYMIARY, { model: "deleva-m", konczyny: "L",
      obciazenie: { kg: 70, masaCiala: 70, miejsce: "barki" } })!;
    const bark = { x: k.p![INDEKS.left_shoulder][0] * W, y: k.p![INDEKS.left_shoulder][1] * H };
    okolo(z.x, (bez.x + bark.x) / 2, 1e-6);
    okolo(z.y, (bez.y + bark.y) / 2, 1e-6);
    const bezMasy = srodekKlatki(k, WYMIARY, { model: "deleva-m", konczyny: "L", obciazenie: { kg: 70, miejsce: "barki" } })!;
    okolo(bezMasy.x, bez.x, 1e-9);   // bez masy ciała nie da się doliczyć — wynik bez obciążenia
  });

  test("wygładzanie: stała bez zmian, 1 Hz zostaje, 12 Hz znika, bez przesunięcia w czasie", () => {
    assert.ok(wygladzTrajektorie(Array(40).fill(5), 30).every((v: number) => Math.abs(v - 5) < 1e-9));
    const fps = 60;
    const czysty = Array.from({ length: 180 }, (_, i) => Math.sin((2 * Math.PI * i) / fps));
    const zSzumem = czysty.map((v, i) => v + 0.5 * Math.sin((2 * Math.PI * 12 * i) / fps));
    const g = wygladzTrajektorie(zSzumem, fps);
    const blad = Math.max(...g.slice(15, -15).map((v: number, i: number) => Math.abs(v - czysty[i + 15]!)));
    assert.ok(blad < 0.1, `największy błąd ${blad}`);
    const szczyt = (s: number[]) => s.slice(60, 120).indexOf(Math.max(...s.slice(60, 120)));
    assert.ok(Math.abs(szczyt(g) - szczyt(czysty)) <= 1, "szczyt w tym samym miejscu");
  });

  test("wygładzanie: krótka luka wypełniona, długa zostaje pusta; za krótkie — bez zmian", () => {
    const s = Array.from({ length: 60 }, (_, i) => i);
    const zLukami = s.map((v, i) => ((i >= 10 && i < 13) || (i >= 30 && i < 50) ? null : v));
    const g = wygladzTrajektorie(zLukami, 30);
    assert.ok(g.slice(10, 13).every((v: number | null) => v !== null));
    assert.ok(g.slice(30, 50).every((v: number | null) => v === null));
    assert.deepEqual(wygladzTrajektorie([1, null, 3], 30), [1, null, 3]);
  });

  test("całe nagranie: serie pełne i wygładzone tej samej długości, niepewne klatki puste", () => {
    const sesja = sesjaPrzysiadow();
    const s = srodekSesji(sesja, { model: "deleva-k", konczyny: "L", fps: 30 });
    assert.equal(s.wzgledem.length, sesja.klatki.length);
    assert.equal(s.wzgledemGladkie.length, sesja.klatki.length);
    assert.ok(s.wzgledem.some((v: number | null) => v !== null));
    const bez = srodekSesji(sesja, { model: "deleva-k", konczyny: "L", wygladzanie: false });
    assert.deepEqual(bez.wzgledemGladkie, bez.wzgledem);
  });

  test("zapis: ustawienia w JSON wracają po wczytaniu, CSV dostaje kolumny środka ciężkości", () => {
    const sesja = sesjaPrzysiadow();
    const bezModelu = doCSV(sesja).split("\r\n")[0]!;
    assert.ok(!bezModelu.includes("srodek"));
    sesja.srodekCiezkosci = { model: "deleva-k", konczyny: "L", wygladzanie: true, obciazenieKg: 0, miejsce: "barki", masaCiala: null };
    const wczytana = zJSON(doJSON(sesja));
    assert.deepEqual(wczytana.srodekCiezkosci, sesja.srodekCiezkosci);
    const [naglowek, ...wiersze] = doCSV(sesja).trim().split("\r\n");
    // Pięć kolumn środka ciężkości za kątami — jak w pierwszej wersji; od 24.10.2026 dalej wyniki osobno.
    const kolumny = naglowek!.split(";");
    const n = kolumny.indexOf("srodek_ciezkosci_pewny");
    assert.deepEqual(kolumny.slice(n - 2, n + 3), ["srodek_ciezkosci_x_px", "srodek_ciezkosci_y_px", "srodek_ciezkosci_pewny",
      "srodek_wzgledem_stop_proc", "srodek_wzgledem_stop_proc_wygladzony"]);
    assert.ok(wiersze.every((w) => w.split(";").length === kolumny.length));
    assert.ok(wiersze.some((w) => { const k = w.split(";"); return k[n] === "1" && /^-?\d+(,\d)?$/.test(k[n + 1]!) && /^-?\d+(,\d)?$/.test(k[n + 2]!); }),
      "pewna klatka z wartościami w %");
  });
});

describe("najgłębszy punkt powtórzenia (23.10.2026)", async () => {
  // Trener: „w pracy magisterskiej sczytywałem zakresy w stawach w najgłębszym
  // momencie przysiadu” — klatka, w której biodro (krętarz) jest najniżej.
  const { najglebszaKlatka } = await import("../public/ruch/profile.js");

  test("klatka z biodrem najniżej na obrazie; przy słabo widocznym biodrze tej strony — druga strona", () => {
    const sesja = sesjaPrzysiadow();
    const p = { poczatek: 0, szczyt: 0, koniec: sesja.klatki.length - 1 };
    const y = (i: number, id: string) => sesja.klatki[i]!.p![INDEKS[id]][1];
    const i = najglebszaKlatka(sesja, WYMIARY, p, "L");
    assert.ok(sesja.klatki.every((_k: unknown, j: number) => y(j, "left_hip") <= y(i, "left_hip")));
    // Lewe biodro niewidoczne w każdej klatce — liczy się prawe.
    const bezLewego = { ...sesja, klatki: sesja.klatki.map((k: any) => ({ ...k,
      p: k.p.map((q: number[], n: number) => (n === INDEKS.left_hip ? [q[0], 0.01, q[2], 0.1, 0.1] : q)) })) };
    const j = najglebszaKlatka(bezLewego, WYMIARY, p, "L");
    assert.ok(sesja.klatki.every((_k: unknown, n: number) => y(n, "right_hip") <= y(j, "right_hip")));
  });
});

/* ── punkt sztangi (24.10.2026) ─────────────────────────────────── */
// Trener (badanie do doktoratu: high bar bez wskazówki, high bar ze wskazówką,
// low bar, kamera z boku): „rozbuduj moduł o punkt sztangi, który zastąpi
// obecne liczenie obciążenia w punkcie barku”.

/**
 * Sztuczny obraz: nieruchome ziarniste tło i znacznik jak koniec gryfu
 * z naklejką (różowy środek, czarny pierścień, jasny brzeg) o środku w (cx, cy).
 * `zaslonieta` — bez znacznika (gryf zasłonięty).
 */
const OBRAZ = { szerokosc: 480, wysokosc: 360 };
const tloObrazu = (() => {
  let ziarno = 11;
  const los = () => ((ziarno = (ziarno * 16807) % 2147483647) / 2147483647);
  const d = new Uint8ClampedArray(OBRAZ.szerokosc * OBRAZ.wysokosc * 4);
  for (let i = 0; i < OBRAZ.szerokosc * OBRAZ.wysokosc; i++) {
    const v = 85 + 50 * los();
    d.set([v, v, v + 8, 255], i * 4);
  }
  return d;
})();
function obrazZeZnacznikiem(cx: number, cy: number, { zaslonieta = false } = {}) {
  const d = new Uint8ClampedArray(tloObrazu);
  if (!zaslonieta) {
    for (let y = Math.floor(cy - 15); y <= cy + 15; y++) {
      for (let x = Math.floor(cx - 15); x <= cx + 15; x++) {
        const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (r > 14 || x < 0 || y < 0 || x >= OBRAZ.szerokosc || y >= OBRAZ.wysokosc) continue;
        d.set(r < 6 ? [235, 40, 200] : r < 10 ? [20, 20, 20] : [210, 210, 210], (y * OBRAZ.szerokosc + x) * 4);
      }
    }
  }
  return {
    ...OBRAZ,
    wytnij: (x0: number, y0: number, w: number, h: number) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) data.set(d.subarray(((y0 + y) * OBRAZ.szerokosc + x0) * 4, ((y0 + y) * OBRAZ.szerokosc + x0 + w) * 4), y * w * 4);
      return { data, width: w, height: h };
    },
  };
}
/** Tor znacznika: w dół i w górę z lekkim kołysaniem — jak koniec gryfu w przysiadzie. */
const torZnacznika = Array.from({ length: 50 }, (_, i) => ({
  x: 220 + 14 * Math.sin(i / 7) + 0.37 * i,
  y: 70 + 160 * Math.sin((i / 49) * Math.PI),
}));

describe("punkt sztangi — śledzenie na obrazie (24.10.2026)", async () => {
  const { sledzSekwencje, utworzSledzenie, punktDoZapisu, punktySztangi, podsumowanieSledzenia, nastepnyPunktKontrolny,
    TRYBY_SLEDZENIA } = await import("../public/ruch/sztanga.js");

  test("wzór obrazu: znacznik przesuwany po obrazie śledzony z błędem poniżej 1 px, każda klatka pewna", () => {
    const obrazy = torZnacznika.map((q) => obrazZeZnacznikiem(q.x, q.y));
    const w = sledzSekwencje(obrazy, { tryb: "wzorzec", x: torZnacznika[0]!.x, y: torZnacznika[0]!.y });
    const bledy = w.map((q: any, i: number) => Math.hypot(q.x - torZnacznika[i]!.x, q.y - torZnacznika[i]!.y));
    assert.ok(Math.max(...bledy) < 1, `największy błąd ${Math.max(...bledy).toFixed(2)} px`);
    assert.ok(w.every((q: any) => q.pewny && q.pewnosc >= TRYBY_SLEDZENIA.wzorzec.prog));
  });

  test("naklejka: punkt na środku naklejki (także przy dotknięciu obok), błąd poniżej 0,5 px", () => {
    const obrazy = torZnacznika.map((q) => obrazZeZnacznikiem(q.x, q.y));
    const w = sledzSekwencje(obrazy, { tryb: "naklejka", x: torZnacznika[0]!.x + 3, y: torZnacznika[0]!.y - 2 });
    const bledy = w.map((q: any, i: number) => Math.hypot(q.x - torZnacznika[i]!.x, q.y - torZnacznika[i]!.y));
    assert.ok(Math.max(...bledy) < 0.5, `największy błąd ${Math.max(...bledy).toFixed(2)} px`);
    assert.ok(w.every((q: any) => q.pewny));
  });

  test("gryf zasłonięty przez kilka klatek: te klatki „?” (niepewne), potem punkt wraca na znacznik", () => {
    for (const tryb of ["wzorzec", "naklejka"]) {
      const obrazy = torZnacznika.map((q, i) => obrazZeZnacznikiem(q.x, q.y, { zaslonieta: i >= 20 && i < 23 }));
      const w = sledzSekwencje(obrazy, { tryb, x: torZnacznika[0]!.x, y: torZnacznika[0]!.y });
      assert.deepEqual(w.map((q: any, i: number) => (q.pewny ? null : i)).filter((i: number | null) => i !== null), [20, 21, 22], tryb);
      const poPowrocie = w.slice(23).map((q: any, i: number) => Math.hypot(q.x - torZnacznika[i + 23]!.x, q.y - torZnacznika[i + 23]!.y));
      assert.ok(Math.max(...poPowrocie) < 1, `${tryb}: po powrocie błąd ${Math.max(...poPowrocie).toFixed(2)} px`);
    }
  });

  test("zaznaczenie bez naklejki w trybie naklejki albo przy brzegu obrazu — czytelny błąd, nie zgadywanie", () => {
    const obraz = obrazZeZnacznikiem(200, 200);
    assert.match(utworzSledzenie({ tryb: "naklejka" }).start(obraz, 60, 60).blad, /koloru|naklejk/);
    assert.match(utworzSledzenie({ tryb: "wzorzec" }).start(obraz, 3, 3).blad, /brzegu/);
    assert.throws(() => utworzSledzenie().krok(obraz), /punktu startowego/);
  });

  test("zapis punktu: 0–1, pewność, źródło; punkty kontrolne, zgubione klatki i koniec ponownego śledzenia", () => {
    assert.deepEqual(punktDoZapisu({ x: 240, y: 90, pewnosc: 0.87654 }, 480, 360), { x: 0.5, y: 0.25, pewnosc: 0.877, zrodlo: "sledzenie" });
    const sesja = nowaSesja({ cwiczenie: "przysiad", wideo: { nazwa: "s.webm", szerokosc: 1920, wysokosc: 1080 }, analiza: {} });
    sesja.sztanga = { tryb: "wzorzec", prog: 0.6 };
    const pewnosci = [1, 0.9, 0.5, 0.95, 1, 0.8];
    pewnosci.forEach((p, i) => sesja.klatki.push({ ...klatkaZWyniku(i, i * 33, null, null),
      sztanga: { x: 0.5, y: 0.25, pewnosc: p, zrodlo: i === 0 || i === 4 ? "korekta" : "sledzenie" } }));
    const px = punktySztangi(sesja);
    assert.deepEqual([px[0].x, px[0].y], [960, 270]);
    assert.deepEqual(px.map((q: any) => q.pewny), [true, true, false, true, true, true]);
    const p = podsumowanieSledzenia(sesja);
    assert.deepEqual([p.zPunktem, p.pewnych, p.zgubione, p.kontrolne], [6, 5, [2], [0, 4]]);
    assert.equal(nastepnyPunktKontrolny(sesja.klatki, 0), 4);
    assert.equal(nastepnyPunktKontrolny(sesja.klatki, 4), 6);
  });
});

describe("trzy wyniki: ciało, sztanga, układ (24.10.2026)", async () => {
  const { srodekKlatki, srodekSesji, polozenieNadStopa, pikseleNadStopa } = await import("../public/ruch/srodek.js");

  /** Przysiad z sztangą: punkt końca gryfu przesunięty o (dx, dy) px od barku w każdej klatce. */
  const zeSztanga = (dx: number, dy: number) => {
    const sesja = sesjaPrzysiadow();
    sesja.sztanga = { tryb: "naklejka", prog: 0.5 };
    for (const k of sesja.klatki) {
      const bark = k.p![INDEKS.left_shoulder];
      k.sztanga = { x: bark[0] + dx / W, y: bark[1] + dy / H, pewnosc: 0.95, zrodlo: "sledzenie" };
    }
    return sesja;
  };
  const USTAWIENIA = { model: "deleva-m", konczyny: "L", wygladzanie: false, fps: 30,
    obciazenie: { kg: 100, masaCiala: 80, miejsce: "sztanga" } };

  test("środek układu policzony ręcznie: (80 kg × ciało + 100 kg × koniec gryfu) / 180 kg", () => {
    const k = klatka(sylwetkaZBoku(25, 70, 35));
    const cialo = srodekKlatki(k, WYMIARY, { model: "deleva-m", konczyny: "L" })!;
    const gryf = { x: 700, y: 180, pewny: true };
    const w = srodekKlatki(k, WYMIARY, { model: "deleva-m", konczyny: "L",
      obciazenie: { kg: 100, masaCiala: 80, miejsce: "sztanga", punkt: gryf } })!;
    okolo(w.x, (80 * cialo.x + 100 * 700) / 180, 1e-9);
    okolo(w.y, (80 * cialo.y + 100 * 180) / 180, 1e-9);
    assert.deepEqual([w.cialo.x, w.cialo.y], [cialo.x, cialo.y]);
    assert.equal(w.pewny, true);
    // Niepewny punkt sztangi w tej klatce — układ niepewny, ciało nie.
    const bezGryfu = srodekKlatki(k, WYMIARY, { model: "deleva-m", konczyny: "L",
      obciazenie: { kg: 100, masaCiala: 80, miejsce: "sztanga", punkt: { ...gryf, pewny: false } } })!;
    assert.equal(bezGryfu.pewny, false);
    assert.equal(bezGryfu.cialo.pewny, true);
  });

  test("w nagraniu trzy serie: ciało, sztanga, układ — px i % stopy; układ zgodny z wyliczeniem ręcznym", () => {
    const sesja = zeSztanga(-8, 6);
    const s = srodekSesji(sesja, USTAWIENIA);
    assert.ok(s.wyniki.cialo && s.wyniki.sztanga && s.wyniki.uklad);
    const i = 60;
    const gryf = { x: sesja.klatki[i]!.sztanga.x * W, y: sesja.klatki[i]!.sztanga.y * H };
    okolo(s.wyniki.sztanga.x[i], gryf.x, 1e-9);
    okolo(s.wyniki.uklad.x[i], (80 * s.wyniki.cialo.x[i] + 100 * gryf.x) / 180, 1e-9);
    const stopy = s.klatki[i]!.stopy;
    okolo(s.wyniki.sztanga.wzgledem[i], ((gryf.x - stopy.pieta.x) / (stopy.palce.x - stopy.pieta.x)) * 100, 1e-9);
    okolo(s.wyniki.sztanga.piksele[i], gryf.x - stopy.pieta.x, 1e-9);
    // Pierwsza wersja (kolumny „srodek_ciezkosci_…”) — to samo co układ.
    assert.deepEqual(s.x, s.wyniki.uklad.x);
    // Bez obciążenia — tylko ciało i sztanga.
    const bez = srodekSesji(sesja, { ...USTAWIENIA, obciazenie: null });
    assert.equal(bez.wyniki.uklad, null);
    assert.ok(bez.wyniki.sztanga);
  });

  test("high bar i low bar: ten sam ruch, gryf w innym miejscu → inny środek układu, ciało to samo", () => {
    const high = srodekSesji(zeSztanga(-8, 6), USTAWIENIA);
    const low = srodekSesji(zeSztanga(-30, 35), USTAWIENIA);
    assert.deepEqual(high.wyniki.cialo.wzgledem, low.wyniki.cialo.wzgledem);
    const i = 60;
    // Low bar: gryf 22 px dalej w tył → układ w tył o 100/180 z tego (w pikselach).
    okolo(high.wyniki.uklad.x[i] - low.wyniki.uklad.x[i], (22 * 100) / 180, 1e-6);
    assert.ok(high.wyniki.uklad.wzgledem[i] - low.wyniki.uklad.wzgledem[i] > 5);
    // Ten sam ruch z obciążeniem „na barkach” nie widzi różnicy — dlatego punkt sztangi.
    const barki = srodekSesji(zeSztanga(-8, 6), { ...USTAWIENIA, obciazenie: { ...USTAWIENIA.obciazenie, miejsce: "barki" } });
    const barkiLow = srodekSesji(zeSztanga(-30, 35), { ...USTAWIENIA, obciazenie: { ...USTAWIENIA.obciazenie, miejsce: "barki" } });
    assert.deepEqual(barki.wyniki.uklad.x, barkiLow.wyniki.uklad.x);
  });

  test("położenie dowolnego punktu nad stopą: % i piksele od pięty — także przy osobie zwróconej w lewo", () => {
    const wPrawo = { pieta: { x: 100 }, palce: { x: 300 } };
    const wLewo = { pieta: { x: 300 }, palce: { x: 100 } };
    assert.equal(polozenieNadStopa(150, wPrawo), 25);
    assert.equal(polozenieNadStopa(250, wLewo), 25);
    assert.equal(pikseleNadStopa(150, wPrawo), 50);
    assert.equal(pikseleNadStopa(250, wLewo), 50);
    assert.equal(polozenieNadStopa(150, { pieta: { x: 100 }, palce: { x: 102 } }), null);
  });
});

describe("miary w powtórzeniu: start, w stronę palców, dół, zakresy, śródstopie (24.10.2026)", async () => {
  const { miaryPowtorzenia, miarySrodkaPowtorzen, pasmoZUstawien, PASMO_SRODSTOPIA } = await import("../public/ruch/miary-srodka.js");

  test("seria o znanym przebiegu: każda miara policzona ręcznie", () => {
    //            0   1   2   3   4   5   6
    const proc = [30, 35, 45, 55, 50, 40, 30];
    const px = proc.map((v) => v * 2);
    const m = miaryPowtorzenia({ proc, px }, { poczatek: 0, dol: 3, koniec: 6 });
    assert.deepEqual(m.start, { proc: 30, px: 60, klatka: 0 });
    assert.deepEqual(m.doPalcow, { proc: 25, px: 50, polozenieProc: 55, polozeniePx: 110, klatka: 3 });
    assert.deepEqual(m.wDole, { proc: 55, px: 110, klatka: 3 });
    assert.deepEqual(m.zakres, { proc: 25, px: 50 });
    assert.deepEqual(m.zakresZejscie, { proc: 25, px: 50 });
    assert.deepEqual(m.zakresWstawanie, { proc: 25, px: 50 });
    // W paśmie 40–60%: 45, 55, 50, 40 — 4 z 7 klatek.
    okolo(m.wPasmie, (4 / 7) * 100, 1e-9);
    assert.deepEqual([m.klatekZWynikiem, m.klatekWPowtorzeniu], [7, 7]);
  });

  test("najdalej w stronę palców: przed najgłębszym punktem; klatki „?” (null) się nie liczą; własne pasmo", () => {
    const proc = [null, 40, 62, 58, 50, null, 70, 45];
    const m = miaryPowtorzenia({ proc, px: proc }, { poczatek: 0, dol: 4, koniec: 7 }, [45, 55]);
    assert.equal(m.start!.klatka, 1);
    assert.deepEqual([m.doPalcow!.proc, m.doPalcow!.klatka], [22, 2]);
    assert.equal(m.zakresZejscie.proc, 22);
    assert.equal(m.zakresWstawanie.proc, 25);   // 70 − 45, bez klatki „?”
    assert.equal(m.zakres.proc, 30);            // 70 − 40
    // W paśmie 45–55%: 50, 45 — 2 z 6 klatek z wynikiem.
    okolo(m.wPasmie, (2 / 6) * 100, 1e-9);
    assert.equal(m.klatekZWynikiem, 6);
  });

  test("pasmo z ustawień: kolejność, granice 0–100, złe wartości → 40–60%", () => {
    assert.deepEqual(PASMO_SRODSTOPIA, [40, 60]);
    assert.deepEqual(pasmoZUstawien([65, 35]), [35, 65]);
    assert.deepEqual(pasmoZUstawien([-5, 120]), [0, 100]);
    assert.deepEqual(pasmoZUstawien([50, 50]), [40, 60]);
    assert.deepEqual(pasmoZUstawien(undefined), [40, 60]);
  });

  test("trzy wyniki w powtórzeniach przysiadu: ciało, sztanga, układ; układ w śródstopiu dłużej niż sama sztanga", () => {
    const { srodekSesji } = srodek;
    const sesja = sesjaPrzysiadow();
    for (const k of sesja.klatki) {
      const bark = k.p![INDEKS.left_shoulder];
      k.sztanga = { x: bark[0] - 8 / W, y: bark[1] + 6 / H, pewnosc: 0.95, zrodlo: "sledzenie" };
    }
    const s = srodekSesji(sesja, { model: "deleva-m", konczyny: "L", fps: 30, obciazenie: { kg: 100, masaCiala: 80, miejsce: "sztanga" } });
    const powtorzenia = [{ numer: 1, poczatek: 15, dol: 45, koniec: 75 }, { numer: 2, poczatek: 105, dol: 135, koniec: 165 }];
    const m = miarySrodkaPowtorzen(s.wyniki, powtorzenia);
    assert.equal(m.length, 2);
    for (const r of m) {
      assert.ok(r.cialo && r.sztanga && r.uklad);
      // Układ między ciałem a sztangą — także w najgłębszym punkcie.
      const [a, b] = [r.cialo.wDole!.proc!, r.sztanga.wDole!.proc!].sort((x, y) => x - y);
      assert.ok(r.uklad.wDole!.proc! > a! && r.uklad.wDole!.proc! < b!);
    }
  });
});

const srodek = await import("../public/ruch/srodek.js");

describe("zapis wersja 2 — sztanga, badanie, wersja narzędzia (24.10.2026)", async () => {
  const { doCSVPowtorzen, opisNarzedzia, WERSJA } = await import("../public/ruch/sesja.js");

  test("stary plik (wersja 1, bez sztangi) otwiera się jak dotąd, zapis idzie już jako wersja 2", () => {
    const stary = {
      format: "craftmyplan/analiza-ruchu", wersja: 1, utworzono: "2026-10-20T10:00:00.000Z", cwiczenie: "przysiad",
      wideo: { nazwa: "stary.mp4", szerokosc: W, wysokosc: H, czasTrwania: 1000 },
      analiza: { biblioteka: "@mediapipe/tasks-vision 0.10.35", model: "pose_landmarker_full" },
      landmarki: LANDMARKI.map((l) => l.id),
      klatki: [klatka(sylwetkaZBoku(10, 20, 10), 0, 0), klatka(sylwetkaZBoku(20, 40, 20), 1, 33.3)],
      sugestie: [],
      srodekCiezkosci: { model: "deleva-k", konczyny: "L", wygladzanie: true, obciazenieKg: 60, miejsce: "barki", masaCiala: 60 },
    };
    const s = zJSON(JSON.stringify(stary));
    assert.equal(s.klatki.length, 2);
    assert.equal(s.klatki[0].sztanga, undefined);
    assert.equal(WERSJA, 2);
    assert.equal(JSON.parse(doJSON(s)).wersja, 2);
    const csv = doCSV(s).split("\r\n")[0]!;
    assert.ok(!csv.includes("sztanga_punkt"), "bez sztangi — bez jej kolumn");
    assert.ok(csv.includes(";cialo_x_px;") && csv.includes(";uklad_x_px;") && !csv.includes(";sztanga_x_px;"));
  });

  test("plik z uszkodzonym punktem sztangi — czytelny błąd", () => {
    const sesja = sesjaPrzysiadow();
    sesja.klatki[3].sztanga = { x: 1.4, y: 0.2, pewnosc: 0.9, zrodlo: "sledzenie" };
    assert.throws(() => zJSON(doJSON(sesja)), /Klatka 3: punkt sztangi/);
    sesja.klatki[3].sztanga = { x: 0.4, y: 0.2, pewnosc: 0.9, zrodlo: "zgadywanie" };
    assert.throws(() => zJSON(doJSON(sesja)), BladSesji);
  });

  test("JSON i CSV: punkt sztangi w każdej klatce, trzy wyniki, kod osoby, warunek, wersja narzędzia i parametry", () => {
    const sesja = sesjaPrzysiadow();
    sesja.sztanga = { tryb: "naklejka", prog: 0.5, parametry: {} };
    sesja.klatki.forEach((k: any, i: number) => {
      const bark = k.p[INDEKS.left_shoulder];
      k.sztanga = { x: bark[0], y: bark[1] + 0.01, pewnosc: i === 7 ? 0.2 : 0.95, zrodlo: i === 0 ? "korekta" : "sledzenie" };
    });
    sesja.srodekCiezkosci = { model: "deleva-m", konczyny: "L", wygladzanie: true, obciazenieKg: 100, miejsce: "sztanga",
      masaCiala: 80, pasmo: [40, 60] };
    sesja.badanie = { kodOsoby: "P07", warunek: "LB" };
    sesja.narzedzie = opisNarzedzia(sesja, "0.2.0+abc1234");
    const wczytana = zJSON(doJSON(sesja));
    assert.deepEqual(wczytana.klatki[7].sztanga, { x: sesja.klatki[7].sztanga.x, y: sesja.klatki[7].sztanga.y, pewnosc: 0.2, zrodlo: "sledzenie" });
    assert.equal(wczytana.narzedzie.wersja, "0.2.0+abc1234");
    assert.equal(wczytana.narzedzie.parametry.modelSegmentow, "de Leva (1996) — mężczyzna");
    assert.equal(wczytana.narzedzie.parametry.odciecieHz, 6);
    assert.equal(wczytana.narzedzie.parametry.poprawkaDwochPrzejsc, 0.802);
    assert.deepEqual(wczytana.narzedzie.parametry.pasmoSrodstopia, [40, 60]);
    assert.equal(wczytana.narzedzie.parametry.sledzenieSztangi.tryb, "naklejka");

    const [naglowek, ...wiersze] = doCSV(wczytana).trim().split("\r\n");
    const kolumny = naglowek!.split(";");
    assert.ok(kolumny.indexOf("sztanga_punkt_x_px") > kolumny.indexOf("srodek_wzgledem_stop_proc_wygladzony"), "nowe kolumny na końcu");
    for (const k of ["cialo", "sztanga", "uklad"]) assert.ok(kolumny.includes(`${k}_wzgledem_stop_proc_wygladzony`) && kolumny.includes(`${k}_od_piety_px`));
    assert.deepEqual(kolumny.slice(-14, -10), ["wersja_narzedzia", "kod_osoby", "warunek", "model_segmentow"]);
    const w7 = wiersze[7]!.split(";");
    assert.equal(w7[kolumny.indexOf("sztanga_pewna")], "0");
    assert.equal(w7[kolumny.indexOf("sztanga_x_px")], "", "niepewna klatka — bez wyniku");
    assert.equal(w7[kolumny.indexOf("wersja_narzedzia")], "0.2.0+abc1234");
    assert.equal(w7[kolumny.indexOf("kod_osoby")], "P07");
    assert.equal(w7[kolumny.indexOf("odciecie_hz")], "6");
    assert.equal(w7[kolumny.indexOf("pasmo_srodstopia_od_proc")], "40");

    const powt = doCSVPowtorzen(wczytana, [{ numer: 1, poczatek: 15, dol: 45, koniec: 75 }]).trim().split("\r\n");
    const nag = powt[0]!.split(";");
    assert.equal(powt.length, 1 + 3 * 2, "powtórzenie × 3 wyniki × surowa i wygładzona");
    assert.deepEqual(powt.slice(1).map((w) => w.split(";").slice(2, 4).join(" ")),
      ["cialo surowa", "sztanga surowa", "uklad surowa", "cialo wygladzona", "sztanga wygladzona", "uklad wygladzona"]);
    assert.ok(nag.includes("czas_w_srodstopiu_proc") && nag.includes("przesuniecie_do_palcow_zejscie_proc") && nag.includes("klatka_najdalej_do_palcow"));
    assert.ok(powt.slice(1).every((w) => w.split(";").length === nag.length));
  });
});

describe("wersja narzędzia do zapisu (24.10.2026)", async () => {
  const { commitZGita, wersjaNarzedzia } = await import("../wersja-narzedzia.ts");
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  test("numer z package.json + skrót commita: ze zmiennej, z pliku wdrożenia, z katalogu .git; bez nich — „lokalna”", () => {
    const repo = mkdtempSync(join(tmpdir(), "wersja-"));
    const konsola = join(repo, "konsola");
    mkdirSync(konsola);
    writeFileSync(join(konsola, "package.json"), JSON.stringify({ version: "0.2.0" }));
    assert.equal(wersjaNarzedzia({ katalog: konsola, srodowisko: {} }), "0.2.0+lokalna");
    mkdirSync(join(repo, ".git", "refs", "heads", "galaz"), { recursive: true });
    writeFileSync(join(repo, ".git", "HEAD"), "ref: refs/heads/galaz/x\n");
    writeFileSync(join(repo, ".git", "packed-refs"), "# pack-refs\n1234567890abcdef1234567890abcdef12345678 refs/heads/galaz/x\n");
    assert.equal(commitZGita(repo), "1234567");
    writeFileSync(join(repo, ".git", "refs", "heads", "galaz", "x"), "abcdef0123456789abcdef0123456789abcdef01\n");
    assert.equal(wersjaNarzedzia({ katalog: konsola, srodowisko: {} }), "0.2.0+abcdef0");
    writeFileSync(join(konsola, "wersja-commit.txt"), "c9a4bd9\n");
    assert.equal(wersjaNarzedzia({ katalog: konsola, srodowisko: {} }), "0.2.0+c9a4bd9");
    assert.equal(wersjaNarzedzia({ katalog: konsola, srodowisko: { CRAFTMYPLAN_COMMIT: "FEDCBA987" } }), "0.2.0+fedcba9");
  });
});
