/**
 * Wersja robocza planu (10.10.2026).
 *
 * Trener: „funkcja taka, że jak wprowadzam zmiany, to nie wpływa to na
 * aktualne plany klientów, chyba że to zatwierdzę”.
 *
 * Najpierw czysta logika (`wersja-robocza.ts`), potem cała droga przez
 * serwer: szkic bez czekania, zmiana przy planie u klienta czeka, wpisy
 * klienta idą do obu wersji, ▲▼ z mapą pozycji, zatwierdzenie, odrzucenie,
 * cofnięcie wszystkiego i powrót do szkicu.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  bezPrzestawien, kanonicznie, odwrocMape, podsumujZmiany, przeniesWpisyKlienta, przestaw,
} from "../wersja-robocza.ts";
import type { Plan } from "../../silnik/src/plan.ts";

const plan = (sloty: [string, string | null, Record<string, unknown>?][]): Plan => ({
  nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość", serieMaksymalne: [],
  sloty: sloty.map(([lp, cwiczenieId, tygodnie], i) => ({
    positionId: `D1-S0${i + 1}`, dzien: 1, lp, cwiczenieId, kategoriaSzkieletu: null,
    tygodnie: (tygodnie ?? {}) as Plan["sloty"][number]["tygodnie"],
  })),
});
const nazwa = (id: string) => ({ "EX-0010": "Przysiad", "EX-0011": "Wyciskanie", "EX-0016": "Wiosło" }[id] ?? id);

describe("mapa przestawień ▲▼", () => {
  test("zamiana i zamiana z powrotem — mapa pusta", () => {
    const raz = przestaw({}, "D1-S01", "D1-S02");
    assert.deepEqual(raz, { "D1-S01": "D1-S02", "D1-S02": "D1-S01" });
    assert.deepEqual(przestaw(raz, "D1-S01", "D1-S02"), {});
    assert.ok(bezPrzestawien({}));
  });

  test("dwa kolejne przestawienia składają się, odwrócenie wraca", () => {
    // A B C → B A C → B C A: treść z S01 (A) jest teraz w S03.
    const m = przestaw(przestaw({}, "D1-S01", "D1-S02"), "D1-S02", "D1-S03");
    assert.equal(m["D1-S03"], "D1-S01");
    assert.equal(odwrocMape(m)["D1-S01"], "D1-S03");
  });
});

describe("wpisy klienta do planu trenera", () => {
  test("ocena, ciężar klienta i jego TOP SET idą na pozycję wskazaną mapą", () => {
    const stary = plan([["A1.", "EX-0010"], ["B1.", "EX-0016"]]);
    const nowy = plan([["A1.", "EX-0010", { 1: { feedback: "OK" } }],
      ["B1.", "EX-0016", { 2: { ciezarKlienta: { kg: 40, cwiczenieId: "EX-0016" } } }]]);
    const trenera = plan([["A1.", "EX-0016", { 1: { serie: 5 } }], ["B1.", "EX-0010"]]);   // po ▲▼
    const naTrenera = odwrocMape(przestaw({}, "D1-S01", "D1-S02"));
    przeniesWpisyKlienta(stary, nowy, trenera, (p) => naTrenera[p] ?? p);
    assert.deepEqual(trenera.sloty[1]!.tygodnie, { 1: { feedback: "OK" } });
    assert.deepEqual(trenera.sloty[0]!.tygodnie,
      { 1: { serie: 5 }, 2: { ciezarKlienta: { kg: 40, cwiczenieId: "EX-0016" } } }, "parametry trenera zostają");
  });

  test("klient cofnął ocenę — znika też u trenera", () => {
    const stary = plan([["A1.", "EX-0010", { 1: { feedback: "OK" } }]]);
    const nowy = plan([["A1.", "EX-0010", { 1: {} }]]);
    const trenera = plan([["A1.", "EX-0010", { 1: { feedback: "OK", rpe: 8 } }]]);
    przeniesWpisyKlienta(stary, nowy, trenera, (p) => p);
    assert.deepEqual(trenera.sloty[0]!.tygodnie, { 1: { rpe: 8 } });
  });

  test("serie maksymalne: tylko ćwiczenie, które klient zmienił", () => {
    const stary = { ...plan([]), serieMaksymalne: [{ cwiczenieId: "EX-0010", ciezar: 100, powtorzenia: 3 }] };
    const nowy = { ...plan([]), serieMaksymalne: [{ cwiczenieId: "EX-0010", ciezar: 110, powtorzenia: 3 }] };
    const trenera = { ...plan([]), serieMaksymalne: [
      { cwiczenieId: "EX-0010", ciezar: 100, powtorzenia: 3 }, { cwiczenieId: "EX-0011", ciezar: 80, powtorzenia: 1 }] };
    przeniesWpisyKlienta(stary, nowy, trenera, (p) => p);
    assert.deepEqual(trenera.serieMaksymalne.map((s) => [s.cwiczenieId, s.ciezar]),
      [["EX-0011", 80], ["EX-0010", 110]], "1RM przyjęte przez trenera zostaje");
  });
});

describe("lista zmian do zatwierdzenia", () => {
  test("dodane, usunięte, podmienione, parametry, numer, przestawienie, ustawienia planu", () => {
    const klienta = plan([["A1.", "EX-0010"], ["B1.", "EX-0016"], ["B2.", "EX-0011"], ["C1.", null], ["C2.", "EX-0016"]]);
    const trenera = plan([["A1.", "EX-0010", { 2: { serie: 4 } }], ["A2.", "EX-0016"], ["B2.", "EX-0016"],
      ["C1.", "EX-0011"], ["C2.", null]]);
    trenera.czescPlanu = "intensywność";
    const z = podsumujZmiany(klienta, trenera, {}, nazwa);
    assert.deepEqual(z, [
      "Dzień 1 A1: Przysiad — parametry T2",
      "Dzień 1 A2: Wiosło — numer B1 → A2",
      "Dzień 1 B2: Wyciskanie → Wiosło",
      "Dzień 1 C1: dodane Wyciskanie",
      "Dzień 1 C2: usunięte Wiosło",
      "Plan: część planu",
    ]);
  });

  test("sam ▲▼ to przestawienie, nie dwie podmiany", () => {
    const klienta = plan([["A1.", "EX-0010"], ["B1.", "EX-0016"]]);
    const trenera = plan([["A1.", "EX-0016"], ["B1.", "EX-0010"]]);
    const z = podsumujZmiany(klienta, trenera, przestaw({}, "D1-S01", "D1-S02"), nazwa);
    assert.deepEqual(z, ["Dzień 1 A1: Wiosło przestawione (było B1)", "Dzień 1 B1: Przysiad przestawione (było A1)"]);
  });

  test("oceny klienta to nie zmiana trenera", () => {
    const klienta = plan([["A1.", "EX-0010", { 1: { feedback: "OK" } }]]);
    const trenera = plan([["A1.", "EX-0010", { 1: {} }]]);
    assert.deepEqual(podsumujZmiany(klienta, trenera, {}, nazwa), []);
  });

  test("porównanie treści nie zależy od kolejności pól", () => {
    assert.equal(kanonicznie({ a: 1, b: { c: 2, d: 3 } }), kanonicznie({ b: { d: 3, c: 2 }, a: 1 }));
  });
});

// ── cała droga przez serwer ─────────────────────────────────────────
const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4202;
const ADRES = `http://127.0.0.1:${PORT}`;
let katalog = "";
let serwer: ChildProcess | null = null;

async function api(sciezka: string, metoda = "GET", cialo?: unknown) {
  const odp = await fetch(`${ADRES}${sciezka}`, {
    method: metoda,
    headers: cialo ? { "content-type": "application/json" } : {},
    body: cialo ? JSON.stringify(cialo) : undefined,
  });
  return { kod: odp.status, dane: await odp.json() as any };
}

const PLAN = "robocza-osoba-1";
let token = "";
const trener = async () => (await api(`/api/plany/${PLAN}`)).dane;
const klient = async () => (await api(`/api/klient/${token}`)).dane;
const nazwyKlienta = async () => (await klient()).tygodnie[0].dni[0].cwiczenia.map((c: any) => c.nazwa);
async function zmienTrener(zmiana: (p: any) => void) {
  const o = await trener();
  zmiana(o.zapisany.plan);
  return api(`/api/plany/${PLAN}`, "PUT", {
    plan: o.zapisany.plan, dataStartu: o.zapisany.dataStartu, status: o.zapisany.status, zmieniony: o.zapisany.zmieniony,
  });
}

before(async () => {
  katalog = mkdtempSync(join(tmpdir(), "craftmyplan-robocza-"));
  serwer = spawn("node", ["--no-warnings", "serwer.ts"], {
    cwd: KONSOLA,
    env: { ...process.env, PORT: String(PORT), BAZA_CRAFTMYPLAN: join(katalog, "test.db") },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${ADRES}/api/cwiczenia`)).ok) break; } catch { /* jeszcze nie wstał */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  await api("/api/plany", "POST", { klient: "Robocza Osoba", wersja: 1 });
});

