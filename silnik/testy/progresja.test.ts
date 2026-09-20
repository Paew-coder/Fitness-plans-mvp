/**
 * Progresja z szablonu 5.18.
 *
 * Liczby w `progresja.ts` nie są niczyim pomysłem — zostały odczytane
 * z arkusza. Te testy pilnują, żeby nikt ich po drodze nie „poprawił",
 * i żeby wypełnianie planu nie kasowało tego, co należy do klienta.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import type { Plan } from "../src/plan.ts";
import { przeliczPlan } from "../src/plan.ts";
import {
  PROGRESJA_BOJU, RPE_AKCESORIUM, SERIE_AKCESORIUM,
  progresjaSlotu, skopiujTydzien, zastosujProgresje,
} from "../src/progresja.ts";

function planTestowy(): Plan {
  const LP = ["A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2.", "E1.", "E2.", "", "", ""];
  const sloty = [];
  for (let dzien = 1; dzien <= 5; dzien++) {
    for (let poz = 1; poz <= 12; poz++) {
      sloty.push({
        positionId: `D${dzien}-S${String(poz).padStart(2, "0")}`,
        dzien, lp: LP[poz - 1] ?? "",
        cwiczenieId: dzien === 1 && poz <= 7
          ? ["EX-0010", "EX-0016", "EX-0003", "EX-0011", "EX-0012", "EX-0042", "EX-0029"][poz - 1]!
          : null,
        kategoriaSzkieletu: null,
        tygodnie: {} as Plan["sloty"][number]["tygodnie"],
      });
    }
  }
  return {
    nazwa: "test", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [{ cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 1 }],
    sloty,
    topSety: [1, 2, 3, 4, 5].map((dzien) => ({
      dzien, wlaczony: true, rpe: 7, slotPositionId: `D${dzien}-S01`,
    })),
  };
}

const slot = (plan: Plan, positionId: string) => plan.sloty.find((s) => s.positionId === positionId)!;

describe("progresja — liczby zgodne z szablonem 5.18", () => {
  test("bój główny idzie blokiem: objętość w dół, intensywność w górę", () => {
    // Odczytane z „Szablon 3 dni, 3 złożone cz.1", Day I, sześć tygodni.
    assert.deepEqual(PROGRESJA_BOJU["objętość"], [
      { serie: 6, powtorzenia: 6, rpe: 6.5 },
      { serie: 5, powtorzenia: 6, rpe: 7 },
      { serie: 5, powtorzenia: 5, rpe: 7 },
      { serie: 4, powtorzenia: 5, rpe: 7.5 },
      { serie: 5, powtorzenia: 4, rpe: 7.5 },
      { serie: 6, powtorzenia: 3, rpe: 7.5 },
    ]);
  });

  test("drugi cykl ma własną progresję boju — to jest cz.2 z arkusza", () => {
    /*
     * Dotąd aplikacja znała tylko cz.1, więc kontynuacja wychodziła
     * z liczbami pierwszego cyklu: te same 6×6 na RPE 6,5, mimo że klient
     * ma już za sobą sześć tygodni i wyższy 1RM. W arkuszu cz.2 zaczyna
     * od czwórek i kończy na dwójkach.
     *
     * Liczby z „Szablon - 3 dni, 3 złożone cz.2", Day I; ten sam bój stoi
     * w „3 dni, 6 złożonych, 6 akcesoriów cz.2".
     */
    assert.deepEqual(PROGRESJA_BOJU["intensywność"], [
      { serie: 6, powtorzenia: 4, rpe: 7 },
      { serie: 6, powtorzenia: 4, rpe: 7 },
      { serie: 5, powtorzenia: 4, rpe: 7.5 },
      { serie: 5, powtorzenia: 3, rpe: 7.5 },
      { serie: 5, powtorzenia: 3, rpe: 8 },
      { serie: 6, powtorzenia: 2, rpe: 8 },
    ]);
  });

  test("przełącznik części planu zmienia bój, nie tylko akcesoria", () => {
    assert.deepEqual(progresjaSlotu("A1.", 1, 1), { serie: 6, powtorzenia: 6, rpe: 6.5 },
      "bez podania części planu zostaje objętość — tak było do tej pory");
    assert.deepEqual(progresjaSlotu("A1.", 1, 1, "objętość"), { serie: 6, powtorzenia: 6, rpe: 6.5 });
    assert.deepEqual(progresjaSlotu("A1.", 1, 1, "intensywność"), { serie: 6, powtorzenia: 4, rpe: 7 });
    assert.deepEqual(progresjaSlotu("A1.", 6, 1, "intensywność"), { serie: 6, powtorzenia: 2, rpe: 8 });
    // Akcesorium części planu w tym miejscu nie czyta — powtórzenia liczy
    // automat, a on ma ją osobno.
    assert.deepEqual(progresjaSlotu("B1.", 1, 0.5, "intensywność"), { serie: 3, rpe: 8 });
  });

  test("akcesorium: trzy serie, RPE 8 w pierwszym bloku i 9 w drugim", () => {
    assert.deepEqual(progresjaSlotu("B1.", 1), { serie: SERIE_AKCESORIUM, rpe: RPE_AKCESORIUM.blokI });
    assert.deepEqual(progresjaSlotu("B1.", 3), { serie: 3, rpe: 8 });
    assert.deepEqual(progresjaSlotu("B1.", 4), { serie: 3, rpe: 9 }, "T4 otwiera drugi blok");
    assert.deepEqual(progresjaSlotu("B1.", 6), { serie: 3, rpe: 9 });
  });

  test("C2 i D2 chodzą o stopień wyżej, B2 nie — tak jest w arkuszu", () => {
    assert.equal(progresjaSlotu("C2.", 1).rpe, 9);
    assert.equal(progresjaSlotu("D2.", 4).rpe, 10);
    assert.equal(progresjaSlotu("B2.", 1).rpe, 8, "B2 zostaje na ósemce");
  });

  test("akcesorium nie dostaje powtórzeń — liczy je automat", () => {
    assert.equal(progresjaSlotu("C1.", 2).powtorzenia, undefined);
    assert.equal(progresjaSlotu("A1.", 2, 1).powtorzenia, 6);
  });

  test("bojem głównym jest ćwiczenie złożone, nie samo miejsce w tabeli", () => {
    /*
     * Zgłoszone z używania: „SLDL balance" wstawiony jako pierwszy w dniu
     * dostawał progresję bloku i TOP SET. W BAZIE ma coeff 0,25 i progresję
     * „ręczne ustawienie" — 6 serii po 6 powtórzeń na RPE 6,5 jest dla niego
     * poleceniem bez sensu. Arkusz rozstrzygał miejscem w tabeli, bo trener
     * po prostu nie wstawiał tam takich rzeczy; aplikacja pozwala, więc musi
     * patrzeć na ćwiczenie.
     */
    assert.deepEqual(progresjaSlotu("A1.", 1, 1), { serie: 6, powtorzenia: 6, rpe: 6.5 });
    assert.deepEqual(progresjaSlotu("A1.", 1, 0.25), { serie: 3, rpe: 8 });
    assert.deepEqual(progresjaSlotu("A1.", 1, 0.75), { serie: 3, rpe: 8 });
  });
});

