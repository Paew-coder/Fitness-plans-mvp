/**
 * Awaria Pythona przetłumaczona na zdanie, z którym trener wie, co zrobić.
 *
 * Eksport i wczytywanie arkuszy idą przez Pythona, bo tylko `openpyxl` czyta
 * `.xlsx`. Na świeżo postawionym komputerze tej biblioteki zwykle nie ma —
 * a trener dostawał wtedy w przeglądarce surowy ślad stosu: angielskie
 * „ModuleNotFoundError", ścieżki z dysku i nazwy plików źródłowych.
 *
 * Przy wczytywaniu arkusza było jeszcze gorzej: brak biblioteki kończył się
 * zdaniem „czy to arkusz w układzie 5.17/5.18?", czyli aplikacja obwiniała
 * plik trenera za własny brak. Człowiek szukałby wtedy błędu w swoim arkuszu.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { bladSrodowiskaPythona, pierwszaLiniaBledu } from "../blad-pythona.ts";

/** Błąd taki, jaki rzuca `execFileSync`: treść w `stderr`, kod w `code`. */
function awaria(stderr: string, code?: string): Error {
  const e = new Error("Command failed: python3 /jakas/sciezka/skrypt.py") as Error
    & { stderr: Buffer; code?: string };
  e.stderr = Buffer.from(stderr);
  if (code) e.code = code;
  return e;
}

describe("rozpoznanie przyczyny", () => {
  test("brak Pythona mówi, skąd go wziąć", () => {
    const tresc = bladSrodowiskaPythona(awaria("", "ENOENT"))!;
    assert.match(tresc, /Pythona/);
    assert.match(tresc, /pip install openpyxl/);
  });

  test("brak openpyxl mówi, co wpisać", () => {
    const tresc = bladSrodowiskaPythona(awaria(
      "Traceback (most recent call last):\n"
      + '  File "/app/konsola/narzedzia/wypelnij-arkusz.py", line 3, in <module>\n'
      + "ModuleNotFoundError: No module named 'openpyxl'\n"))!;
    assert.match(tresc, /openpyxl/);
    assert.match(tresc, /pip install openpyxl/);
  });

  test("brak innej biblioteki wymienia jej nazwę", () => {
    const tresc = bladSrodowiskaPythona(awaria(
      "ModuleNotFoundError: No module named 'cokolwiek'\n"))!;
    assert.match(tresc, /cokolwiek/);
    assert.match(tresc, /pip install cokolwiek/);
  });

  test("brak uprawnień do zapisu jest nazwany po imieniu", () => {
    const tresc = bladSrodowiskaPythona(awaria(
      "PermissionError: [Errno 13] Permission denied: '/app/konsola/dane/eksport'\n"))!;
    assert.match(tresc, /uprawnie/i);
  });

  test("awaria spoza środowiska nie jest zgadywana", () => {
    // Zły plik to zły plik — tam sens ma komunikat z miejsca wywołania,
    // a nie porada o instalowaniu czegokolwiek.
    assert.equal(
      bladSrodowiskaPythona(awaria("zipfile.BadZipFile: File is not a zip file\n")),
      null);
  });
});

describe("komunikat, który trafia do trenera", () => {
  test("nie niesie ścieżek z dysku ani śladu stosu", () => {
    const przypadki = [
      awaria("", "ENOENT"),
      awaria("ModuleNotFoundError: No module named 'openpyxl'\n"),
      awaria("PermissionError: [Errno 13] Permission denied: '/app/konsola/dane'\n"),
    ];
    for (const blad of przypadki) {
      const tresc = bladSrodowiskaPythona(blad)!;
      assert.doesNotMatch(tresc, /\/app\/|\/home\/|Traceback|File "/,
        `komunikat pokazuje wnętrze: ${tresc}`);
    }
  });

  test("z długiego śladu stosu zostaje linia z treścią", () => {
    const blad = awaria(
      "Traceback (most recent call last):\n"
      + '  File "/app/a.py", line 3, in <module>\n'
      + '  File "/app/b.py", line 9, in wypelnij\n'
      + "ValueError: nie ta zakładka\n");
    assert.equal(pierwszaLiniaBledu(blad), "ValueError: nie ta zakładka");
  });

  test("gdy Python nic nie wypisał, nie zdradzamy komendy ze ścieżkami", () => {
    // Komunikat Node'a niesie pełną komendę razem ze ścieżkami z dysku.
    const cichy = pierwszaLiniaBledu(awaria("", "ENOENT"));
    assert.doesNotMatch(cichy, /\/jakas\/sciezka|Command failed/, cichy);
  });
});
