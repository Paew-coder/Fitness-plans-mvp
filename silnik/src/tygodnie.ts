/**
 * Liczba tygodni planu (22.11.2026) — od 4 do 12, domyślnie 6.
 *
 * Trener: „dodaj mi możliwość zmiany ilości tygodni w planie w konsoli
 * trenera — zarówno nowe plany, jak i edytowanie aktualnych”. Decyzje:
 * progresja w blokach po 3 tygodnie — krótszy cykl ucina, dłuższy dokłada
 * bloki jak blok II (T4–T6), z RPE o 0,5 wyżej w każdym kolejnym bloku
 * (T7–T9 +0,5, T10–T12 +1,0).
 *
 * Klucze tygodni w danych są stałe: robocze T1–T6 to 1–6, deload 7, maksy 8
 * (tak stoją wpisy klientów od września). Tygodnie robocze T7–T12 dostają
 * klucze 9–14, żeby nic nie przesunęło się pod deload ani maksy. Na ekranie
 * numer liczy `numerNaEkranie`: T7 = klucz 9, deload = T(N+1), maksy = T(N+2)
 * albo T(N+1) bez deloadu. Skrócenie planu niczego nie kasuje — tygodnie za
 * końcem cyklu po prostu się nie liczą, a po wydłużeniu wracają.
 *
 * Kolejność w czasie nie jest kolejnością kluczy (9 > 7, a T7 jest przed
 * deloadem) — tam, gdzie liczy się „wcześniej / później”, idzie `kolejnosc`.
 */
import type { Tydzien, TydzienCyklu } from "./typy.ts";

export const TYGODNI_MIN = 4;
export const TYGODNI_MAX = 12;
export const TYGODNI_DOMYSLNIE = 6;

/** Tygodnie po cyklu mają stałe klucze — patrz `numerNaEkranie`. */
export const TYDZIEN_DELOADU = 7;
export const TYDZIEN_MAKSOW = 8;

/** Wzrost RPE z szablonu w każdym bloku po drugim (T7–T9 +0,5, T10–T12 +1,0). */
export const PREMIA_RPE_BLOKU = 0.5;
/** To samo przy dwuboju, gdzie progresja idzie w % 1RM: 0,5 RPE ≈ 2 % 1RM. */
export const PREMIA_PROCENTU_BLOKU = 2;
const RPE_SUFIT = 10;

/** Liczba tygodni roboczych planu — wpis spoza 4–12 (albo brak) to 6. */
export function liczbaTygodni(plan: { tygodni?: unknown } | null | undefined): number {
  const n = plan?.tygodni;
  return typeof n === "number" && Number.isInteger(n) && n >= TYGODNI_MIN && n <= TYGODNI_MAX
    ? n : TYGODNI_DOMYSLNIE;
}

/** Klucz w danych dla n-tego tygodnia roboczego (1–12). */
export function kluczTygodnia(n: number): Tydzien {
  return (n <= 6 ? n : n + 2) as Tydzien;
}

/** Który to tydzień roboczy (1–12); `null` przy deloadzie, maksach i nieznanych. */
export function numerRoboczy(klucz: number): number | null {
  if (!Number.isInteger(klucz)) return null;
  if (klucz >= 1 && klucz <= 6) return klucz;
  if (klucz >= 9 && klucz <= TYGODNI_MAX + 2) return klucz - 2;
  return null;
}

/** Wszystkie klucze tygodni roboczych, jakie plan w ogóle może mieć (1–6, 9–14). */
export const WSZYSTKIE_ROBOCZE: readonly Tydzien[] =
  Array.from({ length: TYGODNI_MAX }, (_, i) => kluczTygodnia(i + 1));

/** Klucze tygodni roboczych tego planu, po kolei. */
export function tygodnieRobocze(plan: { tygodni?: unknown } | null | undefined): Tydzien[] {
  return WSZYSTKIE_ROBOCZE.slice(0, liczbaTygodni(plan));
}

/** Ostatni tydzień roboczy planu — z niego deload i maksy biorą ćwiczenia i liczby. */
export function ostatniRoboczy(plan: { tygodni?: unknown } | null | undefined): Tydzien {
  return kluczTygodnia(liczbaTygodni(plan));
}