describe("progresja — wypełnianie planu", () => {
  test("wypełnia wszystkie sześć tygodni, tylko tam, gdzie stoi ćwiczenie", () => {
    const plan = zastosujProgresje(planTestowy());
    const boj = slot(plan, "D1-S01");
    assert.deepEqual(boj.tygodnie![1], { serie: 6, powtorzenia: 6, rpe: 6.5 });
    assert.deepEqual(boj.tygodnie![6], { serie: 6, powtorzenia: 3, rpe: 7.5 });
    assert.deepEqual(slot(plan, "D1-S02").tygodnie![4], { serie: 3, rpe: 9 });
    assert.deepEqual(slot(plan, "D1-S08").tygodnie, {}, "pusty slot zostaje pusty");
  });

  test("odczucia klienta i nadpisany ciężar zostają nietknięte", () => {
    const wejscie = planTestowy();
    wejscie.sloty[0]!.tygodnie = {
      1: { serie: 99, rpe: 5, feedback: "za trudne" },
      2: { ciezarOverride: 123 },
    };
    const plan = zastosujProgresje(wejscie);
    const boj = slot(plan, "D1-S01");

    assert.equal(boj.tygodnie![1]!.feedback, "za trudne", "odczucie należy do wykonanego treningu");
    assert.equal(boj.tygodnie![1]!.serie, 6, "ale szkielet planu wypełnia się na nowo");
    assert.equal(boj.tygodnie![2]!.ciezarOverride, 123, "ręczny ciężar zostaje");
  });

  test("oryginalny plan zostaje nietknięty", () => {
    const wejscie = planTestowy();
    zastosujProgresje(wejscie);
    assert.deepEqual(wejscie.sloty[0]!.tygodnie, {});
  });

  test("plan po wypełnieniu liczy się normalnie", () => {
    const wynik = przeliczPlan(zastosujProgresje(planTestowy()));
    const t1 = wynik.tygodnie[0]!.sloty.find((s) => s.positionId === "D1-S01")!;
    assert.equal(t1.serie, 6);
    assert.equal(t1.rpe, 6.5);
    assert.ok(typeof t1.ciezar === "number" && t1.ciezar > 0, `ciężar: ${t1.ciezar}`);
    // Szósty tydzień: mniej powtórzeń przy wyższym RPE musi dać większy ciężar.
    const t6 = wynik.tygodnie[5]!.sloty.find((s) => s.positionId === "D1-S01")!;
    assert.ok((t6.ciezar as number) > (t1.ciezar as number), `${t1.ciezar} → ${t6.ciezar}`);
  });
});

