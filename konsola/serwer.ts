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

import { przeliczPlan, porownajLiczenieJednostronnych, type Plan } from "../silnik/src/plan.ts";
import { sprawdzPlan, planGotowyDoWyslania } from "../silnik/src/walidacja.ts";
import { kopiaJesliTrzeba } from "./baza/kopie.ts";
import { bladKsztaltuPlanu, bladDatyStartu } from "./ksztalt-planu.ts";
import { katalog } from "../silnik/src/katalog.ts";
import { oblicz1RM, rozwiaz1RM, POWT_MAX } from "../silnik/src/rpe.ts";
import { propozycja1RM, ocenPropozycje, oneRMzSerii, type SeriaRobocza } from "../silnik/src/odczyt-1rm.ts";
import { zaokraglij } from "../silnik/src/pomocnicze.ts";
import { dawkaOddechowa } from "../silnik/src/oddech.ts";
import { planBiegowy, strefyTetna, tempaTreningowe, hrMax, tempoTestowe, tempoTekst } from "../silnik/src/bieg.ts";
import { NORMY } from "../silnik/src/stres.ts";
import { planZArkusza, nierozpoznaneCwiczenia, type ZrzutArkusza } from "../silnik/src/import-arkusza.ts";
import { porownajCykle, podsumujPorownanie } from "../silnik/src/porownanie-cykli.ts";
import { historiaKlienta, podsumujHistorie } from "../silnik/src/historia-klienta.ts";
import { skopiujTydzien, zastosujProgresje } from "../silnik/src/progresja.ts";
import * as magazyn from "./magazyn.ts";
import { trenerDomyslny } from "./baza/polaczenie.ts";
import * as auth from "./uwierzytelnianie.ts";
import { eksportujDoArkusza } from "./eksport-xlsx.ts";
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
const TRENER = trenerDomyslny();

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

