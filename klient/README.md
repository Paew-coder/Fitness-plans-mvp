# Aplikacja klienta

Dzisiejszy trening w telefonie. Klient dostaje jeden link, otwiera go i widzi
swój plan z policzonymi ciężarami. Kod leży w
[`../konsola/public/klient/`](../konsola/public/klient/) — chodzi na tym samym
serwerze co konsola trenera.

## Postęp przez wszystkie cykle

Ekran *Twój postęp* zaczyna się teraz od tego, czego arkusz nie pokazywał nigdy:
ile cykli klient ma za sobą, od kiedy trenuje, ile treningów domknął — i jak
zmieniał się jego ciężar maksymalny **przez kolejne cykle**, a nie tylko w tych
sześciu tygodniach: `100 → 112,5 → 125 kg (+25%)`.

Historia pobiera się osobnym zapytaniem, dopiero przy otwarciu tego ekranu —
widok treningu wraca z serwera przy każdym dotknięciu oceny i nie ma po co
przeliczać przy tym wszystkich cykli. Raz pobrana zapisuje się lokalnie, więc
następnym razem widać ją od razu, także bez zasięgu. Szkiców klient nie widzi
także tutaj.

## Zanim wyślesz link — sprawdź, czy jest do wysłania

Konsola uruchomiona na Twoim komputerze stoi pod adresem `localhost`. To słowo
znaczy „to urządzenie" — więc **na telefonie klienta wskazuje jego telefon**.
Skopiowany link nie ma prawa zadziałać: klient dostaje „nie można nawiązać
połączenia", Ty nie wiesz dlaczego, i na tym kończy się pierwszy cykl.

Konsola mówi o tym teraz wprost w okienku z linkiem. Są dwa wyjścia:

**Ta sama sieć Wi-Fi.** Ustaw hasło (`npm run haslo`) — bez niego konsola
celowo nie przyjmuje połączeń z innych urządzeń. Wtedy w okienku pojawi się
gotowy adres tego komputera w sieci, na przykład
`http://192.168.1.23:4173/k/…`. Ten komputer musi być włączony, a telefon
w tej samej sieci: dobre na spróbowanie z jednym klientem, za mało na co dzień.

**Własny serwer.** Klient wchodzi zawsze i skądkolwiek, niezależnie od tego,
czy Twój laptop jest włączony. Instrukcja od zera: [`../WDROZENIE.md`](../WDROZENIE.md).

## Jak to działa u Ciebie

1. W konsoli otwórz kartotekę klienta → **Link dla klienta** → skopiuj adres.
2. Wyślij go klientowi. **Raz** — ten sam adres działa przez kolejne cykle.
3. Klient otwiera na telefonie, może dodać do ekranu głównego jak zwykłą aplikację.

Link należy do klienta, nie do planu: gdy oznaczysz nowy cykl jako *wysłany*,
klient zobaczy go pod tym samym adresem. Szkic nie jest widoczny — do czasu
wysyłki klient widzi „trener przygotowuje Twój plan". Wcześniej token wisiał
przy planie, więc każdy cykl znaczył nowy link, a stary zamrażał klienta
na poprzednim planie.

Link wygląda tak: `http://…/k/Zvy1GXQUGwM4wLdCqXC-Xh0Jno1V5Zed`

## Co widzi klient

**Wybór treningu** — sześć tygodni, dni w każdym, odhaczone oznaczone ptaszkiem.

**Trening** — TOP SET, potem ćwiczenia po kolei: ciężar dużą czcionką, schemat
serii, RPE, link do filmu. Wspólna litera (`B1`, `B2`) ma wspólny pasek z boku —
to superseria, jak w arkuszu. Przy ćwiczeniu jednostronnym widnieje **na stronę**.

**Ocena jednym dotknięciem** — `Za trudne` / `OK` / `Za łatwe`. To dokładnie
kolumna `H` z arkusza, tylko że kciukiem.

