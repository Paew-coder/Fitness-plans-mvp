#!/bin/bash
#
# Odzyskanie klientów z poprzedniej paczki — Mac i Linux.
#
# Cała robota siedzi w narzędziu node'owym obok; ten plik tylko je odpala,
# raz po listę i drugi raz po wybranej pozycji.
#
# Na Windows jest osobny plik: „Odzyskaj dane.bat”.

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

if ! node --no-warnings narzedzia/znajdz-dane.ts; then
  read -r -p "Naciśnij Enter, żeby zamknąć."
  exit 1
fi

read -r -p "  Numer bazy do przeniesienia (Enter = rezygnacja): " NUMER
if [ -z "$NUMER" ]; then
  echo "  Nic nie zmieniono."
  read -r -p "  Naciśnij Enter, żeby zamknąć."
  exit 0
fi

if ! node --no-warnings narzedzia/znajdz-dane.ts --wykonaj "$NUMER"; then
  echo
  echo "Nic nie zostało zmienione — powód jest wypisany wyżej."
  read -r -p "Naciśnij Enter, żeby zamknąć."
  exit 1
fi

echo "  Uruchom teraz „Uruchom CraftMyPlan” — klienci mają być na liście."
echo
read -r -p "  Naciśnij Enter, żeby zamknąć to okno."
