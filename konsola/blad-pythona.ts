/**
 * Tłumaczenie awarii Pythona na zdanie, z którym trener wie, co zrobić.
 *
 * Eksport i wczytywanie arkuszy idą przez Pythona, bo tylko `openpyxl` czyta
 * format `.xlsx`. Gdy tego brakuje — a na świeżo postawionym komputerze brakuje
 * bardzo często — trener dostawał w oknie przeglądarki surowy ślad stosu:
 * angielskie „ModuleNotFoundError", ścieżki z dysku i nazwy plików źródłowych.
 * Dla kogoś, kto nie programuje, to nie jest komunikat, tylko awaria.
 *
 * Gorzej było przy wczytywaniu arkusza: tam brak biblioteki kończył się
 * zdaniem „czy to arkusz w układzie 5.17/5.18?" — czyli aplikacja obwiniała
 * plik trenera za własny brak.
 *
 * Pełny ślad zostaje w logu serwera, bo tam jest od tego. Do trenera idzie
 * jedno zdanie i konkretna komenda do wpisania.
 */

/** Czy Pythona w ogóle nie ma na tym komputerze. */
function brakPythona(blad: unknown): boolean {
  const kod = (blad as { code?: string })?.code;
  return kod === "ENOENT";
}

function tresc(blad: unknown): string {
  const e = blad as { stderr?: Buffer | string; message?: string };
  return `${e?.stderr?.toString() ?? ""}\n${e?.message ?? ""}`;
}

/** Sam wynik Pythona, bez opakowania od Node'a. */
function stderrPythona(blad: unknown): string {
  return (blad as { stderr?: Buffer | string })?.stderr?.toString() ?? "";
}

/**
 * Zdanie dla trenera albo `null`, gdy przyczyna jest inna niż środowisko —
 * wtedy woła się to, co ma sens w danym miejscu (np. „to nie jest arkusz 5.18").
 */
export function bladSrodowiskaPythona(blad: unknown): string | null {
  if (brakPythona(blad)) {
    return "Nie znalazłem Pythona, a eksport i wczytywanie arkuszy go wymagają. "
      + "Zainstaluj Pythona 3 ze strony python.org, potem w terminalu: "
      + "pip install openpyxl";
  }

  const opis = tresc(blad);
  if (/No module named ['"]?openpyxl/.test(opis)) {
    return "Brakuje biblioteki openpyxl, bez której nie da się czytać ani "
      + "zapisywać arkuszy. Zainstaluj ją w terminalu: pip install openpyxl";
  }
  if (/No module named/.test(opis)) {
    const czego = opis.match(/No module named ['"]([^'"]+)/)?.[1] ?? "?";
    return `Brakuje biblioteki Pythona „${czego}". Zainstaluj ją w terminalu: `
      + `pip install ${czego}`;
  }
  if (/Permission denied|EACCES/.test(opis)) {
    return "Brak uprawnień do zapisu w katalogu danych. Sprawdź, czy konsola "
      + "ma prawo pisać w konsola/dane/.";
  }
  return null;
}

/**
 * Pierwsza linia, która niesie treść — ślad stosu bywa na trzydzieści linijek,
 * a interesuje nas ostatnia, bo Python tam wypisuje właściwy błąd.
 */
export function pierwszaLiniaBledu(blad: unknown): string {
  // Wyłącznie to, co wypisał Python. Komunikat Node'a („Command failed: …")
  // niesie pełną komendę razem ze ścieżkami z dysku — a ten tekst trafia
  // trenerowi na ekran, więc nie ma tam czego szukać.
  const linie = stderrPythona(blad)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("File ") && !l.startsWith("Traceback"));
  return linie.at(-1) ?? "nieznany błąd";
}