after(() => {
  serwer?.kill();
  rmSync(katalog, { recursive: true, force: true });
});

describe("wersja robocza przez serwer", () => {
  test("szkic: zmiany zapisują się od razu, nic nie czeka", async () => {
    const odp = await zmienTrener((p) => {
      p.sloty[0].cwiczenieId = "EX-0011";
      p.sloty[1].cwiczenieId = "EX-0016";
      p.sloty[2].cwiczenieId = "EX-0010";
      p.serieMaksymalne = [{ cwiczenieId: "EX-0011", ciezar: 100, powtorzenia: 1 }];
    });
    assert.equal(odp.dane.zmianyDlaKlienta, null);
    // Wysłanie szkicu pokazuje klientowi wszystko — to pierwsze wysłanie, nie zmiana.
    const o = await trener();
    await api(`/api/plany/${PLAN}`, "PUT", { plan: o.zapisany.plan, dataStartu: null, status: "wysłany", zmieniony: o.zapisany.zmieniony });
    token = (await api(`/api/plany/${PLAN}/link`, "POST")).dane.token;
    assert.deepEqual(await nazwyKlienta(), ["Barbell bench press", "Barbell row", "Barbell back squat"]);
    assert.equal((await trener()).zmianyDlaKlienta, null);
  });

  test("plan u klienta: zmiana trenera czeka — klient trenuje na poprzedniej wersji", async () => {
    const odp = await zmienTrener((p) => { p.sloty[1].cwiczenieId = "EX-0013"; });
    assert.equal(odp.kod, 200);
    assert.deepEqual(await nazwyKlienta(), ["Barbell bench press", "Barbell row", "Barbell back squat"]);
    const z = (await trener()).zmianyDlaKlienta;
    assert.equal(z.liczba, 1);
    assert.match(z.zmiany[0], /^Dzień 1 B1: Barbell row → /);
    assert.ok(z.od);
    const lista = (await api("/api/plany")).dane.find((p: any) => p.id === PLAN);
    assert.equal(lista.zmianyCzekaja, true);
    assert.equal(lista.wersjaKlienta, undefined, "lista nie wozi całej wersji klienta");
    assert.equal((await trener()).zapisany.wersjaKlienta, undefined, "konsola dostaje listę zmian, nie kopię planu");
  });

  test("ocena klienta w czasie czekania: jest u klienta i u trenera", async () => {
    await api(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D1-S01", tydzien: 1, feedback: "za łatwe", ciezarWykonany: 80, powtorzeniaWykonane: 5 });
    const k = (await klient()).tygodnie[0].dni[0].cwiczenia[0];
    assert.deepEqual([k.nazwa, k.feedback, k.ciezarWykonany], ["Barbell bench press", "za łatwe", 80]);
    const t = await trener();
    assert.equal(t.zapisany.plan.sloty[0].tygodnie[1].feedback, "za łatwe");
    assert.equal(t.zapisany.plan.sloty[1].cwiczenieId, "EX-0013", "zmiana trenera nie zniknęła");
    assert.equal(t.zmianyDlaKlienta.liczba, 1, "ocena klienta nie jest zmianą trenera");
  });

  test("▲▼ w czasie czekania: u klienta kolejność bez zmian, wykonania przy właściwych ćwiczeniach", async () => {
    const o = await trener();
    await api(`/api/plany/${PLAN}/przenies`, "POST", { positionId: o.zapisany.plan.sloty[0].positionId, kierunek: "dol" });
    assert.deepEqual(await nazwyKlienta(), ["Barbell bench press", "Barbell row", "Barbell back squat"]);
    const t = await trener();
    assert.equal(t.zapisany.plan.sloty[1].cwiczenieId, "EX-0011", "u trenera wyciskanie jest teraz drugie");
    assert.ok(t.zapisany.wykonania.every((w: any) => w.positionId === "D1-S02"), "wykonanie wyciskania poszło z nim");
    assert.ok(t.zmianyDlaKlienta.zmiany.some((x: string) => /przestawione/.test(x)));
    // Klient zapisuje kolejne wykonanie przy swoim A1 (wyciskanie) — u trenera trafia do S02.
    await api(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D1-S01", tydzien: 2, feedback: "OK", ciezarWykonany: 82.5, powtorzeniaWykonane: 5 });
    const t2 = await trener();
    assert.deepEqual(t2.zapisany.wykonania.map((w: any) => [w.positionId, w.tydzien]).sort(),
      [["D1-S02", 1], ["D1-S02", 2]]);
    assert.equal(t2.zapisany.plan.sloty[1].tygodnie[2].feedback, "OK");
    // A u klienta oba wykonania stoją przy jego A1 — tam, gdzie ma wyciskanie.
    const k = await klient();
    const a1 = (t: number) => k.tygodnie[t - 1].dni[0].cwiczenia[0];
    assert.deepEqual([a1(1).nazwa, a1(1).ciezarWykonany, a1(2).ciezarWykonany, a1(2).feedback],
      ["Barbell bench press", 80, 82.5, "OK"]);
  });

  test("zatwierdzenie: klient widzi plan trenera razem ze swoimi wpisami", async () => {
    const odp = await api(`/api/plany/${PLAN}/zatwierdz`, "POST");
    assert.equal(odp.kod, 200);
    assert.equal(odp.dane.zmianyDlaKlienta, null);
    const nazwy = await nazwyKlienta();
    assert.equal(nazwy[1], "Barbell bench press");
    assert.notEqual(nazwy[0], "Barbell row");
    const t = await trener();
    assert.deepEqual(t.zapisany.plan.sloty[1].tygodnie[1].feedback, "za łatwe");
    assert.ok(t.zapisany.wykonania.every((w: any) => w.positionId === "D1-S02"));
  });

  test("odrzucenie: plan wraca do wersji klienta, wpisy klienta z czasu czekania zostają", async () => {
    const przed = (await trener()).zapisany.plan;
    await zmienTrener((p) => { p.sloty[2].cwiczenieId = "EX-0053"; });
    await api(`/api/plany/${PLAN}/przenies`, "POST", { positionId: "D1-S02", kierunek: "gora" });
    await api(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D1-S02", tydzien: 3, feedback: "za trudne", ciezarWykonany: 85, powtorzeniaWykonane: 4 });
    const odp = await api(`/api/plany/${PLAN}/odrzuc`, "POST");
    assert.equal(odp.dane.zmianyDlaKlienta, null);
    const po = odp.dane.zapisany.plan;
    assert.deepEqual(po.sloty.map((s: any) => s.cwiczenieId), przed.sloty.map((s: any) => s.cwiczenieId));
    assert.equal(po.sloty[1].tygodnie[3].feedback, "za trudne");
    assert.ok(odp.dane.zapisany.wykonania.every((w: any) => w.positionId === "D1-S02"), "wykonania na swoim miejscu");
  });

  test("cofnięcie wszystkich zmian (np. ⌘Z) — nic już nie czeka", async () => {
    const przed = (await trener()).zapisany.plan;
    await zmienTrener((p) => { p.sloty[0].tygodnie[1] = { ...(p.sloty[0].tygodnie[1] ?? {}), serie: 7 }; });
    assert.ok((await trener()).zmianyDlaKlienta);
    await zmienTrener((p) => { p.sloty[0].tygodnie = przed.sloty[0].tygodnie; });
    assert.equal((await trener()).zmianyDlaKlienta, null);
  });

  test("powrót do szkicu kończy czekanie, jak dotąd", async () => {
    await zmienTrener((p) => { p.sloty[3].cwiczenieId = "EX-0016"; });
    assert.ok((await trener()).zmianyDlaKlienta);
    const o = await trener();
    await api(`/api/plany/${PLAN}`, "PUT", { plan: o.zapisany.plan, dataStartu: null, status: "szkic", zmieniony: o.zapisany.zmieniony });
    assert.equal((await trener()).zmianyDlaKlienta, null);
  });
});

/**
 * „Resetuj plan” (10.10.2026): „przycisk, który resetuje plan, żeby ktoś mógł
 * zacząć go od początku — z pytaniem o potwierdzenie”. Pytanie zadaje konsola;
 * tu sprawdzamy, co serwer zdejmuje, a co zostawia.
 */
describe("reset planu — klient zaczyna od początku", () => {
  const RESET = "reset-osoba-1";
  let tokenResetu = "";
  const trenerR = async () => (await api(`/api/plany/${RESET}`)).dane;
  const klientR = async () => (await api(`/api/klient/${tokenResetu}`)).dane;

  before(async () => {
    await api("/api/plany", "POST", { klient: "Reset Osoba", wersja: 1 });
    const o = await trenerR();
    const p = o.zapisany.plan;
    p.sloty[0].cwiczenieId = "EX-0011";
    p.sloty[1].cwiczenieId = "EX-0016";   // bez serii maksymalnej — klient dobierze, 1RM z treningu
    p.sloty[0].tygodnie = { 1: { serie: 5, ciezarOverride: 60 } };
    p.serieMaksymalne = [{ cwiczenieId: "EX-0011", ciezar: 100, powtorzenia: 1 }];
    await api(`/api/plany/${RESET}`, "PUT", { plan: p, dataStartu: "2026-09-01", status: "wysłany", zmieniony: o.zapisany.zmieniony });
    tokenResetu = (await api(`/api/plany/${RESET}/link`, "POST")).dane.token;
    await api(`/api/klient/${tokenResetu}/odczucie`, "POST",
      { positionId: "D1-S01", tydzien: 1, feedback: "za łatwe", ciezarWykonany: 60, powtorzeniaWykonane: 5 });
    await api(`/api/klient/${tokenResetu}/odczucie`, "POST",
      { positionId: "D1-S02", tydzien: 1, feedback: "OK", serie: [{ ciezar: 50, powtorzenia: 10 }] });
    await api(`/api/klient/${tokenResetu}/dzien`, "POST", { tydzien: 1, dzien: 1 });
    // Zmiana trenera, która czeka na zatwierdzenie — reset jej nie rusza.
    const t = await trenerR();
    t.zapisany.plan.sloty[2].cwiczenieId = "EX-0010";
    await api(`/api/plany/${RESET}`, "PUT", { plan: t.zapisany.plan, dataStartu: t.zapisany.dataStartu, status: "wysłany", zmieniony: t.zapisany.zmieniony });
  });

  test("przed resetem są wpisy klienta (żeby test sprawdzał coś realnego)", async () => {
    const t = await trenerR();
    assert.ok(t.zapisany.wykonania.length >= 2);
    assert.equal(t.zapisany.ukonczoneDni.length, 1);
    assert.equal(t.zapisany.plan.sloty[0].tygodnie[1].feedback, "za łatwe");
    assert.ok(t.zapisany.plan.serieMaksymalne.some((s: any) => s.kalibracja), "brak 1RM z treningu klienta");
    assert.ok(t.zmianyDlaKlienta);
  });

  test("reset: znikają wykonania, ukończone dni, oceny i 1RM z treningu — w obu wersjach", async () => {
    const odp = await api(`/api/plany/${RESET}/reset`, "POST", { dataStartu: "2026-10-10" });
    assert.equal(odp.kod, 200);
    const t = odp.dane.zapisany;
    assert.deepEqual([t.wykonania.length, t.ukonczoneDni.length], [0, 0]);
    assert.ok(t.plan.sloty.every((s: any) => Object.values(s.tygodnie ?? {})
      .every((w: any) => !w.feedback && !w.ciezarKlienta && !w.topSetKlienta)));
    assert.ok(!t.plan.serieMaksymalne.some((s: any) => s.kalibracja), "1RM z treningu klienta zostało");
    const k = await klientR();
    const pierwszy = k.tygodnie[0].dni[0].cwiczenia[0];
    assert.equal(pierwszy.feedback, null);
    assert.equal(pierwszy.ciezarWykonany, null);
  });

  test("zostaje plan trenera: parametry, ciężar na sztywno, seria maksymalna; zmiana dalej czeka", async () => {
    const t = await trenerR();
    assert.deepEqual(t.zapisany.plan.sloty[0].tygodnie[1], { serie: 5, ciezarOverride: 60 });
    assert.deepEqual(t.zapisany.plan.serieMaksymalne, [{ cwiczenieId: "EX-0011", ciezar: 100, powtorzenia: 1 }]);
    assert.equal(t.zapisany.plan.sloty[2].cwiczenieId, "EX-0010");
    assert.ok(t.zmianyDlaKlienta, "czekająca zmiana trenera nie zniknęła");
    assert.equal(t.zapisany.dataStartu, "2026-10-10");
  });

  test("znacznik resetu: telefon go dostaje, zapis sprzed resetu — odmowa, bieżący i bez znacznika — przechodzą", async () => {
    const k = await klientR();
    assert.ok(k.resetOd, "widok klienta bez znacznika resetu");
    const zapis = (resetOd: unknown) => api(`/api/klient/${tokenResetu}/odczucie`, "POST",
      { planId: RESET, ...(resetOd === undefined ? {} : { resetOd }), positionId: "D1-S01", tydzien: 2, feedback: "OK" });
    const stary = await zapis(null);
    assert.equal(stary.kod, 409);
    assert.match(stary.dane.blad, /zresetował/);
    assert.equal((await zapis(k.resetOd)).kod, 200);
    assert.equal((await zapis(undefined)).kod, 200, "starsza aplikacja bez znacznika");
  });

  test("bez daty w żądaniu data startu zostaje; zła data — odmowa", async () => {
    assert.equal((await api(`/api/plany/${RESET}/reset`, "POST", {})).dane.zapisany.dataStartu, "2026-10-10");
    assert.equal((await api(`/api/plany/${RESET}/reset`, "POST", { dataStartu: "2026-02-30" })).kod, 400);
  });
});
