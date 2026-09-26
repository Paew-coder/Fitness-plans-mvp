#!/usr/bin/env node
/**
 * Konsola trenera.
 *
 *   npm start          → http://localhost:4173
 *
 * Bez frameworka. Dane w jednym pliku SQLite obok, cała matematyka w `silnik/` —
 * serwer tylko podaje dane i zwraca wynik przeliczenia.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import {
  przeliczPlan, porownajLiczenieJednostronnych, tydzienWyliczony, tygodniePlanu,
  numerTygodniaNaEkranie, TYDZIEN_MAKSOW, type Plan,
} from "../silnik/src/plan.ts";
import { sprawdzPlan, planGotowyDoWyslania } from "../silnik/src/walidacja.ts";
import { kopiaJesliTrzeba } from "./baza/kopie.ts";
import { SCIEZKA_BAZY } from "./baza/sciezka.ts";
import { powodNieuruchomienia, usunSlad, zapiszSlad } from "./baza/slad-pracy.ts";
import { powodNieotwarciaBazy } from "./baza/blad-bazy.ts";
import { bladSrodowiskaPythona } from "./blad-pythona.ts";
import { BladArkusza, wczytajPlanZArkusza, type WynikWczytania } from "./wczytaj-arkusz.ts";
import { bladKsztaltuPlanu, bladKsztaltuPropozycji, bladDatyStartu }
  from "./ksztalt-planu.ts";
import { sprawdzModuly } from "./ksztalt-modulow.ts";
import { dniOd, dzisiaj } from "./czas.ts";
import { adresyLokalnejSieci } from "./adresy.ts";
import { katalog } from "../silnik/src/katalog.ts";
import { PROGRESJE_BEZ_CIEZARU } from "../silnik/src/typy.ts";
import { zwyczajowyTopSet } from "../silnik/src/top-set.ts";
import { dlaczegoBezSeriiMaksymalnej } from "../silnik/src/seria-maksymalna.ts";
import { przerwaSekund } from "../silnik/src/przerwa.ts";
import { skalibruj } from "./kalibracja.ts";
import { zastosujSzablon } from "../silnik/src/szablony-planow.ts";
import { SZABLONY_BASE44 } from "../silnik/src/dane/szablony.ts";
import { najciezsza, serieWpisu, sprawdzSerie } from "./serie-wykonane.ts";
import { oblicz1RM, rozwiaz1RM, POWT_MAX } from "../silnik/src/rpe.ts";
import { propozycja1RM, ocenPropozycje, oneRMzSerii, type SeriaRobocza } from "../silnik/src/odczyt-1rm.ts";
import { zaokraglij } from "../silnik/src/pomocnicze.ts";
import { PRZECIWWSKAZANIA, dawkaOddechowa } from "../silnik/src/oddech.ts";
import { planBiegowy, strefyTetna, tempaTreningowe, hrMax, tempoTestowe, tempoTekst } from "../silnik/src/bieg.ts";
import { NORMY } from "../silnik/src/stres.ts";
import { planZArkusza, nierozpoznaneCwiczenia, type ZrzutArkusza } from "../silnik/src/import-arkusza.ts";
import { porownajCykle, podsumujPorownanie } from "../silnik/src/porownanie-cykli.ts";
import { historiaKlienta, podsumujHistorie } from "../silnik/src/historia-klienta.ts";
import { skopiujTydzien, zastosujProgresje } from "../silnik/src/progresja.ts";
import * as magazyn from "./magazyn.ts";
import { trenerDomyslny } from "./baza/polaczenie.ts";
import * as auth from "./uwierzytelnianie.ts";
import { BladEksportu, eksportujDoArkusza } from "./eksport-xlsx.ts";
import { BladAI, stan as stanAI } from "./ai/klient.ts";
import {
  iluNadpisze, przeliczPropozycje, zaproponujSzkielet, zastosujPropozycje,
  type Propozycja, type WejscieSzkieletu,
} from "./ai/szkielet.ts";
import { odczytajAnalize } from "./ai/analiza.ts";
import { KOMUNIKAT_ZDROWOTNY } from "./ai/sygnaly.ts";

const KATALOG = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(KATALOG, "public");
const PORT = Number(process.env.PORT ?? 4173);

/**
 * Właściciel danych w tej instalacji.
 *
 * Trener jest dziś jeden, więc to stała. Gdy dojdą kolejni, `rozpoznajTrenera`
 * poniżej już zwraca id z sesji — zmieni się tylko to, że przestanie mieć
 * awaryjny tryb lokalny.
 */
/**
 * Pierwsze dotknięcie bazy. Idzie przez `try`, bo to tutaj wychodzi uszkodzony
 * plik, brak praw do katalogu albo pełny dysk — a każde z nich kończyło się
 * śladem stosu po angielsku w oknie, które zaraz potem gasło.
 */
function pierwszeOtwarcieBazy(): number {
  try {
    return trenerDomyslny();
  } catch (blad) {
    console.error(`\n  ${powodNieotwarciaBazy(blad, SCIEZKA_BAZY)}\n`);
    process.exit(1);
  }
}

const TRENER = pierwszeOtwarcieBazy();

/** Czy odpowiedzi mogą oznaczać ciasteczko jako `Secure`. */
const ZA_HTTPS = process.env.ZA_HTTPS === "1";

/**
 * Kto pyta.
 *
 * Zwraca id trenera albo powód odmowy. W trybie lokalnym (konto bez hasła)
 * przepuszcza tylko połączenia z tej samej maszyny — dzięki temu wystawienie
 * konsoli na świat bez ustawienia hasła nie kończy się otwartym dostępem,
 * tylko czytelnym komunikatem.
 */
function rozpoznajTrenera(req: IncomingMessage): { trenerId: number } | { odmowa: string; kod: number } {
  const token = auth.ciastkoZNaglowka(req.headers.cookie);
  const zSesji = auth.trenerZSesji(token);
  if (zSesji !== null) return { trenerId: zSesji };

  const tryb = auth.trybDostepu(TRENER);
  if (tryb.tryb === "lokalny") {
    if (auth.zLokalnejMaszyny(req.socket.remoteAddress)) return { trenerId: tryb.trenerId };
    return {
      kod: 403,
      odmowa: "Ta konsola nie ma ustawionego hasła, więc działa tylko lokalnie. "
        + "Ustaw hasło komendą `npm run haslo`, zanim wystawisz ją na zewnątrz.",
    };
  }
  return { kod: 401, odmowa: "Zaloguj się." };
}

const TYPY: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  // Ikony aplikacji klienta. Bez właściwego typu przeglądarka dostaje
  // „application/octet-stream" i ma pełne prawo ikonę odrzucić — a wtedy
  // dodanie do ekranu głównego daje zrzut strony zamiast sztangi.
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

/**
 * Odpowiedź wysyła się dokładnie raz.
 *
 * Gdy coś wywali się już po wysłaniu nagłówków, obsługa błędu próbowała
 * odpowiedzieć drugi raz — a `writeHead` rzuca wtedy wyjątek **spoza** bloku
 * `try`, czyli kładzie cały proces. Jeden nieudany odczyt pliku wystarczał,
 * żeby konsola zniknęła razem z dostępem wszystkich klientów.
 */
function json(res: ServerResponse, dane: unknown, kod = 200): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  const tresc = JSON.stringify(dane);
  res.writeHead(kod, { "content-type": "application/json; charset=utf-8" });
  res.end(tresc);
}

function blad(res: ServerResponse, wiadomosc: string, kod = 400): void {
  json(res, { blad: wiadomosc }, kod);
}

async function bajty(req: IncomingMessage): Promise<Buffer> {
  const kawalki: Buffer[] = [];
  for await (const k of req) kawalki.push(k as Buffer);
  return Buffer.concat(kawalki);
}

/**
 * Błąd, za który odpowiada nadawca żądania, nie serwer.
 *
 * Rozróżnienie ma konkretny skutek po drugiej stronie: kolejka offline
 * w telefonie klienta traktuje 5xx jako „serwer ma zły dzień, spróbuj później",
 * a 4xx jako „tego nie da się zapisać nigdy, wyrzuć zadanie". Zniekształcone
 * żądanie odsyłane z kodem 500 wracałoby w nieskończoność i zatykało kolejkę
 * — czyli dokładnie ten błąd, który już raz naprawialiśmy, tylko wpuszczony
 * z powrotem tylnymi drzwiami.
 */
class BladZadania extends Error {
  readonly kod = 400;
}

/**
 * Odczytane ciała żądań. Strumienia nie da się przeczytać dwa razy, a od
 * kiedy trasa klienta zagląda do `planId` **przed** wybraniem obsługi,
 * to samo ciało czyta się w dwóch miejscach. Bez tej pamięci drugi odczyt
 * dostawał pustkę — czyli zapis szedł do bazy bez połowy danych.
 */
const odczytaneCiala = new WeakMap<IncomingMessage, any>();

async function cialo(req: IncomingMessage): Promise<any> {
  if (odczytaneCiala.has(req)) return odczytaneCiala.get(req);
  const dane = await bajty(req);
  if (dane.length === 0) {
    odczytaneCiala.set(req, {});
    return {};
  }
  let odczytane: unknown;
  try {
    odczytane = JSON.parse(dane.toString("utf-8"));
  } catch {
    throw new BladZadania("Treść żądania nie jest poprawnym JSON-em.");
  }
  // Reszta kodu czyta z ciała pola po nazwie, więc wszystko, co nie jest
  // obiektem — tablica, liczba, `null` — musi odpaść tutaj, a nie przy
  // pierwszym `.trim()` na liczbie.
  if (odczytane === null || typeof odczytane !== "object" || Array.isArray(odczytane)) {
    throw new BladZadania("Treść żądania musi być obiektem JSON.");
  }
  odczytaneCiala.set(req, odczytane);
  return odczytane;
}

/** Tekst z ciała żądania — cokolwiek przyszło, wychodzi napis albo pustka. */
function tekst(wartosc: unknown): string {
  return typeof wartosc === "string" ? wartosc.trim() : "";
}

/**
 * Nazwisko klienta — jedyne pole, które trafia do identyfikatora planu,
 * do nazwy pliku eksportu i na ekran klienta. Trzy rzeczy muszą tu odpaść:
 * pustka, długość spoza rozsądku (identyfikator planu powstaje z tego tekstu)
 * i znaki sterujące, które w nazwie pliku nie mają czego szukać.
 */
const DLUGOSC_NAZWY = 120;
function nazwaKlienta(wartosc: unknown): { nazwa: string } | { blad: string } {
  const surowa = tekst(wartosc);
  if (!surowa) return { blad: "Podaj nazwisko klienta" };
  if (surowa.length > DLUGOSC_NAZWY) {
    return { blad: `Nazwisko może mieć najwyżej ${DLUGOSC_NAZWY} znaków` };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(surowa)) {
    return { blad: "Nazwisko zawiera znaki, których nie da się zapisać" };
  }
  return { nazwa: surowa };
}

/**
 * Granice wartości, które przychodzą z telefonu klienta.
 *
 * Klient nie jest przeciwnikiem — ale jest **bez nadzoru**. Zamiast 100 kg
 * wpisze 1000, kolejka sprzed dwóch cykli przyniesie numer tygodnia, którego
 * już nie ma, a nieznane odczucie wywali zapis na ograniczeniu w bazie.
 * Wszystko to trafiało dotąd wprost do danych trenera i psuło jego liczby:
 * frekwencję, propozycje 1RM, wykres wagi, a przy serii maksymalnej — ciężary
 * na całe sześć tygodni.
 *
 * Granice są celowo szerokie. Mają odciąć wartości, które nie mogą być
 * prawdziwe, a nie zgadywać, co klient miał na myśli.
 */
const GRANICE = {
  // 7 — deload, 8 — maksy. Czy plan dany tydzień ma, sprawdza `tygodniePlanu`.
  tydzien: [1, 8],
  dzien: [1, 5],
  /** Rekord świata w martwym ciągu to około 500 kg. */
  ciezar: [0, 1000],
  powtorzenia: [0, 200],
  /** Masa ciała dorosłego człowieka, z zapasem w obie strony. */
  waga: [20, 400],
} as const;

const ODCZUCIA = ["za łatwe", "OK", "za trudne"];

/** Liczba całkowita z zakresu albo `null`. */
function wZakresie(wartosc: unknown, [dol, gora]: readonly [number, number],
                   calkowita = true): number | null {
  const n = liczbaZadania(wartosc);
  if (n === null || n < dol || n > gora) return null;
  return calkowita ? Math.trunc(n) : n;
}

/** Liczba z ciała żądania. Nieskończoności i teksty odpadają jako `null`. */
function liczbaZadania(wartosc: unknown): number | null {
  const n = typeof wartosc === "number" ? wartosc : Number(wartosc);
  return Number.isFinite(n) ? n : null;
}

/**
 * Realizacja planu — co klient faktycznie zrobił.
 *
 * Tego arkusz nie potrafi w ogóle: przechowuje plan, nie wykonanie. Dopiero
 * odkąd klient odhacza treningi w telefonie, da się odpowiedzieć na pytanie
 * „czy on w ogóle ćwiczy".
 */
