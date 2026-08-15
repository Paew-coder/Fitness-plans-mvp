# 04 — Roadmapa i migracja

## Zasada prowadząca

**Arkusz przestaje być używany dopiero wtedy, gdy aplikacja policzy to samo co on — co do grosza.** Do tego momentu obie rzeczy chodzą równolegle, a arkusz jest wyrocznią. Żadna faza poniżej nie wymaga porzucenia arkusza z góry.

Fazy są ułożone tak, że każda daje coś użytecznego sama z siebie i żadna nie jest wyrzucana w następnej.

---

## Faza 0 — Jądro i złoty zestaw testowy

*Nic dla klienta. Wszystko dla reszty projektu.*

1. Repo, TypeScript, pakiet `silnik/` bez zależności.
2. Wgranie danych referencyjnych z `docs/dane/` (już wyciągnięte i zweryfikowane).
3. Implementacja funkcji z `02-silnik-obliczeniowy.md`, po kolei:
   `oblicz1RM` → `procent1RM` → `mnoznikAdaptacji` → `korektaPowtorzen` → `powtorzeniaAkcesorium` → `obliczCiezar` → `stresSlotu` → `bilansTygodnia` → `ocenaNorm` → walidatory.
4. Zrzut 3–4 realnych planów z Dysku do JSON (przeliczonych, `data_only=True`).
5. Testy: dla każdego slotu × tygodnia zgodność ciężaru co do grosza i stresu do 0,1.

**Wyjście fazy:** biblioteka, której liczby zgadzają się z arkuszem. Bez tego reszta jest zgadywaniem.

**Miejsca, gdzie się wyłoży za pierwszym razem** (sprawdzić najpierw): kolejność zaokrągleń w trybie `trzymaj z bloku`, `MAX(skok kg; 0,5)`, kumulacja mnożnika przez restart w T4, ćwiczenia bez kg wyświetlające nazwę progresji zamiast liczby, deduplikacja 1RM przez `MAX`.

---

## Faza 1 — Konsola trenera, klient dalej na arkuszu

*Pierwsza faza, która oszczędza czas — Twój.*

1. Postgres, schemat z `03-architektura.md`, 164 ćwiczenia z `dane/baza-cwiczen.json`.
2. Import istniejącego planu z `.xlsx` — mapowanie slotów po `position_id` (`D1-S01`), ćwiczeń po nazwie z ręcznym rozstrzyganiem niedopasowań.
3. Kreator planu: 5 dni × 12 slotów, dobór z filtrem kategorii, analiza na żywo, 11 walidatorów.
4. **Eksport do `.xlsx` w formacie 5.17.** Klient dalej dostaje arkusz i niczego nie zauważa.

**Wyjście fazy:** plany powstają w aplikacji, wychodzą jako arkusz. Znika LISTY, znika ręczne pilnowanie kolejności wierszy, znika kopiowanie plików przy nowej wersji, pojawia się walidacja przed wysyłką.

**To jest moment, w którym można się zatrzymać na dłużej.** Jeśli reszta projektu utknie, faza 1 sama w sobie zwraca kilka godzin przy każdym nowym planie.

---

## Faza 2 — Aplikacja klienta

*Faza, w której arkusz przestaje jeździć mailem.*

1. Konta klientów, PWA, offline-first.
2. Ekran `Serie maksymalne` (START), ekran `Dzisiaj` (T1–T6), feedback trzystanowy.
3. Pętla zamyka się w aplikacji: feedback klienta → `mnoznikAdaptacji` → ciężar w kolejnym tygodniu. Bez wysyłania czegokolwiek.
4. Historia wykonań — pierwsza rzecz, której arkusz nie ma w ogóle.
5. Eksport `.xlsx` zostaje. Klienci stacjonarni i ci, którzy wolą arkusz, dostają arkusz.

**Wyjście fazy:** klient online realizuje plan z telefonu, trener widzi realizację.

---

## Faza 3 — To, czego arkusz nie umiał

Kolejność wg tego, co najczęściej boli dziś:

1. **Walidator powtórek między cyklami** — `POWTORKA_Z_POPRZEDNIEGO`. Wprost realizuje zasadę „sprawdzać poprzednie plany klienta". Otwarty temat Maćka Tabakowskiego (nakładanie się ćwiczeń) rozwiązuje się sam.
2. **Automatyczna aktualizacja 1RM z wykonań** — zamiast czekać na ponowne serie maksymalne. Dane już są w `wykonania`.
3. **Porównanie cykli** — obciążenie i wzorce klienta przez kilka planów wstecz.
4. **Moduły ODDECH i BIEG** — kalkulatory są proste, mają w pełni opisane wzory, dokładają się do widoku tygodnia.
5. **Przegląd wszystkich klientów** — kto ćwiczy, kto przestał, komu kończy się cykl.

---

## Faza 4 — Warstwa AI

Dopiero gdy jądro jest sprawdzone, a dane historyczne istnieją. Trzy zadania, żadne nie dotyka liczb (`03-architektura.md` §6): propozycja szkieletu, dobór ćwiczeń w ramach kategorii, odczytanie analizy słowami. Zawsze do akceptacji trenera.

---

## Migracja danych

### Krok 1 — katalog ćwiczeń

`docs/dane/baza-cwiczen.json` (164 pozycje) → tabela `cwiczenia`. Gotowe do wgrania.

