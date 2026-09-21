# 05 — Co przenieść z aplikacji Base44

Analiza aplikacji „CraftMyPlan" z Base44 (`6a005660818ba6a6c28f8b7d`), 21.09.2026.

## Skąd to wiem

Z **opublikowanego pakietu JavaScript** (`craftmyplan.base44.app/assets/index-DBrIfjxZ.js`,
1,26 mln znaków) — dostępnego bez żadnego planu. Pakiet jest zminifikowany, ale
mieszają się w nim wyłącznie nazwy zmiennych lokalnych: **struktura ekranów, nazwy
pól danych, klasy stylów i wszystkie teksty zostają czytelne**.

Dane pomocnicze w `dane/`: [`ekrany-base44.json`](dane/ekrany-base44.json) (teksty
ekran po ekranie), [`szablony-base44.json`](dane/szablony-base44.json) (14 szablonów
z progresją), [`cwiczenia-base44.json`](dane/cwiczenia-base44.json) (59 ćwiczeń),
[`teksty-base44.json`](dane/teksty-base44.json).

**Czego nie przeczytałem:** funkcji backendowych (`functions/*.js`, uruchamianych
po stronie Base44 — w pakiecie klienta ich nie ma) i komentarzy autora. Do ekranów,
o które chodzi, nie są potrzebne: kalendarz, panele treningu i licznik przerwy
dzieją się w przeglądarce.

---

## Jak zbudowana jest tamta aplikacja

Jedenaście ekranów, jedna ścieżka:

```
/onboarding      5 kroków: dane osobowe → sprzęt → cel → poziom → podsumowanie
/template-select krok 1 z 3 — wybór szablonu (3 rodziny × 1–4 dni + kontynuacje)
/schedule-setup  krok 2 z 4 — dni tygodnia, data startu, miejsce treningu
/plan            dobór ćwiczeń do slotów
/dashboard       plany + kalendarz treningów + wejście do biblioteki ćwiczeń
/workout-execution  sam trening: panel po panelu
/exercise-library  zarządzanie ćwiczeniami (kategorie, coeff, wideo)
```

**Różnica ustrojowa, o której trzeba pamiętać przy każdym punkcie niżej:** tamta
aplikacja jest **samoobsługowa** — podopieczny sam sobie układa plan, nie ma w niej
trenera. Nasza ma dwie strony: konsolę trenera i aplikację klienta. Dlatego część
tamtych ekranów nie ma u nas odpowiednika i mieć nie powinna.

---

## Co warto przenieść — w kolejności od najbardziej opłacalnego

### 1. Trening panel po panelu, z licznikiem przerwy

**Tam:** ekran `/workout-execution`. Ćwiczenia idą po kolei w panelach; pierwszy
panel to rozgrzewka (`🔥 Rozgrzewka`). W panelu: zdjęcie, rozpiska serii, pola
`Ciężar (kg)` i `Powtórzenia`, przycisk **`Zakończ serię`**. Po serii wchodzi
ekran **`PRZERWA`** z odliczaniem co sekundę i przyciskiem **`Pomiń przerwę`**;
po zejściu do zera samo przechodzi dalej. Na końcu `Trening zakończony! 🎉`.
Miejsce w treningu trzyma się w `localStorage` — kto wyjdzie w połowie, wraca tam,
gdzie skończył.

**U nas:** cały dzień na jednym ekranie, ocena kciukiem, żadnego licznika,
żadnego prowadzenia po kolei.

**Warto:** tak. To jest jedyna rzecz z tej listy, która zmienia **sposób używania**
aplikacji na siłowni, a nie tylko jej wygląd. Licznik przerwy jest przy tym
najtańszy z całej listy.

### 2. Kalendarz z przesuwaniem treningów

**Tam:** sekcja „Kalendarz treningów" na `/dashboard`, trzy współpracujące części:
* **siatka tygodni** — każdy dzień w jednym z trzech stanów: `Trening`,
  `Ukończony`, `Pominięty (kliknij, aby przenieść)`;
* **pasek „dziś"** — `Dziś masz trening!` + `Przejdź do treningu`, albo
  `Trening ukończony!`, albo `Dziś brak treningu`;
* **okno dnia** — podgląd z rozgrzewką i **zmianą daty**. Przy zaległym treningu
  pisze wprost: *„Trening z przeszłości — możesz przenieść go do przodu, żeby nie
  przepadł"*, z powrotem przez `Wróć do planowanej`.

Pod spodem: `training_days` (dni tygodnia) i `date_overrides` (mapa przesunięć)
w encji planu.

**U nas:** plan ma jedną `dataStartu` i nic poza tym. Tygodnie i dni są numerami,
nie datami. Klient nie ma jak powiedzieć „przełożyłem wtorek na czwartek".

**Warto:** tak, ale to jest **największa zmiana z całej listy** — dotyka modelu
danych, nie tylko ekranu. Dopiero po pierwszym pełnym cyklu.

