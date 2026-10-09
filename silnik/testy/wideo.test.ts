/**
 * Filmy ćwiczeń osobno od BAZY — test biblioteki OPEX Fitness (09.10.2026).
 *
 * Trener: „każde ćwiczenie ma mieć własny identyfikator i przypisany film,
 * baza niezależna od źródła wideo, w przyszłości własne MP4 bez przebudowy
 * bazy. Na razie nie dodawaj innych ćwiczeń”.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { katalog } from "../src/katalog.ts";
import { BAZA_CWICZEN } from "../src/dane/cwiczenia.ts";
import { FILMY_CWICZEN, ZRODLA_WIDEO } from "../src/dane/filmy.ts";
import { kartaCwiczenia, sprawdzFilmy, wideoCwiczenia, type WpisWideo } from "../src/wideo.ts";

describe("Barbell bench press z biblioteki OPEX", () => {
  test("to istniejące EX-0011, nie nowe ćwiczenie — BAZA dalej ma 166 pozycji", () => {
    assert.equal(BAZA_CWICZEN.length, 166);
    const lawka = BAZA_CWICZEN.filter((c) => c.nazwa.toLowerCase() === "barbell bench press");
    assert.equal(lawka.length, 1, "bez duplikatu");
    assert.equal(lawka[0]!.id, "EX-0011");
    // Nazwa z BAZY bez zmian: po niej import arkusza i reguły klasycznych bojów.
    assert.equal(lawka[0]!.nazwa, "Barbell bench press");
    assert.equal(katalog.poNazwie("Barbell Bench Press")?.id, "EX-0011");
  });

  test("opis ćwiczenia: nazwy, mięśnie, sprzęt, kategoria", () => {
    const k = kartaCwiczenia(katalog.poId("EX-0011")!)!;
    assert.equal(k.nazwaEn, "Barbell Bench Press");
    assert.equal(k.nazwaPl, "Wyciskanie sztangi leżąc");
    assert.deepEqual(k.miesnieGlowne, ["mięsień piersiowy większy"]);
    assert.deepEqual(k.miesniePomocnicze, ["triceps", "przednia część mięśnia naramiennego"]);
    assert.deepEqual(k.sprzet, ["sztanga", "ławka pozioma"]);
    assert.equal(k.rodzaj, "trening siłowy");
    assert.equal(k.kategoria, "Upper push horizontal");
  });

  test("film: YouTube ejI1Nlsul9k z kanału OPEX Fitness, z linkiem do oryginału", () => {
    const w = wideoCwiczenia("EX-0011")!;
    assert.equal(w.typ, "youtube");
    assert.equal(w.youtubeId, "ejI1Nlsul9k");
    assert.equal(w.tytul, "Barbell Bench Press - OPEX Exercise Library");
    assert.equal(w.link, "https://www.youtube.com/watch?v=ejI1Nlsul9k");
    assert.deepEqual(w.zrodlo, { nazwa: "OPEX Fitness", platforma: "YouTube", url: "https://www.youtube.com/@OPEXFitness" });
    const z = ZRODLA_WIDEO.find((x) => x.id === "opex-youtube")!;
    assert.equal(z.kanalId, "UCCgDGih2kSp0A6W_0cVYuaQ");
  });

  test("na razie tylko to jedno ćwiczenie ma kartę; reszta BAZY bez zmian", () => {
    assert.equal(FILMY_CWICZEN.length, 1);
    const zKarta = BAZA_CWICZEN.filter((c) => kartaCwiczenia(c));
    assert.deepEqual(zKarta.map((c) => c.id), ["EX-0011"]);
    // Pozostałe zostają przy dotychczasowym linku z arkusza.
    assert.equal(wideoCwiczenia("EX-0059"), null);
    assert.equal(katalog.poId("EX-0059")!.film, "https://youtu.be/db-h-UBzbhE");
  });
});

describe("filmy niezależne od BAZY", () => {
  test("dane filmów są spójne z BAZĄ", () => {
    assert.deepEqual(sprawdzFilmy(), []);
  });

  test("zamiana YouTube na własny MP4 = zmiana jednego wpisu; ćwiczenie i karta te same", () => {
    const wlasne: WpisWideo[] = [{ id: "WID-0001", cwiczenieId: "EX-0011", typ: "plik",
      plik: "/filmy/EX-0011.mp4", zrodlo: "wlasne", tytul: "Wyciskanie sztangi leżąc" }];
    const zrodla = [{ id: "wlasne", nazwa: "CraftMyPlan", platforma: "własne" }];
    const k = kartaCwiczenia(katalog.poId("EX-0011")!, wlasne, zrodla)!;
    assert.equal(k.cwiczenieId, "EX-0011");
    assert.equal(k.nazwaPl, "Wyciskanie sztangi leżąc");
    assert.deepEqual(k.wideo, { typ: "plik", plik: "/filmy/EX-0011.mp4", tytul: "Wyciskanie sztangi leżąc",
      link: null, zrodlo: { nazwa: "CraftMyPlan", platforma: "własne", url: null } });
    assert.deepEqual(sprawdzFilmy(wlasne, zrodla), []);
  });

  test("kontrola łapie złe wpisy: nieznane ćwiczenie, drugi film, złe id YouTube, plik bez adresu", () => {
    const zle: WpisWideo[] = [
      { id: "A", cwiczenieId: "EX-9999", typ: "youtube", youtubeId: "ejI1Nlsul9k", zrodlo: "opex-youtube", tytul: "x" },
      { id: "B", cwiczenieId: "EX-0011", typ: "youtube", youtubeId: "ejI1Nlsul9k", zrodlo: "opex-youtube", tytul: "x" },
      { id: "C", cwiczenieId: "EX-0011", typ: "youtube", youtubeId: "za-krotkie", zrodlo: "opex-youtube", tytul: "x" },
      { id: "C", cwiczenieId: "EX-0059", typ: "plik", zrodlo: "nieznane", tytul: "x" },
    ];
    const problemy = sprawdzFilmy(zle).join(" | ");
    assert.match(problemy, /nie ma ćwiczenia EX-9999/);
    assert.match(problemy, /EX-0011 ma już film/);
    assert.match(problemy, /złe id filmu YouTube/);
    assert.match(problemy, /powtórzony identyfikator/);
    assert.match(problemy, /nieznane źródło/);
    assert.match(problemy, /plik bez adresu/);
  });

  test("wpis z błędnym id YouTube nie trafia do aplikacji jako film", () => {
    const zly: WpisWideo[] = [{ id: "X", cwiczenieId: "EX-0011", typ: "youtube", youtubeId: "<script>", zrodlo: "opex-youtube", tytul: "x" }];
    assert.equal(wideoCwiczenia("EX-0011", zly), null);
  });
});
