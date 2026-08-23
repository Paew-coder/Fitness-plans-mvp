/**
 * Brama dostępu przejechana od strony sieci, a nie od strony modułu.
 *
 * Same funkcje uwierzytelniania mają testy (`uwierzytelnianie.test.ts`),
 * a wdrożeniowa kontrola sprawdza w kontenerze, że bez hasła nikt nie wejdzie
 * i że logowanie działa. Ale **wylogowania nie dotykało dotąd nic** — ani
 * jeden test, ani jedna kontrola.
 *
 * A wylogowanie jest tym miejscem, w którym łatwo o pozór: skasowanie
 * ciasteczka w przeglądarce wygląda dokładnie tak samo, jak unieważnienie
 * sesji na serwerze. Różnica wychodzi dopiero wtedy, gdy ktoś zachował
 * wcześniejsze ciasteczko — czyli w jedynej sytuacji, w której wylogowanie
 * ma jakiekolwiek znaczenie.
 *
 * Dlatego ten test chodzi po HTTP, całą drogą: logowanie → praca →
 * wylogowanie → próba powrotu z tym samym ciasteczkiem.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KONSOLA = join(dirname(fileURLToPath(import.meta.url)), "..");
const KATALOG = mkdtempSync(join(tmpdir(), "brama-test-"));
process.env.BAZA_CRAFTMYPLAN = join(KATALOG, "craftmyplan.db");
process.env.KOPIE_CRAFTMYPLAN = join(KATALOG, "kopie");

const auth = await import("../uwierzytelnianie.ts");
const { trenerDomyslny, zamknij } = await import("../baza/polaczenie.ts");

const HASLO = "trudne-haslo-trenera-2026";
const EMAIL = "trener@localhost";

let proces: ChildProcess;
let adres = "";

/**
 * Wolny port — bierzemy go, oglądamy numer i oddajemy.
 *
 * Między oddaniem a zajęciem go przez konsolę jest szczelina, w którą może
 * wejść inny proces. Raz na kilkadziesiąt przebiegów widziałem test, który
 * padł i nie powtórzył się przez sześć kolejnych uruchomień — a test, który
 * czasem pada, jest gorszy niż brak testu: uczy przechodzić nad czerwienią
 * do porządku. Stąd ponawianie na kolejnym porcie zamiast jednej próby.
 */
async function wolnyPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((g) => s.listen(0, "127.0.0.1", g));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((g) => { s.close(() => g()); });
  return port;
}

