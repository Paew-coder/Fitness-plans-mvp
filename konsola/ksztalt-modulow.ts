/**
 * Kontrola modułów — oddechu i biegu — na wejściu do serwera.
 *
 * Trasa `/moduly` była jedyną, która brała ciało żądania i zapisywała je
 * w całości, bez zapytania, czy to w ogóle liczby. Sprawdzone: `oddech`
 * podany jako tekst zapisywał się z kodem 200 i zostawał w bazie.
 *
 * Skutek nie był awarią, tylko czymś gorszym — **cichym zniknięciem**.
 * Silnik jest odporny: z tekstu zamiast sekund wychodzi „brak dawki", więc
 * ekran „Oddech i bieg" po prostu nie pokazuje się klientowi. Trener widzi,
 * że zapisał, klient nie widzi nic, i nikt się nie dowiaduje dlaczego.
 *
 * Zakresy są szerokie z rozmysłem. Nie chodzi o to, żeby zgadywać, ile lat
 * ma klient — tylko żeby liczba, która trafia do bazy, była liczbą.
 */

/** Granice, poza którymi wartość nie jest już pomyłką w pisaniu, tylko bzdurą. */
export const GRANICE_MODULOW = {
  /** Test wstrzymania oddechu. Rekord świata to około 11 minut. */
  twot: [0, 900],
  wiek: [5, 120],
  /** Tętno maksymalne mierzone. */
  hrMaxZmierzone: [80, 250],
  /** Dystans biegu testowego w kilometrach. */
  dystansTestowy: [0.1, 100],
  /** Czas biegu testowego w minutach. */
  czasTestowy: [1, 600],
  jednostekWTygodniu: [1, 5],
} as const;

const POLA_BIEGU = [
  "wiek", "hrMaxZmierzone", "dystansTestowy", "czasTestowy", "jednostekWTygodniu",
] as const;

export type Oddech = { twot: number | null; przeciwwskazania: boolean };
export type Bieg = Partial<Record<typeof POLA_BIEGU[number], number | null>>;

const jestObiektem = (w: unknown): w is Record<string, unknown> =>
  typeof w === "object" && w !== null && !Array.isArray(w);

/** Liczba z zakresu, `null` dla pustki, `undefined` gdy wartość jest zła. */
function liczbaAlboPustka(
  wartosc: unknown, [dol, gora]: readonly [number, number],
): number | null | undefined {
  if (wartosc === null || wartosc === undefined || wartosc === "") return null;
  const n = typeof wartosc === "number" ? wartosc : Number(wartosc);
  if (!Number.isFinite(n) || n < dol || n > gora) return undefined;
  return n;
}

export type WynikModulow =
  | { blad: string }
  | { oddech?: Oddech; bieg?: Bieg };

/**
 * Sprawdza i przycina to, co przyszło. Pola nieznane odpadają — zapisywaliśmy
 * dotąd cokolwiek, a to jedyne miejsce, gdzie ciało żądania szło do bazy
 * bez wyboru.
 */
export function sprawdzModuly(cialo: unknown): WynikModulow {
  if (!jestObiektem(cialo)) return { blad: "Moduły muszą być obiektem" };
  const wynik: { oddech?: Oddech; bieg?: Bieg } = {};

  if (cialo.oddech !== undefined) {
    if (!jestObiektem(cialo.oddech)) {
      return { blad: "Moduł oddechowy musi być obiektem z wynikiem testu" };
    }
    const twot = liczbaAlboPustka(cialo.oddech.twot, GRANICE_MODULOW.twot);
    if (twot === undefined) {
      return { blad: `Wynik testu oddechowego musi być liczbą sekund `
        + `z zakresu ${GRANICE_MODULOW.twot[0]}–${GRANICE_MODULOW.twot[1]}` };
    }
    wynik.oddech = { twot, przeciwwskazania: Boolean(cialo.oddech.przeciwwskazania) };
  }

  if (cialo.bieg !== undefined) {
    if (!jestObiektem(cialo.bieg)) return { blad: "Moduł biegowy musi być obiektem" };
    const bieg: Bieg = {};
    for (const pole of POLA_BIEGU) {
      const wartosc = liczbaAlboPustka(cialo.bieg[pole], GRANICE_MODULOW[pole]);
      if (wartosc === undefined) {
        const [dol, gora] = GRANICE_MODULOW[pole];
        return { blad: `Pole „${pole}” musi być liczbą z zakresu ${dol}–${gora}` };
      }
      bieg[pole] = wartosc;
    }
    wynik.bieg = bieg;
  }

  return wynik;
}