describe("progresja — kopiowanie tygodnia", () => {
  test("rozprowadza parametry źródłowego tygodnia na pozostałe", () => {
    const wejscie = planTestowy();
    wejscie.sloty[1]!.tygodnie = { 1: { serie: 4, powtorzenia: 12, rpe: 7 } };
    const plan = skopiujTydzien(wejscie, 1);

    for (const t of [2, 3, 4, 5, 6] as const) {
      assert.deepEqual(slot(plan, "D1-S02").tygodnie![t], { serie: 4, powtorzenia: 12, rpe: 7 },
        `tydzień ${t}`);
    }
  });

  test("nie kopiuje odczuć ani nadpisanego ciężaru", () => {
    const wejscie = planTestowy();
    wejscie.sloty[1]!.tygodnie = {
      1: { serie: 4, rpe: 7, feedback: "za łatwe", ciezarOverride: 50 },
      3: { feedback: "za trudne" },
    };
    const plan = skopiujTydzien(wejscie, 1);
    const s = slot(plan, "D1-S02");

    assert.equal(s.tygodnie![2]!.feedback, undefined, "odczucie z T1 nie jedzie do T2");
    assert.equal(s.tygodnie![2]!.ciezarOverride, undefined);
    assert.equal(s.tygodnie![3]!.feedback, "za trudne", "cudze odczucie zostaje na miejscu");
    assert.equal(s.tygodnie![3]!.serie, 4, "a szkielet i tak się nadpisuje");
    assert.equal(s.tygodnie![1]!.feedback, "za łatwe", "źródłowy tydzień bez zmian");
  });
});

describe("plan, którego trener nie wypełnił", () => {
  /**
   * Zgłoszone z prawdziwego użycia, nie wymyślone.
   *
   * Trener wybrał ćwiczenia, wysłał plan i otworzył go na tablecie. Bój główny
   * pokazał `1 × 6` — jedną serię. Silnik miał w tym miejscu liczby wzięte
   * znikąd: jedna seria i sześć powtórzeń dla boju, trzy serie i RPE 8 dla
   * reszty. Dla akcesoriów wychodziło to przypadkiem na szablon, dla boju —
   * nie: szablon mówi w T1 sześć serii po sześć powtórzeń na RPE 6,5.
   *
   * Dla klienta nie ma czegoś takiego jak „wartość domyślna". Na jego telefonie
   * każda liczba jest poleceniem do wykonania.
   */
  test("bój główny nigdy nie schodzi do jednej serii", () => {
    const wynik = przeliczPlan(planTestowy());
    for (const t of wynik.tygodnie) {
      const boj = t.sloty.find((s) => s.lp === "A1." && s.cwiczenie)!;
      assert.equal(boj.serie, PROGRESJA_BOJU["objętość"][t.tydzien - 1]!.serie,
        `T${t.tydzien}: bój główny ma ${boj.serie} serii zamiast szablonowych`);
      assert.ok(boj.serie >= 4, `T${t.tydzien}: ${boj.serie} serii to nie jest plan`);
    }
  });

  test("cykl na intensywność liczy bój z drugiej kolumny szablonu", () => {
    // Droga, którą trener idzie naprawdę: zakłada nowy cykl z poprzedniego,
    // przestawia część planu i nic nie wpisuje. Bój ma wtedy wyjść z cz.2.
    const plan = { ...planTestowy(), czescPlanu: "intensywność" as const };
    const wynik = przeliczPlan(plan);
    const boj = (t: number) => wynik.tygodnie[t - 1]!.sloty.find((x) => x.lp === "A1." && x.cwiczenie)!;
    assert.equal(`${boj(1).serie}×${boj(1).powtorzenia}@${boj(1).rpe}`, "6×4@7");
    assert.equal(`${boj(6).serie}×${boj(6).powtorzenia}@${boj(6).rpe}`, "6×2@8");
    // Ciężar idzie za tym sam: mniej powtórzeń przy wyższym RPE to wyższy %1RM.
    const naObjetosc = przeliczPlan(planTestowy());
    assert.ok((boj(6).ciezar as number) > (naObjetosc.tygodnie[5]!.sloty
      .find((x) => x.lp === "A1." && x.cwiczenie)!.ciezar as number),
      "T6 na intensywność musi być cięższe niż T6 na objętość");
  });

  test("przycisk progresji niczego nie zmienia — tylko pokazuje", () => {
    // Najmocniejsza postać tej samej zasady: liczba niewpisana i liczba
    // wpisana przyciskiem mają być tą samą liczbą. Gdy się rozjadą, trener
    // widzi w konsoli co innego niż klient na telefonie — a to jest dokładnie
    // ta pułapka, przez którą arkusz pokazywał kiedyś inne ciężary niż konsola.
    zgodneObiePlany(planTestowy());
    // To samo dla kontynuacji — przycisk musi znać tę samą kolumnę szablonu,
    // co automat. Gdyby znał tylko cz.1, kliknięcie zmieniłoby plan zamiast
    // go pokazać, i to po cichu.
    zgodneObiePlany({ ...planTestowy(), czescPlanu: "intensywność" });
  });

  function zgodneObiePlany(wejscie: Plan): void {
    const goly = przeliczPlan(wejscie);
    const wypelniony = przeliczPlan(zastosujProgresje(wejscie));

    for (const [i, t] of goly.tygodnie.entries()) {
      for (const s of t.sloty) {
        if (!s.cwiczenie) continue;
        const po = wypelniony.tygodnie[i]!.sloty.find((x) => x.positionId === s.positionId)!;
        assert.deepEqual(
          { serie: s.serie, powtorzenia: s.powtorzenia, rpe: s.rpe, ciezar: s.ciezar },
          { serie: po.serie, powtorzenia: po.powtorzenia, rpe: po.rpe, ciezar: po.ciezar },
          `T${t.tydzien} ${s.lp} ${s.cwiczenie.nazwa}`);
      }
    }
  }

  test("wpisana liczba zawsze wygrywa z szablonem", () => {
    // Druga strona umowy: szablon jest podkładem, nie nadpisywaczem.
    const plan = planTestowy();
    plan.sloty.find((s) => s.positionId === "D1-S01")!.tygodnie = {
      1: { serie: 2, powtorzenia: 12, rpe: 9 },
    } as Plan["sloty"][number]["tygodnie"];

    const boj = przeliczPlan(plan).tygodnie[0]!.sloty.find((s) => s.lp === "A1.")!;
    assert.equal(boj.serie, 2);
    assert.equal(boj.powtorzenia, 12);
    assert.equal(boj.rpe, 9);
  });
});