function realizacja(zapisany: magazyn.ZapisanyPlan, klient?: magazyn.Klient | null) {
  const ukonczone = zapisany.ukonczoneDni ?? [];
  const wykonania = zapisany.wykonania ?? [];
  const dniWPlanie = new Set(zapisany.plan.sloty.filter((s) => s.cwiczenieId).map((s) => s.dzien));

  const daty = [...ukonczone.map((u) => u.data), ...wykonania.map((w) => w.data)].sort();
  const ostatniaAktywnosc = daty.at(-1) ?? null;

  // W dniach kalendarzowych, nie w dobach: trening z wczorajszego wieczoru ma
  // być „wczoraj", a nie „dziś" tylko dlatego, że nie minęły jeszcze 24 godziny.
  const dniOdOstatniej = dniOd(ostatniaAktywnosc);

  // Dzień „rozpoczęty" to taki, w którym klient cokolwiek ocenił — nawet jeśli
  // zapomniał kliknąć „Zakończ trening". Na siłowni to się zdarza notorycznie,
  // a licząc tylko domknięte dni widzielibyśmy zero przy klientach, którzy ćwiczą.
  // Wykonanie zna tylko slot, więc dzień trzeba odczytać z planu.
  const dzienSlotu = new Map(zapisany.plan.sloty.map((s) => [s.positionId, s.dzien]));
  const kluczDnia = (tydzien: number, dzien: number | undefined) => `${tydzien}/${dzien}`;
  const domkniete = new Set(ukonczone.map((u) => kluczDnia(u.tydzien, u.dzien)));
  // Tydzień maksów to jeden dzień, choć boje stoją w planie w różnych dniach.
  const dzienWpisu = (w: magazyn.Wykonanie) =>
    w.tydzien === TYDZIEN_MAKSOW ? 1 : dzienSlotu.get(w.positionId);
  const rozpoczete = new Set(
    wykonania
      .map((w) => kluczDnia(w.tydzien, dzienWpisu(w)))
      .filter((k) => !k.endsWith("/undefined") && !domkniete.has(k)),
  );
  const tygodnie = tygodnieRealizacji(zapisany.plan, dniWPlanie.size);
  const wTygodniu = (zbior: Set<string>, tydzien: number) =>
    [...zbior].filter((k) => k.startsWith(`${tydzien}/`)).length;

  return {
    // Link jest jeden na klienta i przeżywa cykle, więc pytamy o klienta.
    maDostep: Boolean((klient ?? magazyn.wczytajKlienta(zapisany.trenerId, zapisany.klientId))?.token),
    trenowaneDni: dniWPlanie.size,
    zaplanowanych: tygodnie.reduce((a, t) => a + t.zDnia, 0),
    ukonczonych: domkniete.size,
    rozpoczetych: rozpoczete.size,
    ostatniaAktywnosc,
    dniOdOstatniej,
    odczucia: {
      latwe: wykonania.filter((w) => w.feedback === "za łatwe").length,
      ok: wykonania.filter((w) => w.feedback === "OK").length,
      trudne: wykonania.filter((w) => w.feedback === "za trudne").length,
    },
    tygodnie: tygodnie.map((t) => ({
      ...t,
      ukonczonych: wTygodniu(domkniete, t.tydzien),
      rozpoczetych: wTygodniu(rozpoczete, t.tydzien),
    })),
  };
}

/**
 * Tygodnie, które klient ma do zrobienia: sześć roboczych i te po cyklu.
 * Deload ma tyle dni co plan, tydzień maksów — jeden (wszystkie boje naraz).
 */
function tygodnieRealizacji(plan: Plan, dniWPlanie: number) {
  const maksy = plan.tydzienMaksow
    ? (tydzienWyliczony(przeliczPlan(plan), TYDZIEN_MAKSOW)?.sloty.length ?? 0) > 0
    : false;
  return tygodniePlanu(plan)
    .filter((tydzien) => tydzien !== TYDZIEN_MAKSOW || maksy)
    .map((tydzien) => ({
      tydzien,
      numer: numerTygodniaNaEkranie(plan, tydzien),
      rodzaj: tydzien === 7 ? "deload" : tydzien === TYDZIEN_MAKSOW ? "maksy" : null,
      zDnia: tydzien === TYDZIEN_MAKSOW ? 1 : dniWPlanie,
    }));
}

/**
 * Propozycje nowego 1RM odczytane z serii roboczych.
 *
 * Arkusz umie tylko jedno: seria maksymalna na starcie cyklu. Tu zamiast tego
 * czytamy, co klient faktycznie podnosił przez sześć tygodni. Trener dostaje
 * propozycję i decyduje — nic nie zmienia się samo.
 */
/**
 * Propozycje nowego 1RM policzone z serii roboczych.
 *
 * `zrodlo` to cykl, z którego bierzemy wykonania; `serieObecne` to serie
 * maksymalne planu, który ma być poprawiony. Zwykle jedno i drugie pochodzi
 * z tego samego planu — ale przy pierwszym tygodniu nowego cyklu wykonań
 * jeszcze nie ma, a te z cyklu poprzedniego są najlepszym, co mamy.
 */
function propozycje1RM(
  zrodlo: magazyn.ZapisanyPlan,
  wynikZrodla: ReturnType<typeof przeliczPlan>,
  serieObecne: readonly { cwiczenieId: string; ciezar: number; powtorzenia: number }[]
    = zrodlo.plan.serieMaksymalne,
) {
  const zapisany = zrodlo;
  const wynik = wynikZrodla;
  const wykonania = (zapisany.wykonania ?? [])
    .filter((w) => w.ciezarWykonany && w.powtorzeniaWykonane)
    .sort((a, b) => a.data.localeCompare(b.data));
  if (wykonania.length === 0) return [];

  // Sloty grupujemy po ćwiczeniu — to samo ćwiczenie może stać w kilku dniach.
  const wgCwiczenia = new Map<string, SeriaRobocza[]>();
  for (const w of wykonania) {
    // Tylko sześć tygodni pracy: deload idzie celowo lżej, a wynik z tygodnia
    // maksów wchodzi do nowego cyklu wprost (`serieZTygodniaMaksow`).
    const slot = wynik.tygodnie[w.tydzien - 1]?.sloty.find((s) => s.positionId === w.positionId);
    if (!slot?.cwiczenie || typeof slot.rpe !== "number") continue;
    // Ćwiczenie z wpisu, nie ze slotu. Po podmianie w środku cyklu slot mówi,
    // co klient robi **teraz** — a te kilogramy podniósł na czymś innym
    // i policzone jako nowe ćwiczenie wróciłyby na sztangę w kolejnym cyklu.
    // Stare wpisy nie mają tej informacji; dla nich slot to nadal najlepsze,
    // co mamy.
    const cwiczenieWykonane = w.cwiczenieId ?? slot.cwiczenie.id;
    const lista = wgCwiczenia.get(cwiczenieWykonane) ?? [];
    lista.push({
      ciezar: w.ciezarWykonany!,
      powtorzenia: w.powtorzeniaWykonane!,
      rpePlanowane: slot.rpe,
      feedback: w.feedback ?? null,
    });
    wgCwiczenia.set(cwiczenieWykonane, lista);
  }

  return [...wgCwiczenia].flatMap(([cwiczenieId, serie]) => {
    const obecne = rozwiaz1RM(cwiczenieId, serieObecne);
    const p = propozycja1RM(serie, obecne);
    if (!p || p.oneRM === obecne) return [];   // przyjęte albo bez zmiany — nie ma o czym mówić
    return [{
      cwiczenieId,
      nazwa: katalog.poId(cwiczenieId)?.nazwa ?? cwiczenieId,
      obecne1RM: obecne || null,
      ...p,
      ocena: ocenPropozycje(p),
    }];
  }).sort((a, b) => a.nazwa.localeCompare(b.nazwa, "pl"));
}

/**
 * Nowy cykl zaczyna z 1RM sprzed sześciu tygodni — bo serie maksymalne
 * przechodzą z poprzedniego planu razem z doborem ćwiczeń. Klient przez ten
 * czas urósł, więc każdy ciężar wychodzi za lekki, a na ekranie nie widać
 * nawet, że liczby są stare.
 *
 * Konsola umie policzyć nowy 1RM z tego, co klient faktycznie podnosił — tyle
 * że te dane zostały w poprzednim cyklu. Wyciągamy je stamtąd i pokazujemy
 * przy nowym planie. Nic się nie zmienia samo: to dalej propozycja z przyciskiem.
 */
function scalPropozycje<T extends { cwiczenieId: string }>(wlasne: T[], starsze: T[]): T[] {
  // Świeższe dane wygrywają: wykonanie z tego cyklu mówi więcej niż sprzed sześciu tygodni.
  const juzJest = new Set(wlasne.map((p) => p.cwiczenieId));
  return [...wlasne, ...starsze.filter((p) => !juzJest.has(p.cwiczenieId))];
}

function propozycjeZPoprzedniegoCyklu(zapisany: magazyn.ZapisanyPlan) {
  if (!zapisany.poprzedniId) return [];
  const poprzedni = magazyn.wczytaj(zapisany.trenerId, zapisany.poprzedniId);
  if (!poprzedni?.wykonania?.length) return [];

  // Boje zmaksowane w tygodniu maksów mają już 1RM z próby — szacunek
  // z serii roboczych tego samego cyklu mógłby go tylko po cichu zaniżyć.
  const zMaksow = new Set(zapisany.plan.serieMaksymalne
    .filter((s) => s.zTygodniaMaksow != null).map((s) => s.cwiczenieId));
  return propozycje1RM(poprzedni, przeliczPlan(poprzedni.plan), zapisany.plan.serieMaksymalne)
    .filter((p) => zapisany.plan.sloty.some((s) => s.cwiczenieId === p.cwiczenieId))
    .filter((p) => !zMaksow.has(p.cwiczenieId))
    .map((p) => ({ ...p, zPoprzedniegoCyklu: poprzedni.wersja }));
}

/**
 * Gdzie w cyklu jest klient, licząc od daty startu.
 * Cykl to sześć tygodni; po ostatnim czas na nową wersję planu.
 */
function cyklWCzasie(zapisany: magazyn.ZapisanyPlan) {
  // Z deloadem i maksami cykl ma siedem albo osiem tygodni, nie sześć.
  const tygodni = tygodniePlanu(zapisany.plan).length;
  const dlugosc = tygodni * 7;
  const dni = dniOd(zapisany.dataStartu);
  if (dni === null) return { tydzien: null, tygodni, doStartu: null, doKonca: null, poCyklu: false };
  // Data startu w przyszłości — plan czeka, cykl jeszcze się nie zaczął.
  if (dni < 0) {
    return { tydzien: null, tygodni, doStartu: -dni, doKonca: dlugosc - dni, poCyklu: false };
  }
  return {
    // Numer na ekranie (1…7 albo 8), nie klucz tygodnia.
    tydzien: Math.min(Math.floor(dni / 7) + 1, tygodni),
    tygodni,
    doStartu: null,
    doKonca: dlugosc - dni,
    poCyklu: dni >= dlugosc,
  };
}

/** Ile dni bez treningu znaczy „stanął". Tyle samo, co próg sygnału na liście. */
export const PROG_STANAL = 10;

export type Powod =
  | { rodzaj: "stanal"; dni: number }
  | { rodzaj: "zrobiony"; ukonczonych: number }
  | { rodzaj: "koniec cyklu"; doKonca: number }
  | { rodzaj: "po cyklu"; dni: number }
  | { rodzaj: "bez linku" }
  | { rodzaj: "nie zaczal"; dni: number };

/**
 * Kto dziś wymaga uwagi trenera.
 *
 * To jest odpowiedź na pytanie, którego arkusz nie umiał zadać: przy kilkunastu
 * klientach trzeba było otwierać kilkanaście plików, żeby zauważyć, że ktoś
 * zniknął.
 *
 * Jeden wiersz na **klienta**, nie na plan. Wcześniej lista liczyła każdy
 * wysłany plan osobno, więc klient z trzema zamkniętymi cyklami wołał o uwagę
 * trzy razy — a wołać ma o niego jego bieżący plan, ten sam, który widzi
 * pod swoim linkiem.
 */
function wymagajaUwagi(trenerId: number) {
  const wynik: { id: string; klientId: string; klient: string; wersja: number; powody: Powod[] }[] = [];

  for (const klient of magazyn.listaKlientow(trenerId)) {
    const zapisany = magazyn.aktywnyPlan(trenerId, klient.id);
    if (!zapisany || zapisany.status !== "wysłany") continue;

    const r = realizacja(zapisany, klient);
    const c = cyklWCzasie(zapisany);
    const powody: Powod[] = [];

    if (!r.maDostep) {
      powody.push({ rodzaj: "bez linku" });
    } else if (r.dniOdOstatniej === null) {
      const odWyslania = dniOd(zapisany.zmieniony);
      if (odWyslania !== null && odWyslania >= 3) {
        powody.push({ rodzaj: "nie zaczal", dni: odWyslania });
      }
    } else if (r.dniOdOstatniej > PROG_STANAL) {
      powody.push({ rodzaj: "stanal", dni: r.dniOdOstatniej });
    }

    /**
     * Cykl przerobiony do końca — najpilniejszy powód, jaki może się tu pojawić,
     * bo klient **nie ma już czego trenować**.
     *
     * Pozostałe powody „końca cyklu" liczą się z daty startu, a ta bywa pusta:
     * plan bez wpisanej daty nie wołał więc o uwagę nigdy. Sprawdzone —
     * klient z 12 z 12 domkniętych treningów nie pojawiał się na liście
     * ani razu, choć to jest dokładnie ta chwila, w której trener ma zadziałać.
     */
    if (r.zaplanowanych > 0 && r.ukonczonych >= r.zaplanowanych) {
      powody.push({ rodzaj: "zrobiony", ukonczonych: r.ukonczonych });
    } else if (c.poCyklu) {
      powody.push({ rodzaj: "po cyklu", dni: -c.doKonca! });
    } else if (c.doKonca !== null && c.doKonca <= 7) {
      powody.push({ rodzaj: "koniec cyklu", doKonca: c.doKonca });
    }

    if (powody.length > 0) {
      wynik.push({
        id: zapisany.id, klientId: klient.id,
        klient: klient.nazwa, wersja: zapisany.wersja, powody,
      });
    }
  }

  // Najpierw ci, którzy skończyli — bo nie mają już czego robić. Potem ci,
  // którzy zniknęli. Reszta poczeka.
  const waga = (p: Powod) =>
    p.rodzaj === "zrobiony" ? 0 : p.rodzaj === "stanal" ? 1
      : p.rodzaj === "nie zaczal" ? 2 : p.rodzaj === "bez linku" ? 3
        : p.rodzaj === "po cyklu" ? 4 : 5;
  return wynik.sort((a, b) => Math.min(...a.powody.map(waga)) - Math.min(...b.powody.map(waga)));
}

