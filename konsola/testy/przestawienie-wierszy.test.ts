/**
 * ▲▼ przenosi ćwiczenie razem z jego ustawieniami (30.10.2026).
 *
 * `/przenies` zamienia TREŚĆ dwóch slotów — position_id i Lp. zostają przy
 * miejscu w planie. Trasa powstała 16.08.2026, zanim przy wierszu pojawiły
 * się „R” (20.09), „G” (26.09), „S” (27.09), „±” i „↗” (19.10), i nikt ich do
 * niej nie dopisał. Zostawały więc na starym wierszu: „R” ustawione na B1 po
 * przestawieniu B1 w górę liczyło ciężar ćwiczeniu, które weszło na jego
 * miejsce. Wszystkie te przyciski dotyczą „tego jednego ćwiczenia”, a „G”
 * od 16.10.2026 nie patrzy już na pozycję (`bojGlownySlotu`), więc idą
 * z ćwiczeniem wszystkie — tak samo, jak 🗑 zdejmuje je wszystkie razem
 * z ćwiczeniem (`usunZPozycji` w `public/app.js`).
 *
 * Plan hipertroficzny, bo tam każdy z przycisków zmienia liczby: hip thrust
 * z „G” i „S” idzie progresją siłową boju, wiosłowanie z „R” i „±2” — ciężar
 * z RPE i dwa powtórzenia więcej, rozpiętki z „↗” — RPE 7,5 → 10 ze stanem
 * do przywrócenia. Sprawdzamy pola slotów, liczby z silnika i listę zmian
 * wersji roboczej. Czysta logika listy zmian — `wersja-robocza.test.ts`.
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

/** Pola slotu, które należą do ćwiczenia, a nie do wiersza. */
const USTAWIENIA = ["bojGlowny", "bojSilowy", "trybCiezaru", "przesunieciePowtorzen", "przedRpeRosnacym", "uwaga"] as const;

const HIP_THRUST = "EX-0102";
const WIOSLOWANIE = "EX-0016";
const ROZPIETKI = "EX-0064";

/** „↗” włączone tak, jak robi to konsola (`przelaczRpeRosnace`): RPE 7,5 → 10, powtórzenia z T1, „R”. */
const RPE_ROSNACE = [7.5, 8, 8.5, 9, 9.5, 10];
const zRpeRosnacym = {
  tygodnie: Object.fromEntries(RPE_ROSNACE.map((rpe, i) => [i + 1, { rpe, powtorzenia: 12 }])),
  trybCiezaru: "licz z RPE",
  przedRpeRosnacym: {
    rpe: Object.fromEntries(RPE_ROSNACE.map((_, i) => [i + 1, null])),
    powtorzenia: Object.fromEntries(RPE_ROSNACE.map((_, i) => [i + 1, 12])),
    trybCiezaru: null,
  },
};

