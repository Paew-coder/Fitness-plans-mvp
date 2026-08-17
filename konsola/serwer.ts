#!/usr/bin/env node
/**
 * Konsola trenera — serwer lokalny.
 *
 *   npm start          → http://localhost:4173
 *
 * Bez frameworka i bez bazy danych. Chodzi u trenera na komputerze, dane leżą
 * w plikach JSON obok. Cała matematyka to `silnik/` — serwer tylko podaje dane
 * i zwraca wynik przeliczenia.
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
import { oblicz1RM } from "../silnik/src/rpe.ts";
import { NORMY } from "../silnik/src/stres.ts";
import { planZArkusza, nierozpoznaneCwiczenia, type ZrzutArkusza } from "../silnik/src/import-arkusza.ts";
import * as magazyn from "./magazyn.ts";
import { eksportujDoArkusza } from "./eksport-xlsx.ts";

const KATALOG = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(KATALOG, "public");
const PORT = Number(process.env.PORT ?? 4173);

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

const serwer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const sciezka = url.pathname;

  try {
    // ── katalog ćwiczeń ──────────────────────────────────────────────
    if (sciezka === "/api/cwiczenia") {
      return json(res, katalog.wszystkie);
    }

    // ── lista planów ─────────────────────────────────────────────────
    if (sciezka === "/api/plany" && req.method === "GET") {
      return json(res, magazyn.lista().map((zapisany) => {
        const { plan, token, wykonania, ukonczoneDni, ...reszta } = zapisany;
        return {
          ...reszta,
          cwiczen: plan.sloty.filter((s) => s.cwiczenieId).length,
          realizacja: realizacja(zapisany),
        };
      }));
    }

    // ── nowy plan ────────────────────────────────────────────────────
    if (sciezka === "/api/plany" && req.method === "POST") {
      const { klient, wersja = 1, poprzedniId } = await cialo(req);
      if (!klient?.trim()) return blad(res, "Podaj nazwisko klienta");
      const id = magazyn.nowyId(klient, wersja);
      if (magazyn.wczytaj(id)) return blad(res, `Plan „${id}" już istnieje`);
      const zapisany = magazyn.zapisz({
        id, klient: klient.trim(), wersja, status: "szkic",
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
      if (magazyn.wczytaj(id)) return blad(res, `Plan „${id}" już istnieje`);

      const zapisany = magazyn.zapisz({
        id, klient, wersja, status: "szkic",
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
    const dopasowanie = sciezka.match(/^\/api\/plany\/([a-z0-9-]+)(\/[a-z]+)?$/i);
    if (dopasowanie) {
      const [, id, akcja] = dopasowanie;
      const zapisany = magazyn.wczytaj(id!);
      if (!zapisany) return blad(res, "Nie ma takiego planu", 404);

      if (!akcja && req.method === "GET") return json(res, obrazPlanu(zapisany));

      if (!akcja && req.method === "PUT") {
        const zmiany = await cialo(req);
        const zaktualizowany = magazyn.zapisz({ ...zapisany, ...zmiany, id: zapisany.id });
        return json(res, obrazPlanu(zaktualizowany));
      }

      if (!akcja && req.method === "DELETE") {
        magazyn.usun(id!);
        return json(res, { usuniety: id });
      }

      if (akcja === "/kopia" && req.method === "POST") {
        const { wersja } = await cialo(req);
        const nowaWersja = Number(wersja) || zapisany.wersja + 1;
        const kopia = magazyn.kopiaJakoNowaWersja(zapisany, nowaWersja);
        if (magazyn.wczytaj(kopia.id)) {
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
      if (akcja === "/odczucie" && req.method === "POST") {
        const { positionId, tydzien, feedback, ciezarWykonany, powtorzeniaWykonane } = await cialo(req);
        const slot = zapisany.plan.sloty.find((s) => s.positionId === positionId);
        if (!slot) return blad(res, "Nie ma takiego ćwiczenia");

        slot.tygodnie ??= {};
        slot.tygodnie[tydzien as 1] ??= {};
        slot.tygodnie[tydzien as 1]!.feedback = feedback || undefined;

        // Historia wykonań — czego arkusz nie ma w ogóle.
        const wykonania = (zapisany.wykonania ?? [])
          .filter((w) => !(w.positionId === positionId && w.tydzien === tydzien));
        wykonania.push({
          positionId, tydzien, data: new Date().toISOString(),
          feedback: feedback || undefined,
          ciezarWykonany: ciezarWykonany ?? undefined,
          powtorzeniaWykonane: powtorzeniaWykonane ?? undefined,
        });

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
  console.log(`\n  Konsola trenera CraftMyPlan`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  ${katalog.wszystkie.length} ćwiczeń w bazie · ${magazyn.lista().length} planów\n`);
});