**Co poszło** — pod oceną jest zwinięte `+ zapisz, co poszło`. Kto chce, wpisuje
faktyczny ciężar i powtórzenia; kto nie chce, ocenia i idzie dalej. Nic nie jest
obowiązkowe, bo na siłowni nikt nie wypełnia formularzy.

**Serie maksymalne** — na start cyklu. Wpisuje ciężar i powtórzenia, 1RM liczy
się od razu.

**Twój postęp** — osobny ekran: frekwencja tydzień po tygodniu, waga i to,
jak rosną ciężary w każdym ćwiczeniu (razem z szacowanym 1RM). Wszystko liczy
się z tego, co klient sam wpisał przy ćwiczeniach — jedyne dodatkowe pole to
waga, jeden wpis na dzień.

**Oddech i bieg** — osobny ekran, gdy trener wypełni te moduły w konsoli.
Dawka oddechowa z testu TWOT i sześć tygodni jednostek biegowych: czas, tempo,
tętno, szacowany dystans.

## Pętla się domyka

To jest sedno fazy 2. Ocena klienta wraca do silnika i zmienia ciężar
w kolejnym tygodniu — bez wysyłania czegokolwiek, bez odsyłania arkusza.

Sprawdzone na żywo:

| ćwiczenie | ocena w T1 | ciężar T1 | mnożnik | ciężar T2 |
|---|---|---|---|---|
| Barbell bench press | za łatwe | 85 kg | 1,05 | **87,5 kg** |
| Barbell row | za trudne | 62,5 kg | 0,95 | **57,5 kg** |
| Rope pushdown | *(bez oceny)* | 29 kg | 1,00 | 27 kg |

Trzeci wiersz też się zmienił, choć mnożnik został 1 — bo automat akcesoriów
podnosi powtórzenia z 10 na 11, a wyższe powtórzenia to niższy %1RM. Tak działa
arkusz i tak ma być.

Dodatkowo każde dotknięcie ląduje w **historii wykonań** — czego arkusz nie ma
w ogóle. To materiał na automatyczną aktualizację 1RM i porównanie cykli w fazie 3.

## Działa bez zasięgu

Na siłowni zasięg bywa żaden, więc nic nie może się zgubić:

- **Szkielet aplikacji** siedzi w cache przeglądarki (service worker), więc otwiera
  się offline.
- **Plan** leży w pamięci przeglądarki po pierwszym otwarciu z zasięgiem.
- **Oceny** zapisują się lokalnie od razu i czekają w kolejce; wysyłają się same,
  gdy wróci połączenie. U góry widnieje wtedy pasek „Offline".

Warunek jest jeden: klient musi otworzyć link **raz z zasięgiem**, żeby plan
zdążył się pobrać.

> **To przez długi czas nie działało — i wyglądało, jakby działało.** Service
> worker leży w `/klient/`, więc rejestrował się z domyślnym zakresem
> `/klient/`. Klient otwiera `/k/<token>`, czyli adres **spoza** tego zakresu:
> worker instalował się poprawnie i nigdy nie przejmował strony, którą klient
> faktycznie otwiera. Bez zasięgu przeglądarka pokazywała własny błąd, a plan
> zapisany lokalnie nie miał kto odczytać. Widać to było dopiero w narzędziach
> przeglądarki: `navigator.serviceWorker.controller === null`.
>
> Naprawa wymaga zgody trzech miejsc: rejestracji z `scope: "/"`, nagłówka
> `Service-Worker-Allowed: /` od serwera i filtra w samym workerze, żeby przy
> szerszym zakresie nie zaczął obsługiwać konsoli trenera. Pilnuje tego pięć
> testów w `konsola/testy/offline-klienta.test.ts`.
>
> Sprawdzone po naprawie: pierwsze wejście z zasięgiem, potem tryb samolotowy —
> aplikacja otwiera się, pokazuje plan i historię przez cykle.

## Postęp przez wszystkie cykle — sprawdzony na dwóch

Blok „Przez wszystkie cykle" pojawia się dopiero od drugiego cyklu, więc
jednocyklowe przejście nigdy go nie dotykało — a to jedyne miejsce, w którym
klient widzi, że przez pół roku cokolwiek się zmieniło.

