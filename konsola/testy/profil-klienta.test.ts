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
  assert.deepEqual(t.zmiany1RM, []);
});
