/**
 * Złoty test modułów ODDECH i BIEG.
 *
 * Zestaw w `zlote/moduly/` powstał z MasterTemplate 5.18 przeliczonego przez
 * LibreOffice: dwa komplety wejść (3 i 5 jednostek biegowych, TWOT 22 i 8),
 * z których arkusz policzył wszystko sam. Silnik ma trafić w to co do sekundy
 * tempa i co do pół kilometra dystansu.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  hrMax, tempoTestowe, tempoTekst, strefyTetna, tempaTreningowe,
  planBiegowy, minutyPracy, minutWTygodniu, kilometrowWTygodniu,
  type DaneBiegowe,
} from "../src/bieg.ts";
import { dawkaOddechowa, progDlaTWOT, KOMUNIKAT_PRZECIWWSKAZANIE } from "../src/oddech.ts";

type Zloty = {
  przypadki: {
    wejscie: DaneBiegowe & { twot: number };
    hrMax: number;
    tempoTestowe: string;
    strefy: string[];
    tempa: string[];
    jednostki: {
      tydzien: number; nr: number; opis: string;
      minutRazem: number; dystansKm: number; tempo: string; tetno: string;
    }[];
    oddech: {
      poziom: string; czestotliwosc: string;
      blokA: string; blokB: string; blokC: string; brama: string;
    };
  }[];
};

const PLIK = join(dirname(fileURLToPath(import.meta.url)), "zlote", "moduly", "oddech-bieg-518.json");
const zloty: Zloty = JSON.parse(readFileSync(PLIK, "utf-8"));

describe("zgodność z arkuszem — ODDECH i BIEG", () => {
  for (const p of zloty.przypadki) {
    const etykieta = `${p.wejscie.jednostekWTygodniu} jednostek, TWOT ${p.wejscie.twot} s`;

    test(`BIEG — ${etykieta}`, (t) => {
      const dane: DaneBiegowe = p.wejscie;
      assert.equal(hrMax(dane), p.hrMax, "HR max");
      assert.equal(tempoTekst(tempoTestowe(dane)!), p.tempoTestowe, "tempo testowe");

      assert.deepEqual(
        strefyTetna(dane).map((s) => `${s.odUd}–${s.doUd}`), p.strefy, "strefy tętna",
      );
      assert.deepEqual(
        tempaTreningowe(dane).map((x) => x.tekst), p.tempa, "tempa treningowe",
      );

      const plan = planBiegowy(dane);
      let sprawdzonych = 0;
      for (const oczekiwana of p.jednostki) {
        const j = plan[oczekiwana.tydzien - 1]!.jednostki[oczekiwana.nr - 1]!;
        const gdzie = `T${oczekiwana.tydzien} J${oczekiwana.nr}`;
        assert.equal(j.opis, oczekiwana.opis, `${gdzie} opis`);
        assert.equal(j.minutRazem, oczekiwana.minutRazem, `${gdzie} czas`);
        assert.equal(j.dystansKm, oczekiwana.dystansKm, `${gdzie} dystans`);
        assert.equal(j.tempoTekst, oczekiwana.tempo, `${gdzie} tempo`);
        assert.equal(`${j.strefa!.odUd}–${j.strefa!.doUd}`, oczekiwana.tetno, `${gdzie} tętno`);
        sprawdzonych += 5;
      }
      t.diagnostic(`zgodnych: ${sprawdzonych + p.strefy.length + p.tempa.length + 2}`);
    });

    test(`ODDECH — TWOT ${p.wejscie.twot} s`, () => {
      const d = dawkaOddechowa(p.wejscie.twot)!;
      assert.equal(d.poziom, p.oddech.poziom);
      assert.equal(d.czestotliwosc, p.oddech.czestotliwosc);
      assert.equal(d.blokA, p.oddech.blokA);
      assert.equal(d.blokB, p.oddech.blokB, "blok B — z podstawionym czasem bezdechu");
      assert.equal(d.blokC, p.oddech.blokC);
      assert.equal(d.brama, p.oddech.brama);
    });
  }
});

describe("ODDECH — zachowania spoza złotego zestawu", () => {
  test("progi łapią po dolnej granicy, nie po najbliższej", () => {
    assert.equal(progDlaTWOT(9.9)!.poziom, "Bardzo niski");
    assert.equal(progDlaTWOT(10)!.poziom, "Niski");
    assert.equal(progDlaTWOT(24.9)!.poziom, "Średni");
    assert.equal(progDlaTWOT(25)!.poziom, "Dobry");
    assert.equal(progDlaTWOT(30)!.poziom, "Wysoki");
    assert.equal(progDlaTWOT(120)!.poziom, "Wysoki", "powyżej ostatniego progu zostaje ostatni");
  });

  test("poniżej zera i bez wyniku — nic, nie zgadywanie", () => {
    assert.equal(progDlaTWOT(-1), null);
    assert.equal(dawkaOddechowa(-1), null);
    assert.equal(dawkaOddechowa(Number.NaN), null);
  });

  test("przeciwwskazanie zatrzymuje wszystko, nie tylko ostrzega", () => {
    const d = dawkaOddechowa(30, true)!;
    assert.equal(d.zatrzymane, true);
    assert.equal(d.brama, KOMUNIKAT_PRZECIWWSKAZANIE);
    for (const pole of [d.poziom, d.czestotliwosc, d.blokA, d.blokB, d.blokC]) {
      assert.equal(pole, "Wersja łagodna — ustal indywidualnie");
    }
  });

  test("czas bezdechu podstawia się z procentu TWOT", () => {
    // 29 s × 60% = 17,4 → 17 s (próg „Dobry")
    assert.match(dawkaOddechowa(29)!.blokB, /TWOT \(≈ 17 s\)/);
    // 30 s × 65% = 19,5 → 20 s (próg „Wysoki"; ROUND idzie w górę)
    assert.match(dawkaOddechowa(30)!.blokB, /TWOT \(≈ 20 s\)/);
    // najniższy próg nie ma bezdechów, więc nie ma czego podstawiać
    assert.equal(dawkaOddechowa(5)!.blokB, "bez bezdechów");
  });
});

describe("BIEG — zachowania spoza złotego zestawu", () => {
  test("HR max zmierzone wygrywa nad wzorem z wieku", () => {
    assert.equal(hrMax({ wiek: 35 }), 184);
    assert.equal(hrMax({ wiek: 35, hrMaxZmierzone: 191 }), 191);
    assert.equal(hrMax({}), null, "bez wieku i bez pomiaru nie ma czego liczyć");
  });

  test("minuty pracy zaokrąglają się do pięciu, ale nie poniżej dziesięciu", () => {
    // interwał: 16 min bazy × 0,9 (T4) × 0,9 (5 jednostek) = 12,96 → 15
    assert.equal(minutyPracy(16, 4, 5), 15);
    // 16 × 1 × 0,9 = 14,4 → 15
    assert.equal(minutyPracy(16, 1, 5), 15);
    // nic nie zejdzie poniżej dziesięciu minut
    assert.equal(minutyPracy(5, 4, 5), 10);
  });

  test("bez biegu testowego są czasy, nie ma temp ani dystansów", () => {
    const plan = planBiegowy({ wiek: 35, jednostekWTygodniu: 2 });
    const j = plan[0]!.jednostki[0]!;
    assert.equal(j.minutRazem, 35, "czas jest zadaniem — da się go podać bez tempa");
    assert.equal(j.dystansKm, null);
    assert.equal(j.tempoTekst, null);
    assert.ok(j.strefa, "tętno wychodzi z wieku, więc zostaje");
  });

  test("bez liczby jednostek nie ma planu", () => {
    assert.deepEqual(planBiegowy({ wiek: 35 }), []);
    assert.deepEqual(planBiegowy({ wiek: 35, jednostekWTygodniu: 0 }), []);
  });

  test("liczba jednostek obcina się do pięciu", () => {
    assert.equal(planBiegowy({ wiek: 35, jednostekWTygodniu: 9 })[0]!.jednostki.length, 5);
  });

  test("tempo obcina sekundy, tak jak TEXT w arkuszu", () => {
    assert.equal(tempoTekst(4.8333), "04:49", "nie 04:50 — arkusz obcina");
    assert.equal(tempoTekst(6.25), "06:15");
    assert.equal(tempoTekst(5), "05:00");
  });

  test("podsumowanie tygodnia sumuje czas i dystans", () => {
    const dane: DaneBiegowe = {
      wiek: 35, dystansTestowy: 5, czasTestowy: 25, jednostekWTygodniu: 3,
    };
    const t1 = planBiegowy(dane)[0]!;
    assert.equal(minutWTygodniu(t1), 100);      // 30 + 30 + 40
    assert.equal(kilometrowWTygodniu(t1), 16.5); // 5 + 5 + 6,5
    const bezTestu = planBiegowy({ wiek: 35, jednostekWTygodniu: 3 })[0]!;
    assert.equal(kilometrowWTygodniu(bezTestu), null);
  });
});
