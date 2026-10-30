/**
 * Plyometria — kategoria i przypisane ćwiczenia (30.10.2026).
 *
 * Trener: „dodajmy jeszcze kolejną kategorię ćwiczeń i pasujące do niej
 * ćwiczenia — Plyometria, gdzie będą wszystkie ćwiczenia plyometryczne typu
 * np. skoki”. Zawsze jako kategoria dodatkowa: główna zostaje (z niej arkusz
 * i szkielet asystenta). Przypisania: `narzedzia/mobilnosc.py`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { katalog } from "../src/katalog.ts";
import { KATEGORIA_PLYOMETRII, KATEGORIE, KATEGORIE_SILOWE, wKategorii } from "../src/typy.ts";
import { przeliczPlan, type Plan } from "../src/plan.ts";
import { sprawdzPlan } from "../src/walidacja.ts";

const ID = {
  boxJump: "EX-0036", medBallSlam: "EX-0146", depthJump: "EX-1506", forwardHopToBoxJump: "EX-1593",
  burpee: "EX-1340", jumpingJacks: "EX-1847", snatchNoJump: "EX-3559", skaterSquat: "EX-2567", backSquat: "EX-0010",
};
const wPlyometrii = (id: string) => wKategorii(katalog.poId(id)!, KATEGORIA_PLYOMETRII);

test("Plyometria na liście kategorii — po siłowych, przed mobilnością", () => {
  assert.equal(KATEGORIE[KATEGORIE_SILOWE.length], "Plyometria");
});

test("skoki i rzuty piłką z BAZY trenera: główna z arkusza zostaje, Plyometria dochodzi", () => {
  const box = katalog.poId(ID.boxJump)!;
  assert.equal(box.nazwa, "Box jump");
  assert.equal(box.kategoria, "Lower push");
  assert.deepEqual(box.kategorieDodatkowe, ["Plyometria"]);
  assert.ok(katalog.wKategorii("Lower push").some((c) => c.id === ID.boxJump), "dalej w Lower push");
  assert.ok(katalog.wKategorii("Plyometria").some((c) => c.id === ID.boxJump));
  assert.equal(katalog.poId(ID.medBallSlam)!.kategoria, "Upper push horizontal");
  assert.ok(wPlyometrii(ID.medBallSlam));
});

test("biblioteki: wszystko oznaczone jako plyometria i kompleksy ze skokiem; kondycja, dwubój i przysiady — nie", () => {
  const oznaczone = katalog.wszystkie.filter((c) => c.rodzaj === "plyometria" && !c.ukryte);
  assert.ok(oznaczone.length > 200, `${oznaczone.length}`);
  assert.ok(oznaczone.every((c) => wKategorii(c, "Plyometria")), "każde ćwiczenie z rodzajem „plyometria”");
  assert.ok(wPlyometrii(ID.depthJump) && wPlyometrii(ID.forwardHopToBoxJump));
  for (const id of [ID.burpee, ID.jumpingJacks, ID.snatchNoJump, ID.skaterSquat, ID.backSquat]) {
    assert.ok(!wPlyometrii(id), `${katalog.poId(id)!.nazwa} nie jest plyometrią`);
  }
  assert.ok(katalog.wszystkie.every((c) => c.kategoria !== "Plyometria"), "Plyometria tylko jako dodatkowa");
});

test("slot szkieletu „Plyometria”: Box jump pasuje, przysiad nie", () => {
  const plan: Plan = {
    nazwa: "plyo", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość", serieMaksymalne: [],
    sloty: [
      { positionId: "D1-S01", dzien: 1, lp: "A1.", cwiczenieId: ID.boxJump, kategoriaSzkieletu: "Plyometria" },
      { positionId: "D1-S02", dzien: 1, lp: "B1.", cwiczenieId: ID.backSquat, kategoriaSzkieletu: "Plyometria" },
    ],
  } as Plan;
  const niezgodne = sprawdzPlan(plan, przeliczPlan(plan)).find((u) => u.kod === "NIEZGODNY_ZE_SZKIELETEM");
  assert.deepEqual(niezgodne?.pozycje, ["D1-S02"]);
});
