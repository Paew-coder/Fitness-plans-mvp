# Postawienie konsoli na serwerze

Instrukcja od zera. Zakłada, że nie robiłeś tego wcześniej.

**Kiedy tego potrzebujesz:** gdy chcesz mieć dostęp do konsoli z telefonu
i z drugiego komputera, a klienci mają otwierać swoje linki bez oglądania się
na to, czy Twój laptop jest włączony.

**Kiedy tego NIE potrzebujesz:** jeśli konsola ma chodzić tylko na Twoim
komputerze. Wtedy wystarczy `npm start` i możesz przestać czytać.

---

## Co będzie potrzebne

| | Ile to kosztuje |
|---|---|
| Serwer (VPS) — najmniejszy wystarczy | ~20–40 zł/mies. |
| Domena, np. `craftmyplan.pl` | ~50–80 zł/rok |

Do wyboru: Mikr.us, OVH, Hetzner, DigitalOcean. Najtańszy plan da radę —
konsola jest lekka, a baza to jeden plik.

---

## Krok 1 — serwer i domena

1. Wykup VPS. Wybierz **Ubuntu 24.04**. Dostaniesz adres IP i hasło do konta
   `root` (albo klucz SSH).
2. Wykup domenę. W panelu domeny dodaj rekord **A** wskazujący na adres IP
   serwera. Rozejście się tego po świecie trwa od kilku minut do kilku godzin.

Sprawdź, czy zadziałało — na swoim komputerze:

```bash
ping twojadomena.pl
```

Ma odpowiadać adresem IP serwera.

## Krok 2 — wejście na serwer

```bash
ssh root@twojadomena.pl
```

Wszystkie dalsze komendy wpisujesz **na serwerze**, w tym oknie.

## Krok 3 — Docker

Docker pozwala uruchomić aplikację bez ręcznego instalowania Node, Pythona
i reszty. Jedna komenda:

```bash
curl -fsSL https://get.docker.com | sh
```

## Krok 4 — pobranie aplikacji

```bash
git clone https://github.com/Paew-coder/Fitness-plans-mvp.git
cd Fitness-plans-mvp/konsola
```

## Krok 5 — konfiguracja

Utwórz plik `.env` z dwiema linijkami:

```bash
cat > .env <<'KONIEC'
DOMENA=twojadomena.pl
EMAIL=twoj@email.pl
KONIEC
```

E-mail jest potrzebny do certyfikatu HTTPS — dostaniesz na niego
powiadomienie, gdyby coś było nie tak z odnowieniem.

## Krok 6 — uruchomienie

```bash
docker compose up -d
```

Pierwszy raz trwa kilka minut. Potem konsola stoi pod
`https://twojadomena.pl` — z certyfikatem, o który nie musisz dbać.

## Krok 7 — hasło (obowiązkowe)

```bash
docker compose exec konsola npm run haslo
```

Podaj swój e-mail i hasło (minimum 10 znaków).

**Do tego momentu konsola nie wpuszcza nikogo z zewnątrz** — celowo. Bez hasła
przyjmuje połączenia tylko z samej maszyny, więc nie da się przypadkiem
wystawić planów klientów do internetu.

## Krok 8 — przeniesienie dotychczasowych planów

Jeśli masz plany na laptopie, skopiuj bazę na serwer. Najpierw **na laptopie**:

```bash
cd konsola
npm run kopia
```

Wypisze ścieżkę do pliku. Wyślij go na serwer:

```bash
scp dane/kopie/craftmyplan-*.db root@twojadomena.pl:/tmp/baza.db
```

Potem **na serwerze**:

```bash
docker compose cp /tmp/baza.db konsola:/app/konsola/dane/craftmyplan.db
docker compose restart konsola
```

Wejdź na `https://twojadomena.pl` i sprawdź, czy plany są.

---

## Codzienne życie

**Sprawdzenie, czy działa**

```bash
docker compose ps          # ma pisać „running" i „healthy"
docker compose logs -f     # co się dzieje; Ctrl+C wychodzi
```

**Aktualizacja do nowszej wersji**

```bash
cd ~/Fitness-plans-mvp
git pull
cd konsola
docker compose up -d --build
```

Dane zostają — leżą na osobnym woluminie, nie w obrazie.

**Kopie zapasowe**

Robią się same, raz na dobę, i trzymają 30 ostatnich. Ale kopia na tym samym
serwerze co baza nie chroni przed utratą serwera, więc raz na jakiś czas
ściągnij ją do siebie:

```bash
# na swoim komputerze
scp root@twojadomena.pl:/var/lib/docker/volumes/konsola_dane/_data/kopie/craftmyplan-*.db ~/kopie-craftmyplan/
```

**Odtworzenie z kopii**

```bash
docker compose stop konsola
docker compose cp kopia.db konsola:/app/konsola/dane/craftmyplan.db
docker compose start konsola
```

---

## Bezpieczeństwo — co jest zrobione, a co zostaje na Tobie

**Zrobione:**

- HTTPS z automatycznym certyfikatem; bez niego token klienta leciałby
  otwartym tekstem.
- Hasło do konsoli wymagane; bez niego dostęp z zewnątrz jest zablokowany.
- Sesje w bazie — zmiana hasła wylogowuje wszystkie urządzenia, także
  zgubiony telefon.
- `Referrer-Policy: no-referrer`, żeby adres z tokenem klienta nie wyciekał
  do stron, na które klient klika z aplikacji.

**Zostaje na Tobie:**

- **Zapora.** Zamknij wszystko poza 22, 80 i 443:
  ```bash
  ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
  ```
- **Aktualizacje systemu.** Raz na miesiąc: `apt update && apt upgrade`.
- **Hasło do serwera.** Lepiej klucz SSH niż hasło.
- **Regulamin i polityka prywatności**, jeśli aplikacja wychodzi poza krąg
  Twoich klientów. To robota prawnika, nie programisty.

---

## Dane osobowe — przeczytaj, zanim dołożysz notatki

Aplikacja **celowo nie przechowuje danych zdrowotnych**. Trzyma ćwiczenia,
ciężary, wagę ciała i odczucia z treningu. Dlatego dostęp klienta przez link
bez hasła jest proporcjonalny do ryzyka.

Gdy dojdą kontuzje, historia leczenia albo notatki z Twojej praktyki
fizjoterapeutycznej, stają się to **dane szczególnej kategorii wg RODO**.
Wtedy trzeba: prawdziwych kont klientów z hasłem, szyfrowania danych,
umowy powierzenia z hostingodawcą i rejestru czynności przetwarzania.

Nie jest to zaporowe, ale musi być decyzją świadomą — nie skutkiem ubocznym
dodania pola „uwagi".

---

## Gdy coś nie działa

**Strona się nie otwiera**

```bash
docker compose ps        # czy oba kontenery stoją
docker compose logs caddy | tail -30
```

Najczęstsza przyczyna: domena jeszcze nie wskazuje na serwer. Sprawdź
`ping twojadomena.pl`.

**„Ta konsola nie ma ustawionego hasła"**

Wróć do kroku 7.

**Konsola nie wstaje po aktualizacji**

```bash
docker compose logs konsola | tail -50
```

Jeśli nic z tego nie wynika, wróć do poprzedniej wersji:

```bash
git log --oneline -5      # znajdź poprzedni commit
git checkout <jego-numer>
docker compose up -d --build
```

Dane są nietknięte — leżą poza obrazem.
