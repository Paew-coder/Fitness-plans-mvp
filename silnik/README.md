# Silnik CraftMyPlan

Jądro obliczeniowe przeniesione z **MasterTemplate 5.17**: ciężary z RPE i 1RM,
stres na trzech osiach, bilans wzorców ruchu, pętla adaptacji na feedbacku klienta.

Zero zależności. Zero kroku budowania. Node 22 uruchamia TypeScript wprost.

## Uruchomienie

```bash
cd silnik
npm test          # sprawdza zgodność z arkuszem
npm run policz    # kalkulator z wiersza poleceń
```

Nie trzeba nic instalować — `node --version` musi pokazać 22.6 lub wyżej.

## Sprawdzanie planu klienta

Bierze plik `.xlsx` i mówi, co jest z nim nie tak:

```bash
npm run sprawdz -- "Plan Zuzanna C 3.0.xlsx"
```

Raport ma cztery części:

1. **Co blokuje wysyłkę** — brak serii maksymalnej, ćwiczenie spoza BAZY,
   powtórzenia poza tabelą.
2. **Do sprawdzenia** — bez nagrania, niezgodne ze szkieletem, pozycja
   „DO WERYFIKACJI", powtórka z poprzedniego cyklu.
3. **Obciążenie tydzień po tygodniu** z oceną normy i rozkładem wzorców.
4. **Czy arkusz liczy to samo co silnik** — rozbieżność zwykle znaczy skasowaną
   formułę w pliku. Tak wychodzi brak `T1!G8` w plikach zbudowanych na 5.17.

Najcichszy błąd, który to łapie: **ćwiczenie wpisane z literówką**. Arkusz nie
znajduje go w BAZIE i pomija slot — bez ciężaru, bez stresu, poza objętością —
a w planie wygląda normalnie. Żadna kontrola w zakładce Analiza tego nie widzi.

## Kalkulator

```bash
npm run policz -- 1rm 80 5
#   Seria maksymalna: 80,0 kg × 5 powt. do odmowy (RPE 10)
#   Twój 1RM: 90,4 kg

npm run policz -- ciezar "Barbell bench press" --1rm 100 --powt 8 --rpe 8 --serie 4
#   CIĘŻAR: 72,5 kg
#   stres — całkowity 3,20 · centralny 2,00 · obwodowy 4,40

npm run policz -- blok "Rope pushdown" --1rm 40      # sześć tygodni naraz
npm run policz -- szukaj pushdown                     # wyszukiwanie w BAZIE
npm run policz -- kontrola                            # listy robocze
```

## Zgodność z arkuszem

To jest sedno: silnik nie zastępuje arkusza, dopóki nie policzy tego samego.

```bash
npm test
# porównanych wartości: 194, pominiętych: 6     ← master-5-17 (szablon, prawie pusty)
# porównanych wartości: 459, pominiętych: 0     ← plan-2-dni-518 (realny plan)
# tests 59 · pass 59 · fail 0
```

**Kryterium:** ciężar co do grosza (tolerancja 0,005 kg), stres do 0,1.

Test przechodzi **tą samą ścieżką co `npm run sprawdz`** — ten sam import,
to samo porównanie. Jeśli test jest zielony, narzędzie liczy tak samo.

Zestawy porównawcze leżą w `testy/zlote/` i powstają z prawdziwych plików:

```bash
python3 narzedzia/zrzut-arkusza.py "Plan Zuzanna C 3.0.xlsx" testy/zlote/zuzanna-3.json
npm test
```

Każdy zestaw zawiera jednocześnie **wejście** (co wpisał trener) i **wynik**
(co arkusz policzył), więc test sprawdza całą ścieżkę naraz.

> **Plik musi być przeliczony przed eksportem.** Arkusz zapisuje ostatnio wyliczone
> wartości — w pliku edytowanym bez przeliczenia część komórek jest pusta. Takie pola
> są pomijane i raportowane jako „pominiętych", nigdy zaliczane po cichu.
>
> Sześć pominiętych w zestawie `master-5-17` ma inną przyczynę: to slot `D1-S02`,
> któremu w 5.17 brakuje formuły w `START!B7`, więc arkusz **nigdy** nie rozwiązuje
> tam 1RM. W 5.18 ten błąd jest naprawiony — zestaw `plan-2-dni-518` nie pomija
> już nic. Szczegóły: [`../arkusz/`](../arkusz/README.md).

## Co jest w środku

| Plik | Odpowiada za | Źródło w arkuszu |
|---|---|---|
| `rpe.ts` | %1RM, 1RM z serii maksymalnej, deduplikacja przez MAX | `TABELE!B4:J18`, `START!E` |
| `adaptacja.ts` | mnożnik z odczuć klienta, korekta powtórzeń | kolumny `AC`, `AD` |
| `powtorzenia.ts` | automat powtórzeń akcesoriów | kolumna `E` |
| `ciezar.ts` | cztery reguły ciężaru, TOP SET | kolumna `G`, wiersze TOP SET |
| `stres.ts` | trzy osie stresu, bilans wzorców, normy | `TABELE!B23:P61`, `T1!D87:I94` |
| `katalog.ts` | 164 ćwiczenia, filtrowanie po kategorii, oznaczenie jednostronnych | `BAZA`, zastępuje `LISTY` |
| `plan.ts` | przeliczenie sześciu tygodni naraz | `T1`–`T6` |
| `walidacja.ts` | 11 kontroli + powtórki z poprzedniego cyklu | `Analiza!A66:C76` |
| `odczyt-1rm.ts` | 1RM czytane z serii roboczych | **poza arkuszem** |
| `oddech.ts` | progi TWOT → dawka oddechowa | `ODDECH`, `TABELE!A66:I70` |
| `bieg.ts` | HR max, strefy, tempa, 6 tygodni jednostek | `BIEG` |

