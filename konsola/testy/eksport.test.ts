/**
 * Co trafia do arkusza — bez Pythona i bez LibreOffice.
 *
 * Test pilnuje jednej rzeczy, na której stoi cała umowa tej aplikacji:
 * **klient dostaje te same liczby, które trener widział na ekranie**.
 *
 * Regresja, po której ten plik powstał: slot, w którym trener nie ruszył serii
 * ani RPE, wychodził z konsoli jako „nie ustawione". Wypełniacz pomijał puste
 * pola, więc w arkuszu zostawały wartości szablonu (6 serii, RPE 6,5 dla boju
 * głównego w T1), a silnik liczył swoje (1 seria, RPE 8). Wyszło to dopiero
 * przy pełnym kółku konsola → arkusz → konsola.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { przeliczPlan } from "../../silnik/src/plan.ts";
import { pustyPlan } from "../uklad-planu.ts";
import { daneDoArkusza } from "../eksport-xlsx.ts";
import type { ZapisanyPlan } from "../magazyn.ts";

/** Plan, w którym trener wybrał ćwiczenia i nic poza tym nie ustawił. */
function planDomyslny(): ZapisanyPlan {
  const plan = pustyPlan("Testowy Klient");
  plan.sloty[0]!.cwiczenieId = "EX-0010";   // A1. bój główny
  plan.sloty[1]!.cwiczenieId = "EX-0016";   // B1. akcesorium
  plan.serieMaksymalne = [
    { cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 1 },
    { cwiczenieId: "EX-0016", ciezar: 70, powtorzenia: 1 },
  ];
  return {
    id: "test-1", trenerId: 1, klientId: "testowy-klient", klient: "Testowy Klient",
    wersja: 1, status: "szkic", dataStartu: null, utworzony: "", zmieniony: "", plan,
  };
}

const pole = (dane: ReturnType<typeof daneDoArkusza>, positionId: string, tydzien: number) => {
  const slot = dane.sloty.find((s) => s.position_id === positionId)!;
  return (slot.tygodnie as Record<string, any>)[`T${tydzien}`];
};

