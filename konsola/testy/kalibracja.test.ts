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
import { bezWpisowKlienta } from "../wersja-robocza.ts";
import { przeliczPlan, type Plan } from "../../silnik/src/plan.ts";
import { oneRMzKalibracji, oneRMzSerii } from "../../silnik/src/odczyt-1rm.ts";

const BOJ = "EX-0010";          // A1. Barbell back squat — coeff 1,0
const AKCESORIUM = "EX-0016";   // B1. Barbell row — coeff 0,75
const MASA_CIALA = "EX-0050";   // B2. Dead bug straight legs — masa ciała
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

  test("seria daleko od planu nie rusza prawdziwej serii maksymalnej", () => {
    const p = plan();
    p.serieMaksymalne = [{ cwiczenieId: AKCESORIUM, ciezar: 70, powtorzenia: 5 }];
    assert.equal(skalibruj(p, {
      positionId: "D1-S02", tydzien: 1, ciezarWykonany: 90, powtorzeniaWykonane: 8,
    }, TERAZ), null, "ponad 30 % od planu — pomyłka albo inne ćwiczenie; decyduje trener");
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

  test("kalibracja z innego tygodnia jest zamknięta — T2 zmienia już tylko resztę planu", () => {
    const p = plan();
    p.serieMaksymalne = skalibruj(p, {
      positionId: "D1-S02", tydzien: 1, ciezarWykonany: 60, powtorzeniaWykonane: 8,
    }, TERAZ)!;
    const t1 = slot(p, "D1-S02", 1).ciezar;
    p.serieMaksymalne = skalibruj(p, {
      positionId: "D1-S02", tydzien: 2, ciezarWykonany: 70, powtorzeniaWykonane: 8,
    }, TERAZ)!;
    assert.equal(slot(p, "D1-S02", 1).ciezar, t1, "T1 zostaje przy kalibracji z T1");
    assert.equal(p.serieMaksymalne[0]!.kalibracja!.tydzien, 2);
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

/*
 * Inny ciężar w środku cyklu (trener, 17.10.2026): „jeżeli ktoś wpisze inny
 * ciężar — np. miał zrobić 40 kg × 8, a zrobił 45 kg × 9 — to niech ta seria
 * będzie podstawą do wyliczenia obciążeń do całej reszty planu, a nie tylko
 * do końca tego dnia treningowego”.
 */
describe("inny ciężar w środku cyklu liczy resztę planu", () => {
  // Przysiad 1RM 113 → T1–T6: 77,5 · 80 · 85 · 87,5 · 90 · 95. Wiosłowanie
  // 1RM 74,5, akcesorium trzymane z bloku: 55 · 55 · 55 · 57,5 · 57,5 · 57,5.
  const zMaksami = () => {
    const p = plan();
    p.serieMaksymalne = [
      { cwiczenieId: BOJ, ciezar: 100, powtorzenia: 5 },
      { cwiczenieId: AKCESORIUM, ciezar: 60, powtorzenia: 8 },
    ];
    return p;
  };
  const ciezary = (p: Plan, poz: string) => [1, 2, 3, 4, 5, 6].map((t) => slot(p, poz, t).ciezar);
  const wpisz = (p: Plan, poz: string, tydzien: number, ciezar: number, powt: number) =>
    skalibruj(p, { positionId: poz, tydzien, ciezarWykonany: ciezar, powtorzeniaWykonane: powt }, TERAZ);

  test("przykład trenera: więcej kg i powtórzeń — od tego tygodnia cięższy plan", () => {
    const p = zMaksami();
    const przed = ciezary(p, "D1-S01");
    const { powtorzenia } = slot(p, "D1-S01", 3);   // 85 kg × 5
    p.serieMaksymalne = wpisz(p, "D1-S01", 3, 92.5, powtorzenia + 1)!;
    const po = ciezary(p, "D1-S01");
    assert.deepEqual(po.slice(0, 2), przed.slice(0, 2), "T1–T2 — przerobione, bez zmian");
    assert.ok((po[2] as number) >= 92.5, `T3: ${po[2]} — co najmniej to, co klient podniósł`);
    for (let t = 3; t < 6; t++) {
      assert.ok((po[t] as number) > (przed[t] as number), `T${t + 1}: ${przed[t]} → ${po[t]}`);
    }
    const wpis = p.serieMaksymalne.find((s) => s.cwiczenieId === BOJ)!;
    assert.deepEqual(wpis.wczesniej, [{ doTygodnia: 2, oneRM: 113 }]);
    assert.deepEqual([wpis.kalibracja!.oneRMPrzed, wpis.kalibracja!.ciezarPlanu], [113, 85]);
    assert.deepEqual(wpis.kalibracja!.pierwotne, [{ cwiczenieId: BOJ, ciezar: 100, powtorzenia: 5 }]);
  });

  test("mniej niż w planie — reszta planu lżejsza", () => {
    const p = zMaksami();
    const przed = ciezary(p, "D1-S01");
    p.serieMaksymalne = wpisz(p, "D1-S01", 2, 72.5, slot(p, "D1-S01", 2).powtorzenia)!;
    const po = ciezary(p, "D1-S01");
    assert.equal(po[0], przed[0]);
    assert.equal(po[1], 72.5, "T2 dokładnie tyle, ile klient zrobił");
    assert.ok((po[5] as number) < (przed[5] as number));
  });

  test("ciężar jak w planie, inne powtórzenia — nic; od tego jest ocena", () => {
    const p = zMaksami();
    assert.equal(wpisz(p, "D1-S01", 3, 85, 8), null);
  });

  test("akcesorium trzymane z bloku też idzie w górę od tego tygodnia", () => {
    const p = zMaksami();
    p.serieMaksymalne = wpisz(p, "D1-S02", 2, 60, slot(p, "D1-S02", 2).powtorzenia)!;
    const po = ciezary(p, "D1-S02");
    assert.equal(po[0], 55, "T1 bez zmian");
    assert.equal(po[1], 60, "T2 — to, co klient zrobił");
    assert.ok(po.slice(2).every((c) => (c as number) >= 60), po.join(" · "));
  });

  test("kolejna seria z tego treningu poprawia zmianę od tej samej podstawy", () => {
    const p = zMaksami();
    const { powtorzenia } = slot(p, "D1-S01", 3);
    p.serieMaksymalne = wpisz(p, "D1-S01", 3, 90, powtorzenia)!;
    p.serieMaksymalne = wpisz(p, "D1-S01", 3, 92.5, powtorzenia)!;
    assert.equal(slot(p, "D1-S01", 3).ciezar, 92.5, "od 85 z planu, nie od 90 po pierwszej serii");
    p.serieMaksymalne = wpisz(p, "D1-S01", 3, 85, powtorzenia)!;
    assert.deepEqual(ciezary(p, "D1-S01"), ciezary(zMaksami(), "D1-S01"),
      "poprawka do ciężaru z planu — plan jak przed zmianą");
  });

  test("druga zmiana później — każdy odcinek tygodni ze swoim 1RM", () => {
    const p = zMaksami();
    p.serieMaksymalne = wpisz(p, "D1-S01", 3, 92.5, slot(p, "D1-S01", 3).powtorzenia)!;
    const poPierwszej = ciezary(p, "D1-S01");
    p.serieMaksymalne = wpisz(p, "D1-S01", 5, 105, slot(p, "D1-S01", 5).powtorzenia)!;   // plan: 100
    const poDrugiej = ciezary(p, "D1-S01");
    assert.deepEqual(poDrugiej.slice(0, 4), poPierwszej.slice(0, 4));
    assert.equal(poDrugiej[4], 105);
    const wpis = p.serieMaksymalne.find((s) => s.cwiczenieId === BOJ)!;
    assert.equal(wpis.wczesniej!.length, 2);
    assert.deepEqual(wpis.kalibracja!.pierwotne, [{ cwiczenieId: BOJ, ciezar: 100, powtorzenia: 5 }],
      "pierwotna seria maksymalna przechodzi przez kolejne zmiany");
  });

  test("zaległy trening z wcześniejszego tygodnia nie cofa nowszej zmiany", () => {
    const p = zMaksami();
    p.serieMaksymalne = wpisz(p, "D1-S01", 4, 95, slot(p, "D1-S01", 4).powtorzenia)!;
    assert.equal(wpisz(p, "D1-S01", 2, 75, slot(p, "D1-S01", 2).powtorzenia), null);
  });

  test("ponad 30 % różnicy — nic; ciężar wpisany na sztywno przez trenera — nic", () => {
    const p = zMaksami();
    assert.equal(wpisz(p, "D1-S01", 3, 120, 5), null);
    p.sloty[0]!.tygodnie = { 3: { ciezarOverride: 80 } };
    assert.equal(wpisz(p, "D1-S01", 3, 90, 5), null);
  });

  test("„Resetuj plan” wraca do serii maksymalnej sprzed zmian", () => {
    const p = zMaksami();
    p.serieMaksymalne = wpisz(p, "D1-S01", 3, 92.5, slot(p, "D1-S01", 3).powtorzenia)!;
    assert.deepEqual(bezWpisowKlienta(p).serieMaksymalne.find((s) => s.cwiczenieId === BOJ),
      { cwiczenieId: BOJ, ciezar: 100, powtorzenia: 5 });
  });
});
