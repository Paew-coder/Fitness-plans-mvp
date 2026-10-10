/**
 * Profile ćwiczeń — co pokazać i jak liczyć powtórzenia.
 *
 * Moduł jest ogólny: kąty, trajektorie i zapis nie zależą od ćwiczenia.
 * Profil wybiera tylko, które kąty idą na wykres, czyje trajektorie rysować,
 * po czym liczyć powtórzenia i co podsumować w każdym z nich. Nowe ćwiczenie
 * (martwy ciąg, wyciskanie…) to nowy wpis tutaj, bez ruszania reszty.
 *
 * Grupy kątów i punktów są bez strony („kolano”, „hip”) — stronę dobiera
 * ekran: tę bliżej kamery albo wskazaną przez trenera.
 */
import { punktyWUkladzie, ujecie } from "./geometria.js";
import { maksimum, seria, wykryjPowtorzenia, wymiarySesji } from "./przebieg.js";
import { rozwiazywacz } from "./szkielet.js";

export const PROFILE = [
  {
    id: "przysiad",
    nazwa: "Przysiad",
    ujecie: "Najlepiej z boku, cała sylwetka w kadrze, kamera nieruchomo na wysokości bioder. "
      + "Z przodu — do oceny kolan względem stóp.",
    wykres: ["kolano", "biodro", "skokowy", "tulow"],
    trajektorie: ["hip", "knee", "shoulder"],
    powtorzenia: { grupa: "kolano", minAmplituda: 30 },
    podsumowanie: podsumowaniePrzysiadu,
  },
  {
    id: "ogolny",
    nazwa: "Inne ćwiczenie",
    ujecie: "Cała sylwetka w kadrze, kamera nieruchomo. Powtórzenia się nie liczą — "
      + "kąty, trajektorie i klatki działają jak przy przysiadzie.",
    wykres: ["kolano", "biodro", "lokiec", "tulow"],
    trajektorie: ["wrist", "hip"],
    powtorzenia: null,
    podsumowanie: null,
  },
];

export const PROFIL = Object.fromEntries(PROFILE.map((p) => [p.id, p]));

/** Identyfikator kąta grupy po stronie: `("kolano", "L") → "kolano_l"`. */
export function katStrony(grupa, strona) {
  return ["kolano", "biodro", "skokowy", "lokiec", "ramie"].includes(grupa)
    ? `${grupa}_${strona.toLowerCase()}` : grupa;
}

/** Punkt grupy po stronie: `("hip", "P") → "right_hip"`; „glowa” bez strony. */
export function punktStrony(rdzen, strona) {
  return rdzen === "glowa" ? rdzen : `${strona === "P" ? "right" : "left"}_${rdzen}`;
}

/**
 * Powtórzenia według profilu: sygnał z grupy kątów po wskazanej stronie,
 * a gdy ta strona jest niepewna w danej klatce — z drugiej.
 */
export function powtorzeniaProfilu(profil, katy, strona) {
  if (!profil.powtorzenia) return [];
  const { grupa, minAmplituda } = profil.powtorzenia;
  const tej = seria(katy, katStrony(grupa, strona));
  const drugiej = seria(katy, katStrony(grupa, strona === "L" ? "P" : "L"));
  const sygnal = tej.map((v, i) => v ?? drugiej[i]);
  return wykryjPowtorzenia(sygnal, { minAmplituda });
}

/**
 * Przysiad — w każdym powtórzeniu: czasy zejścia i wstawania, największe
 * zgięcia, pochylenie tułowia, głębokość w dole i (z przodu) kolana
 * względem stóp.
 */
function podsumowaniePrzysiadu(sesja, katy, strona, powtorzenia) {
  const wymiary = wymiarySesji(sesja);
  const s = (grupa) => seria(katy, katStrony(grupa, strona));
  const kolano = s("kolano");
  const biodro = s("biodro");
  const skokowy = s("skokowy");
  const tulow = s("tulow");
  const przedrostek = strona === "P" ? "right" : "left";

  return powtorzenia.map((p, n) => {
    const t = (i) => sesja.klatki[i].t;
    const dolKlatka = sesja.klatki[p.szczyt];
    const punkty = punktyWUkladzie(dolKlatka, wymiary, "2d");
    let glebokosc = null;
    let kolanaDoStop = null;
    if (punkty) {
      const q = rozwiazywacz(punkty);
      const bio = q(`${przedrostek}_hip`);
      const kol = q(`${przedrostek}_knee`);
      const udo = Math.hypot(kol.x - bio.x, kol.y - bio.y);
      // + = biodro poniżej kolana (poniżej równoległej); oś Y obrazu w dół.
      if (udo > 0) glebokosc = ((bio.y - kol.y) / udo) * 100;
      // Rozstaw kolan do stóp ma sens tylko z przodu (albo z tyłu).
      const kolana = Math.abs(q("left_knee").x - q("right_knee").x);
      const stopy = Math.abs(q("left_ankle").x - q("right_ankle").x);
      if (stopy > 0 && ujecie(punkty) === "przod") kolanaDoStop = kolana / stopy;
    }
    return {
      numer: n + 1,
      ...p,
      czas: (t(p.koniec) - t(p.poczatek)) / 1000,
      zejscie: (t(p.szczyt) - t(p.poczatek)) / 1000,
      wstawanie: (t(p.koniec) - t(p.szczyt)) / 1000,
      kolanoMaks: maksimum(kolano, p.poczatek, p.koniec),
      biodroMaks: maksimum(biodro, p.poczatek, p.koniec),
      skokowyMaks: maksimum(skokowy, p.poczatek, p.koniec),
      tulowMaks: maksimum(tulow, p.poczatek, p.koniec),
      glebokosc,
      kolanaDoStop,
    };
  });
}
