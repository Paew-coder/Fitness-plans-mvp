/**
 * Historia klienta — wiele cykli naraz.
 *
 * Cykle budujemy z prawdziwych planów przeliczonych silnikiem, nie z atrap:
 * pytanie brzmi „czy trend widać poprawnie", a trend liczy się z tych samych
 * liczb, które trafiają na sztangę.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { przeliczPlan, type Plan } from "../src/plan.ts";
import { historiaKlienta, podsumujHistorie, type CyklDoHistorii } from "../src/historia-klienta.ts";

/** Plan z jednym dniem: przysiad jako bój główny plus wiosłowanie. */
function planCyklu(oneRMPrzysiad: number, dodatkowe: { id: string; ciezar: number }[] = []): Plan {
  const sloty = [];
  for (let dzien = 1; dzien <= 5; dzien++) {
    for (let poz = 1; poz <= 12; poz++) {
      sloty.push({
        positionId: `D${dzien}-S${String(poz).padStart(2, "0")}`,
        dzien,
        lp: poz === 1 ? "A1." : poz === 2 ? "B1." : poz === 3 ? "B2." : "",
        cwiczenieId: null as string | null,
        kategoriaSzkieletu: null,
        tygodnie: {},
      });
    }
  }
  sloty[0]!.cwiczenieId = "EX-0010";                    // Barbell back squat
  sloty[1]!.cwiczenieId = "EX-0016";                    // Barbell row
  for (const [i, d] of dodatkowe.entries()) sloty[2 + i]!.cwiczenieId = d.id;

  return {
    nazwa: "Klient",
    trybAkcesoriow: "trzymaj z bloku",
    czescPlanu: "objętość",
    serieMaksymalne: [
      { cwiczenieId: "EX-0010", ciezar: oneRMPrzysiad, powtorzenia: 1 },
      { cwiczenieId: "EX-0016", ciezar: 60, powtorzenia: 1 },
      ...dodatkowe.map((d) => ({ cwiczenieId: d.id, ciezar: d.ciezar, powtorzenia: 1 })),
    ],
    sloty,
    topSety: [1, 2, 3, 4, 5].map((dzien) => ({
      dzien, wlaczony: false, rpe: 7, slotPositionId: `D${dzien}-S01`,
    })),
  };
}

function cykl(
  wersja: number,
  oneRM: number,
  opcje: Partial<CyklDoHistorii> & { dodatkowe?: { id: string; ciezar: number }[] } = {},
): CyklDoHistorii {
  const { dodatkowe, ...reszta } = opcje;
  return {
    wersja,
    status: "zakończony",
    dataStartu: `2026-0${wersja}-01`,
    wynik: przeliczPlan(planCyklu(oneRM, dodatkowe)),
    ukonczonych: 5,
    zaplanowanych: 6,
    ...reszta,
  };
}

const TERAZ = Date.parse("2026-07-01T00:00:00.000Z");

describe("historia klienta — cykle", () => {
  test("cykle układają się po numerze, nie po kolejności wejścia", () => {
    const h = historiaKlienta([cykl(3, 120), cykl(1, 100), cykl(2, 110)], TERAZ);
    assert.deepEqual(h.cykle.map((c) => c.wersja), [1, 2, 3]);
  });

  test("cykl opisany jest średnią z tygodni, nie sumą", () => {
    const jeden = historiaKlienta([cykl(1, 100)], TERAZ).cykle[0]!;
    const wynik = przeliczPlan(planCyklu(100));
    const sredniaStresu = wynik.tygodnie.reduce((a, t) => a + t.bilans.razem, 0) / 6;

    assert.equal(jeden.stresNaTydzien, Math.round(sredniaStresu * 100) / 100);
    assert.equal(jeden.dniTreningowe, 1);
    assert.equal(jeden.cwiczen, 2);
  });

  test("frekwencja liczy się z domkniętych treningów", () => {
    const h = historiaKlienta([cykl(1, 100, { ukonczonych: 3, zaplanowanych: 6 })], TERAZ);
    assert.equal(h.cykle[0]!.frekwencja, 0.5);
    assert.equal(h.razem.ukonczonych, 3);
    assert.equal(h.razem.zaplanowanych, 6);
  });

  test("plan bez treningów nie dzieli przez zero", () => {
    const h = historiaKlienta([cykl(1, 100, { ukonczonych: 0, zaplanowanych: 0 })], TERAZ);
    assert.equal(h.cykle[0]!.frekwencja, null);
  });

  test("długość współpracy liczy się od pierwszego startu", () => {
    const h = historiaKlienta([cykl(1, 100), cykl(2, 110)], TERAZ);
    assert.equal(h.razem.dniWspolpracy, 181, "od 2026-01-01 do 2026-07-01");
  });

  test("bez dat startu nie zgadujemy długości współpracy", () => {
    const h = historiaKlienta([cykl(1, 100, { dataStartu: null })], TERAZ);
    assert.equal(h.razem.dniWspolpracy, null);
  });
});

