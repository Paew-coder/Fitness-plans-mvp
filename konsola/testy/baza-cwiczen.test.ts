/**
 * Baza ćwiczeń — poprawki trenera do ćwiczeń z BAZY i bibliotek (27.10.2026).
 *
 * Trener: „zrób tak, żebym miał dostęp do całej bazy ćwiczeń tak po prostu
 * … i żebym mógł edytować każde ćwiczenie z bazy”.
 *
 * Najważniejsze: poprawka liczy się w planie i na telefonie od razu, zapisuje
 * tylko to, co inne niż w plikach, da się ją cofnąć i przeżywa restart.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { katalog } from "../../silnik/src/katalog.ts";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4207;
const ADRES = `http://127.0.0.1:${PORT}`;

let katalogDanych = "";
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
    env: { ...process.env, PORT: String(PORT), BAZA_CRAFTMYPLAN: join(katalogDanych, "test.db") },
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
  katalogDanych = mkdtempSync(join(tmpdir(), "craftmyplan-baza-"));
  await uruchom();
});
after(async () => {
  await zatrzymaj();
  rmSync(katalogDanych, { recursive: true, force: true });
});

/** Ćwiczenie z listy konsoli w postaci pól okienka. */
const pola = (c: any) => ({
  nazwa: c.nazwa, kategoria: c.kategoria, part: c.part, coeff: c.coeff, progresja: c.progresja,
  skokKg: c.skokKg, jednostronne: c.jednostronne === true, film: c.film ?? "",
});
const zListy = async (id: string) => (await api("/api/cwiczenia")).dane.find((c: any) => c.id === id);