describe("eksport — arkusz dostaje to, co pokazała konsola", () => {
  test("mały ciężar przesunięty po ocenie (5 → 4 kg) idzie do arkusza wprost (02.10.2026)", () => {
    const zapisany = planDomyslny();
    zapisany.plan.serieMaksymalne = zapisany.plan.serieMaksymalne
      .map((s) => (s.cwiczenieId === "EX-0016" ? { ...s, ciezar: 8 } : s));
    zapisany.plan.sloty[1]!.tygodnie = { 1: { feedback: "za trudne" } };
    const wynik = przeliczPlan(zapisany.plan);
    const t2 = wynik.tygodnie[1]!.sloty[1]!;
    assert.equal(t2.zmianaPoOcenie, true, `T2: ${t2.ciezar}`);
    assert.equal(pole(daneDoArkusza(zapisany), "D1-S02", 2).ciezar_reczny, t2.ciezar,
      "arkusz zaokrągliłby z powrotem — dostaje liczbę");
  });

  test("pauzowane wyciskanie idzie z powtórzeniami z jego progresji (02.10.2026)", () => {
    const zapisany = planDomyslny();
    zapisany.plan.sloty[1]!.cwiczenieId = "EX-0022";   // B1. Bench press paused 3sec
    zapisany.plan.serieMaksymalne.push({ cwiczenieId: "EX-0022", ciezar: 102, powtorzenia: 1 });
    const dane = daneDoArkusza(zapisany);
    assert.deepEqual([pole(dane, "D1-S02", 1).serie, pole(dane, "D1-S02", 1).powtorzenia_reczne,
      pole(dane, "D1-S02", 1).rpe], [5, 3, 7.5], "arkusz nie zna progresji pauzowanej — dostaje liczby wprost");
    assert.deepEqual([1, 2, 4, 5].map((t) => pole(dane, "D1-S02", t).ciezar_reczny), [85, 87.5, 90, 92.5],
      "ciężar z RPE co tydzień, nie trzymany z bloku jak u akcesorium");
  });

  test("serie i RPE lecą policzone, nawet gdy trener ich nie ruszył", () => {
    const zapisany = planDomyslny();
    const wynik = przeliczPlan(zapisany.plan);
    const dane = daneDoArkusza(zapisany);

    for (const tydzien of [1, 2, 3, 4, 5, 6]) {
      for (const positionId of ["D1-S01", "D1-S02"]) {
        const obliczony = wynik.tygodnie[tydzien - 1]!.sloty.find((s) => s.positionId === positionId)!;
        const wpis = pole(dane, positionId, tydzien);
        assert.equal(wpis.serie, obliczony.serie, `${positionId} T${tydzien}: serie`);
        assert.equal(wpis.rpe, obliczony.rpe, `${positionId} T${tydzien}: RPE`);
      }
    }
  });

  test("bój główny dostaje powtórzenia wprost, akcesorium zostawia formułę", () => {
    const dane = daneDoArkusza(planDomyslny());
    const wynik = przeliczPlan(planDomyslny().plan);
    const boj = wynik.tygodnie[0]!.sloty.find((s) => s.positionId === "D1-S01")!;

    assert.equal(pole(dane, "D1-S01", 1).powtorzenia_reczne, boj.powtorzenia);
    assert.equal(pole(dane, "D1-S02", 1).powtorzenia_reczne, null,
      "akcesorium liczy powtórzenia formułą w arkuszu — nadpisanie zabiłoby automat");
  });

  test("ręczne powtórzenia akcesorium jednak jadą", () => {
    const zapisany = planDomyslny();
    zapisany.plan.sloty[1]!.tygodnie = { 1: { powtorzenia: 12 } };
    assert.equal(pole(daneDoArkusza(zapisany), "D1-S02", 1).powtorzenia_reczne, 12);
  });

  test("odczucia klienta jadą razem z planem", () => {
    const zapisany = planDomyslny();
    zapisany.plan.sloty[0]!.tygodnie = { 1: { feedback: "za łatwe" }, 2: { feedback: "za trudne" } };
    const dane = daneDoArkusza(zapisany);

    assert.equal(pole(dane, "D1-S01", 1).feedback, "za łatwe");
    assert.equal(pole(dane, "D1-S01", 2).feedback, "za trudne");
    assert.equal(pole(dane, "D1-S01", 3).feedback, null);
    // Bez odczuć arkusz startowałby od mnożnika 1 i od T2 pokazywał inne
    // ciężary niż konsola — to była druga połowa tej samej regresji.
    assert.equal(pole(dane, "D1-S02", 1).feedback, null);
  });

  test("slot bez ćwiczenia nie dostaje żadnych tygodni", () => {
    const dane = daneDoArkusza(planDomyslny());
    const pusty = dane.sloty.find((s) => s.position_id === "D1-S05")!;
    assert.deepEqual(pusty.tygodnie, {}, "pusty slot ma zostać pusty, a nie dostać domyślne liczby");
    assert.equal(pusty.nazwa, null);
  });

  /*
   * TOP SET: RPE osobno na każdy tydzień.
   *
   * Wcześniej do arkusza szła jedna liczba na cały cykl, bo tak pisał
   * wypełniacz — a rampa 6 → 6,5 → 7 → 7,5 → 8 siedzi w arkuszu od zawsze,
   * każdy tydzień ma własną komórkę. Plik pokazywał więc klientowi co innego
   * niż konsola, i to dokładnie tam, gdzie TOP SET ma sens: w intensywności.
   */
  test("TOP SET jedzie z rampą RPE, tydzień po tygodniu", () => {
    const zapisany = planDomyslny();
    zapisany.plan.topSety = [
      { dzien: 1, wlaczony: true, slotPositionId: "D1-S01" },
    ];
    const dane = daneDoArkusza(zapisany);
    assert.deepEqual(dane.top_sety[0]!.rpe_tygodni,
      { T1: null, T2: 6, T3: 6.5, T4: 7, T5: 7.5, T6: 8 });
  });

  test("pusty tydzień jedzie jako pustka, nie jako liczba", () => {
    // `null` czyści komórkę RPE, a w poprawionym arkuszu pusta komórka znaczy
    // „w tym tygodniu TOP SETU nie ma". Gdyby szła tu liczba, plik pokazywałby
    // klientowi TOP SET w T1, którego konsola nie pokazuje.
    const zapisany = planDomyslny();
    zapisany.plan.topSety = [
      { dzien: 1, wlaczony: true, slotPositionId: "D1-S01" },
    ];
    assert.equal(daneDoArkusza(zapisany).top_sety[0]!.rpe_tygodni!.T1, null);
  });

  test("cykl na intensywność ma własną rampę", () => {
    const zapisany = planDomyslny();
    zapisany.plan.czescPlanu = "intensywność";
    zapisany.plan.topSety = [
      { dzien: 1, wlaczony: true, slotPositionId: "D1-S01" },
    ];
    assert.deepEqual(daneDoArkusza(zapisany).top_sety[0]!.rpe_tygodni,
      { T1: null, T2: 7, T3: 7.5, T4: 8, T5: 8.5, T6: 9 });
  });

  test("RPE wpisane ręcznie wygrywa także w drodze do arkusza", () => {
    const zapisany = planDomyslny();
    zapisany.plan.topSety = [
      { dzien: 1, wlaczony: true, slotPositionId: "D1-S01", rpeTygodni: { 1: 6, 4: 9 } },
    ];
    assert.deepEqual(daneDoArkusza(zapisany).top_sety[0]!.rpe_tygodni,
      { T1: 6, T2: 6, T3: 6.5, T4: 9, T5: 7.5, T6: 8 });
  });

  test("serie maksymalne trafiają do wiersza swojego ćwiczenia", () => {
    const dane = daneDoArkusza(planDomyslny());
    assert.deepEqual(dane.serie_maksymalne, [
      { dzien: 1, pozycja: 1, ciezar: 120, powtorzenia: 1 },
      { dzien: 1, pozycja: 2, ciezar: 70, powtorzenia: 1 },
    ]);
  });
});

