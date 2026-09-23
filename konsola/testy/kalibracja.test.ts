/**
 * Kalibracja pierwszym treningiem — 1RM z serii roboczej, gdy serii
 * maksymalnej nie było.
 *
 * Najważniejsza własność stoi w drugim teście: **plan zaczyna się dokładnie
 * tam, gdzie klient**. Klient dobrał 60 kg na „8 powt. · RPE 8" — po
 * kalibracji ten sam slot w tym samym tygodniu ma pokazywać 60 kg. Gdyby
 * pokazywał 62,5, aplikacja poprawiałaby klienta w chwili, w której dopiero
 * się dowiedziała, ile on podnosi.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { pustyPlan } from "../uklad-planu.ts";
import { skalibruj } from "../kalibracja.ts";
import { przeliczPlan, type Plan } from "../../silnik/src/plan.ts";
import { oneRMzKalibracji, oneRMzSerii } from "../../silnik/src/odczyt-1rm.ts";

const BOJ = "EX-0010";          // A1. Barbell back squat — coeff 1,0
const AKCESORIUM = "EX-0016";   // B1. Barbell row — coeff 0,75
const MASA_CIALA = "EX-0049";   // B2. Dead bug izo + OH — masa ciała
const TERAZ = "2026-09-23T10:00:00.000Z";

function plan(): Plan {
  const p = pustyPlan("Kalibracja");
  p.sloty[0]!.cwiczenieId = BOJ;
  p.sloty[1]!.cwiczenieId = AKCESORIUM;
  p.sloty[2]!.cwiczenieId = MASA_CIALA;
  return p;
}

const slot = (p: Plan, positionId: string, tydzien = 1) =>
  przeliczPlan(p).tygodnie[tydzien - 1]!.sloty.find((s) => s.positionId === positionId)!;

describe("kalibracja pierwszym treningiem", () => {
  test("seria przy ćwiczeniu bez 1RM staje się jego 1RM", () => {
    const p = plan();
    assert.equal(slot(p, "D1-S02").ciezar, "— brak 1RM", "punkt wyjścia: brak ciężaru");

    const serie = skalibruj(p, {
      positionId: "D1-S02", tydzien: 1, ciezarWykonany: 60, powtorzeniaWykonane: 8,
    }, TERAZ);
    assert.ok(serie, "kalibracja powinna zadziałać");
    const wpis = serie!.find((s) => s.cwiczenieId === AKCESORIUM)!;
    assert.equal(wpis.powtorzenia, 1, "zapis jako 1RM × 1 — ta sama postać co przyjęta propozycja");
    assert.equal(wpis.ciezar, oneRMzKalibracji(60, 8, slot(p, "D1-S02").rpe));
    assert.deepEqual(
      { ...wpis.kalibracja, data: undefined },
      { ciezar: 60, powtorzenia: 8, rpe: slot(p, "D1-S02").rpe, tydzien: 1, dzien: 1,
        positionId: "D1-S02", data: undefined },
    );
  });

  test("plan zaczyna się dokładnie tam, gdzie klient", () => {
    for (const [positionId, ciezar] of [["D1-S01", 85], ["D1-S02", 60], ["D1-S02", 52.5]] as const) {
      const p = plan();
      const { powtorzenia } = slot(p, positionId);
      p.serieMaksymalne = skalibruj(p, {
        positionId, tydzien: 1, ciezarWykonany: ciezar, powtorzeniaWykonane: powtorzenia,
      }, TERAZ)!;
      assert.equal(slot(p, positionId).ciezar, ciezar,
        `${positionId}: klient podniósł ${ciezar} kg, plan ma pokazać to samo`);
    }
  });

  test("po kalibracji liczy się cały cykl, nie tylko ten trening", () => {
    const p = plan();
    p.serieMaksymalne = skalibruj(p, {
      positionId: "D1-S01", tydzien: 1, ciezarWykonany: 85, powtorzeniaWykonane: 6,
    }, TERAZ)!;
    for (let t = 1; t <= 6; t++) {
      assert.equal(typeof slot(p, "D1-S01", t).ciezar, "number", `T${t} bez ciężaru`);
    }
  });

  test("ćwiczenie z prawdziwą serią maksymalną zostaje nietknięte", () => {
    const p = plan();
    p.serieMaksymalne = [{ cwiczenieId: AKCESORIUM, ciezar: 70, powtorzenia: 5 }];
    assert.equal(skalibruj(p, {
      positionId: "D1-S02", tydzien: 1, ciezarWykonany: 90, powtorzeniaWykonane: 8,
    }, TERAZ), null, "seria robocza nie nadpisuje 1RM, które już jest — to decyzja trenera");
  });

  test("kolejna seria z tego samego treningu poprawia kalibrację", () => {
    const p = plan();
    p.serieMaksymalne = skalibruj(p, {
      positionId: "D1-S02", tydzien: 1, ciezarWykonany: 50, powtorzeniaWykonane: 8,
    }, TERAZ)!;
    const pierwsza = p.serieMaksymalne[0]!.ciezar;
    const poprawiona = skalibruj(p, {
      positionId: "D1-S02", tydzien: 1, ciezarWykonany: 60, powtorzeniaWykonane: 8,
    }, TERAZ);
    assert.ok(poprawiona, "pierwsza seria bywa na próbę — druga ma prawo ją poprawić");
    assert.ok(poprawiona![0]!.ciezar > pierwsza);
    assert.equal(poprawiona!.filter((s) => s.cwiczenieId === AKCESORIUM).length, 1,
      "jeden wpis na ćwiczenie, nie dwa");
  });

  test("kalibracja z innego tygodnia jest już zamknięta", () => {
    const p = plan();
    p.serieMaksymalne = skalibruj(p, {
      positionId: "D1-S02", tydzien: 1, ciezarWykonany: 60, powtorzeniaWykonane: 8,
    }, TERAZ)!;
    assert.equal(skalibruj(p, {
      positionId: "D1-S02", tydzien: 2, ciezarWykonany: 70, powtorzeniaWykonane: 8,
    }, TERAZ), null, "w T2 seria idzie do propozycji dla trenera, jak każda inna");
  });

  test("przy masie ciała nie ma czego kalibrować", () => {
    assert.equal(skalibruj(plan(), {
      positionId: "D1-S03", tydzien: 1, ciezarWykonany: 2, powtorzeniaWykonane: 12,
    }, TERAZ), null);
  });

  test("seria niepełna albo spoza tabeli niczego nie liczy", () => {
    const p = plan();
    for (const [ciezarWykonany, powtorzeniaWykonane] of [[60, undefined], [undefined, 8], [60, 16]]) {
      assert.equal(skalibruj(p, {
        positionId: "D1-S02", tydzien: 1, ciezarWykonany, powtorzeniaWykonane,
      }, TERAZ), null, `${ciezarWykonany} × ${powtorzeniaWykonane}`);
    }
  });

  /**
   * Odczucie działa w bieżącym cyklu przez mnożnik adaptacji. Gdyby weszło
   * też do kalibracji, jedno „za łatwe" podniosłoby ciężar w T2 dwa razy.
   */
  test("odczucie nie wchodzi do kalibracji — działa już przez mnożnik", () => {
    const zOcena = oneRMzSerii({ ciezar: 60, powtorzenia: 8, rpePlanowane: 8, feedback: "za łatwe" });
    const bezOceny = oneRMzSerii({ ciezar: 60, powtorzenia: 8, rpePlanowane: 8, feedback: "OK" });
    assert.notEqual(zOcena!.oneRM, bezOceny!.oneRM, "punkt odniesienia: ocena zmienia estymatę");
    assert.equal(oneRMzKalibracji(60, 8, 8), bezOceny!.oneRM);
  });
});
