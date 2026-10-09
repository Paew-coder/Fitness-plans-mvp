/**
 * Filmy ćwiczeń osobno od BAZY — test biblioteki OPEX Fitness (09.10.2026)
 * i import bibliotek Theory of Motion i Catalyst Athletics (ten sam dzień).
 *
 * Trener: „każde ćwiczenie ma mieć własny identyfikator i przypisany film,
 * baza niezależna od źródła wideo, w przyszłości własne MP4 bez przebudowy
 * bazy”. Potem: „jeżeli w pierwszej bazie mamy już ćwiczenie, a na kanale
 * z poradnikami jest to samo, to ćwiczenie może zawierać dwa nagrania —
 * jedno standardowe, a drugie poradnikowe”.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { katalog } from "../src/katalog.ts";
import { BAZA_CWICZEN } from "../src/dane/cwiczenia.ts";
import { FILMY_CWICZEN, ZRODLA_WIDEO } from "../src/dane/filmy.ts";
import { filmyCwiczenia, kartaCwiczenia, sprawdzFilmy, wideoCwiczenia, type WpisWideo } from "../src/wideo.ts";
import { dobierzCwiczenia } from "../src/dobor-cwiczen.ts";
import type { Plan } from "../src/plan.ts";

describe("Barbell bench press z biblioteki OPEX", () => {
  test("to istniejące EX-0011, nie nowe ćwiczenie — BAZA trenera dalej ma 166 pozycji", () => {
    assert.equal(katalog.bazaTrenera.length, 166);
    const lawka = BAZA_CWICZEN.filter((c) => c.nazwa.toLowerCase() === "barbell bench press");
    assert.equal(lawka.length, 1, "bez duplikatu — także po imporcie bibliotek");
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

  test("pierwszy film: YouTube ejI1Nlsul9k z kanału OPEX Fitness, z linkiem do oryginału", () => {
    const w = wideoCwiczenia("EX-0011")!;
    assert.equal(w.typ, "youtube");
    assert.equal(w.rola, "demonstracja");
    assert.equal(w.youtubeId, "ejI1Nlsul9k");
    assert.equal(w.tytul, "Barbell Bench Press - OPEX Exercise Library");
    assert.equal(w.link, "https://www.youtube.com/watch?v=ejI1Nlsul9k");
    assert.deepEqual(w.zrodlo, { nazwa: "OPEX Fitness", platforma: "YouTube", url: "https://www.youtube.com/@OPEXFitness" });
    const z = ZRODLA_WIDEO.find((x) => x.id === "opex-youtube")!;
    assert.equal(z.kanalId, "UCCgDGih2kSp0A6W_0cVYuaQ");
  });
});

describe("biblioteki Theory of Motion i Catalyst Athletics", () => {
  test("wyciskanie ma pokazy i poradniki: najpierw pokazy (OPEX, ToM), potem poradniki (Catalyst, ToM)", () => {
    const filmy = filmyCwiczenia("EX-0011");
    const role = filmy.map((f) => f.rola);
    assert.deepEqual(role, [...role].sort((a, b) => (a === b ? 0 : a === "demonstracja" ? -1 : 1)), "pokazy przed poradnikami");
    // ToM wrzucał to samo ćwiczenie kilka razy — wszystkie nagrania są przy ćwiczeniu.
    const zrodla = (rola: string) => [...new Set(filmy.filter((f) => f.rola === rola).map((f) => f.zrodlo.nazwa))];
    assert.deepEqual(zrodla("demonstracja"), ["OPEX Fitness", "Theory of Motion Exercise Library"]);
    assert.deepEqual(zrodla("poradnik"), ["Catalyst Athletics", "Theory of Motion Exercise Library"]);
    assert.equal(kartaCwiczenia(katalog.poId("EX-0011")!)!.filmy.length, filmy.length);
  });

  test("ćwiczenie z BAZY trenera dostało film, a jego link z arkusza zostaje", () => {
    // EX-0059 Dumbbell bench press = „2DB Bench Press” z Theory of Motion.
    const w = wideoCwiczenia("EX-0059")!;
    assert.equal(w.zrodlo.nazwa, "Theory of Motion Exercise Library");
    assert.equal(katalog.poId("EX-0059")!.film, "https://youtu.be/db-h-UBzbhE");
  });

  test("SLDL z BAZY to martwy ciąg na prostych nogach, nie jednonóż — film stiff-legged", () => {
    // EX-0018 nie jest jednostronne (decyzja trenera), więc „Single Leg Deadlift” byłoby błędem.
    const tytuly = filmyCwiczenia("EX-0018").map((f) => f.tytul.toLowerCase());
    assert.ok(tytuly.length > 0);
    assert.ok(tytuly.every((t) => /stiff|sldl/.test(t)), tytuly.join(" | "));
  });

  test("każde ćwiczenie z biblioteki ma film, źródło i komplet pól BAZY", () => {
    const zBibliotek = katalog.wszystkie.filter((c) => c.biblioteka);
    assert.ok(zBibliotek.length > 2500, `ćwiczeń z bibliotek: ${zBibliotek.length}`);
    for (const c of zBibliotek) {
      const filmy = filmyCwiczenia(c.id);
      assert.ok(filmy.length > 0, `${c.id} ${c.nazwa}: bez filmu`);
      assert.equal(c.film, `https://youtu.be/${(filmy.find((f) => f.rola === "demonstracja") ?? filmy[0])!.youtubeId}`, c.id);
      assert.ok(["tom", "catalyst"].includes(c.biblioteka!), c.id);
      assert.ok(c.kategoria && c.part && c.coeff && c.progresja, c.id);
    }
    // Catalyst to poradniki (omówienie techniki); ToM — pokazy i kilka dłuższych poradników.
    const catalyst = FILMY_CWICZEN.filter((f) => f.zrodlo === "catalyst-youtube");
    assert.ok(catalyst.length > 400, `filmów Catalyst: ${catalyst.length}`);
    assert.ok(catalyst.every((f) => f.rola === "poradnik"));
  });

  test("nazwy unikalne bez względu na wielkość liter — import arkusza szuka po nazwie", () => {
    const nazwy = katalog.wszystkie.map((c) => c.nazwa.toLocaleLowerCase("pl"));
    assert.equal(new Set(nazwy).size, nazwy.length);
  });

  test("id ćwiczeń z bibliotek idą po BAZIE trenera i się nie powtarzają", () => {
    const max = Math.max(...katalog.bazaTrenera.map((c) => Number(c.id.slice(3))));
    const ids = katalog.wszystkie.filter((c) => c.biblioteka).map((c) => Number(c.id.slice(3)));
    assert.ok(Math.min(...ids) > max);
    assert.equal(new Set(katalog.wszystkie.map((c) => c.id)).size, katalog.wszystkie.length);
  });

  test("generator nie losuje ćwiczeń z bibliotek — tylko z BAZY trenera", () => {
    const plan = {
      nazwa: "t", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość", serieMaksymalne: [],
      sloty: ["Lower push", "Core", "Upper pull horizontal", "Lower pull"].flatMap((k, i) =>
        ["A", "B", "C", "D", "E"].map((lp, j) => ({ positionId: `D${i + 1}-S0${j + 1}`, dzien: i + 1, lp: `${lp}1`,
          cwiczenieId: null, kategoriaSzkieletu: k, tygodnie: {} }))),
    } as unknown as Plan;
    for (let ziarno = 0; ziarno < 20; ziarno++) {
      let x = ziarno + 1;
      const los = () => ((x = (x * 16807) % 2147483647) / 2147483647);
      const { plan: wynik } = dobierzCwiczenia(plan, { los });
      for (const s of wynik.sloty) {
        if (s.cwiczenieId) assert.equal(katalog.poId(s.cwiczenieId)!.biblioteka, undefined, s.cwiczenieId);
      }
    }
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
    assert.deepEqual(k.wideo, { typ: "plik", rola: "demonstracja", plik: "/filmy/EX-0011.mp4", tytul: "Wyciskanie sztangi leżąc",
      link: null, zrodlo: { nazwa: "CraftMyPlan", platforma: "własne", url: null } });
    assert.deepEqual(k.filmy, [k.wideo]);
    assert.deepEqual(sprawdzFilmy(wlasne, zrodla), []);
  });

  test("kontrola łapie złe wpisy: nieznane ćwiczenie, ten sam film dwa razy, zła rola, złe id YouTube, plik bez adresu", () => {
    const zle: WpisWideo[] = [
      { id: "A", cwiczenieId: "EX-9999", typ: "youtube", youtubeId: "ejI1Nlsul9k", zrodlo: "opex-youtube", tytul: "x" },
      { id: "B", cwiczenieId: "EX-0011", typ: "youtube", youtubeId: "ejI1Nlsul9k", zrodlo: "opex-youtube", tytul: "x" },
      { id: "B2", cwiczenieId: "EX-0011", typ: "youtube", youtubeId: "ejI1Nlsul9k", zrodlo: "opex-youtube", tytul: "x", rola: "poradnik" },
      { id: "B3", cwiczenieId: "EX-0011", typ: "youtube", youtubeId: "aaaaaaaaaaa", zrodlo: "opex-youtube", tytul: "x", rola: "reklama" as never },
      { id: "C", cwiczenieId: "EX-0011", typ: "youtube", youtubeId: "za-krotkie", zrodlo: "opex-youtube", tytul: "x" },
      { id: "C", cwiczenieId: "EX-0059", typ: "plik", zrodlo: "nieznane", tytul: "x" },
    ];
    const problemy = sprawdzFilmy(zle).join(" | ");
    assert.match(problemy, /nie ma ćwiczenia EX-9999/);
    assert.match(problemy, /B2: ten sam film już jest przy EX-0011/);
    assert.match(problemy, /B3: nieznana rola/);
    assert.doesNotMatch(problemy, /\bB:/, "drugi, inny film przy ćwiczeniu jest w porządku");
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
