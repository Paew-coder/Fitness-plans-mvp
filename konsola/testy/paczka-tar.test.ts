/**
 * Czytanie paczki `.tar` — czyli jedyne miejsce, w którym aplikacja rozpakowuje
 * coś, co przyszło z sieci.
 *
 * Dwie rzeczy są tu warte testu, bo obie psują się cicho. Pierwsza: nazwy
 * dłuższe niż sto znaków, które tar trzyma w osobnym nagłówku `pax` — a takich
 * ścieżek jest w tym projekcie sporo (`silnik/testy/zlote/...`). Gdyby czytanie
 * paxa nie działało, część plików rozpakowałaby się pod nazwą uciętą albo
 * cudzą i nikt by nie zauważył, dopóki coś nie przestałoby się uruchamiać.
 *
 * Druga: ścieżki wychodzące poza katalog docelowy. Że archiwum pochodzi
 * z GitHuba, wie ten, kto pisał adres — nie ten, kto rozpakowuje.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { czytajTar, bezPierwszegoKatalogu } from "../paczka-tar.ts";

const BLOK = 512;

/** Jeden nagłówek tar — tyle pól, ile czyta nasz czytnik. */
function naglowek(nazwa: string, rozmiar: number, typ: string): Buffer {
  const b = Buffer.alloc(BLOK);
  b.write(nazwa.slice(0, 100), 0, "utf-8");
  b.write(rozmiar.toString(8).padStart(11, "0") + "\0", 124, "utf-8");
  b.write(typ, 156, "utf-8");
  return b;
}

function wpis(nazwa: string, tresc: string, typ = "0"): Buffer {
  const dane = Buffer.from(tresc, "utf-8");
  const dopchane = Buffer.alloc(Math.ceil(dane.length / BLOK) * BLOK);
  dane.copy(dopchane);
  return Buffer.concat([naglowek(nazwa, dane.length, typ), dopchane]);
}

/** Nagłówek pax z długą nazwą dla wpisu następującego zaraz po nim. */
function pax(sciezka: string): Buffer {
  const bez = ` path=${sciezka}\n`;
  let dlugosc = bez.length + 2;
  dlugosc = String(dlugosc + String(dlugosc).length - 2).length + bez.length;
  const tresc = `${dlugosc}${bez}`;
  return wpis("PaxHeaders/0", tresc, "x");
}

const koniec = Buffer.alloc(BLOK * 2);

describe("czytanie paczki tar", () => {
  test("zwykłe pliki wychodzą z treścią", () => {
    const wpisy = czytajTar(Buffer.concat([
      wpis("repo-galaz/README.md", "cześć"),
      wpis("repo-galaz/konsola/serwer.ts", "kod"),
      koniec,
    ]));
    assert.deepEqual(wpisy.map((w) => w.nazwa),
      ["repo-galaz/README.md", "repo-galaz/konsola/serwer.ts"]);
    assert.equal(wpisy[0]!.tresc.toString("utf-8"), "cześć");
  });

  test("katalogi są rozpoznawane, nie mylone z plikami", () => {
    const wpisy = czytajTar(Buffer.concat([
      wpis("repo-galaz/konsola/", "", "5"),
      wpis("repo-galaz/konsola/plik.ts", "x"),
      koniec,
    ]));
    assert.deepEqual(wpisy.map((w) => w.katalog), [true, false]);
  });

  test("długa nazwa z nagłówka pax wygrywa z uciętą", () => {
    // Ten sam przypadek co prawdziwe `silnik/testy/zlote/...`: nazwa nie mieści
    // się w stu bajtach, więc w samym nagłówku stoi wersja ucięta.
    const dluga = "repo-galaz/silnik/testy/zlote/" + "katalog/".repeat(9) + "wartosci.json";
    assert.ok(dluga.length > 100);
    const wpisy = czytajTar(Buffer.concat([
      pax(dluga),
      wpis(dluga.slice(0, 100), "{}"),
      koniec,
    ]));
    assert.equal(wpisy.length, 1);
    assert.equal(wpisy[0]!.nazwa, dluga);
  });

  test("nagłówek pax nie zostaje przyklejony do następnego pliku", () => {
    const dluga = "repo-galaz/" + "a/".repeat(60) + "jeden.json";
    const wpisy = czytajTar(Buffer.concat([
      pax(dluga),
      wpis(dluga.slice(0, 100), "1"),
      wpis("repo-galaz/dwa.json", "2"),
      koniec,
    ]));
    assert.deepEqual(wpisy.map((w) => w.nazwa), [dluga, "repo-galaz/dwa.json"]);
  });

  test("dwa puste bloki kończą czytanie", () => {
    const wpisy = czytajTar(Buffer.concat([
      wpis("repo-galaz/a.txt", "a"),
      koniec,
      wpis("repo-galaz/po-koncu.txt", "nie czytamy"),
    ]));
    assert.deepEqual(wpisy.map((w) => w.nazwa), ["repo-galaz/a.txt"]);
  });

  test("dowiązania i inne typy są pomijane, nie zgadywane", () => {
    const wpisy = czytajTar(Buffer.concat([
      wpis("repo-galaz/link", "cel", "2"),
      wpis("repo-galaz/plik", "treść"),
      koniec,
    ]));
    assert.deepEqual(wpisy.map((w) => w.nazwa), ["repo-galaz/plik"]);
  });
});

describe("ścieżka z paczki na dysk", () => {
  test("pierwszy katalog znika — to opakowanie GitHuba", () => {
    assert.equal(bezPierwszegoKatalogu("repo-galaz/konsola/serwer.ts"), "konsola/serwer.ts");
  });

  test("sam katalog główny nie daje ścieżki", () => {
    assert.equal(bezPierwszegoKatalogu("repo-galaz/"), null);
    assert.equal(bezPierwszegoKatalogu("repo-galaz"), null);
  });

  test("wyjście poza katalog docelowy jest odrzucane", () => {
    // Bez tego wpis nazwany „x/../../../.ssh/authorized_keys" zapisałby się
    // tam, gdzie wskazuje, a nie tam, gdzie rozpakowujemy.
    assert.equal(bezPierwszegoKatalogu("repo/../../etc/passwd"), null);
    assert.equal(bezPierwszegoKatalogu("repo/konsola/../../../x"), null);
    assert.equal(bezPierwszegoKatalogu("/etc/passwd"), null);
  });

  test("kropka w środku nazwy nie jest wyjściem w górę", () => {
    assert.equal(bezPierwszegoKatalogu("repo/docs/01-analiza.md"), "docs/01-analiza.md");
    assert.equal(bezPierwszegoKatalogu("repo/a/.gitignore"), "a/.gitignore");
  });
});
