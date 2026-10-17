/**
 * Testy warstwy AI — bez ani jednego zapytania do sieci.
 *
 * Sprawdzamy dokładnie to, co da się sprawdzić bez modelu, a co decyduje
 * o tym, czy funkcja jest bezpieczna:
 *   · zapytanie ma poprawny kształt i nie wynosi z aplikacji niczego zbędnego,
 *   · schematy mieszczą się w tym, co przyjmuje structured outputs,
 *   · odpowiedź modelu przechodzi weryfikację katalogiem, zanim cokolwiek zobaczy,
 *   · wstawienie propozycji nie dotyka ani jednej liczby.
 *
 * Tego, czy model dobiera ćwiczenia sensownie, testem się nie sprawdzi —
 * od tego jest trener i przycisk „Odrzuć".
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { katalog } from "../../silnik/src/katalog.ts";
import { przeliczPlan } from "../../silnik/src/plan.ts";
import { pustyPlan } from "../uklad-planu.ts";
import { cialoZapytania, MODEL, stan } from "../ai/klient.ts";
import { sprawdzSchemat } from "../ai/schemat.ts";
import { sygnalZdrowotny, INSTRUKCJA_ZDROWOTNA } from "../ai/sygnaly.ts";
import {
  iluNadpisze, katalogDoPromptu, MAX_CWICZEN_W_DNIU, promptSystemowy, przeliczPropozycje,
  SCHEMAT_SZKIELETU, wiadomosc, zastosujPropozycje, zlozPropozycje,
  type Propozycja, type WejscieSzkieletu,
} from "../ai/szkielet.ts";
import { raportLiczbowy, SCHEMAT_ANALIZY, uporzadkuj } from "../ai/analiza.ts";

const WEJSCIE: WejscieSzkieletu = {
  cel: "siła w przysiadzie", staz: "3 lata", dniWTygodniu: 2,
  sprzet: "sztanga, hantle, wyciąg", notatka: "",
};
const PUSTY_KONTEKST = { poprzednieCwiczenia: [] as string[] };

/** Skrót do budowania odpowiedzi modelu w kształcie, który wiąże schemat. */
function surowa(dni: { dzien: number; nazwa: string; cwiczenia: unknown[] }[]) {
  return { dni, uzasadnienie: "Dwa dni, przysiad i wyciskanie." } as never;
}
function poz(cwiczenieId: string, nazwa: string, kategoria: string, powod = "bo tak") {
  return { cwiczenieId, nazwa, kategoria, powod };
}

describe("AI — stan i kształt zapytania", () => {
  test("bez klucza funkcja jest wyłączona, nie zepsuta", () => {
    const byl = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const s = stan();
      assert.equal(s.dostepna, false);
      assert.match(s.powod!, /ANTHROPIC_API_KEY/);
      assert.equal(s.model, MODEL, "model podajemy nawet wtedy, gdy nie ma klucza");
    } finally {
      if (byl !== undefined) process.env.ANTHROPIC_API_KEY = byl;
    }
  });

  test("z kluczem funkcja jest dostępna", () => {
    const byl = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "testowy-klucz";
    try {
      assert.equal(stan().dostepna, true);
    } finally {
      if (byl === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = byl;
    }
  });

  test("ciało zapytania nie zawiera parametrów, które ten model odrzuca", () => {
    const c = cialoZapytania({
      system: [{ type: "text", text: "zasady" }],
      wiadomosc: "brief",
      schemat: SCHEMAT_SZKIELETU,
      wysilek: "high",
    });

    assert.equal(c.model, MODEL);
    // `temperature`, `top_p`, `top_k` i `thinking.budget_tokens` kończą się
    // błędem 400 na tym modelu. Prefill odpowiedzi asystenta — tak samo.
    for (const zakazane of ["temperature", "top_p", "top_k", "thinking", "output_format"]) {
      assert.ok(!(zakazane in c), `${zakazane} nie może trafić do zapytania`);
    }
    const wiadomosci = c.messages as { role: string }[];
    assert.equal(wiadomosci.length, 1);
    assert.equal(wiadomosci[0]!.role, "user", "ostatnia tura nie może być prefillem asystenta");
    assert.deepEqual(
      (c.output_config as { effort: string; format: { type: string } }).format.type,
      "json_schema",
    );
    assert.equal((c.output_config as { effort: string }).effort, "high");
  });

  test("bez schematu nie prosimy o JSON", () => {
    const c = cialoZapytania({ system: [{ type: "text", text: "x" }], wiadomosc: "y" });
    assert.ok(!("format" in (c.output_config as object)));
  });
});

