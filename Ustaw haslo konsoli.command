#!/bin/bash
#
# Ustawienie hasła do konsoli CraftMyPlan — Mac i Linux.
#
# Konsola bez hasła obsługuje tylko ten komputer: ekrany trenera są odcięte dla
# wszystkich innych urządzeń w sieci. Hasło to zdejmuje — i jest też warunkiem
# postawienia konsoli na serwerze. Wcześniej dało się je ustawić wyłącznie
# komendą w terminalu, czyli dla kogoś, kto terminala nie otwiera, wcale.
#
# Uwaga na to, czego ten plik NIE dotyczy: link dla klienta działa z telefonu
# w tej samej sieci także bez hasła, bo jego kluczem jest token w adresie.
#
# Na Windows jest osobny plik: „Ustaw haslo konsoli.bat”.

cd "$(dirname "$0")/konsola" || {
  echo "Nie znalazłem katalogu „konsola” obok tego pliku."
  echo "Ten plik ma leżeć w głównym katalogu projektu, tam gdzie README.md."
  read -r -p "Naciśnij Enter, żeby zamknąć."
  exit 1
}

if ! command -v node > /dev/null 2>&1; then
  echo "Nie ma zainstalowanego Node.js — bez niego nic tu nie zadziała."
  echo "Wejdź na https://nodejs.org i zainstaluj wersję LTS."
  read -r -p "Naciśnij Enter, żeby zamknąć."
  exit 1
fi

cat <<'TEKST'

  Hasło do konsoli trenera

  Po co:
    • żeby otworzyć konsolę na tablecie albo drugim komputerze;
    • żeby postawić ją na serwerze — bez hasła odmawia;
    • żeby nikt z tej samej sieci Wi-Fi na nią nie wszedł.

  Czego NIE zmienia: link dla klienta i tak działa z telefonu w tej samej
  sieci, także bez hasła. Jeśli chcesz tylko go sprawdzić — zamknij to
  okno, hasło nie jest do tego potrzebne.

  Co się zmieni: konsola zacznie prosić o e-mail i hasło przy każdym
  otwarciu, także na tym komputerze.

  Hasło musi mieć co najmniej 10 znaków i będzie widoczne podczas
  wpisywania. Zapisz je sobie — nie da się go odczytać później.

  Żeby zrezygnować, zamknij to okno.

TEKST
read -r -p "  Naciśnij Enter, żeby przejść dalej."

if ! node --no-warnings narzedzia/haslo.ts; then
  echo
  echo "Nic nie zostało zmienione — powód jest wypisany wyżej."
  read -r -p "Naciśnij Enter, żeby zamknąć."
  exit 1
fi

cat <<'TEKST'
  Co teraz:
    1. Wróć do okna przeglądarki z konsolą i odśwież stronę — Cmd+R.
    2. Zaloguj się e-mailem i hasłem, które przed chwilą ustawiłeś.
    3. Na tablecie wpisz adres wypisany wyżej i zaloguj się tak samo.

  Żeby wrócić do trybu bez hasła, uruchom w terminalu:
    npm run haslo -- --usun

TEKST
read -r -p "  Naciśnij Enter, żeby zamknąć to okno."