/** Kolejność w czasie: robocze po numerze, potem deload, potem maksy. */
export function kolejnosc(klucz: number): number {
  if (klucz === TYDZIEN_DELOADU) return 100;
  if (klucz === TYDZIEN_MAKSOW) return 101;
  return numerRoboczy(klucz) ?? klucz;
}

/** Tydzień roboczy przed tym (klucz) — `null` w T1 i poza tygodniami roboczymi. */
export function poprzedniRoboczy(klucz: number): Tydzien | null {
  const n = numerRoboczy(klucz);
  return n !== null && n > 1 ? kluczTygodnia(n - 1) : null;
}

/** Tygodnie robocze wcześniejsze niż ten, od najbliższego wstecz (do T1). */
export function wczesniejszeRobocze(klucz: number, plan?: { tygodni?: unknown }): Tydzien[] {
  const robocze = plan ? tygodnieRobocze(plan) : WSZYSTKIE_ROBOCZE;
  return robocze.filter((t) => kolejnosc(t) < kolejnosc(klucz)).reverse();
}

/**
 * Szablon tygodnia: który z sześciu tygodni szablonu 5.18 (T1–T6) liczy ten
 * tydzień i o ile podnieść RPE. Blok I (T1–T3) to T1–T3 szablonu, każdy
 * następny blok — T4–T6 szablonu, od bloku III z premią RPE.
 */
export function szablonTygodnia(klucz: number): { tydzien: Tydzien; premiaRpe: number; blok: number } {
  const n = numerRoboczy(klucz) ?? 6;
  const blok = Math.ceil(n / 3);
  const poz = (n - 1) % 3 + 1;
  return {
    tydzien: (blok === 1 ? poz : 3 + poz) as Tydzien,
    premiaRpe: blok >= 3 ? PREMIA_RPE_BLOKU * (blok - 2) : 0,
    blok,
  };
}

/** RPE z szablonu z premią bloku, nie wyżej niż 10. */
export function zPremiaRpe(rpe: number, premia: number): number {
  return premia ? Math.min(RPE_SUFIT, rpe + premia) : rpe;
}

/**
 * Pierwszy tydzień bloku, z którego „trzymaj z bloku” niesie ciężar —
 * `null` w pierwszym tygodniu bloku (tam ciężar liczy się z 1RM) i poza
 * tygodniami roboczymi. T2/T3 → T1, T5/T6 → T4, T8/T9 → T7 itd.
 */
export function bazaBloku(klucz: number): Tydzien | null {
  const n = numerRoboczy(klucz);
  if (n === null) return null;
  const poz = (n - 1) % 3;
  return poz === 0 ? null : kluczTygodnia(n - poz);
}

/**
 * Numer tygodnia na ekranie (T1…T12, deload i maksy za cyklem). Bez deloadu
 * maksy są tygodniem zaraz po ostatnim roboczym.
 */
export function numerNaEkranie(
  plan: { tygodni?: unknown; deload?: boolean; tydzienMaksow?: boolean }, klucz: number,
): number {
  const n = liczbaTygodni(plan);
  if (klucz === TYDZIEN_DELOADU) return n + 1;
  if (klucz === TYDZIEN_MAKSOW) return n + (plan.deload ? 2 : 1);
  return numerRoboczy(klucz) ?? klucz;
}

/** Klucz tygodnia z numeru na ekranie — odwrotność `numerNaEkranie`; `null`, gdy plan go nie ma. */
export function kluczZNumeru(
  plan: { tygodni?: unknown; deload?: boolean; tydzienMaksow?: boolean }, numer: number,
): TydzienCyklu | null {
  const n = liczbaTygodni(plan);
  if (Number.isInteger(numer) && numer >= 1 && numer <= n) return kluczTygodnia(numer);
  if (plan.deload && numer === n + 1) return TYDZIEN_DELOADU;
  if (plan.tydzienMaksow && numer === n + (plan.deload ? 2 : 1)) return TYDZIEN_MAKSOW;
  return null;
}
