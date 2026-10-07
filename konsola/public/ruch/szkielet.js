/**
 * Szkielet MediaPipe Pose Landmarker — 33 punkty i połączenia między nimi.
 *
 * Trener, 07.10.2026: „nie ograniczaj systemu wyłącznie do kończyny dolnej,
 * zapisuj pełny zestaw landmarków MediaPipe”. Dlatego sesja trzyma zawsze
 * wszystkie 33 punkty, a „główne” (głowa, barki, łokcie, nadgarstki, biodra,
 * kolana, stawy skokowe) to tylko wybór do ekranu i do kątów.
 *
 * Identyfikatory to nazwy z dokumentacji MediaPipe (`left_hip`…) — stabilne,
 * te same, których użyje przyszła analiza AI. „Lewy” znaczy lewa strona
 * ciała osoby na filmie, nie lewa strona obrazu.
 *
 * Czysty moduł: bez DOM, działa w przeglądarce i w testach Node.
 */

/** Wszystkie 33 punkty w kolejności indeksów MediaPipe. */
export const LANDMARKI = [
  { id: "nose", nazwa: "nos" },
  { id: "left_eye_inner", nazwa: "oko L (wewn.)" },
  { id: "left_eye", nazwa: "oko L" },
  { id: "left_eye_outer", nazwa: "oko L (zewn.)" },
  { id: "right_eye_inner", nazwa: "oko P (wewn.)" },
  { id: "right_eye", nazwa: "oko P" },
  { id: "right_eye_outer", nazwa: "oko P (zewn.)" },
  { id: "left_ear", nazwa: "ucho L" },
  { id: "right_ear", nazwa: "ucho P" },
  { id: "mouth_left", nazwa: "usta L" },
  { id: "mouth_right", nazwa: "usta P" },
  { id: "left_shoulder", nazwa: "bark L" },
  { id: "right_shoulder", nazwa: "bark P" },
  { id: "left_elbow", nazwa: "łokieć L" },
  { id: "right_elbow", nazwa: "łokieć P" },
  { id: "left_wrist", nazwa: "nadgarstek L" },
  { id: "right_wrist", nazwa: "nadgarstek P" },
  { id: "left_pinky", nazwa: "mały palec L" },
  { id: "right_pinky", nazwa: "mały palec P" },
  { id: "left_index", nazwa: "palec wskazujący L" },
  { id: "right_index", nazwa: "palec wskazujący P" },
  { id: "left_thumb", nazwa: "kciuk L" },
  { id: "right_thumb", nazwa: "kciuk P" },
  { id: "left_hip", nazwa: "biodro L" },
  { id: "right_hip", nazwa: "biodro P" },
  { id: "left_knee", nazwa: "kolano L" },
  { id: "right_knee", nazwa: "kolano P" },
  { id: "left_ankle", nazwa: "staw skokowy L" },
  { id: "right_ankle", nazwa: "staw skokowy P" },
  { id: "left_heel", nazwa: "pięta L" },
  { id: "right_heel", nazwa: "pięta P" },
  { id: "left_foot_index", nazwa: "palce stopy L" },
  { id: "right_foot_index", nazwa: "palce stopy P" },
].map((l, indeks) => ({ ...l, indeks, strona: strona(l.id) }));

function strona(id) {
  return id.startsWith("left_") ? "L" : id.startsWith("right_") ? "P" : null;
}

export const LICZBA_LANDMARKOW = LANDMARKI.length;

/** Indeks po identyfikatorze, np. `INDEKS.left_hip === 23`. */
export const INDEKS = Object.fromEntries(LANDMARKI.map((l) => [l.id, l.indeks]));

/**
 * Połączenia rysowane na obrazie — te same pary co `PoseLandmarker.POSE_CONNECTIONS`
 * (przegląd ruchu porównuje je z biblioteką, żeby się nie rozjechały).
 */
export const POLACZENIA = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

