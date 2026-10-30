/**
 * Logowanie trenera.
 *
 * Dwa tryby, rozróżniane automatycznie:
 *
 * **Lokalny** — konto bez hasła (`hash_hasla IS NULL`). Konsola chodzi na
 * komputerze trenera, hasło byłoby tylko przeszkodą. W tym trybie serwer
 * przyjmuje wyłącznie połączenia z tej samej maszyny; zapytanie z zewnątrz
 * dostaje odmowę z wyjaśnieniem, jak ustawić hasło.
 *
 * **Z hasłem** — gdy hasło jest ustawione, wymagane jest zawsze, także
 * lokalnie. To jedyny tryb, w którym wolno wystawić konsolę na świat.
 *
 * Hasło liczone `scrypt` z `node:crypto` — wbudowane, więc dalej zero
 * zależności. Parametry poniżej to domyślne wartości uznawane za rozsądne
 * dla logowania interaktywnego.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { baza } from "./baza/polaczenie.ts";

/** Koszt pamięciowy scrypta. Wyższe = wolniej dla atakującego i dla nas. */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const DLUGOSC_KLUCZA = 32;

/** Ile trwa sesja bez ponownego logowania. */
export const DNI_SESJI = 30;

/** Hasło → `scrypt$sól$klucz`, wszystko szesnastkowo. */
export function zahaszuj(haslo: string): string {
  const sol = randomBytes(16);
  const klucz = scryptSync(haslo.normalize("NFKC"), sol, DLUGOSC_KLUCZA, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  });
  return `scrypt$${sol.toString("hex")}$${klucz.toString("hex")}`;
}

/**
 * Czy hasło pasuje do zapisanego skrótu.
 * Porównanie stałoczasowe — inaczej czas odpowiedzi zdradzałby, ile znaków się zgadza.
 */
export function pasuje(haslo: string, zapisany: string): boolean {
  const [algorytm, solHex, kluczHex] = zapisany.split("$");
  if (algorytm !== "scrypt" || !solHex || !kluczHex) return false;

  const oczekiwany = Buffer.from(kluczHex, "hex");
  const policzony = scryptSync(haslo.normalize("NFKC"), Buffer.from(solHex, "hex"), oczekiwany.length, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  });
  return timingSafeEqual(oczekiwany, policzony);
}

export type Trener = {
  id: number;
  email: string;
  nazwa: string;
  hashHasla: string | null;
};

export function trenerPoEmailu(email: string): Trener | null {
  const w = baza().prepare(
    "SELECT id, email, nazwa, hash_hasla FROM trener WHERE email = ?",
  ).get(email.trim().toLowerCase()) as
    { id: number; email: string; nazwa: string; hash_hasla: string | null } | undefined;
  return w ? { id: w.id, email: w.email, nazwa: w.nazwa, hashHasla: w.hash_hasla } : null;
}

export function trenerPoId(id: number): Trener | null {
  const w = baza().prepare(
    "SELECT id, email, nazwa, hash_hasla FROM trener WHERE id = ?",
  ).get(id) as { id: number; email: string; nazwa: string; hash_hasla: string | null } | undefined;
  return w ? { id: w.id, email: w.email, nazwa: w.nazwa, hashHasla: w.hash_hasla } : null;
}

/** Ustawia albo zmienia hasło. `null` wraca do trybu lokalnego bez hasła. */
export function ustawHaslo(trenerId: number, haslo: string | null): void {
  baza().prepare("UPDATE trener SET hash_hasla = ? WHERE id = ?")
    .run(haslo === null ? null : zahaszuj(haslo), trenerId);
  // Zmiana hasła unieważnia wszystkie sesje — także tę na zgubionym telefonie.
  wylogujWszedzie(trenerId);
}

// ── sesje ────────────────────────────────────────────────────────────

export function zaloguj(trenerId: number): string {
  const token = randomBytes(32).toString("base64url");
  const teraz = new Date();
  const wygasa = new Date(teraz.getTime() + DNI_SESJI * 86_400_000);
  baza().prepare(
    "INSERT INTO sesja (token, trener_id, utworzona, wygasa) VALUES (?, ?, ?, ?)",
  ).run(token, trenerId, teraz.toISOString(), wygasa.toISOString());
  return token;
}

/** Trener z ważnej sesji albo `null`. Przy okazji sprząta sesje przeterminowane. */
export function trenerZSesji(token: string | null): number | null {
  if (!token) return null;
  const d = baza();
  d.prepare("DELETE FROM sesja WHERE wygasa < ?").run(new Date().toISOString());
  const w = d.prepare("SELECT trener_id FROM sesja WHERE token = ?").get(token) as
    { trener_id: number } | undefined;
  return w?.trener_id ?? null;
}

export function wyloguj(token: string): void {
  baza().prepare("DELETE FROM sesja WHERE token = ?").run(token);
}

export function wylogujWszedzie(trenerId: number): void {
  baza().prepare("DELETE FROM sesja WHERE trener_id = ?").run(trenerId);
}

// ── ciasteczka ───────────────────────────────────────────────────────

export const CIASTKO = "cmp_sesja";

export function ciastkoZNaglowka(naglowek: string | undefined, nazwa = CIASTKO): string | null {
  if (!naglowek) return null;
  for (const kawalek of naglowek.split(";")) {
    const znak = kawalek.indexOf("=");
    if (znak < 0) continue;
    if (kawalek.slice(0, znak).trim() === nazwa) return kawalek.slice(znak + 1).trim();
  }
  return null;
}

/**
 * Nagłówek ustawiający ciasteczko sesji.
 *
 * `HttpOnly` — skrypt na stronie go nie odczyta, więc XSS nie wynosi sesji.
 * `SameSite=Lax` — nie jedzie przy żądaniach z obcych stron.
 * `Secure` włącza się, gdy serwer wie, że stoi za HTTPS.
 */
export function ciastkoSesji(token: string | null, bezpieczne: boolean): string {
  const wspolne = `Path=/; HttpOnly; SameSite=Lax${bezpieczne ? "; Secure" : ""}`;
  return token === null
    ? `${CIASTKO}=; ${wspolne}; Max-Age=0`
    : `${CIASTKO}=${token}; ${wspolne}; Max-Age=${DNI_SESJI * 86_400}`;
}

// ── tryb pracy ───────────────────────────────────────────────────────

export type TrybDostepu =
  | { tryb: "lokalny"; trenerId: number }
  | { tryb: "hasło" };

/**
 * W jakim trybie chodzi ta instalacja.
 *
 * Decyduje o tym jedna rzecz: czy trener ma ustawione hasło. Nie ma tu
 * przełącznika w konfiguracji, bo przełącznik dałoby się zostawić w złej
 * pozycji przy wdrożeniu — a to jest dokładnie ta pomyłka, po której cudze
 * plany treningowe leżą w internecie.
 */
export function trybDostepu(trenerId: number): TrybDostepu {
  const trener = trenerPoId(trenerId);
  return trener?.hashHasla ? { tryb: "hasło" } : { tryb: "lokalny", trenerId };
}

/** Adresy, z których wolno wejść bez hasła w trybie lokalnym. */
const LOKALNE = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function zLokalnejMaszyny(adres: string | undefined): boolean {
  return Boolean(adres && LOKALNE.has(adres));
}
