# 01 — Analiza źródeł

Migawka z 15.08.2026. Przeanalizowane źródła:

| Źródło | Co to jest | Stan |
|---|---|---|
| `MasterTemplate 5.17.xlsx` | Właściwy silnik — 14 zakładek, ~200 wierszy BAZY, 6 tygodni | **Referencja. To jest produkt.** |
| `CLAUDE.md` (PDF) | Instrukcja pracy z szablonem | Opisuje 3 dni i zakładkę PANEL — plik ma 5 dni i zakładkę Analiza |
| `STAN-PROJEKTU.md` (PDF) | Migawka stanu, klienci, znane błędy | 1 z 3 znanych błędów jest już naprawiony w 5.17 |
| Dysk Google | ~30 planów klientów (Zuzanna 1.0→3.0, Maciek 1.0→3.0, Sambor, Bartek, Agnieszka…) | Wersjonowanie iteracyjne per klient, wszystkie oparte na tym samym szkielecie |
| Base44 „CraftMyPlan" (`6a005660818ba6a6c28f8b7d`) | 6 encji, 1 ćwiczenie, 1 plan testowy | Prototyp UI. **Nie ma silnika z arkusza.** |
| Base44 „Główna wersja 10.05.26r." (`69ff4766434f5b4424fe682a`) | Starsza kopia tych samych encji | Poprzednia iteracja, bez Stripe/lokalizacji |

Dostęp do plików źródłowych Base44 wymaga planu Builder — czytałem wyłącznie schematy encji i rekordy przez API. Kodu aplikacji nie widziałem.

---

## 1. Rozbieżności instrukcja ↔ plik

Zgodnie z zasadą nadrzędną „plik wygrywa" — poniżej to, co znalazłem w 5.17 wbrew opisowi w `CLAUDE.md` / `STAN-PROJEKTU.md`:

**1. Szablon obsługuje 5 dni treningowych, nie 3.**
`DZIEŃ I…V` w wierszach 5 / 21 / 37 / 53 / 69. Każdy dzień: wiersz TOP SET + 12 slotów + wiersz podsumowania. Cała analityka (rozkład stresu, normy objętości) sumuje po pięciu blokach i skaluje się liczbą dni faktycznie wypełnionych (`Analiza!B76`).

**2. Nie ma zakładki PANEL. Jest `Analiza`.**
Przełączniki trenera siedzą w `Analiza!B4` (`PRZEL_AKCESORIA`) i `Analiza!B5` (`PRZEL_CZESC`), oba jako nazwane zakresy. Zakładka jest widoczna, nie ukryta.

**3. Znany błąd „przełączniki B4/B5 referencjonowane jako C3/C4" — naprawiony.**
Sprawdziłem XML wszystkich arkuszy: zero odwołań do `Analiza!$C$3` / `$C$4`. `PRZEL_AKCESORIA` występuje 60× w T2, T3, T5, T6 i **0×** w T1 i T4 — dokładnie tak, jak powinno, bo T1 i T4 zawsze liczą z RPE. Przełącznik „trzymaj z bloku" działa. Decyzja o wdrożeniu fixa jest nieaktualna — można wykreślić z listy problemów.

**4. Znany błąd „TOP SET zaszyty w wierszu 7" — nadal aktualny.**
`T1!G6` czyta `$C7`, `$Q7`, `$R7` na sztywno; analogicznie wiersze 22→23, 38→39, 54→55, 70→71. TOP SET zawsze pokazuje bój z pierwszego slotu dnia. Blok rozgrzewkowy w slocie S01 rozwala tę logikę.

**5. BAZA: 164 ćwiczenia, nie ~200.**
Zakres formuł to wiersze 3–202 (200 miejsc), wypełnionych 164. Zapas 36 wierszy — nowe ćwiczenia wstawiać wewnątrz, nie poniżej.

**6. Nie 3 tryby progresji, tylko 7.**
`kg` (132), `masa ciała` (16), `dodatkowy ciężar` (4), `czas` (6), `asysta` (3), `ręczne ustawienie` (2), `dystans` (1).

**7. Do decyzji w BAZIE: 16 pozycji — ale kontrola w arkuszu widzi tylko 14.**

`Analiza!B71` sprawdza `LEFT(uwagi;14)="DO WERYFIKACJI"`, więc łapie 14 pozycji:
Cable lateral raise s/a, Dead bug izo + OH, Deficit push up, Dips, Eccentric pull up, Hollow body + OH, Incline dumbbell press, Leg curl, OHP barbell squat 15kg, Pull up eccentric weighted, Seated cable facepull, Seesaw press, Side crunches, Trap bar deadlift.