describe("AI — schematy mieszczą się w tym, co przyjmuje API", () => {
  test("schemat szkieletu jest poprawny", () => {
    assert.deepEqual(sprawdzSchemat(SCHEMAT_SZKIELETU), []);
  });

  test("schemat analizy jest poprawny", () => {
    assert.deepEqual(sprawdzSchemat(SCHEMAT_ANALIZY), []);
  });

  test("walidator wyłapuje to, czego API nie przyjmuje", () => {
    const zly = {
      type: "object",
      properties: { ile: { type: "integer", minimum: 1 }, kto: { type: "string" } },
      required: ["ile"],
    };
    const problemy = sprawdzSchemat(zly);
    assert.ok(problemy.some((p) => p.includes("minimum")));
    assert.ok(problemy.some((p) => p.includes("additionalProperties")));
    assert.ok(problemy.some((p) => p.includes("kto")), "pole spoza required to problem");
  });
});

describe("AI — sygnał zdrowotny", () => {
  test("łapie ból, kontuzję i leczenie", () => {
    for (const tekst of [
      "od miesiąca ból barku przy wyciskaniu",
      "wraca po kontuzji ACL",
      "rehabilitacja po operacji kolana",
      "przepuklina L4/L5, zakaz zginania",
      "drętwieje mu ręka przy podciąganiu",
      "lekarz odradził skoki",
    ]) {
      assert.equal(sygnalZdrowotny(tekst).wykryty, true, `nie wykryto: „${tekst}"`);
    }
  });

  test("nie podnosi się na zwykłej notatce treningowej", () => {
    for (const tekst of [
      "chce podnieść przysiad o 10 kg",
      "trenuje trzy razy w tygodniu, lubi hantle",
      "wraca po urlopie, dwa tygodnie przerwy",
      "",
    ]) {
      assert.equal(sygnalZdrowotny(tekst).wykryty, false, `fałszywy alarm: „${tekst}"`);
    }
  });

  test("pokazuje słowo razem z sąsiadem, żeby dało się je zrozumieć", () => {
    assert.deepEqual(sygnalZdrowotny("ból barku po wyciskaniu").slowa, ["bol barku"]);
  });

  test("sygnał dokłada instrukcję do promptu", () => {
    const zSygnalem = wiadomosc({ ...WEJSCIE, notatka: "ból łokcia" }, PUSTY_KONTEKST);
    const bez = wiadomosc({ ...WEJSCIE, notatka: "lubi hantle" }, PUSTY_KONTEKST);
    assert.ok(zSygnalem.includes(INSTRUKCJA_ZDROWOTNA));
    assert.ok(!bez.includes(INSTRUKCJA_ZDROWOTNA));
  });
});

describe("AI — co wychodzi z aplikacji", () => {
  test("brief zawiera to, co trener wpisał, i nic o kliencie", () => {
    const tekst = wiadomosc(
      { ...WEJSCIE, notatka: "boi się martwego ciągu" },
      { poprzednieCwiczenia: ["EX-0010"] },
    );
    assert.ok(tekst.includes("siła w przysiadzie"));
    assert.ok(tekst.includes("sztanga, hantle, wyciąg"));
    assert.ok(tekst.includes("Barbell back squat"), "poprzedni cykl idzie nazwami");
    assert.ok(!/klient[a-ząćęłńóśżź]*\s+[A-ZŁŚŻ]/.test(tekst), "żadnego nazwiska w zapytaniu");
  });

  test("katalog leci w całości i z oznaczeniem cache", () => {
    const bloki = promptSystemowy();
    const katalogowy = bloki.at(-1)!;
    assert.deepEqual(katalogowy.cache_control, { type: "ephemeral" });
    assert.ok(katalogowy.text.includes(`${katalog.wszystkie.length} pozycji`));
    for (const c of katalog.wszystkie) {
      assert.ok(katalogowy.text.includes(c.id), `${c.id} nie trafiło do promptu`);
    }
  });

  test("wiersz katalogu niesie to, czego model potrzebuje do doboru", () => {
    const wiersz = katalogDoPromptu().split("\n").find((l) => l.startsWith("EX-0010"))!;
    assert.equal(wiersz, "EX-0010|Barbell back squat|Lower push|s|1|kg");
  });
});