/**
 * Postęp klienta w cyklu — do pokazania jemu, nie trenerowi.
 *
 * Trzy rzeczy, których arkusz nie umiał: co ćwiczenie robi w czasie, ile
 * treningów odhaczonych i jak idzie waga. Wszystkie trzy liczą się z historii
 * wykonań, która powstaje sama przy odhaczaniu.
 */
function postepKlienta(zapisany: magazyn.ZapisanyPlan, wynik: ReturnType<typeof przeliczPlan>) {
  const wykonania = zapisany.wykonania ?? [];
  const ukonczone = zapisany.ukonczoneDni ?? [];
  const dniWPlanie = new Set(zapisany.plan.sloty.filter((s) => s.cwiczenieId).map((s) => s.dzien));

  // Co ćwiczenie zrobiło w czasie — tylko tam, gdzie klient wpisał ciężar.
  const wgCwiczenia = new Map<string, {
    nazwa: string;
    bez1RM: boolean;
    punkty: {
      tydzien: number; numer: number; rodzaj: string | null;
      ciezar: number; powtorzenia: number; oneRM: number | null;
    }[];
  }>();
  for (const w of wykonania) {
    if (!w.ciezarWykonany || !w.powtorzeniaWykonane) continue;
    // Także deload i maksy: jedno powtórzenie na RPE 10 to najczystszy
    // odczyt siły, jaki ten ekran może dostać.
    const slot = tydzienWyliczony(wynik, w.tydzien)?.sloty.find((s) => s.positionId === w.positionId);
    if (!slot?.cwiczenie || typeof slot.rpe !== "number") continue;
    // Ćwiczenie, które klient wtedy faktycznie robił — trener mógł później
    // wstawić w to miejsce inne, a cudze kilogramy nie są niczyim postępem.
    const cwiczenie = (w.cwiczenieId ? katalog.poId(w.cwiczenieId) : null) ?? slot.cwiczenie;
    // Ciężar ustawiany ręcznie (np. Dead bug z 2 kg) nie ma 1RM — tabela RPE
    // nic o takim ruchu nie wie, a „1RM ≈ 6 kg" przy dead bugu to bzdura.
    // Zostają same kilogramy.
    const bez1RM = PROGRESJE_BEZ_CIEZARU.includes(cwiczenie.progresja);
    const e = bez1RM ? null : oneRMzSerii({
      ciezar: w.ciezarWykonany,
      powtorzenia: w.powtorzeniaWykonane,
      rpePlanowane: slot.rpe,
      feedback: w.feedback ?? null,
    });
    if (!bez1RM && !e) continue;
    const wpis = wgCwiczenia.get(cwiczenie.id)
      ?? { nazwa: cwiczenie.nazwa, bez1RM, punkty: [] };
    wpis.punkty.push({
      tydzien: w.tydzien,
      numer: numerTygodniaNaEkranie(zapisany.plan, w.tydzien),
      rodzaj: tydzienWyliczony(wynik, w.tydzien)?.rodzaj ?? null,
      ciezar: w.ciezarWykonany,
      powtorzenia: w.powtorzeniaWykonane,
      oneRM: e?.oneRM ?? null,
    });
    wgCwiczenia.set(cwiczenie.id, wpis);
  }

  const cwiczenia = [...wgCwiczenia]
    .map(([cwiczenieId, w]) => {
      const punkty = w.punkty.sort((a, b) => a.tydzien - b.tydzien);
      const pierwszy = punkty[0]!;
      const ostatni = punkty.at(-1)!;
      /*
       * Zmiana liczona z szacowanego 1RM, a nie z kilogramów na sztandze.
       *
       * Kilogramy wynikają z programowania, nie z formy: plan zmienia ciężar
       * i powtórzenia tydzień po tygodniu, a w T4 restartuje blok niżej.
       * Zgłoszone z testów: przy 55 kg × 9 w T1 i 50 kg × 11 w T2 nagłówek
       * mówił „−5 kg (−9,1%)", czyli regres — a siła zmieniła się o 2%.
       * Kilogramy zostają w punktach tydzień po tygodniu, tam, gdzie mają sens.
       */
      return {
        cwiczenieId,
        nazwa: w.nazwa,
        bez1RM: w.bez1RM,
        punkty,
        // Ile różnych tygodni — przy jednym nie ma z czym porównać.
        tygodni: new Set(punkty.map((x) => x.tydzien)).size,
        oneRMPierwszy: pierwszy.oneRM,
        oneRMOstatni: ostatni.oneRM,
        zmiana1RMProc: pierwszy.oneRM && ostatni.oneRM
          ? zaokraglij(((ostatni.oneRM - pierwszy.oneRM) / pierwszy.oneRM) * 100, 1)
          : null,
        // Przy ciężarze bez 1RM porównuje się same kilogramy.
        ciezarPierwszy: pierwszy.ciezar,
        ciezarOstatni: ostatni.ciezar,
      };
    })
    .sort((a, b) => a.nazwa.localeCompare(b.nazwa, "pl"));

  const waga = [...(zapisany.waga ?? [])].sort((a, b) => a.data.localeCompare(b.data));

  return {
    frekwencja: (() => {
      const tygodnie = tygodnieRealizacji(zapisany.plan, dniWPlanie.size);
      return {
        ukonczonych: ukonczone.length,
        zaplanowanych: tygodnie.reduce((a, t) => a + t.zDnia, 0),
        tygodnie: tygodnie.map((t) => ({
          ...t,
          ukonczonych: ukonczone.filter((u) => u.tydzien === t.tydzien).length,
        })),
      };
    })(),
    cwiczenia,
    waga: {
      punkty: waga,
      zmianaKg: waga.length >= 2
        ? zaokraglij(waga.at(-1)!.kg - waga[0]!.kg, 1)
        : null,
    },
  };
}

/**
 * Moduły towarzyszące planowi siłowemu: oddech i bieg.
 * Oba są niezależne od reszty — liczą się z własnych pól i niczego nie zmieniają
 * w planie. Jeśli trener ich nie wypełni, po prostu ich nie ma.
 */
function moduly(zapisany: magazyn.ZapisanyPlan) {
  const o = zapisany.oddech;
  const b = zapisany.bieg;
  const tempoBazowe = b ? tempoTestowe(b) : null;
  return {
    oddech: {
      wejscie: o ?? { twot: null, przeciwwskazania: false },
      dawka: o?.twot != null ? dawkaOddechowa(o.twot, o.przeciwwskazania) : null,
      // Lista idzie z silnika, a nie z szablonu strony. Przepisana do HTML-a
      // rozjechałaby się z tą, według której moduł faktycznie się zatrzymuje —
      // a to jest pole, przy którym rozjazd znaczy zdrowie klienta.
      przeciwwskazaniaLista: PRZECIWWSKAZANIA,
    },
    bieg: {
      wejscie: b ?? {},
      hrMax: b ? hrMax(b) : null,
      tempoTestowe: tempoBazowe === null ? null : tempoTekst(tempoBazowe),
      strefy: b ? strefyTetna(b) : [],
      tempa: b ? tempaTreningowe(b) : [],
      tygodnie: b ? planBiegowy(b) : [],
    },
  };
}

/**
 * Porównanie z poprzednim cyklem klienta.
 *
 * Arkusz widzi jeden plan naraz — żeby odpowiedzieć na pytanie „czy w tym
 * cyklu robi więcej", trzeba było otworzyć dwa pliki obok siebie. Przy
 * czwartej wersji planu to przestaje działać.
 *
 * `null`, gdy plan nie wskazuje poprzedniego cyklu albo poprzedni zniknął.
 */
function porownanieZPoprzednim(
  zapisany: magazyn.ZapisanyPlan,
  wynik: ReturnType<typeof przeliczPlan>,
) {
  if (!zapisany.poprzedniId) return null;
  const poprzedni = magazyn.wczytaj(zapisany.trenerId, zapisany.poprzedniId);
  if (!poprzedni) return null;

  const porownanie = porownajCykle(przeliczPlan(poprzedni.plan), wynik);
  return {
    ...porownanie,
    nazwaPoprzednia: `${poprzedni.klient} ${poprzedni.wersja}.0`,
    nazwaObecna: `${zapisany.klient} ${zapisany.wersja}.0`,
    podsumowanie: podsumujPorownanie(porownanie),
  };
}

/**
 * Kartoteka klienta — wszystkie jego cykle naraz.
 *
 * Konsola przez pierwsze fazy myślała planami: lista planów, ekran planu,
 * porównanie z poprzednim. Trener myśli ludźmi. Przy czwartej wersji planu
 * płaska lista przestaje odpowiadać na pytanie „jak idzie Zuzannie" —
 * odpowiada na nie dopiero cała seria cykli obok siebie.
 */
function kartotekaKlienta(trenerId: number, klientId: string) {
  const klient = magazyn.wczytajKlienta(trenerId, klientId);
  if (!klient) return null;

  const plany = magazyn.planyKlienta(trenerId, klientId);
  const historia = historiaKlienta(plany.map((zapisany) => {
    const r = realizacja(zapisany, klient);
    return {
      wersja: zapisany.wersja,
      status: zapisany.status,
      dataStartu: zapisany.dataStartu,
      wynik: przeliczPlan(zapisany.plan),
      ukonczonych: r.ukonczonych,
      zaplanowanych: r.zaplanowanych,
    };
  }));

  const aktywny = magazyn.aktywnyPlan(trenerId, klientId);
  return {
    klient,
    historia,
    podsumowanie: podsumujHistorie(historia),
    waga: magazyn.wagaKlienta(trenerId, klientId),
    aktywnyPlanId: aktywny?.id ?? null,
    plany: plany.map((zapisany) => ({
      id: zapisany.id,
      wersja: zapisany.wersja,
      status: zapisany.status,
      dataStartu: zapisany.dataStartu,
      zmieniony: zapisany.zmieniony,
      cwiczen: zapisany.plan.sloty.filter((slot) => slot.cwiczenieId).length,
      cykl: cyklWCzasie(zapisany),
      realizacja: realizacja(zapisany, klient),
    })),
  };
}

/** Wiersz listy klientów: kto to, ile cykli, co się z nim dzieje teraz. */
function pozycjaListyKlientow(trenerId: number, klient: magazyn.Klient) {
  const plany = magazyn.planyKlienta(trenerId, klient.id);
  const aktywny = magazyn.aktywnyPlan(trenerId, klient.id);
  const najnowszy = plany.at(-1) ?? null;
  return {
    id: klient.id,
    nazwa: klient.nazwa,
    maLink: Boolean(klient.token),
    cykli: plany.length,
    najnowszaWersja: najnowszy?.wersja ?? null,
    statusNajnowszego: najnowszy?.status ?? null,
    aktywnyPlanId: aktywny?.id ?? null,
    // Sygnał i tydzień cyklu bierzemy z planu, po którym klient dziś trenuje.
    realizacja: aktywny ? realizacja(aktywny, klient) : null,
    cykl: aktywny ? cyklWCzasie(aktywny) : null,
  };
}

/** Pełny obraz planu dla interfejsu: wynik, uwagi, gotowość. */
function obrazPlanu(zapisany: magazyn.ZapisanyPlan) {
  const klient = magazyn.wczytajKlienta(zapisany.trenerId, zapisany.klientId);
  const wynik = przeliczPlan(zapisany.plan);
  const uwagi = sprawdzPlan(zapisany.plan, wynik, {
    cwiczeniaZPoprzedniegoCyklu: magazyn.cwiczeniaZPoprzedniegoCyklu(zapisany),
  });
  return {
    zapisany,
    klient,
    wynik,
    uwagi,
    gotowy: planGotowyDoWyslania(uwagi),
    jednostronne: porownajLiczenieJednostronnych(zapisany.plan),
    realizacja: realizacja(zapisany, klient),
    propozycje1RM: scalPropozycje(
      propozycje1RM(zapisany, wynik), propozycjeZPoprzedniegoCyklu(zapisany)),
    porownanie: porownanieZPoprzednim(zapisany, wynik),
    moduly: moduly(zapisany),
    normy: NORMY,
  };
}

/**
 * Plan widziany oczami klienta — tylko to, co potrzebne na siłowni.
 * Bez analizy stresu, bez norm, bez nazwisk innych klientów.
 */