describe("baza ćwiczeń — poprawki trenera", () => {
  const ID = "EX-0010";   // Barbell back squat, BAZA trenera
  let planId = "";

  test("poprawka ćwiczenia z BAZY: nazwa i coeff zmienione, na liście z oryginałem", async () => {
    const przed = await zListy(ID);
    assert.equal(przed.nazwa, "Barbell back squat");
    const { kod, dane } = await api(`/api/cwiczenia/${ID}`, "PUT", { ...pola(przed), nazwa: "Przysiad ze sztangą (high bar)", coeff: 0.75 });
    assert.equal(kod, 200, JSON.stringify(dane));
    assert.deepEqual([dane.nazwa, dane.coeff, dane.poprawione], ["Przysiad ze sztangą (high bar)", 0.75, true]);
    assert.deepEqual([dane.oryginal.nazwa, dane.oryginal.coeff], ["Barbell back squat", 1]);
    const po = await zListy(ID);
    assert.deepEqual([po.nazwa, po.coeff, po.poprawione], ["Przysiad ze sztangą (high bar)", 0.75, true], "wspólna lista odświeżona");
  });

  test("w planie i na telefonie liczy się poprawione; ile planów zmienia poprawka", async () => {
    await api("/api/plany", "POST", { klient: "Baza Test", wersja: 1 });
    planId = (await api("/api/plany")).dane.find((p: any) => p.klient === "Baza Test").id;
    const plan = (await api(`/api/plany/${planId}`)).dane.zapisany.plan;
    plan.sloty[0].cwiczenieId = ID;
    plan.serieMaksymalne = [{ cwiczenieId: ID, ciezar: 100, powtorzenia: 5 }];
    const zapis = await api(`/api/plany/${planId}`, "PUT", { plan, dataStartu: null, status: "wysłany" });
    assert.equal(zapis.kod, 200, JSON.stringify(zapis.dane));
    const slot = zapis.dane.wynik.tygodnie[0].sloty[0];
    assert.deepEqual([slot.cwiczenie.nazwa, slot.cwiczenie.coeff], ["Przysiad ze sztangą (high bar)", 0.75]);
    const token = (await api(`/api/plany/${planId}/link`, "POST")).dane.token;
    const c = (await api(`/api/klient/${token}`)).dane.tygodnie[0].dni[0].cwiczenia.find((x: any) => x.positionId === "D1-S01");
    assert.equal(c.nazwa, "Przysiad ze sztangą (high bar)");
    assert.deepEqual((await api(`/api/cwiczenia/${ID}/uzycie`)).dane, { planow: 1, wyslanych: 1, klientow: 1 });
    assert.deepEqual((await api("/api/cwiczenia/EX-0011/uzycie")).dane, { planow: 0, wyslanych: 0, klientow: 0 });
  });

  test("zapisuje się tylko to, co inne niż w plikach; zapis bez różnic zdejmuje poprawkę", async () => {
    const ID2 = "EX-0011";
    const c = await zListy(ID2);
    const bezZmian = await api(`/api/cwiczenia/${ID2}`, "PUT", pola(c));
    assert.equal(bezZmian.kod, 200);
    assert.equal(bezZmian.dane.poprawione, undefined, "te same pola — bez poprawki");
    const zmiana = await api(`/api/cwiczenia/${ID2}`, "PUT", { ...pola(c), film: "https://youtu.be/AH_QZLm_0-s" });
    assert.equal(zmiana.dane.film, "https://youtu.be/AH_QZLm_0-s");
    const powrot = await api(`/api/cwiczenia/${ID2}`, "PUT", pola(c));
    assert.equal(powrot.dane.poprawione, undefined, "z powrotem jak w plikach — poprawka znika");
  });

  test("ćwiczenie z biblioteki: poprawka i „sprawdzone” zdejmuje dopisek „DO WERYFIKACJI”", async () => {
    const zBiblioteki = katalog.wszystkie.find((c) => c.biblioteka && c.uwagi?.startsWith("DO WERYFIKACJI"))!;
    const c = await zListy(zBiblioteki.id);
    const { kod, dane } = await api(`/api/cwiczenia/${c.id}`, "PUT", { ...pola(c), kategoria: c.kategoria, zweryfikowane: true });
    assert.equal(kod, 200, JSON.stringify(dane));
    assert.ok(!dane.uwagi?.startsWith("DO WERYFIKACJI"), dane.uwagi);
    assert.equal(dane.poprawione, true);
    assert.ok(dane.oryginal.uwagi.startsWith("DO WERYFIKACJI"), "oryginał z dopiskiem zostaje do wglądu");
  });

  test("odmowy: nazwa innego ćwiczenia, zły coeff; własne ćwiczenie tą drogą — nie", async () => {
    const c = await zListy("EX-0011");
    const zajeta = await api("/api/cwiczenia/EX-0011", "PUT", { ...pola(c), nazwa: "Przysiad ze sztangą (high bar)" });
    assert.equal(zajeta.kod, 400);
    assert.match(zajeta.dane.blad, /już jest w bazie/);
    assert.equal((await api("/api/cwiczenia/EX-0011", "PUT", { ...pola(c), coeff: 0.6 })).kod, 400);
    const wlasne = await api("/api/cwiczenia-wlasne", "POST",
      { nazwa: "Własne do bazy test", kategoria: "Core", part: "c", coeff: 0.5, progresja: "czas" });
    assert.equal((await api(`/api/cwiczenia/${wlasne.dane.id}`, "PUT", { ...pola(wlasne.dane), coeff: 0.25 })).kod, 404);
    assert.equal((await api("/api/cwiczenia/EX-99999", "PUT", pola(c))).kod, 404);
  });

  test("po restarcie serwera poprawka dalej jest — w katalogu i w planie", async () => {
    await zatrzymaj();
    await uruchom();
    assert.equal((await zListy(ID)).nazwa, "Przysiad ze sztangą (high bar)");
    const slot = (await api(`/api/plany/${planId}`)).dane.wynik.tygodnie[0].sloty[0];
    assert.equal(slot.cwiczenie.coeff, 0.75);
  });

  test("„Przywróć oryginał” — ćwiczenie znów jak w plikach, także w planie", async () => {
    const { kod, dane } = await api(`/api/cwiczenia/${ID}/poprawka`, "DELETE");
    assert.equal(kod, 200);
    assert.deepEqual([dane.nazwa, dane.coeff, dane.poprawione], ["Barbell back squat", 1, undefined]);
    const slot = (await api(`/api/plany/${planId}`)).dane.wynik.tygodnie[0].sloty[0];
    assert.deepEqual([slot.cwiczenie.nazwa, slot.cwiczenie.coeff], ["Barbell back squat", 1]);
    assert.equal((await zListy(ID)).poprawione, undefined);
  });
});

describe("katalog silnika z poprawkami", () => {
  test("poprawka nakłada się na plik; „jednostronne: false” i pusty film zdejmują wartość; generator widzi poprawioną kategorię", async () => {
    const { Katalog } = await import("../../silnik/src/katalog.ts");
    const k = new Katalog();
    const jednostronne = k.wszystkie.find((c) => c.jednostronne && !c.biblioteka)!;
    k.ustawPoprawki({
      [jednostronne.id]: { jednostronne: false, film: "" },
      "EX-0010": { kategoria: "Core" },
      "NIE-MA": { nazwa: "x" },
    });
    assert.equal(k.poId(jednostronne.id)!.jednostronne, undefined);
    assert.equal(k.poId(jednostronne.id)!.film, undefined);
    assert.equal(k.oryginal(jednostronne.id)!.jednostronne, true, "oryginał bez zmian");
    assert.ok(k.bazaTrenera.find((c) => c.id === "EX-0010")!.kategoria === "Core");
    assert.ok(k.wKategorii("Core").some((c) => c.id === "EX-0010"));
    k.ustawPoprawki({});
    assert.equal(k.poId("EX-0010")!.kategoria, "Lower push");
  });
});
