#!/bin/bash
#
# Postawienie konsoli na świeżym serwerze — jedną komendą.
#
#   curl -fsSL https://raw.githubusercontent.com/Paew-coder/Fitness-plans-mvp/\
#   claude/craftmyplan-training-app-hokugh/konsola/wdrozenie/instaluj.sh \
#     | bash -s -- craftmyplan.pl twoj@email.pl
#
# Robi to, co WDROZENIE.md każe wpisać ręcznie w ośmiu krokach: Docker,
# pobranie kodu, plik `.env`, uruchomienie i automat aktualizacji. Hasło
# zostaje osobno, bo pyta o nie interaktywnie — i dobrze, że pyta.
#
# Jest bezpieczne do powtórzenia: na istniejącej instalacji pobiera zmiany
# i przebudowuje, zamiast zakładać wszystko od nowa. Danych nie dotyka.
set -euo pipefail

DOMENA="${1:-}"
EMAIL="${2:-}"
GALAZ="${GALAZ_CRAFTMYPLAN:-claude/craftmyplan-training-app-hokugh}"
KATALOG="${KATALOG_CRAFTMYPLAN:-$HOME/Fitness-plans-mvp}"

if [ -z "$DOMENA" ] || [ -z "$EMAIL" ]; then
  echo "Użycie: instaluj.sh <domena> <e-mail>"
  echo "Przykład: instaluj.sh craftmyplan.pl trener@example.com"
  exit 1
fi

krok() { echo; echo "── $* ────────────────────────────────"; }

krok "1/5  Docker"
if command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then
  echo "jest już zainstalowany"
else
  curl -fsSL https://get.docker.com | sh
fi

krok "2/5  Kod aplikacji"
if [ -d "$KATALOG/.git" ]; then
  git -C "$KATALOG" fetch origin "$GALAZ" --quiet
  git -C "$KATALOG" merge --ff-only FETCH_HEAD
  echo "zaktualizowany: $KATALOG"
else
  git clone -b "$GALAZ" --quiet https://github.com/Paew-coder/Fitness-plans-mvp.git "$KATALOG"
  echo "pobrany: $KATALOG"
fi

krok "3/5  Konfiguracja"
cd "$KATALOG/konsola"
# Klucz do AI zostaje, jeśli był — to jedyna linijka, której nie odtworzymy.
KLUCZ="$(grep -s '^ANTHROPIC_API_KEY=' .env || true)"
{
  echo "DOMENA=$DOMENA"
  echo "EMAIL=$EMAIL"
  [ -n "$KLUCZ" ] && echo "$KLUCZ"
} > .env
echo "domena: $DOMENA"
echo "e-mail do certyfikatu: $EMAIL"

krok "4/5  Uruchomienie"
docker compose up -d --build
echo "kontenery wstały"

krok "5/5  Automat aktualizacji"
WPIS="*/15 * * * * $KATALOG/konsola/wdrozenie/aktualizuj-serwer.sh"
if crontab -l 2>/dev/null | grep -qF "aktualizuj-serwer.sh"; then
  echo "już ustawiony"
else
  (crontab -l 2>/dev/null; echo "$WPIS") | crontab -
  echo "co kwadrans sprawdzana jest nowa wersja"
fi

cat <<KONIEC

════════════════════════════════════════════════════════════
  Zostało jedno: hasło do konsoli. Wpisz teraz:

    cd $KATALOG/konsola && docker compose exec konsola npm run haslo

  Do tego momentu konsola nie wpuszcza nikogo z zewnątrz — celowo.
  Potem wejdź na  https://$DOMENA

  Certyfikat HTTPS robi się sam przy pierwszym wejściu. Jeśli strona
  nie otwiera się od razu, domena może jeszcze nie wskazywać na ten
  serwer — poczekaj kwadrans i spróbuj ponownie.
════════════════════════════════════════════════════════════
KONIEC
