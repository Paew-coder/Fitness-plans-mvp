#!/bin/bash
#
# Pobranie najnowszej wersji programu — Mac i Linux.
#
# Cała robota siedzi w narzędziu node'owym obok; ten plik tylko je odpala.
# To celowe: logikę da się sprawdzić testami, które chodzą wszędzie.
#
# Na Windows jest osobny plik: „Aktualizuj CraftMyPlan.bat”.

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

  Aktualizacja CraftMyPlan

  Co się stanie:
    • pobiorę najnowszą wersję programu z GitHuba,
    • podmienię pliki programu w tym katalogu,
    • zrobię wcześniej kopię bazy.

  Czego NIE ruszam: katalogu konsola/dane, czyli Twoich klientów, planów,
  ocen i wagi. Aktualizacja ich nie dotyka.

  Konsola musi być zamknięta — jeśli okno CraftMyPlan jest otwarte,
  zamknij je teraz.

  Żeby zrezygnować, zamknij to okno.

TEKST
read -r -p "  Naciśnij Enter, żeby przejść dalej."

if ! node --no-warnings narzedzia/aktualizuj.ts --wykonaj; then
  echo
  echo "Nic nie zostało zmienione — powód jest wypisany wyżej."
  read -r -p "Naciśnij Enter, żeby zamknąć."
  exit 1
fi

echo "  Uruchom teraz „Uruchom CraftMyPlan”, żeby wystartować nową wersję."
echo
read -r -p "  Naciśnij Enter, żeby zamknąć to okno."
