/**
 * Dwa zapisy tego samego planu, minięte w czasie.
 *
 * Scenariusz jest zwyczajny, nie wymyślony: trener otwiera plan wieczorem,
 * a klient w tej samej chwili kończy trening i ocenia serię. Ocena idzie do
 * bazy i podnosi ciężar w kolejnym tygodniu. Potem trener zapisuje swoją
 * kopię — sprzed oceny — i **ocena znika**, a ciężar wraca do poprzedniego.
 *
 * Najgorsze jest to, czego nie widać: w panelu „Realizacja" ocena dalej
 * widnieje, bo tam czyta się z historii wykonań, a nie z planu. Trener ma
 * więc pełne przekonanie, że wszystko działa, a klient dostaje na sztangę
 * o pięć kilogramów za mało przez sześć tygodni.
 *
 * Rozstrzygnięcie: zapis niesie znacznik wersji, na której się oparł. Gdy
 * baza ma coś nowszego, zapis nie przechodzi, a w odpowiedzi wraca świeży
 * plan — konsola przenosi z niego to, co należy do klienta, i zapisuje jeszcze
 * raz. Nie ma tu sprzeczności do rozstrzygania: każda strona zmieniała co innego.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4199;
const ADRES = `http://127.0.0.1:${PORT}`;
const PLAN = "wyscig-test-1";

let katalog = "";
let serwer: ChildProcess | null = null;
let token = "";

async function api(sciezka: string, metoda = "GET", cialo?: unknown) {
  const odp = await fetch(`${ADRES}${sciezka}`, {
    method: metoda,
    headers: cialo ? { "content-type": "application/json" } : {},
    body: cialo ? JSON.stringify(cialo) : undefined,
  });
  return { kod: odp.status, dane: await odp.json() as any };
}

/** Ciężar boju głównego w danym tygodniu — to jest liczba, o którą tu chodzi. */
const ciezarT = async (tydzien: number) =>
  (await api(`/api/plany/${PLAN}`)).dane.wynik.tygodnie[tydzien - 1].sloty[0].ciezar;