### 3. Kalibracja pierwszym treningiem zamiast serii maksymalnych

**Tam:** max sety są opcjonalne. *„— możesz pominąć i uzupełnić podczas pierwszego
treningu"*, a przy ćwiczeniu bez zmierzonego 1RM: *„Brak wpisanego max setu — 1RM
zostanie wyliczone po wpisaniu ciężaru podczas treningu"*. Po wpisaniu pierwszej
serii: *„Max set zapisany — kolejne serie będą już z wyliczonym ciężarem"*
i *„Ciężar wyliczony na podstawie Twojego Max Setu z tej sesji"*.

**U nas:** silnik liczy to od dawna (`oneRMzSerii`, z RPE poprawionym o ocenę
klienta), a wpisane ciężary wracają jako propozycje 1RM z przyciskiem *Przyjmij*.
Brakuje trzech rzeczy po stronie ekranów: pola ciężaru widocznego wprost (dziś jest
zwinięte pod „zapisz, co poszło"), sensownego stanu zamiast `— brak 1RM`,
i instrukcji: dwie drogi na start plus wyjaśnienie, czym jest RPE.

**Warto:** tak — i to jest najtańsza rzecz z pierwszej trójki, bo matematyka stoi
gotowa.

### 4. Podgląd planu przy ustawianiu startu

**Tam:** `/schedule-setup` pokazuje od razu `Start`, `Koniec (6 tygodni)`, wybrane
dni tygodnia i **listę pierwszych dwóch tygodni treningów** — zanim cokolwiek
zapiszesz.

**U nas:** wpisuje się datę startu i tyle.

**Warto:** drobiazg, ale tani i od razu widoczny w konsoli.

### 5. Historia ćwiczenia w panelu, nie na osobnym ekranie

**Tam:** w panelu ćwiczenia zwijana sekcja `Historia / najlepsza seria`
z `Szacowane 1RM`.

**U nas:** osobny ekran postępu. Trafniejsze miejsce to tam, gdzie klient stoi
ze sztangą.

### 6. Rozgrzewka jako pozycja planu

**Tam:** pierwszy panel każdego treningu, z własnym ćwiczeniem (`WGS`).

**U nas:** nie ma rozgrzewki w ogóle — ani w szkielecie, ani w BAZIE.

---

## Co mamy lepiej i czego nie ruszamy

* **TOP SET** — w tamtej aplikacji nie ma go wcale (jedna wzmianka w całym pakiecie).
* **Pętla adaptacji** — ocena `za łatwe / za trudne` przesuwająca ciężar o ±5 %
  z limitem ±15 %: w pakiecie nie znalazłem po niej śladu.
* **Analityka stresu** — trzy osie, normy tygodniowe, bilans wzorców: nie ma.
* **Katalog** — 165 ćwiczeń u nas, **59 w pakiecie** tamtej aplikacji.
* **Dwie strony** — konsola trenera i aplikacja klienta to nasz układ; tamta
  aplikacja nie zna pojęcia trenera.

Nie przenosimy też: onboardingu (u nas plan układa trener), subskrypcji i Stripe'a,
ekranu wyboru planu spośród własnych.

---

## Znaleziska przy okazji

**`diff_class` — klasyfikacja ćwiczeń, której u nas nie ma.** Katalog w pakiecie
dzieli 59 ćwiczeń na `main_lower` (7), `main_upper` (7), `secondary` (23)
i `accessory` (22). Czternaście oznaczonych jako główne:

> Barbell Bench Press · Barbell Row · Close-Grip Barbell Bench Press ·
> Conventional Deadlift · Front Squat · High Bar Back Squat · Incline Barbell Press ·
> Low Bar Back Squat · Overhead Barbell Press · Paused Barbell Bench Press ·
> Pendlay Row · Romanian Deadlift · Sumo Deadlift · Trap Bar Deadlift

Dwie rzeczy z tego wynikają. Po pierwsze, **`Sumo Deadlift` był tam od początku** —
a w BAZIE 5.17 go nie było i dopisaliśmy go dopiero 20.09. Po drugie, **`Barbell Row`
i `Pendlay Row` są tam bojami głównymi**, choć mają coeff 0,75. To jest dokładnie
to pytanie, które wisi u nas otwarte od 20.09: czy bojem głównym jest wyłącznie
ćwiczenie z coeff 1,0. Tamta aplikacja mówi, że nie.

**Trzy nazwy bez odpowiednika w BAZIE dostają kontekst.** `Close-Grip Bench Press`
stoi w tamtym katalogu jako `Close-Grip Barbell Bench Press` z własną kategorią
i coeff — czyli da się go zmapować po parametrach, nie po samej nazwie.

**Numeracja kroków w tamtej aplikacji się nie zgadza:** `/template-select` pisze
„Krok 1 z 3", a `/schedule-setup` „Krok 2 z 4". Drobiazg, ale warto o nim wiedzieć,
zanim ktoś przepisze te teksty jeden do jednego.
