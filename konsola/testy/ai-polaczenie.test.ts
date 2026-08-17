/**
 * Testy klienta API na podstawionym serwerze.
 *
 * Cała droga — zbudowanie zapytania, wysłanie, odczytanie odpowiedzi, ponowienie
 * po błędzie przejściowym, weryfikacja propozycji katalogiem — przechodzi tutaj
 * przez prawdziwy `fetch`, tylko po drugiej stronie stoi serwer w tym pliku,
 * a nie API. Zero kosztów i zero zależności od tego, czy jest internet.
 *
 * Sprawdzamy też, co naprawdę wychodzi z aplikacji: nagłówki, model i to,
 * że w zapytaniu nie ma parametrów odrzucanych przez ten model.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.ANTHROPIC_API_KEY = "test-klucz";

const { BladAI, MODEL, WERSJA_API, zapytaj } = await import("../ai/klient.ts");
const { zaproponujSzkielet } = await import("../ai/szkielet.ts");
const { odczytajAnalize } = await import("../ai/analiza.ts");
const { przeliczPlan } = await import("../../silnik/src/plan.ts");
const { pustyPlan } = await import("../uklad-planu.ts");

type Zadanie = { naglowki: Record<string, string | undefined>; cialo: any };

let serwer: Server;
let odebrane: Zadanie[] = [];
/** Kolejka odpowiedzi: serwer oddaje je po kolei, jedną na zapytanie. */
let kolejka: { kod: number; tresc: unknown }[] = [];

before(async () => {
  serwer = createServer(async (req, res) => {
    const kawalki: Buffer[] = [];
    for await (const k of req) kawalki.push(k as Buffer);
    odebrane.push({
      naglowki: req.headers as Record<string, string | undefined>,
      cialo: JSON.parse(Buffer.concat(kawalki).toString("utf-8")),
    });
    const odp = kolejka.shift() ?? { kod: 500, tresc: { error: { message: "brak odpowiedzi w kolejce" } } };
    res.writeHead(odp.kod, { "content-type": "application/json" });
    res.end(JSON.stringify(odp.tresc));
  });
  await new Promise<void>((gotowe) => serwer.listen(0, "127.0.0.1", gotowe));
  const { port } = serwer.address() as AddressInfo;
  process.env.CRAFTMYPLAN_API_URL = `http://127.0.0.1:${port}/v1/messages`;
});

after(() => {
  serwer.close();
  delete process.env.CRAFTMYPLAN_API_URL;
  delete process.env.ANTHROPIC_API_KEY;
});

beforeEach(() => { odebrane = []; kolejka = []; });

/** Odpowiedź w kształcie, w jakim oddaje ją Messages API. */
function odpowiedz(tekst: string, stopReason = "end_turn") {
  return {
    kod: 200,
    tresc: {
      content: [{ type: "text", text: tekst }],
      stop_reason: stopReason,
      usage: { input_tokens: 4200, output_tokens: 800, cache_read_input_tokens: 0, cache_creation_input_tokens: 3000 },
    },
  };
}

const SZKIELET = JSON.stringify({
  dni: [
    {
      dzien: 1, nazwa: "Dolny",
      cwiczenia: [
        { cwiczenieId: "EX-0010", nazwa: "Barbell back squat", kategoria: "Lower push", powod: "bój główny" },
        { cwiczenieId: "EX-0016", nazwa: "Barbell row", kategoria: "Upper pull horizontal", powod: "przeciwwaga" },
      ],
    },
  ],
  uzasadnienie: "Jeden dzień, przysiad plus plecy.",
});

