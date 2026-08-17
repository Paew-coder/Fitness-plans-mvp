# Aplikacja klienta

Dzisiejszy trening w telefonie. Klient dostaje jeden link, otwiera go i widzi
swój plan z policzonymi ciężarami. Kod leży w
[`../konsola/public/klient/`](../konsola/public/klient/) — chodzi na tym samym
serwerze co konsola trenera.

## Jak to działa u Ciebie

1. W konsoli otwórz plan → **Link dla klienta** → skopiuj adres.
2. Wyślij go klientowi.
3. Klient otwiera na telefonie, może dodać do ekranu głównego jak zwykłą aplikację.

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