Dane referencyjne (`src/dane/`) są **generowane**, nie pisane ręcznie:

```bash
npm run dane    # z docs/dane/*.json
```

## Ćwiczenia jednostronne

`3 × 10` przy pozycji jednostronnej znaczy **na stronę** — sesja zawiera 6 serii.
Arkusz liczy 3, więc silnik ma na to przełącznik:

```ts
przeliczPlan({ ...plan, liczenieJednostronnych: "obie strony" })
porownajLiczenieJednostronnych(plan)   // co się zmienia i gdzie wypada z normy
```

**Domyślnie `"jak w arkuszu"`** — normy objętości w zakładce Analiza powstały na
starym liczeniu, więc przełączenie wymaga ich przeliczenia. Decyzja przy fazie 1.

## 1RM z serii roboczych

Arkusz zna jedną drogę do 1RM: seria maksymalna do odmowy na starcie cyklu.
Kosztuje trening, męczy klienta i po sześciu tygodniach już nie jest prawdziwa.

`odczyt-1rm.ts` odwraca wzór, którym arkusz liczy ciężar:

```
1RM = ciężar_wykonany / (%1RM[powtórzenia_wykonane][RPE] / 100)
```

RPE bierze się z planu, skorygowane odczuciem klienta o jeden stopień:
`za trudne` +1, `OK` 0, `za łatwe` −1. Klient nie podaje RPE — podaje odczucie,
a jeden stopień to ostrożny przelicznik: lepiej nie doszacować 1RM niż wysłać
kogoś na ciężar, którego nie udźwignie.

```ts
propozycja1RM(serie, obecne1RM)   // mediana z ostatnich 3, rozrzut, zmiana %
ocenPropozycje(propozycja)        // "wysokie" / "niskie" + powód
```

**Mediana, nie maksimum i nie średnia.** Jedna pomylona cyfra przy wpisywaniu
(90 zamiast 9) zawyżyłaby maksimum i przesunęła średnią; mediany nie ruszy.

Wynik to zawsze propozycja — w konsoli trener przyjmuje ją kliknięciem albo nie.

## Oddech i bieg

Dwa niezależne kalkulatory z zakładek `ODDECH` i `BIEG`. Nie dotykają ciężarów
ani stresu — liczą się z własnych pól.

```ts
dawkaOddechowa(22)             // próg TWOT → poziom, częstotliwość, trzy bloki
dawkaOddechowa(22, true)       // przeciwwskazanie → twarde zatrzymanie
planBiegowy({ wiek: 35, dystansTestowy: 5, czasTestowy: 25, jednostekWTygodniu: 3 })
```

**Przeciwwskazanie jest zatrzymaniem, nie ostrzeżeniem.** Arkusz podmienia
wtedy wszystkie pola na „ustal indywidualnie" i tak samo robi silnik — nie da
się tego przeklikać.

W biegu: **czas jest zadaniem, tempo celem, dystans szacunkiem.** Tydzień 4 ma
mnożnik 0,9 — to odciążenie wpisane w arkusz, nie błąd.

Oba moduły mają złoty test przeciwko 5.18 przeliczonemu w LibreOffice —
262 wartości, w tym wszystkie 30 jednostek biegowych przy pięciu treningach
w tygodniu.

**Rozbieżność w arkuszu, warta wiedzy:** jednostki opisane jako `Z2`/`Z3`/`Z4`
wskazują na wiersze „Strefa 1"/„Strefa 2"/„Strefa 3" z tabeli stref. Procenty
(60–70% HR max dla biegu spokojnego) zgadzają się z klasycznym modelem
pięciostrefowym, więc przesunięte są **nazwy w tabeli**, nie przypisania
jednostek. Silnik odwzorowuje plik; poprawka nazw to decyzja trenera.

## Trzy rzeczy, które łatwo zepsuć

Wszystkie mają testy — to miejsca, w których pierwsza wersja się myliła:

1. **`MROUND(76,125; 2,5)` = 75, nie 76,25.** 76,125 / 2,5 = 30,45, a to zaokrągla
   się do 30. Kolejność działań ma znaczenie: mnożenie przez mnożnik **przed**
   zaokrągleniem.
2. **Skok kg nigdy nie schodzi poniżej 0,5** — `MAX(skok; 0,5)` w arkuszu.
3. **Tabela nie interpoluje.** RPE 8,25 to błąd, nie „mniej więcej 8,5".

## Czego silnik świadomie nie robi

- Nie sięga do bazy, nie zna dat, nie losuje. Same funkcje czyste.
- Nie decyduje o doborze ćwiczeń — to zadanie trenera (i później warstwy AI).
- Nie liczy ciężaru za trenera przy sygnale kontuzji — walidator oznacza, nie obchodzi.
