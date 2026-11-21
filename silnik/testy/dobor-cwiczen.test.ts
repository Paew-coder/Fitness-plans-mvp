/**
 * Dobór ćwiczeń jednym kliknięciem (trener, 02.10.2026) — reguła z Base44:
 * A = coeff 1,0 (najpierw klasyczne boje), B = 0,75, C–E = 0,5 i mniej;
 * nigdy dwa razy w dniu, akcesoria bez powtórek w planie, bój na A może
 * wrócić w innym dniu; bez „DO WERYFIKACJI”; puste albo od nowa.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { SZABLONY_BASE44 } from "../src/dane/szablony.ts";
import { zastosujSzablon } from "../src/szablony-planow.ts";
import { dobierzCwiczenia, kandydaci, KLASYCZNE_BOJE } from "../src/dobor-cwiczen.ts";
import { katalog } from "../src/katalog.ts";
import type { Plan } from "../src/plan.ts";

const LP = ["A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2.", "E1.", "E2.", "", "", ""];
function pustyPlan(): Plan {
  const sloty = [];
  for (let dzien = 1; dzien <= 5; dzien++) {
    for (let poz = 1; poz <= 12; poz++) {
      sloty.push({ positionId: `D${dzien}-S${String(poz).padStart(2, "0")}`, dzien,
        lp: LP[poz - 1]!, cwiczenieId: null, kategoriaSzkieletu: null, tygodnie: {} });
    }
  }
  return { nazwa: "x", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [], sloty, topSety: [] };
}
/** Powtarzalny „los” — mulberry32. */
function ziarno(n: number) {
  return () => {
    n |= 0; n = (n + 0x6D2B79F5) | 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const cw = (id: string | null) => (id ? katalog.poId(id)! : null);
const litera = (lp: string) => lp.trim().charAt(0);

describe("dobór ćwiczeń", () => {
  test("każdy szablon: wszystkie pozycje z kategorią wypełnione, z tej kategorii, nigdy 2× w dniu", () => {
    for (const sz of SZABLONY_BASE44) {
      for (let z = 1; z <= 20; z++) {
        const { plan, bezKandydata } = dobierzCwiczenia(zastosujSzablon(pustyPlan(), sz), { los: ziarno(z) });
        const zKategoria = plan.sloty.filter((s) => s.kategoriaSzkieletu);
        assert.equal(bezKandydata.length, 0, `${sz.id}: zostały puste ${bezKandydata}`);
        for (const s of zKategoria) {
          assert.equal(cw(s.cwiczenieId)?.kategoria, s.kategoriaSzkieletu, `${sz.id} ${s.positionId}`);
          assert.ok(!cw(s.cwiczenieId)!.uwagi?.startsWith("DO WERYFIKACJI"), `${sz.id}: ${cw(s.cwiczenieId)!.nazwa}`);
        }
        for (const dzien of new Set(zKategoria.map((s) => s.dzien))) {
          const ids = zKategoria.filter((s) => s.dzien === dzien).map((s) => s.cwiczenieId);
          assert.equal(new Set(ids).size, ids.length, `${sz.id} dzień ${dzien}: powtórka w dniu`);
        }
      }
    }
  });

  test("reguła pozycji: A — 1,0 (klasyczne boje), B — 0,75, C–E — 0,5 i mniej, gdy kategoria ma takie", () => {
    for (const sz of SZABLONY_BASE44) {
      const { plan } = dobierzCwiczenia(zastosujSzablon(pustyPlan(), sz), { los: ziarno(7) });
      for (const s of plan.sloty.filter((x) => x.kategoriaSzkieletu)) {
        const c = cw(s.cwiczenieId)!;
        const zKategorii = katalog.wKategorii(s.kategoriaSzkieletu)
          .filter((x) => !x.uwagi?.startsWith("DO WERYFIKACJI"));
        const l = litera(s.lp);
        // A2 w tej samej kategorii co A1 (hipertrofia) nie powtórzy boju z tego
        // dnia — wtedy inny 1,0, niekoniecznie klasyczny.
        const klasyczneWolne = zKategorii.some((x) => KLASYCZNE_BOJE.includes(x.nazwa)
          && !plan.sloty.some((y) => y.dzien === s.dzien && y !== s && y.cwiczenieId === x.id
            && plan.sloty.indexOf(y) < plan.sloty.indexOf(s)));
        if (l === "A" && klasyczneWolne) {
          assert.ok(KLASYCZNE_BOJE.includes(c.nazwa), `${sz.id} ${s.lp} ${c.nazwa}`);
        } else if (l === "A" && zKategorii.some((x) => x.coeff === 1)) {
          assert.equal(c.coeff, 1, `${sz.id} ${s.lp} ${c.nazwa}`);
        } else if (l === "B" && zKategorii.some((x) => x.coeff === 0.75)) {
          assert.equal(c.coeff, 0.75, `${sz.id} ${s.lp} ${c.nazwa}`);
        } else if ("CDE".includes(l) && l && zKategorii.filter((x) => x.coeff <= 0.5).length >= 3) {
          assert.ok(c.coeff <= 0.5, `${sz.id} ${s.lp} ${c.nazwa} (${c.coeff})`);
        }
      }
    }
  });

  test("akcesoria nie powtarzają się w planie, gdy kategoria ma z czego wybrać", () => {
    const { plan } = dobierzCwiczenia(zastosujSzablon(pustyPlan(), SZABLONY_BASE44.find((s) => s.id === "fbw_4dni_6cwiczen_6w")!),
      { los: ziarno(3) });
    const akcesoria = plan.sloty.filter((s) => s.kategoriaSzkieletu && litera(s.lp) !== "A");
    for (const kat of new Set(akcesoria.map((s) => s.kategoriaSzkieletu))) {
      const ids = akcesoria.filter((s) => s.kategoriaSzkieletu === kat).map((s) => s.cwiczenieId);
      if (ids.length <= 4) assert.equal(new Set(ids).size, ids.length, `${kat}: ${ids}`);
    }
  });

  test("bez kategorii nic się nie wstawia; wybrane ćwiczenia zostają; „od nowa” omija pozycje z historią", () => {
    const p = zastosujSzablon(pustyPlan(), SZABLONY_BASE44.find((s) => s.id === "fbw_3dni_6w")!);
    p.sloty[0]!.cwiczenieId = "EX-0053";   // Deadlift wybrany przez trenera
    const wynik = dobierzCwiczenia(p, { los: ziarno(1) });
    assert.equal(wynik.plan.sloty[0]!.cwiczenieId, "EX-0053", "wybór trenera zostaje");
    assert.ok(wynik.plan.sloty.filter((s) => !s.kategoriaSzkieletu).every((s) => !s.cwiczenieId));
    assert.ok(!wynik.dobrane.includes(p.sloty[0]!.positionId));
    assert.equal(p.sloty[1]!.cwiczenieId, null, "plan wejściowy nietknięty");

    const odNowa = dobierzCwiczenia(wynik.plan, {
      odNowa: true, zablokowane: new Set([p.sloty[0]!.positionId]), los: ziarno(99) });
    assert.equal(odNowa.plan.sloty[0]!.cwiczenieId, "EX-0053", "pozycja z historią nietknięta");
    assert.ok(odNowa.dobrane.length > 0);
    assert.ok(odNowa.plan.sloty.some((s, i) => s.cwiczenieId !== wynik.plan.sloty[i]!.cwiczenieId),
      "od nowa losuje inaczej");
  });

  test("kategoria bez ćwiczenia o docelowym coeff bierze najbliższy (przy remisie cięższy)", () => {
    // Upper pull horizontal nie ma żadnego 1,0 — A dostaje 0,75.
    const upH = katalog.wKategorii("Upper pull horizontal");
    assert.ok(kandydaci(upH, "A1.").every((c) => c.coeff === 0.75));
    // Bicep ma same 0,25 — B dostaje 0,25.
    assert.ok(kandydaci(katalog.wKategorii("Bicep"), "B1.").every((c) => c.coeff === 0.25));
  });
});
