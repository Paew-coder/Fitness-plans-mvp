/** Odpowiednik MROUND z arkusza: zaokrąglenie do najbliższej wielokrotności `krok`. */
export function mround(wartosc: number, krok: number): number {
  if (krok <= 0) return wartosc;
  // Korekta błędu zmiennoprzecinkowego — bez niej mround(2.675, 0.05) daje 2,65 zamiast 2,7.
  const ilorazy = Math.round((wartosc / krok) * 1e9) / 1e9;
  return zaokraglij(Math.round(ilorazy) * krok, 4);
}

/** Zaokrąglenie do zadanej liczby miejsc po przecinku, odporne na błąd zmiennoprzecinkowy. */
export function zaokraglij(wartosc: number, miejsca = 0): number {
  const m = 10 ** miejsca;
  return Math.round((wartosc + Number.EPSILON * Math.sign(wartosc) * Math.abs(wartosc)) * m) / m;
}

export function ogranicz(wartosc: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, wartosc));
}

/**
 * ROUND z arkusza: połówki odchodzą od zera (-2,5 → -3).
 * `Math.round` zaokrągla połówki w stronę +∞ (-2,5 → -2), co przy ujemnych korektach
 * rozjeżdża się z arkuszem.
 */
export function zaokraglijJakArkusz(wartosc: number, miejsca = 0): number {
  const m = 10 ** miejsca;
  const x = wartosc * m;
  const zaokr = Math.sign(x) * Math.round(Math.abs(x) + Number.EPSILON * Math.abs(x));
  return zaokr / m;
}

/**
 * Klucze tabel są zapisane co 0,5. Dopasowanie musi być dokładne — arkusz nie
 * interpoluje i przy RPE 8,25 zwraca błąd, nie sąsiednią wartość.
 *
 * Ta funkcja tylko czyści szum zmiennoprzecinkowy (`8.000000001` → `8`);
 * wartość faktycznie leżąca poza siatką zostaje nietknięta, żeby odczyt z tabeli
 * chybił i wywołał gałąź błędu.
 */
export function klucz(wartosc: number): number {
  const najblizszy = Math.round(wartosc * 2) / 2;
  return Math.abs(wartosc - najblizszy) < 1e-9 ? najblizszy : wartosc;
}