describe("klient API — droga tam i z powrotem", () => {
  test("zapytanie ma poprawne nagłówki i model", async () => {
    kolejka.push(odpowiedz("dobrze"));
    await zapytaj({ system: [{ type: "text", text: "zasady" }], wiadomosc: "cześć" });

    const z = odebrane[0]!;
    assert.equal(z.naglowki["x-api-key"], "test-klucz");
    assert.equal(z.naglowki["anthropic-version"], WERSJA_API);
    assert.equal(z.cialo.model, MODEL);
    assert.equal(z.cialo.messages.length, 1);
    for (const zakazane of ["temperature", "top_p", "top_k", "thinking"]) {
      assert.ok(!(zakazane in z.cialo), `${zakazane} nie może wyjść z aplikacji`);
    }
  });

  test("koszt liczy się z tego, co zwróciło API", async () => {
    kolejka.push(odpowiedz("dobrze"));
    const odp = await zapytaj({ system: [{ type: "text", text: "z" }], wiadomosc: "x" });
    // 4200 wejścia ($5/MTok) + 800 wyjścia ($25/MTok) + 3000 zapisu do cache ($6,25/MTok)
    // = 21000 + 20000 + 18750 centów mikro → $0,05975, zaokrąglone do czterech miejsc.
    assert.equal(odp.uzycie.koszt, 0.0598);
  });

  test("błąd przejściowy jest ponawiany, trwały nie", async () => {
    kolejka.push({ kod: 429, tresc: { error: { message: "rate limit" } } }, odpowiedz("udało się"));
    const odp = await zapytaj({ system: [{ type: "text", text: "z" }], wiadomosc: "x" });
    assert.equal(odp.tekst, "udało się");
    assert.equal(odebrane.length, 2, "jedno ponowienie");

    odebrane = [];
    kolejka.push({ kod: 401, tresc: { error: { message: "invalid x-api-key" } } });
    await assert.rejects(
      () => zapytaj({ system: [{ type: "text", text: "z" }], wiadomosc: "x" }),
      (e: unknown) => {
        assert.ok(e instanceof BladAI);
        assert.match(e.message, /Klucz do API jest nieprawidłowy/);
        return true;
      },
    );
    assert.equal(odebrane.length, 1, "złego klucza nie ma sensu powtarzać");
  });

  test("odmowa i urwana odpowiedź mają własne komunikaty po polsku", async () => {
    kolejka.push(odpowiedz("", "refusal"));
    await assert.rejects(
      () => zapytaj({ system: [{ type: "text", text: "z" }], wiadomosc: "x" }),
      /Model odmówił/,
    );

    kolejka.push(odpowiedz("urwane w połowie", "max_tokens"));
    await assert.rejects(
      () => zapytaj({ system: [{ type: "text", text: "z" }], wiadomosc: "x" }),
      /urwała/,
    );
  });
});

describe("asystent — pełna droga propozycji", () => {
  test("odpowiedź modelu wraca jako sprawdzona propozycja", async () => {
    kolejka.push(odpowiedz(SZKIELET));
    const { propozycja, uzycie } = await zaproponujSzkielet(
      { cel: "siła", staz: "2 lata", sprzet: "sztanga", notatka: "", dniWTygodniu: 1 },
      { poprzednieCwiczenia: ["EX-0016"] },
    );

    assert.equal(propozycja.dni.length, 1);
    assert.deepEqual(
      propozycja.dni[0]!.cwiczenia.map((c) => c.cwiczenieId),
      ["EX-0010", "EX-0016"],
    );
    assert.deepEqual(propozycja.dni[0]!.cwiczenia.map((c) => c.lp), ["A1.", "B1."]);
    assert.ok(propozycja.dni[0]!.cwiczenia[1]!.znaczniki.includes("było w poprzednim cyklu"));
    assert.ok(uzycie.koszt > 0);

    // Katalog leci jako drugi blok systemowy i jest oznaczony do cache —
    // bez tego każde kolejne zapytanie płaciłoby za te same 164 pozycje.
    const system = odebrane[0]!.cialo.system;
    assert.equal(system.length, 2);
    assert.deepEqual(system[1].cache_control, { type: "ephemeral" });
    assert.ok(system[1].text.includes("EX-0010|Barbell back squat"));
    assert.equal(odebrane[0]!.cialo.output_config.effort, "high");
    assert.equal(odebrane[0]!.cialo.output_config.format.type, "json_schema");
  });

  test("odpowiedź nie-JSON kończy się komunikatem, nie wyjątkiem z wnętrzności", async () => {
    kolejka.push(odpowiedz("no więc tak, proponuję przysiad"));
    await assert.rejects(
      () => zaproponujSzkielet(
        { cel: "", staz: "", sprzet: "", notatka: "", dniWTygodniu: 1 },
        { poprzednieCwiczenia: [] },
      ),
      /nie była poprawnym JSON-em/,
    );
  });

  test("odczytanie analizy wraca uporządkowane", async () => {
    kolejka.push(odpowiedz(JSON.stringify({
      spostrzezenia: [
        { tytul: "Core poniżej normy", tresc: "c trzyma 2 serie przy normie 3–6.", waga: "niska" },
        { tytul: "Obwodowy rośnie", tresc: "Od T1 do T3 rośnie z 8,2 do 11,4.", waga: "wysoka" },
      ],
      doSprawdzenia: ["Czy T4 miało być odciążeniem?"],
      podsumowanie: "Cykl narasta zgodnie z planem.",
    })));

    const plan = pustyPlan("Anna Nowak");
    plan.sloty[0]!.cwiczenieId = "EX-0010";
    const { odczyt } = await odczytajAnalize({
      wynik: przeliczPlan(plan), realizacja: null, porownanie: null, uwagi: [],
    });

    assert.deepEqual(odczyt.spostrzezenia.map((s) => s.tytul), ["Obwodowy rośnie", "Core poniżej normy"]);
    assert.equal(odczyt.podsumowanie, "Cykl narasta zgodnie z planem.");
    assert.equal(odebrane[0]!.cialo.output_config.effort, "medium");
    assert.ok(!JSON.stringify(odebrane[0]!.cialo).includes("Anna"), "nazwisko nie wychodzi z aplikacji");
  });
});