describe("kopiowanie tygodnia na jedno ćwiczenie", () => {
  /**
   * Kopiowanie obejmowało kiedyś cały plan. Trener sprawdził, co to robi,
   * i nazwał rzecz po imieniu: rozniesienie jednego tygodnia na pozostałe
   * to sześć identycznych tygodni, czyli blok bez progresji. Dla jednego
   * ćwiczenia bywa potrzebne; dla całego cyklu nie ma zastosowania.
   */
  test("rusza wskazane ćwiczenie i zostawia resztę", () => {
    const plan = zastosujProgresje(planTestowy());
    const wynik = skopiujTydzien(plan, 1, "D1-S01");

    const boj = slot(wynik, "D1-S01");
    for (const t of [2, 3, 4, 5, 6] as const) {
      assert.deepEqual(boj.tygodnie![t], boj.tygodnie![1],
        `T${t} boju głównego miał dostać parametry z T1`);
    }

    // Sąsiad z tego samego dnia ma zostać przy swojej progresji.
    const sasiad = slot(wynik, "D1-S02");
    assert.notDeepEqual(sasiad.tygodnie![4], sasiad.tygodnie![1],
      "akcesorium nie miało być ruszone — drugi blok ma inne RPE");
    assert.deepEqual(sasiad.tygodnie, slot(plan, "D1-S02").tygodnie);
  });

  test("bez wskazania rusza cały plan — i dlatego konsola tego nie robi", () => {
    // Zachowanie zostaje w silniku, ale droga przez API wymaga wskazania
    // ćwiczenia. Ten test pilnuje, żeby różnica między jednym a drugim
    // była widoczna, a nie domyślna.
    const plan = zastosujProgresje(planTestowy());
    const wszystko = skopiujTydzien(plan, 1);
    const sasiad = slot(wszystko, "D1-S02");
    assert.deepEqual(sasiad.tygodnie![4], sasiad.tygodnie![1]);
  });

  test("oceny klienta przeżywają kopiowanie jednego ćwiczenia", () => {
    const plan = zastosujProgresje(planTestowy());
    slot(plan, "D1-S01").tygodnie![2] = {
      ...slot(plan, "D1-S01").tygodnie![2], feedback: "za łatwe",
    };
    const wynik = skopiujTydzien(plan, 1, "D1-S01");
    assert.equal(slot(wynik, "D1-S01").tygodnie![2]!.feedback, "za łatwe");
  });
});
