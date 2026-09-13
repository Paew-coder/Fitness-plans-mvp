#!/usr/bin/env node
/**
 * Ustawia hasło do konsoli.
 *
 *   npm run haslo                     # pyta o e-mail i hasło
 *   npm run haslo -- --usun           # wraca do trybu lokalnego bez hasła
 *
 * Hasło jest tym, co decyduje o trybie pracy konsoli. Bez niego konsola
 * przyjmuje połączenia tylko z tego komputera; z nim — wymaga logowania
 * zawsze i można ją wystawić na świat (za HTTPS).
 *
 * Ustawienie albo zmiana hasła wylogowuje wszystkie urządzenia.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { trenerDomyslny, baza } from "../baza/polaczenie.ts";
import { ustawHaslo, trenerPoId, trenerPoEmailu } from "../uwierzytelnianie.ts";
import { adresyLokalnejSieci } from "../adresy.ts";

const DLUGOSC_MINIMALNA = 10;

const trenerId = trenerDomyslny();
const trener = trenerPoId(trenerId)!;

if (process.argv.includes("--usun")) {
  ustawHaslo(trenerId, null);
  console.log("\n  Hasło usunięte. Konsola wróciła do trybu lokalnego —");
  console.log("  przyjmuje połączenia tylko z tego komputera.\n");
  process.exit(0);
}

/*
 * Bez klawiatury to narzędzie nie ma o co zapytać.
 *
 * `rl.question()` czeka wtedy na odpowiedź, która nigdy nie przyjdzie: proces
 * wisi, aż Node ubije go po cichu kodem 13, bez jednego słowa wyjaśnienia.
 * Zdarza się to za każdym razem, gdy ktoś uruchomi to z potoku albo kliknięciem
 * w środowisku bez konsoli — a wtedy wygląda to jak zepsuty program.
 */
if (!stdin.isTTY) {
  console.error("\n  To narzędzie pyta o hasło i potrzebuje klawiatury.");
  console.error("  Uruchom je w oknie terminala — albo kliknij plik");
  console.error("  „Ustaw haslo konsoli” w głównym katalogu projektu.\n");
  process.exit(1);
}

const rl = createInterface({ input: stdin, output: stdout });

console.log("\n  Ustawianie hasła do konsoli\n");
console.log(`  Konto: ${trener.email}${trener.hashHasla ? "  (hasło już ustawione)" : ""}`);

/*
 * Ctrl+D (na Windows Ctrl+Z) w trakcie pytania to zwyczajne „rozmyśliłem się".
 * Bez tej obsługi readline rzuca `AbortError` i całe okno zalewa ślad stosu po
 * angielsku — ostatnia rzecz, jakiej ktoś potrzebuje w narzędziu do hasła.
 */
async function zapytaj(pytanie: string): Promise<string> {
  try {
    return await rl.question(pytanie);
  } catch {
    console.error("\n\n  Przerwane. Nic nie zmieniono.\n");
    process.exit(1);
  }
}

const email = (await zapytaj(`  E-mail [${trener.email}]: `)).trim() || trener.email;
if (email !== trener.email) {
  const zajety = trenerPoEmailu(email);
  if (zajety && zajety.id !== trenerId) {
    console.error(`\n  Ten e-mail należy już do innego konta.\n`);
    process.exit(1);
  }
}

// Terminal nie zawsze pozwala schować wpisywane znaki, więc mówimy wprost,
// czego się spodziewać, zamiast udawać, że hasło jest niewidoczne.
console.log("\n  Uwaga: hasło będzie widoczne podczas wpisywania.");
const haslo = await zapytaj("  Nowe hasło: ");
const powtorzone = await zapytaj("  Powtórz hasło: ");
rl.close();

if (haslo !== powtorzone) {
  console.error("\n  Hasła się różnią. Nic nie zmieniono.\n");
  process.exit(1);
}
if (haslo.length < DLUGOSC_MINIMALNA) {
  console.error(`\n  Za krótkie — minimum ${DLUGOSC_MINIMALNA} znaków. Nic nie zmieniono.\n`);
  process.exit(1);
}

baza().prepare("UPDATE trener SET email = ? WHERE id = ?").run(email.trim().toLowerCase(), trenerId);
ustawHaslo(trenerId, haslo);

console.log("\n  Gotowe. Konsola wymaga teraz logowania.");
console.log("  Wszystkie zalogowane urządzenia zostały wylogowane.\n");

/*
 * Hasło ustawia się po to, żeby wpuścić telefon — więc adres dla telefonu
 * podajemy od razu, zamiast kazać go szukać. Bez hasła konsola i tak odmawia
 * połączeń spoza tej maszyny, więc dopiero tutaj ten adres zaczyna działać.
 */
const port = Number(process.env.PORT) || 4173;
const wSieci = adresyLokalnejSieci(port);
if (wSieci.length > 0) {
  console.log("  Z telefonu w tej samej sieci Wi-Fi konsola jest teraz pod:");
  for (const adres of wSieci) console.log(`    ${adres}`);
  console.log("  Ten komputer musi być włączony, a konsola uruchomiona.\n");
} else {
  console.log("  Nie widzę tego komputera w żadnej sieci — sprawdź Wi-Fi,");
  console.log("  jeśli chcesz wejść na konsolę z telefonu.\n");
}

console.log("  Wystawiając konsolę na świat, ustaw ZA_HTTPS=1 i postaw ją za HTTPS —");
console.log("  link klienta zawiera token w adresie.\n");
