/**
 * Moduły — oddech i bieg — na wejściu do serwera.
 *
 * `/moduly` była jedyną trasą, która brała ciało żądania i zapisywała je
 * w całości. Sprawdzone na działającej konsoli: `oddech` podany jako tekst
 * („trzydzieści sekund") przechodził z kodem 200 i zostawał w bazie.
 *
 * Skutek nie był awarią, tylko czymś gorszym — cichym zniknięciem. Silnik
 * jest odporny: z tekstu zamiast sekund wychodzi „brak dawki", więc przycisk
 * „Oddech i bieg" po prostu nie pokazuje się klientowi. Trener widzi, że
 * zapisał; klient nie widzi nic; nikt się nie dowiaduje dlaczego.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { sprawdzModuly, GRANICE_MODULOW } from "../ksztalt-modulow.ts";

const dobre = (w: unknown) => {
  const r = sprawdzModuly(w);
  assert.ok(!("blad" in r), `odrzucone, a nie powinno: ${JSON.stringify(r)}`);
  return r;
};

describe("co przyjmujemy", () => {
  test("komplet pól przechodzi i zostaje liczbami", () => {
    const r = dobre({
      oddech: { twot: 28, przeciwwskazania: false },
      bieg: { wiek: 34, hrMaxZmierzone: null, dystansTestowy: 3, czasTestowy: 18.5,
        jednostekWTygodniu: 3 },
    });
    assert.deepEqual(r.oddech, { twot: 28, przeciwwskazania: false });
    assert.equal(r.bieg?.wiek, 34);
    assert.equal(r.bieg?.czasTestowy, 18.5);
  });

  test("puste pola to pustka, a nie zero", () => {
    // Zero znaczyłoby „zmierzone i wyszło zero" — czyli coś zupełnie innego
    // niż „jeszcze nie mierzyliśmy".
    const r = dobre({ bieg: { wiek: null, hrMaxZmierzone: "", dystansTestowy: undefined } });
    assert.equal(r.bieg?.wiek, null);
    assert.equal(r.bieg?.hrMaxZmierzone, null);
  });

  test("liczba w tekście z formularza przechodzi", () => {
    // Pola `<input>` oddają tekst; odrzucanie go znaczyłoby, że własny
    // formularz konsoli nie działa.
    const r = dobre({ oddech: { twot: "28" }, bieg: { wiek: "34" } });
    assert.equal(r.oddech?.twot, 28);
    assert.equal(r.bieg?.wiek, 34);
  });

  test("można zapisać sam oddech albo sam bieg", () => {
    assert.equal(dobre({ oddech: { twot: 20 } }).bieg, undefined);
    assert.equal(dobre({ bieg: { wiek: 40 } }).oddech, undefined);
  });

  test("pola nieznane nie trafiają do bazy", () => {
    const r = dobre({ bieg: { wiek: 34, cokolwiek: "śmieć" } });
    assert.equal((r.bieg as Record<string, unknown>).cokolwiek, undefined);
  });
});

describe("czego nie zapisujemy", () => {
  const zle: [string, unknown][] = [
    ["oddech jako tekst", { oddech: "trzydzieści sekund" }],
    ["oddech jako lista", { oddech: [28] }],
    ["bieg jako tekst", { bieg: "trzy razy w tygodniu" }],
    ["wiek jako słowo", { bieg: { wiek: "trzydzieści" } }],
    ["wiek ujemny", { bieg: { wiek: -5 } }],
    ["biegi siedem razy w tygodniu", { bieg: { jednostekWTygodniu: 7 } }],
    ["tętno rodem z czajnika", { bieg: { hrMaxZmierzone: 900 } }],
    ["test oddechowy na pół godziny", { oddech: { twot: 1800 } }],
    ["nieskończoność", { bieg: { czasTestowy: Infinity } }],
    ["całe ciało jako tekst", "moduly"],
  ];

  for (const [co, wejscie] of zle) {
    test(`odmawiamy: ${co}`, () => {
      const r = sprawdzModuly(wejscie);
      assert.ok("blad" in r, `przyjęte: ${JSON.stringify(r)}`);
      assert.ok(r.blad.length > 10, "komunikat nic nie mówi");
    });
  }

  test("odmowa mówi, jakiej liczby oczekujemy", () => {
    const r = sprawdzModuly({ bieg: { jednostekWTygodniu: 7 } });
    assert.ok("blad" in r);
    assert.match(r.blad, new RegExp(`${GRANICE_MODULOW.jednostekWTygodniu[1]}`));
  });
});
