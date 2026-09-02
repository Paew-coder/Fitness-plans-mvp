/**
 * Ślad po działającej konsoli — mały plik obok bazy.
 *
 * Po co: odtworzenie bazy pod działającym serwerem daje najgorszy z możliwych
 * wyników. Serwer trzyma otwarte połączenie ze starym plikiem i przy pierwszym
 * zapisie przywraca to, co przed chwilą zostało nadpisane — czyli odtworzenie
 * *wygląda* na udane, a po kwadransie pracy okazuje się, że go nie było.
 *
 * Pierwsze podejście pytało po prostu, czy coś odpowiada na porcie z `PORT`.
 * To odpowiadało na łatwiejsze pytanie, niż się wydawało: konsola uruchomiona
 * z innego okna, na innym porcie, nie ustawia tej zmiennej w oknie, z którego
 * idzie odtwarzanie — i sprawdzenie milczało. Sprawdzone: przy konsoli
 * chodzącej na 4987 odtworzenie przeszło bez słowa.
 *
 * Dlatego serwer zostawia po sobie ślad: swój numer procesu i port. Sam plik
 * nie wystarcza — po ubiciu konsoli zostaje na dysku — więc pytamy jeszcze,
 * czy proces o tym numerze żyje, i czy pod tym portem ktoś odpowiada.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { SCIEZKA_BAZY } from "./sciezka.ts";

export type Slad = { pid: number; port: number; od: string };

export function sciezkaSladu(): string {
  return join(dirname(SCIEZKA_BAZY), "konsola-dziala.json");
}

export function zapiszSlad(port: number): void {
  try {
    writeFileSync(sciezkaSladu(),
      JSON.stringify({ pid: process.pid, port, od: new Date().toISOString() }));
  } catch { /* brak prawa zapisu do katalogu danych — konsola ma działać dalej */ }
}

/**
 * Kasuje ślad — ale **tylko własny**.
 *
 * Bez tego warunku druga konsola, uruchomiona przy zajętym porcie, kasowała
 * przy wyjściu ślad tej pierwszej, działającej. Odtwarzanie bazy przestałoby
 * wtedy widzieć, że konsola chodzi — czyli sprzątanie po nieudanym starcie
 * odbierałoby zabezpieczenie działającej instalacji.
 */
export function usunSlad(): void {
  try {
    if (czytajSlad()?.pid !== process.pid) return;
    rmSync(sciezkaSladu(), { force: true });
  } catch { /* jak wyżej */ }
}

export function czytajSlad(): Slad | null {
  try {
    if (!existsSync(sciezkaSladu())) return null;
    const s = JSON.parse(readFileSync(sciezkaSladu(), "utf-8")) as Slad;
    return typeof s?.pid === "number" && typeof s?.port === "number" ? s : null;
  } catch {
    return null;   // uszkodzony plik to brak śladu, nie awaria
  }
}

/** Czy proces o tym numerze żyje. Sygnał `0` niczego nie wysyła, tylko pyta. */
export function procesZyje(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM znaczy „jest, ale nie twój" — czyli też żyje.
    return (e as { code?: string })?.code === "EPERM";
  }
}

async function odpowiada(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Port, na którym chodzi konsola, albo `null`. Trzy pytania, bo żadne
 * z osobna nie wystarcza:
 *
 *   1. **Ślad** mówi, na którym porcie szukać — także wtedy, gdy odtwarzanie
 *      idzie z okna, które o tym porcie nie wie.
 *   2. **Żywy proces** odróżnia działającą konsolę od śladu po ubitej.
 *   3. **Odpowiedź z portu** łapie konsolę uruchomioną tak, że śladu nie
 *      zostawiła — starszą wersją albo z innego katalogu danych.
 */
export async function konsolaChodzi(): Promise<number | null> {
  const slad = czytajSlad();
  if (slad && procesZyje(slad.pid) && await odpowiada(slad.port)) return slad.port;

  for (const port of new Set([Number(process.env.PORT ?? 4173), 4173])) {
    if (await odpowiada(port)) return port;
  }
  return null;
}

/**
 * Zdanie po polsku zamiast śladu stosu, gdy serwer nie może zająć portu.
 *
 * Odtworzone: drugie kliknięcie ikony przy działającej konsoli wypisywało
 * „Unhandled 'error' event", ścieżki z dysku i `node:net:1940:16` — po czym
 * okno się zamykało. Podwójne kliknięcie to najczęstsza rzecz, jaka się temu
 * plikowi przydarza, więc był to najczęstszy komunikat, jaki trener widział.
 *
 * Ślad pozwala odróżnić dwa różne kłopoty, które wyglądają tak samo: własną
 * konsolę już działającą (wtedy nie ma czego naprawiać — wystarczy otworzyć
 * przeglądarkę) od cudzego programu na tym porcie (wtedy trzeba zmienić port).
 */
export function powodNieuruchomienia(blad: unknown, port: number): string {
  const kod = (blad as { code?: string })?.code;

  if (kod === "EADDRINUSE") {
    const s = czytajSlad();
    if (s && s.port === port && procesZyje(s.pid)) {
      const od = s.od ? new Date(s.od) : null;
      const kiedy = od && !Number.isNaN(od.getTime())
        ? ` (chodzi od ${od.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })})`
        : "";
      return `Konsola już działa${kiedy} — nie ma potrzeby uruchamiać jej drugi raz.\n`
        + `  Otwórz http://localhost:${port}\n`
        + "  Żeby ją zatrzymać, wróć do okna, w którym chodzi, i naciśnij Ctrl+C.";
    }
    return `Port ${port} jest zajęty przez inny program.\n`
      + `  Jeśli to konsola w innym oknie — otwórz http://localhost:${port}\n`
      + `  Jeśli nie — uruchom ją na innym porcie:  PORT=${port + 1} npm start`;
  }

  if (kod === "EACCES") {
    return `Brak uprawnień do portu ${port}. Porty poniżej 1024 są zastrzeżone.\n`
      + "  Uruchom konsolę na porcie 4173 albo wyższym:  PORT=4173 npm start";
  }

  return `Konsola nie wystartowała: ${blad instanceof Error ? blad.message : String(blad)}`;
}
