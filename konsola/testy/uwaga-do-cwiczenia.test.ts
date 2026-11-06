/**
 * Uwaga trenera do ćwiczenia (30.10.2026).
 *
 * Trener: „dodaj mi możliwość wpisywania uwag do wybranych ćwiczeń — w konsoli
 * trenera ma być możliwość dopisania uwagi do ćwiczenia i jeżeli taka uwaga
 * została dopisana przy powiedzmy ćwiczeniu C2, to i na liście wyświetlanej,
 * i w panelu ma być ona widoczna — może nie od razu, ale w formie rozwijanej”.
 *
 * Tu: kształt planu (granica długości), lista zmian w wersji roboczej,
 * tłumaczenie planu po angielsku i trasy serwera — widok telefonu wiersz po
 * wierszu, zatwierdzanie zmian, „▲▼” razem z ćwiczeniem. Lista i panel
 * w aplikacji klienta — `narzedzia/przeglad-klienta.ts`, przycisk 💬
 * w konsoli — `narzedzia/przeglad-ekranow.ts`.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plan } from "../../silnik/src/plan.ts";
import { bladKsztaltuPlanu, UWAGA_MAKS } from "../ksztalt-planu.ts";
import { podsumujZmiany } from "../wersja-robocza.ts";
import { podmienTeksty, tekstyTrenera } from "../plan-po-angielsku.ts";
import type { ZapisanyPlan } from "../magazyn.ts";

const UWAGA = "Łokcie blisko tułowia.\n  Na dole pauza 2 s.  ";

const planZUwaga = (uwaga?: unknown): Plan => ({
  nazwa: "uwagi", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość", serieMaksymalne: [],
  sloty: [
    { positionId: "D1-S01", dzien: 1, lp: "C2.", cwiczenieId: "EX-0010", ...(uwaga !== undefined ? { uwaga } : {}) },
    { positionId: "D1-S02", dzien: 1, lp: "C3.", cwiczenieId: "EX-0064" },
  ],
} as unknown as Plan);

describe("uwaga do ćwiczenia — bez serwera", () => {
  test("kształt planu: tekst do 500 znaków; inna postać albo dłuższy — odmowa po polsku", () => {
    assert.equal(bladKsztaltuPlanu(planZUwaga(UWAGA)), null);
    assert.equal(bladKsztaltuPlanu(planZUwaga("x".repeat(UWAGA_MAKS))), null);
    assert.match(bladKsztaltuPlanu(planZUwaga("x".repeat(UWAGA_MAKS + 1)))!, /uwaga do ćwiczenia musi być tekstem do 500 znaków/);
    assert.match(bladKsztaltuPlanu(planZUwaga(["lista"]))!, /uwaga do ćwiczenia/);
  });

  test("wersja robocza: zmieniona uwaga stoi na liście zmian — sama i razem z innymi", () => {
    const nazwa = (id: string) => id;
    assert.deepEqual(podsumujZmiany(planZUwaga(), planZUwaga(UWAGA), {}, nazwa),
      ["Dzień 1 C2: EX-0010 — uwaga dla klienta"]);
    assert.deepEqual(podsumujZmiany(planZUwaga(UWAGA), planZUwaga(UWAGA.trim()), {}, nazwa), [],
      "same spacje na brzegach to nie zmiana");
    const zParametrami = planZUwaga("Wolno w dół.");
    (zParametrami.sloty[0] as any).tygodnie = { 2: { serie: 4 } };
    (zParametrami.sloty[0] as any).bojGlowny = true;
    assert.deepEqual(podsumujZmiany(planZUwaga(), zParametrami, {}, nazwa),
      ["Dzień 1 C2: EX-0010 — parametry T2, ustawienia i uwaga dla klienta"]);
  });

  test("plan po angielsku: linie uwagi do tłumaczenia (z miejscem) i podmienione w widoku", () => {
    const zapisany = { plan: planZUwaga(UWAGA), tlumaczenia: { "Łokcie blisko tułowia.": "Elbows close to your sides." } } as unknown as ZapisanyPlan;
    const teksty = tekstyTrenera(zapisany).filter((t) => t.gdzie.startsWith("Uwaga"));
    assert.deepEqual(teksty, [
      { pl: "Łokcie blisko tułowia.", en: "Elbows close to your sides.", gdzie: "Uwaga · dzień 1 C2" },
      { pl: "Na dole pauza 2 s.", en: null, gdzie: "Uwaga · dzień 1 C2" },
    ]);
    const widok = podmienTeksty({ cwiczenia: [{ uwaga: ["Łokcie blisko tułowia.", "Na dole pauza 2 s."] }] },
      zapisany.tlumaczenia!);
    assert.deepEqual(widok.cwiczenia[0]!.uwaga, ["Elbows close to your sides.", "Na dole pauza 2 s."]);
  });
});

describe("uwaga do ćwiczenia — trasy serwera", () => {
  const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
  const KATALOG = mkdtempSync(join(tmpdir(), "uwaga-test-"));
  let konsola: ChildProcess;
  let adres = "";
  let planId = "";
  let token = "";

  const zapytaj = async (sciezka: string, metoda = "GET", cialo?: unknown) => {
    const r = await fetch(`${adres}${sciezka}`, {
      method: metoda, headers: { "content-type": "application/json" },
      body: cialo ? JSON.stringify(cialo) : undefined,
    });
    return { kod: r.status, tresc: await r.json() as any };
  };
  const naTelefonie = async () => {
    const widok = (await zapytaj(`/api/klient/${token}`)).tresc;
    return widok.tygodnie[0].dni[0].cwiczenia.map((c: any) => [c.cwiczenieId, c.uwaga]);
  };

  before(async () => {
    const wolny = createServer();
    await new Promise<void>((g) => wolny.listen(0, "127.0.0.1", g));
    const port = (wolny.address() as AddressInfo).port;
    await new Promise<void>((g) => { wolny.close(() => g()); });
    adres = `http://127.0.0.1:${port}`;
    const { ANTHROPIC_API_KEY: _bezKlucza, ...env } = process.env;
    konsola = spawn(process.execPath, ["--no-warnings", "serwer.ts"], {
      cwd: KONSOLA,
      env: { ...env, PORT: String(port),
        BAZA_CRAFTMYPLAN: join(KATALOG, "craftmyplan.db"), KOPIE_CRAFTMYPLAN: join(KATALOG, "kopie") },
      stdio: "ignore",
    });
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(`${adres}/zdrowie`)).ok) break; } catch { /* jeszcze nie */ }
      await new Promise((g) => setTimeout(g, 150));
    }
    planId = (await zapytaj("/api/plany", "POST", { klient: "Uwaga Testowa", wersja: 1 })).tresc.zapisany.id;
    const plan = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan;
    plan.sloty[0].cwiczenieId = "EX-0010";
    plan.sloty[0].uwaga = UWAGA;
    plan.sloty[1].cwiczenieId = "EX-0064";
    const zapis = await zapytaj(`/api/plany/${planId}`, "PUT", { plan, dataStartu: null, status: "wysłany" });
    assert.equal(zapis.kod, 200, JSON.stringify(zapis.tresc));
    token = (await zapytaj(`/api/plany/${planId}/link`, "POST")).tresc.token;
  });

  after(() => {
    konsola?.kill("SIGKILL");
    rmSync(KATALOG, { recursive: true, force: true });
  });

  test("telefon dostaje uwagę wiersz po wierszu, bez pustych linii i spacji na brzegach; bez uwagi — null", async () => {
    assert.deepEqual(await naTelefonie(), [
      ["EX-0010", ["Łokcie blisko tułowia.", "Na dole pauza 2 s."]],
      ["EX-0064", null],
    ]);
  });

  test("za długa uwaga — odmowa, plan bez zmian", async () => {
    const plan = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan;
    plan.sloty[1].uwaga = "x".repeat(UWAGA_MAKS + 1);
    const { kod, tresc } = await zapytaj(`/api/plany/${planId}`, "PUT", { plan });
    assert.equal(kod, 400);
    assert.match(tresc.blad, /uwaga do ćwiczenia musi być tekstem do 500 znaków/);
    assert.equal((await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan.sloty[1].uwaga, undefined);
  });

  test("nowa uwaga u wysłanego planu czeka na „Zatwierdź” jak każda zmiana", async () => {
    const plan = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan;
    plan.sloty[1].uwaga = "Ramiona lekko ugięte.";
    assert.equal((await zapytaj(`/api/plany/${planId}`, "PUT", { plan })).kod, 200);
    const obraz = (await zapytaj(`/api/plany/${planId}`)).tresc;
    const lp = plan.sloty[1].lp.replace(/\.$/, "");
    assert.ok(obraz.zmianyDlaKlienta.zmiany.some((z: string) => z.startsWith(`Dzień 1 ${lp}:`) && z.endsWith("— uwaga dla klienta")),
      JSON.stringify(obraz.zmianyDlaKlienta));
    assert.equal((await naTelefonie())[1][1], null, "klient jeszcze jej nie widzi");
    assert.equal((await zapytaj(`/api/plany/${planId}/zatwierdz`, "POST")).kod, 200);
    assert.deepEqual((await naTelefonie())[1][1], ["Ramiona lekko ugięte."]);
  });

  test("plan po angielsku: przetłumaczona linia uwagi przychodzi na telefon po angielsku", async () => {
    const { kod } = await zapytaj(`/api/plany/${planId}/jezyk`, "PUT",
      { jezyk: "en", tlumaczenia: { "Łokcie blisko tułowia.": "Elbows close to your sides." } });
    assert.equal(kod, 200);
    const teksty = (await zapytaj(`/api/plany/${planId}/jezyk`)).tresc.teksty;
    assert.ok(teksty.some((t: any) => t.pl === "Ramiona lekko ugięte." && t.gdzie.startsWith("Uwaga · dzień 1")));
    assert.deepEqual((await naTelefonie())[0][1], ["Elbows close to your sides.", "Na dole pauza 2 s."]);
    await zapytaj(`/api/plany/${planId}/jezyk`, "PUT", { jezyk: "pl", tlumaczenia: {} });
  });

  test("„▲▼” przenosi uwagę razem z ćwiczeniem", async () => {
    const przed = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan.sloty;
    const { kod } = await zapytaj(`/api/plany/${planId}/przenies`, "POST",
      { positionId: przed[0].positionId, kierunek: "dol" });
    assert.equal(kod, 200);
    const po = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan.sloty;
    assert.deepEqual([po[0].cwiczenieId, po[0].uwaga], ["EX-0064", "Ramiona lekko ugięte."]);
    assert.deepEqual([po[1].cwiczenieId, po[1].uwaga], ["EX-0010", UWAGA]);
  });
});
