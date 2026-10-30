/**
 * Wersja narzędzia do zapisu w analizie ruchu (24.10.2026).
 *
 * Trener przygotowuje badanie do doktoratu: „chcę zamrozić wersję do badania
 * i zacytować ją w artykule”. Każdy plik JSON i CSV analizy ruchu dostaje
 * więc numer z package.json i skrót commita, np. „0.2.0+a1b2c3d”.
 *
 * Skąd commit, po kolei:
 *   1. zmienna `CRAFTMYPLAN_COMMIT`,
 *   2. plik `wersja-commit.txt` obok tego pliku — zapisuje go skrypt
 *      wdrożenia przed zbudowaniem obrazu (w obrazie Dockera nie ma gita),
 *   3. katalog `.git` repozytorium (konsola uruchomiona z klonu),
 *   4. nic — wtedy „lokalna” (np. paczka .zip bez gita).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KATALOG = dirname(fileURLToPath(import.meta.url));

const skrot = (hash: string | null | undefined) => (hash && /^[0-9a-f]{7,40}$/i.test(hash.trim()) ? hash.trim().slice(0, 7).toLowerCase() : null);

/** Commit z katalogu `.git` — bez programu git (czyta HEAD, gałąź i packed-refs). */
export function commitZGita(repo: string): string | null {
  try {
    const git = join(repo, ".git");
    const head = readFileSync(join(git, "HEAD"), "utf-8").trim();
    const ref = /^ref: (.+)$/.exec(head)?.[1];
    if (!ref) return skrot(head);
    if (existsSync(join(git, ref))) return skrot(readFileSync(join(git, ref), "utf-8"));
    const spakowane = existsSync(join(git, "packed-refs")) ? readFileSync(join(git, "packed-refs"), "utf-8") : "";
    const wiersz = spakowane.split("\n").find((w) => w.endsWith(` ${ref}`));
    return skrot(wiersz?.split(" ")[0]);
  } catch {
    return null;
  }
}

export function commitNarzedzia({ srodowisko = process.env, katalog = KATALOG } = {}): string | null {
  return skrot(srodowisko.CRAFTMYPLAN_COMMIT)
    ?? (existsSync(join(katalog, "wersja-commit.txt")) ? skrot(readFileSync(join(katalog, "wersja-commit.txt"), "utf-8")) : null)
    ?? commitZGita(join(katalog, ".."));
}

/** „0.2.0+a1b2c3d” — albo „0.2.0+lokalna”, gdy commita nie da się ustalić. */
export function wersjaNarzedzia(opcje: { srodowisko?: NodeJS.ProcessEnv; katalog?: string } = {}): string {
  const katalog = opcje.katalog ?? KATALOG;
  const paczka = JSON.parse(readFileSync(join(katalog, "package.json"), "utf-8")) as { version: string };
  return `${paczka.version}+${commitNarzedzia({ ...opcje, katalog }) ?? "lokalna"}`;
}
