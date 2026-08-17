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
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { przeliczPlan, porownajLiczenieJednostronnych, type Plan } from "../silnik/src/plan.ts";
import { sprawdzPlan, planGotowyDoWyslania } from "../silnik/src/walidacja.ts";
import { katalog } from "../silnik/src/katalog.ts";
import { oblicz1RM, rozwiaz1RM } from "../silnik/src/rpe.ts";
import { propozycja1RM, ocenPropozycje, oneRMzSerii, type SeriaRobocza } from "../silnik/src/odczyt-1rm.ts";
import { zaokraglij } from "../silnik/src/pomocnicze.ts";
import { dawkaOddechowa } from "../silnik/src/oddech.ts";
import { planBiegowy, strefyTetna, tempaTreningowe, hrMax, tempoTestowe, tempoTekst } from "../silnik/src/bieg.ts";
import { NORMY } from "../silnik/src/stres.ts";
import { planZArkusza, nierozpoznaneCwiczenia, type ZrzutArkusza } from "../silnik/src/import-arkusza.ts";
import * as magazyn from "./magazyn.ts";
import { trenerDomyslny } from "./baza/polaczenie.ts";
import * as auth from "./uwierzytelnianie.ts";
import { eksportujDoArkusza } from "./eksport-xlsx.ts";

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

