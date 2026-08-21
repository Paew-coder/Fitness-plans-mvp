#!/usr/bin/env node
/**
 * Pełne kółko: konsola → arkusz → przeliczenie → konsola.
 *
 *   npm run sprawdz-kolko
 *
 * To jest kontrola, na której stoi cały projekt. Umowa brzmi: **klient dostaje
 * te same liczby, które trener widział na ekranie** — a po drodze jest eksport
 * do szablonu 5.18, formuły arkusza i import z powrotem. Rozjazd w którymkolwiek
 * miejscu znaczy, że ktoś trenuje według innych liczb, niż mu zaplanowano.
 *
 * Kółko sprawdzało się dotąd ręcznie, kilkanaście komend pod rząd — i dlatego
 * po każdej zmianie w eksporcie zostawało niesprawdzone. Tu jest w jednym
 * poleceniu, z dwiema połowami:
 *
 *   1. arkusz przeliczony w LibreOffice **liczy to samo co silnik**,
 *   2. ten sam plik wczytany z powrotem **daje ten sam plan**.
 *
 * Wymaga LibreOffice (`soffice`) i Pythona z `openpyxl`. Nie chodzi w `npm test`,
 * bo przeliczenie arkusza trwa kilkadziesiąt sekund.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { doliczBledy, podsumuj, sprawdz, zSerwerem, type Srodowisko }
  from "./przegladarka.ts";

const PORT = 4194;
const PLAN = "kolko-kontrolne-1";
const WROCONE = "kolko-wrocone-1";

function maLibreOffice(): boolean {
  try {
    execFileSync("soffice", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Plan jak z życia: trzy dni, bój główny i akcesoria z różnych wzorców, serie
 * maksymalne dla każdego ćwiczenia, progresja z szablonu i kilka ocen klienta.
 * Oceny są tu po to, żeby przez arkusz przeszła też pętla adaptacji, a nie
 * sam szkielet.
 */
async function zasiej({ api }: Srodowisko): Promise<string> {
  const cwiczenia = await api("/api/cwiczenia");
  const wgKategorii = new Map<string, string[]>();
  for (const c of cwiczenia) {
    wgKategorii.set(c.kategoria, [...(wgKategorii.get(c.kategoria) ?? []), c.id]);
  }
  const z = (kategoria: string, i = 0) => wgKategorii.get(kategoria)![i]!;

  const uklad: Record<string, string> = {
    "D1-S01": z("Lower push"), "D1-S02": z("Upper pull horizontal"), "D1-S03": z("Core"),
    "D1-S04": z("Bicep"), "D1-S05": z("Tricep"),
    "D2-S01": z("Upper push horizontal"), "D2-S02": z("Lower pull"),
    "D2-S03": z("Upper pull vertical"), "D2-S04": z("Core", 1),
    "D3-S01": z("Upper push vertical"), "D3-S02": z("Lower push", 1),
    "D3-S03": z("Upper pull horizontal", 1), "D3-S04": z("Bicep", 1), "D3-S05": z("Core", 2),
  };
  const serie = [[140, 3], [80, 5], [45, 8], [35, 10], [30, 10], [100, 4], [90, 5],
    [55, 6], [25, 12], [60, 6], [120, 3], [70, 8], [32, 10], [20, 15]];

  await api("/api/plany", "POST", { klient: "Kolko kontrolne", wersja: 1 });
  const plan = (await api(`/api/plany/${PLAN}`)).zapisany.plan;
  for (const s of plan.sloty) if (uklad[s.positionId]) s.cwiczenieId = uklad[s.positionId];
  plan.serieMaksymalne = Object.values(uklad).map((cwiczenieId, i) => ({
    cwiczenieId, ciezar: serie[i]![0], powtorzenia: serie[i]![1],
  }));
  await api(`/api/plany/${PLAN}`, "PUT",
    { plan, dataStartu: "2026-09-01", status: "szkic" });
  await api(`/api/plany/${PLAN}/tygodnie`, "POST", { tryb: "progresja", zrodlo: 1 });

  const zProgresja = (await api(`/api/plany/${PLAN}`)).zapisany.plan;
  for (const s of zProgresja.sloty) {
    if (["D1-S01", "D2-S01", "D3-S02"].includes(s.positionId)) s.tygodnie["1"].feedback = "za łatwe";
    if (["D1-S03", "D2-S02"].includes(s.positionId)) s.tygodnie["1"].feedback = "za trudne";
    if (s.positionId === "D1-S02") s.tygodnie["2"].feedback = "OK";
  }
  await api(`/api/plany/${PLAN}`, "PUT",
    { plan: zProgresja, dataStartu: "2026-09-01", status: "szkic" });

  const o = await api(`/api/plany/${PLAN}`);
  const bledy = o.uwagi.filter((u: any) => u.poziom === "blad");
  sprawdz("plan kontrolny przechodzi kontrolę", bledy.length === 0,
    bledy.map((u: any) => u.kod).join(", ") || "bez uwag");

  return (await api(`/api/plany/${PLAN}/eksport`, "POST")).plik;
}

if (!maLibreOffice()) {
  console.error("Brakuje LibreOffice. Bez niego nie ma czym przeliczyć arkusza.");
  process.exit(2);
}

const roboczy = mkdtempSync(join(tmpdir(), "craftmyplan-kolko-"));

