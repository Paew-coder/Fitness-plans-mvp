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

const DLUGOSC_MINIMALNA = 10;

const trenerId = trenerDomyslny();
const trener = trenerPoId(trenerId)!;

if (process.argv.includes("--usun")) {
  ustawHaslo(trenerId, null);
  console.log("\n  Hasło usunięte. Konsola wróciła do trybu lokalnego —");
  console.log("  przyjmuje połączenia tylko z tego komputera.\n");
  process.exit(0);
}

const rl = createInterface({ input: stdin, output: stdout });

console.log("\n  Ustawianie hasła do konsoli\n");
console.log(`  Konto: ${trener.email}${trener.hashHasla ? "  (hasło już ustawione)" : ""}`);

const email = (await rl.question(`  E-mail [${trener.email}]: `)).trim() || trener.email;
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
const haslo = await rl.question("  Nowe hasło: ");
const powtorzone = await rl.question("  Powtórz hasło: ");
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
console.log("  Wystawiając konsolę na świat, ustaw ZA_HTTPS=1 i postaw ją za HTTPS —");
console.log("  link klienta zawiera token w adresie.\n");
