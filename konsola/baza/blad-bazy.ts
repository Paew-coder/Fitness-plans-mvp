/**
 * Zdanie po polsku zamiast śladu stosu, gdy nie da się otworzyć bazy.
 *
 * Sprawdzone na uszkodzonym pliku: konsola kończyła się komunikatem
 * `Error: file is not a database`, ścieżkami z dysku i ośmioma ramkami stosu.
 * A to jest dokładnie ten dzień, w którym trener ma w tym pliku wszystkich
 * swoich klientów i musi się dowiedzieć jednej rzeczy: **że jest kopia
 * i jak z niej wrócić**.
 *
 * Każdy komunikat kończy się więc tym samym: co wpisać. Diagnoza bez
 * następnego kroku jest w tej sytuacji bezużyteczna.
 */

const DROGA_POWROTU =
  "  Kopie zapasowe robią się same. Żeby zobaczyć, co masz do wyboru:\n"
  + "      npm run przywroc";

/**
 * Awarie systemu plików — te przychodzą **przed** SQLite, z zakładania katalogu
 * albo otwierania pliku, i mają własny kod. Sprawdzone: katalog bez prawa
 * zapisu kończył się zdaniem „Powód podany przez bazę: EACCES: permission
 * denied, mkdir …", a pod spodem radą, żeby odtworzyć z kopii — czyli poradą
 * na zupełnie inny kłopot. Odtworzenie nie pomaga, gdy nie ma gdzie zapisać.
 */
const AWARIE_SYSTEMU: Readonly<Record<string, (sciezka: string) => string>> = {
  EACCES: (s) => "Brak praw do katalogu z danymi — konsola nie ma gdzie zapisać.\n"
    + `  ${s}\n\n`
    + "  Zdarza się to po uruchomieniu aplikacji prosto z pobranego archiwum\n"
    + "  albo z katalogu, do którego system nie pozwala pisać. Przenieś cały\n"
    + "  katalog aplikacji do swoich dokumentów i uruchom ponownie.",
  EPERM: (s) => AWARIE_SYSTEMU.EACCES!(s),
  EROFS: (s) => "Dysk, na którym leżą dane, jest tylko do odczytu.\n"
    + `  ${s}\n\n`
    + "  Przenieś katalog aplikacji na dysk, na którym da się zapisywać.",
  ENOSPC: (s) => "Skończyło się miejsce na dysku.\n"
    + `  ${s}\n\n`
    + "  Zwolnij miejsce i uruchom konsolę ponownie. Dane nie zniknęły —\n"
    + "  ostatni zapis mógł się jednak nie udać.",
  ENOENT: (s) => "Nie ma katalogu, w którym miałyby leżeć dane, i nie da się go założyć.\n"
    + `  ${s}\n\n`
    + "  Sprawdź, czy ścieżka jest poprawna — a jeśli przenosiłeś aplikację,\n"
    + "  czy katalog `dane` pojechał razem z nią.",
  ENOTDIR: (s) => AWARIE_SYSTEMU.ENOENT!(s),
};

/** Rozpoznajemy po treści, bo `node:sqlite` oddaje jeden kod na wszystko. */
const PRZYCZYNY: readonly { wzor: RegExp; zdanie: (sciezka: string) => string }[] = [
  {
    wzor: /file is not a database|database disk image is malformed|malformed database schema/i,
    zdanie: (s) => `Plik z danymi jest uszkodzony i nie da się go otworzyć.\n  ${s}\n\n${DROGA_POWROTU}`,
  },
  {
    wzor: /unable to open database file/i,
    zdanie: (s) => "Nie mogę otworzyć pliku z danymi — nie ma go albo brakuje praw do katalogu.\n"
      + `  ${s}\n\n`
      + "  Sprawdź, czy katalog istnieje i czy da się w nim zapisywać.\n"
      + DROGA_POWROTU,
  },
  {
    wzor: /readonly database|attempt to write a readonly/i,
    zdanie: (s) => "Plik z danymi jest tylko do odczytu — konsola nie ma gdzie zapisać zmian.\n"
      + `  ${s}\n\n`
      + "  Na Macu zdarza się to po skopiowaniu aplikacji z pobranego archiwum.\n"
      + "  Sprawdź uprawnienia katalogu z danymi.",
  },
  {
    wzor: /database or disk is full|disk I\/O error/i,
    zdanie: (s) => "Skończyło się miejsce na dysku albo dysk zgłasza błąd zapisu.\n"
      + `  ${s}\n\n`
      + "  Zwolnij miejsce i uruchom konsolę ponownie. Dane nie zniknęły —\n"
      + "  ostatni zapis mógł się jednak nie udać.",
  },
];

/**
 * Zdanie dla trenera. Zawsze coś zwraca: nierozpoznana przyczyna też ma
 * skończyć się po polsku, bo trener i tak nie przeczyta stosu wywołań.
 */
export function powodNieotwarciaBazy(blad: unknown, sciezka: string): string {
  // Najpierw system plików: te awarie przychodzą wcześniej niż SQLite i wołają
  // o co innego. Radzenie odtworzenia z kopii, gdy nie ma gdzie zapisać,
  // wysłałoby trenera w ślepy zaułek.
  const kod = (blad as { code?: string })?.code;
  if (kod && kod in AWARIE_SYSTEMU) return AWARIE_SYSTEMU[kod]!(sciezka);

  const tresc = blad instanceof Error ? blad.message : String(blad);
  for (const { wzor, zdanie } of PRZYCZYNY) {
    if (wzor.test(tresc)) return zdanie(sciezka);
  }
  return `Nie udało się otworzyć pliku z danymi.\n  ${sciezka}\n`
    + `  Powód podany przez system: ${tresc}\n\n${DROGA_POWROTU}`;
}
