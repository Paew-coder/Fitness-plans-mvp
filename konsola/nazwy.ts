/**
 * Zamiana nazwy klienta na identyfikator.
 *
 * Osobny plik, bo tego samego przekształcenia potrzebują trzy miejsca, które
 * nie mogą się nawzajem importować: magazyn (identyfikatory planów), migracja
 * bazy (dorabianie klientów do istniejących planów) i serwer (rozpoznanie,
 * czy „Zuzanna C" i „zuzanna c" to ta sama osoba).
 */
import { createHash } from "node:crypto";

/** `Zuzanna C.` → `zuzanna-c`. Bez polskich znaków, bez spacji, bez wielkich liter. */
export function slug(tekst: string): string {
  const bezPolskich = tekst
    .toLocaleLowerCase("pl")
    .replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e").replace(/ł/g, "l")
    .replace(/ń/g, "n").replace(/ó/g, "o").replace(/ś/g, "s").replace(/[żź]/g, "z");
  return bezPolskich.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Krótki, stały skrót nazwy — wyłącznie na wypadek, gdy po odsianiu znaków
 * nie zostaje nic.
 *
 * Wcześniej stała w tym miejscu stała: każda nazwa bez łacińskich liter
 * dawała ten sam identyfikator `klient`. Sprawdzone na działającej konsoli:
 * plan założony dla „Марія Ковальчук" wszedł do kartoteki „Анна" i został
 * **podpisany cudzym nazwiskiem** — dwoje różnych ludzi w jednej teczce,
 * bez słowa ostrzeżenia. Dla trenera w Polsce to nie jest przypadek
 * teoretyczny: klientka z Ukrainy nazywa się tak, jak się nazywa.
 *
 * Skrót, a nie zachowanie oryginalnych znaków, bo identyfikator trafia do
 * adresu URL i do nazwy pliku — a tam alfabet musi być wąski.
 */
function skrot(tekst: string): string {
  return createHash("sha256").update(tekst.normalize("NFC")).digest("hex").slice(0, 8);
}

/** Identyfikator klienta. Nigdy pusty i nigdy wspólny dla dwóch różnych nazw. */
export function idKlienta(nazwa: string): string {
  return slug(nazwa) || `klient-${skrot(nazwa)}`;
}

/** Identyfikator planu: klient plus numer cyklu. */
export function idPlanu(nazwaKlienta: string, wersja: number): string {
  return `${idKlienta(nazwaKlienta)}-${wersja}`;
}
