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

## Trzy rzeczy, które trzeba wiedzieć przed czytaniem

**1. Plik wygrywa nad instrukcją.** `CLAUDE.md` opisuje 3 dni i zakładkę PANEL — 5.17
ma 5 dni i zakładkę `Analiza`. Wszystko poniżej opisuje plik.

**2. Znany błąd „przełączniki B4/B5 jako C3/C4" jest już naprawiony w 5.17.**
Zero odwołań do `Analiza!$C$3`/`$C$4` w XML. Przełącznik „trzymaj z bloku" działa.
Błąd TOP SET (formuły zaszyte w wierszu 7) — nadal aktualny.

**3. Base44 „CraftMyPlan" nie ma silnika.** Ma poprawne ekrany i 1 ćwiczenie w katalogu.
Nie ma tabeli RPE, tabel stresu, skoku kg, pętli feedbacku ani reguł ciężaru per tydzień.
To prototyp UI, nie aplikacja do dokończenia.

## Silnik — faza 0 zrobiona

W [`silnik/`](silnik/) leży działające jądro: ciężary, stres, bilans, walidacja.
Zero zależności, Node 22 uruchamia je wprost.

```bash
cd silnik
npm test                                       # 57 testów, 194 wartości zgodne z arkuszem
npm run policz -- 1rm 80 5                     # 1RM z serii maksymalnej
npm run policz -- blok "Rope pushdown" --1rm 40 # sześć tygodni naraz
```

Szczegóły i sposób dokładania własnych planów do testów: [`silnik/README.md`](silnik/README.md).

## Następny krok

`04-roadmapa.md`, faza 1: konsola trenera na tym silniku, klient dalej dostaje
wyeksportowany arkusz. Przed startem — pięć otwartych decyzji na końcu roadmapy.