describe("AI — weryfikacja propozycji katalogiem", () => {
  test("nieistniejące ID wypada, a trener się o tym dowiaduje", () => {
    const p = zlozPropozycje(
      surowa([{
        dzien: 1, nazwa: "Dolny", cwiczenia: [
          poz("EX-0010", "Barbell back squat", "Lower push"),
          poz("EX-9999", "Ćwiczenie z kosmosu", "Core"),
        ],
      }]),
      { ...WEJSCIE, dniWTygodniu: 1 }, PUSTY_KONTEKST,
    );
    assert.equal(p.dni[0]!.cwiczenia.length, 1);
    assert.ok(p.uwagi.some((u) => u.includes("nie istnieje w katalogu")));
  });

  test("poprawna nazwa ratuje literówkę w ID", () => {
    const p = zlozPropozycje(
      surowa([{ dzien: 1, nazwa: "Dolny", cwiczenia: [poz("EX-10", "Barbell back squat", "Lower push")] }]),
      { ...WEJSCIE, dniWTygodniu: 1 }, PUSTY_KONTEKST,
    );
    assert.equal(p.dni[0]!.cwiczenia[0]!.cwiczenieId, "EX-0010");
  });

  test("kategoria pochodzi z katalogu, nie z odpowiedzi modelu", () => {
    const p = zlozPropozycje(
      surowa([{ dzien: 1, nazwa: "Dolny", cwiczenia: [poz("EX-0010", "Barbell back squat", "Core")] }]),
      { ...WEJSCIE, dniWTygodniu: 1 }, PUSTY_KONTEKST,
    );
    assert.equal(p.dni[0]!.cwiczenia[0]!.kategoria, "Lower push");
    assert.ok(p.uwagi.some((u) => u.includes("zostaje katalogowa")));
  });

  test("to samo ćwiczenie dwa razy w dniu zostaje raz", () => {
    const p = zlozPropozycje(
      surowa([{
        dzien: 1, nazwa: "Dolny", cwiczenia: [
          poz("EX-0010", "Barbell back squat", "Lower push"),
          poz("EX-0010", "Barbell back squat", "Lower push"),
        ],
      }]),
      { ...WEJSCIE, dniWTygodniu: 1 }, PUSTY_KONTEKST,
    );
    assert.equal(p.dni[0]!.cwiczenia.length, 1);
    assert.ok(p.uwagi.some((u) => u.includes("powtórzone w tym samym dniu")));
  });

  test("nadmiar pozycji i nadmiar dni jest przycinany", () => {
    const duzo = Array.from({ length: MAX_CWICZEN_W_DNIU + 3 }, (_, i) =>
      poz(katalog.wszystkie[i]!.id, katalog.wszystkie[i]!.nazwa, katalog.wszystkie[i]!.kategoria));
    const p = zlozPropozycje(
      surowa([
        { dzien: 1, nazwa: "A", cwiczenia: duzo },
        { dzien: 2, nazwa: "B", cwiczenia: [poz("EX-0011", "Barbell bench press", "Upper push horizontal")] },
        { dzien: 3, nazwa: "C", cwiczenia: [poz("EX-0016", "Barbell row", "Upper pull horizontal")] },
      ]),
      { ...WEJSCIE, dniWTygodniu: 2 }, PUSTY_KONTEKST,
    );
    assert.equal(p.dni.length, 2, "zamówione były dwa dni");
    assert.equal(p.dni[0]!.cwiczenia.length, MAX_CWICZEN_W_DNIU);
    assert.ok(p.uwagi.some((u) => u.includes("3 dni zamiast 2")));
    assert.ok(p.uwagi.some((u) => u.includes("reszta odcięta")));
  });

  test("dni numerują się po kolei, niezależnie od tego, co przysłał model", () => {
    const p = zlozPropozycje(
      surowa([
        { dzien: 4, nazwa: "A", cwiczenia: [poz("EX-0010", "Barbell back squat", "Lower push")] },
        { dzien: 9, nazwa: "B", cwiczenia: [poz("EX-0011", "Barbell bench press", "Upper push horizontal")] },
      ]),
      WEJSCIE, PUSTY_KONTEKST,
    );
    assert.deepEqual(p.dni.map((d) => d.dzien), [1, 2]);
    assert.equal(p.dni[1]!.cwiczenia[0]!.positionId, "D2-S01");
    assert.equal(p.dni[0]!.cwiczenia[0]!.lp, "A1.");
  });

  test("powtórka z poprzedniego cyklu i pozycja do weryfikacji dostają znacznik", () => {
    const p = zlozPropozycje(
      surowa([{
        dzien: 1, nazwa: "A", cwiczenia: [
          poz("EX-0010", "Barbell back squat", "Lower push"),
          poz("EX-0056", "Dips", "Upper push horizontal"),
        ],
      }]),
      { ...WEJSCIE, dniWTygodniu: 1 }, { poprzednieCwiczenia: ["EX-0010"] },
    );
    assert.ok(p.dni[0]!.cwiczenia[0]!.znaczniki.includes("było w poprzednim cyklu"));
    assert.ok(p.dni[0]!.cwiczenia[1]!.znaczniki.includes("do weryfikacji w bazie"));
  });

  test("brakujące wzorce ruchu są wypisane po nazwie", () => {
    const p = zlozPropozycje(
      surowa([{ dzien: 1, nazwa: "A", cwiczenia: [poz("EX-0010", "Barbell back squat", "Lower push")] }]),
      { ...WEJSCIE, dniWTygodniu: 1 }, PUSTY_KONTEKST,
    );
    const braki = p.uwagi.find((u) => u.startsWith("Bez żadnej pozycji"))!;
    assert.ok(braki.includes("martwy ciąg"));
    assert.ok(braki.includes("wyciskanie"));
    assert.ok(!braki.includes("przysiad"), "przysiad jest w planie");
  });

  test("propozycja z przeglądarki przechodzi tę samą weryfikację", () => {
    const podrobiona = {
      dni: [{
        dzien: 1, nazwa: "Podrobiony", cwiczenia: [
          { lp: "A1.", positionId: "D1-S01", cwiczenieId: "EX-NIE-MA", nazwa: "?", kategoria: "Core", powod: "", znaczniki: [] },
          { lp: "B1.", positionId: "D1-S02", cwiczenieId: "EX-0010", nazwa: "Barbell back squat", kategoria: "Bicep", powod: "", znaczniki: [] },
        ],
      }],
      uzasadnienie: "", uwagi: [], sygnal: { wykryty: false, slowa: [] },
    } as unknown as Propozycja;

    const p = przeliczPropozycje(podrobiona, PUSTY_KONTEKST);
    assert.equal(p.dni[0]!.cwiczenia.length, 1);
    assert.equal(p.dni[0]!.cwiczenia[0]!.kategoria, "Lower push", "kategoria z katalogu, nie z żądania");
    assert.equal(p.dni[0]!.cwiczenia[0]!.lp, "A1.", "numeracja liczy się od nowa");
  });
});