Przed wgraniem, jedna decyzja: **16 pozycji czekających na decyzję** (14 `DO WERYFIKACJI` + 2 `UZUPEŁNIĆ`, których kontrola w arkuszu nie łapie) — wgrać z flagą `do_weryfikacji = true` i przepuścić przez kolejkę roboczą. Lista w `01-analiza-zrodel.md` §1, gotowa do wyświetlenia komendą `npm run policz -- kontrola`.

Dodatkowo **26 ćwiczeń bez filmu** — nie blokuje migracji, ale walidator `BEZ_FILMU` będzie o nich przypominał przy każdym planie, w którym się pojawią.

**Dwa otwarte tematy klientów z `STAN-PROJEKTU.md` są nieaktualne — 5.17 je zamyka:**
- *Konrad Mróz, brakuje „Tricep pushdown" w BAZIE.* Jest: **`EX-0194 Tricep cable pushdown`** (Tricep, part `b`, coeff 0,25, progresja kg). Wskazany tam zamiennik `EX-0170` to `Rope pushdown` — też Tricep/`b`/0,25. Kategoria Tricep ma w 5.17 dziewięć pozycji.
- *Maciek Tabakowski, propozycje zamienników.* Wszystkie trzy są w bazie: `EX-0004 Arnold press`, `EX-0019 Bayesian curl`, `EX-0195 Tricep JM press`.

Numeracja `EX-` sięga `EX-0203` przy 164 wypełnionych wierszach — ID nie są ciągłe, bo część pozycji została zwinięta przez `scalone_id`. Import musi iść po ID, nie po pozycji w zakresie.

### Krok 2 — plany klientów

~30 plików z Dysku. Nie wszystkie warto przenosić — część to warianty i testy (`TEST – Zuzanna C 3.0`, trzy kopie `Zuzanna C 2.0` z tego samego dnia, `Plan Sprint GPT`).

Rekomendacja: przenieść **najnowszą wersję każdego aktywnego klienta** plus jedną wstecz (żeby walidator powtórek miał na czym pracować). Reszta zostaje na Dysku jako archiwum.

Aktywni wg `STAN-PROJEKTU.md`: Maciek Tabakowski (3.0), Konrad Mróz, Agnieszka Kryska (1.0), Plan-Pawel-3tyg.
Widoczne na Dysku i warte sprawdzenia, czy nadal aktywne: Zuzanna C (3.0), Jakub Góralczyk (1.0), Bartek (3.0), Sambor (2.0), Ula Wolańska (2.0), Wiktor Dębski, Edgar, Paweł Teichen.

Mapowanie: sloty po `position_id`, ćwiczenia po nazwie z ręcznym rozstrzyganiem. Plany 4.0, warianty 3-dniowe i Rehab mają inny układ kolumn — **importer ich nie obsługuje i nie powinien próbować**. Osobna ścieżka albo świadome pominięcie.

### Krok 3 — Base44

Nie migrować. Katalog to 1 rekord, plan testowy odwołuje się do ćwiczeń, których w BAZIE nie ma pod tymi nazwami. Wartość Base44 to ekrany — te przenoszą się jako projekt UI, nie jako dane.

---

## Otwarte decyzje

Rzeczy, których nie rozstrzygam za Ciebie, bo zmieniają zakres:

1. **Klienci stacjonarni.** `CLAUDE.md` mówi wprost: osobne arkusze, inny układ, nie mieszać założeń. Czy aplikacja ma ich obsłużyć, czy zostają poza systemem? Schemat jest na to gotowy (`klienci.user_id = null`), ale kreator planu zakłada układ 6-tygodniowy z 5 dniami.

2. **Czy naprawiać TOP SET w arkuszu 5.17.** Aplikacja rozwiązuje to jawną referencją `top_sety.slot_id`. Ale arkusz będzie jeszcze długo w użyciu — a to jest realny błąd, który uderza, gdy w S01 stoi rozgrzewka.

3. **Rozjazd `progresja` (7 typów) ↔ `exercise_type` w Base44 (4 typy).** Przyjąłem model z arkusza. Base44 wprowadziło też `is_unilateral` i `location` (gym/home/both), których arkusz nie ma — a które są sensowne. Czy dokładamy je do katalogu?

4. **Czy `czesc_planu` (objętość / intensywność) jest własnością planu, czy tygodnia.** W arkuszu to jeden globalny przełącznik dla całego pliku. Przy blokach 3+3 naturalne byłoby: T1–T3 objętość, T4–T6 intensywność. Dziś trzeba to przełączać ręcznie w połowie cyklu.

5. **Skąd bierze się liczba dni.** Arkusz ma zawsze 5 bloków i wykrywa wypełnione (`Analiza!B76`). W aplikacji `plany.liczba_dni` jest jawne. To lepsze, ale trzeba zdecydować, czy trener może zmienić liczbę dni w trakcie cyklu.

---

## Co jest zrobione tym dokumentem

- Silnik 5.17 rozłożony na funkcje z sygnaturami i wzorami — `02-silnik-obliczeniowy.md`.
- Dane referencyjne wyciągnięte i zweryfikowane przeciwko plikowi — `docs/dane/`.
- Schemat bazy, warstwy, ekrany, rekomendacja stacku — `03-architektura.md`.
- Rozbieżności instrukcja ↔ plik wypisane, jeden ze znanych błędów zamknięty jako naprawiony — `01-analiza-zrodel.md`.

Czego nie ma i wymaga Twojej decyzji przed startem fazy 0: pięć punktów wyżej.
