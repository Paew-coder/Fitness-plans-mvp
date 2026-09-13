#!/bin/bash
#
# Wpuszczenie telefonu do konsoli CraftMyPlan — Mac i Linux.
#
# Konsola bez hasła przyjmuje połączenia tylko z tego komputera. To jest
# celowe: inaczej każdy w tej samej sieci Wi-Fi oglądałby plany klientów.
# Żeby wejść na nią z telefonu, trzeba najpierw ustawić hasło — i po to jest
# ten plik. Wcześniej dało się to zrobić wyłącznie z terminala, czyli dla
# kogoś, kto terminala nie otwiera, wcale.
#
# Na Windows jest osobny plik: „Dostep z telefonu.bat”.

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

  Dostęp z telefonu — ustawienie hasła

  Co się zmieni:
    • konsola zacznie prosić o e-mail i hasło przy każdym otwarciu,
      także na tym komputerze;
    • w zamian wpuści telefon i tablet z tej samej sieci Wi-Fi;
    • link dla klienta zacznie pokazywać adres, który da się wysłać.

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
    1. Wróć do okna przeglądarki z konsolą i odśwież stronę (Cmd+R).
    2. Zaloguj się e-mailem i hasłem, które przed chwilą ustawiłeś.
    3. Otwórz plan, kliknij „Link dla klienta” — pod linkiem będą teraz
       adresy do wpisania na telefonie.

  Żeby wrócić do trybu bez hasła, uruchom w terminalu:
    npm run haslo -- --usun

TEKST
read -r -p "  Naciśnij Enter, żeby zamknąć to okno."