describe("AI — odpowiedź, która nie ma kształtu propozycji", () => {
  /**
   * Odpowiedź modelu przychodzi w narzuconym schemacie, więc **powinna** mieć
   * właściwy kształt. Ale cała ta funkcja istnieje po to, żeby modelowi nie
   * ufać — a jednak sama zakładała, że przynajmniej kształt się zgadza:
   * `null` i `dni` jako tekst kończyły się wyjątkiem, czyli piątką z serwera
   * zamiast zdania po polsku. Zły kształt to „model nic sensownego nie
   * przysłał", a nie awaria konsoli.
   */
  const wejscie = { cel: "siła", staz: "średni", dniWTygodniu: 3, sprzet: "siłownia", uwagi: "" } as any;
  const kontekst = { poprzednieCwiczenia: [] } as any;

  for (const [opis, surowa] of [
    ["null", null],
    ["tekst zamiast obiektu", "cokolwiek"],
    ["tablica zamiast obiektu", [1, 2, 3]],
    ["obiekt bez dni", {}],
    ["dni jako tekst", { dni: "nie" }],
    ["dni jako lista pustek", { dni: [null, null] }],
    ["dzień bez listy ćwiczeń", { dni: [{}] }],
    ["ćwiczenia jako tekst", { dni: [{ cwiczenia: "nie" }] }],
  ] as [string, any][]) {
    test(`${opis} — propozycja pusta, bez wyjątku`, () => {
      const wynik = zlozPropozycje(surowa, wejscie, kontekst);
      assert.equal(wynik.dni.length, 0);
      assert.ok(wynik.uwagi.length > 0, "trener musi się dowiedzieć, że nic nie wyszło");
    });
  }

  test("lawina uwag jest przycięta do czytelnej listy", () => {
    // Tysiąc pozycji w jednym dniu dawało tysiąc linijek „powtórzone" — listę,
    // której nikt nie przejrzy, i odpowiedź kilkadziesiąt razy większą od
    // samej propozycji.
    const zalew = {
      dni: [{ cwiczenia: Array.from({ length: 1000 }, () => ({ cwiczenieId: "EX-0010" })) }],
    } as any;
    const wynik = zlozPropozycje(zalew, wejscie, kontekst);
    assert.ok(wynik.uwagi.length <= 21, `${wynik.uwagi.length} uwag na ekranie`);
    assert.match(wynik.uwagi.at(-1)!, /i jeszcze \d+ podobnych/);
    assert.equal(wynik.dni[0]!.cwiczenia.length, 1, "zostaje jedno ćwiczenie, reszta to powtórki");
  });

  test("nadmiar dni dalej jest przycinany do zamówionej liczby", () => {
    const duzo = {
      dni: Array.from({ length: 1000 }, () => ({ cwiczenia: [{ cwiczenieId: "EX-0010" }] })),
    } as any;
    assert.equal(zlozPropozycje(duzo, wejscie, kontekst).dni.length, 3);
  });
});