before(async () => {
  auth.ustawHaslo(trenerDomyslny(), HASLO);
  zamknij();   // serwer bierze tę samą bazę — zwalniamy własne połączenie

  for (let proba = 1; proba <= 3; proba++) {
    const port = await wolnyPort();
    adres = `http://127.0.0.1:${port}`;
    proces = spawn(process.execPath, ["--no-warnings", "serwer.ts"], {
      cwd: KONSOLA, env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "ignore", "pipe"],
    });
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${adres}/zdrowie`)).ok) return; } catch { /* jeszcze nie */ }
      await new Promise((g) => setTimeout(g, 250));
    }
    proces.kill("SIGKILL");
  }
  throw new Error("konsola nie wstała przy trzech próbach");
});

after(() => {
  proces?.kill("SIGKILL");
  rmSync(KATALOG, { recursive: true, force: true });
});

/** Ciasteczko z odpowiedzi, gotowe do wysłania z powrotem. */
const ciastkoZOdpowiedzi = (odp: Response): string =>
  (odp.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

const zaloguj = () => fetch(`${adres}/api/logowanie`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, haslo: HASLO }),
});

describe("wejście", () => {
  test("bez ciasteczka konsola nie oddaje danych", async () => {
    assert.equal((await fetch(`${adres}/api/klienci`)).status, 401);
  });

  test("złe hasło i nieistniejący e-mail dostają tę samą odpowiedź", async () => {
    // Inaczej dałoby się sprawdzać, które konta istnieją.
    const zle = await fetch(`${adres}/api/logowanie`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, haslo: "nie to hasło" }),
    });
    const nieistniejacy = await fetch(`${adres}/api/logowanie`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "kto@inny.pl", haslo: HASLO }),
    });
    assert.equal(zle.status, 401);
    assert.equal(nieistniejacy.status, 401);
    assert.deepEqual(await zle.json(), await nieistniejacy.json());
  });

  test("ciasteczko sesji nie daje się odczytać skryptowi", async () => {
    const [ciastko] = (await zaloguj()).headers.getSetCookie();
    // XSS na stronie nie wyniesie wtedy sesji, a żądanie z obcej strony
    // nie pojedzie z ciasteczkiem.
    assert.match(ciastko!, /HttpOnly/i);
    assert.match(ciastko!, /SameSite=Lax/i);
    assert.match(ciastko!, /Path=\//);
  });
});

describe("wyjście", () => {
  test("po wylogowaniu to samo ciasteczko już nie działa", async () => {
    const odp = await zaloguj();
    const ciastko = ciastkoZOdpowiedzi(odp);
    assert.equal(odp.status, 200);

    // Zalogowany widzi dane — bez tego kroku dalsza część nie znaczyłaby nic.
    assert.equal((await fetch(`${adres}/api/klienci`,
      { headers: { cookie: ciastko } })).status, 200);

    const wyjscie = await fetch(`${adres}/api/wylogowanie`,
      { method: "POST", headers: { cookie: ciastko } });
    assert.equal(wyjscie.status, 200);

    // Sedno: sesja ma zniknąć **na serwerze**. Skasowanie ciasteczka
    // w przeglądarce wygląda tak samo, a nie znaczy nic wobec kogoś,
    // kto zachował wcześniejszą kopię.
    assert.equal((await fetch(`${adres}/api/klienci`,
      { headers: { cookie: ciastko } })).status, 401);
  });

  test("wylogowanie każe przeglądarce zapomnieć ciasteczko", async () => {
    const ciastko = ciastkoZOdpowiedzi(await zaloguj());
    const wyjscie = await fetch(`${adres}/api/wylogowanie`,
      { method: "POST", headers: { cookie: ciastko } });
    const [ustawione] = wyjscie.headers.getSetCookie();
    assert.match(ustawione!, /Max-Age=0/);
  });

  test("wylogowanie bez ciasteczka nie jest awarią", async () => {
    // Podwójne kliknięcie „Wyloguj" albo powrót wstecz do tej trasy.
    assert.equal((await fetch(`${adres}/api/wylogowanie`, { method: "POST" })).status, 200);
  });

  test("wylogowanie jednego urządzenia nie wyrzuca pozostałych", async () => {
    const telefon = ciastkoZOdpowiedzi(await zaloguj());
    const laptop = ciastkoZOdpowiedzi(await zaloguj());

    await fetch(`${adres}/api/wylogowanie`, { method: "POST", headers: { cookie: telefon } });

    assert.equal((await fetch(`${adres}/api/klienci`,
      { headers: { cookie: telefon } })).status, 401, "telefon dalej wchodzi");
    assert.equal((await fetch(`${adres}/api/klienci`,
      { headers: { cookie: laptop } })).status, 200, "laptop został wyrzucony");
  });
});

describe("zmiana hasła", () => {
  test("unieważnia sesje na wszystkich urządzeniach", async () => {
    // To jest droga po zgubionym telefonie: trener zmienia hasło i ma prawo
    // zakładać, że tamto urządzenie przestało mieć dostęp.
    const telefon = ciastkoZOdpowiedzi(await zaloguj());
    assert.equal((await fetch(`${adres}/api/klienci`,
      { headers: { cookie: telefon } })).status, 200);

    auth.ustawHaslo(trenerDomyslny(), "zupełnie-nowe-haslo-2026");
    zamknij();   // oddajemy połączenie serwerowi, który pracuje na tym samym pliku

    assert.equal((await fetch(`${adres}/api/klienci`,
      { headers: { cookie: telefon } })).status, 401);
  });
});
