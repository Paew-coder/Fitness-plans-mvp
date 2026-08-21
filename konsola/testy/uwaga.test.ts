/**
 * Panel „Wymaga uwagi" — pierwszy ekran, na który trener patrzy rano.
 *
 * To jest odpowiedź na pytanie, którego arkusz nie umiał zadać: przy kilkunastu
 * klientach trzeba było otwierać kilkanaście plików, żeby zauważyć, że ktoś
 * zniknął. Cała jego wartość polega na tym, że **milczy, gdy nie ma o czym
 * mówić** — panel, który woła o wszystkich, jest tym samym co panel wyłączony.
 *
 * Testy stawiają serwer i cofają daty w bazie, bo inaczej sprawdzenie „ktoś nie
 * ćwiczy od jedenastu dni" trwałoby jedenaście dni.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4195;
const ADRES = `http://127.0.0.1:${PORT}`;

let katalog = "";
let plikBazy = "";
let serwer: ChildProcess | null = null;

async function api(sciezka: string, metoda = "GET", cialo?: unknown) {
  const odp = await fetch(`${ADRES}${sciezka}`, {
    method: metoda,
    headers: cialo ? { "content-type": "application/json" } : {},
    body: cialo ? JSON.stringify(cialo) : undefined,
  });
  return await odp.json() as any;
}

const dniTemu = (ile: number) =>
  new Date(Date.now() - ile * 86_400_000).toISOString();

/** Zapis wprost do bazy — jedyny sposób, żeby udawać upływ czasu. */
function wBazie(sql: string, ...parametry: unknown[]): void {
  const d = new DatabaseSync(plikBazy);
  d.exec("PRAGMA foreign_keys = ON");
  d.prepare(sql).run(...parametry as any);
  d.close();
}

/**
 * Klient z planem w zadanym stanie. `dniOdStartu` liczy się wstecz od dziś,
 * więc 40 znaczy „piąty tydzień cyklu".
 */
async function klientZPlanem(nazwa: string, opcje: {
  status?: string;
  dniOdStartu?: number | null;
  link?: boolean;
  wyslanyDniTemu?: number;
  trenowalDniTemu?: number;
} = {}): Promise<string> {
  const { zapisany } = await api("/api/plany", "POST", { klient: nazwa, wersja: 1 });
  const plan = zapisany.plan;
  plan.sloty[0].cwiczenieId = "EX-0010";
  plan.serieMaksymalne = [{ cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 3 }];
  await api(`/api/plany/${zapisany.id}`, "PUT", {
    plan,
    dataStartu: opcje.dniOdStartu == null ? null : dniTemu(opcje.dniOdStartu).slice(0, 10),
    status: opcje.status ?? "wysłany",
  });
  if (opcje.link !== false) await api(`/api/plany/${zapisany.id}/link`, "POST");

  if (opcje.wyslanyDniTemu !== undefined) {
    wBazie("UPDATE plan SET zmieniony = ? WHERE id = ?",
      dniTemu(opcje.wyslanyDniTemu), zapisany.id);
  }
  if (opcje.trenowalDniTemu !== undefined) {
    wBazie(
      `INSERT INTO wykonanie (trener_id, plan_id, position_id, tydzien, data, feedback)
       VALUES (1, ?, 'D1-S01', 1, ?, 'OK')`,
      zapisany.id, dniTemu(opcje.trenowalDniTemu));
  }
  return zapisany.id;
}

const powody = (lista: any[], klient: string): string[] =>
  lista.find((w) => w.klient === klient)?.powody.map((p: any) => p.rodzaj) ?? [];

