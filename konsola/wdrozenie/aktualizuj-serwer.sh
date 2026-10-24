#!/bin/bash
#
# Automatyczna aktualizacja konsoli na serwerze.
#
#   ./aktualizuj-serwer.sh            # pobierz i wdroż, jeśli jest co
#   ./aktualizuj-serwer.sh --wymus    # przebuduj nawet bez zmian
#
# Uruchamiany z crona co minutę (do 17.10.2026 — co kwadrans; trener: „jest
# możliwe, żeby zmiany były od razu, a nie po tych 15 minutach?”). Bez tego
# każda poprawka znaczy dla trenera komendy w terminalu — czyli dokładnie to,
# od czego serwer miał uwolnić. Sprawdzenie to jedno zapytanie do GitHuba;
# przebudowa tylko wtedy, gdy faktycznie coś przyszło.
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

# Jeden przebieg naraz. Przebudowa trwa dłużej niż minuta, a drugi przebieg
# w tym czasie zobaczyłby „nową wersję” i zaczął drugą przebudowę obok.
if command -v flock > /dev/null 2>&1; then
  exec 9> "$KATALOG/.aktualizacja.lock"
  flock -n 9 || exit 0
fi

# Cron ustawiony dawniej „co kwadrans” przechodzi sam na „co minutę”
# (17.10.2026) — bez logowania się na serwer. Tylko wpis tego skryptu.
if command -v crontab > /dev/null 2>&1; then
  stary="$(crontab -l 2>/dev/null || true)"
  nowy="$(printf '%s\n' "$stary" | sed -E 's#^\*/15 (\* \* \* \* .*aktualizuj-serwer\.sh)#* \1#')"
  if [ -n "$stary" ] && [ "$stary" != "$nowy" ]; then
    printf '%s\n' "$nowy" | crontab - && powiedz "automat: sprawdzanie nowej wersji co minutę zamiast co kwadrans"
  fi
fi

wymus=0
[ "${1:-}" = "--wymus" ] && wymus=1

# Czy w ogóle jest co pobierać. `git fetch` nic nie zmienia w katalogu roboczym.
git -C "$KATALOG" fetch origin "$GALAZ" --quiet
przed="$(git -C "$KATALOG" rev-parse HEAD)"
po="$(git -C "$KATALOG" rev-parse FETCH_HEAD)"

if [ "$przed" = "$po" ] && [ "$wymus" -eq 0 ]; then
  # Co minutę — więc nie do logu (1440 linijek na dobę), tylko do jednego
  # pliku, nadpisywanego: widać, że automat żyje i kiedy ostatnio sprawdzał.
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] bez zmian ($(echo "$przed" | cut -c1-7))" > "$KATALOG/aktualizacja-ostatnio.txt"
  exit 0
fi

powiedz "nowa wersja: $(echo "$przed" | cut -c1-7) → $(echo "$po" | cut -c1-7)"

# Kopia PRZED czymkolwiek. Aplikacja da się odtworzyć z repozytorium, plany nie.
# Osobna pula kopii „przed aktualizacją” — przy częstych aktualizacjach
# nie wypychają codziennych (te zostają na miesiąc).
if "${COMPOSE[@]}" exec -T -e KOPIA_ETYKIETA=przed-aktualizacja konsola node --no-warnings narzedzia/kopia.ts >> "$LOG" 2>&1; then
  powiedz "kopia bazy zrobiona"
else
  powiedz "UWAGA: nie udało się zrobić kopii — przerywam, nic nie zmieniam"
  exit 1
fi

if git -C "$KATALOG" merge-base --is-ancestor HEAD FETCH_HEAD; then
  git -C "$KATALOG" merge --ff-only FETCH_HEAD >> "$LOG" 2>&1
else
  # Historia gałęzi na GitHubie przepisana (23.10.2026: linki do prywatnych
  # filmów trenera usunięte także ze starych wersji). Kod na serwerze ma tylko
  # odzwierciedlać gałąź, więc idzie za nią — chyba że ktoś zmienił tu pliki
  # ręcznie: wtedy stop, nic nie ginie po cichu. Dane klientów leżą na
  # woluminie Dockera, poza gitem — tego `reset` nie dotyka.
  if [ -n "$(git -C "$KATALOG" status --porcelain --untracked-files=no)" ]; then
    powiedz "UWAGA: historia gałęzi na GitHubie przepisana, a na serwerze są ręczne zmiany w plikach — nic nie ruszam"
    git -C "$KATALOG" status --short --untracked-files=no >> "$LOG" 2>&1
    exit 1
  fi
  powiedz "historia gałęzi na GitHubie przepisana — serwer przechodzi na nową"
  git -C "$KATALOG" reset --hard FETCH_HEAD >> "$LOG" 2>&1
fi
powiedz "kod pobrany"

# Skrót commita do obrazu (w obrazie nie ma gita) — analiza ruchu zapisuje
# go w każdym pliku jako wersję narzędzia (24.10.2026, badanie trenera).
git -C "$KATALOG" rev-parse --short=7 HEAD > "$KATALOG/konsola/wersja-commit.txt"
"${COMPOSE[@]}" up -d --build >> "$LOG" 2>&1
powiedz "konsola przebudowana i uruchomiona"

# Migracja bazy dzieje się przy starcie i wypisuje, co przenosi — warto mieć
# to w logu obok reszty, a nie w osobnym miejscu.
sleep 5
"${COMPOSE[@]}" logs --tail 20 konsola >> "$LOG" 2>&1
powiedz "gotowe"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] wdrożone $(echo "$po" | cut -c1-7)" > "$KATALOG/aktualizacja-ostatnio.txt"
