/**
 * Własne ćwiczenia trenera — dodane w konsoli (17.10.2026).
 *
 * Trener: „dodaj możliwość wpisywania własnej nazwy ćwiczenia podczas
 * tworzenia planu — razem z coeff, part, kategorią itp.”
 *
 * Najważniejsze: własne ćwiczenie liczy się w planie jak każde inne —
 * ciężar z 1RM, telefon, eksport — i przeżywa restart serwera.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4203;
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

async function uruchom() {
  serwer = spawn("node", ["--no-warnings", "serwer.ts"], {
    cwd: KONSOLA,
    env: { ...process.env, PORT: String(PORT), BAZA_CRAFTMYPLAN: join(katalog, "test.db") },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${ADRES}/api/cwiczenia`)).ok) return;
    } catch { /* jeszcze nie wstał */ }
    await new Promise((r) => setTimeout(r, 100));
  }
}
async function zatrzymaj() {
  if (!serwer) return;
  const s = serwer;
  serwer = null;
  await new Promise((r) => { s.once("exit", r); s.kill(); });
}

before(async () => {
  katalog = mkdtempSync(join(tmpdir(), "craftmyplan-wlasne-"));
  await uruchom();
});
after(async () => {
  await zatrzymaj();
  rmSync(katalog, { recursive: true, force: true });
});

const PALLOF = {
  nazwa: "Pallof press z pauzą", kategoria: "Core", part: "c", coeff: 0.5,
  progresja: "kg", skokKg: 1, jednostronne: true, film: "https://youtu.be/AH_QZLm_0-s",
};

describe("własne ćwiczenia trenera", () => {
  let id = "";

  test("dodanie — dostaje numer WL-…, wraca z kompletem pól", async () => {
    const { kod, dane } = await api("/api/cwiczenia-wlasne", "POST", PALLOF);
    assert.equal(kod, 201, JSON.stringify(dane));
    id = dane.id;
    assert.match(id, /^WL-\d{4}$/);
    assert.deepEqual(
      [dane.nazwa, dane.kategoria, dane.part, dane.coeff, dane.progresja, dane.skokKg, dane.jednostronne, dane.wlasne],
      ["Pallof press z pauzą", "Core", "c", 0.5, "kg", 1, true, true]);
  });

  test("lista własnych osobno; wspólna lista ćwiczeń bez nich", async () => {
    const wlasne = (await api("/api/cwiczenia-wlasne")).dane;
    assert.deepEqual(wlasne.map((c: any) => c.id), [id]);
    const wszystkie = (await api("/api/cwiczenia")).dane;
    assert.ok(!wszystkie.some((c: any) => c.id === id));
  });

  test("odmowy: zajęta nazwa, brak kategorii, zły coeff, skok 0 przy kg, zły link", async () => {
    for (const [zmiana, slowo] of [
      [{ nazwa: "barbell back squat" }, "już jest w bazie"],
      [{ nazwa: "Pallof press z pauzą" }, "już jest w bazie"],
      [{ nazwa: "Nowe", kategoria: "Nogi" }, "kategorię"],
      [{ nazwa: "Nowe", coeff: 0.6 }, "Coeff"],
      [{ nazwa: "Nowe", skokKg: 0 }, "skok"],
      [{ nazwa: "Nowe", film: "youtu.be/x" }, "link"],
      [{ nazwa: "N" }, "Nazwa"],
    ] as const) {
      const { kod, dane } = await api("/api/cwiczenia-wlasne", "POST", { ...PALLOF, ...zmiana });
      assert.equal(kod, 400, JSON.stringify(zmiana));
      assert.match(dane.blad, new RegExp(slowo, "i"), dane.blad);
    }
  });

  test("bez kilogramów skok jest zerem, bez względu na wpis", async () => {
    const { dane } = await api("/api/cwiczenia-wlasne", "POST",
      { ...PALLOF, nazwa: "Hollow hold na ławce", progresja: "czas", skokKg: 2.5 });
    assert.equal(dane.skokKg, 0);
  });

  test("w planie liczy się jak każde inne: ciężar z 1RM, ↔ na stronę, telefon", async () => {
    await api("/api/plany", "POST", { klient: "Własne Test", wersja: 1 });
    const planId = (await api("/api/plany")).dane.find((p: any) => p.klient === "Własne Test").id;
    const plan = (await api(`/api/plany/${planId}`)).dane.zapisany.plan;
    plan.sloty[1].cwiczenieId = id;
    plan.serieMaksymalne = [{ cwiczenieId: id, ciezar: 30, powtorzenia: 10 }];
    const zapis = await api(`/api/plany/${planId}`, "PUT", { plan, dataStartu: null, status: "wysłany" });
    assert.equal(zapis.kod, 200, JSON.stringify(zapis.dane));
    const slot = zapis.dane.wynik.tygodnie[0].sloty[1];
    assert.equal(slot.cwiczenie.nazwa, "Pallof press z pauzą");
    assert.equal(typeof slot.ciezar, "number", String(slot.ciezar));

    const token = (await api(`/api/plany/${planId}/link`, "POST")).dane.token;
    const c = (await api(`/api/klient/${token}`)).dane.tygodnie[0].dni[0].cwiczenia
      .find((x: any) => x.positionId === "D1-S02");
    assert.deepEqual([c.nazwa, c.jednostronne, typeof c.ciezar], ["Pallof press z pauzą", true, "number"]);
    assert.equal(c.karta?.wideo?.youtubeId, "AH_QZLm_0-s", "film z linku gra w aplikacji");
  });

  test("poprawka zmienia ćwiczenie we wszystkich planach", async () => {
    const { kod, dane } = await api(`/api/cwiczenia-wlasne/${id}`, "PUT",
      { ...PALLOF, nazwa: "Pallof press z pauzą 3 s", coeff: 0.25 });
    assert.equal(kod, 200, JSON.stringify(dane));
    assert.deepEqual([dane.id, dane.nazwa, dane.coeff], [id, "Pallof press z pauzą 3 s", 0.25]);
    const planId = (await api("/api/plany")).dane.find((p: any) => p.klient === "Własne Test").id;
    const slot = (await api(`/api/plany/${planId}`)).dane.wynik.tygodnie[0].sloty[1];
    assert.deepEqual([slot.cwiczenie.nazwa, slot.cwiczenie.coeff], ["Pallof press z pauzą 3 s", 0.25]);
    assert.equal((await api("/api/cwiczenia-wlasne/WL-9999", "PUT", PALLOF)).kod, 404);
  });

  test("po restarcie serwera ćwiczenie jest dalej w katalogu i w planie", async () => {
    await zatrzymaj();
    await uruchom();
    const planId = (await api("/api/plany")).dane.find((p: any) => p.klient === "Własne Test").id;
    const slot = (await api(`/api/plany/${planId}`)).dane.wynik.tygodnie[0].sloty[1];
    assert.equal(slot.cwiczenie?.nazwa, "Pallof press z pauzą 3 s");
    assert.equal(typeof slot.ciezar, "number");
  });
});