Dwie kolejne są oznaczone innym prefiksem — `UZUPEŁNIĆ – brak part/coeff w 4.0` — i **przechodzą przez kontrolę niezauważone**: `EX-0008 Banded pistol squat` i `EX-0203 Zercher jumps`. Obie mają uzupełnione part i coeff w 5.17, więc prawdopodobnie da się je po prostu odznaczyć, ale to decyzja Pawła.

Dodatkowo **26 ćwiczeń nie ma filmu**.

---

## 2. Jak naprawdę działa szablon

### Architektura zakładek (stan faktyczny 5.17)

```
START      wejście klienta: serie maksymalne (ciężar + powtórzenia) → 1RM przy RPE 10
INSTRUKCJA tekst dla klienta
T1         plan pisany ręcznie — jedyne źródło doboru ćwiczeń
T2,T3      lustro ćwiczeń z T1; własne serie/powt./RPE; ciężar wg przełącznika
T4         restart bloku — zawsze przelicza z RPE
T5,T6      lustro ćwiczeń z T1; ciężar dziedziczy z T4, nie z T1
ODDECH     test TWOT → dawka oddechowa (5 progów)
BIEG       bieg testowy → HRmax, strefy, tempa, 6 tygodni × 1–5 jednostek
BAZA       164 ćwiczenia — jedyne źródło ćwiczeń
Analiza    przełączniki + cała analityka + 11 kontroli danych
TABELE     RPE→%1RM, 3 tabele stresu, progi TWOT
LISTY      205 kolumn × 200 wierszy — listy walidacyjne per slot
```

### Przepływ danych — jeden slot

```
BAZA (po nazwie ćwiczenia)
  → part, kategoria, coeff, skok kg, progresja, film, uwagi     [T1!L:Q, W]
START (max po nazwie ćwiczenia, deduplikacja)
  → 1RM                                                          [T1!R]
TABELE (powtórzenia × RPE)
  → %1RM                                                         [T1!S]
                    ↓
CIĘŻAR = MROUND(1RM × %1RM / 100, MAX(skok kg, 0,5))            [T1!G]
                    ↓
TABELE stres (RPE × powtórzenia) × coeff × serie
  → stres całkowity / centralny / obwodowy                       [T1!T, U, V]
                    ↓
SUMIF po part (s/d/b/r/c) → rozkład stresu dnia i tygodnia       [T1!D87:I94]
                    ↓
Analiza: 6 tygodni, normy, kontrole
```

### Kolumny techniczne T1 (ukryte od K w prawo)

| Kol. | Zawartość | Źródło |
|---|---|---|
| K | `position_id` — `D1-S01`…`D5-S12` | stała |
| L | Exercise ID (`EX-0001`) | `INDEX(BAZA_ID, MATCH(C, BAZA_EX))` |
| M | part (s/d/b/r/c) | BAZA |
| N | kategoria | BAZA |
| O | coeff | BAZA |
| P | skok kg | BAZA |
| Q | progresja | BAZA |
| R | 1RM | `SUMPRODUCT(MAX((START!B=C)*START!M))` |
| S | %1RM | TABELE |
| T/U/V | stres całkowity / centralny / obwodowy | TABELE × coeff × serie |
| W | uwagi z BAZY | BAZA |
| X/Y/Z | logika grup (wspólna litera A/B/C/D/E = superseria) | z kol. A |
| AA | 1RM ręczny (gdy ćwiczenie podmienione w T4–T6) | wpis trenera |
| AB | feedback zebrany (`OK` / `za łatwe` / `za trudne`) | z kol. H |
| AC | mnożnik ciężaru na ten tydzień | z AB tygodni poprzednich |
| AD | korekta powtórzeń dla progresji bezciężarowych | z AC |

### Pętla feedbacku — serce systemu

Klient wpisuje w kolumnie `H` per ćwiczenie: `OK` / `za łatwe` / `za trudne`, a w wierszu podsumowania dnia `✓ ukończony`.

```
AB (tydzień N)  = H, a jeśli puste i dzień oznaczony ukończonym → "OK"
AC (tydzień N+1) = MAX(0,85; MIN(1,15; 1 + 0,05 × Σ"za łatwe" − 0,05 × Σ"za trudne"))
```

Zakres sumowania rośnie: `T2!AC` czyta tylko T1; `T4!AC` czyta T1+T2+T3; `T5!AC` czyta T1..T4; `T6!AC` czyta T1..T5. **Mnożnik jest kumulatywny w obrębie cyklu i twardo obcięty do ±15%.**

Dla ćwiczeń bez kg (masa ciała, czas, dystans, ręczne) mnożnik nie ma jak zadziałać na ciężar, więc `AD` zamienia go na powtórzenia:
```
AD = MAX(−3; MIN(3; ROUND((AC − 1) / 0,05)))     → ±3 powtórzenia
```

