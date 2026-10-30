/**
 * Migracja bazy z wersji 1 do 2 — na prawdziwej starej bazie.
 *
 * Test buduje bazę w starym schemacie (klient jako kolumna tekstowa, token
 * i waga przy planie), wypełnia ją danymi i otwiera normalnym kodem konsoli.
 * Sprawdzamy to, co przy migracji naprawdę może zniknąć: plany, wpisy klienta,
 * wagę z kilku cykli i — najważniejsze — link, który klient ma już w telefonie.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KATALOG = mkdtempSync(join(tmpdir(), "migracja-test-"));
const PLIK = join(KATALOG, "stara.db");
process.env.BAZA_CRAFTMYPLAN = PLIK;

/**
 * Schemat sprzed wprowadzenia encji klienta — dokładnie taki, jaki był.
 *
 * Nie ma tu tabeli `wersja_schematu` i to jest celowe: instalacja sprzed
 * wersjonowania jej nie miała. Konsola musi sobie z tym poradzić sama, bo
 * inaczej nie wstaje w ogóle — na bazie pełnej danych, z komunikatem o SQL-u.
 */
const SCHEMAT_V1 = `
CREATE TABLE trener (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, nazwa TEXT NOT NULL,
  hash_hasla TEXT, utworzony TEXT NOT NULL
);
CREATE TABLE sesja (
  token TEXT PRIMARY KEY, trener_id INTEGER NOT NULL REFERENCES trener(id) ON DELETE CASCADE,
  utworzona TEXT NOT NULL, wygasa TEXT NOT NULL
);
CREATE TABLE plan (
  trener_id INTEGER NOT NULL REFERENCES trener(id) ON DELETE CASCADE,
  id TEXT NOT NULL, klient TEXT NOT NULL, wersja INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('szkic', 'wysłany', 'zakończony')),
  data_startu TEXT, utworzony TEXT NOT NULL, zmieniony TEXT NOT NULL,
  poprzedni_id TEXT, token TEXT UNIQUE,
  oddech_json TEXT, bieg_json TEXT, plan_json TEXT NOT NULL,
  PRIMARY KEY (trener_id, id)
);
CREATE TABLE wykonanie (
  trener_id INTEGER NOT NULL, plan_id TEXT NOT NULL, position_id TEXT NOT NULL,
  tydzien INTEGER NOT NULL, data TEXT NOT NULL, ciezar_wykonany REAL,
  powtorzenia_wykonane INTEGER, feedback TEXT,
  PRIMARY KEY (trener_id, plan_id, position_id, tydzien),
  FOREIGN KEY (trener_id, plan_id) REFERENCES plan(trener_id, id) ON DELETE CASCADE
);
CREATE TABLE ukonczony_dzien (
  trener_id INTEGER NOT NULL, plan_id TEXT NOT NULL, tydzien INTEGER NOT NULL,
  dzien INTEGER NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (trener_id, plan_id, tydzien, dzien),
  FOREIGN KEY (trener_id, plan_id) REFERENCES plan(trener_id, id) ON DELETE CASCADE
);
CREATE TABLE pomiar_wagi (
  trener_id INTEGER NOT NULL, plan_id TEXT NOT NULL, data TEXT NOT NULL, kg REAL NOT NULL,
  PRIMARY KEY (trener_id, plan_id, data),
  FOREIGN KEY (trener_id, plan_id) REFERENCES plan(trener_id, id) ON DELETE CASCADE
);
`;

const TOKEN_STARY_CYKL = "token-cyklu-trzeciego-1234";
const TOKEN_AKTUALNY = "token-cyklu-czwartego-5678";