function json(res: ServerResponse, dane: unknown, kod = 200): void {
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

async function cialo(req: IncomingMessage): Promise<any> {
  const dane = await bajty(req);
  if (dane.length === 0) return {};
  return JSON.parse(dane.toString("utf-8"));
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
function realizacja(zapisany: magazyn.ZapisanyPlan) {
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
    maDostep: Boolean(zapisany.token),
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
function propozycje1RM(zapisany: magazyn.ZapisanyPlan, wynik: ReturnType<typeof przeliczPlan>) {
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
    const obecne = rozwiaz1RM(cwiczenieId, zapisany.plan.serieMaksymalne);
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
 * zniknął. Bierzemy tylko plany wysłane — szkice to jeszcze nie zobowiązanie.
 */
function wymagajaUwagi(plany: readonly magazyn.ZapisanyPlan[]) {
  const wynik: { id: string; klient: string; wersja: number; powody: Powod[] }[] = [];

  for (const zapisany of plany) {
    if (zapisany.status !== "wysłany") continue;
    const r = realizacja(zapisany);
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
      wynik.push({ id: zapisany.id, klient: zapisany.klient, wersja: zapisany.wersja, powody });
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

/** Pełny obraz planu dla interfejsu: wynik, uwagi, gotowość. */
function obrazPlanu(zapisany: magazyn.ZapisanyPlan) {
  const wynik = przeliczPlan(zapisany.plan);
  const uwagi = sprawdzPlan(zapisany.plan, wynik, {
    cwiczeniaZPoprzedniegoCyklu: magazyn.cwiczeniaZPoprzedniegoCyklu(zapisany),
  });
  return {
    zapisany,
    wynik,
    uwagi,
    gotowy: planGotowyDoWyslania(uwagi),
    jednostronne: porownajLiczenieJednostronnych(zapisany.plan),
    realizacja: realizacja(zapisany),
    propozycje1RM: propozycje1RM(zapisany, wynik),
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
    klient: zapisany.klient,
    wersja: zapisany.wersja,
    dataStartu: zapisany.dataStartu,
    tygodnie,
    doZmierzenia,
    moduly: moduly(zapisany),
    postep: postepKlienta(zapisany, wynik),
  };
}

function plikStatyczny(sciezkaUrl: string, res: ServerResponse): boolean {
  const wzgledna = normalize(sciezkaUrl === "/" ? "/index.html" : sciezkaUrl).replace(/^(\.\.[/\\])+/, "");
  const pelna = join(PUBLIC, wzgledna);
  if (!pelna.startsWith(PUBLIC) || !existsSync(pelna)) return false;
  res.writeHead(200, { "content-type": TYPY[extname(pelna)] ?? "application/octet-stream" });
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
        const { plan, token, wykonania, ukonczoneDni, ...reszta } = zapisany;
        return {
          ...reszta,
          cwiczen: plan.sloty.filter((s) => s.cwiczenieId).length,
          realizacja: realizacja(zapisany),
          cykl: cyklWCzasie(zapisany),
        };
      });
      return json(res, plany);
    }

    /** Krótka lista tego, na co trener powinien dziś spojrzeć. */
    if (sciezka === "/api/uwaga" && req.method === "GET") {
      return json(res, wymagajaUwagi(magazyn.lista(trenerId)));
    }

    // ── nowy plan ────────────────────────────────────────────────────
    if (sciezka === "/api/plany" && req.method === "POST") {
      const { klient, wersja = 1, poprzedniId } = await cialo(req);
      if (!klient?.trim()) return blad(res, "Podaj nazwisko klienta");
      const id = magazyn.nowyId(klient, wersja);
      if (magazyn.wczytaj(trenerId, id)) return blad(res, `Plan „${id}" już istnieje`);
      const zapisany = magazyn.zapisz({
        id, trenerId, klient: klient.trim(), wersja, status: "szkic",
        dataStartu: null, utworzony: "", zmieniony: "",
        poprzedniId: poprzedniId || undefined,
        plan: magazyn.pustyPlan(klient.trim()),
      });
      return json(res, obrazPlanu(zapisany), 201);
    }

    // ── import z arkusza ─────────────────────────────────────────────
    if (sciezka === "/api/import" && req.method === "POST") {
      const klient = url.searchParams.get("klient")?.trim();
      const wersja = Number(url.searchParams.get("wersja") ?? 1);
      if (!klient) return blad(res, "Podaj nazwisko klienta");

      const zawartosc = await bajty(req);
      if (zawartosc.length === 0) return blad(res, "Pusty plik");

      let zrzut: ZrzutArkusza;
      try {
        zrzut = wczytajArkusz(zawartosc);
      } catch {
        return blad(res, "Nie udało się odczytać pliku. Czy to arkusz w układzie 5.17/5.18?");
      }

      const id = magazyn.nowyId(klient, wersja);
      if (magazyn.wczytaj(trenerId, id)) return blad(res, `Plan „${id}" już istnieje`);

      const zapisany = magazyn.zapisz({
        id, trenerId, klient, wersja, status: "szkic",
        dataStartu: null, utworzony: "", zmieniony: "",
        poprzedniId: url.searchParams.get("poprzedniId") || undefined,
        // Szkielet pustych slotów musi zostać — import wypełnia tylko te z ćwiczeniem.
        plan: scalZPustym(magazyn.pustyPlan(klient), planZArkusza(zrzut)),
      });

      return json(res, {
        ...obrazPlanu(zapisany),
        nierozpoznane: nierozpoznaneCwiczenia(zrzut),
      }, 201);
    }

    // ── pojedynczy plan ──────────────────────────────────────────────
    const dopasowanie = sciezka.match(/^\/api\/plany\/([a-z0-9-]+)(\/[a-z0-9]+)?$/i);
    if (dopasowanie) {
      const [, id, akcja] = dopasowanie;
      const zapisany = magazyn.wczytaj(trenerId, id!);
      if (!zapisany) return blad(res, "Nie ma takiego planu", 404);

      if (!akcja && req.method === "GET") return json(res, obrazPlanu(zapisany));

      if (!akcja && req.method === "PUT") {
        const zmiany = await cialo(req);
        const zaktualizowany = magazyn.zapisz({ ...zapisany, ...zmiany, id: zapisany.id });
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

      if (akcja === "/link" && req.method === "POST") {
        const token = zapisany.token ?? magazyn.nowyToken();
        const zaktualizowany = magazyn.zapisz({ ...zapisany, token });
        return json(res, { token: zaktualizowany.token, sciezka: `/k/${zaktualizowany.token}` });
      }

      if (akcja === "/link" && req.method === "DELETE") {
        magazyn.zapisz({ ...zapisany, token: undefined });
        return json(res, { uniewazniony: true });
      }

      if (akcja === "/eksport" && req.method === "POST") {
        const plik = await eksportujDoArkusza(zapisany);
        return json(res, { plik });
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
    }

    // ── aplikacja klienta ────────────────────────────────────────────
    const klientowy = sciezka.match(/^\/api\/klient\/([A-Za-z0-9_-]{16,})(\/[a-z]+)?$/);
    if (klientowy) {
      const [, token, akcja] = klientowy;
      const zapisany = magazyn.wczytajPoTokenie(token!);
      if (!zapisany) return blad(res, "Link nieaktualny. Poproś trenera o nowy.", 404);

      if (!akcja && req.method === "GET") {
        return json(res, widokKlienta(zapisany));
      }

      // Odczucie po ćwiczeniu — to samo pole, które w arkuszu jest kolumną H.
      // Aktualizacja jest cząstkowa: klient wysyła osobne wiadomości za ocenę
      // i za wpisany ciężar, a kolejka offline może je odtworzyć w dowolnej
      // kolejności. Nadpisanie całego wpisu gubiłoby to, czego nie przysłano.
      if (akcja === "/odczucie" && req.method === "POST") {
        const cialoZadania = await cialo(req);
        const { positionId, tydzien } = cialoZadania;
        const slot = zapisany.plan.sloty.find((s) => s.positionId === positionId);
        if (!slot) return blad(res, "Nie ma takiego ćwiczenia");

        // Historia wykonań — czego arkusz nie ma w ogóle.
        const wykonania = [...(zapisany.wykonania ?? [])];
        const i = wykonania.findIndex((w) => w.positionId === positionId && w.tydzien === tydzien);
        const wpis = { ...(i >= 0 ? wykonania[i]! : { positionId, tydzien }) };
        wpis.data = new Date().toISOString();

        if ("feedback" in cialoZadania) {
          wpis.feedback = cialoZadania.feedback || undefined;
          slot.tygodnie ??= {};
          slot.tygodnie[tydzien as 1] ??= {};
          slot.tygodnie[tydzien as 1]!.feedback = cialoZadania.feedback || undefined;
        }
        if ("ciezarWykonany" in cialoZadania) {
          wpis.ciezarWykonany = cialoZadania.ciezarWykonany || undefined;
        }
        if ("powtorzeniaWykonane" in cialoZadania) {
          wpis.powtorzeniaWykonane = cialoZadania.powtorzeniaWykonane || undefined;
        }

        if (i >= 0) wykonania[i] = wpis; else wykonania.push(wpis);
        return json(res, widokKlienta(magazyn.zapisz({ ...zapisany, wykonania })));
      }

      if (akcja === "/dzien" && req.method === "POST") {
        const { dzien, tydzien } = await cialo(req);
        const ukonczoneDni = (zapisany.ukonczoneDni ?? [])
          .filter((d) => !(d.dzien === dzien && d.tydzien === tydzien));
        ukonczoneDni.push({ dzien, tydzien, data: new Date().toISOString() });

        // Arkusz robi to samo: brak odczucia w ukończonym dniu znaczy "OK".
        // Domknięcie dnia dopisuje też brakujące wpisy do historii — inaczej
        // podsumowanie odczuć w konsoli liczyłoby tylko te wciśnięte ręcznie.
        const wykonania = [...(zapisany.wykonania ?? [])];
        const teraz = new Date().toISOString();
        for (const slot of zapisany.plan.sloty) {
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

        return json(res, widokKlienta(magazyn.zapisz({ ...zapisany, ukonczoneDni, wykonania })));
      }

      // Waga ciała. Jeden wpis na dzień — kolejny tego samego dnia nadpisuje
      // poprzedni, bo waży się rano, a nie co godzinę.
      if (akcja === "/waga" && req.method === "POST") {
        const { kg } = await cialo(req);
        const dzisiaj = new Date().toISOString().slice(0, 10);
        const waga = (zapisany.waga ?? []).filter((w) => w.data !== dzisiaj);
        if (kg > 0) waga.push({ data: dzisiaj, kg });
        return json(res, widokKlienta(magazyn.zapisz({ ...zapisany, waga })));
      }

      if (akcja === "/serie" && req.method === "POST") {
        const { cwiczenieId, ciezar, powtorzenia } = await cialo(req);
        const serieMaksymalne = zapisany.plan.serieMaksymalne
          .filter((s) => s.cwiczenieId !== cwiczenieId);
        if (ciezar > 0 && powtorzenia > 0) {
          serieMaksymalne.push({ cwiczenieId, ciezar, powtorzenia });
        }
        zapisany.plan.serieMaksymalne = serieMaksymalne;
        return json(res, widokKlienta(magazyn.zapisz(zapisany)));
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
    console.error(e);
    blad(res, e instanceof Error ? e.message : String(e), 500);
  }
});

serwer.listen(PORT, () => {
  const tryb = auth.trybDostepu(TRENER);
  console.log(`\n  Konsola trenera CraftMyPlan`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  ${katalog.wszystkie.length} ćwiczeń w bazie · ${magazyn.lista(TRENER).length} planów`);
  console.log(tryb.tryb === "hasło"
    ? "  Dostęp: hasło wymagane.\n"
    : "  Dostęp: tryb lokalny, bez hasła — połączenia tylko z tego komputera.\n"
      + "  Zanim wystawisz konsolę na zewnątrz: npm run haslo\n");
});
