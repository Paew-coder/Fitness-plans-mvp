#!/bin/bash
#
# Automatyczna aktualizacja konsoli na serwerze.
#
#   ./aktualizuj-serwer.sh            # pobierz i wdroż, jeśli jest co
#   ./aktualizuj-serwer.sh --wymus    # przebuduj nawet bez zmian
#
# Uruchamiany z crona raz na dobę. Bez tego każda poprawka znaczy dla trenera
# komendy w terminalu — czyli dokładnie to, od czego serwer miał uwolnić.
#
# Kolejność jest tu treścią, nie stylem:
#   1. kopia bazy — ZANIM cokolwiek ruszy,
#   2. pobranie zmian,
#   3. przebudowa tylko wtedy, gdy faktycznie coś przyszło.
#
# Nic nie robi po cichu: każdy przebieg dopisuje się do logu razem z powodem,
# dla którego się skończył.
set -euo pipefail

KATALOG="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GALAZ="${GALAZ_CRAFTMYPLAN:-claude/craftmyplan-training-app-hokugh}"
LOG="${LOG_CRAFTMYPLAN:-$KATALOG/aktualizacja.log}"
COMPOSE=(docker compose)

powiedz() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

cd "$KATALOG/konsola"

wymus=0
[ "${1:-}" = "--wymus" ] && wymus=1

# Czy w ogóle jest co pobierać. `git fetch` nic nie zmienia w katalogu roboczym.
git -C "$KATALOG" fetch origin "$GALAZ" --quiet
przed="$(git -C "$KATALOG" rev-parse HEAD)"
po="$(git -C "$KATALOG" rev-parse FETCH_HEAD)"

if [ "$przed" = "$po" ] && [ "$wymus" -eq 0 ]; then
  powiedz "bez zmian ($(echo "$przed" | cut -c1-7)) — nic nie robię"
  exit 0
fi

powiedz "nowa wersja: $(echo "$przed" | cut -c1-7) → $(echo "$po" | cut -c1-7)"

# Kopia PRZED czymkolwiek. Aplikacja da się odtworzyć z repozytorium, plany nie.
if "${COMPOSE[@]}" exec -T konsola node --no-warnings narzedzia/kopia.ts >> "$LOG" 2>&1; then
  powiedz "kopia bazy zrobiona"
else
  powiedz "UWAGA: nie udało się zrobić kopii — przerywam, nic nie zmieniam"
  exit 1
fi

git -C "$KATALOG" merge --ff-only FETCH_HEAD >> "$LOG" 2>&1
powiedz "kod pobrany"

"${COMPOSE[@]}" up -d --build >> "$LOG" 2>&1
powiedz "konsola przebudowana i uruchomiona"

# Migracja bazy dzieje się przy starcie i wypisuje, co przenosi — warto mieć
# to w logu obok reszty, a nie w osobnym miejscu.
sleep 5
"${COMPOSE[@]}" logs --tail 20 konsola >> "$LOG" 2>&1
powiedz "gotowe"
