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

  test("serie maksymalne trafiają do wiersza swojego ćwiczenia", () => {
    const dane = daneDoArkusza(planDomyslny());
    assert.deepEqual(dane.serie_maksymalne, [
      { dzien: 1, pozycja: 1, ciezar: 120, powtorzenia: 1 },
      { dzien: 1, pozycja: 2, ciezar: 70, powtorzenia: 1 },
    ]);
  });
});
