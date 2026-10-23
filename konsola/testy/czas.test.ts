/**
 * Dni kalendarzowe — czyli różnica między „dziś" a „wczoraj" na ekranie trenera.
 *
 * Dotąd wszędzie stało `(Date.now() - Date.parse(kiedy)) / 86 400 000`: ile
 * upłynęło godzin, podzielone przez dwadzieścia cztery. Odtworzone na
 * działającej konsoli: trening domknięty 22 sierpnia o 19:00, konsola otwarta
 * 23 sierpnia o 9:38 — na ekranie „ostatnia aktywność: **dziś**". Klient tego
 * dnia nie ćwiczył wcale.
 *
 * Ludzie trenują wieczorem, więc to nie był przypadek rzadki, tylko typowy.
 * Ta sama arytmetyka decyduje o kolorze sygnału przy kliencie, o ostrzeżeniu
 * „stanął" po dziesięciu dniach i o tym, w którym tygodniu cyklu jest plan.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { dniOd, dzien, dzisiaj, STREFA } from "../czas.ts";

/** Chwila podana czasem polskim — tak, jak ją przeżywa trener i klient. */
const wWarszawie = (opis: string, przesuniecie: string) =>
  new Date(`${opis}${przesuniecie}`).toISOString();

describe("dzień kalendarzowy chwili", () => {
  test("liczy się w strefie trenera, nie w strefie serwera", () => {
    // Pół godziny po północy w Polsce to poprzedni dzień w UTC. Kontener
    // chodzi w UTC, laptop w czasie polskim — bez jawnej strefy jedno i drugie
    // odpowiadałoby inaczej na to samo pytanie.
    assert.equal(dzien(wWarszawie("2026-08-23T00:30:00", "+02:00")), "2026-08-23");
    assert.equal(dzien(wWarszawie("2026-08-22T23:30:00", "+02:00")), "2026-08-22");
  });

  test("sama data zostaje datą", () => {
    // `dataStartu` planu to data, a nie moment. Przepuszczona przez strefę
    // przesunęłaby się o dobę — czyli cykl zaczynałby się innego dnia, niż
    // trener wpisał.
    assert.equal(dzien("2026-08-23"), "2026-08-23");
    assert.equal(dzien("2026-01-01"), "2026-01-01");
  });

  test("strefa jest polska, dopóki nikt nie powie inaczej", () => {
    assert.equal(STREFA, "Europe/Warsaw");
  });

  test("dzisiaj to dzisiaj", () => {
    assert.match(dzisiaj(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("ile dni minęło", () => {
  test("wieczorny trening z wczoraj to „wczoraj”, a nie „dziś”", () => {
    // Ten jeden przypadek jest powodem, dla którego ten plik istnieje.
    const trening = wWarszawie("2026-08-22T19:00:00", "+02:00");
    assert.equal(dniOd(trening, "2026-08-23"), 1);
  });

  test("dwa treningi tego samego dnia to zero dni", () => {
    assert.equal(dniOd(wWarszawie("2026-08-23T06:00:00", "+02:00"), "2026-08-23"), 0);
    assert.equal(dniOd(wWarszawie("2026-08-23T22:00:00", "+02:00"), "2026-08-23"), 0);
  });

  test("data w przyszłości daje liczbę ujemną", () => {
    // Plan z datą startu za trzy dni jeszcze się nie zaczął.
    assert.equal(dniOd("2026-08-26", "2026-08-23"), -3);
  });

  test("brak daty to brak odpowiedzi, a nie zero", () => {
    // Zero znaczyłoby „dziś" — czyli klient, który nigdy nie ćwiczył,
    // wyglądałby na najaktywniejszego.
    assert.equal(dniOd(null), null);
    assert.equal(dniOd(undefined), null);
    assert.equal(dniOd(""), null);
  });

  test("zmiana czasu nie gubi dnia", () => {
    // Ostatnia niedziela marca ma w Polsce dwadzieścia trzy godziny. Licząc
    // po godzinach, doba się nie domyka i dzień znika.
    assert.equal(dniOd(wWarszawie("2026-03-28T23:00:00", "+01:00"), "2026-03-29"), 1);
    // I w drugą stronę: ostatnia niedziela października ma dwadzieścia pięć.
    assert.equal(dniOd(wWarszawie("2026-10-24T23:00:00", "+02:00"), "2026-10-25"), 1);
  });

  test("dziesięć dni to dziesięć, także gdy trening był wieczorem", () => {
    // Na tej liczbie stoi próg „stanął" i kolor sygnału przy kliencie.
    // Licząc po godzinach, wieczorny trening zaniżał ją o jeden — czyli
    // ostrzeżenie zapalało się dobę później, niż mówi jego własna definicja.
    assert.equal(dniOd("2026-08-13", "2026-08-23"), 10);
    assert.equal(dniOd(wWarszawie("2026-08-12T21:00:00", "+02:00"), "2026-08-23"), 11);
  });
});
