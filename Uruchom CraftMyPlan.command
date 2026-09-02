#!/bin/bash
#
# Uruchomienie konsoli CraftMyPlan jednym kliknięciem — Mac i Linux.
#
# Plik ma być klikalny dla kogoś, kto nie otwiera terminala. Dlatego robi
# trzy rzeczy, których zwykłe `npm start` nie robi: sprawdza, czy jest Node
# w wersji, która to uruchomi, sam otwiera przeglądarkę i — a to najważniejsze —
# przy każdym błędzie zostawia okno otwarte z wyjaśnieniem po polsku.
# Okno, które gaśnie po ułamku sekundy, nie mówi nikomu nic.
#
# Na Windows jest osobny plik: „Uruchom CraftMyPlan.bat”.

PORT="${PORT:-4173}"
ADRES="http://localhost:$PORT"

cd "$(dirname "$0")/konsola" || {
  echo "Nie znalazłem katalogu „konsola” obok tego pliku."
  echo "Ten plik ma leżeć w głównym katalogu projektu, tam gdzie README.md."
  read -r -p "Naciśnij Enter, żeby zamknąć."
  exit 1
}

czekaj_i_zamknij() {
  echo
  read -r -p "Naciśnij Enter, żeby zamknąć to okno."
  exit 1
}

# ── Node ───────────────────────────────────────────────────────────
if ! command -v node > /dev/null 2>&1; then
  echo "Nie ma zainstalowanego Node.js — bez niego aplikacja się nie uruchomi."
  echo
  echo "  1. Wejdź na https://nodejs.org"
  echo "  2. Pobierz wersję oznaczoną LTS"
  echo "  3. Zainstaluj jak zwykły program"
  echo "  4. Kliknij ten plik jeszcze raz"
  czekaj_i_zamknij
fi

WERSJA="$(node -v)"
GLOWNA="$(echo "$WERSJA" | sed 's/^v//' | cut -d. -f1)"
POBOCZNA="$(echo "$WERSJA" | sed 's/^v//' | cut -d. -f2)"
if [ "$GLOWNA" -lt 22 ] || { [ "$GLOWNA" -eq 22 ] && [ "$POBOCZNA" -lt 6 ]; }; then
  echo "Masz Node $WERSJA, a aplikacja potrzebuje 22.6 albo nowszego."
  echo "Pobierz nowszą wersję ze strony https://nodejs.org (wersja LTS) i kliknij ten plik ponownie."
  czekaj_i_zamknij
fi

# ── Python do arkuszy ──────────────────────────────────────────────
#
# Konsola działa bez Pythona — nie działa tylko eksport i wczytywanie arkuszy,
# bo format .xlsx czyta wyłącznie biblioteka `openpyxl`. Lepiej powiedzieć to
# teraz niż wtedy, gdy trener ułoży cały plan i kliknie „Eksportuj arkusz".
# To jest uwaga, nie przeszkoda: konsola startuje tak czy inaczej.
if command -v python3 > /dev/null 2>&1; then
  if ! python3 -c "import openpyxl" > /dev/null 2>&1; then
    echo "Uwaga: brakuje biblioteki openpyxl."
    echo "  Konsola będzie działać, ale eksport i wczytywanie arkuszy — nie."
    echo "  Żeby to naprawić, wpisz w terminalu:  pip install openpyxl"
    echo
  fi
else
  echo "Uwaga: nie znalazłem Pythona."
  echo "  Konsola będzie działać, ale eksport i wczytywanie arkuszy — nie."
  echo "  Pobierz Pythona 3 ze strony python.org, potem:  pip install openpyxl"
  echo
fi

otworz_przegladarke() {
  if command -v open > /dev/null 2>&1; then open "$ADRES"
  elif command -v xdg-open > /dev/null 2>&1; then xdg-open "$ADRES" > /dev/null 2>&1
  fi
}

# ── konsola już chodzi? ────────────────────────────────────────────
#
# Podwójne kliknięcie ikony przy działającej konsoli to najczęstsza rzecz,
# jaka się temu plikowi przydarza. Uruchamianie wtedy drugiej nie ma sensu:
# port jest zajęty i kończy się to błędem. Zwyczajnie otwieramy przeglądarkę.
#
# `-f` jest tu konieczne: bez niego `curl` uznaje za sukces także odpowiedź
# „nie znaleziono", czyli obcy program na tym porcie wyglądałby jak nasza
# konsola — a wtedy kliknięcie ikony nie robiłoby nic poza otwarciem pustej
# strony.
if curl -sf -o /dev/null "$ADRES/zdrowie" 2> /dev/null; then
  echo "Konsola już działa — otwieram $ADRES"
  otworz_przegladarke
  exit 0
fi

# ── start ──────────────────────────────────────────────────────────
echo "Uruchamiam konsolę CraftMyPlan…"
echo

PORT="$PORT" node --no-warnings serwer.ts &
SERWER=$!

# Przeglądarka ma się otworzyć dopiero wtedy, gdy jest co pokazać — inaczej
# pierwsze, co widzi trener, to „nie można nawiązać połączenia”.
for _ in $(seq 1 60); do
  if ! kill -0 "$SERWER" 2> /dev/null; then break; fi
  if curl -sf -o /dev/null "$ADRES/zdrowie" 2> /dev/null; then
    otworz_przegladarke
    break
  fi
  sleep 0.25
done

# Chwila zwłoki, zanim ogłosimy sukces: serwer, który nie zdołał zająć portu,
# umiera ułamek sekundy po tym, jak przestaje odpowiadać. Bez tej pauzy
# launcher zdążył napisać „Gotowe”, a dopiero potem okno gasło.
sleep 1

if ! kill -0 "$SERWER" 2> /dev/null; then
  wait "$SERWER"
  echo
  echo "Konsola nie wystartowała — powód jest wypisany wyżej."
  czekaj_i_zamknij
fi

echo
echo "  Gotowe — otwórz $ADRES"
echo "  To okno musi zostać otwarte. Zamknięcie go wyłącza aplikację."
echo

wait "$SERWER"
