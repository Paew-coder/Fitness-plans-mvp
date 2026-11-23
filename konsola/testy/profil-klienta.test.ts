/**
 * Profil klienta — „Teraz” i „Dziennik treningów” (20.11.2026).
 *
 * Trener: „klienci mają swoje panele/profile, gdzie widoczne są ich plany,
 * analiza dotychczasowych planów i treningów, zebrane w przejrzystej
 * i spójnej formie”. Tu: zestawienie z zapisanych planów (`profil-klienta.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Plan } from "../../silnik/src/plan.ts";
import { przeliczPlan } from "../../silnik/src/plan.ts";
import type { ZapisanyPlan } from "../magazyn.ts";
import { dziennikTreningow, roznicaCiezaru, terazKlienta } from "../profil-klienta.ts";

const plan = (): Plan => ({
  nazwa: "Klient Testowy", tytul: "Siła jesień", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
  serieMaksymalne: [{ cwiczenieId: "EX-0016", ciezar: 90, powtorzenia: 1 }],
  sloty: [
    { positionId: "D1-S01", dzien: 1, lp: "B1.", cwiczenieId: "EX-0016", uwaga: "Plecy proste." },
    { positionId: "D2-S01", dzien: 2, lp: "B1.", cwiczenieId: "EX-0975" },
  ],
} as unknown as Plan);

function zapisany(): ZapisanyPlan {
  const p = plan();
  const wiosla = przeliczPlan(p).tygodnie[0]!.sloty[0]!.ciezar as number;
  return {
    id: "kt-1", wersja: 1, klient: "Klient Testowy", klientId: "kt", status: "wysłany", plan: p,
    wykonania: [
      { positionId: "D1-S01", tydzien: 1, data: "2026-11-02T10:00:00.000Z", feedback: "za trudne",
        serie: [{ ciezar: wiosla - 10, powtorzenia: 8 }, { ciezar: wiosla - 10, powtorzenia: 8 }] },
      { positionId: "D2-S01", tydzien: 1, data: "2026-11-04T10:00:00.000Z", feedback: "za łatwe" },
      { positionId: "D1-S01", tydzien: 2, data: "2026-11-09T10:00:00.000Z", feedback: "OK",
        serie: [{ ciezar: wiosla, powtorzenia: 8 }] },
    ],
    ukonczoneDni: [{ dzien: 1, tydzien: 1, data: "2026-11-02T11:00:00.000Z" }],
  } as unknown as ZapisanyPlan;
}

test("różnica ciężaru: ponad 2% od planu — lżej albo ciężej; bez planu albo bez ciężaru — nic", () => {
  assert.equal(roznicaCiezaru([{ ciezar: 95, powtorzenia: 5 }], 100), "lżej");
  assert.equal(roznicaCiezaru([{ ciezar: 99, powtorzenia: 5 }], 100), null);
  assert.equal(roznicaCiezaru([{ ciezar: 105, powtorzenia: 5 }], 100), "ciężej");
  assert.equal(roznicaCiezaru([{ ciezar: null, powtorzenia: 12 }], 100), null);
  assert.equal(roznicaCiezaru([{ ciezar: 50, powtorzenia: 5 }], "— brak 1RM"), null);
});

test("dziennik: trening = tydzień × dzień, od najnowszego; serie, ocena, plan i różnica", () => {
  const d = dziennikTreningow([zapisany()]);
  assert.deepEqual(d.map((t) => [t.tydzien, t.dzien, t.domkniety]), [[2, 1, false], [1, 2, false], [1, 1, true]]);
  assert.equal(d[2]!.data, "2026-11-02T11:00:00.000Z", "data domknięcia, gdy późniejsza niż wpisy");
  assert.equal(d[0]!.nazwaPlanu, "Siła jesień");
  const t1 = d[2]!.cwiczenia[0]!;
  assert.deepEqual([t1.lp, t1.nazwa, t1.feedback, t1.roznica, t1.serie.length], ["B1", "Barbell row", "za trudne", "lżej", 2]);
  assert.ok(t1.plan && t1.plan.serie > 0 && typeof t1.plan.ciezar === "number");
  assert.equal(d[1]!.cwiczenia[0]!.serie.length, 0, "sama ocena — bez serii");
});

test("teraz: oceny razem i przy ćwiczeniach, inny ciężar niż w planie, uwagi, stres bez slotów", () => {
  const t = terazKlienta(zapisany());
  assert.deepEqual(t.oceny, { trudne: 1, ok: 1, latwe: 1 });
  assert.deepEqual(t.ocenyCwiczen.map((c) => c.nazwa).sort(), ["Alt. Drop Lunge - Low Impact", "Barbell row"]);
  assert.deepEqual(t.ciezaryCwiczen, [{ nazwa: "Barbell row", lzej: 1, ciezej: 0, wpisow: 2 }]);
  assert.deepEqual(t.uwagi, [{ dzien: 1, lp: "B1", nazwa: "Barbell row", uwaga: "Plecy proste." }]);
  assert.equal(t.stres.wynik.tygodnie.length, 6);
  assert.ok(!("sloty" in t.stres.wynik.tygodnie[0]!), "do konsoli idzie sam bilans");
});

test("1RM bez RPE: pierwszy trening → najwyższy w cyklu; TOP SET ciężarem wprost, gdy daje więcej", () => {
  const z = zapisany();
  // Bench: T1 100 × 4 (≈109,3), T3 105 × 3 (≈111,1); TOP SET w T2 108 kg × 1 — mniej niż 111,1.
  (z.plan as any).sloty.push({ positionId: "D3-S01", dzien: 3, lp: "A1.", cwiczenieId: "EX-0011",
    tygodnie: { 2: { topSetKlienta: { kg: 108 } } } });
  (z.plan as any).topSety = [{ dzien: 3, wlaczony: true, slotPositionId: "D3-S01" }];
  (z.wykonania as any[]).push(
    { positionId: "D3-S01", tydzien: 1, data: "2026-11-06T10:00:00.000Z", feedback: "za łatwe",
      serie: [{ ciezar: 100, powtorzenia: 4 }, { ciezar: 95, powtorzenia: 4 }] },
    { positionId: "D3-S01", tydzien: 3, data: "2026-11-20T10:00:00.000Z", feedback: "OK",
      serie: [{ ciezar: 105, powtorzenia: 3 }] },
  );
  const bench = () => terazKlienta(z).oneRMCwiczen.find((c) => c.nazwa === "Barbell bench press")!;
  assert.deepEqual(bench().poczatek, { oneRM: 109.3, zrodlo: { rodzaj: "seria", tydzien: 1, ciezar: 100, powtorzenia: 4 } });
  assert.deepEqual(bench().najwyzszy, { oneRM: 111.1, zrodlo: { rodzaj: "seria", tydzien: 3, ciezar: 105, powtorzenia: 3 } });
  // Cięższy TOP SET wygrywa — 1 powtórzenie to ciężar wprost.
  (z.plan as any).sloty.at(-1).tygodnie[2].topSetKlienta.kg = 115;
  assert.deepEqual(bench().najwyzszy, { oneRM: 115, zrodlo: { rodzaj: "top set", tydzien: 2, ciezar: 115, powtorzenia: 1 } });
  // Bez serii z ciężarem (sama ocena) ćwiczenia tu nie ma.
  assert.ok(!terazKlienta(z).oneRMCwiczen.some((c) => c.nazwa === "Alt. Drop Lunge - Low Impact"));
});

test("stres zrobiony: z serii klienta (RPE z planu ± ocena), ocena bez serii — jak w planie; tylko odbyte treningi", async () => {
  const { stresSlotu } = await import("../../silnik/src/stres.ts");
  const { stresZrobiony } = await import("../profil-klienta.ts");
  const z = zapisany();
  const wynik = przeliczPlan(z.plan);
  const slot = (t: number, id: string) => wynik.tygodnie[t - 1]!.sloty.find((s) => s.positionId === id)!;
  const r = stresZrobiony(z, wynik);
  assert.deepEqual(r.tygodnie.map((t) => [t.tydzien, t.treningow]), [[1, 2], [2, 1]]);
  // T1: wiosło 2 serie × 8 przy RPE planu + 1 („za trudne”), wykrok sama ocena — jak w planie.
  const wioslo = slot(1, "D1-S01");
  const zrobioneWioslo = 2 * stresSlotu({ coeff: wioslo.cwiczenie!.coeff, serie: 1, rpe: wioslo.rpe + 1, powtorzenia: 8 }).calkowity;
  const wykrok = slot(1, "D2-S01").stres.calkowity;
  assert.ok(Math.abs(r.tygodnie[0]!.zrobiony - (zrobioneWioslo + wykrok)) < 0.02, JSON.stringify(r.tygodnie[0]));
  assert.ok(Math.abs(r.tygodnie[0]!.plan - (wioslo.stres.calkowity + wykrok)) < 0.02);
  // T2: tylko dzień 1 (jedna seria z planowanych) — mniej niż plan; dzień 2 się nie odbył, więc nie wchodzi.
  assert.ok(Math.abs(r.tygodnie[1]!.plan - slot(2, "D1-S01").stres.calkowity) < 0.02);
  assert.ok(r.tygodnie[1]!.procent! < 100);
  assert.equal(r.cwiczenia[0]!.nazwa, "Barbell row");
});

test("Analiza: ranking stresu ćwiczeń i skoki obciążenia (plan; zrobione tam, gdzie klient trenował)", () => {
  const t = terazKlienta(zapisany());
  assert.deepEqual(t.stresCwiczen.map((c) => c.nazwa).sort(), ["Alt. Drop Lunge - Low Impact", "Barbell row"]);
  assert.equal(t.skoki.length, 6);
  assert.deepEqual(t.skoki.map((s) => s.tydzien), [1, 2, 3, 4, 5, 6]);
  assert.equal(t.skoki[0]!.plan.zmiana, null);
  assert.ok(t.skoki[0]!.zrobiony && t.skoki[1]!.zrobiony && t.skoki[2]!.zrobiony === null);
});