function widokKlienta(zapisany: magazyn.ZapisanyPlan) {
  const wynik = przeliczPlan(zapisany.plan);
  const ukonczone = zapisany.ukonczoneDni ?? [];
  const wykonanie = (positionId: string, tydzien: number) =>
    (zapisany.wykonania ?? []).find((w) => w.positionId === positionId && w.tydzien === tydzien);

  /** Czy wpis dotyczy ćwiczenia, które w tym slocie stoi teraz. */
  const zTegoCwiczenia = (
    w: magazyn.Wykonanie, s: { cwiczenie?: { id: string } | null },
  ) =>
    // Wpisy sprzed wprowadzenia kolumny nie wiedzą, czego dotyczyły — wtedy
    // zostaje przy nich to, co dotąd: przyjmujemy, że to ten slot.
    !w.cwiczenieId || w.cwiczenieId === s.cwiczenie?.id;

  const wykonanieTegoCwiczenia = (
    s: { positionId: string; cwiczenie?: { id: string } | null }, tydzien: number,
  ) => {
    const w = wykonanie(s.positionId, tydzien);
    return w && zTegoCwiczenia(w, s) ? w : undefined;
  };

  /**
   * Co klient robił w tym miejscu, **zanim** trener podmienił ćwiczenie.
   *
   * Slot trzyma jedno ćwiczenie na cały cykl, więc po podmianie przerobione
   * tygodnie noszą nową nazwę. Ukrycie tamtych liczb było pierwszym krokiem —
   * lepsze od przypisania ich nowemu ćwiczeniu, ale klient tracił przez to
   * własną historię. Pokazujemy ją więc pod prawdziwą nazwą i **tylko do
   * odczytu**: gdyby wróciła do pól, dałoby się ją zapisać na nowo, już pod
   * ćwiczeniem, którego nie było.
   */
  const wczesniejWTymMiejscu = (
    s: { positionId: string; cwiczenie?: { id: string } | null }, tydzien: number,
  ) => {
    const w = wykonanie(s.positionId, tydzien);
    if (!w || zTegoCwiczenia(w, s)) return null;
    return {
      nazwa: katalog.poId(w.cwiczenieId!)?.nazwa ?? w.cwiczenieId!,
      ciezarWykonany: w.ciezarWykonany ?? null,
      powtorzeniaWykonane: w.powtorzeniaWykonane ?? null,
      feedback: w.feedback ?? null,
    };
  };

  /**
   * Co klient zrobił przy tym ćwiczeniu ostatnim razem — przed tym tygodniem.
   *
   * Punkt 5 z listy Base44 (25.09.2026): historia tam, gdzie klient stoi ze
   * sztangą, a nie na osobnym ekranie. Ćwiczenie liczy się po tym, co klient
   * faktycznie robił (`cwiczenieId` wpisu), więc to samo ćwiczenie z innego
   * dnia też się liczy — a cudze kilogramy po podmianie nie. Wpisy z samą
   * oceną pomijamy: „Zakończ trening" dopisuje „OK" każdemu ćwiczeniu dnia,
   * także niezrobionemu. W pierwszym tygodniu nowego cyklu sięgamy do
   * poprzedniego — tam jest to, od czego klient zaczyna.
   */
  const poprzedniCykl = zapisany.poprzedniId
    ? magazyn.wczytaj(zapisany.trenerId, zapisany.poprzedniId) : null;
  const cwiczenieWpisu = (w: magazyn.Wykonanie, plan: Plan) =>
    w.cwiczenieId ?? plan.sloty.find((x) => x.positionId === w.positionId)?.cwiczenieId;
  const zSeriami = (w: magazyn.Wykonanie) =>
    serieWpisu(w).some((x) => x.ciezar || x.powtorzenia);
  const najnowszy = (wpisy: magazyn.Wykonanie[], positionId: string) =>
    [...wpisy].sort((a, b) => b.tydzien - a.tydzien
      || Number(b.positionId === positionId) - Number(a.positionId === positionId)
      || b.data.localeCompare(a.data))[0];
  const ostatnio = (cwiczenieId: string, positionId: string, tydzien: number) => {
    const tutaj = najnowszy((zapisany.wykonania ?? []).filter((w) => w.tydzien < tydzien
      && cwiczenieWpisu(w, zapisany.plan) === cwiczenieId && zSeriami(w)), positionId);
    if (tutaj) {
      return { tydzien: numerTygodniaNaEkranie(zapisany.plan, tutaj.tydzien),
        serie: serieWpisu(tutaj), feedback: tutaj.feedback ?? null, cykl: null };
    }
    if (!poprzedniCykl) return null;
    const wczesniej = najnowszy((poprzedniCykl.wykonania ?? []).filter((w) =>
      cwiczenieWpisu(w, poprzedniCykl.plan) === cwiczenieId && zSeriami(w)), positionId);
    return wczesniej
      ? { tydzien: numerTygodniaNaEkranie(poprzedniCykl.plan, wczesniej.tydzien),
          serie: serieWpisu(wczesniej), feedback: wczesniej.feedback ?? null,
          cykl: poprzedniCykl.wersja }
      : null;
  };

  /** Rozgrzewka dnia — wiersz po wierszu. Pusta albo brak = `null`. */
  const rozgrzewka = (dzien: number) => {
    const r = zapisany.plan.rozgrzewki?.find((x) => x.dzien === dzien);
    const linie = (r?.tekst ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    return r && (linie.length > 0 || r.film) ? { linie, film: r.film ?? null } : null;
  };

  const kalibracjaW = (cwiczenieId: string, positionId: string, tydzien: number) => {
    const k = zapisany.plan.serieMaksymalne
      .find((x) => x.cwiczenieId === cwiczenieId)?.kalibracja;
    return k && k.positionId === positionId && k.tydzien === tydzien
      ? { ciezar: k.ciezar, powtorzenia: k.powtorzenia, rpe: k.rpe }
      : null;
  };

  // Sześć tygodni pracy i te po cyklu, które trener włączył. Tydzień maksów
  // bez żadnego boju nie idzie do klienta — pusty kafelek niczego nie mówi.
  const dniPlanu = [...new Set(zapisany.plan.sloty.filter((s) => s.cwiczenieId).map((s) => s.dzien))]
    .sort((a, b) => a - b);
  const tygodnie = [...wynik.tygodnie, ...wynik.tygodnieDodatkowe]
    .filter((t) => t.rodzaj !== "maksy" || t.sloty.length > 0)
    .map((t) => ({
    tydzien: t.tydzien,
    // Numer na ekranie: bez deloadu maksy są tygodniem siódmym.
    numer: numerTygodniaNaEkranie(zapisany.plan, t.tydzien),
    rodzaj: t.rodzaj ?? null,
    // Maksy to jeden dzień — wszystkie boje naraz, decyzja trenera z 25.09.
    dni: (t.rodzaj === "maksy" ? [1] : dniPlanu)
      .map((dzien) => ({
        dzien,
        ukonczony: ukonczone.some((u) => u.dzien === dzien && u.tydzien === t.tydzien),
        // Dzień maksów ma własną instrukcję rozgrzewki przy każdym boju.
        rozgrzewka: t.rodzaj === "maksy" ? null : rozgrzewka(dzien),
        topSet: (() => {
          const ts = t.topSety.find((x) => x.dzien === dzien);
          return ts ? { ...ts, przerwaSekundy: przerwaSekund(ts.cwiczenie?.coeff) } : null;
        })(),
        cwiczenia: t.sloty
          .filter((s) => s.dzien === dzien && s.cwiczenie)
          .map((s) => ({
            positionId: s.positionId,
            lp: s.lp,
            grupa: (s.lp || "").charAt(0),
            nazwa: s.cwiczenie!.nazwa,
            film: s.cwiczenie!.film ?? null,
            jednostronne: s.cwiczenie!.jednostronne ?? false,
            // Skok ciężaru z BAZY — telefon zaokrągla do niego korektę ±5 %
            // w trakcie treningu (ocena przy serii, 26.09.2026).
            skokKg: s.cwiczenie!.skokKg,
            // Ile odpocząć po serii. Liczy silnik z `coeff`, bo to jedyne
            // miejsce, w którym ta wiedza już jest — patrz `przerwa.ts`.
            przerwaSekundy: przerwaSekund(s.cwiczenie!.coeff),
            serie: s.serie,
            powtorzenia: s.powtorzenia,
            rpe: s.rpe,
            ciezar: s.ciezar,
            // Odczucie też należy do ćwiczenia, nie do miejsca: kopia
            // w parametrach tygodnia zostaje po podmianie przy slocie,
            // a opisuje to, co klient robił wcześniej.
            feedback: wykonanieTegoCwiczenia(s, t.tydzien) === undefined
              && wykonanie(s.positionId, t.tydzien)
              ? null
              : zapisany.plan.sloty.find((x) => x.positionId === s.positionId)
                ?.tygodnie?.[t.tydzien]?.feedback ?? null,
            // Tylko wtedy, gdy klient podniósł to na TYM ćwiczeniu. Po podmianie
            // w środku cyklu przerobione tygodnie pokazywały nową nazwę nad
            // kilogramami ze starego ćwiczenia — czyli własną historię klienta
            // opowiedzianą nieprawdziwie. Pustka jest tu uczciwsza.
            ciezarWykonany: wykonanieTegoCwiczenia(s, t.tydzien)?.ciezarWykonany ?? null,
            powtorzeniaWykonane:
              wykonanieTegoCwiczenia(s, t.tydzien)?.powtorzeniaWykonane ?? null,
            serieWykonane: serieWpisu(wykonanieTegoCwiczenia(s, t.tydzien)),
            wczesniej: wczesniejWTymMiejscu(s, t.tydzien),
            // Ciężaru nie ma, bo nie ma 1RM — klient dobiera go sam według
            // RPE, a pierwsza wpisana seria policzy resztę. Flaga zamiast
            // porównywania napisu w telefonie: komunikat silnika może się
            // kiedyś zmienić, a znaczenie zostaje.
            dobierzCiezar: t.rodzaj !== "maksy" && s.ciezar === "— brak 1RM",
            // Ciężar ustawiany ręcznie, a trener go jeszcze nie wpisał. Klient
            // dobiera go sam i zapisuje przy seriach; nic się z tego nie liczy
            // (to nie 1RM), ale trener widzi wpis w konsoli i może ustawić
            // ciężar na kolejne tygodnie. Bez tej flagi telefon pokazywał
            // w kolumnie ciężaru napis z BAZY — „ręczne ustawienie".
            ciezarWybieraKlient: t.rodzaj !== "maksy"
              && s.cwiczenie!.progresja === "ręczne ustawienie"
              && typeof s.ciezar !== "number",
            // Ręczny ciężar przeniesiony z wcześniejszego tygodnia — telefon
            // dopisuje „jak w T1", żeby było wiadomo, skąd ta liczba.
            ciezarZTygodnia: s.ciezarZrodlo && s.ciezarZrodlo.tydzien < t.tydzien
              ? numerTygodniaNaEkranie(zapisany.plan, s.ciezarZrodlo.tydzien) : null,
            // Próba maksymalna: jedno powtórzenie na RPE 10. Ciężar w planie to
            // obecne 1RM — punkt odniesienia, nie polecenie; wynik wpisuje klient.
            maks: t.rodzaj === "maksy",
            // Seria, z której policzono 1RM — tylko w tym treningu, w którym
            // to się stało. Klient widzi wtedy, skąd wziął się jego ciężar.
            kalibracja: kalibracjaW(s.cwiczenie!.id, s.positionId, t.tydzien),
            ostatnio: ostatnio(s.cwiczenie!.id, s.positionId, t.tydzien),
          })),
      })),
  }));

  /*
   * Ćwiczenia do zmierzenia — klient podaje ciężar i powtórzenia, z nich
   * wychodzi 1RM.
   *
   * Na liście zostają **wszystkie** ćwiczenia planu, także te, przy których
   * seria maksymalna nic nie policzy (masa ciała, czas, dystans, ciężar
   * ustawiany wprost). Wyrzucenie ich byłoby wygodniejsze w kodzie i gorsze
   * na ekranie: klient widzi w planie ćwiczenie, nie widzi go na liście
   * pomiarów i nie wie, czy o nim zapomniano. Zamiast pól dostaje jedno
   * zdanie, dlaczego nie ma czego mierzyć.
   */
  const doZmierzenia = [...new Set(zapisany.plan.sloty
    .filter((s) => s.cwiczenieId).map((s) => s.cwiczenieId!))]
    .map((id) => {
      const slot = wynik.tygodnie[0]!.sloty.find((s) => s.cwiczenie?.id === id);
      const seria = zapisany.plan.serieMaksymalne.find((s) => s.cwiczenieId === id);
      const progresja = slot?.cwiczenie?.progresja ?? null;
      return {
        cwiczenieId: id,
        nazwa: slot?.cwiczenie?.nazwa ?? id,
        film: slot?.cwiczenie?.film ?? null,
        // Wpis z kalibracji to `1RM × 1` — prawda dla silnika, ale w polach
        // serii maksymalnej wyglądałby jak seria, której klient nie zrobił.
        // Pola zostają puste, a skąd jest 1RM, mówi `kalibracja`.
        ciezar: seria?.kalibracja ? null : seria?.ciezar ?? null,
        powtorzenia: seria?.kalibracja ? null : seria?.powtorzenia ?? null,
        kalibracja: seria?.kalibracja
          ? { ciezar: seria.kalibracja.ciezar, powtorzenia: seria.kalibracja.powtorzenia,
              rpe: seria.kalibracja.rpe }
          : null,
        oneRM: slot?.oneRM || null,
        bezSerii: progresja ? dlaczegoBezSeriiMaksymalnej(progresja) : null,
      };
    });

  return {
    // Klient musi wiedzieć, którego cyklu dotyczy to, co widzi — inaczej ocena
    // wysłana po zmianie planu nie ma jak trafić tam, gdzie należy.
    planId: zapisany.id,
    klient: zapisany.klient,
    wersja: zapisany.wersja,
    dataStartu: zapisany.dataStartu,
    tygodnie,
    doZmierzenia,
    moduly: moduly(zapisany),
    postep: postepKlienta(zapisany, wynik),
  };
}

function plikCzytelny(sciezka: string): boolean {
  try {
    return statSync(sciezka).isFile();
  } catch {
    return false;
  }
}

/**
 * Znacznik wersji pliku — rozmiar i czas zmiany.
 *
 * Wystarcza, żeby przeglądarka spytała „czy się zmieniło" i dostała krótką
 * odpowiedź, zamiast pobierać całość albo trzymać starą kopię w nieskończoność.
 */
function znacznik(sciezka: string): string {
  const st = statSync(sciezka);
  return `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
}

function plikStatyczny(sciezkaUrl: string, res: ServerResponse, req?: IncomingMessage): boolean {
  const wzgledna = normalize(sciezkaUrl === "/" ? "/index.html" : sciezkaUrl).replace(/^(\.\.[/\\])+/, "");
  const pelna = join(PUBLIC, wzgledna);
  // `existsSync` jest prawdziwe także dla katalogu — a próba odczytania go
  // jako pliku leci wyjątkiem **po** wysłaniu nagłówków. Żądanie `/klient/`
  // zabijało w ten sposób cały serwer: obsługa błędu próbowała odpowiedzieć
  // drugi raz i wywalała proces. Bez hasła, jednym GET-em.
  if (!pelna.startsWith(PUBLIC) || !plikCzytelny(pelna)) return false;

  const naglowki: Record<string, string> = {
    "content-type": TYPY[extname(pelna)] ?? "application/octet-stream",
  };

  // Service worker klienta leży w `/klient/`, a musi obsługiwać `/k/<token>`.
  // Przeglądarka pozwala na szerszy zakres tylko wtedy, gdy serwer sam na to
  // przyzwoli tym nagłówkiem. Bez niego rejestracja z `scope: "/"` jest
  // odrzucana i aplikacja klienta traci tryb offline.
  if (wzgledna === "/klient/sw.js") naglowki["service-worker-allowed"] = "/";

  /**
   * Aplikacja aktualizuje się w miejscu, więc przeglądarka musi za każdym
   * razem **spytać**, czy plik się zmienił. Bez żadnych nagłówków robiła to,
   * co uznała za stosowne: raz pobierała na nowo, raz trzymała starą kopię.
   * Trener po aktualizacji widziałby wtedy starą konsolę, bez żadnego objawu
   * poza tym, że poprawka „nie działa".
   *
   * `no-cache` nie znaczy „nie zapisuj" — znaczy „zapisz, ale zawsze pytaj".
   * Ze znacznikiem wersji odpowiedź na to pytanie to zwykle 304 bez treści,
   * czyli taniej niż pobranie pliku.
   */
  naglowki["cache-control"] = "no-cache";
  naglowki.etag = znacznik(pelna);

  if (req?.headers["if-none-match"] === naglowki.etag) {
    res.writeHead(304, { etag: naglowki.etag, "cache-control": "no-cache" });
    res.end();
    return true;
  }

  res.writeHead(200, naglowki);
  res.end(readFileSync(pelna));
  return true;
}

/*
 * Adresy tej maszyny w sieci lokalnej mieszkają w `adresy.ts` — potrzebuje ich
 * też narzędzie do ustawiania hasła. Podajemy je tylko w trybie z hasłem: bez
 * niego konsola i tak odmawia połączeń spoza tej maszyny, więc taki adres
 * byłby obietnicą bez pokrycia.
 */

/** Adresy, do których klient dostaje się samym tokenem — bez konta trenera. */
function dlaKlienta(sciezka: string): boolean {
  return sciezka.startsWith("/api/klient/")
    || sciezka.startsWith("/k/")
    || sciezka.startsWith("/klient/");
}

/**
 * To, czego potrzebuje sam ekran logowania. Bez tego bramka odcina mu arkusz
 * stylów i niezalogowany widzi gołe HTML.
 */
const PUBLICZNE = new Set(["/logowanie.html", "/style.css"]);

const serwer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const sciezka = url.pathname;

  try {
    // Sprawdzenie życia — dla Dockera i monitoringu. Nie mówi nic o danych.
    if (sciezka === "/zdrowie") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      return res.end("ok");
    }

    // ── logowanie ────────────────────────────────────────────────────
    if (sciezka === "/api/logowanie" && req.method === "POST") {
      const { email, haslo } = await cialo(req);
      const trener = auth.trenerPoEmailu(String(email ?? ""));

      // Ten sam komunikat przy złym mailu i przy złym haśle — inaczej dałoby
      // się sprawdzać, które konta istnieją.
      if (!trener?.hashHasla || !auth.pasuje(String(haslo ?? ""), trener.hashHasla)) {
        return blad(res, "Nieprawidłowy e-mail albo hasło.", 401);
      }

      const token = auth.zaloguj(trener.id);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": auth.ciastkoSesji(token, ZA_HTTPS),
      });
      return res.end(JSON.stringify({ nazwa: trener.nazwa }));
    }

    if (sciezka === "/api/wylogowanie" && req.method === "POST") {
      const token = auth.ciastkoZNaglowka(req.headers.cookie);
      if (token) auth.wyloguj(token);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": auth.ciastkoSesji(null, ZA_HTTPS),
      });
      return res.end(JSON.stringify({ wylogowany: true }));
    }

    // Kto tu jest — pyta się raz, przed wszystkim, co należy do trenera.
    // Aplikacja klienta idzie obok: jej kluczem jest token w adresie.
    let trenerId = TRENER;
    if (!dlaKlienta(sciezka) && !PUBLICZNE.has(sciezka)) {
      const kto = rozpoznajTrenera(req);
      if ("odmowa" in kto) {
        if (sciezka.startsWith("/api/")) return blad(res, kto.odmowa, kto.kod);
        // Wejście na stronę → ekran logowania. Pozostałe zasoby (skrypty,
        // dane) → zwykła odmowa, żeby nie odsyłać HTML-a tam, gdzie
        // przeglądarka spodziewa się czegoś innego.
        if (kto.kod === 401 && (sciezka === "/" || sciezka === "/index.html")) {
          if (plikStatyczny("/logowanie.html", res, req)) return;
        }
        res.writeHead(kto.kod, { "content-type": "text/plain; charset=utf-8" });
        return res.end(kto.odmowa);
      }
      trenerId = kto.trenerId;
    }

    // ── katalog ćwiczeń ──────────────────────────────────────────────
    if (sciezka === "/api/cwiczenia") {
      /*
       * Do każdego ćwiczenia dokładamy jedną informację, której nie ma w BAZIE:
       * czy TOP SET jest przy nim zwyczajowy. Reguła jest wiedzą trenera
       * i siedzi w silniku (`top-set.ts`) — przeglądarka nie ma jej powtarzać
       * u siebie, bo wtedy byłyby dwie listy i jedna z nich by się rozjechała.
       */
      return json(res, katalog.wszystkie.map((c) => ({
        ...c,
        zwyczajowyTopSet: zwyczajowyTopSet(c.nazwa),
      })));
    }

    // ── szablony planów z Base44 ─────────────────────────────────────
    // Lista do wyboru w konsoli: nazwa, liczba dni, część planu, na starcie
    // i to, czy szablon niesie dobór ćwiczeń, a jeśli tak — czego w BAZIE brak.
    if (sciezka === "/api/szablony" && req.method === "GET") {
      return json(res, SZABLONY_BASE44.map((s) => ({
        id: s.id,
        nazwa: s.nazwa,
        opis: s.opis,
        czesc: s.czesc,
        dni: s.dni.length,
        zCwiczeniami: s.zCwiczeniami,
        bezOdpowiednika: [...new Set(s.dni.flat().map((x) => x.bezOdpowiednika).filter(Boolean))],
      })));
    }

    if (sciezka === "/api/ja" && req.method === "GET") {
      const trener = auth.trenerPoId(trenerId);
      const tryb = auth.trybDostepu(TRENER).tryb;
      return json(res, {
        nazwa: trener?.nazwa ?? "Trener",
        email: trener?.email ?? null,
        tryb,
        /*
         * Adresy, pod którymi ta maszyna jest widoczna z innych urządzeń.
         * Potrzebne przy linku dla klienta: „localhost" na jego telefonie
         * znaczy jego telefon, więc taki link nie ma prawa zadziałać.
         *
         * Podajemy je ZAWSZE, także bez hasła. Wcześniej wychodziły tylko
         * w trybie z hasłem — przez pomylenie konsoli z aplikacją klienta.
         * To są dwie różne bramki: `rozpoznajTrenera` pilnuje ekranów trenera
         * i bez hasła odcina wszystko spoza tej maszyny, ale ścieżki klienta
         * (`dlaKlienta`) idą obok niej, bo ich kluczem jest token w adresie.
         * Link klienta działa więc z telefonu w tej samej sieci od razu, bez
         * żadnego hasła — a konsola mówiła trenerowi, że nie zadziała.
         */
        adresyWSieci: adresyLokalnejSieci(PORT),
      });
    }

    // ── lista planów ─────────────────────────────────────────────────
    if (sciezka === "/api/plany" && req.method === "GET") {
      const plany = magazyn.lista(trenerId).map((zapisany) => {
        const { plan, wykonania, ukonczoneDni, waga, ...reszta } = zapisany;
        return {
          ...reszta,
          cwiczen: plan.sloty.filter((s) => s.cwiczenieId).length,
          realizacja: realizacja(zapisany),
          cykl: cyklWCzasie(zapisany),
        };
      });
      return json(res, plany);
    }

    // ── klienci ──────────────────────────────────────────────────────
    if (sciezka === "/api/klienci" && req.method === "GET") {
      return json(res, magazyn.listaKlientow(trenerId)
        .map((k) => pozycjaListyKlientow(trenerId, k)));
    }

    const klientTrenera = sciezka.match(/^\/api\/klienci\/([a-z0-9-]+)(\/[a-z-]+)?$/i);
    if (klientTrenera) {
      const [, klientId, akcja] = klientTrenera;
      const klient = magazyn.wczytajKlienta(trenerId, klientId!);
      if (!klient) return blad(res, "Nie ma takiego klienta", 404);

      if (!akcja && req.method === "GET") {
        return json(res, kartotekaKlienta(trenerId, klientId!));
      }

      // Zmiana nazwy nie rusza identyfikatora — inaczej poprawienie literówki
      // rozdzieliłoby historię klienta na dwie osoby.
      if (!akcja && req.method === "PUT") {
        const sprawdzona = nazwaKlienta((await cialo(req)).nazwa);
        if ("blad" in sprawdzona) return blad(res, sprawdzona.blad);
        const nazwa = sprawdzona.nazwa;

        // Dwie kartoteki o tej samej nazwie to stan, w którym trener nie wie,
        // którą otwiera. Od łączenia jest osobna operacja, która zachowuje
        // historię — a nie zmiana nazwy, która by ją zdublowała.
        const kolizja = magazyn.wczytajKlienta(trenerId, magazyn.idKlienta(nazwa));
        if (kolizja && kolizja.id !== klient.id) {
          return blad(res, `Klient „${kolizja.nazwa}" już istnieje. `
            + "Jeśli to ta sama osoba, użyj „Połącz z innym klientem” — historia zostanie zachowana.");
        }

        magazyn.zapiszKlienta({ ...klient, nazwa });
        return json(res, kartotekaKlienta(trenerId, klientId!));
      }

      // Scalenie dwóch kartotek tej samej osoby. Powstają z literówki
      // w nazwisku, a zauważa się je zwykle po cyklu pracy — wtedy „usuń
      // i wpisz od nowa" znaczyłoby stratę wykonań, wagi i historii.
      if (akcja === "/polacz" && req.method === "POST") {
        const { celId } = await cialo(req);
        try {
          const wynik = magazyn.scalKlientow(trenerId, klientId!, String(celId ?? ""));
          return json(res, { ...wynik, celId, kartoteka: kartotekaKlienta(trenerId, String(celId)) });
        } catch (e) {
          return blad(res, e instanceof Error ? e.message : "Nie udało się scalić klientów");
        }
      }

      if (!akcja && req.method === "DELETE") {
        magazyn.usunKlienta(trenerId, klientId!);
        return json(res, { usuniety: klientId });
      }

      if (akcja === "/link" && req.method === "POST") {
        const token = klient.token ?? magazyn.nowyToken();
        magazyn.zapiszKlienta({ ...klient, token });
        return json(res, {
          token,
          sciezka: `/k/${token}`,
          widocznyPlan: magazyn.aktywnyPlan(trenerId, klientId!)?.id ?? null,
        });
      }

      if (akcja === "/link" && req.method === "DELETE") {
        magazyn.zapiszKlienta({ ...klient, token: undefined });
        return json(res, { uniewazniony: true });
      }
    }

    /** Krótka lista tego, na co trener powinien dziś spojrzeć. */
    if (sciezka === "/api/uwaga" && req.method === "GET") {
      return json(res, wymagajaUwagi(trenerId));
    }

    // ── nowy plan ────────────────────────────────────────────────────
    if (sciezka === "/api/plany" && req.method === "POST") {
      const c = await cialo(req);
      const sprawdzona = nazwaKlienta(c.klient);
      if ("blad" in sprawdzona) return blad(res, sprawdzona.blad);
      const klient = sprawdzona.nazwa;
      // Numer cyklu przychodzi z sieci, więc musi być liczbą całkowitą z tego
      // świata — inaczej trafiłby do identyfikatora planu i do bazy.
      const wersja = Math.trunc(liczbaZadania(c.wersja) ?? 1);
      if (!(wersja >= 1 && wersja <= 999)) return blad(res, "Numer cyklu musi być z zakresu 1–999");
      const poprzedniId = tekst(c.poprzedniId) || undefined;
      const id = magazyn.nowyId(klient, wersja);
      if (magazyn.wczytaj(trenerId, id)) return blad(res, `Plan „${id}" już istnieje`);

      // Ten sam klient przy drugim cyklu nie powstaje drugi raz — dopasowanie
      // idzie po slugu, więc „Zuzanna C" i „zuzanna c." to jedna osoba.
      const osoba = magazyn.zapewnijKlienta(trenerId, klient);
      const zapisany = magazyn.zapisz({
        id, trenerId, klientId: osoba.id, klient: osoba.nazwa, wersja, status: "szkic",
        dataStartu: null, utworzony: "", zmieniony: "",
        poprzedniId,
        plan: magazyn.pustyPlan(osoba.nazwa),
      });
      return json(res, obrazPlanu(zapisany), 201);
    }

    // ── import z arkusza ─────────────────────────────────────────────
    if (sciezka === "/api/import" && req.method === "POST") {
      const sprawdzona = nazwaKlienta(url.searchParams.get("klient"));
      if ("blad" in sprawdzona) return blad(res, sprawdzona.blad);
      const klient = sprawdzona.nazwa;
      const wersja = Math.trunc(liczbaZadania(url.searchParams.get("wersja")) ?? 1);
      if (!(wersja >= 1 && wersja <= 999)) return blad(res, "Numer cyklu musi być z zakresu 1–999");

      const zawartosc = await bajty(req);

      // Ta sama droga, którą idzie wczytywanie całego katalogu z linii poleceń.
      let wynik: WynikWczytania;
      try {
        wynik = wczytajPlanZArkusza({
          zawartosc, trenerId, klient, wersja,
          poprzedniId: url.searchParams.get("poprzedniId") || undefined,
        });
      } catch (e) {
        if (e instanceof BladArkusza) return blad(res, e.message);
        throw e;
      }

      return json(res, {
        ...obrazPlanu(wynik.zapisany),
        nierozpoznane: wynik.nierozpoznane,
      }, 201);
    }

    // ── asystent AI ──────────────────────────────────────────────────
    // Bez klucza do API funkcja jest po prostu wyłączona: konsola startuje,
    // plany się liczą, znika jeden przycisk.
    if (sciezka === "/api/ai/stan" && req.method === "GET") {
      return json(res, stanAI());
    }

    // ── pojedynczy plan ──────────────────────────────────────────────
    const dopasowanie = sciezka.match(/^\/api\/plany\/([a-z0-9-]+)(\/[a-z0-9-]+)?$/i);
    if (dopasowanie) {
      const [, id, akcja] = dopasowanie;
      const zapisany = magazyn.wczytaj(trenerId, id!);
      if (!zapisany) return blad(res, "Nie ma takiego planu", 404);

      if (!akcja && req.method === "GET") return json(res, obrazPlanu(zapisany));

      if (!akcja && req.method === "PUT") {
        const zmiany = await cialo(req);

        // Rozsypanie całego ciała na zapisany plan znaczyło, że żądanie mogło
        // podmienić **cokolwiek** — właściciela planu, datę utworzenia, a nawet
        // historię wykonań klienta. Tu zmienia się dokładnie to, co trener
        // zmienia z ekranu; reszta pochodzi z bazy.
        const status = zmiany.status ?? zapisany.status;
        if (!magazyn.STATUSY_PLANU.includes(status)) {
          return blad(res, `Status musi być jednym z: ${magazyn.STATUSY_PLANU.join(", ")}`);
        }
        const bladDaty = bladDatyStartu(zmiany.dataStartu);
        if (bladDaty) return blad(res, bladDaty);

        // `plan` nieobecny znaczy „nie ruszaj planu"; `plan: null` znaczy, że
        // ktoś przysłał coś, co planem nie jest — i musi o tym usłyszeć,
        // zamiast dostać ciche 200 i przekonanie, że zapisał.
        /**
         * Wyścig o ten sam plan.
         *
         * Trener otwiera plan, a klient w tym czasie ocenia trening na siłowni.
         * Ocena idzie do bazy i podnosi ciężar w kolejnym tygodniu. Potem
         * trener zapisuje swoją kopię — sprzed oceny — i **ocena znika**,
         * a ciężar wraca do poprzedniego. Cicho: w „Realizacji" ocena dalej
         * widnieje, bo tam czyta się z historii wykonań, a nie z planu.
         *
         * Znacznik `zmieniony` mówi, na czym trener oparł swoją wersję. Gdy
         * baza ma coś nowszego, zapis nie przechodzi — a konsola dostaje
         * świeży plan w odpowiedzi, żeby móc pogodzić jedno z drugim bez
         * pytania trenera o cokolwiek.
         */
        if (zmiany.zmieniony && zmiany.zmieniony !== zapisany.zmieniony) {
          return json(res, {
            blad: "Plan zmienił się w międzyczasie — pewnie klient właśnie ocenił trening.",
            aktualny: obrazPlanu(zapisany),
          }, 409);
        }

        const plan = "plan" in zmiany ? zmiany.plan : zapisany.plan;
        // Silnik zakłada, że dostaje plan — i ma prawo zakładać, bo jest czystą
        // matematyką. Sprawdzenie, czy to naprawdę plan, należy do granicy.
        const bladKsztaltu = bladKsztaltuPlanu(plan);
        if (bladKsztaltu) return blad(res, bladKsztaltu);

        const zaktualizowany = magazyn.zapisz({
          ...zapisany,
          plan,
          status,
          dataStartu: zmiany.dataStartu ?? null,
        });
        return json(res, obrazPlanu(zaktualizowany));
      }

      if (!akcja && req.method === "DELETE") {
        magazyn.usun(trenerId, id!);
        return json(res, { usuniety: id });
      }

      if (akcja === "/kopia" && req.method === "POST") {
        const { wersja } = await cialo(req);
        const nowaWersja = Number(wersja) || zapisany.wersja + 1;
        const kopia = magazyn.kopiaJakoNowaWersja(zapisany, nowaWersja);
        if (magazyn.wczytaj(trenerId, kopia.id)) {
          return blad(res, `Plan „${kopia.id}" już istnieje`);
        }
        return json(res, obrazPlanu(magazyn.zapisz(kopia)), 201);
      }

      /*
       * Szablon z Base44 rozpisuje plan od nowa: dni, numerację, kategorie,
       * TOP SET i — przy czterech szablonach — ćwiczenia. Plan, w którym
       * klient już coś wpisał, jest historią: szablon przepisałby jego wpisy
       * pod inne pozycje. Wtedy odmowa i rada: nowa wersja planu.
       */
      if (akcja === "/szablon" && req.method === "POST") {
        const { szablonId } = await cialo(req);
        const szablon = SZABLONY_BASE44.find((s) => s.id === szablonId);
        if (!szablon) return blad(res, "Nie ma takiego szablonu");
        if ((zapisany.wykonania ?? []).length > 0) {
          return blad(res, "Klient ma już wpisy w tym planie — szablon rozpisałby go od nowa. "
            + "Zrób nową wersję planu i tam wstaw szablon.", 409);
        }
        return json(res, obrazPlanu(magazyn.zapisz({
          ...zapisany, plan: zastosujSzablon(zapisany.plan, szablon),
        })));
      }

      if (akcja === "/przenies" && req.method === "POST") {
        const { positionId, kierunek } = await cialo(req);
        const plan = zapisany.plan;
        const indeks = plan.sloty.findIndex((s) => s.positionId === positionId);
        if (indeks === -1) return blad(res, "Nie ma takiego slotu");

        const slot = plan.sloty[indeks]!;
        const wDniu = plan.sloty.filter((s) => s.dzien === slot.dzien);
        const pozycjaWDniu = wDniu.indexOf(slot);
        const cel = wDniu[pozycjaWDniu + (kierunek === "gora" ? -1 : 1)];
        if (!cel) return blad(res, "Nie ma dokąd przenieść");

        // Zamieniamy TREŚĆ slotów, nie całe wiersze — position_id i Lp. należą
        // do miejsca w planie, nie do ćwiczenia. Dokładnie tak, jak w arkuszu
        // przenosi się tylko widoczny zakres komórek.
        const trescA = { cwiczenieId: slot.cwiczenieId, kategoriaSzkieletu: slot.kategoriaSzkieletu, tygodnie: slot.tygodnie };
        const trescB = { cwiczenieId: cel.cwiczenieId, kategoriaSzkieletu: cel.kategoriaSzkieletu, tygodnie: cel.tygodnie };
        Object.assign(slot, trescB);
        Object.assign(cel, trescA);

        /**
         * Razem z ćwiczeniem przenosi się to, co klient przy nim zapisał.
         *
         * Wpisy klienta są kluczowane pozycją w tabeli, a nie ćwiczeniem —
         * i zostawione na miejscu rozrywały ocenę na pół. Sprawdzone: po
         * przestawieniu przysiadu w dół klient widział „wykonane 100 kg × 4"
         * przy wiosłowaniu zadanym na 52,5 kg, a przy samym przysiadzie —
         * odczucie bez ciężaru. Parametry tygodni przenosimy wyżej z dokładnie
         * tego samego powodu; wykonania po prostu o tym zapomniano.
         */
        const wykonania = (zapisany.wykonania ?? []).map((w) =>
          w.positionId === slot.positionId ? { ...w, positionId: cel.positionId }
            : w.positionId === cel.positionId ? { ...w, positionId: slot.positionId }
              : w);

        return json(res, obrazPlanu(magazyn.zapisz({ ...zapisany, plan, wykonania })));
      }

      // Link należy do klienta, nie do planu — raz wysłany działa przez
      // kolejne cykle i sam pokazuje aktualny. Ten adres zostaje przy planie,
      // bo trener klika go z ekranu planu; działa na jego kliencie.
      if (akcja === "/link" && req.method === "POST") {
        const osoba = magazyn.wczytajKlienta(trenerId, zapisany.klientId);
        if (!osoba) return blad(res, "Nie ma takiego klienta", 404);
        const token = osoba.token ?? magazyn.nowyToken();
        magazyn.zapiszKlienta({ ...osoba, token });
        return json(res, {
          token,
          sciezka: `/k/${token}`,
          // Szkic nie pokazuje się klientowi — o tym trzeba powiedzieć od razu,
          // bo inaczej trener wysyła link do pustej strony.
          widocznyPlan: magazyn.aktywnyPlan(trenerId, zapisany.klientId)?.id ?? null,
        });
      }

      if (akcja === "/link" && req.method === "DELETE") {
        const osoba = magazyn.wczytajKlienta(trenerId, zapisany.klientId);
        if (osoba) magazyn.zapiszKlienta({ ...osoba, token: undefined });
        return json(res, { uniewazniony: true });
      }

      if (akcja === "/eksport" && req.method === "POST") {
        try {
          return json(res, { plik: await eksportujDoArkusza(zapisany) });
        } catch (e) {
          // 503, nie 500: brakującego Pythona nie naprawi ponowienie za chwilę,
          // a tak właśnie kod 500 rozumie każdy, kto go dostaje.
          if (e instanceof BladEksportu) return blad(res, e.message, 503);
          throw e;
        }
      }

      /**
       * Wypełnienie sześciu tygodni progresją z szablonu 5.18 albo
       * rozprowadzenie jednego tygodnia na pozostałe.
       *
       * Wartości lądują w planie **wprost** i są widoczne w polach — nie ma tu
       * ukrytej domyślności. To ta sama zasada, po której eksport wpisuje do
       * arkusza liczby policzone, a nie puste komórki.
       */
      if (akcja === "/tygodnie" && req.method === "POST") {
        const { tryb, zrodlo, positionId } = await cialo(req);
        if (tryb === "progresja") {
          return json(res, obrazPlanu(magazyn.zapisz({
            ...zapisany, plan: zastosujProgresje(zapisany.plan),
          })));
        }
        if (tryb === "kopiuj") {
          const tydzien = Number(zrodlo);
          if (!(tydzien >= 1 && tydzien <= 6)) return blad(res, "Podaj tydzień od 1 do 6");
          // Bez wskazanego ćwiczenia kopiowanie objęłoby cały plan — czyli
          // zrobiłoby sześć identycznych tygodni. To nie jest coś, co komuś
          // wychodzi przez przypadek, więc wymagamy wskazania wprost.
          const slot = tekst(positionId);
          if (!slot) return blad(res, "Podaj ćwiczenie do skopiowania (positionId).");
          if (!zapisany.plan.sloty.some((s) => s.positionId === slot && s.cwiczenieId)) {
            return blad(res, "Nie ma takiego ćwiczenia w planie.");
          }
          return json(res, obrazPlanu(magazyn.zapisz({
            ...zapisany, plan: skopiujTydzien(zapisany.plan, tydzien as 1, slot),
          })));
        }
        return blad(res, "Nieznany tryb — „progresja” albo „kopiuj”.");
      }

      if (akcja === "/moduly" && req.method === "PUT") {
        // Jedyna trasa, która brała ciało żądania i zapisywała je w całości.
        // Tekst zamiast sekund zapisywał się z kodem 200 — a potem ekran
        // „Oddech i bieg" po prostu nie pokazywał się klientowi, bo silnik
        // z tekstu nie umie policzyć dawki. Trener widział, że zapisał.
        const sprawdzone = sprawdzModuly(await cialo(req));
        if ("blad" in sprawdzone) return blad(res, sprawdzone.blad);
        return json(res, obrazPlanu(magazyn.zapisz({
          ...zapisany,
          oddech: sprawdzone.oddech ?? zapisany.oddech,
          bieg: sprawdzone.bieg ?? zapisany.bieg,
        })));
      }

      // Trener przyjmuje propozycję 1RM. Zapisujemy ją jako serię 1 × ciężar:
      // przy jednym powtórzeniu do odmowy %1RM wynosi 100, więc taki wpis
      // znaczy dokładnie „tyle wynosi 1RM" i przechodzi tą samą drogą,
      // co seria maksymalna z arkusza.
      if (akcja === "/1rm" && req.method === "POST") {
        const { cwiczenieId, oneRM } = await cialo(req);
        if (!cwiczenieId || !(oneRM > 0)) return blad(res, "Brakuje ćwiczenia albo wartości");
        const plan = structuredClone(zapisany.plan);
        plan.serieMaksymalne = [
          ...plan.serieMaksymalne.filter((s) => s.cwiczenieId !== cwiczenieId),
          { cwiczenieId, ciezar: oneRM, powtorzenia: 1 },
        ];
        return json(res, obrazPlanu(magazyn.zapisz({ ...zapisany, plan })));
      }

      // ── asystent: propozycja szkieletu ─────────────────────────────
      // Nic tu nie zapisujemy. Odpowiedź modelu wraca na ekran jako propozycja;
      // do planu trafia dopiero przez `/ai-wstaw`, po kliknięciu trenera.
      // Notatka z formularza nie ląduje w bazie — leci do API i znika.
      if (akcja === "/ai-szkielet" && req.method === "POST") {
        const c = await cialo(req);
        const wejscie: WejscieSzkieletu = {
          cel: String(c.cel ?? ""),
          staz: String(c.staz ?? ""),
          sprzet: String(c.sprzet ?? ""),
          notatka: String(c.notatka ?? ""),
          dniWTygodniu: Number(c.dniWTygodniu ?? 3),
        };
        const kontekst = { poprzednieCwiczenia: magazyn.cwiczeniaZPoprzedniegoCyklu(zapisany) };
        const { propozycja, uzycie } = await zaproponujSzkielet(wejscie, kontekst);
        return json(res, {
          propozycja,
          uzycie,
          nadpisze: iluNadpisze(zapisany.plan, propozycja),
          // Komunikat idzie z serwera, a nie z modelu i nie z przeglądarki —
          // ma się pokazać zawsze, gdy padło słowo o zdrowiu.
          komunikatZdrowotny: propozycja.sygnal.wykryty ? KOMUNIKAT_ZDROWOTNY : null,
        });
      }

      if (akcja === "/ai-wstaw" && req.method === "POST") {
        const { propozycja } = await cialo(req) as { propozycja: Propozycja };
        // To, że propozycja była odpowiedzią modelu, nie czyni jej zaufaną —
        // do serwera wraca przez tę samą sieć, co każde inne żądanie.
        const bladKsztaltu = bladKsztaltuPropozycji(propozycja);
        if (bladKsztaltu) return blad(res, bladKsztaltu);
        const sprawdzona = przeliczPropozycje(propozycja, {
          poprzednieCwiczenia: magazyn.cwiczeniaZPoprzedniegoCyklu(zapisany),
        });
        if (sprawdzona.dni.length === 0) return blad(res, "Po weryfikacji nie zostało nic do wstawienia");
        const plan = zastosujPropozycje(zapisany.plan, sprawdzona);
        return json(res, obrazPlanu(magazyn.zapisz({ ...zapisany, plan })));
      }

      // ── asystent: odczytanie analizy ───────────────────────────────
      if (akcja === "/ai-analiza" && req.method === "POST") {
        const wynik = przeliczPlan(zapisany.plan);
        const uwagi = sprawdzPlan(zapisany.plan, wynik, {
          cwiczeniaZPoprzedniegoCyklu: magazyn.cwiczeniaZPoprzedniegoCyklu(zapisany),
        });
        const r = realizacja(zapisany);
        const porownanie = porownanieZPoprzednim(zapisany, wynik);
        const { odczyt, uzycie } = await odczytajAnalize({
          wynik,
          realizacja: r.maDostep ? r : null,
          porownanie: porownanie?.podsumowanie ?? null,
          uwagi: uwagi.map((u) => ({ poziom: u.poziom, opis: u.opis })),
        });
        return json(res, { odczyt, uzycie });
      }
    }

    // ── aplikacja klienta ────────────────────────────────────────────
    const klientowy = sciezka.match(/^\/api\/klient\/([A-Za-z0-9_-]{16,})(\/[a-z]+)?$/);
    if (klientowy) {
      const [, token, akcja] = klientowy;

      // Token prowadzi do klienta, a klient do swojego aktualnego planu.
      // Dzięki temu ten sam link działa przez kolejne cykle — trener oznacza
      // nowy plan jako wysłany i klient widzi go bez wymiany adresu.
      const osoba = magazyn.klientPoTokenie(token!);
      if (!osoba) return blad(res, "Link nieaktualny. Poproś trenera o nowy.", 404);

      const aktywny = magazyn.aktywnyPlan(osoba.trenerId, osoba.id);
      let zapisany = aktywny;

      if (!zapisany) {
        // Link działa, planu jeszcze nie ma — szkiców klientowi nie pokazujemy.
        if (req.method === "GET") {
          return json(res, { klient: osoba.nazwa, czekaNaPlan: true });
        }

        /**
         * Zapis, choć aktywnego planu nie ma.
         *
         * Klient wraca z siłowni z zaległymi ocenami, a trener w międzyczasie
         * cofnął plan do szkicu — na przykład żeby go poprawić. Odmowa znaczyła
         * tu **utratę pracy, która się odbyła**: kolejka w telefonie traktuje
         * 4xx jako „tego nigdy się nie uda zapisać" i wyrzuca zadanie. Trening
         * był, klient go ocenił, a oceny znikały bez śladu.
         *
         * Zadanie niesie `planId` tego, co klient miał na ekranie. Jeśli ten
         * plan należy do niego — zapisujemy. Status planu mówi, co klient
         * *widzi*, a nie czy wolno zapisać to, co już zrobił.
         */
        const zCiala = await cialo(req);
        if (!zCiala.planId) {
          // Bez wskazania cyklu nie wiadomo, czego zapis dotyczy — a zgadywanie
          // znaczyłoby dopisanie treningu do nieswojego planu.
          return blad(res, "Nie masz jeszcze aktywnego planu.", 409);
        }
        const wskazany = magazyn.wczytaj(osoba.trenerId, String(zCiala.planId));
        if (!wskazany || wskazany.klientId !== osoba.id) {
          // Ta sama odpowiedź na „cyklu nie ma" i na „cykl nie jest twój",
          // ta sama co przy aktywnym planie: cudzy identyfikator nie ma się
          // czym różnić od nieistniejącego.
          return blad(res, "Ten plan już nie istnieje.", 404);
        }
        zapisany = wskazany;
      }

      if (!akcja && req.method === "GET") {
        return json(res, widokKlienta(zapisany));
      }

      /**
       * Do którego cyklu trafia ten zapis.
       *
       * Klient bywa offline przez kilka dni — ocenia trening na siłowni bez
       * zasięgu, a kolejka wychodzi dopiero w domu. Jeśli w międzyczasie
       * trener wysłał kolejny cykl, zapis szedł dotąd do **aktywnego** planu:
       * oceny z poprzedniego cyklu przepadały, a nowy dostawał odczucia
       * z treningu, którego jeszcze nie było — i liczył z nich ciężary.
       *
       * Dlatego każde zadanie niesie `planId` tego, co klient miał na ekranie.
       * Zapis idzie tam, gdzie należy, a na ekran wraca zawsze cykl aktywny,
       * żeby telefon sam przeszedł na nowy plan.
       */
      const doZapisu = (cialoZadania: Record<string, unknown>) => {
        const planId = cialoZadania.planId;
        if (!planId || planId === zapisany.id) return zapisany;
        const stary = magazyn.wczytaj(osoba.trenerId, String(planId));
        if (!stary || stary.klientId !== osoba.id) return null;
        return stary;
      };
      /**
       * Co wraca na ekran po zapisie. Zawsze cykl **aktywny**, żeby telefon
       * sam przeszedł na nowy plan. A gdy aktywnego nie ma — bo trener właśnie
       * poprawia plan — wraca to samo, co przy zwykłym wejściu: informacja,
       * że plan jest w przygotowaniu. Zapis się odbył, tylko nie ma czego pokazać.
       */
      const naEkran = (zapisanyWynik: magazyn.ZapisanyPlan) =>
        aktywny
          ? widokKlienta(zapisanyWynik.id === aktywny.id ? zapisanyWynik : aktywny)
          : { klient: osoba.nazwa, czekaNaPlan: true };

      /**
       * Historia klienta przez wszystkie jego cykle — dla niego samego.
       *
       * Osobny adres, a nie część `widokKlienta`, bo widok wraca przy **każdym**
       * dotknięciu oceny na siłowni, a historia wymaga przeliczenia wszystkich
       * cykli. Ekran postępu pobiera ją raz, gdy klient go otwiera.
       *
       * Klient widzi to, co jego: własne cykle, własne 1RM, własną frekwencję.
       */
      if (akcja === "/historia" && req.method === "GET") {
        const cykle = magazyn.planyKlienta(osoba.trenerId, osoba.id)
          // Szkiców klient nie widzi nigdzie — także w historii.
          .filter((p) => p.status !== "szkic");
        const historia = historiaKlienta(cykle.map((p) => {
          const r = realizacja(p, osoba);
          return {
            wersja: p.wersja,
            status: p.status,
            dataStartu: p.dataStartu,
            wynik: przeliczPlan(p.plan),
            ukonczonych: r.ukonczonych,
            zaplanowanych: r.zaplanowanych,
          };
        }));
        return json(res, {
          cykle: historia.cykle.map((c) => ({
            wersja: c.wersja, dataStartu: c.dataStartu,
            ukonczonych: c.ukonczonych, zaplanowanych: c.zaplanowanych,
          })),
          // Tylko ćwiczenia, które klient robił w co najmniej dwóch cyklach —
          // jeden punkt to nie jest postęp, tylko liczba.
          cwiczenia: historia.cwiczenia.filter((c) => c.wCyklach >= 2),
          razem: historia.razem,
        });
      }

      // Odczucie po ćwiczeniu — to samo pole, które w arkuszu jest kolumną H.
      // Aktualizacja jest cząstkowa: klient wysyła osobne wiadomości za ocenę
      // i za wpisany ciężar, a kolejka offline może je odtworzyć w dowolnej
      // kolejności. Nadpisanie całego wpisu gubiłoby to, czego nie przysłano.
      if (akcja === "/odczucie" && req.method === "POST") {
        const cialoZadania = await cialo(req);
        const { positionId } = cialoZadania;
        const tydzien = wZakresie(cialoZadania.tydzien, GRANICE.tydzien);
        if (tydzien === null) return blad(res, "Numer tygodnia musi być z zakresu 1–6");
        const cel = doZapisu(cialoZadania);
        if (!cel) return blad(res, "Ten plan już nie istnieje.", 404);
        // Slot bez ćwiczenia to nie to samo co brak slotu: szkielet ma zawsze
        // 5 dni po 12 pozycji. Zapis w pusty slot brałby się tylko ze spóźnionej
        // kolejki po tym, jak trener wyjął stamtąd ćwiczenie — i przykleiłby
        // się do tego, co trener wstawi tam później.
        const slot = cel.plan.sloty.find((s) => s.positionId === positionId);
        if (!slot?.cwiczenieId) return blad(res, "Nie ma takiego ćwiczenia");
        // Deload i maksy istnieją tylko wtedy, gdy trener je włączył. Zapis do
        // wyłączonego tygodnia wisiałby w bazie niewidoczny dla nikogo.
        if (!tygodniePlanu(cel.plan).includes(tydzien as 1)) {
          return blad(res, "Tego tygodnia nie ma w planie");
        }
        const wTygodniu = tydzienWyliczony(przeliczPlan(cel.plan), tydzien)
          ?.sloty.find((s) => s.positionId === positionId);
        if (tydzien === TYDZIEN_MAKSOW && !wTygodniu?.cwiczenie) {
          return blad(res, "Tego ćwiczenia nie ma w tygodniu maksów");
        }

        // Historia wykonań — czego arkusz nie ma w ogóle.
        const wykonania = [...(cel.wykonania ?? [])];
        const i = wykonania.findIndex((w) => w.positionId === positionId && w.tydzien === tydzien);
        const wpis = { ...(i >= 0 ? wykonania[i]! : { positionId, tydzien }) };
        wpis.data = new Date().toISOString();
        // Które ćwiczenie klient wtedy robił. Slot trzyma jedno ćwiczenie na
        // cały cykl, więc bez tego podmiana w środku przepisywała przeszłość:
        // przerobione tygodnie dostawały nową nazwę, a podniesione kilogramy
        // szły do propozycji 1RM dla ćwiczenia, którego klient nie robił.
        //
        // Ćwiczenie z tego tygodnia, nie z samego slotu: po podmianie od T4
        // (`cwiczenieIdOverride`) slot dalej trzyma stare, a klient robi nowe —
        // i jego wpisy lądowały pod starą nazwą, więc telefon pokazywał je
        // jako „wcześniej tutaj". Deload bierze ćwiczenie z T6, maksy — boje.
        wpis.cwiczenieId = wTygodniu?.cwiczenie?.id ?? slot.cwiczenieId;

        if ("feedback" in cialoZadania) {
          // Nieznane odczucie kończyło się dotąd błędem 500 na ograniczeniu
          // w bazie — a 500 znaczy dla kolejki w telefonie „spróbuj później",
          // więc takie zadanie wracałoby w nieskończoność.
          const f = cialoZadania.feedback;
          if (f && !ODCZUCIA.includes(String(f))) {
            return blad(res, "Nieznane odczucie — dozwolone: za łatwe, OK, za trudne");
          }
          wpis.feedback = f || undefined;
          slot.tygodnie ??= {};
          slot.tygodnie[tydzien as 1] ??= {};
          slot.tygodnie[tydzien as 1]!.feedback = f || undefined;
        }
        // Wszystkie serie z treningu. Najcięższą — tę, która idzie do 1RM —
        // wylicza serwer, a nie telefon: jedna reguła w jednym miejscu.
        if ("serie" in cialoZadania) {
          const sprawdzone = sprawdzSerie(cialoZadania.serie, GRANICE);
          if ("blad" in sprawdzone) return blad(res, sprawdzone.blad);
          const top = najciezsza(sprawdzone.serie);
          wpis.serie = sprawdzone.serie.length > 0 ? sprawdzone.serie : undefined;
          wpis.ciezarWykonany = top?.ciezar ?? undefined;
          wpis.powtorzeniaWykonane = top?.powtorzenia ?? undefined;
        } else if ("ciezarWykonany" in cialoZadania || "powtorzeniaWykonane" in cialoZadania) {
          // Sama para — tak pisały wersje aplikacji sprzed 23.09, a telefon
          // z aplikacją w pamięci podręcznej może jeszcze taką wysłać. Para
          // to jedna seria i tak ją zapisujemy, żeby lista serii nie rozeszła
          // się z tym, z czego liczy się 1RM.
          //
          // Ciężar i powtórzenia idą do propozycji nowego 1RM, czyli wprost do
          // ciężarów kolejnego cyklu. Wartość spoza świata psuje je po cichu.
          if (cialoZadania.ciezarWykonany != null) {
            const kg = wZakresie(cialoZadania.ciezarWykonany, GRANICE.ciezar, false);
            if (kg === null) return blad(res, "Ciężar musi być z zakresu 0–1000 kg");
            wpis.ciezarWykonany = kg || undefined;
          }
          if (cialoZadania.powtorzeniaWykonane != null) {
            const powt = wZakresie(cialoZadania.powtorzeniaWykonane, GRANICE.powtorzenia);
            if (powt === null) return blad(res, "Powtórzenia muszą być z zakresu 0–200");
            wpis.powtorzeniaWykonane = powt || undefined;
          }
          wpis.serie = wpis.ciezarWykonany || wpis.powtorzeniaWykonane
            ? [{ ciezar: wpis.ciezarWykonany ?? null, powtorzenia: wpis.powtorzeniaWykonane ?? null }]
            : undefined;
        }

        // Ciężar wybrany przez klienta przy „ręcznym ustawieniu" idzie do planu:
        // silnik niesie go na kolejne tygodnie (trener, 26.09.2026: „zostaje
        // do końca planu"). Najcięższa seria, razem z ćwiczeniem — po podmianie
        // w slocie cudze kilogramy nie przechodzą.
        const cwTygodnia = wTygodniu?.cwiczenie;
        if (("serie" in cialoZadania || "ciezarWykonany" in cialoZadania)
            && cwTygodnia?.progresja === "ręczne ustawienie" && tydzien !== TYDZIEN_MAKSOW) {
          slot.tygodnie ??= {};
          slot.tygodnie[tydzien as 1] ??= {};
          if (wpis.ciezarWykonany) {
            slot.tygodnie[tydzien as 1]!.ciezarKlienta = { kg: wpis.ciezarWykonany, cwiczenieId: cwTygodnia.id };
          } else {
            delete slot.tygodnie[tydzien as 1]!.ciezarKlienta;
          }
        }

        if (i >= 0) wykonania[i] = wpis; else wykonania.push(wpis);

        // Kalibracja pierwszym treningiem: seria przy ćwiczeniu bez 1RM staje
        // się jego 1RM, a z niego liczy się cały cykl — patrz `kalibracja.ts`.
        const skalibrowane = skalibruj(cel.plan, wpis, wpis.data);
        if (skalibrowane) cel.plan.serieMaksymalne = skalibrowane;

        return json(res, naEkran(magazyn.zapisz({ ...cel, wykonania })));
      }

      if (akcja === "/dzien" && req.method === "POST") {
        const cialoZadania = await cialo(req);
        const dzien = wZakresie(cialoZadania.dzien, GRANICE.dzien);
        const tydzien = wZakresie(cialoZadania.tydzien, GRANICE.tydzien);
        if (dzien === null || tydzien === null) {
          return blad(res, "Dzień musi być z zakresu 1–5, a tydzień 1–6");
        }
        const cel = doZapisu(cialoZadania);
        if (!cel) return blad(res, "Ten plan już nie istnieje.", 404);
        if (!tygodniePlanu(cel.plan).includes(tydzien as 1)) {
          return blad(res, "Tego tygodnia nie ma w planie");
        }
        // Tydzień maksów to jeden dzień z bojami zebranymi z całego planu.
        const maksy = tydzien === TYDZIEN_MAKSOW;
        // Domknięcie dnia, którego w planie nie ma, liczyłoby się do frekwencji
        // jako trening, którego nie było.
        if (maksy ? dzien !== 1 : !cel.plan.sloty.some((s) => s.dzien === dzien && s.cwiczenieId)) {
          return blad(res, "Ten dzień nie ma w planie ćwiczeń");
        }
        const ukonczoneDni = (cel.ukonczoneDni ?? [])
          .filter((d) => !(d.dzien === dzien && d.tydzien === tydzien));
        ukonczoneDni.push({ dzien, tydzien, data: new Date().toISOString() });

        // Arkusz robi to samo: brak odczucia w ukończonym dniu znaczy "OK".
        // Domknięcie dnia dopisuje też brakujące wpisy do historii — inaczej
        // podsumowanie odczuć w konsoli liczyłoby tylko te wciśnięte ręcznie.
        const wykonania = [...(cel.wykonania ?? [])];
        const teraz = new Date().toISOString();
        // Przy maksach nie: próba na RPE 10 nie ma „OK" ani „za łatwe",
        // a dzień 1 planu to nie są boje z tygodnia maksów.
        for (const slot of maksy ? [] : cel.plan.sloty) {
          if (slot.dzien !== dzien || !slot.cwiczenieId) continue;
          slot.tygodnie ??= {};
          slot.tygodnie[tydzien as 1] ??= {};
          slot.tygodnie[tydzien as 1]!.feedback ??= "OK";
          const juzJest = wykonania.some(
            (w) => w.positionId === slot.positionId && w.tydzien === tydzien,
          );
          if (!juzJest) {
            wykonania.push({
              positionId: slot.positionId, tydzien, data: teraz, feedback: "OK",
            });
          }
        }

        return json(res,
          naEkran(magazyn.zapisz({ ...cel, ukonczoneDni, wykonania })));
      }

      // Waga ciała. Jeden wpis na dzień — kolejny tego samego dnia nadpisuje
      // poprzedni, bo waży się rano, a nie co godzinę. Wpis idzie do klienta,
      // nie do planu: historia ma być ciągła przez kolejne cykle.
      if (akcja === "/waga" && req.method === "POST") {
        const kg = wZakresie((await cialo(req)).kg, GRANICE.waga, false);
        if (kg === null) return blad(res, "Waga musi być z zakresu 20–400 kg");
        magazyn.zapiszWage(osoba.trenerId, osoba.id, dzisiaj(), kg);
        // Przez `naEkran`, jak wszystkie zapisy: waga należy do klienta, więc
        // zapisuje się także wtedy, gdy aktywnego planu akurat nie ma.
        return json(res, naEkran(magazyn.wczytaj(zapisany.trenerId, zapisany.id)!));
      }

      if (akcja === "/serie" && req.method === "POST") {
        const cialoZadania = await cialo(req);
        const { cwiczenieId } = cialoZadania;
        // Z tej jednej pary liczb wychodzi 1RM, a z niego ciężary na sześć
        // tygodni. Powtórzeń liczy się do 15 — poza tabelą nie ma z czego.
        const ciezar = wZakresie(cialoZadania.ciezar, GRANICE.ciezar, false);
        const powtorzenia = wZakresie(cialoZadania.powtorzenia, [0, POWT_MAX]);
        /*
         * Komunikat mówi, CO zrobić, nie tylko czego nie wolno. Poprzedni
         * („Seria maksymalna: ciężar 0–1000 kg, powtórzenia 0–15") wyglądał
         * jak wypis z dokumentacji: klient czytał go w telefonie i nie wiedział,
         * że wystarczy dołożyć kilogramów, żeby zmieścić się w piętnastu.
         */
        if (powtorzenia === null) {
          return blad(res, `Serię maksymalną liczymy do ${POWT_MAX} powtórzeń — `
            + "przy większej liczbie nie ma z czego wyliczyć ciężaru. "
            + `Dołóż kilogramów tak, żeby zmieścić się w ${POWT_MAX}.`);
        }
        if (ciezar === null) {
          return blad(res, "Ciężar serii maksymalnej musi być z zakresu 0–1000 kg.");
        }
        if (cwiczenieId && !katalog.poId(String(cwiczenieId))) {
          return blad(res, "Nie ma takiego ćwiczenia w bazie");
        }
        const cel = doZapisu(cialoZadania);
        if (!cel) return blad(res, "Ten plan już nie istnieje.", 404);
        const serieMaksymalne = cel.plan.serieMaksymalne
          .filter((s) => s.cwiczenieId !== cwiczenieId);
        if (ciezar > 0 && powtorzenia > 0) {
          serieMaksymalne.push({ cwiczenieId, ciezar, powtorzenia });
        }
        cel.plan.serieMaksymalne = serieMaksymalne;
        return json(res, naEkran(magazyn.zapisz(cel)));
      }
    }

    if (sciezka.startsWith("/k/")) {
      if (plikStatyczny("/klient/index.html", res, req)) return;
    }

    // ── 1RM z serii maksymalnej (podgląd na żywo) ────────────────────
    if (sciezka === "/api/1rm") {
      const ciezar = Number(url.searchParams.get("ciezar"));
      const powt = Number(url.searchParams.get("powt"));
      return json(res, { oneRM: oblicz1RM(ciezar, powt) });
    }

    if (plikStatyczny(sciezka, res, req)) return;
    blad(res, "Nie znaleziono", 404);
  } catch (e) {
    // Błędy asystenta są już po polsku i niosą własny kod — brak klucza to 503,
    // nie 500. Reszta idzie do logu, bo to znaczy, że coś jest zepsute tutaj.
    if (e instanceof BladZadania) return blad(res, e.message, e.kod);
    if (e instanceof BladAI) return blad(res, e.message, Math.min(Math.max(e.kod, 400), 599));
    console.error(e);
    try {
      blad(res, e instanceof Error ? e.message : String(e), 500);
    } catch {
      // Nawet zerwana odpowiedź nie może położyć serwera — połączenie
      // zamykamy, a konsola pracuje dalej dla wszystkich pozostałych.
      res.destroy();
    }
  }
});