describe("eksport — deload i maksy, gdy są w planie", () => {
  test("bez nich nie ma żadnych dodatkowych zakładek", () => {
    assert.deepEqual(daneDoArkusza(planDomyslny()).tygodnie_dodatkowe, []);
  });

  test("T7 deload i T8 maksy jadą z liczbami z konsoli", () => {
    const zapisany = planDomyslny();
    zapisany.plan.deload = true;
    zapisany.plan.tydzienMaksow = true;
    const dane = daneDoArkusza(zapisany);
    const wynik = przeliczPlan(zapisany.plan);
    assert.deepEqual(dane.tygodnie_dodatkowe.map((t) => t.nazwa), ["T7 deload", "T8 maksy"]);
    const deload = dane.tygodnie_dodatkowe[0]!.wiersze;
    const t7 = wynik.tygodnieDodatkowe[0]!.sloty.filter((s) => s.cwiczenie);
    assert.deepEqual(deload.map((w) => [w.lp, w.serie, w.powtorzenia, w.rpe, w.ciezar]),
      t7.map((s) => [s.lp, s.serie, s.powtorzenia, s.rpe, s.ciezar]));
    const maksy = dane.tygodnie_dodatkowe[1]!.wiersze;
    assert.deepEqual(maksy.map((w) => [w.cwiczenie, w.serie, w.powtorzenia, w.rpe, w.ciezar]),
      [["Barbell back squat", 1, 1, 10, 120]]);
  });

  test("bez deloadu maksy są w arkuszu tygodniem siódmym", () => {
    const zapisany = planDomyslny();
    zapisany.plan.tydzienMaksow = true;
    assert.deepEqual(daneDoArkusza(zapisany).tygodnie_dodatkowe.map((t) => t.nazwa), ["T7 maksy"]);
  });
});

describe("eksport — hipertrofia", () => {
  test("akcesoria dostają powtórzenia wprost — arkusz liczyłby 8/10, nie 10–12", () => {
    const zapisany = planDomyslny();
    zapisany.plan.czescPlanu = "hipertrofia";
    const dane = daneDoArkusza(zapisany);
    assert.deepEqual([1, 2, 3].map((t) => pole(dane, "D1-S02", t).powtorzenia_reczne), [10, 11, 12]);
    assert.deepEqual([1, 4].map((t) => pole(dane, "D1-S01", t).powtorzenia_reczne), [12, 12]);
    assert.ok(dane.top_sety.every((t) => Object.values(t.rpe_tygodni).every((r) => r === null)),
      "hipertrofia bez TOP SETU");
  });

  test("cz. 2 też idzie wprost: bój 4 × 10, akcesorium 8 → 10", () => {
    const zapisany = planDomyslny();
    zapisany.plan.czescPlanu = "hipertrofia 2";
    const dane = daneDoArkusza(zapisany);
    assert.deepEqual([1, 2, 3].map((t) => pole(dane, "D1-S02", t).powtorzenia_reczne), [8, 9, 10]);
    assert.deepEqual([1, 3].map((t) => pole(dane, "D1-S01", t).powtorzenia_reczne), [10, 12]);
    assert.ok(dane.top_sety.every((t) => Object.values(t.rpe_tygodni).every((r) => r === null)));
  });
});

// Kilka TOP SETÓW w dniu (27.09.2026) — arkusz ma na dzień jeden wiersz.
describe("eksport — dwa TOP SETY w jednym dniu", () => {
  test("do arkusza idzie jeden na dzień: pierwszy w kolejności tabeli", () => {
    const zapisany = planDomyslny();
    zapisany.plan.topSety = [
      ...(zapisany.plan.topSety ?? []).filter((t) => t.dzien !== 1),
      { dzien: 1, wlaczony: true, slotPositionId: "D1-S02", rpeTygodni: { 2: 9 } },
      { dzien: 1, wlaczony: true, slotPositionId: "D1-S01" },
    ];
    const dane = daneDoArkusza(zapisany);
    const dzien1 = dane.top_sety.filter((t) => t.dzien === 1);
    assert.equal(dzien1.length, 1);
    assert.equal(dzien1[0]!.rpe_tygodni.T2, 6, "RPE TOP SETU przy A1, nie 9 z B1");
  });
});
