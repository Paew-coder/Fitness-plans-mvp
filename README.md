# CraftMyPlan — projekt aplikacji treningowej

Projekt aplikacji zbudowanej wokół silnika z **MasterTemplate 5.17** — arkusza, który
liczy ciężary z RPE i 1RM, model stresu na trzech osiach, bilans wzorców ruchu
i pętlę adaptacji na feedbacku klienta.

Dokumentacja opisuje, **jak ten silnik faktycznie działa** (zweryfikowane w pliku,
nie z pamięci) i **jak przenieść go do aplikacji** bez utraty ani jednej liczby.

## Dokumenty

| | |
|---|---|
| [`01-analiza-zrodel.md`](docs/01-analiza-zrodel.md) | Co robi arkusz 5.17, rozbieżności instrukcja ↔ plik, gdzie jest Base44 |
| [`02-silnik-obliczeniowy.md`](docs/02-silnik-obliczeniowy.md) | Jądro rozłożone na funkcje czyste — wzory, sygnatury, plan testów |
| [`03-architektura.md`](docs/03-architektura.md) | Warstwy, schemat bazy, ekrany, rekomendacja stacku, miejsce dla AI |
| [`04-roadmapa.md`](docs/04-roadmapa.md) | Pięć faz, migracja danych, otwarte decyzje |

## Dane referencyjne

Wyciągnięte z 5.17 i sprawdzone przeciwko komórkom arkusza:

| Plik | Zawartość |
|---|---|
| [`dane/tabele-przeliczeniowe.json`](docs/dane/tabele-przeliczeniowe.json) | RPE → %1RM (powt. 1–15 × RPE 6–10) + 3 tabele stresu |
| [`dane/baza-cwiczen.json`](docs/dane/baza-cwiczen.json) | 164 ćwiczenia: kategoria, part, coeff, skok kg, progresja, film, uwagi |
| [`dane/oddech-progi.json`](docs/dane/oddech-progi.json) | 5 progów TWOT → dawka oddechowa |
| [`dane/jednostronne.json`](docs/dane/jednostronne.json) | 30 ćwiczeń jednostronnych |

## Trzy rzeczy, które trzeba wiedzieć przed czytaniem

**1. Plik wygrywa nad instrukcją.** `CLAUDE.md` opisuje 3 dni i zakładkę PANEL — 5.17
ma 5 dni i zakładkę `Analiza`. Wszystko poniżej opisuje plik.

**2. Znany błąd „przełączniki B4/B5 jako C3/C4" jest już naprawiony w 5.17.**
Zero odwołań do `Analiza!$C$3`/`$C$4` w XML. Przełącznik „trzymaj z bloku" działa.
Błąd TOP SET (formuły zaszyte w wierszu 7) — potwierdzony i naprawiony w 5.18,
razem z dwoma nieznanymi wcześniej brakami formuł.

**3. Base44 „CraftMyPlan" nie ma silnika.** Ma poprawne ekrany i 1 ćwiczenie w katalogu.
Nie ma tabeli RPE, tabel stresu, skoku kg, pętli feedbacku ani reguł ciężaru per tydzień.
To prototyp UI, nie aplikacja do dokończenia.

## Silnik — faza 0 zrobiona

W [`silnik/`](silnik/) leży działające jądro: ciężary, stres, bilans, walidacja.
Zero zależności, Node 22 uruchamia je wprost.

```bash
cd silnik
npm test                                        # 70 testów, 650 wartości zgodnych z arkuszem
npm run sprawdz -- "Plan klienta.xlsx"          # co jest nie tak z planem
npm run policz -- 1rm 80 5                      # 1RM z serii maksymalnej
npm run policz -- blok "Rope pushdown" --1rm 40 # sześć tygodni naraz
npm run policz -- kontrola                      # listy robocze z BAZY
```

Szczegóły i sposób dokładania własnych planów do testów: [`silnik/README.md`](silnik/README.md).

## Konsola trenera — faza 1 w toku

```bash
cd konsola
npm start          # → http://localhost:4173
```

Układasz plan (5 dni × 12 slotów), widzisz ciężary i analizę na żywo, kontrola
pokazuje co blokuje wysyłkę, przycisk eksportuje arkusz w formacie 5.18.
Sprawdzone: plan z konsoli → arkusz → przeliczenie → **500 wartości zgodnych**.

Dwie rzeczy, których arkusz nie miał: karta **Realizacja** (czy klient w ogóle
ćwiczy — domknięte i zaczęte treningi tydzień po tygodniu) i **1RM z serii
roboczych** (propozycja nowego 1RM policzona z tego, co klient faktycznie
podnosił, zamiast kolejnej serii maksymalnej).

Szczegóły: [`konsola/README.md`](konsola/README.md).

## Aplikacja klienta — faza 2 w toku

W konsoli: **Link dla klienta** → wysyłasz adres → klient otwiera na telefonie.
Widzi dzisiejszy trening z policzonymi ciężarami, ocenia jednym dotknięciem,
działa bez zasięgu.

Pętla się domyka: ocena klienta zmienia ciężar w kolejnym tygodniu, bez
odsyłania arkusza. Kto chce, dopisuje jeszcze, ile faktycznie podniósł — i z
tego wychodzi nowe 1RM. Szczegóły i uwagi o bezpieczeństwie:
[`klient/README.md`](klient/README.md).

## Poprawki do arkusza

[`arkusz/`](arkusz/README.md) robi z 5.17 plik **5.18** z trzema poprawkami:
TOP SET czytający bój główny zamiast pierwszego slotu, plus dwie brakujące formuły
(`START!B7` i `T1!G8`), które wyszły przy testowaniu. Oryginał zostaje nietknięty,
każda poprawka jest do pominięcia osobno.

## Następny krok

`04-roadmapa.md`, faza 3: porównanie cykli, moduły ODDECH i BIEG, przegląd
wszystkich klientów naraz. Pięć decyzji, które blokowały fazę 1, jest podjętych —
zapisane na końcu roadmapy.