/**
 * Punkty pochodne — liczone z landmarków, nie zwracane przez MediaPipe.
 *
 * Głowa to środek uszu: ucho (okolica tragusa) nad barkiem to klasyczny punkt
 * oceny ustawienia głowy. Z boku jedno ucho jest zasłonięte — wtedy bierzemy
 * to widoczne, a gdy żadne nie jest pewne, nos.
 */
export const POCHODNE = {
  glowa: { id: "glowa", nazwa: "głowa" },
  srodek_barkow: { id: "srodek_barkow", nazwa: "środek barków" },
  srodek_bioder: { id: "srodek_bioder", nazwa: "środek bioder" },
};

/** Główne punkty pierwszego etapu — kolejność wierszy w tabeli klatki. */
export const GLOWNE_PUNKTY = [
  "glowa",
  "left_shoulder", "right_shoulder",
  "left_elbow", "right_elbow",
  "left_wrist", "right_wrist",
  "left_hip", "right_hip",
  "left_knee", "right_knee",
  "left_ankle", "right_ankle",
];

/** Próg widoczności, od którego punkt uznajemy za pewny. */
export const PROG_WIDOCZNOSCI = 0.5;

/** Nazwa do wyświetlenia dla punktu (landmark albo pochodny). */
export function nazwaPunktu(id) {
  if (POCHODNE[id]) return POCHODNE[id].nazwa;
  const i = INDEKS[id];
  return i === undefined ? id : LANDMARKI[i].nazwa;
}

/** Strona ciała punktu: "L", "P" albo null (środek). */
export function stronaPunktu(id) {
  const i = INDEKS[id];
  return i === undefined ? null : LANDMARKI[i].strona;
}

/** Odpowiednik punktu po drugiej stronie ciała (`left_hip` ↔ `right_hip`). */
export function lustro(id) {
  if (id.startsWith("left_")) return `right_${id.slice(5)}`;
  if (id.startsWith("right_")) return `left_${id.slice(6)}`;
  return id;
}

const srodek = (a, b) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
  // Średnia, nie minimum: z boku dalszy bark ma niską widoczność, a jego
  // położenie MediaPipe i tak szacuje rozsądnie. Minimum unieważniałoby
  // pochylenie tułowia w każdym ujęciu z boku.
  v: (a.v + b.v) / 2,
});

/**
 * Rozwiązywacz punktów jednej klatki: `punkt("left_hip")`, `punkt("glowa")`.
 *
 * `punkty` — 33 punkty `{x, y, z, v}` w jednym układzie (piksele obrazu albo
 * metry modelu 3D). `zamiany` — `{ id: {x, y} }`: punkty podstawione na czas
 * liczenia, np. sugerowana pozycja biodra. Zamiana działa także na punkty
 * pochodne: sugerowana głowa zastępuje środek uszu.
 */
export function rozwiazywacz(punkty, zamiany = {}) {
  const pobierz = (id) => {
    const z = zamiany[id];
    const bazowy = bazowyPunkt(id);
    if (!bazowy) return null;
    return z ? { ...bazowy, x: z.x, y: z.y } : bazowy;
  };
  function bazowyPunkt(id) {
    const i = INDEKS[id];
    if (i !== undefined) return punkty[i] ?? null;
    if (id === "srodek_barkow") return srodek(pobierz("left_shoulder"), pobierz("right_shoulder"));
    if (id === "srodek_bioder") return srodek(pobierz("left_hip"), pobierz("right_hip"));
    if (id === "glowa") {
      const l = pobierz("left_ear");
      const p = pobierz("right_ear");
      const lOk = l.v >= PROG_WIDOCZNOSCI;
      const pOk = p.v >= PROG_WIDOCZNOSCI;
      if (lOk && pOk) return srodek(l, p);
      if (lOk || pOk) return lOk ? l : p;
      return pobierz("nose");
    }
    return null;
  }
  return pobierz;
}
