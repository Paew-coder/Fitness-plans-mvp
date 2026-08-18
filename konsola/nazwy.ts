/**
 * Zamiana nazwy klienta na identyfikator.
 *
 * Osobny plik, bo tego samego przekształcenia potrzebują trzy miejsca, które
 * nie mogą się nawzajem importować: magazyn (identyfikatory planów), migracja
 * bazy (dorabianie klientów do istniejących planów) i serwer (rozpoznanie,
 * czy „Zuzanna C" i „zuzanna c" to ta sama osoba).
 */

/** `Zuzanna C.` → `zuzanna-c`. Bez polskich znaków, bez spacji, bez wielkich liter. */
export function slug(tekst: string): string {
  const bezPolskich = tekst
    .toLocaleLowerCase("pl")
    .replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e").replace(/ł/g, "l")
    .replace(/ń/g, "n").replace(/ó/g, "o").replace(/ś/g, "s").replace(/[żź]/g, "z");
  return bezPolskich.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Identyfikator klienta. Pusty wynik zastępujemy stałą, żeby nigdy nie był pusty. */
export function idKlienta(nazwa: string): string {
  return slug(nazwa) || "klient";
}

/** Identyfikator planu: klient plus numer cyklu. */
export function idPlanu(nazwaKlienta: string, wersja: number): string {
  return `${slug(nazwaKlienta) || "plan"}-${wersja}`;
}