### Powtórzenia akcesoriów — automat, nie wpis

```
bazowe = coeff ≥ 1     → 6
         coeff ≥ 0,75  → 8 (objętość) / 6 (intensywność)
         coeff < 0,75  → 10 (objętość) / 8 (intensywność)
powtórzenia = MIN(15; MAX(1; bazowe + offset_tygodnia + AD))
```
`offset_tygodnia`: T1 = 0, T2 = +1, T3 = +2, T4 = 0, T5 = +1, T6 = +2.
Czyli w obrębie bloku (T1–T3 i T4–T6) rośnie objętość, a T4 restartuje.

### Ciężar — cztery różne reguły w zależności od tygodnia

| Tydzień | Bój główny (A1) | Akcesoria, `trzymaj z bloku` | Akcesoria, `licz z RPE` |
|---|---|---|---|
| T1 | `1RM × %1RM` | `1RM × %1RM` | `1RM × %1RM` |
| T2, T3 | `1RM × %1RM × AC` | `T1_ciężar × AC / T1_AC` | `1RM × %1RM × AC` |
| T4 | `1RM × %1RM × AC` | `1RM × %1RM × AC` | `1RM × %1RM × AC` |
| T5, T6 | `1RM × %1RM × AC` | `T4_ciężar × AC / T4_AC` | `1RM × %1RM × AC` |

Wszystko przez `MROUND(…, MAX(skok kg; 0,5))`. Gdy brak 1RM → `"— brak 1RM"`. Gdy ćwiczenie podmieniono w T4–T6 i brak `AA` → `"— ustaw ręcznie"`.

### Model stresu

Trzy niezależne tabele w `TABELE` indeksowane (RPE 5–10) × (powtórzenia 1–15):

- **całkowity** — rośnie z RPE, lekko maleje z powtórzeniami (0,2 → 1,3)
- **centralny** — rośnie z RPE, **mocno maleje** z powtórzeniami (0,1 → 1,8). Ciężkie single = maksymalny koszt centralny.
- **obwodowy** — rośnie i z RPE, i z powtórzeniami. Odwrotna charakterystyka.

```
stres_slotu = coeff × serie × tabela[RPE][powtórzenia]
```

Agregacja po `part`, nie po kategorii:
```
dolne  = s + d          górne = b + r          core = c (tylko do sumy RAZEM)
```

### Normy w Analizie — skalowane liczbą dni

`B76` = liczba dni z wpisanym choć jednym ćwiczeniem. Wszystkie normy to `B76 × współczynnik`:

| Miara | Norma na dzień treningowy |
|---|---|
| Stres tygodniowy całkowity | 12 – 18 |
| Serie: przysiad (s) | 4 – 7 |
| Serie: martwy ciąg (d) | 4 – 7 |
| Serie: wyciskanie (b) | 8 – 13 |
| Serie: wiosłowanie (r) | 7 – 11 |
| Serie: core (c) | 3 – 6 |

Ocena: `▼ poniżej` / `✓ w normie` / `▲ powyżej`.

### 11 kontroli danych (`Analiza!A66:C76`)

Sloty z ćwiczeniem · Serie maksymalne uzupełnione · Sloty bez ćwiczenia mimo szkieletu · Ćwiczenie niezgodne ze szkieletem · Ćwiczenia bez filmu · Pozycje BAZY do weryfikacji · Ostrzeżenia „ustaw ręcznie" T2–T6 · Sloty bez 1RM · Powtórzenia poza tabelą (>15) · Serie maksymalne w konflikcie · Dni treningowe w planie.

**To jest gotowa lista walidatorów aplikacji.** Nie trzeba jej wymyślać od nowa.

### LISTY — obejście ograniczenia Sheets

205 kolumn × 200 wierszy pomocniczych po to, żeby lista rozwijana w `T1!C7` pokazywała tylko ćwiczenia z kategorii wpisanej w `T1!J7`. Każdy wiersz T1 ma własny wiersz w LISTY. Pusta kategoria = pełna BAZA.

**W aplikacji ten arkusz znika w całości** — filtrowanie listy to jedno zapytanie. To najczystszy dowód, że arkusz dojechał do ściany.

### ODDECH i BIEG

Oba to niezależne kalkulatory, które doklejają się do widoku tygodnia:

- **ODDECH**: jedno pole (wynik TWOT w sekundach) + flaga przeciwwskazań → 5 progów → poziom, częstotliwość, 3 bloki. Przeciwwskazanie = twarde zatrzymanie z komunikatem, nie obejście.
- **BIEG**: 5 pól (wiek, HRmax, dystans i czas biegu testowego, liczba jednostek) → HRmax (`208 − 0,7 × wiek`), 5 stref tętna, 4 tempa treningowe (offsety +1,25 / +0,667 / +0,25 / −0,167 min/km od tempa testowego), 6 tygodni × do 5 jednostek z progresją objętości ×1,0 / ×1,1 / … i skalowaniem `CHOOSE` po liczbie jednostek.

