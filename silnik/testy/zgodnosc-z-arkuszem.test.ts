/**
 * Złoty test: silnik musi policzyć dokładnie to samo co arkusz.
 *
 * Zestawy w `testy/zlote/` powstają z prawdziwych plików narzędziem
 * `narzedzia/zrzut-arkusza.py`. Każdy zawiera jednocześnie wejście (co wpisał
 * trener) i wynik (co arkusz policzył).
 *
 * Kryterium: ciężar co do grosza, stres do 0,1. Zero tolerancji.
 *
 * Import i porównanie są wspólne z narzędziem `sprawdz` — dzięki temu test
 * pilnuje dokładnie tej samej ścieżki, którą przechodzi prawdziwy plan klienta.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { przeliczPlan } from "../src/plan.ts";
import { planZArkusza, type ZrzutArkusza } from "../src/import-arkusza.ts";
import { porownajZArkuszem } from "../src/porownanie.ts";

const KATALOG_ZLOTYCH = join(dirname(fileURLToPath(import.meta.url)), "zlote");
const pliki = readdirSync(KATALOG_ZLOTYCH).filter((f) => f.endsWith(".json"));

assert.ok(pliki.length > 0, "brak zestawów w testy/zlote/ — uruchom narzedzia/zrzut-arkusza.py");

for (const plik of pliki) {
  const z: ZrzutArkusza = JSON.parse(readFileSync(join(KATALOG_ZLOTYCH, plik), "utf-8"));

  test(`zgodność z arkuszem — ${plik}`, (t) => {
    const wynik = przeliczPlan(planZArkusza(z));
    const p = porownajZArkuszem(z, wynik);

    // Pozycje, których arkusz sam nie policzył, nie są dowodem przeciw silnikowi —
    // to uszkodzone formuły w pliku. Raportujemy je, ale nie wywracamy testu.
    const rozjazdy = p.roznice.filter((r) => !r.arkuszPusty);
    const puste = p.roznice.filter((r) => r.arkuszPusty);

    if (rozjazdy.length > 0) {
      const opis = rozjazdy
        .slice(0, 10)
        .map((r) => `  ${r.gdzie} · ${r.pole}: arkusz ${r.arkusz}, silnik ${r.silnik}`)
        .join("\n");
      assert.fail(`${rozjazdy.length} rozbieżności z arkuszem:\n${opis}`);
    }

    t.diagnostic(
      `zgodnych: ${p.zgodnych}, pominiętych: ${p.pominietych}` +
      (puste.length > 0 ? `, arkusz nie policzył: ${puste.length}` : ""),
    );
    assert.ok(p.zgodnych > 0, "nie porównano ani jednej wartości");
  });
}