await zSerwerem(PORT, async (srodowisko) => {
  const { api } = srodowisko;
  const wyeksportowany = await zasiej(srodowisko);

  // LibreOffice nie lubi polskich znaków w ścieżce wejściowej, a eksport
  // nazywa pliki nazwiskiem klienta — kopiujemy pod nazwę bez ogonków.
  const wejscie = join(roboczy, "plan.xlsx");
  copyFileSync(wyeksportowany, wejscie);

  console.log("\n  Przeliczam arkusz w LibreOffice…");
  const profil = mkdtempSync(join(tmpdir(), "craftmyplan-lo-"));
  execFileSync("soffice", [
    "--headless", `-env:UserInstallation=file://${profil}`,
    "--convert-to", "xlsx", "--outdir", join(roboczy, "przeliczony"), wejscie,
  ], { stdio: "ignore", timeout: 300_000 });
  rmSync(profil, { recursive: true, force: true });
  const przeliczony = join(roboczy, "przeliczony", "plan.xlsx");

  // ── połowa pierwsza: arkusz liczy to samo co silnik ────────────────
  const raport = execFileSync("node", ["--no-warnings", "narzedzia/sprawdz.ts", przeliczony],
    { cwd: join(import.meta.dirname, "..", "..", "silnik"), encoding: "utf-8" });
  const ile = Number(raport.match(/sprawdzonych wartości:\s*(\d+)/)?.[1] ?? 0);
  sprawdz("arkusz liczy to samo co silnik",
    ile > 500 && raport.includes("wszystko się zgadza"),
    `${ile} wartości`);

  // ── połowa druga: ten sam plik wraca tym samym planem ──────────────
  const odp = await fetch(
    `${srodowisko.adres}/api/import?klient=Kolko%20wrocone&wersja=1`,
    { method: "POST", headers: { "content-type": "application/octet-stream" },
      body: readFileSync(przeliczony) });
  const wrocone = await odp.json() as any;
  if (!odp.ok) {
    sprawdz("arkusz da się wczytać z powrotem", false, wrocone.blad);
  } else {
    sprawdz("arkusz da się wczytać z powrotem", true, WROCONE);
    sprawdz("wszystkie ćwiczenia rozpoznane", (wrocone.nierozpoznane ?? []).length === 0,
      (wrocone.nierozpoznane ?? []).map((n: any) => n.nazwa).join(", ") || "wszystkie");
    porownaj(await api(`/api/plany/${PLAN}`), wrocone);
  }
});

/** Porównanie wartość po wartości: plan wyjściowy kontra ten z arkusza. */
function porownaj(oryginal: any, wrocony: any): void {
  let zgodnych = 0;
  const roznice: string[] = [];
  const por = (opis: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) === JSON.stringify(b)) zgodnych++;
    else roznice.push(`${opis}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  };

  const wrocone = new Map<string, any>(
    wrocony.zapisany.plan.sloty.map((s: any) => [s.positionId, s]));
  for (const a of oryginal.zapisany.plan.sloty) {
    if (!a.cwiczenieId) continue;
    const b = wrocone.get(a.positionId) ?? {};
    por(`${a.positionId} ćwiczenie`, a.cwiczenieId, b.cwiczenieId);
    for (const t of ["1", "2", "3", "4", "5", "6"]) {
      const pa = a.tygodnie?.[t] ?? {}, pb = b.tygodnie?.[t] ?? {};
      por(`${a.positionId} T${t} serie`, pa.serie, pb.serie);
      por(`${a.positionId} T${t} RPE`, pa.rpe, pb.rpe);
      por(`${a.positionId} T${t} odczucie`, pa.feedback, pb.feedback);
    }
  }

  const seriaWroconych = new Map<string, any>(
    wrocony.zapisany.plan.serieMaksymalne.map((s: any) => [s.cwiczenieId, s]));
  for (const s of oryginal.zapisany.plan.serieMaksymalne) {
    const b = seriaWroconych.get(s.cwiczenieId);
    por(`seria maksymalna ${s.cwiczenieId}`,
      [s.ciezar, s.powtorzenia], b ? [b.ciezar, b.powtorzenia] : null);
  }
  por("tryb akcesoriów",
    oryginal.zapisany.plan.trybAkcesoriow, wrocony.zapisany.plan.trybAkcesoriow);
  por("część planu", oryginal.zapisany.plan.czescPlanu, wrocony.zapisany.plan.czescPlanu);

  // Najważniejsze: policzone liczby, które zobaczy klient.
  for (let t = 0; t < 6; t++) {
    for (const a of oryginal.wynik.tygodnie[t].sloty) {
      if (!a.cwiczenie) continue;
      const b = wrocony.wynik.tygodnie[t].sloty
        .find((x: any) => x.positionId === a.positionId) ?? {};
      for (const pole of ["ciezar", "powtorzenia", "serie", "rpe", "stres"]) {
        por(`T${t + 1} ${a.positionId} ${pole}`, a[pole], b[pole]);
      }
    }
  }

  sprawdz("plan z arkusza jest identyczny z wyjściowym", roznice.length === 0,
    `${zgodnych} wartości zgodnych${roznice.length ? `, ${roznice.length} różnych` : ""}`);
  for (const r of roznice.slice(0, 10)) console.log(`      · ${r}`);
  doliczBledy(0);
}

rmSync(roboczy, { recursive: true, force: true });
podsumuj("kółko konsola → arkusz → konsola domyka się bez straty");
