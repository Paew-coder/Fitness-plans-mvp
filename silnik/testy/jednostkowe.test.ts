/**
 * Testy jednostkowe reguł, których nie pokrywa złoty zestaw.
 * Każda oczekiwana wartość pochodzi wprost z formuł MasterTemplate 5.17 —
 * przy każdej grupie podana jest komórka źródłowa.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { oblicz1RM, procent1RM, rozwiaz1RM, konfliktSeriiMaksymalnych } from "../src/rpe.ts";
import { mnoznikAdaptacji, mnoznikNaTydzien, korektaPowtorzen } from "../src/adaptacja.ts";
import { powtorzeniaAkcesorium, powtorzeniaBazowe, offsetTygodnia } from "../src/powtorzenia.ts";
import { obliczCiezar, obliczCiezarTopSetu, tydzienBazowyBloku } from "../src/ciezar.ts";
import { stresSlotu, bilansTygodnia, ocenaNormy, NORMY } from "../src/stres.ts";
import { mround } from "../src/pomocnicze.ts";
import { katalog } from "../src/katalog.ts";
import { przeliczPlan, type Plan } from "../src/plan.ts";
import { sprawdzPlan, planGotowyDoWyslania } from "../src/walidacja.ts";

describe("tabela RPE (TABELE!B4:J18)", () => {
  test("wartości brzegowe", () => {
    assert.equal(procent1RM(1, 10), 100);
    assert.equal(procent1RM(15, 6), 45.5);
    assert.equal(procent1RM(8, 8), 72.5);
    assert.equal(procent1RM(10, 8), 67.5);
  });

  test("nie interpoluje — trafienie dokładne albo null", () => {
    assert.equal(procent1RM(8, 8.25), null, "RPE spoza siatki co 0,5");
    assert.equal(procent1RM(16, 8), null, "powtórzenia poza tabelą");
    assert.equal(procent1RM(0, 8), null);
  });

  test("RPE co 0,5 działa", () => {
    assert.equal(procent1RM(6, 6.5), 69.5);
    assert.equal(procent1RM(6, 9.5), 83.5);
  });
});

describe("1RM z serii maksymalnej (START!E)", () => {
  test("seria do odmowy = RPE 10", () => {
    // 50 kg × 8 powt. → 50 / 0,805 = 62,11… → 62,1
    assert.equal(oblicz1RM(50, 8), 62.1);
    // 100 kg × 1 powt. przy 100% → 100
    assert.equal(oblicz1RM(100, 1), 100);
  });

  test("powtórzenia poza tabelą dają null", () => {
    assert.equal(oblicz1RM(50, 16), null);
  });

  test("deduplikacja bierze MAX, nie pierwsze trafienie", () => {
    const serie = [
      { cwiczenieId: "EX-0001", ciezar: 50, powtorzenia: 8 }, // 62,1
      { cwiczenieId: "EX-0001", ciezar: 60, powtorzenia: 8 }, // 74,5
      { cwiczenieId: "EX-0002", ciezar: 90, powtorzenia: 5 },
    ];
    assert.equal(rozwiaz1RM("EX-0001", serie), 74.5);
  });

  test("brak wpisu daje 0 (ciężar policzy się na '— brak 1RM')", () => {
    assert.equal(rozwiaz1RM("EX-9999", []), 0);
  });

  test("wykrywa konflikt serii maksymalnych", () => {
    const serie = [
      { cwiczenieId: "EX-0001", ciezar: 50, powtorzenia: 8 },
      { cwiczenieId: "EX-0001", ciezar: 60, powtorzenia: 8 },
    ];
    assert.deepEqual(konfliktSeriiMaksymalnych(serie), ["EX-0001"]);
    assert.deepEqual(konfliktSeriiMaksymalnych(serie.slice(0, 1)), []);
  });
});

describe("mnożnik adaptacji (kolumna AC)", () => {
  test("bez historii = 1", () => {
    assert.equal(mnoznikAdaptacji([]), 1);
    assert.equal(mnoznikAdaptacji(["OK", "OK"]), 1);
  });

  test("±5% na każde zgłoszenie", () => {
    assert.equal(mnoznikAdaptacji(["za łatwe"]), 1.05);
    assert.equal(mnoznikAdaptacji(["za łatwe", "za łatwe"]), 1.1);
    assert.equal(mnoznikAdaptacji(["za trudne"]), 0.95);
    assert.equal(mnoznikAdaptacji(["za łatwe", "za trudne"]), 1);
  });

  test("obcięcie do ±15%", () => {
    assert.equal(mnoznikAdaptacji(Array(10).fill("za łatwe")), 1.15);
    assert.equal(mnoznikAdaptacji(Array(10).fill("za trudne")), 0.85);
  });

  test("zakres historii rośnie z tygodniem i nie resetuje się w T4", () => {
    const odczucia = { 1: "za łatwe", 2: "za łatwe", 3: "za łatwe" } as const;
    assert.equal(mnoznikNaTydzien(1, {}), 1, "T1 nie ma historii");
    assert.equal(mnoznikNaTydzien(2, odczucia), 1.05, "T2 czyta tylko T1");
    assert.equal(mnoznikNaTydzien(3, odczucia), 1.1, "T3 czyta T1+T2");
    assert.equal(mnoznikNaTydzien(4, odczucia), 1.15, "T4 czyta T1+T2+T3 — restart bazy, nie historii");
  });
});

describe("korekta powtórzeń dla progresji bezciężarowych (kolumna AD)", () => {
  test("progresje ciężarowe: zawsze 0", () => {
    assert.equal(korektaPowtorzen("kg", 1.15), 0);
    assert.equal(korektaPowtorzen("asysta", 0.85), 0);
    assert.equal(korektaPowtorzen("dodatkowy ciężar", 1.1), 0);
  });

  test("progresje bezciężarowe: mnożnik zamienia się na powtórzenia", () => {
    assert.equal(korektaPowtorzen("masa ciała", 1.1), 2);
    assert.equal(korektaPowtorzen("masa ciała", 0.9), -2);
    assert.equal(korektaPowtorzen("czas", 1), 0);
    assert.equal(korektaPowtorzen("dystans", 1.15), 3);
    assert.equal(korektaPowtorzen("ręczne ustawienie", 0.85), -3);
  });
});

describe("automat powtórzeń akcesoriów (kolumna E)", () => {
  test("baza zależy od coeff i części planu", () => {
    assert.equal(powtorzeniaBazowe(1, "objętość"), 6);
    assert.equal(powtorzeniaBazowe(1, "intensywność"), 6, "coeff 1 nie reaguje na przełącznik");
    assert.equal(powtorzeniaBazowe(0.75, "objętość"), 8);
    assert.equal(powtorzeniaBazowe(0.75, "intensywność"), 6);
    assert.equal(powtorzeniaBazowe(0.5, "objętość"), 10);
    assert.equal(powtorzeniaBazowe(0.25, "intensywność"), 8);
  });

  test("offset rośnie w bloku, T4 restartuje", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((t) => offsetTygodnia(t as 1)), [0, 1, 2, 0, 1, 2]);
  });

  test("pełny automat — coeff 0,5, objętość, sześć tygodni", () => {
    const wynik = [1, 2, 3, 4, 5, 6].map((t) =>
      powtorzeniaAkcesorium({ coeff: 0.5, czesc: "objętość", tydzien: t as 1 }),
    );
    assert.deepEqual(wynik, [10, 11, 12, 10, 11, 12]);
  });

  test("obcięcie do zakresu tabeli 1–15", () => {
    assert.equal(
      powtorzeniaAkcesorium({ coeff: 0.5, czesc: "objętość", tydzien: 6, korekta: 3 }),
      15,
    );
    assert.equal(
      powtorzeniaAkcesorium({ coeff: 1, czesc: "objętość", tydzien: 1, korekta: -3 }),
      3,
    );
  });
});

describe("MROUND i skok kg", () => {
  test("zaokrągla do wielokrotności skoku", () => {
    assert.equal(mround(63.7, 2.5), 62.5);
    assert.equal(mround(64.0, 2.5), 65);
    assert.equal(mround(101.2, 5), 100);
  });

  test("odporne na błąd zmiennoprzecinkowy", () => {
    assert.equal(mround(0.1 + 0.2, 0.1), 0.3);
  });
});

describe("ciężar — cztery reguły (kolumna G)", () => {
  const wspolne = {
    powtorzenia: 8,
    rpe: 8,
    skokKg: 2.5,
    progresja: "kg" as const,
    oneRM: 100,
    trybAkcesoriow: "trzymaj z bloku" as const,
  };

  test("T1: 1RM × %1RM, zaokrąglone do skoku", () => {
    // 100 × 72,5% = 72,5 → skok 2,5 → 72,5
    const wynik = obliczCiezar({ ...wspolne, tydzien: 1, jestBojemGlownym: false, mnoznik: 1 });
    assert.equal(wynik, 72.5);
  });

  test("bój główny zawsze liczy z RPE, nawet w trybie 'trzymaj z bloku'", () => {
    const wynik = obliczCiezar({
      ...wspolne, tydzien: 2, jestBojemGlownym: true, mnoznik: 1.05,
      ciezarBazowy: 50, mnoznikBazowy: 1,
    });
    // Ścieżka RPE: 100 × 72,5% × 1,05 = 76,125 → MROUND 2,5 → 75
    // Dziedziczenie dałoby 50 × 1,05 = 52,5 — inną liczbę, więc test rozróżnia ścieżki.
    assert.equal(wynik, 75);
  });

  test("T2 'trzymaj z bloku': ciężar z T1 przeskalowany stosunkiem mnożników", () => {
    const wynik = obliczCiezar({
      ...wspolne, tydzien: 2, jestBojemGlownym: false, mnoznik: 1.05,
      ciezarBazowy: 60, mnoznikBazowy: 1,
    });
    // 60 × 1,05 / 1 = 63 → MROUND 2,5 → 62,5.
    // Ścieżka RPE dałaby 75, więc test potwierdza, że ciężar naprawdę dziedziczy.
    assert.equal(wynik, 62.5);
  });

  test("T2 'licz z RPE': przelicza od 1RM, ignoruje ciężar bazowy", () => {
    const wynik = obliczCiezar({
      ...wspolne, tydzien: 2, jestBojemGlownym: false, mnoznik: 1.05,
      trybAkcesoriow: "licz z RPE", ciezarBazowy: 60, mnoznikBazowy: 1,
    });
    // Ten sam ciężar bazowy co wyżej, ale tryb "licz z RPE" go ignoruje: 75, nie 62,5.
    assert.equal(wynik, 75);
  });

  test("T4 zawsze przelicza z RPE, nawet w trybie 'trzymaj z bloku'", () => {
    const wynik = obliczCiezar({
      ...wspolne, tydzien: 4, jestBojemGlownym: false, mnoznik: 1,
      ciezarBazowy: 60, mnoznikBazowy: 1,
    });
    assert.equal(wynik, 72.5, "T4 nie dziedziczy — to restart bloku");
  });

  test("T5 dziedziczy z T4, nie z T1", () => {
    assert.equal(tydzienBazowyBloku(2), 1);
    assert.equal(tydzienBazowyBloku(3), 1);
    assert.equal(tydzienBazowyBloku(4), null);
    assert.equal(tydzienBazowyBloku(5), 4);
    assert.equal(tydzienBazowyBloku(6), 4);
  });

  test("komunikat z tygodnia bazowego propaguje się zamiast liczby", () => {
    const wynik = obliczCiezar({
      ...wspolne, tydzien: 2, jestBojemGlownym: false, mnoznik: 1,
      oneRM: 0, ciezarBazowy: "— brak 1RM", mnoznikBazowy: 1,
    });
    assert.equal(wynik, "— brak 1RM");
  });

  test("brak 1RM", () => {
    const wynik = obliczCiezar({ ...wspolne, tydzien: 1, jestBojemGlownym: false, mnoznik: 1, oneRM: 0 });
    assert.equal(wynik, "— brak 1RM");
  });

  test("podmienione ćwiczenie bez ręcznego 1RM", () => {
    const wynik = obliczCiezar({
      ...wspolne, tydzien: 4, jestBojemGlownym: false, mnoznik: 1,
      cwiczenieZmienioneWzgledemT1: true,
    });
    assert.equal(wynik, "— ustaw ręcznie");
  });

  test("podmienione ćwiczenie z ręcznym 1RM liczy normalnie", () => {
    const wynik = obliczCiezar({
      ...wspolne, tydzien: 4, jestBojemGlownym: false, mnoznik: 1,
      cwiczenieZmienioneWzgledemT1: true, oneRMReczny: 100,
    });
    assert.equal(wynik, 72.5);
  });

  test("progresje bezciężarowe zwracają nazwę progresji, nie liczbę", () => {
    for (const progresja of ["masa ciała", "czas", "dystans", "ręczne ustawienie"] as const) {
      const wynik = obliczCiezar({ ...wspolne, tydzien: 1, jestBojemGlownym: false, mnoznik: 1, progresja });
      assert.equal(wynik, progresja);
    }
  });

  test("skok kg nigdy nie schodzi poniżej 0,5", () => {
    const wynik = obliczCiezar({
      ...wspolne, tydzien: 1, jestBojemGlownym: false, mnoznik: 1, skokKg: 0.1, oneRM: 63,
    });
    // 63 × 72,5% = 45,675 → skok 0,5 → 45,5 (nie 45,7)
    assert.equal(wynik, 45.5);
  });

  test("TOP SET liczy z 1 powtórzenia przy własnym RPE", () => {
    // 100 × 86,5% (1 powt. @ RPE 7) = 86,5 → skok 2,5 → 87,5
    assert.equal(obliczCiezarTopSetu({ oneRM: 100, rpe: 7, skokKg: 2.5, progresja: "kg" }), 87.5);
    assert.equal(obliczCiezarTopSetu({ oneRM: 0, rpe: 7, skokKg: 2.5, progresja: "kg" }), "— brak 1RM");
  });
});

describe("model stresu (TABELE!B23:P61)", () => {
  test("trzy osie mają różne charakterystyki — to jest sedno modelu", () => {
    const singiel = stresSlotu({ coeff: 1, serie: 1, rpe: 10, powtorzenia: 1 });
    const wysokie = stresSlotu({ coeff: 1, serie: 1, rpe: 10, powtorzenia: 15 });

    assert.equal(singiel.centralny, 1.8);
    assert.equal(wysokie.centralny, 0.4);
    assert.ok(singiel.centralny > wysokie.centralny * 4, "ciężki singiel kosztuje ośrodkowo");

    assert.equal(singiel.obwodowy, 0.5);
    assert.equal(wysokie.obwodowy, 1.6);
    assert.ok(wysokie.obwodowy > singiel.obwodowy * 3, "wysokie powtórzenia kosztują obwodowo");

    assert.ok(
      Math.abs(singiel.calkowity - wysokie.calkowity) < 0.3,
      "suma całkowita bywa podobna — dlatego sam tonaż niczego nie mówi",
    );
  });

  test("skaluje się przez coeff × serie", () => {
    const s = stresSlotu({ coeff: 0.5, serie: 3, rpe: 8, powtorzenia: 10 });
    assert.deepEqual(s, { calkowity: 1.05, centralny: 0.6, obwodowy: 1.65 });
  });

  test("RPE poza tabelą obcina się do zakresu 5–10", () => {
    const niskie = stresSlotu({ coeff: 1, serie: 1, rpe: 3, powtorzenia: 5 });
    const brzeg = stresSlotu({ coeff: 1, serie: 1, rpe: 5, powtorzenia: 5 });
    assert.deepEqual(niskie, brzeg);
  });
});

describe("bilans tygodnia", () => {
  const sloty = [
    { part: "s" as const, serie: 4, powtorzenia: 6, stres: stresSlotu({ coeff: 1, serie: 4, rpe: 8, powtorzenia: 6 }) },
    { part: "d" as const, serie: 3, powtorzenia: 8, stres: stresSlotu({ coeff: 0.75, serie: 3, rpe: 8, powtorzenia: 8 }) },
    { part: "b" as const, serie: 3, powtorzenia: 10, stres: stresSlotu({ coeff: 0.5, serie: 3, rpe: 8, powtorzenia: 10 }) },
    { part: "c" as const, serie: 3, powtorzenia: 12, stres: stresSlotu({ coeff: 0.25, serie: 3, rpe: 8, powtorzenia: 12 }) },
  ];

  test("dolne = s + d, górne = b + r, core osobno", () => {
    const b = bilansTygodnia(sloty);
    const s = b.wzorce.find((w) => w.part === "s")!;
    const d = b.wzorce.find((w) => w.part === "d")!;
    assert.equal(b.dolne, Math.round((s.calkowity + d.calkowity) * 1e4) / 1e4);
    assert.equal(b.gorne, b.wzorce.find((w) => w.part === "b")!.calkowity, "brak wiosłowania w tym tygodniu");
    assert.equal(b.core, b.wzorce.find((w) => w.part === "c")!.calkowity);
  });

  test("RAZEM obejmuje core", () => {
    const b = bilansTygodnia(sloty);
    assert.ok(Math.abs(b.razem - (b.dolne + b.gorne + b.core)) < 1e-6);
  });

  test("serie i powtórzenia sumują się per wzorzec", () => {
    const b = bilansTygodnia(sloty);
    assert.equal(b.serieRazem, 13);
    assert.equal(b.wzorce.find((w) => w.part === "s")!.powtorzenia, 24);
  });

  test("udziały sumują się do 100%", () => {
    const b = bilansTygodnia(sloty);
    const suma = b.wzorce.reduce((a, w) => a + w.udzial, 0);
    assert.ok(Math.abs(suma - 1) < 1e-6);
  });

  test("pusty tydzień nie dzieli przez zero", () => {
    const b = bilansTygodnia([]);
    assert.equal(b.razem, 0);
    assert.equal(b.wzorce.every((w) => w.udzial === 0), true);
  });
});

describe("normy skalowane liczbą dni (Analiza!K, L)", () => {
  test("stres tygodniowy 12–18 na dzień treningowy", () => {
    assert.equal(ocenaNormy(45, NORMY.stresTygodniowy, 3), "✓ w normie");
    assert.equal(ocenaNormy(30, NORMY.stresTygodniowy, 3), "▼ poniżej");
    assert.equal(ocenaNormy(60, NORMY.stresTygodniowy, 3), "▲ powyżej");
  });

  test("bez dni treningowych ocena nie istnieje", () => {
    assert.equal(ocenaNormy(100, NORMY.stresTygodniowy, 0), "—");
  });

  test("ta sama liczba jest w normie albo poza nią zależnie od liczby dni", () => {
    assert.equal(ocenaNormy(40, NORMY.stresTygodniowy, 3), "✓ w normie");
    assert.equal(ocenaNormy(40, NORMY.stresTygodniowy, 5), "▼ poniżej");
  });
});

describe("katalog BAZY 5.17", () => {
  test("zawiera 164 ćwiczenia", () => {
    assert.equal(katalog.wszystkie.length, 164);
  });

  test("wyszukiwanie po ID i po nazwie", () => {
    assert.equal(katalog.poId("EX-0194")?.nazwa, "Tricep cable pushdown");
    assert.equal(katalog.poNazwie("barbell bench press")?.id, "EX-0011");
  });

  test("filtr kategorii; pusta kategoria = pełna baza", () => {
    assert.equal(katalog.wKategorii("Tricep").length, 9);
    assert.equal(katalog.wKategorii(null).length, 164);
  });

  test("listy robocze zgadzają się z analizą arkusza", () => {
    // Kontrola Analiza!B71 sprawdza tylko prefiks "DO WERYFIKACJI" — łapie 14 pozycji.
    assert.equal(katalog.doWeryfikacji().length, 14);
    // Pełna lista czekających na decyzję to 14 + 2 oznaczone "UZUPEŁNIĆ".
    assert.equal(katalog.wymagajaceDecyzji().length, 16);
    assert.equal(katalog.bezFilmu().length, 26);
  });
});

describe("przeliczenie planu i walidacja", () => {
  function planTestowy(): Plan {
    return {
      nazwa: "test",
      trybAkcesoriow: "trzymaj z bloku",
      czescPlanu: "objętość",
      serieMaksymalne: [{ cwiczenieId: "EX-0011", ciezar: 80, powtorzenia: 5 }],
      sloty: [
        {
          positionId: "D1-S01", dzien: 1, lp: "A1.", cwiczenieId: "EX-0011",
          kategoriaSzkieletu: "Upper push horizontal",
          tygodnie: {
            1: { serie: 6, powtorzenia: 6, rpe: 6.5 },
            2: { serie: 5, powtorzenia: 6, rpe: 7, feedback: "za łatwe" },
            3: { serie: 5, powtorzenia: 5, rpe: 7.5 },
            4: { serie: 4, powtorzenia: 5, rpe: 7.5 },
            5: { serie: 5, powtorzenia: 4, rpe: 8 },
            6: { serie: 4, powtorzenia: 3, rpe: 8 },
          },
        },
        { positionId: "D1-S02", dzien: 1, lp: "B1.", cwiczenieId: "EX-0003", kategoriaSzkieletu: "Core" },
      ],
      topSety: [{ dzien: 1, wlaczony: true, rpe: 7, slotPositionId: "D1-S01" }],
    };
  }

  test("feedback z T2 podnosi ciężar boju głównego w T3", () => {
    const w = przeliczPlan(planTestowy());
    const t2 = w.tygodnie[1]!.sloty.find((s) => s.positionId === "D1-S01")!;
    const t3 = w.tygodnie[2]!.sloty.find((s) => s.positionId === "D1-S01")!;
    assert.equal(t2.mnoznik, 1, "T2 czyta odczucia z T1, których nie ma");
    assert.equal(t3.mnoznik, 1.05, "T3 czyta 'za łatwe' z T2");
  });

  test("akcesorium bez serii maksymalnej daje '— brak 1RM'", () => {
    const w = przeliczPlan(planTestowy());
    const slot = w.tygodnie[0]!.sloty.find((s) => s.positionId === "D1-S02")!;
    assert.equal(slot.ciezar, "— brak 1RM");
  });

  test("TOP SET bierze ćwiczenie ze wskazanego slotu, nie z wiersza poniżej", () => {
    const w = przeliczPlan(planTestowy());
    const top = w.tygodnie[0]!.topSety[0]!;
    assert.equal(top.cwiczenie?.id, "EX-0011");
    assert.equal(typeof top.ciezar, "number");
  });

  test("nadpisanie ciężaru jest jawne i cofalne", () => {
    const plan = planTestowy();
    plan.sloty[0]!.tygodnie![1]!.ciezarOverride = 999;
    const w = przeliczPlan(plan);
    const slot = w.tygodnie[0]!.sloty.find((s) => s.positionId === "D1-S01")!;
    assert.equal(slot.ciezar, 999);
    assert.equal(slot.ciezarNadpisany, true);

    delete plan.sloty[0]!.tygodnie![1]!.ciezarOverride;
    const bezNadpisania = przeliczPlan(plan).tygodnie[0]!.sloty.find((s) => s.positionId === "D1-S01")!;
    assert.equal(bezNadpisania.ciezarNadpisany, false);
    assert.notEqual(bezNadpisania.ciezar, 999);
  });

  test("walidacja blokuje wysyłkę przy braku 1RM", () => {
    const plan = planTestowy();
    const uwagi = sprawdzPlan(plan, przeliczPlan(plan));
    const brak1RM = uwagi.find((u) => u.kod === "BRAK_1RM")!;
    assert.ok(brak1RM.pozycje.length > 0);
    assert.equal(planGotowyDoWyslania(uwagi), false);
  });

  test("walidator wykrywa niezgodność ze szkieletem", () => {
    const plan = planTestowy();
    plan.sloty[1]!.kategoriaSzkieletu = "Bicep"; // EX-0003 to Core
    const uwagi = sprawdzPlan(plan, przeliczPlan(plan));
    assert.deepEqual(uwagi.find((u) => u.kod === "NIEZGODNY_ZE_SZKIELETEM")?.pozycje, ["D1-S02"]);
  });

  test("walidator powtórek z poprzedniego cyklu — czego arkusz nie umie", () => {
    const plan = planTestowy();
    const uwagi = sprawdzPlan(plan, przeliczPlan(plan), {
      cwiczeniaZPoprzedniegoCyklu: ["EX-0011"],
    });
    const powtorka = uwagi.find((u) => u.kod === "POWTORKA_Z_POPRZEDNIEGO")!;
    assert.equal(powtorka.pozycje.length, 1);
    assert.match(powtorka.pozycje[0]!, /Barbell bench press/);
  });

  test("dni treningowe liczą się z wypełnionych slotów", () => {
    assert.equal(przeliczPlan(planTestowy()).dniTreningowe, 1);
  });
});
