/**
 * Testy logowania.
 *
 * Trzy rzeczy, które muszą trzymać, bo od nich zależy, czy cudze plany
 * treningowe leżą w internecie:
 *   1. hasło nie da się odczytać z tego, co zapisane,
 *   2. sesja da się unieważnić natychmiast,
 *   3. instalacja bez hasła nie wpuszcza nikogo z zewnątrz.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KATALOG = mkdtempSync(join(tmpdir(), "auth-test-"));
process.env.BAZA_CRAFTMYPLAN = join(KATALOG, "test.db");

const auth = await import("../uwierzytelnianie.ts");
const { baza, zamknij, trenerDomyslny } = await import("../baza/polaczenie.ts");

let TRENER = 0;
before(() => { TRENER = trenerDomyslny(); });
after(() => { zamknij(); rmSync(KATALOG, { recursive: true, force: true }); });

describe("hasło", () => {
  test("skrót nie zawiera hasła i za każdym razem jest inny", () => {
    const a = auth.zahaszuj("moje-tajne-haslo");
    const b = auth.zahaszuj("moje-tajne-haslo");
    assert.notEqual(a, b, "ta sama treść, inna sól");
    assert.ok(!a.includes("moje-tajne-haslo"));
    assert.match(a, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  });

  test("pasuje tylko właściwe hasło", () => {
    const skrot = auth.zahaszuj("prawidłowe-hasło-123");
    assert.equal(auth.pasuje("prawidłowe-hasło-123", skrot), true);
    assert.equal(auth.pasuje("prawidłowe-hasło-124", skrot), false);
    assert.equal(auth.pasuje("", skrot), false);
  });

  test("uszkodzony skrót odrzuca, zamiast się wywalić", () => {
    assert.equal(auth.pasuje("cokolwiek", "śmieci"), false);
    assert.equal(auth.pasuje("cokolwiek", "bcrypt$aa$bb"), false);
    assert.equal(auth.pasuje("cokolwiek", ""), false);
  });

  test("znaki diakrytyczne porównują się po normalizacji", () => {
    // „ł" da się zapisać na dwa sposoby; klawiatura i menedżer haseł mogą
    // wybrać różne, a to nie może decydować o wejściu.
    const skrot = auth.zahaszuj("hasło-z-ogonkiem".normalize("NFD"));
    assert.equal(auth.pasuje("hasło-z-ogonkiem".normalize("NFC"), skrot), true);
  });
});

describe("tryb dostępu", () => {
  test("bez hasła — tryb lokalny", () => {
    auth.ustawHaslo(TRENER, null);
    assert.deepEqual(auth.trybDostepu(TRENER), { tryb: "lokalny", trenerId: TRENER });
  });

  test("z hasłem — logowanie wymagane", () => {
    auth.ustawHaslo(TRENER, "hasło-produkcyjne");
    assert.deepEqual(auth.trybDostepu(TRENER), { tryb: "hasło" });
    auth.ustawHaslo(TRENER, null);
  });

  test("lokalne wpuszcza tylko z tej maszyny", () => {
    for (const adres of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      assert.equal(auth.zLokalnejMaszyny(adres), true, adres);
    }
    for (const adres of ["192.168.1.10", "10.0.0.1", "203.0.113.7", undefined]) {
      assert.equal(auth.zLokalnejMaszyny(adres), false, String(adres));
    }
  });
});

describe("sesje", () => {
  test("token z zalogowania prowadzi do trenera", () => {
    const token = auth.zaloguj(TRENER);
    assert.equal(auth.trenerZSesji(token), TRENER);
    assert.equal(auth.trenerZSesji("nieistniejacy"), null);
    assert.equal(auth.trenerZSesji(null), null);
  });

  test("wylogowanie unieważnia natychmiast", () => {
    const token = auth.zaloguj(TRENER);
    auth.wyloguj(token);
    assert.equal(auth.trenerZSesji(token), null);
  });

  test("zmiana hasła wylogowuje wszystkie urządzenia", () => {
    const telefon = auth.zaloguj(TRENER);
    const laptop = auth.zaloguj(TRENER);
    auth.ustawHaslo(TRENER, "nowe-hasło-po-kradzieży");

    assert.equal(auth.trenerZSesji(telefon), null, "zgubiony telefon traci dostęp");
    assert.equal(auth.trenerZSesji(laptop), null);
    auth.ustawHaslo(TRENER, null);
  });

  test("przeterminowana sesja nie działa i znika z bazy", () => {
    const wczoraj = new Date(Date.now() - 86_400_000).toISOString();
    baza().prepare(
      "INSERT INTO sesja (token, trener_id, utworzona, wygasa) VALUES (?, ?, ?, ?)",
    ).run("stara-sesja", TRENER, wczoraj, wczoraj);

    assert.equal(auth.trenerZSesji("stara-sesja"), null);
    const { c } = baza().prepare(
      "SELECT COUNT(*) AS c FROM sesja WHERE token = 'stara-sesja'",
    ).get() as { c: number };
    assert.equal(c, 0, "przeterminowane sesje sprzątają się same");
  });
});

describe("ciasteczka", () => {
  test("czyta swoje z gąszczu cudzych", () => {
    assert.equal(auth.ciastkoZNaglowka("cmp_sesja=abc123"), "abc123");
    assert.equal(auth.ciastkoZNaglowka("inne=1; cmp_sesja=abc123; jeszcze=2"), "abc123");
    assert.equal(auth.ciastkoZNaglowka("inne=1"), null);
    assert.equal(auth.ciastkoZNaglowka(undefined), null);
    assert.equal(auth.ciastkoZNaglowka("cmp_sesja_podobne=zle"), null,
      "nazwa musi się zgadzać w całości");
  });

  test("ciasteczko sesji jest niedostępne dla skryptów", () => {
    const c = auth.ciastkoSesji("token123", false);
    assert.match(c, /HttpOnly/, "skrypt na stronie nie może go odczytać");
    assert.match(c, /SameSite=Lax/, "nie jedzie przy żądaniach z obcych stron");
    assert.ok(!c.includes("Secure"), "bez HTTPS nie obiecujemy Secure");
  });

  test("za HTTPS dochodzi Secure", () => {
    assert.match(auth.ciastkoSesji("token123", true), /Secure/);
  });

  test("kasujące ciasteczko ma zerowy czas życia", () => {
    const c = auth.ciastkoSesji(null, false);
    assert.match(c, /Max-Age=0/);
    assert.match(c, /cmp_sesja=;/);
  });
});