describe("AI — wstawienie propozycji do planu", () => {
  const propozycja = zlozPropozycje(
    surowa([
      {
        dzien: 1, nazwa: "Dolny", cwiczenia: [
          poz("EX-0010", "Barbell back squat", "Lower push"),
          poz("EX-0016", "Barbell row", "Upper pull horizontal"),
          poz("EX-0003", "Allah", "Core"),
        ],
      },
      {
        dzien: 2, nazwa: "Górny", cwiczenia: [
          poz("EX-0011", "Barbell bench press", "Upper push horizontal"),
          poz("EX-0012", "Barbell curl", "Bicep"),
        ],
      },
    ]),
    WEJSCIE, PUSTY_KONTEKST,
  );

  function planZTrescia() {
    const plan = pustyPlan("Testowy");
    plan.sloty[0]!.cwiczenieId = "EX-0013";
    plan.sloty[0]!.tygodnie = { 1: { serie: 5, powtorzenia: 5, rpe: 8 } };
    plan.sloty[1]!.cwiczenieId = "EX-0042";
    // Dzień trzeci zostaje nietknięty — propozycja go nie obejmuje.
    plan.sloty[24]!.cwiczenieId = "EX-0056";
    plan.sloty[24]!.tygodnie = { 1: { serie: 4, rpe: 7 } };
    plan.serieMaksymalne = [{ cwiczenieId: "EX-0013", ciezar: 120, powtorzenia: 3 }];
    return plan;
  }

  test("ćwiczenia i kategorie lądują na swoich miejscach", () => {
    const plan = zastosujPropozycje(planZTrescia(), propozycja);
    const dzien1 = plan.sloty.filter((s) => s.dzien === 1);
    assert.deepEqual(dzien1.slice(0, 3).map((s) => s.cwiczenieId), ["EX-0010", "EX-0016", "EX-0003"]);
    assert.equal(dzien1[0]!.kategoriaSzkieletu, "Lower push");
    assert.equal(dzien1[0]!.lp, "A1.", "numeracja należy do miejsca w planie, nie do ćwiczenia");
  });

  test("dzień wymienia się w całości — nic starego nie zostaje", () => {
    const plan = zastosujPropozycje(planZTrescia(), propozycja);
    const dzien1 = plan.sloty.filter((s) => s.dzien === 1);
    assert.equal(dzien1[3]!.cwiczenieId, null, "czwarty slot był pusty i pusty zostaje");
    assert.ok(dzien1.every((s) => Object.keys(s.tygodnie ?? {}).length === 0),
      "serie i RPE należały do poprzednich ćwiczeń");
  });

  test("dni spoza propozycji zostają nietknięte", () => {
    const plan = zastosujPropozycje(planZTrescia(), propozycja);
    const dzien3 = plan.sloty.find((s) => s.positionId === "D3-S01")!;
    assert.equal(dzien3.cwiczenieId, "EX-0056");
    assert.deepEqual(dzien3.tygodnie, { 1: { serie: 4, rpe: 7 } });
  });

  test("asystent nie dotyka ani jednej liczby", () => {
    const przed = planZTrescia();
    const po = zastosujPropozycje(przed, propozycja);

    assert.deepEqual(po.serieMaksymalne, przed.serieMaksymalne, "1RM to wejście klienta");
    assert.equal(po.trybAkcesoriow, przed.trybAkcesoriow);
    assert.equal(po.czescPlanu, przed.czescPlanu);
    assert.deepEqual(po.topSety, przed.topSety);

    // Plan po wstawieniu liczy się normalnie, a ciężary bierze silnik —
    // przy braku serii maksymalnej wychodzi komunikat arkusza, nie zgadywanka.
    const wynik = przeliczPlan(po);
    const slot = wynik.tygodnie[0]!.sloty.find((s) => s.positionId === "D1-S01")!;
    assert.equal(slot.cwiczenie!.id, "EX-0010");
    assert.equal(slot.ciezar, "— brak 1RM");
  });

  test("oryginalny plan zostaje nietknięty", () => {
    const przed = planZTrescia();
    zastosujPropozycje(przed, propozycja);
    assert.equal(przed.sloty[0]!.cwiczenieId, "EX-0013");
  });

  test("wiadomo z góry, ile ćwiczeń zniknie", () => {
    assert.equal(iluNadpisze(planZTrescia(), propozycja), 2, "dwa w dniu 1, dzień 3 nietykany");
    assert.equal(iluNadpisze(pustyPlan("Pusty"), propozycja), 0);
  });
});