before(async () => {
  katalog = mkdtempSync(join(tmpdir(), "craftmyplan-uwaga-"));
  plikBazy = join(katalog, "test.db");
  serwer = spawn("node", ["--no-warnings", "serwer.ts"], {
    cwd: KONSOLA,
    env: { ...process.env, PORT: String(PORT), BAZA_CRAFTMYPLAN: plikBazy,
      KOPIE_CRAFTMYPLAN: join(katalog, "kopie") },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${ADRES}/api/cwiczenia`)).ok) break; } catch { /* czekamy */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(() => {
  serwer?.kill();
  rmSync(katalog, { recursive: true, force: true });
});

describe("kto trafia do panelu", () => {
  test("klient bez linku — plan wysłany, a nie ma go jak otworzyć", async () => {
    await klientZPlanem("Bez Linku", { link: false, dniOdStartu: 3 });
    assert.deepEqual(powody(await api("/api/uwaga"), "Bez Linku"), ["bez linku"]);
  });

  test("dostał plan i nie zaczął — dopiero po trzech dniach", async () => {
    await klientZPlanem("Nie Zaczal", { dniOdStartu: 1, wyslanyDniTemu: 5 });
    assert.deepEqual(powody(await api("/api/uwaga"), "Nie Zaczal"), ["nie zaczal"]);
  });

  test("dwa dni po wysyłce to jeszcze nie powód do niepokoju", async () => {
    await klientZPlanem("Swiezy Plan", { dniOdStartu: 1, wyslanyDniTemu: 2 });
    assert.deepEqual(powody(await api("/api/uwaga"), "Swiezy Plan"), []);
  });

  test("stanął — trenował, potem zniknął na jedenaście dni", async () => {
    await klientZPlanem("Stanal", { dniOdStartu: 20, trenowalDniTemu: 11 });
    assert.deepEqual(powody(await api("/api/uwaga"), "Stanal"), ["stanal"]);
  });

  test("kto trenował wczoraj, nie woła o uwagę", async () => {
    await klientZPlanem("Cwiczy", { dniOdStartu: 20, trenowalDniTemu: 1 });
    assert.deepEqual(powody(await api("/api/uwaga"), "Cwiczy"), []);
  });

  test("kończy się cykl — ostatni tydzień, czas na następny plan", async () => {
    await klientZPlanem("Koniec Cyklu", { dniOdStartu: 38, trenowalDniTemu: 1 });
    assert.deepEqual(powody(await api("/api/uwaga"), "Koniec Cyklu"), ["koniec cyklu"]);
  });

  test("po cyklu — sześć tygodni minęło, a nowego planu nie ma", async () => {
    await klientZPlanem("Po Cyklu", { dniOdStartu: 50, trenowalDniTemu: 1 });
    assert.deepEqual(powody(await api("/api/uwaga"), "Po Cyklu"), ["po cyklu"]);
  });

  test("szkic nie woła o uwagę — to jeszcze nie zobowiązanie", async () => {
    await klientZPlanem("Szkic", { status: "szkic", dniOdStartu: 50 });
    assert.deepEqual(powody(await api("/api/uwaga"), "Szkic"), []);
  });

  test("zamknięty cykl też milczy", async () => {
    await klientZPlanem("Zakonczony", { status: "zakończony", dniOdStartu: 50 });
    assert.deepEqual(powody(await api("/api/uwaga"), "Zakonczony"), []);
  });
});

describe("kolejność i łączenie powodów", () => {
  test("jeden klient może mieć dwa powody naraz", async () => {
    await klientZPlanem("Stanal I Koniec", { dniOdStartu: 40, trenowalDniTemu: 15 });
    assert.deepEqual(powody(await api("/api/uwaga"), "Stanal I Koniec"),
      ["stanal", "koniec cyklu"]);
  });

  test("kto zniknął, stoi wyżej niż komu kończy się cykl", async () => {
    const lista = await api("/api/uwaga");
    const pozycja = (k: string) => lista.findIndex((w: any) => w.klient === k);
    assert.ok(pozycja("Stanal") < pozycja("Koniec Cyklu"),
      lista.map((w: any) => w.klient).join(" · "));
  });

  test("panel milczy o wszystkich, o których nie ma co mówić", async () => {
    const lista = await api("/api/uwaga");
    const cisi = ["Swiezy Plan", "Cwiczy", "Szkic", "Zakonczony"];
    assert.deepEqual(lista.filter((w: any) => cisi.includes(w.klient)), []);
  });
});