/**
 * Kopia raz na dobę, przy starcie i potem w tle.
 *
 * Konsola chodzi na laptopie i trzyma w sobie po sześć tygodni pracy każdego
 * klienta. Do tej pory jedyną kopią była ta zrobiona ręcznie — czyli żadna.
 * Zegar jest `unref`, więc nie trzyma procesu przy życiu przy zamykaniu okna.
 */
async function kopiaWTle(): Promise<void> {
  try {
    const plik = await kopiaJesliTrzeba();
    if (plik) console.log(`  Kopia zapasowa: ${plik}\n`);
  } catch (e) {
    // Brak kopii nie może zatrzymać konsoli — ale ma zostać powiedziany wprost.
    console.error(`  Nie udało się zrobić kopii zapasowej: ${e instanceof Error ? e.message : e}\n`);
  }
}

/**
 * Node domyślnie zamyka bezczynne połączenie po 5 sekundach. Klient, który
 * trzyma je otwarte i wraca po dłuższej przerwie — przeglądarka po treningu,
 * narzędzie po przeliczeniu arkusza — pisze wtedy do gniazda, którego już nie
 * ma, i dostaje „other side closed" zamiast odpowiedzi. Żądania POST nie są
 * powtarzane automatycznie, więc taka utrata to utrata zapisu.
 *
 * Konsola obsługuje jednego trenera i jego klientów; trzymanie połączeń
 * minutę dłużej nic tu nie kosztuje. `headersTimeout` musi być większy od
 * `keepAliveTimeout`, inaczej Node zgłasza konflikt ustawień.
 */
