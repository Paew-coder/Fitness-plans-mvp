/**
 * Odzyskiwanie klientów z poprzedniej paczki.
 *
 * Powód, dla którego to narzędzie istnieje, jest opisany w nim samym: ręczne
 * przeniesienie katalogu `dane` między paczkami okazało się drogą, na której
 * da się pomylić na sześć sposobów, a stawką jest praca nie do odtworzenia.
 *
 * Te testy jadą całą drogą przez prawdziwy proces, na prawdziwych plikach
 * bazy — bo połowa pułapek siedzi właśnie w plikach, nie w logice: baza
 * w trybie WAL trzyma świeże zapisy w pliku obok, a katalog z kopiami leży
 * w środku tego, co przenosimy.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const NARZEDZIE = join(KONSOLA, "narzedzia", "znajdz-dane.ts");

let katalog = "";
/** Baza „tutaj" — ta, do której narzędzie przenosi. */
let tutaj = "";

/** Zakłada instalację z bazą i podanymi klientami. Zwraca ścieżkę do bazy. */
async function instalacja(nazwa: string, klienci: string[]): Promise<string> {
  const dane = join(katalog, nazwa, "konsola", "dane");
  mkdirSync(dane, { recursive: true });
  const baza = join(dane, "craftmyplan.db");

  const { baza: otworz, trenerDomyslny, zamknij } = await import(
    `${join(KONSOLA, "baza", "polaczenie.ts")}?baza=${encodeURIComponent(baza)}`);
  void otworz; void trenerDomyslny; void zamknij;
  return baza;
}

/** Uruchomienie narzędzia jak z wiersza poleceń — z własnymi korzeniami. */
function uruchom(args: string[], bazaTutaj: string): string {
  return execFileSync(process.execPath, ["--no-warnings", NARZEDZIE, ...args], {
    cwd: KONSOLA,
    encoding: "utf-8",
    env: {
      ...process.env,
      BAZA_CRAFTMYPLAN: bazaTutaj,
      KOPIE_CRAFTMYPLAN: join(dirname(bazaTutaj), "kopie"),
      KORZENIE_CRAFTMYPLAN: katalog,
      PORT: "0",
    },
  });
}

/** Baza z klientami — zakładana przez ten sam kod, co prawdziwa konsola. */
function zaloz(sciezka: string, klienci: string[]): void {
  mkdirSync(dirname(sciezka), { recursive: true });
  execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", `
    process.env.BAZA_CRAFTMYPLAN = ${JSON.stringify(sciezka)};
    const { baza } = await import(${JSON.stringify(join(KONSOLA, "baza", "polaczenie.ts"))});
    const { zapisz, zapewnijKlienta, pustyPlan, nowyId } = await import(${JSON.stringify(join(KONSOLA, "magazyn.ts"))});
    const { trenerDomyslny } = await import(${JSON.stringify(join(KONSOLA, "baza", "polaczenie.ts"))});
    const trener = trenerDomyslny();
    for (const nazwa of ${JSON.stringify(klienci)}) {
      const osoba = zapewnijKlienta(trener, nazwa);
      zapisz({
        id: nowyId(nazwa, 1), trenerId: trener, klientId: osoba.id, klient: osoba.nazwa,
        wersja: 1, status: "szkic", dataStartu: null, utworzony: "", zmieniony: "",
        plan: pustyPlan(osoba.nazwa),
      });
    }
    baza().close();
  `], { cwd: KONSOLA, stdio: "ignore" });
}

before(() => {
  katalog = mkdtempSync(join(tmpdir(), "znajdz-dane-"));
  tutaj = join(katalog, "nowa-paczka", "konsola", "dane", "craftmyplan.db");
  zaloz(join(katalog, "stara-paczka", "konsola", "dane", "craftmyplan.db"), ["Tomasz"]);
  zaloz(join(katalog, "jeszcze-starsza", "konsola", "dane", "craftmyplan.db"),
    ["Anna", "Marek", "Zuzanna"]);
});

after(() => rmSync(katalog, { recursive: true, force: true }));

describe("szukanie baz z poprzednich paczek", () => {
  test("znajduje obie i stawia bogatszą na górze", () => {
    const wyjscie = uruchom([], tutaj);
    assert.match(wyjscie, /\[1\][^\n]*3 klientów/);
    assert.match(wyjscie, /\[2\][^\n]*1 klient/);
    assert.match(wyjscie, /jeszcze-starsza/);
    assert.match(wyjscie, /stara-paczka/);
  });

  test("podgląd niczego nie przenosi", () => {
    uruchom([], tutaj);
    assert.equal(existsSync(tutaj), false, "podgląd założył bazę, a nie miał prawa");
  });

  test("pusta baza nie trafia na listę", () => {
    // Świeżo rozpakowana paczka ma katalog `dane` bez ani jednego klienta.
    // Zaproponowanie jej jako źródła odzysku byłoby propozycją nadpisania
    // pracy pustką.
    zaloz(join(katalog, "pusta-paczka", "konsola", "dane", "craftmyplan.db"), []);
    const wyjscie = uruchom([], tutaj);
    assert.doesNotMatch(wyjscie, /pusta-paczka/);
  });

  test("przenosi wskazaną pozycję, nie zawsze pierwszą", () => {
    uruchom(["--wykonaj", "2"], tutaj);
    const po = uruchom([], tutaj);
    assert.match(po, /Tutaj[\s\S]*?1 klientów · 1 planów/);
  });

  test("przed nadpisaniem odkłada to, co tu było", () => {
    // Pierwsze przeniesienie zostawiło tu Tomka. Drugie bierze trzech innych
    // — i Tomasz musi mieć gdzie wrócić, bo pomyłka w wyborze jest tanią
    // pomyłką tylko wtedy, gdy da się ją cofnąć.
    uruchom(["--wykonaj", "1"], tutaj);
    const kopie = readdirSync(join(dirname(tutaj), "kopie"));
    assert.ok(kopie.some((k) => k.includes("przed-odtworzeniem")),
      `brak kopii bezpieczeństwa: ${kopie.join(", ")}`);
    const po = uruchom([], tutaj);
    assert.match(po, /Tutaj[\s\S]*?3 klientów · 3 planów/);
  });

  test("numer spoza listy jest odmową, nie awarią", () => {
    let kod = 0;
    try {
      uruchom(["--wykonaj", "9"], tutaj);
    } catch (blad) {
      kod = (blad as { status: number }).status;
      assert.match(String((blad as { stderr: string }).stderr), /Nie ma pozycji/);
    }
    assert.equal(kod, 1);
  });

  test("baza, która nie jest bazą, jest pomijana bez wysypki", () => {
    const udawana = join(katalog, "uszkodzona", "konsola", "dane");
    mkdirSync(udawana, { recursive: true });
    writeFileSync(join(udawana, "craftmyplan.db"), "to nie jest baza danych");
    const wyjscie = uruchom([], tutaj);
    assert.doesNotMatch(wyjscie, /uszkodzona/);
  });
});
