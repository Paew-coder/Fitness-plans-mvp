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
  GLOWNE_PUNKTY, INDEKS, LANDMARKI, POLACZENIA, rozwiazywacz,
} from "../public/ruch/szkielet.js";
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