---

## 3. Base44 „CraftMyPlan" — gdzie jest względem arkusza

Aplikacja ma poprawny szkielet UI (onboarding, wybór ćwiczeń per slot, max sety, kalendarz z przesuwaniem dat, log wagi, Stripe). **Nie ma natomiast silnika.** Luka jest systematyczna:

| Element silnika 5.17 | Base44 | Skutek |
|---|---|---|
| BAZA 164 ćwiczeń | 1 rekord `ExerciseTemplate` | Aplikacja nie ma czym wypełnić planu |
| `skok kg` | brak | Nie ma jak zaokrąglić ciężaru |
| `progresja` (7 typów) | `exercise_type` (4 typy) | Inna oś podziału; brak asysty i dystansu |
| `EX-xxxx`, scalone ID | brak | Referencja po nazwie → zmiana nazwy zrywa plan |
| Tabela RPE→%1RM | brak | Ciężar nie jest liczony |
| 3 tabele stresu | brak | Zero analityki obciążenia |
| Feedback `za łatwe`/`za trudne` → AC | brak | Brak pętli adaptacji — najważniejszej rzeczy w systemie |
| Reguły ciężaru per tydzień | brak | Brak logiki T1→T3, restart T4, T4→T6 |
| Automat powtórzeń akcesoriów | brak | Trener musiałby wpisywać ręcznie |
| 11 kontroli danych | brak | Brak walidacji planu |
| 5 dni | 3 dni na sztywno | Węższe niż arkusz |
| ODDECH / BIEG | brak | — |

Dodatkowo `SavedPlan.selections` to nieustrukturyzowany `object` z ćwiczeniami zapisanymi **po nazwie** (`"Barbell bench press"`), a nie po ID. Rekord testowy zawiera ćwiczenia (`Bulgarian Split Squat`, `Machine Row`, `Good Morning`), których w BAZIE nie ma pod tymi nazwami — dwa katalogi już się rozjechały.

**Wniosek:** to nie jest „aplikacja do dokończenia", to prototyp ekranów. Silnik trzeba zbudować od zera — ale nie trzeba go projektować, bo jest w pełni zdefiniowany w 5.17 i wyciągnięty do `docs/dane/`.

---

## 4. Co z tego wynika dla aplikacji

**Rzeczy, które arkusz robi dobrze i trzeba przenieść 1:1:**
1. Model stresu na trzech osiach (całkowity / centralny / obwodowy) — to jest autorska wartość, nie ma tego w żadnej komercyjnej aplikacji.
2. Rozdzielenie `part` (gdzie ląduje obciążenie) od `kategoria` (czym to jest). Tricep → `b`, Bicep → `r`. Kategoria steruje doborem, part steruje bilansem.
3. Feedback trzystanowy z kumulatywnym mnożnikiem ±15%.
4. Struktura bloków 3+3 z twardym restartem w T4.
5. Normy objętości skalowane liczbą dni.
6. 11 kontroli danych jako walidacja przed wysłaniem planu.

**Rzeczy, które są obejściami ograniczeń Sheets i mają zniknąć:**
1. LISTY (205 kolumn) → zapytanie z filtrem.
2. Formuły lustrzane T2–T6 → plan jako jeden obiekt, tygodnie jako funkcja czysta.
3. „Nadpisanie zrywa link tylko w tej komórce" → jawny override per pole, cofalny.
4. Zaszyte na sztywno zakresy wierszy (BAZA 3:202, sloty 7:18) → kolekcje.
5. Wersjonowanie przez kopiowanie pliku (`Zuzanna 1.0` → `2.0` → `3.0`) → wersje planu w bazie z historią.
6. TOP SET czytający sztywno wiersz poniżej → jawna referencja do slotu.

**Rzeczy, których arkusz nie umie i to jest powód budowy aplikacji:**
1. Klient nie może realizować treningu na telefonie — dostaje arkusz.
2. Trener nie widzi, czy klient ćwiczy — dopóki nie otworzy pliku.
3. Historia wykonań nie istnieje — arkusz przechowuje plan, nie wykonanie.
4. 1RM aktualizuje się tylko przez ponowne serie maksymalne na START.
5. Sprawdzenie „czy nie powtarzam ćwiczeń z poprzedniego planu klienta" wymaga otwarcia starych plików.
6. Nie ma jak porównać klientów między sobą ani zobaczyć trendu przez kilka cykli.