before(async () => {
  katalog = mkdtempSync(join(tmpdir(), "craftmyplan-wyscig-"));
  serwer = spawn("node", ["--no-warnings", "serwer.ts"], {
    cwd: KONSOLA,
    env: { ...process.env, PORT: String(PORT), BAZA_CRAFTMYPLAN: join(katalog, "test.db"),
      KOPIE_CRAFTMYPLAN: join(katalog, "kopie") },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${ADRES}/api/cwiczenia`)).ok) break; } catch { /* czekamy */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  await api("/api/plany", "POST", { klient: "Wyscig test", wersja: 1 });
  const plan = (await api(`/api/plany/${PLAN}`)).dane.zapisany.plan;
  plan.sloty[0].cwiczenieId = "EX-0010";
  plan.serieMaksymalne = [{ cwiczenieId: "EX-0010", ciezar: 140, powtorzenia: 3 }];
  await api(`/api/plany/${PLAN}`, "PUT", { plan, dataStartu: null, status: "wysłany" });
  await api(`/api/plany/${PLAN}/tygodnie`, "POST", { tryb: "progresja", zrodlo: 1 });
  token = (await api(`/api/plany/${PLAN}/link`, "POST")).dane.token;
});

after(() => {
  serwer?.kill();
  rmSync(katalog, { recursive: true, force: true });
});

describe("zapis oparty na nieaktualnej wersji", () => {
  let kopiaTrenera: any = null;
  let ciezarPrzed = 0;

  test("trener otwiera plan, klient ocenia trening", async () => {
    kopiaTrenera = (await api(`/api/plany/${PLAN}`)).dane.zapisany;
    ciezarPrzed = await ciezarT(2);

    await api(`/api/klient/${token}/odczucie`, "POST",
      { positionId: "D1-S01", tydzien: 1, feedback: "za łatwe" });

    assert.ok(await ciezarT(2) > ciezarPrzed,
      `ocena „za łatwe" miała podnieść ciężar w T2 (${ciezarPrzed} kg)`);
  });

  test("zapis starą kopią jest odrzucany", async () => {
    kopiaTrenera.plan.sloty[0].tygodnie["4"].rpe = 8;
    const { kod } = await api(`/api/plany/${PLAN}`, "PUT", {
      plan: kopiaTrenera.plan, dataStartu: null, status: "wysłany",
      zmieniony: kopiaTrenera.zmieniony,
    });
    assert.equal(kod, 409);
  });

  test("odrzucony zapis niczego nie zmienił", async () => {
    const { dane } = await api(`/api/plany/${PLAN}`);
    assert.equal(dane.zapisany.plan.sloty[0].tygodnie["1"].feedback, "za łatwe");
    assert.ok(await ciezarT(2) > ciezarPrzed, "ciężar cofnął się mimo odmowy");
  });

  test("odpowiedź niesie świeży plan, żeby dało się pogodzić wersje", async () => {
    const { dane } = await api(`/api/plany/${PLAN}`, "PUT", {
      plan: kopiaTrenera.plan, dataStartu: null, status: "wysłany",
      zmieniony: kopiaTrenera.zmieniony,
    });
    assert.ok(dane.aktualny?.zapisany?.plan, "brak świeżego planu w odpowiedzi");
    assert.equal(dane.aktualny.zapisany.plan.sloty[0].tygodnie["1"].feedback, "za łatwe");
  });

  test("po pogodzeniu wersji zostają obie zmiany", async () => {
    // Dokładnie to, co robi konsola: przenosi z bazy to, co należy do klienta,
    // i zapisuje jeszcze raz swoją wersję.
    const swiezy = (await api(`/api/plany/${PLAN}`)).dane.zapisany;
    kopiaTrenera.plan.sloty[0].tygodnie["1"].feedback =
      swiezy.plan.sloty[0].tygodnie["1"].feedback;
    kopiaTrenera.plan.serieMaksymalne = swiezy.plan.serieMaksymalne;

    const { kod } = await api(`/api/plany/${PLAN}`, "PUT", {
      plan: kopiaTrenera.plan, dataStartu: null, status: "wysłany",
      zmieniony: swiezy.zmieniony,
    });
    assert.equal(kod, 200);

    const { dane } = await api(`/api/plany/${PLAN}`);
    assert.equal(dane.zapisany.plan.sloty[0].tygodnie["1"].feedback, "za łatwe",
      "zniknęła ocena klienta");
    assert.equal(dane.zapisany.plan.sloty[0].tygodnie["4"].rpe, 8,
      "zniknęła zmiana trenera");
    assert.ok(await ciezarT(2) > ciezarPrzed, "ciężar nie uwzględnia oceny klienta");
  });

  test("zapis bez znacznika wersji dalej przechodzi", async () => {
    // Import, kopia cyklu i starsze narzędzia nie znają tego pola. Brak
    // znacznika znaczy „nie mam na czym oprzeć porównania", a nie „wymuś zapis".
    const { kod } = await api(`/api/plany/${PLAN}`, "PUT",
      { plan: kopiaTrenera.plan, dataStartu: null, status: "wysłany" });
    assert.equal(kod, 200);
  });

  test("seria maksymalna wpisana z telefonu też nie ginie", async () => {
    const przed = (await api(`/api/plany/${PLAN}`)).dane.zapisany;
    await api(`/api/klient/${token}/serie`, "POST",
      { cwiczenieId: "EX-0010", ciezar: 150, powtorzenia: 2 });

    const { kod } = await api(`/api/plany/${PLAN}`, "PUT", {
      plan: przed.plan, dataStartu: null, status: "wysłany", zmieniony: przed.zmieniony,
    });
    assert.equal(kod, 409, "zapis starą kopią skasowałby serię z telefonu");

    const { dane } = await api(`/api/plany/${PLAN}`);
    assert.equal(dane.zapisany.plan.serieMaksymalne[0].ciezar, 150);
  });
});