Sprawdzone na prawdziwym przebiegu: klient trenuje cykl pierwszy z serią
maksymalną 120 kg × 3, potem dostaje cykl drugi i wpisuje 140 kg × 3.
Trajektoria pokazuje **1RM 127 → 148,1 kg, czyli +16,6%** — i tyle właśnie
widzi na telefonie. Przejście klikane potwierdza też, że po wysłaniu drugiego
cyklu **telefon sam na niego przechodzi**, bez nowego linku.

## Na ekranie głównym wygląda jak aplikacja

Klient może dodać link do ekranu głównego telefonu — otwiera się wtedy bez
paska adresu, na pełnym ekranie, z własną ikoną. Od zwykłej zakładki różni ją
właśnie ikona, a tu była pułapka: **iOS nie czyta ikon z manifestu**. Bierze
wyłącznie `apple-touch-icon` i wyłącznie PNG. Bez tego iPhone stawiał na
ekranie głównym **zrzut strony** — rozmazany prostokąt z fragmentem treningu.

Ikona (sztanga na ciemnym tle, w kolorze akcentu konsoli) leży w trzech
rozmiarach, razem z wersją maskowalną dla Androida, który przycina ikony do
własnego kształtu. Wszystkie trafiają do pamięci telefonu razem z aplikacją,
więc działają bez zasięgu.

Rysuje je [`konsola/narzedzia/ikony.py`](../konsola/narzedzia/ikony.py) — bez
żadnych bibliotek, sam PNG składany z `zlib`. Ikona zapisana bez źródła to
plik, którego za pół roku nikt nie umie zmienić.

## Aktualizacje docierają same

Aplikacja klienta zapisuje się w telefonie, żeby otwierała się bez zasięgu —
i to jest cały sens tego rozwiązania. Ma jednak drugą stronę: plik raz
zapisany zostaje tam na długo. Przez pierwsze wersje worker odpowiadał
wyłącznie z zapisanej kopii, więc **poprawka docierała do klienta tylko wtedy,
gdy ktoś pamiętał podbić numer wersji w kodzie workera**. Zabezpieczenie
oparte na pamięci: jedno przeoczenie i wszyscy klienci zostają ze starym
kodem, bez żadnego objawu po stronie trenera.

Teraz jest inaczej: aplikacja otwiera się **z kopii** (czyli natychmiast,
także w piwnicy bez zasięgu), a świeża wersja pobiera się **w tle** i wchodzi
w życie przy następnym otwarciu. Kolejność jest celowa — „najpierw sieć"
dawałoby świeższy kod kosztem tego, po co ten mechanizm w ogóle istnieje.

Sprawdzone klikaniem, nie na słowo: `npm run przeglad-klienta` podmienia plik
aplikacji na dysku i potwierdza, że zmiana dociera przy drugim otwarciu.
Ta sama kontrola puszczona na starym kodzie pokazuje, że zmiana **nie
docierała nigdy**, choćby klient otwierał aplikację bez końca.

## O bezpieczeństwie — wprost

Link jest kluczem. Kto go ma, ten widzi plan; nie ma hasła ani logowania.

Przy kilkunastu klientach uważam to za proporcjonalne: plan treningowy to nie
dane medyczne, a konta z hasłami to osobny kawałek pracy i osobny kłopot dla
klienta. Token ma 192 bity losowości, więc zgadnąć się go nie da.

Co z tego wynika w praktyce:

- Link nie powinien trafiać na grupowe czaty ani nigdzie publicznie.
- Gdyby wyciekł — **Unieważnij link** w konsoli. Stary przestaje działać
  natychmiast, generujesz nowy.
- Każdy plan ma własny token. Unieważnienie jednego nie rusza pozostałych.

Gdy klientów będzie kilkuset albo dojdą dane wrażliwe (kontuzje, historia
zdrowotna), trzeba to zamienić na prawdziwe konta. Wtedy też przyda się baza
danych z `docs/03-architektura.md`.

## Czego jeszcze nie ma

- Powiadomień o zaplanowanym treningu.
