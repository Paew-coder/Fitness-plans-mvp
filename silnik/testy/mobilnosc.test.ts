/**
 * Mobilność stawów — kategorie i przypisane ćwiczenia (27.10.2026).
 *
 * Trener: „dodaj nowe kategorie dla ćwiczeń mobility — każdy staw żeby miał
 * swoją kategorię i do niej przypasowane ćwiczenia (Spine, Shoulder, Elbow,
 * Wrist, Hip, Knee, Ankle mobility). Jeżeli ćwiczenie spełnia warunki dla obu
 * kategorii, może pokazywać się w obu — Front foot elevated split squat to
 * Lower push i Ankle mobility, Dumbbell flys — Upper push horizontal
 * i Shoulder mobility”. Przypisania: `narzedzia/mobilnosc.py`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Katalog, katalog } from "../src/katalog.ts";
import { KATEGORIE, KATEGORIE_MOBILNOSCI, KATEGORIE_SILOWE, wKategorii } from "../src/typy.ts";
import { przeliczPlan, type Plan } from "../src/plan.ts";
import { sprawdzPlan } from "../src/walidacja.ts";

const ID = { ffeSplitSquat: "EX-0088", dumbbellFly: "EX-0064", hipSwitch: "EX-0956", jefferson: "EX-0114" };

test("siedem kategorii mobilności obok dziewięciu z BAZY", () => {
  assert.deepEqual([...KATEGORIE_MOBILNOSCI], ["Spine mobility", "Shoulder mobility", "Elbow mobility",
    "Wrist mobility", "Hip mobility", "Knee mobility", "Ankle mobility"]);
  assert.equal(KATEGORIE.length, 16);
});

test("przykłady trenera: FFE split squat w Lower push i Ankle mobility, Dumbbell fly w Upper push horizontal i Shoulder mobility", () => {
  const nazwy = (k: (typeof KATEGORIE)[number]) => katalog.wKategorii(k).map((c) => c.id);
  assert.ok(nazwy("Lower push").includes(ID.ffeSplitSquat) && nazwy("Ankle mobility").includes(ID.ffeSplitSquat));
  assert.ok(nazwy("Upper push horizontal").includes(ID.dumbbellFly) && nazwy("Shoulder mobility").includes(ID.dumbbellFly));
  assert.equal(katalog.poId(ID.ffeSplitSquat)!.kategoria, "Lower push", "kategoria główna z arkusza zostaje");
});

test("każda kategoria mobilności ma ćwiczenia; mobilizacje mają ją jako główną", () => {
  for (const k of KATEGORIE_MOBILNOSCI) assert.ok(katalog.wKategorii(k).length > 0, k);
  const hipSwitch = katalog.poId(ID.hipSwitch)!;
  assert.equal(hipSwitch.nazwa, "90/90 Hip Switch");
  assert.equal(hipSwitch.kategoria, "Hip mobility");
  assert.ok(!katalog.wKategorii("Lower pull").some((c) => c.id === ID.hipSwitch), "mobilizacja nie wisi już w Lower pull");
  assert.ok(katalog.wKategorii("Spine mobility").some((c) => c.id === ID.jefferson));
});

test("dane spójne: kategorie ze znanej listy, dodatkowe bez głównej i bez powtórek; BAZA trenera z kategoriami z arkusza", () => {
  for (const c of katalog.wszystkie) {
    assert.ok(KATEGORIE.includes(c.kategoria), `${c.id} ${c.kategoria}`);
    const dodatkowe = c.kategorieDodatkowe ?? [];
    assert.ok(dodatkowe.every((k) => KATEGORIE.includes(k) && k !== c.kategoria), c.id);
    assert.equal(new Set(dodatkowe).size, dodatkowe.length, c.id);
  }
  for (const c of katalog.bazaTrenera) {
    assert.ok((KATEGORIE_SILOWE as readonly string[]).includes(c.kategoria), `${c.id}: kategoria z arkusza 5.17`);
  }
});

test("kontrola szkieletu liczy kategorię dodatkową; poprawka „także w” bez dodatkowych zdejmuje je", () => {
  const plan: Plan = {
    nazwa: "mobilność", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość", serieMaksymalne: [],
    sloty: [
      { positionId: "D1-S01", dzien: 1, lp: "A1.", cwiczenieId: ID.ffeSplitSquat, kategoriaSzkieletu: "Ankle mobility" },
      { positionId: "D1-S02", dzien: 1, lp: "B1.", cwiczenieId: ID.ffeSplitSquat, kategoriaSzkieletu: "Hip mobility" },
    ],
  } as Plan;
  const niezgodne = sprawdzPlan(plan, przeliczPlan(plan)).find((u) => u.kod === "NIEZGODNY_ZE_SZKIELETEM");
  assert.deepEqual(niezgodne?.pozycje, ["D1-S02"]);

  const k = new Katalog();
  k.ustawPoprawki({ [ID.dumbbellFly]: { kategorieDodatkowe: [] }, "EX-0010": { kategorieDodatkowe: ["Hip mobility"] } });
  assert.equal(k.poId(ID.dumbbellFly)!.kategorieDodatkowe, undefined);
  assert.ok(!k.wKategorii("Shoulder mobility").some((c) => c.id === ID.dumbbellFly));
  assert.ok(wKategorii(k.poId("EX-0010")!, "Hip mobility"));
});
