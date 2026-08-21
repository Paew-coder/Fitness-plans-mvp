/**
 * Wczytywanie arkusza z powrotem do aplikacji.
 *
 * Regresja, po której ten plik powstał: **arkusz prosto z eksportu wracał
 * pusty**. Identyfikator ćwiczenia stoi w arkuszu w ukrytej kolumnie liczonej
 * formułą, a plik dopiero co zapisany przez wypełniacz nie ma jeszcze
 * policzonych formuł — ich wartości pojawiają się dopiero po otwarciu pliku
 * w Excelu albo LibreOffice. Import czytał więc same puste komórki, wyrzucał
 * wszystkie sloty i zakładał plan bez ani jednego ćwiczenia — meldując
 * powodzenie. Sprawdzenie pełnego kółka przechodziło, bo szło przez
 * przeliczenie w LibreOffice i formuły były już policzone.
 *
 * Zapas jest prosty: gdy w kolumnie z identyfikatorem nic nie stoi, decyduje
 * nazwa z kolumny ĆWICZENIE — ta sama BAZA, to samo źródło co formuła.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  idCwiczenia, planZArkusza, nierozpoznaneCwiczenia,
  SKROTY_TYGODNI, type SlotArkusza, type ZrzutArkusza,
} from "../src/import-arkusza.ts";

function pusteTygodnie(): SlotArkusza["tygodnie"] {
  return Object.fromEntries(SKROTY_TYGODNI.map((t) => [t, {
    serie: 3, rpe: 8, feedback: null, cwiczenie: null, one_rm_reczny: null,
    ocz_powtorzenia: 6, ocz_ciezar: null, ocz_procent: null, ocz_one_rm: null,
    ocz_mnoznik: null, ocz_stres_t: null, ocz_stres_c: null, ocz_stres_p: null,
  }]));
}

function zrzut(sloty: Partial<SlotArkusza>[]): ZrzutArkusza {
  return {
    zrodlo: "plan.xlsx",
    ustawienia: { tryb_akcesoriow: "licz z RPE", czesc_planu: "objętość", dni_treningowe: 1 },
    serie_maksymalne: [],
    sloty: sloty.map((s, i) => ({
      position_id: `D1-S0${i + 1}`, dzien: 1, lp: i === 0 ? "A1." : `B${i}.`,
      nazwa: "", ex_id: null, kategoria_szkieletu: null,
      "1rm_nierozwiazany": false, tygodnie: pusteTygodnie(), ...s,
    })),
    top_sety: [],
    podsumowania: {},
  };
}

describe("identyfikator ćwiczenia", () => {
  test("kolumna z identyfikatorem wygrywa, gdy jest wypełniona", () => {
    assert.equal(idCwiczenia("Barbell row", "EX-0010"), "EX-0010");
  });

  test("bez policzonej formuły rozstrzyga nazwa z BAZY", () => {
    assert.equal(idCwiczenia("Barbell back squat", null), "EX-0010");
  });

  test("nazwa spoza BAZY nie daje identyfikatora", () => {
    assert.equal(idCwiczenia("Przysiad ze sztangą", null), null);
  });

  test("pusty slot zostaje pusty", () => {
    assert.equal(idCwiczenia(null, null), null);
    assert.equal(idCwiczenia("   ", null), null);
  });
});

describe("plan z arkusza bez policzonych formuł", () => {
  const bezFormul = zrzut([
    { nazwa: "Barbell back squat", ex_id: null },
    { nazwa: "Barbell row", ex_id: null },
  ]);

  test("wraca komplet ćwiczeń, nie pusty plan", () => {
    const plan = planZArkusza(bezFormul);
    assert.deepEqual(plan.sloty.map((s) => s.cwiczenieId), ["EX-0010", "EX-0016"]);
  });

  test("seria maksymalna też wraca po nazwie", () => {
    const z = zrzut([{ nazwa: "Barbell back squat", ex_id: null }]);
    z.serie_maksymalne = [{
      position_id: "D1-S01", nazwa: "Barbell back squat", ex_id: null,
      ciezar: 120, powtorzenia: 3, oczekiwany_1rm: null,
    }];
    assert.deepEqual(planZArkusza(z).serieMaksymalne,
      [{ cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 3 }]);
  });

  test("nazwa rozpoznana w BAZIE nie trafia na listę nierozpoznanych", () => {
    assert.deepEqual(nierozpoznaneCwiczenia(bezFormul), []);
  });
});

describe("arkusz, z którego nie da się nic wczytać", () => {
  test("arkusz bez ćwiczeń daje plan bez slotów — jest po czym poznać", () => {
    // Na tym stoi odmowa importu po stronie konsoli: pusty plan powstały
    // z takiego pliku nigdy nie może wyglądać jak udany import.
    assert.equal(planZArkusza(zrzut([{ nazwa: "", ex_id: null }])).sloty.length, 0);
  });

  test("literówka w nazwie wychodzi na listę nierozpoznanych", () => {
    const z = zrzut([{ nazwa: "Barbell bak squat", ex_id: null }]);
    assert.equal(planZArkusza(z).sloty.length, 0);
    assert.deepEqual(nierozpoznaneCwiczenia(z),
      [{ positionId: "D1-S01", nazwa: "Barbell bak squat" }]);
  });
});