describe("▲▼ — ustawienia ćwiczenia idą razem z nim", () => {
  const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
  const KATALOG = mkdtempSync(join(tmpdir(), "przestawienie-test-"));
  let konsola: ChildProcess;
  let adres = "";
  let planId = "";
  let poczatek: any[] = [];
  let liczbyPrzed: Record<string, string[]> = {};

  const zapytaj = async (sciezka: string, metoda = "GET", cialo?: unknown) => {
    const r = await fetch(`${adres}${sciezka}`, {
      method: metoda, headers: { "content-type": "application/json" },
      body: cialo ? JSON.stringify(cialo) : undefined,
    });
    return { kod: r.status, tresc: await r.json() as any };
  };
  const obraz = async () => (await zapytaj(`/api/plany/${planId}`)).tresc;
  const ustawienia = (slot: any) => Object.fromEntries(USTAWIENIA.map((p) => [p, slot[p]]));
  /** Serie × powtórzenia @ RPE i ciężar każdego ćwiczenia w T1–T6 — niezależnie od wiersza. */
  const liczbyCwiczen = (o: any) => Object.fromEntries([HIP_THRUST, WIOSLOWANIE, ROZPIETKI].map((id) => [id,
    o.wynik.tygodnie.slice(0, 6).map((t: any) => {
      const s = t.sloty.find((x: any) => x.cwiczenie?.id === id);
      return `${s.serie}×${s.powtorzenia}@${s.rpe} ${JSON.stringify(s.ciezar)}`;
    })]));

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
    planId = (await zapytaj("/api/plany", "POST", { klient: "Przestawienie Testowe", wersja: 1 })).tresc.zapisany.id;
    const plan = (await zapytaj(`/api/plany/${planId}`)).tresc.zapisany.plan;
    plan.czescPlanu = "hipertrofia";
    plan.serieMaksymalne = [
      { cwiczenieId: HIP_THRUST, ciezar: 140, powtorzenia: 5 },
      { cwiczenieId: WIOSLOWANIE, ciezar: 80, powtorzenia: 8 },
      { cwiczenieId: ROZPIETKI, ciezar: 20, powtorzenia: 10 },
    ];
    Object.assign(plan.sloty[0], { cwiczenieId: HIP_THRUST, bojGlowny: true, bojSilowy: true, uwaga: "Pauza na górze." });
    Object.assign(plan.sloty[1], { cwiczenieId: WIOSLOWANIE, trybCiezaru: "licz z RPE", przesunieciePowtorzen: 2 });
    Object.assign(plan.sloty[2], { cwiczenieId: ROZPIETKI, ...structuredClone(zRpeRosnacym) });
    // Wysłany — każde przestawienie czeka potem na „Zatwierdź” i stoi na liście zmian.
    const zapis = await zapytaj(`/api/plany/${planId}`, "PUT", { plan, dataStartu: null, status: "wysłany" });
    assert.equal(zapis.kod, 200, JSON.stringify(zapis.tresc));
    poczatek = zapis.tresc.zapisany.plan.sloty.slice(0, 3);
    liczbyPrzed = liczbyCwiczen(zapis.tresc);
  });

  after(() => {
    konsola?.kill("SIGKILL");
    rmSync(KATALOG, { recursive: true, force: true });
  });

  test("każdy z przycisków zmienia liczby — inaczej test niczego by nie dowodził", () => {
    assert.ok(poczatek.every((s, i) => s.dzien === poczatek[0].dzien && s.positionId !== poczatek[(i + 1) % 3].positionId));
    const hipThrust = liczbyPrzed[HIP_THRUST]!;
    const wioslowanie = liczbyPrzed[WIOSLOWANIE]!;
    assert.match(hipThrust[0]!, /^6×6@6\.5 /, "„G” + „S”: progresja siłowa boju, nie 3 serie akcesorium");
    assert.match(wioslowanie[0]!, /^3×12@8 /, "„±2”: 10 → 12 powtórzeń");
    assert.notEqual(wioslowanie[1]!.split(" ")[1], wioslowanie[0]!.split(" ")[1], "„R”: ciężar schodzi z rosnącymi powtórzeniami");
    assert.deepEqual(liczbyPrzed[ROZPIETKI]!.map((l) => l.split(" ")[0]),
      RPE_ROSNACE.map((rpe) => `3×12@${rpe}`), "„↗”: RPE 7,5 → 10 przy stałych powtórzeniach");
  });

  test("„▲▼” przenosi „G”, „S”, „R”, „±” i „↗” razem z ćwiczeniem", async () => {
    const [s1, s2, s3] = poczatek.map((s) => s.positionId);
    // ▼ na pierwszym: hip thrust ↔ wiosłowanie.
    assert.equal((await zapytaj(`/api/plany/${planId}/przenies`, "POST", { positionId: s1, kierunek: "dol" })).kod, 200);
    let sloty = (await obraz()).zapisany.plan.sloty;
    assert.deepEqual([sloty[0].cwiczenieId, ustawienia(sloty[0])], [WIOSLOWANIE, ustawienia(poczatek[1])]);
    assert.deepEqual([sloty[1].cwiczenieId, ustawienia(sloty[1])], [HIP_THRUST, ustawienia(poczatek[0])]);
    // ▲ na trzecim: rozpiętki ↔ hip thrust, który przed chwilą zszedł na drugi wiersz.
    assert.equal((await zapytaj(`/api/plany/${planId}/przenies`, "POST", { positionId: s3, kierunek: "gora" })).kod, 200);
    const po = await obraz();
    sloty = po.zapisany.plan.sloty;
    assert.deepEqual(sloty.slice(0, 3).map((s: any) => s.positionId), [s1, s2, s3], "pozycje i Lp. zostają na miejscu");
    assert.deepEqual(sloty.slice(0, 3).map((s: any) => s.lp), poczatek.map((s) => s.lp));
    assert.deepEqual(sloty.slice(0, 3).map((s: any) => [s.cwiczenieId, ustawienia(s)]), [
      [WIOSLOWANIE, ustawienia(poczatek[1])],
      [ROZPIETKI, ustawienia(poczatek[2])],
      [HIP_THRUST, ustawienia(poczatek[0])],
    ]);
    // Liczy się to, co widzi klient: każde ćwiczenie dostaje te same liczby co przed przestawieniem.
    assert.deepEqual(liczbyCwiczen(po), liczbyPrzed);
  });

  test("wersja robocza: same przestawienia — bez „ustawień”, których nikt nie zmieniał", async () => {
    // Lista porównuje wiersz trenera z wierszem klienta, w którym stoi to samo
    // ćwiczenie (`przestaw` w `wersja-robocza.ts`). Ustawienia zostawione na
    // starym miejscu wyszłyby tu jako zmiana „ustawień” przy obu ćwiczeniach.
    const { zmianyDlaKlienta } = await obraz();
    const lp = poczatek.map((s) => s.lp.replace(/\.$/, ""));
    const dzien = poczatek[0].dzien;
    assert.deepEqual(zmianyDlaKlienta?.zmiany, [
      `Dzień ${dzien} ${lp[0]}: Barbell row przestawione (było ${lp[1]})`,
      `Dzień ${dzien} ${lp[1]}: Dumbbell fly przestawione (było ${lp[2]})`,
      `Dzień ${dzien} ${lp[2]}: Hip thrust barbell przestawione (było ${lp[0]})`,
    ]);
  });
});