describe("historia klienta — ścieżki ćwiczeń", () => {
  test("1RM ćwiczenia idzie przez wszystkie cykle, w których stało", () => {
    const h = historiaKlienta([cykl(1, 100), cykl(2, 110), cykl(3, 125)], TERAZ);
    const przysiad = h.cwiczenia.find((c) => c.cwiczenieId === "EX-0010")!;

    assert.deepEqual(przysiad.punkty, [
      { wersja: 1, oneRM: 100 }, { wersja: 2, oneRM: 110 }, { wersja: 3, oneRM: 125 },
    ]);
    assert.equal(przysiad.zmianaKg, 25);
    assert.equal(przysiad.zmianaProc, 25);
    assert.equal(przysiad.wCyklach, 3);
  });

  test("ćwiczenie z jednego cyklu nie udaje trendu", () => {
    const h = historiaKlienta([
      cykl(1, 100),
      cykl(2, 110, { dodatkowe: [{ id: "EX-0011", ciezar: 70 }] }),
    ], TERAZ);
    const wyciskanie = h.cwiczenia.find((c) => c.cwiczenieId === "EX-0011")!;

    assert.equal(wyciskanie.wCyklach, 1);
    assert.equal(wyciskanie.zmianaKg, 0);
    assert.equal(wyciskanie.punkty.length, 1);
  });

  test("najmocniejsze zmiany idą pierwsze", () => {
    const h = historiaKlienta([
      cykl(1, 100, { dodatkowe: [{ id: "EX-0011", ciezar: 70 }] }),
      cykl(2, 130, { dodatkowe: [{ id: "EX-0011", ciezar: 72.5 }] }),
    ], TERAZ);
    assert.equal(h.cwiczenia[0]!.cwiczenieId, "EX-0010", "przysiad +30 kg przed wyciskaniem +2,5");
  });

  test("spadek jest widoczny tak samo jak wzrost", () => {
    const h = historiaKlienta([cykl(1, 120), cykl(2, 100)], TERAZ);
    const przysiad = h.cwiczenia.find((c) => c.cwiczenieId === "EX-0010")!;
    assert.equal(przysiad.zmianaKg, -20);
    assert.ok(przysiad.zmianaProc! < 0);
  });
});

describe("historia klienta — wzorce i podsumowanie", () => {
  test("każdy wzorzec ma punkt w każdym cyklu, także zerowy", () => {
    const h = historiaKlienta([cykl(1, 100), cykl(2, 110)], TERAZ);
    for (const w of h.wzorce) {
      assert.equal(w.punkty.length, 2, `${w.nazwa} musi mieć punkt w obu cyklach`);
    }
    const core = h.wzorce.find((w) => w.part === "c")!;
    assert.deepEqual(core.punkty.map((p) => p.serie), [0, 0], "core w tym planie nie ma");
    assert.ok(h.wzorce.find((w) => w.part === "s")!.punkty[0]!.serie > 0);
  });

  test("podsumowanie opisuje, ale nie ocenia", () => {
    const tekst = podsumujHistorie(historiaKlienta([cykl(1, 100), cykl(2, 130)], TERAZ));
    assert.match(tekst, /2 cykli/);
    assert.match(tekst, /1RM w górę w 1/);
    assert.ok(!/lepiej|gorzej|źle|dobrze|świetnie|słabo/i.test(tekst), tekst);
  });

  test("przy jednym cyklu podsumowanie mówi to wprost", () => {
    assert.match(podsumujHistorie(historiaKlienta([cykl(1, 100)], TERAZ)), /pierwszy cykl/);
    assert.match(podsumujHistorie(historiaKlienta([], TERAZ)), /Brak cykli/);
  });
});
