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
import { readFileSync, existsSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { przeliczPlan, porownajLiczenieJednostronnych, type Plan } from "../silnik/src/plan.ts";
import { sprawdzPlan, planGotowyDoWyslania } from "../silnik/src/walidacja.ts";
import { katalog } from "../silnik/src/katalog.ts";
import { oblicz1RM } from "../silnik/src/rpe.ts";
import { NORMY } from "../silnik/src/stres.ts";
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

async function cialo(req: IncomingMessage): Promise<any> {
  const kawalki: Buffer[] = [];
  for await (const k of req) kawalki.push(k as Buffer);
  if (kawalki.length === 0) return {};
  return JSON.parse(Buffer.concat(kawalki).toString("utf-8"));
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
    normy: NORMY,
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
      return json(res, magazyn.lista().map(({ plan, ...reszta }) => ({
        ...reszta,
        cwiczen: plan.sloty.filter((s) => s.cwiczenieId).length,
      })));
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

      if (akcja === "/eksport" && req.method === "POST") {
        const plik = await eksportujDoArkusza(zapisany);
        return json(res, { plik });
      }
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
