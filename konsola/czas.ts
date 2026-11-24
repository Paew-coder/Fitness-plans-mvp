/**
 * Liczenie dni — w dniach kalendarzowych, nie w dobach.
 *
 * Wygląda na drobiazg, a jest różnicą między „dziś" a „wczoraj" na ekranie
 * trenera. Dotąd wszędzie stało `(Date.now() - Date.parse(kiedy)) / 86 400 000`,
 * czyli **ile upłynęło godzin podzielone przez dwadzieścia cztery**. Klient
 * kończył trening w poniedziałek o 19:00, trener otwierał konsolę we wtorek
 * o 9:00 — czternaście godzin, czyli zero dni, czyli „ostatnia aktywność:
 * dziś". A klient tego dnia nie ćwiczył wcale.
 *
 * Ludzie trenują wieczorem, więc to nie był rzadki przypadek — to był
 * przypadek typowy. Ta sama arytmetyka decyduje o kolorze sygnału przy
 * kliencie, o ostrzeżeniu „stanął" i o tym, w którym tygodniu cyklu jest plan.
 *
 * ## Dlaczego strefa, a nie „czas serwera"
 *
 * Bo to nie to samo. Kontener chodzi w UTC, laptop trenera w czasie polskim;
 * między północą a drugą w nocy różnią się datą. Dzień kalendarzowy liczymy
 * więc jawnie w jednej strefie — tej, w której trener i klient żyją.
 */

/** Strefa, w której liczy się dni. Zmienna środowiskowa na wypadek przeprowadzki. */
export const STREFA = process.env.STREFA_CRAFTMYPLAN || "Europe/Warsaw";

// `sv-SE` daje `RRRR-MM-DD` bez składania z kawałków — to jedyny powód
// szwedzkiego w polskiej aplikacji.
const FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STREFA, year: "numeric", month: "2-digit", day: "2-digit",
});

const SAMA_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dzień kalendarzowy chwili, jako `RRRR-MM-DD`.
 *
 * Tekst, który jest już samą datą, wraca bez zmian. To nie jest uproszczenie:
 * `dataStartu` planu to data, a nie moment. Przepuszczenie jej przez strefę
 * przesunęłoby ją o dobę — czyli cykl zaczynałby się innego dnia, niż trener
 * wpisał.
 */
export function dzien(chwila: Date | string | number = Date.now()): string {
  if (typeof chwila === "string" && SAMA_DATA.test(chwila)) return chwila;
  const data = chwila instanceof Date ? chwila : new Date(chwila);
  return Number.isNaN(data.getTime()) ? "" : FORMAT.format(data);
}

/** Dzisiejsza data w strefie aplikacji. */
export const dzisiaj = (): string => dzien();

/**
 * Ile pełnych dni kalendarzowych minęło od `kiedy`. `null`, gdy daty nie ma;
 * liczba ujemna, gdy data jest w przyszłości.
 *
 * Oba końce sprowadzamy do północy UTC — nie po to, żeby liczyć w UTC, tylko
 * dlatego, że po ustaleniu dat kalendarzowych różnica ma być czystą liczbą dni.
 * Liczona po lokalnych północach gubiłaby godzinę przy zmianie czasu.
 */
export function dniOd(kiedy: string | null | undefined, doDnia = dzisiaj()): number | null {
  if (!kiedy) return null;
  const od = dzien(kiedy);
  if (!od) return null;
  return Math.round(
    (Date.parse(`${doDnia}T00:00:00Z`) - Date.parse(`${od}T00:00:00Z`)) / 86_400_000);
}
