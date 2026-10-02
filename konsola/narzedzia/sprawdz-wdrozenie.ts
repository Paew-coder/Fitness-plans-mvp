#!/usr/bin/env node
/**
 * Sprawdzenie ścieżki wdrożeniowej — całej, na obrazie Dockera.
 *
 *   npm run sprawdz-wdrozenie
 *
 * Po co osobne narzędzie: te kontrole robiło się dotąd ręcznie, dwadzieścia
 * komend pod rząd, i przez to nie robiło się ich wcale. A psują się cicho —
 * dołożony plik, którego `Dockerfile` nie kopiuje, albo migracja, która
 * lokalnie przechodzi, a w kontenerze nie ma uprawnień do katalogu danych.
 * Zobaczyłbyś to dopiero na serwerze, przy pierwszym kliknięciu.
 *
 * Najważniejszy punkt: kontener startuje na bazie w **starym schemacie**,
 * takiej, jaką ma działająca instalacja. Aktualizacja ma ją podnieść sama
 * i nie zgubić ani jednego wiersza — ani linku, który klient ma w telefonie.
 *
 * Wymaga działającego Dockera. Nie chodzi w `npm test`, bo tam Dockera nie ma.
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const KATALOG = dirname(fileURLToPath(import.meta.url));
const KORZEN = join(KATALOG, "..", "..");
const OBRAZ = "craftmyplan:sprawdzenie";
const KONTENER = "craftmyplan-sprawdzenie";
const PORT = 4177;
const HASLO = "haslo-do-sprawdzenia-1234";

let bledow = 0;
function sprawdz(nazwa: string, warunek: boolean, szczegol = ""): void {
  console.log(`  ${warunek ? "✓" : "✗"} ${nazwa}${szczegol ? ` — ${szczegol}` : ""}`);
  if (!warunek) bledow++;
}

/**
 * Kontrola, która może się wywalić — a wtedy ma to być **wynik kontroli**,
 * nie koniec skryptu. Pierwsza wersja przerywała się na pierwszym wyjątku
 * i nie pokazywała, czy reszta wdrożenia stoi; przy szukaniu przyczyny to jest
 * dokładnie ta informacja, której się potrzebuje.
 */
async function sprawdzProbujac<T>(
  nazwa: string,
  fn: () => T | Promise<T>,
  ocena: (wynik: T) => boolean | { ok: boolean; szczegol?: string } = () => true,
): Promise<T | null> {
  try {
    const wynik = await fn();
    const o = ocena(wynik);
    const ok = typeof o === "boolean" ? o : o.ok;
    sprawdz(nazwa, ok, typeof o === "boolean" ? "" : (o.szczegol ?? ""));
    return wynik;
  } catch (e) {
    sprawdz(nazwa, false, e instanceof Error ? pierwszaLinia(e.message) : String(e));
    return null;
  }
}

/**
 * Komunikaty Dockera, Node'a i Pythona bywają na trzydzieści linii, z czego
 * dwadzieścia osiem to stos. Szukamy zdania, które coś mówi — pomijając ramki
 * stosu i odwołania typu `node:internal/errors:983`, bo pierwsza wersja tej
 * funkcji wypisywała właśnie je.
 */