/** Buduje bazę w starym kształcie i wypełnia ją tak, jak wyglądałaby u trenera. */
function zbudujStaraBaze(): void {
  const d = new DatabaseSync(PLIK);
  d.exec("PRAGMA foreign_keys = ON");
  d.exec(SCHEMAT_V1);
  d.prepare("INSERT INTO trener (id, email, nazwa, utworzony) VALUES (1, 'trener@localhost', 'Trener', '2026-01-01T00:00:00.000Z')").run();

  /*
   * Plan z TOP SETAMI włączonymi w każdym dniu — tak wyglądały wszystkie plany
   * założone w konsoli, bo taki był domyślny kształt pustego planu. Widoczne
   * były jednak tylko te, które stały przy ćwiczeniu złożonym; migracja v4 ma
   * ten stan przepisać do danych. Dzień III sprawdza slot bez ćwiczenia.
   */
  const plan = JSON.stringify({
    nazwa: "x",
    serieMaksymalne: [],
    sloty: [
      { positionId: "D1-S01", dzien: 1, lp: "A1.", cwiczenieId: "EX-0011" },  // bench, coeff 1,0
      // v9: przysiad na B1 z liczbami akcesorium z „wpisz progresję” (T1, T4),
      // ręczną zmianą trenera (T2) i oceną klienta (T4); front squat na C1
      // z „G” wyłączonym — akcesorium z decyzji trenera, bez zmian.
      { positionId: "D1-S02", dzien: 1, lp: "B1.", cwiczenieId: "EX-0010",
        tygodnie: { 1: { serie: 3, rpe: 8 }, 2: { serie: 4, rpe: 8 }, 4: { serie: 3, rpe: 9, feedback: "OK" } } },
      { positionId: "D1-S03", dzien: 1, lp: "C1.", cwiczenieId: "EX-0089", bojGlowny: false,
        tygodnie: { 1: { serie: 3, rpe: 8 } } },
      // v10: push press na A1 — był bojem, „wpisz progresję” zostawił mu
      // liczby boju (T1), trener zmienił T2 ręcznie.
      { positionId: "D2-S02", dzien: 2, lp: "A2.", cwiczenieId: "EX-0165",
        tygodnie: { 1: { serie: 6, powtorzenia: 6, rpe: 6.5 }, 2: { serie: 5, powtorzenia: 5, rpe: 8 } } },
      { positionId: "D2-S01", dzien: 2, lp: "A1.", cwiczenieId: "EX-0003" },  // Allah, coeff 0,5
      // v12: S/l clean na B2 z liczbami akcesorium z „wpisz progresję” (T1, T4),
      // ręczną zmianą trenera (T2) i oceną klienta (T4).
      { positionId: "D3-S02", dzien: 3, lp: "B2.", cwiczenieId: "EX-3627",
        tygodnie: { 1: { serie: 3, rpe: 8 }, 2: { serie: 4, rpe: 8 }, 4: { serie: 3, rpe: 9, feedback: "za łatwe" } } },
      { positionId: "D3-S01", dzien: 3, lp: "A1.", cwiczenieId: null },
    ],
    topSety: [
      // RPE 7 to liczba z szkieletu, nikt jej nie wybrał; 8,5 przy dniu II
      // trener zmienił ręcznie i to ma przetrwać aktualizację.
      { dzien: 1, wlaczony: true, rpe: 7, slotPositionId: "D1-S01" },
      { dzien: 2, wlaczony: true, rpe: 8.5, slotPositionId: "D2-S01" },
      { dzien: 3, wlaczony: true, rpe: 7, slotPositionId: "D3-S01" },
    ],
  });
  const wstaw = d.prepare(`
    INSERT INTO plan (trener_id, id, klient, wersja, status, data_startu, utworzony, zmieniony, poprzedni_id, token, plan_json)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Dwa cykle tej samej osoby — z drobną różnicą w zapisie nazwy, jak w życiu.
  wstaw.run("zofia-k-3", "Zofia K", 3, "zakończony", "2026-05-01",
    "2026-04-20T09:00:00.000Z", "2026-06-15T09:00:00.000Z", null, TOKEN_STARY_CYKL, plan);
  wstaw.run("zofia-k-4", "zofia k.", 4, "wysłany", "2026-06-20",
    "2026-06-16T09:00:00.000Z", "2026-07-01T09:00:00.000Z", "zofia-k-3", TOKEN_AKTUALNY, plan);
  wstaw.run("marek-nowak-1", "Marek Nowak", 1, "szkic", null,
    "2026-07-02T09:00:00.000Z", "2026-07-02T09:00:00.000Z", null, null, plan);

  d.prepare("INSERT INTO wykonanie VALUES (1, 'zofia-k-4', 'D1-S01', 2, '2026-06-28T10:00:00.000Z', 62.5, 8, 'za trudne')").run();
  d.prepare("INSERT INTO ukonczony_dzien VALUES (1, 'zofia-k-4', 2, 1, '2026-06-28T10:30:00.000Z')").run();

  // Waga w dwóch cyklach — po migracji ma być jedną historią.
  const wstawWage = d.prepare("INSERT INTO pomiar_wagi VALUES (1, ?, ?, ?)");
  wstawWage.run("zofia-k-3", "2026-05-04", 61.2);
  wstawWage.run("zofia-k-3", "2026-06-01", 60.4);
  wstawWage.run("zofia-k-4", "2026-06-22", 60.1);
  wstawWage.run("zofia-k-4", "2026-07-01", 59.8);
  d.close();
}

let magazyn: typeof import("../magazyn.ts");
let polaczenie: typeof import("../baza/polaczenie.ts");

before(async () => {
  zbudujStaraBaze();
  magazyn = await import("../magazyn.ts");
  polaczenie = await import("../baza/polaczenie.ts");
  polaczenie.baza();   // to tutaj wykonuje się migracja
});

after(() => {
  polaczenie.zamknij();
  rmSync(KATALOG, { recursive: true, force: true });
  delete process.env.BAZA_CRAFTMYPLAN;
});

describe("migracja v1 → v2", () => {
  test("baza podnosi wersję", () => {
    const { w } = polaczenie.baza().prepare("SELECT MAX(wersja) AS w FROM wersja_schematu").get() as { w: number };
    assert.equal(w, polaczenie.WERSJA_SCHEMATU);
    // Liczba wpisana wprost, żeby podniesienie wersji było decyzją, a nie
    // skutkiem ubocznym — test ma wtedy zapytać, czy migracja rzeczywiście jest.
    // 6: wykonanie pamięta wszystkie serie, nie tylko najcięższą (23.09.2026).
    // 7: wersja robocza planu — zmiany trenera czekają na zatwierdzenie (10.10.2026).
    // 8: znacznik resetu planu — telefon zaczyna trening od nowa (10.10.2026).
    // 11: własne ćwiczenia trenera (17.10.2026).
    // 12: S/l clean z progresją dwuboju (17.10.2026).
    // 13: poprawki trenera do ćwiczeń z bazy — ekran „Baza ćwiczeń” (27.10.2026).
    // 14: plan po angielsku — język i tłumaczenia przy planie (27.10.2026).
    assert.equal(w, 14);
  });

  test("v14: plany bez języka — klienci dalej widzą plan po polsku", () => {
    const kolumny = (polaczenie.baza().prepare("PRAGMA table_info(plan)").all() as { name: string }[]).map((k) => k.name);
    for (const k of ["jezyk", "tlumaczenia_json"]) assert.ok(kolumny.includes(k), k);
    const zJezykiem = polaczenie.baza().prepare("SELECT COUNT(*) AS n FROM plan WHERE jezyk IS NOT NULL OR tlumaczenia_json IS NOT NULL").get() as { n: number };
    assert.equal(zJezykiem.n, 0);
  });

  test("v13: tabela poprawek ćwiczeń jest i jest pusta — baza ćwiczeń jak w plikach", () => {
    const kolumny = (polaczenie.baza().prepare("PRAGMA table_info(cwiczenie_poprawka)").all() as { name: string }[]).map((k) => k.name);
    assert.deepEqual(kolumny, ["id", "trener_id", "dane_json", "zmienione"]);
    assert.equal((polaczenie.baza().prepare("SELECT COUNT(*) AS n FROM cwiczenie_poprawka").get() as { n: number }).n, 0);
  });

  test("plan ma miejsce na wersję klienta — puste, czyli nic nie czeka na zatwierdzenie", () => {
    const kolumny = (polaczenie.baza().prepare("PRAGMA table_info(plan)").all() as { name: string }[]).map((k) => k.name);
    for (const k of ["plan_klienta_json", "pozycje_klienta_json", "zmiany_od"]) assert.ok(kolumny.includes(k), k);
    const czeka = polaczenie.baza().prepare("SELECT COUNT(*) AS n FROM plan WHERE plan_klienta_json IS NOT NULL").get() as { n: number };
    assert.equal(czeka.n, 0);
  });

  test("z nazw w planach powstali klienci", () => {
    const klienci = magazyn.listaKlientow(1);
    assert.deepEqual(klienci.map((k) => k.id).sort(), ["marek-nowak", "zofia-k"]);
    // Nazwa bierze się z najświeższego planu — tam trener wpisał ją ostatnio.
    assert.equal(klienci.find((k) => k.id === "zofia-k")!.nazwa, "zofia k.");
  });

  test("link, który klient ma w telefonie, dalej działa", () => {
    const k = magazyn.klientPoTokenie(TOKEN_AKTUALNY);
    assert.ok(k, "token z najnowszego planu musi przejść na klienta");
    assert.equal(k!.id, "zofia-k");
  });

  test("token przeszedł na klienta, więc prowadzi do aktualnego cyklu", () => {
    const k = magazyn.klientPoTokenie(TOKEN_AKTUALNY)!;
    const plan = magazyn.aktywnyPlan(k.trenerId, k.id);
    assert.equal(plan!.id, "zofia-k-4", "wysłany wygrywa z zakończonym");
    assert.equal(plan!.wersja, 4);
  });

  test("plany trzymają się swoich klientów", () => {
    const cykle = magazyn.planyKlienta(1, "zofia-k");
    assert.deepEqual(cykle.map((p) => p.id), ["zofia-k-3", "zofia-k-4"]);
    assert.equal(magazyn.lista(1).length, 3, "żaden plan nie zginął");
  });

  test("waga z dwóch cykli to jedna historia", () => {
    const waga = magazyn.wagaKlienta(1, "zofia-k");
    assert.deepEqual(waga.map((w) => w.data),
      ["2026-05-04", "2026-06-01", "2026-06-22", "2026-07-01"]);
    assert.equal(waga.at(-1)!.kg, 59.8);
  });

  test("wpisy klienta przetrwały przepisanie tabeli planów", () => {
    const plan = magazyn.wczytaj(1, "zofia-k-4")!;
    assert.equal(plan.wykonania!.length, 1);
    assert.equal(plan.wykonania![0]!.ciezarWykonany, 62.5);
    assert.deepEqual(plan.ukonczoneDni, [{ dzien: 1, tydzien: 2, data: "2026-06-28T10:30:00.000Z" }]);
    assert.equal(plan.poprzedniId, "zofia-k-3", "łańcuch cykli zostaje");
  });

  /**
   * Wersja 6: wykonanie dostaje kolumnę na wszystkie serie. Stare wpisy znają
   * tylko najcięższą parę — i tylko ją mają oddać, bez wymyślonej listy serii.
   */
  test("stary wpis zostaje najcięższą parą, bez wymyślonych serii", () => {
    const kolumny = (polaczenie.baza().prepare("PRAGMA table_info(wykonanie)").all() as
      { name: string }[]).map((k) => k.name);
    assert.ok(kolumny.includes("serie_json"), "brak kolumny na wszystkie serie");
    const wpis = magazyn.wczytaj(1, "zofia-k-4")!.wykonania![0]!;
    assert.equal(wpis.ciezarWykonany, 62.5, "para zostaje, gdzie była");
    assert.equal(wpis.serie, undefined, "serii nikt nie wpisał — nie wolno ich dopisać");
  });

  test("po migracji wszystkie serie zapisują się i wracają", () => {
    const plan = magazyn.wczytaj(1, "zofia-k-4")!;
    const serie = [{ ciezar: 80, powtorzenia: 6 }, { ciezar: 90, powtorzenia: 6 },
      { ciezar: 85, powtorzenia: 6 }];
    plan.wykonania![0]!.serie = serie;
    magazyn.zapisz(plan);
    assert.deepEqual(magazyn.wczytaj(1, "zofia-k-4")!.wykonania![0]!.serie, serie);
  });

  test("po migracji nie ma osieroconych wierszy", () => {
    const osierocone = polaczenie.baza().prepare("PRAGMA foreign_key_check").all();
    assert.deepEqual(osierocone, []);
  });

  test("kolumna token zniknęła z planów — jedno źródło prawdy", () => {
    const kolumny = (polaczenie.baza().prepare("PRAGMA table_info(plan)").all() as { name: string }[])
      .map((k) => k.name);
    assert.ok(kolumny.includes("klient_id"));
    assert.ok(!kolumny.includes("token"));
  });

  test("ponowne otwarcie bazy niczego nie migruje drugi raz", () => {
    // Liczymy zmianę, a nie wartość bezwzględną: wpisów wersji jest tyle, ile
    // migracji przeszła ta baza, i ta liczba rośnie przy każdej kolejnej.
    // Pytanie brzmi „czy przybyło", a nie „czy jest ich dokładnie jeden".
    const ile = () => (polaczenie.baza().prepare(
      "SELECT COUNT(*) AS c FROM wersja_schematu").get() as { c: number }).c;
    const przed = ile();
    polaczenie.migruj(polaczenie.baza());
    assert.equal(ile(), przed, "migracja wykonała się drugi raz");
    assert.equal(magazyn.listaKlientow(1).length, 2);
  });
});

/**
 * Migracja v3 → v4 na tych samych danych.
 *
 * TOP SET przestaje być czymś, co silnik włącza sam przy ćwiczeniu złożonym,
 * a staje się czymś, co trener stawia klikając. Stare plany mają włączone
 * wszystko — więc bez migracji TOP SET pojawiłby się po aktualizacji nad
 * każdym dniem, także tam, gdzie nikt go nie chciał i gdzie dotąd go nie było.
 * Kontrola jest o to jedno: po migracji plan wygląda tak, jak wyglądał.
 */
describe("migracja v3 → v4: TOP SET tam, gdzie był widoczny", () => {
  function topSetyPlanu(id: string) {
    const wiersz = polaczenie.baza()
      .prepare("SELECT plan_json FROM plan WHERE trener_id = 1 AND id = ?")
      .get(id) as { plan_json: string };
    return JSON.parse(wiersz.plan_json).topSety as
      { dzien: number; wlaczony: boolean; slotPositionId: string }[];
  }

  test("TOP SET przy ćwiczeniu złożonym zostaje włączony", () => {
    const top = topSetyPlanu("zofia-k-4").find((t) => t.dzien === 1)!;
    assert.equal(top.wlaczony, true);
    assert.equal(top.slotPositionId, "D1-S01", "wskazanie slotu zostaje nietknięte");
  });

  test("TOP SET przy akcesorium gaśnie — i tak nie było go widać", () => {
    assert.equal(topSetyPlanu("zofia-k-4").find((t) => t.dzien === 2)!.wlaczony, false);
  });

  test("TOP SET na pustym slocie gaśnie", () => {
    assert.equal(topSetyPlanu("zofia-k-4").find((t) => t.dzien === 3)!.wlaczony, false);
  });

  test("migracja objęła wszystkie plany, nie tylko najnowszy", () => {
    for (const id of ["zofia-k-3", "zofia-k-4", "marek-nowak-1"]) {
      assert.deepEqual(topSetyPlanu(id).map((t) => t.wlaczony), [true, false, false], id);
    }
  });
});

/**
 * Migracja v4 → v5 na tych samych danych.
 *
 * RPE TOP SETU przestaje być jedną liczbą na cykl i zaczyna rosnąć tydzień
 * po tygodniu, jak w arkuszach. Pytanie brzmi, co zrobić ze starą liczbą —
 * i odpowiedź zależy od tego, czy była wyborem trenera, czy tylko tym, co
 * wpisał szkielet nowego planu.
 */
describe("migracja v4 → v5: RPE TOP SETU per tydzień", () => {
  function topSetyPlanu(id: string) {
    const wiersz = polaczenie.baza()
      .prepare("SELECT plan_json FROM plan WHERE trener_id = 1 AND id = ?")
      .get(id) as { plan_json: string };
    return JSON.parse(wiersz.plan_json).topSety as
      { dzien: number; rpe?: number; rpeTygodni?: Record<string, number> }[];
  }

  test("pole rpe znika ze wszystkich wpisów", () => {
    for (const top of topSetyPlanu("zofia-k-4")) {
      assert.equal("rpe" in top, false, `dzień ${top.dzien} dalej ma stare pole`);
    }
  });

  test("siódemka ze szkieletu nie blokuje szablonu", () => {
    assert.equal(topSetyPlanu("zofia-k-4").find((t) => t.dzien === 1)!.rpeTygodni, undefined);
  });

  test("liczba zmieniona przez trenera zostaje — we wszystkich tygodniach", () => {
    assert.deepEqual(topSetyPlanu("zofia-k-4").find((t) => t.dzien === 2)!.rpeTygodni,
      { 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 5: 8.5, 6: 8.5 });
  });
});

/**
 * Migracja v8 → v9 na tych samych danych (16.10.2026): złożone z ciężarem
 * są bojem na każdej pozycji, a liczby akcesorium wpisane automatem znikają.
 */
describe("migracja v8 → v9: bój poza pozycją A", () => {
  function slot(id: string, positionId: string) {
    const wiersz = polaczenie.baza()
      .prepare("SELECT plan_json FROM plan WHERE trener_id = 1 AND id = ?")
      .get(id) as { plan_json: string };
    return JSON.parse(wiersz.plan_json).sloty.find((s: { positionId: string }) => s.positionId === positionId);
  }

  test("liczby akcesorium z „wpisz progresję” znikają — wchodzi progresja boju", () => {
    const b1 = slot("zofia-k-4", "D1-S02");
    assert.deepEqual(b1.tygodnie[1], {});
    assert.deepEqual(b1.tygodnie[4], { feedback: "OK" }, "ocena klienta zostaje");
  });

  test("ręczna zmiana trenera zostaje", () => {
    assert.deepEqual(slot("zofia-k-4", "D1-S02").tygodnie[2], { serie: 4, rpe: 8 });
  });

  test("„G” wyłączone — akcesorium z decyzji trenera, nietknięte", () => {
    assert.deepEqual(slot("zofia-k-4", "D1-S03").tygodnie[1], { serie: 3, rpe: 8 });
  });
});

/**
 * Migracja v9 → v10 (16.10.2026): bojem tylko przysiady, martwe ciągi i bench.
 * Push press wraca do akcesoriów — liczby boju z „wpisz progresję” znikają.
 */
describe("migracja v9 → v10: bojem tylko przysiady, martwe ciągi, bench", () => {
  function slot(id: string, positionId: string) {
    const wiersz = polaczenie.baza()
      .prepare("SELECT plan_json FROM plan WHERE trener_id = 1 AND id = ?")
      .get(id) as { plan_json: string };
    return JSON.parse(wiersz.plan_json).sloty.find((s: { positionId: string }) => s.positionId === positionId);
  }

  test("liczby boju z „wpisz progresję” przy push pressie znikają", () => {
    assert.deepEqual(slot("zofia-k-4", "D2-S02").tygodnie[1], {});
  });

  test("ręczna zmiana trenera zostaje", () => {
    assert.deepEqual(slot("zofia-k-4", "D2-S02").tygodnie[2], { serie: 5, powtorzenia: 5, rpe: 8 });
  });

  test("przysiad na B1 dalej bez liczb akcesorium (v9) — jest bojem", () => {
    assert.deepEqual(slot("zofia-k-4", "D1-S02").tygodnie[1], {});
  });
});

/**
 * Migracja v11 → v12 (17.10.2026): S/l clean dostaje progresję dwuboju —
 * liczby akcesorium z „wpisz progresję” znikają, ręczne zostają.
 */
describe("migracja v11 → v12: S/l clean jak zwykły clean", () => {
  function slot(id: string, positionId: string) {
    const wiersz = polaczenie.baza()
      .prepare("SELECT plan_json FROM plan WHERE trener_id = 1 AND id = ?")
      .get(id) as { plan_json: string };
    return JSON.parse(wiersz.plan_json).sloty.find((s: { positionId: string }) => s.positionId === positionId);
  }

  test("liczby akcesorium znikają — wchodzi tabela dwuboju; ocena klienta zostaje", () => {
    const b2 = slot("zofia-k-4", "D3-S02");
    assert.deepEqual(b2.tygodnie[1], {});
    assert.deepEqual(b2.tygodnie[4], { feedback: "za łatwe" });
  });

  test("ręczna zmiana trenera zostaje", () => {
    assert.deepEqual(slot("zofia-k-4", "D3-S02").tygodnie[2], { serie: 4, rpe: 8 });
  });
});