async function cialo(req: IncomingMessage): Promise<any> {
  const dane = await bajty(req);
  if (dane.length === 0) return {};
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
  tydzien: [1, 6],
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
 * Wyciąga plan z pliku .xlsx w formacie 5.17/5.18.
 * Ekstraktor siedzi w Pythonie, bo tylko openpyxl czyta ten format.
 */
function wczytajArkusz(zawartosc: Buffer): ZrzutArkusza {
  const katalogTymczasowy = mkdtempSync(join(tmpdir(), "import-"));
  const zrodlo = join(katalogTymczasowy, "plan.xlsx");
  const cel = join(katalogTymczasowy, "zrzut.json");
  try {
    writeFileSync(zrodlo, zawartosc);
    execFileSync(
      "python3",
      [join(KATALOG, "..", "silnik", "narzedzia", "zrzut-arkusza.py"), zrodlo, cel],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    return JSON.parse(readFileSync(cel, "utf-8")) as ZrzutArkusza;
  } finally {
    rmSync(katalogTymczasowy, { recursive: true, force: true });
  }
}

/**
 * Nakłada zaimportowany plan na pusty szkielet 5 dni × 12 slotów.
 *
 * Import zwraca tylko sloty z ćwiczeniem; reszta musi zostać pusta, ale obecna,
 * żeby w konsoli dało się dopisywać kolejne pozycje.
 */
function scalZPustym(pusty: Plan, zaimportowany: Plan): Plan {
  const wgPozycji = new Map(zaimportowany.sloty.map((s) => [s.positionId, s]));
  return {
    ...zaimportowany,
    sloty: pusty.sloty.map((s) => wgPozycji.get(s.positionId) ?? s),
    topSety: pusty.topSety?.map((t) => {
      const z = zaimportowany.topSety?.find((x) => x.dzien === t.dzien);
      return z ? { ...t, wlaczony: z.wlaczony, rpe: z.rpe } : t;
    }),
  };
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

  const dniOdOstatniej = ostatniaAktywnosc
    ? Math.floor((Date.now() - Date.parse(ostatniaAktywnosc)) / 86_400_000)
    : null;

  // Dzień „rozpoczęty" to taki, w którym klient cokolwiek ocenił — nawet jeśli
  // zapomniał kliknąć „Zakończ trening". Na siłowni to się zdarza notorycznie,
  // a licząc tylko domknięte dni widzielibyśmy zero przy klientach, którzy ćwiczą.
  // Wykonanie zna tylko slot, więc dzień trzeba odczytać z planu.
  const dzienSlotu = new Map(zapisany.plan.sloty.map((s) => [s.positionId, s.dzien]));
  const kluczDnia = (tydzien: number, dzien: number | undefined) => `${tydzien}/${dzien}`;
  const domkniete = new Set(ukonczone.map((u) => kluczDnia(u.tydzien, u.dzien)));
  const rozpoczete = new Set(
    wykonania
      .map((w) => kluczDnia(w.tydzien, dzienSlotu.get(w.positionId)))
      .filter((k) => !k.endsWith("/undefined") && !domkniete.has(k)),
  );
  const wTygodniu = (zbior: Set<string>, tydzien: number) =>
    [...zbior].filter((k) => k.startsWith(`${tydzien}/`)).length;

  return {
    // Link jest jeden na klienta i przeżywa cykle, więc pytamy o klienta.
    maDostep: Boolean((klient ?? magazyn.wczytajKlienta(zapisany.trenerId, zapisany.klientId))?.token),
    trenowaneDni: dniWPlanie.size,
    zaplanowanych: dniWPlanie.size * 6,
    ukonczonych: domkniete.size,
    rozpoczetych: rozpoczete.size,
    ostatniaAktywnosc,
    dniOdOstatniej,
    odczucia: {
      latwe: wykonania.filter((w) => w.feedback === "za łatwe").length,
      ok: wykonania.filter((w) => w.feedback === "OK").length,
      trudne: wykonania.filter((w) => w.feedback === "za trudne").length,
    },
    tygodnie: [1, 2, 3, 4, 5, 6].map((tydzien) => ({
      tydzien,
      ukonczonych: wTygodniu(domkniete, tydzien),
      rozpoczetych: wTygodniu(rozpoczete, tydzien),
      zDnia: dniWPlanie.size,
    })),
  };
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
    const slot = wynik.tygodnie[w.tydzien - 1]?.sloty.find((s) => s.positionId === w.positionId);
    if (!slot?.cwiczenie || typeof slot.rpe !== "number") continue;
    const lista = wgCwiczenia.get(slot.cwiczenie.id) ?? [];
    lista.push({
      ciezar: w.ciezarWykonany!,
      powtorzenia: w.powtorzeniaWykonane!,
      rpePlanowane: slot.rpe,
      feedback: w.feedback ?? null,
    });
    wgCwiczenia.set(slot.cwiczenie.id, lista);
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

  return propozycje1RM(poprzedni, przeliczPlan(poprzedni.plan), zapisany.plan.serieMaksymalne)
    .filter((p) => zapisany.plan.sloty.some((s) => s.cwiczenieId === p.cwiczenieId))
    .map((p) => ({ ...p, zPoprzedniegoCyklu: poprzedni.wersja }));
}

/** Ile dni od `data`. `null`, gdy daty nie ma. */
function dniOd(data: string | null | undefined): number | null {
  if (!data) return null;
  return Math.floor((Date.now() - Date.parse(data)) / 86_400_000);
}

/**
 * Gdzie w cyklu jest klient, licząc od daty startu.
 * Cykl to sześć tygodni; po ostatnim czas na nową wersję planu.
 */
function cyklWCzasie(zapisany: magazyn.ZapisanyPlan) {
  const dni = dniOd(zapisany.dataStartu);
  if (dni === null) return { tydzien: null, doStartu: null, doKonca: null, poCyklu: false };
  // Data startu w przyszłości — plan czeka, cykl jeszcze się nie zaczął.
  if (dni < 0) {
    return { tydzien: null, doStartu: -dni, doKonca: 42 - dni, poCyklu: false };
  }
  return {
    tydzien: Math.min(Math.floor(dni / 7) + 1, 6),
    doStartu: null,
    doKonca: 42 - dni,
    poCyklu: dni >= 42,
  };
}

/** Ile dni bez treningu znaczy „stanął". Tyle samo, co próg sygnału na liście. */
export const PROG_STANAL = 10;

export type Powod =
  | { rodzaj: "stanal"; dni: number }
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

    if (c.poCyklu) powody.push({ rodzaj: "po cyklu", dni: -c.doKonca! });
    else if (c.doKonca !== null && c.doKonca <= 7) {
      powody.push({ rodzaj: "koniec cyklu", doKonca: c.doKonca });
    }

    if (powody.length > 0) {
      wynik.push({
        id: zapisany.id, klientId: klient.id,
        klient: klient.nazwa, wersja: zapisany.wersja, powody,
      });
    }
  }

  // Najpierw ci, którzy zniknęli — reszta poczeka.
  const waga = (p: Powod) =>
    p.rodzaj === "stanal" ? 0 : p.rodzaj === "nie zaczal" ? 1
      : p.rodzaj === "bez linku" ? 2 : p.rodzaj === "po cyklu" ? 3 : 4;
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
    punkty: { tydzien: number; ciezar: number; powtorzenia: number; oneRM: number }[];
  }>();
  for (const w of wykonania) {
    if (!w.ciezarWykonany || !w.powtorzeniaWykonane) continue;
    const slot = wynik.tygodnie[w.tydzien - 1]?.sloty.find((s) => s.positionId === w.positionId);
    if (!slot?.cwiczenie || typeof slot.rpe !== "number") continue;
    const e = oneRMzSerii({
      ciezar: w.ciezarWykonany,
      powtorzenia: w.powtorzeniaWykonane,
      rpePlanowane: slot.rpe,
      feedback: w.feedback ?? null,
    });
    if (!e) continue;
    const wpis = wgCwiczenia.get(slot.cwiczenie.id)
      ?? { nazwa: slot.cwiczenie.nazwa, punkty: [] };
    wpis.punkty.push({
      tydzien: w.tydzien,
      ciezar: w.ciezarWykonany,
      powtorzenia: w.powtorzeniaWykonane,
      oneRM: e.oneRM,
    });
    wgCwiczenia.set(slot.cwiczenie.id, wpis);
  }

  const cwiczenia = [...wgCwiczenia]
    .map(([cwiczenieId, w]) => {
      const punkty = w.punkty.sort((a, b) => a.tydzien - b.tydzien);
      const pierwszy = punkty[0]!;
      const ostatni = punkty.at(-1)!;
      return {
        cwiczenieId,
        nazwa: w.nazwa,
        punkty,
        zmianaKg: zaokraglij(ostatni.ciezar - pierwszy.ciezar, 1),
        zmianaProc: pierwszy.ciezar > 0
          ? zaokraglij(((ostatni.ciezar - pierwszy.ciezar) / pierwszy.ciezar) * 100, 1)
          : null,
      };
    })
    .sort((a, b) => a.nazwa.localeCompare(b.nazwa, "pl"));

  const waga = [...(zapisany.waga ?? [])].sort((a, b) => a.data.localeCompare(b.data));

  return {
    frekwencja: {
      ukonczonych: ukonczone.length,
      zaplanowanych: dniWPlanie.size * 6,
      tygodnie: [1, 2, 3, 4, 5, 6].map((tydzien) => ({
        tydzien,
        ukonczonych: ukonczone.filter((u) => u.tydzien === tydzien).length,
        zDnia: dniWPlanie.size,
      })),
    },
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

  const tygodnie = wynik.tygodnie.map((t) => ({
    tydzien: t.tydzien,
    dni: [...new Set(zapisany.plan.sloty.filter((s) => s.cwiczenieId).map((s) => s.dzien))]
      .sort((a, b) => a - b)
      .map((dzien) => ({
        dzien,
        ukonczony: ukonczone.some((u) => u.dzien === dzien && u.tydzien === t.tydzien),
        topSet: t.topSety.find((x) => x.dzien === dzien) ?? null,
        cwiczenia: t.sloty
          .filter((s) => s.dzien === dzien && s.cwiczenie)
          .map((s) => ({
            positionId: s.positionId,
            lp: s.lp,
            grupa: (s.lp || "").charAt(0),
            nazwa: s.cwiczenie!.nazwa,
            film: s.cwiczenie!.film ?? null,
            jednostronne: s.cwiczenie!.jednostronne ?? false,
            serie: s.serie,
            powtorzenia: s.powtorzenia,
            rpe: s.rpe,
            ciezar: s.ciezar,
            feedback: zapisany.plan.sloty.find((x) => x.positionId === s.positionId)
              ?.tygodnie?.[t.tydzien]?.feedback ?? null,
            ciezarWykonany: wykonanie(s.positionId, t.tydzien)?.ciezarWykonany ?? null,
            powtorzeniaWykonane: wykonanie(s.positionId, t.tydzien)?.powtorzeniaWykonane ?? null,
          })),
      })),
  }));

  // Ćwiczenia bez 1RM — klient musi je zmierzyć, zanim ruszy plan.
  const doZmierzenia = [...new Set(zapisany.plan.sloty
    .filter((s) => s.cwiczenieId).map((s) => s.cwiczenieId!))]
    .map((id) => {
      const slot = wynik.tygodnie[0]!.sloty.find((s) => s.cwiczenie?.id === id);
      const seria = zapisany.plan.serieMaksymalne.find((s) => s.cwiczenieId === id);
      return {
        cwiczenieId: id,
        nazwa: slot?.cwiczenie?.nazwa ?? id,
        film: slot?.cwiczenie?.film ?? null,
        ciezar: seria?.ciezar ?? null,
        powtorzenia: seria?.powtorzenia ?? null,
        oneRM: slot?.oneRM || null,
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

function plikStatyczny(sciezkaUrl: string, res: ServerResponse): boolean {
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

  res.writeHead(200, naglowki);
  res.end(readFileSync(pelna));
  return true;
}

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
          if (plikStatyczny("/logowanie.html", res)) return;
        }
        res.writeHead(kto.kod, { "content-type": "text/plain; charset=utf-8" });
        return res.end(kto.odmowa);
      }
      trenerId = kto.trenerId;
    }

    // ── katalog ćwiczeń ──────────────────────────────────────────────
    if (sciezka === "/api/cwiczenia") {
      return json(res, katalog.wszystkie);
    }

    if (sciezka === "/api/ja" && req.method === "GET") {
      const trener = auth.trenerPoId(trenerId);
      return json(res, {
        nazwa: trener?.nazwa ?? "Trener",
        email: trener?.email ?? null,
        tryb: auth.trybDostepu(TRENER).tryb,
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
      if (zawartosc.length === 0) return blad(res, "Pusty plik");

      let zrzut: ZrzutArkusza;
      try {
        zrzut = wczytajArkusz(zawartosc);
      } catch {
        return blad(res, "Nie udało się odczytać pliku. Czy to arkusz w układzie 5.17/5.18?");
      }

      // Arkusz bez ani jednego rozpoznanego ćwiczenia dawał do tej pory pusty
      // plan i komunikat o powodzeniu — najgorsze możliwe połączenie. Import
      // ma tu powiedzieć wprost, że nic nie wczytał.
      const zArkusza = planZArkusza(zrzut);
      if (!zArkusza.sloty.some((s) => s.cwiczenieId)) {
        const nierozpoznane = nierozpoznaneCwiczenia(zrzut);
        return blad(res, nierozpoznane.length
          ? `W arkuszu nie ma ani jednego ćwiczenia z BAZY. Nierozpoznane nazwy: `
            + `${nierozpoznane.slice(0, 5).map((n) => `„${n.nazwa}"`).join(", ")}.`
          : "W arkuszu nie ma ani jednego ćwiczenia. Czy to plik z planem, "
            + "z wypełnionymi zakładkami T1–T6?");
      }

      const id = magazyn.nowyId(klient, wersja);
      if (magazyn.wczytaj(trenerId, id)) return blad(res, `Plan „${id}" już istnieje`);

      const osoba = magazyn.zapewnijKlienta(trenerId, klient);
      const zapisany = magazyn.zapisz({
        id, trenerId, klientId: osoba.id, klient: osoba.nazwa, wersja, status: "szkic",
        dataStartu: null, utworzony: "", zmieniony: "",
        poprzedniId: url.searchParams.get("poprzedniId") || undefined,
        // Szkielet pustych slotów musi zostać — import wypełnia tylko te z ćwiczeniem.
        plan: scalZPustym(magazyn.pustyPlan(osoba.nazwa), zArkusza),
      });

      return json(res, {
        ...obrazPlanu(zapisany),
        nierozpoznane: nierozpoznaneCwiczenia(zrzut),
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

        return json(res, obrazPlanu(magazyn.zapisz({ ...zapisany, plan })));
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
        const plik = await eksportujDoArkusza(zapisany);
        return json(res, { plik });
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
        const { tryb, zrodlo } = await cialo(req);
        if (tryb === "progresja") {
          return json(res, obrazPlanu(magazyn.zapisz({
            ...zapisany, plan: zastosujProgresje(zapisany.plan),
          })));
        }
        if (tryb === "kopiuj") {
          const tydzien = Number(zrodlo);
          if (!(tydzien >= 1 && tydzien <= 6)) return blad(res, "Podaj tydzień od 1 do 6");
          return json(res, obrazPlanu(magazyn.zapisz({
            ...zapisany, plan: skopiujTydzien(zapisany.plan, tydzien as 1),
          })));
        }
        return blad(res, "Nieznany tryb — „progresja” albo „kopiuj”.");
      }

      if (akcja === "/moduly" && req.method === "PUT") {
        const { oddech, bieg } = await cialo(req);
        return json(res, obrazPlanu(magazyn.zapisz({
          ...zapisany,
          oddech: oddech ?? zapisany.oddech,
          bieg: bieg ?? zapisany.bieg,
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
        if (!propozycja?.dni?.length) return blad(res, "Pusta propozycja");
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

      const zapisany = magazyn.aktywnyPlan(osoba.trenerId, osoba.id);
      if (!zapisany) {
        // Link działa, planu jeszcze nie ma — szkiców klientowi nie pokazujemy.
        if (req.method === "GET") {
          return json(res, { klient: osoba.nazwa, czekaNaPlan: true });
        }
        return blad(res, "Nie masz jeszcze aktywnego planu.", 409);
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
      const naEkran = (zapisanyWynik: magazyn.ZapisanyPlan) =>
        zapisanyWynik.id === zapisany.id ? zapisanyWynik : zapisany;

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

        // Historia wykonań — czego arkusz nie ma w ogóle.
        const wykonania = [...(cel.wykonania ?? [])];
        const i = wykonania.findIndex((w) => w.positionId === positionId && w.tydzien === tydzien);
        const wpis = { ...(i >= 0 ? wykonania[i]! : { positionId, tydzien }) };
        wpis.data = new Date().toISOString();

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
        // Ciężar i powtórzenia idą do propozycji nowego 1RM, czyli wprost do
        // ciężarów kolejnego cyklu. Wartość spoza świata psuje je po cichu.
        if ("ciezarWykonany" in cialoZadania && cialoZadania.ciezarWykonany != null) {
          const kg = wZakresie(cialoZadania.ciezarWykonany, GRANICE.ciezar, false);
          if (kg === null) return blad(res, "Ciężar musi być z zakresu 0–1000 kg");
          wpis.ciezarWykonany = kg || undefined;
        }
        if ("powtorzeniaWykonane" in cialoZadania && cialoZadania.powtorzeniaWykonane != null) {
          const powt = wZakresie(cialoZadania.powtorzeniaWykonane, GRANICE.powtorzenia);
          if (powt === null) return blad(res, "Powtórzenia muszą być z zakresu 0–200");
          wpis.powtorzeniaWykonane = powt || undefined;
        }

        if (i >= 0) wykonania[i] = wpis; else wykonania.push(wpis);
        return json(res, widokKlienta(naEkran(magazyn.zapisz({ ...cel, wykonania }))));
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
        // Domknięcie dnia, którego w planie nie ma, liczyłoby się do frekwencji
        // jako trening, którego nie było.
        if (!cel.plan.sloty.some((s) => s.dzien === dzien && s.cwiczenieId)) {
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
        for (const slot of cel.plan.sloty) {
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
          widokKlienta(naEkran(magazyn.zapisz({ ...cel, ukonczoneDni, wykonania }))));
      }

      // Waga ciała. Jeden wpis na dzień — kolejny tego samego dnia nadpisuje
      // poprzedni, bo waży się rano, a nie co godzinę. Wpis idzie do klienta,
      // nie do planu: historia ma być ciągła przez kolejne cykle.
      if (akcja === "/waga" && req.method === "POST") {
        const kg = wZakresie((await cialo(req)).kg, GRANICE.waga, false);
        if (kg === null) return blad(res, "Waga musi być z zakresu 20–400 kg");
        const dzisiaj = new Date().toISOString().slice(0, 10);
        magazyn.zapiszWage(osoba.trenerId, osoba.id, dzisiaj, kg);
        return json(res, widokKlienta(magazyn.wczytaj(zapisany.trenerId, zapisany.id)!));
      }

      if (akcja === "/serie" && req.method === "POST") {
        const cialoZadania = await cialo(req);
        const { cwiczenieId } = cialoZadania;
        // Z tej jednej pary liczb wychodzi 1RM, a z niego ciężary na sześć
        // tygodni. Powtórzeń liczy się do 15 — poza tabelą nie ma z czego.
        const ciezar = wZakresie(cialoZadania.ciezar, GRANICE.ciezar, false);
        const powtorzenia = wZakresie(cialoZadania.powtorzenia, [0, POWT_MAX]);
        if (ciezar === null || powtorzenia === null) {
          return blad(res, `Seria maksymalna: ciężar 0–1000 kg, powtórzenia 0–${POWT_MAX}`);
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
        return json(res, widokKlienta(naEkran(magazyn.zapisz(cel))));
      }
    }

    if (sciezka.startsWith("/k/")) {
      if (plikStatyczny("/klient/index.html", res)) return;
    }

    // ── 1RM z serii maksymalnej (podgląd na żywo) ────────────────────
    if (sciezka === "/api/1rm") {
      const ciezar = Number(url.searchParams.get("ciezar"));
      const powt = Number(url.searchParams.get("powt"));
      return json(res, { oneRM: oblicz1RM(ciezar, powt) });
    }

    if (plikStatyczny(sciezka, res)) return;
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

serwer.listen(PORT, async () => {
  const tryb = auth.trybDostepu(TRENER);
  console.log(`\n  Konsola trenera CraftMyPlan`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  ${katalog.wszystkie.length} ćwiczeń w bazie · ${magazyn.lista(TRENER).length} planów`);
  console.log(tryb.tryb === "hasło"
    ? "  Dostęp: hasło wymagane.\n"
    : "  Dostęp: tryb lokalny, bez hasła — połączenia tylko z tego komputera.\n"
      + "  Zanim wystawisz konsolę na zewnątrz: npm run haslo\n");

  await kopiaWTle();
  setInterval(kopiaWTle, 6 * 3_600_000).unref();
});