export function pierwszaLinia(tekst: string): string {
  const linie = tekst.split("\n").map((l) => l.trim()).filter(Boolean);
  // Odsiewamy ramki stosu, odwołania `plik:linia` i echo kodu — to nie są
  // komunikaty, tylko sceneria wokół nich.
  const szum = (l: string) =>
    /^at /.test(l) || /^[\w./:-]+:\d+$/.test(l) || /^\^+$/.test(l) || /[;{]$/.test(l);
  const tresciwe = linie.filter((l) => !szum(l));
  const bledy = tresciwe.filter((l) =>
    /(Error|Exception|No such|not found|cannot|permission denied|błąd)/i.test(l));
  // Ostatni, nie pierwszy: przyczyna źródłowa zwykle stoi na końcu stderr,
  // a na początku jest ogólnikowe „Command failed".
  return (bledy.at(-1) ?? tresciwe[0] ?? tekst).slice(0, 160);
}

function docker(...args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Node w kontenerze. Zwraca to, co skrypt wypisze na wyjście. */
function wKontenerze(skrypt: string): string {
  return docker("exec", KONTENER, "node", "--no-warnings", "-e", skrypt).trim();
}

async function czekajNa(opis: string, warunek: () => boolean | Promise<boolean>, sekund = 45): Promise<boolean> {
  for (let i = 0; i < sekund; i++) {
    try { if (await warunek()) return true; } catch { /* jeszcze nie */ }
    await new Promise((g) => setTimeout(g, 1000));
  }
  console.log(`  (nie doczekano: ${opis})`);
  return false;
}

/**
 * Baza w schemacie 1 — dokładnie taka, jaką ma instalacja sprzed wprowadzenia
 * encji klienta. Dwa cykle jednej osoby, token przy nowszym planie, waga
 * rozrzucona po obu cyklach, jedno wykonanie i jeden domknięty dzień.
 */
const TOKEN_W_TELEFONIE = "token-ktory-klient-ma-w-telefonie";

function zbudujStaraBaze(sciezka: string): void {
  const d = new DatabaseSync(sciezka);
  d.exec(`
    CREATE TABLE trener (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, nazwa TEXT NOT NULL,
      hash_hasla TEXT, utworzony TEXT NOT NULL);
    CREATE TABLE sesja (token TEXT PRIMARY KEY, trener_id INTEGER NOT NULL REFERENCES trener(id) ON DELETE CASCADE,
      utworzona TEXT NOT NULL, wygasa TEXT NOT NULL);
    CREATE TABLE plan (trener_id INTEGER NOT NULL REFERENCES trener(id) ON DELETE CASCADE, id TEXT NOT NULL,
      klient TEXT NOT NULL, wersja INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('szkic', 'wysłany', 'zakończony')),
      data_startu TEXT, utworzony TEXT NOT NULL, zmieniony TEXT NOT NULL, poprzedni_id TEXT,
      token TEXT UNIQUE, oddech_json TEXT, bieg_json TEXT, plan_json TEXT NOT NULL,
      PRIMARY KEY (trener_id, id));
    CREATE TABLE wykonanie (trener_id INTEGER NOT NULL, plan_id TEXT NOT NULL, position_id TEXT NOT NULL,
      tydzien INTEGER NOT NULL, data TEXT NOT NULL, ciezar_wykonany REAL, powtorzenia_wykonane INTEGER,
      feedback TEXT, PRIMARY KEY (trener_id, plan_id, position_id, tydzien),
      FOREIGN KEY (trener_id, plan_id) REFERENCES plan(trener_id, id) ON DELETE CASCADE);
    CREATE TABLE ukonczony_dzien (trener_id INTEGER NOT NULL, plan_id TEXT NOT NULL, tydzien INTEGER NOT NULL,
      dzien INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (trener_id, plan_id, tydzien, dzien),
      FOREIGN KEY (trener_id, plan_id) REFERENCES plan(trener_id, id) ON DELETE CASCADE);
    CREATE TABLE pomiar_wagi (trener_id INTEGER NOT NULL, plan_id TEXT NOT NULL, data TEXT NOT NULL,
      kg REAL NOT NULL, PRIMARY KEY (trener_id, plan_id, data),
      FOREIGN KEY (trener_id, plan_id) REFERENCES plan(trener_id, id) ON DELETE CASCADE);
  `);
  d.prepare("INSERT INTO trener VALUES (1, ?, ?, NULL, ?)")
    .run("trener@localhost", "Trener", "2026-01-01T00:00:00.000Z");

  const sloty = [];
  const LP = ["A1.", "B1.", "B2.", "C1.", "C2.", "D1.", "D2.", "E1.", "E2.", "", "", ""];
  for (let dzien = 1; dzien <= 5; dzien++) {
    for (let poz = 1; poz <= 12; poz++) {
      sloty.push({
        positionId: `D${dzien}-S${String(poz).padStart(2, "0")}`,
        dzien, lp: LP[poz - 1] ?? "",
        cwiczenieId: dzien === 1 && poz <= 3 ? ["EX-0010", "EX-0016", "EX-0003"][poz - 1] : null,
        kategoriaSzkieletu: null, tygodnie: {},
      });
    }
  }
  const plan = JSON.stringify({
    nazwa: "Zuzanna C", trybAkcesoriow: "trzymaj z bloku", czescPlanu: "objętość",
    serieMaksymalne: [{ cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 1 }],
    sloty,
    topSety: [1, 2, 3, 4, 5].map((dzien) => ({ dzien, wlaczony: true, rpe: 7, slotPositionId: `D${dzien}-S01` })),
  });

  const wstaw = d.prepare("INSERT INTO plan VALUES (1,?,?,?,?,?,?,?,?,?,NULL,NULL,?)");
  wstaw.run("zuzanna-c-3", "Zuzanna C", 3, "zakończony", "2026-05-01",
    "2026-04-20T09:00:00.000Z", "2026-06-15T09:00:00.000Z", null, "stary-link-z-poprzedniego-cyklu", plan);
  wstaw.run("zuzanna-c-4", "zuzanna c.", 4, "wysłany", "2026-06-20",
    "2026-06-16T09:00:00.000Z", "2026-07-01T09:00:00.000Z", "zuzanna-c-3", TOKEN_W_TELEFONIE, plan);

  d.prepare("INSERT INTO wykonanie VALUES (1,?,?,?,?,?,?,?)")
    .run("zuzanna-c-4", "D1-S01", 2, "2026-06-28T10:00:00.000Z", 92.5, 6, "OK");
  d.prepare("INSERT INTO ukonczony_dzien VALUES (1,?,?,?,?)")
    .run("zuzanna-c-4", 2, 1, "2026-06-28T10:30:00.000Z");
  for (const [planId, data, kg] of [
    ["zuzanna-c-3", "2026-05-04", 61.2], ["zuzanna-c-3", "2026-06-01", 60.4], ["zuzanna-c-4", "2026-06-22", 60.1],
  ] as const) {
    d.prepare("INSERT INTO pomiar_wagi VALUES (1,?,?,?)").run(planId, data, kg);
  }
  d.close();
}

const adres = (sciezka: string) => `http://127.0.0.1:${PORT}${sciezka}`;

async function main(): Promise<void> {
  try {
    execSync("docker info", { stdio: "ignore" });
  } catch {
    console.error("Docker nie odpowiada. Uruchom demona i spróbuj ponownie.");
    process.exit(2);
  }

  const katalogDanych = mkdtempSync(join(tmpdir(), "wdrozenie-"));
  try {
    console.log("\nBUDOWANIE OBRAZU");
    // `execFileSync` z wyciszonym stdout zwraca null także po sukcesie, więc
    // o powodzeniu mówi licznik błędów, a nie wartość zwrócona przez kontrolę.
    const bledowPrzedBudowaniem = bledow;
    await sprawdzProbujac("obraz się buduje", () =>
      execFileSync("docker", ["build", "-f", "konsola/Dockerfile", "-t", OBRAZ, "."],
        { cwd: KORZEN, stdio: ["ignore", "ignore", "pipe"] }));
    if (bledow > bledowPrzedBudowaniem) {
      console.log("\n✗ Bez obrazu nie ma czego sprawdzać dalej.\n");
      process.exit(1);
    }

    console.log("\nSTART NA BAZIE W STARYM SCHEMACIE");
    zbudujStaraBaze(join(katalogDanych, "craftmyplan.db"));
    try { docker("rm", "-f", KONTENER); } catch { /* nie było */ }
    docker("run", "-d", "--name", KONTENER, "-p", `${PORT}:4173`,
      "-v", `${katalogDanych}:/app/konsola/dane`, OBRAZ);

    const wstal = await czekajNa("odpowiedź /zdrowie", async () =>
      (await fetch(adres("/zdrowie"))).status !== 0);
    sprawdz("kontener odpowiada", wstal);

    const log = docker("logs", KONTENER);
    sprawdz("migracja wykonała się przy starcie", log.includes("Migracja bazy → wersja 2"));

    // Kopia przed migracją to jedyna rzecz, po którą sięga się po nieudanej
    // aktualizacji. Musi wylądować na woluminie, a nie w warstwie obrazu —
    // inaczej przy przebudowie zniknie razem z powodem, dla którego istnieje.
    const kopie = existsSync(join(katalogDanych, "kopie"))
      ? readdirSync(join(katalogDanych, "kopie")) : [];
    // Po jednej na migrację — baza w starym schemacie przechodzi przez wszystkie
    // po kolei, więc liczba rośnie z każdą kolejną wersją. Pytanie brzmi „czy
    // jest kopia z każdego kroku", a nie „czy jest dokładnie jedna".
    const przedMigracja = kopie.filter((f) => f.includes("przed-migracja")).sort();
    sprawdz("kopia przed migracją została na woluminie", przedMigracja.length >= 1,
      przedMigracja.join(", ") || (kopie.join(", ") || "brak"));
    await sprawdzProbujac("kopia sprzed migracji otwiera się jako baza w starym schemacie",
      () => {
        const d = new DatabaseSync(join(katalogDanych, "kopie", przedMigracja[0]!), { readOnly: true });
        const maKlienta = d.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='klient'").get() !== undefined;
        const planow = (d.prepare("SELECT COUNT(*) AS n FROM plan").get() as { n: number }).n;
        d.close();
        return { maKlienta, planow };
      },
      (w) => ({
        // Skoro to kopia sprzed migracji, tabeli `klient` jeszcze w niej nie ma —
        // i właśnie po tym poznajemy, że powstała w odpowiednim momencie.
        ok: !w.maKlienta && w.planow === 2,
        szczegol: `${w.planow} plany, bez tabeli klient`,
      }));

    console.log("\nDANE PO MIGRACJI");
    const stan = JSON.parse((await sprawdzProbujac("konsola czyta bazę po migracji", () => wKontenerze(`
      const m = await import("/app/konsola/magazyn.ts");
      const { baza } = await import("/app/konsola/baza/polaczenie.ts");
      console.log(JSON.stringify({
        klienci: m.listaKlientow(1).map((k) => k.id),
        tokenProwadziDo: m.klientPoTokenie(${JSON.stringify(TOKEN_W_TELEFONIE)})?.id ?? null,
        aktywny: m.aktywnyPlan(1, "zuzanna-c")?.id ?? null,
        waga: m.wagaKlienta(1, "zuzanna-c").length,
        wykonania: (m.wczytaj(1, "zuzanna-c-4")?.wykonania ?? []).length,
        osierocone: baza().prepare("PRAGMA foreign_key_check").all().length,
        planow: m.lista(1).length,
      }));
    `))) ?? "{}");
    sprawdz("z nazw w planach powstał klient", stan.klienci?.length === 1, (stan.klienci ?? []).join(", "));
    sprawdz("link z telefonu klienta dalej działa", stan.tokenProwadziDo === "zuzanna-c");
    sprawdz("link pokazuje aktualny cykl", stan.aktywny === "zuzanna-c-4");
    sprawdz("waga z dwóch cykli to jedna historia", stan.waga === 3, `${stan.waga} pomiary`);
    sprawdz("wykonania klienta przetrwały", stan.wykonania === 1);
    sprawdz("żaden plan nie zginął", stan.planow === 2);
    sprawdz("brak osieroconych wierszy", stan.osierocone === 0);

    console.log("\nCO MUSI DZIAŁAĆ NA SERWERZE");
    await sprawdzProbujac("eksport arkusza działa w kontenerze", () => {
      const plik = wKontenerze(`
        const { eksportujDoArkusza } = await import("/app/konsola/eksport-xlsx.ts");
        const m = await import("/app/konsola/magazyn.ts");
        console.log(await eksportujDoArkusza(m.wczytaj(1, "zuzanna-c-4")));
      `);
      return { nazwa: plik.split("/").pop()!, rozmiar: statSync(join(katalogDanych, "eksport", plik.split("/").pop()!)).size };
    }, (w) => ({ ok: w.rozmiar > 10_000, szczegol: `${w.nazwa}, ${Math.round(w.rozmiar / 1024)} kB` }));

    await sprawdzProbujac("kopia zapasowa działa na aktualnym schemacie",
      () => docker("exec", KONTENER, "npm", "run", "kopia"),
      (w) => w.includes("Kopia:"));

    // Kopia jest warta dokładnie tyle, ile droga powrotna z niej. Sprawdzamy
    // oba końce tej drogi w kontenerze, bo tam właśnie się jej użyje.
    await sprawdzProbujac("lista kopii mówi, co jest w środku, a nie tylko jak się nazywa",
      () => docker("exec", KONTENER, "npm", "run", "--silent", "przywroc"),
      (w) => ({ ok: /Kopie w /.test(w) && /klient/.test(w),
        szczegol: w.split("\n").find((l) => l.includes("klient"))?.trim().slice(0, 70) ?? "" }));

    // Odtwarzanie pod działającym serwerem daje najgorszy możliwy wynik:
    // serwer trzyma otwarte połączenie ze starym plikiem i przy pierwszym
    // zapisie przywraca to, co przed chwilą zostało nadpisane.
    const doOdtworzenia = readdirSync(join(katalogDanych, "kopie"))
      .filter((f) => f.endsWith(".db")).sort().at(-1);
    await sprawdzProbujac("odtworzenie odmawia, dopóki konsola chodzi", () => {
      try {
        docker("exec", KONTENER, "npm", "run", "--silent", "przywroc",
          "--", doOdtworzenia!, "--wykonaj");
        return "wykonało się mimo działającej konsoli";
      } catch (e) {
        return String((e as { stderr?: Buffer }).stderr ?? e);
      }
    }, (w) => ({ ok: /Konsola jest uruchomiona/.test(w), szczegol: pierwszaLinia(w) }));

    console.log("\nBRAMKA DOSTĘPU");
    const bezHasla = await fetch(adres("/api/klienci"));
    sprawdz("bez hasła konsola odmawia połączeń z zewnątrz", bezHasla.status === 403,
      `kod ${bezHasla.status}`);

    await sprawdzProbujac("da się ustawić hasło", () => wKontenerze(`
      const auth = await import("/app/konsola/uwierzytelnianie.ts");
      auth.ustawHaslo(1, ${JSON.stringify(HASLO)});
      console.log(auth.trybDostepu(1).tryb);
    `), (tryb) => ({ ok: tryb === "hasło", szczegol: `tryb: ${tryb}` }));
    const zHaslemBezSesji = await fetch(adres("/api/klienci"));
    sprawdz("z hasłem niezalogowany dostaje 401", zHaslemBezSesji.status === 401,
      `kod ${zHaslemBezSesji.status}`);

    const logowanie = await fetch(adres("/api/logowanie"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "trener@localhost", haslo: HASLO }),
    });
    const ciastko = logowanie.headers.get("set-cookie")?.split(";")[0] ?? "";
    sprawdz("logowanie działa", logowanie.status === 200);

    const poZalogowaniu = await fetch(adres("/api/klienci"), { headers: { cookie: ciastko } });
    const klienci = await poZalogowaniu.json();
    sprawdz("po zalogowaniu widać dane", Array.isArray(klienci) && klienci.length === 1);

    const zleHaslo = await fetch(adres("/api/logowanie"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "trener@localhost", haslo: "nie to haslo" }),
    });
    sprawdz("złe hasło jest odrzucane", zleHaslo.status === 401);

    const zdrowie = await czekajNa("healthcheck", () =>
      docker("inspect", "-f", "{{.State.Health.Status}}", KONTENER).trim() === "healthy", 60);
    sprawdz("healthcheck kontenera przechodzi w healthy", zdrowie);
  } finally {
    try { docker("rm", "-f", KONTENER); } catch { /* nie wstał */ }
    rmSync(katalogDanych, { recursive: true, force: true });
  }

  console.log(bledow === 0
    ? "\n✓ Ścieżka wdrożeniowa działa w całości.\n"
    : `\n✗ ${bledow} rzeczy do naprawienia przed wdrożeniem.\n`);
  process.exit(bledow === 0 ? 0 : 1);
}

// Uruchamiamy tylko wtedy, gdy ktoś wywołał ten plik wprost. Import (np. z testu
// heurystyki komunikatów) nie ma prawa postawić kontenera.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
