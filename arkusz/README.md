# Arkusz — poprawki do MasterTemplate

Skrypt `napraw-topset.py` robi z **5.17** plik **5.18** z trzema poprawkami.
Oryginał zostaje nietknięty.

```bash
python3 arkusz/napraw-topset.py MasterTemplate517.xlsx MasterTemplate518.xlsx
```

Skrypt wypisuje każdą zmienioną komórkę — „było" i „jest" — żeby dało się to przejrzeć
przed użyciem pliku.

## Trzy poprawki, trzy niezależne decyzje

Poprawki 2 i 3 wyszły przy testowaniu poprawki 1. Każdą można pominąć osobno:

| | Co naprawia | Komórek | Jak pominąć |
|---|---|---|---|
| **1** | TOP SET czyta bój główny, nie pierwszy slot | 235 | — (to jest cel skryptu) |
| **2** | Brakująca formuła `START!B7` | 1 | `--bez-startu` |
| **3** | Brakująca formuła ciężaru `T1!G8` | 1 | `--bez-ciezarow` |

### Poprawka 1 — TOP SET

**Było:** wiersz TOP SET czytał na sztywno pierwszy slot dnia (wiersze 7, 23, 39, 55, 71).
Rozgrzewka w S01 → TOP SET pokazywał ciężar rozgrzewki.

**Jest:** wiersz TOP SET sam znajduje bój główny po literze `A` w kolumnie Lp.
Indeks ląduje w nowej komórce technicznej `K`, reszta czyta z niego przez `INDEX`.

```
K6  =IFERROR(MATCH("A*",$A$7:$A$18,0),0)
P6  =IF(N($K6)=0,"",INDEX($P$7:$P$18,$K6))      skok kg
Q6  =IF(N($K6)=0,"",INDEX($Q$7:$Q$18,$K6))      progresja
R6  =IF(N($K6)=0,"",INDEX($R$7:$R$18,$K6))      1RM
AA6 =IF(N($K6)=0,"",INDEX($AA$7:$AA$18,$K6))    1RM ręczny (tylko T2–T6)
```

Dzięki temu **formuły `C` i `G` zachowują dokładnie ten sam kształt** — zmienia się
w nich tylko numer wiersza, z którego czytają: `$Q7` → `$Q6`, `$R7` → `$R6` i tak dalej.
To najmniejsza możliwa zmiana, jaką dało się tu zrobić.

Poprawione też podsumowanie dnia (`D19`, `D35`, …), które liczyło TOP SET jako serię
na podstawie pierwszego slotu zamiast własnego ćwiczenia TOP SETU.

Gdy w dniu nie ma żadnej pozycji `A`, `MATCH` nie trafia, `K` = 0 i TOP SET zostaje pusty.
Dziś w takiej sytuacji pokazuje zawartość pierwszego slotu, czyli coś nieprawdziwego.

### Poprawka 2 — `START!B7`

Kolumna B w `START` to lustro nazw ćwiczeń z T1. Wypełnionych jest 59 z 60 komórek —
**brakuje dokładnie `B7`**, czyli slotu `D1-S02`.

Skutek: dla tego slotu nazwa ćwiczenia nigdy nie trafiała na `START`, więc 1RM się
nie rozwiązywał, a seria maksymalna wpisana przez klienta była po cichu ignorowana.
Ciężar pokazywał `— brak 1RM` mimo poprawnie wypełnionego wejścia.

```
B7  =IF('T1'!$C8="","",'T1'!$C8)
```

### Poprawka 3 — `T1!G8`

Ta sama historia, ten sam slot. Kolumna `G` (ciężar) ma formułę w 359 z 360 komórek
we wszystkich sześciu tygodniach — **brakuje `T1!G8`**.

Skutek: slot `D1-S02` nigdy nie pokazywał ciężaru, nawet przy poprawnym 1RM.

Obie brakujące formuły to najpewniej ślad po dawnej edycji tego jednego wiersza.
Skrypt odtwarza wzorzec z sąsiednich komórek.

## Jak to zostało sprawdzone

Test na przeliczonym pliku (LibreOffice headless), dzień I:
`S01` = rozgrzewka `Allah`, `S02` = `A1. Barbell bench press` (1RM 113 kg).

| | 5.17 | 5.18 |
|---|---|---|
| TOP SET — ćwiczenie | `Allah` ✗ | `Barbell bench press` ✓ |
| TOP SET — ciężar | 45 kg ✗ | **97,5 kg** ✓ |
| slot A1 — ciężar | *(puste)* ✗ | **85 kg** ✓ |

Obie liczby zgadzają się z ręcznym rachunkiem: `113 × 86,5% = 97,7 → 97,5`
oraz `113 × 74,5% = 84,2 → 85,0`.

**Test regresji** na układzie normalnym (bój główny w S01, 4 ćwiczenia):
wszystkie ciężary, stres, serie i powtórzenia **identyczne** w 5.17 i 5.18.
Jedyna różnica to `G8`, które przestaje być puste — czyli poprawka 3.

## Metoda

Skrypt edytuje XML **wprost w archiwum `.xlsx`**, a nie przez openpyxl.
Powód: ten plik zawiera część `xl/metadata`, którą openpyxl przy zapisie wyrzuca.

Efekt: zmienia się **siedem plików wewnątrz archiwum** — `sheet1` (START)
i `sheet3`–`sheet8` (T1–T6). Pozostałe 47 części zostaje bajt w bajt.
Walidacje (64 w T1) i formatowanie warunkowe (15 reguł) zachowane.

## Zanim wgrasz do Arkuszy Google

1. Przejrzyj wypis „było / jest" ze skryptu.
2. Otwórz 5.18 i sprawdź jeden dzień z każdego tygodnia — czy TOP SET pokazuje bój główny.
3. Sprawdź `Analiza` — kontrole danych mają wyglądać jak wcześniej.
4. Dopiero wtedy podmieniaj plik roboczy.

Wersje klientów zbudowane na 5.17 **nie dostają tej poprawki automatycznie** —
skrypt trzeba puścić na każdym pliku osobno. Zadziała na każdym w układzie 5.17.