serwer.keepAliveTimeout = 65_000;
serwer.headersTimeout = 70_000;

/**
 * Zajęty port to najczęstsza przyczyna nieudanego startu — i dotąd kończył się
 * śladem stosu po angielsku, w oknie, które zaraz potem gasło. Bez tego
 * uchwytu Node zgłasza nieobsłużone zdarzenie `error` i wywala proces.
 */
serwer.on("error", (blad) => {
  console.error(`\n  ${powodNieuruchomienia(blad, PORT)}\n`);
  process.exit(1);
});

serwer.listen(PORT, async () => {
  const tryb = auth.trybDostepu(TRENER);
  console.log(`\n  Konsola trenera CraftMyPlan`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  ${katalog.wszystkie.length} ćwiczeń w bazie · ${magazyn.lista(TRENER).length} planów`);
  // Gdzie leżą dane — bo aktualizacja z paczki znaczy nowy katalog obok
  // starego, a wtedy pierwsze pytanie brzmi „gdzie są moi klienci".
  console.log(`  Dane: ${SCIEZKA_BAZY}`);
  console.log(tryb.tryb === "hasło"
    ? "  Dostęp: hasło wymagane.\n"
    : "  Dostęp: tryb lokalny, bez hasła — ekrany trenera tylko z tego komputera.\n"
      + "  Zanim wystawisz konsolę na zewnątrz: npm run haslo\n");

  /*
   * Adres dla telefonu — wypisany od razu, bo inaczej trzeba go szukać
   * w ustawieniach systemu.
   *
   * Odtworzone na prawdziwym uruchomieniu: trener miał plan, miał link, miał
   * telefon w tej samej sieci — i utknął na tym, że nie wiedział, jaki numer
   * ma jego komputer. Przeszedł przez cztery ekrany Ustawień, żeby znaleźć
   * jedną liczbę, którą konsola zna od pierwszej sekundy.
   */
  /*
   * Pusta lista planów przy starcie to dwie zupełnie różne sytuacje: pierwsze
   * uruchomienie albo aktualizacja, w której dane zostały w poprzednim
   * katalogu. Druga zdarzyła się naprawdę — trener rozpakował nową paczkę
   * obok starej, kliknął launcher i zobaczył pustą listę klientów; baza leżała
   * całe cztery katalogi wcześniej. Konsola wie o tym wcześniej niż on
   * i nic go to nie kosztuje, żeby powiedziała to wprost.
   */
  if (magazyn.lista(TRENER).length === 0) {
    console.log("  Baza jest pusta — to pierwsze uruchomienie w tym katalogu.");
    console.log("  Jeśli masz już klientów gdzie indziej: zamknij konsolę, przenieś");
    console.log("  z tamtego katalogu cały folder konsola/dane i uruchom ponownie.\n");
  }

  const wSieci = adresyLokalnejSieci(PORT);
  if (wSieci.length > 0) {
    console.log("  Z telefonu w tej samej sieci — link klienta zaczyna się od:");
    for (const adres of wSieci) console.log(`    ${adres}`);
    console.log("  („localhost” na cudzym telefonie znaczy jego telefon.)\n");
  }

  // Ślad dla narzędzia odtwarzającego bazę: numer procesu i port. Bez niego
  // `npm run przywroc` nie ma jak stwierdzić, że konsola chodzi — i odtworzy
  // bazę pod działającym serwerem, który przy pierwszym zapisie cofnie
  // odtworzenie. Sam plik nic nie blokuje; jest tylko odpowiedzią na pytanie.
  zapiszSlad(PORT);

  await kopiaWTle();
  setInterval(kopiaWTle, 6 * 3_600_000).unref();
});

// Ślad znika razem z konsolą. Zostawiony po ubiciu i tak nie zmyli narzędzia —
// sprawdza ono, czy proces o tym numerze żyje — ale porządek na dysku jest
// tańszy niż tłumaczenie, skąd wziął się plik, którego nikt nie zakładał.
for (const sygnal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sygnal, () => {
    usunSlad();
    process.exit(0);
  });
}
process.on("exit", usunSlad);
