/**
 * Miary w powtórzeniu — środek ciężkości ciała, sztanga i układ (24.10.2026).
 *
 * Do badania trenera (przysiad high bar bez wskazówki, ze wskazówką, low bar,
 * z boku). Dla każdego z trzech wyników, w każdym powtórzeniu:
 * - położenie na początku powtórzenia,
 * - największe przesunięcie w stronę palców w zejściu (wartość i klatka),
 * - położenie w najgłębszym punkcie (biodro najniżej — ten sam punkt co kąty
 *   „w najgłębszym punkcie”),
 * - zakres przód–tył w całym powtórzeniu, osobno w zejściu i we wstawaniu,
 * - % czasu powtórzenia w paśmie śródstopia (domyślnie 40–60% od pięty).
 * Wszystko w % stopy (pięta 0%, palce 100%) i w pikselach (od pięty,
 * dodatnie w stronę palców). Zejście: od początku do najgłębszego punktu,
 * wstawanie: od niego do końca.
 *
 * Klatki niepewne (`null` w serii) się nie liczą — także w % czasu
 * w śródstopiu: to % klatek z wynikiem; ile ich było, mówi `klatekZWynikiem`.
 *
 * Czysty moduł: bez DOM, działa w przeglądarce i w testach Node.
 */

/** Pasmo śródstopia (% długości stopy od pięty) — stałe, do zmiany w ustawieniach. */
export const PASMO_SRODSTOPIA = [40, 60];

/** Pasmo z ustawień: dwie liczby 0–100, od mniejszej do większej; inaczej domyślne. */
export function pasmoZUstawien(pasmo) {
  const [a, b] = Array.isArray(pasmo) ? pasmo.map(Number) : [];
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return [...PASMO_SRODSTOPIA];
  return [Math.max(0, Math.min(a, b)), Math.min(100, Math.max(a, b))];
}

const wartosc = (s, i) => (s?.[i] === undefined ? null : s[i]);

function zakres(s, od, doK) {
  let min = Infinity, max = -Infinity;
  for (let i = od; i <= doK; i++) {
    const v = wartosc(s, i);
    if (v === null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max >= min ? max - min : null;
}

/**
 * Miary jednego wyniku w jednym powtórzeniu.
 * `seria`: `{ proc: [% stopy | null], px: [piksele od pięty | null] }`,
 * `p`: `{ poczatek, dol, koniec }` (indeksy klatek), `pasmo`: `[od, do]` w %.
 */
export function miaryPowtorzenia(seria, p, pasmo = PASMO_SRODSTOPIA) {
  const { proc, px } = seria;
  const { poczatek, dol, koniec } = p;
  // Pierwsza klatka z wynikiem w zejściu — „na początku powtórzenia”.
  let s0 = null;
  for (let i = poczatek; i <= dol; i++) if (wartosc(proc, i) !== null || wartosc(px, i) !== null) { s0 = i; break; }
  const start = s0 === null ? null : { proc: wartosc(proc, s0), px: wartosc(px, s0), klatka: s0 };

  // Najdalej w stronę palców w zejściu; przesunięcie = ile dalej niż na początku.
  let doPalcow = null;
  if (start) {
    const glowna = start.proc !== null ? proc : px;
    let naj = s0;
    for (let i = s0; i <= dol; i++) {
      const v = wartosc(glowna, i);
      if (v !== null && v > wartosc(glowna, naj)) naj = i;
    }
    const roznica = (s) => (wartosc(s, naj) === null || wartosc(s, s0) === null ? null : wartosc(s, naj) - wartosc(s, s0));
    doPalcow = { proc: roznica(proc), px: roznica(px), polozenieProc: wartosc(proc, naj), polozeniePx: wartosc(px, naj), klatka: naj };
  }

  const wDole = { proc: wartosc(proc, dol), px: wartosc(px, dol), klatka: dol };

  let zWynikiem = 0, wPasmie = 0;
  for (let i = poczatek; i <= koniec; i++) {
    const v = wartosc(proc, i);
    if (v === null) continue;
    zWynikiem++;
    if (v >= pasmo[0] && v <= pasmo[1]) wPasmie++;
  }

  return {
    start,
    doPalcow,
    wDole: wDole.proc === null && wDole.px === null ? null : wDole,
    zakres: { proc: zakres(proc, poczatek, koniec), px: zakres(px, poczatek, koniec) },
    zakresZejscie: { proc: zakres(proc, poczatek, dol), px: zakres(px, poczatek, dol) },
    zakresWstawanie: { proc: zakres(proc, dol, koniec), px: zakres(px, dol, koniec) },
    wPasmie: zWynikiem ? (wPasmie / zWynikiem) * 100 : null,
    klatekZWynikiem: zWynikiem,
    klatekWPowtorzeniu: koniec - poczatek + 1,
  };
}

/** Kolejność i nazwy trzech wyników — tabela, CSV, wykres. */
export const WYNIKI = [
  { id: "cialo", nazwa: "środek ciężkości ciała", krotko: "ciało" },
  { id: "sztanga", nazwa: "sztanga (koniec gryfu)", krotko: "sztanga" },
  { id: "uklad", nazwa: "środek ciężkości układu (ciało + sztanga)", krotko: "układ" },
];

/**
 * Miary wszystkich wyników we wszystkich powtórzeniach.
 * `wyniki` — `srodekSesji(...).wyniki`, `powtorzenia` — `[{ numer, poczatek, dol, koniec }]`.
 * `gladkie` — z serii wygładzonych (tabela na ekranie przy włączonym
 * wygładzaniu) albo surowych. Wynik bez danych w nagraniu — `null`.
 */
export function miarySrodkaPowtorzen(wyniki, powtorzenia, { pasmo = PASMO_SRODSTOPIA, gladkie = true } = {}) {
  return powtorzenia.map((p) => {
    const wiersz = { numer: p.numer, poczatek: p.poczatek, dol: p.dol, koniec: p.koniec };
    for (const { id } of WYNIKI) {
      const s = wyniki?.[id];
      wiersz[id] = s ? miaryPowtorzenia(
        gladkie ? { proc: s.wzgledemGladkie, px: s.pikseleGladkie } : { proc: s.wzgledem, px: s.piksele }, p, pasmo) : null;
    }
    return wiersz;
  });
}