describe("AI — raport dla odczytania analizy", () => {
  const wynik = (() => {
    const plan = pustyPlan("Zuzanna Kowalska");
    plan.sloty[0]!.cwiczenieId = "EX-0010";
    plan.sloty[0]!.tygodnie = { 1: { serie: 5, powtorzenia: 5, rpe: 8 } };
    plan.sloty[1]!.cwiczenieId = "EX-0016";
    plan.serieMaksymalne = [{ cwiczenieId: "EX-0010", ciezar: 100, powtorzenia: 5 }];
    return przeliczPlan(plan);
  })();

  test("raport niesie liczby i oceny z silnika", () => {
    const raport = raportLiczbowy({ wynik, realizacja: null, porownanie: null, uwagi: [] });
    for (const t of [1, 2, 3, 4, 5, 6]) assert.ok(raport.includes(`T${t}:`), `brak tygodnia ${t}`);
    assert.ok(raport.includes("Dni treningowych w tygodniu: 1"));
    assert.ok(/przysiad/.test(raport), "wzorce po nazwie, nie tylko literą");
    assert.ok(/▼|✓|▲/.test(raport), "oceny względem norm");
  });

  test("do modelu nie idzie nazwisko klienta", () => {
    const raport = raportLiczbowy({ wynik, realizacja: null, porownanie: null, uwagi: [] });
    assert.ok(!raport.includes("Zuzanna"));
    assert.ok(!raport.includes("Kowalska"));
  });

  test("realizacja i uwagi wchodzą do raportu, gdy są", () => {
    const raport = raportLiczbowy({
      wynik,
      realizacja: { ukonczonych: 4, zaplanowanych: 6, dniOdOstatniej: 2, odczucia: { latwe: 1, ok: 8, trudne: 3 } },
      porownanie: "Obciążenie tygodniowe wyższe o 12%.",
      uwagi: [
        { poziom: "ostrzezenie", opis: "Machine row: brak serii maksymalnej" },
        { poziom: "info", opis: "to trener i tak widzi" },
      ],
    });
    assert.ok(raport.includes("4 z 6"));
    assert.ok(raport.includes("2 dni temu"));
    assert.ok(raport.includes("wyższe o 12%"));
    assert.ok(raport.includes("brak serii maksymalnej"));
    assert.ok(!raport.includes("to trener i tak widzi"), "info to szum, nie wysyłamy");
  });

  test("spostrzeżenia układają się od najważniejszego", () => {
    const u = uporzadkuj({
      spostrzezenia: [
        { tytul: "c", tresc: "x", waga: "niska" },
        { tytul: "a", tresc: "x", waga: "wysoka" },
        { tytul: "b", tresc: "x", waga: "średnia" },
        { tytul: "", tresc: "pusty", waga: "wysoka" },
      ],
      doSprawdzenia: ["pytanie", "  "],
      podsumowanie: "  jedno zdanie  ",
    });
    assert.deepEqual(u.spostrzezenia.map((s) => s.tytul), ["a", "b", "c"]);
    assert.deepEqual(u.doSprawdzenia, ["pytanie"]);
    assert.equal(u.podsumowanie, "jedno zdanie");
  });
});
