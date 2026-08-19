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

1. ~~Import istniejącego planu z `.xlsx`~~ — **zrobione**. `silnik/src/import-arkusza.ts`, mapowanie slotów po `position_id`, wykrywanie ćwiczeń spoza BAZY.
2. ~~Walidacja planu z czytelnym raportem~~ — **zrobione**. `npm run sprawdz -- plan.xlsx`: co blokuje wysyłkę, co sprawdzić, obciążenie z normami, zgodność arkusza z silnikiem.
3. ~~Kreator planu: 5 dni × 12 slotów, dobór z filtrem kategorii, analiza na żywo~~ — **zrobione**. [`konsola/`](../konsola/README.md).
4. ~~Eksport do `.xlsx` w formacie 5.18~~ — **zrobione**. Klient dostaje arkusz z żywymi formułami i niczego nie zauważa. Sprawdzone: plan z konsoli → arkusz → przeliczenie → 500 wartości zgodnych.
5. ~~Import istniejącego planu do konsoli~~ — **zrobione**. Wczytuje plik 5.17/5.18, wypisuje ćwiczenia spoza BAZY. Kółko domknięte: konsola → arkusz → konsola daje te same liczby.
6. ~~Przenoszenie slotów~~ — **zrobione**. Strzałki zamieniają treść slotów, nie wiersze — `position_id` i `Lp.` zostają przy miejscu, jak w arkuszu.
7. ~~Kopiowanie planu jako nowej wersji~~ — **zrobione**. Kopia czyści odczucia klienta i wskazuje poprzedni cykl, więc ostrzeżenie o powtórkach działa od razu.

**Faza 1 domknięta.** Plany powstają w konsoli, wychodzą jako arkusz, wracają z powrotem.

**Postgres odłożony.** Konsola zapisuje plany do plików JSON i chodzi u trenera na komputerze bez stawiania serwera. Schemat z `03-architektura.md` zostaje aktualny — silnik nie wie, skąd biorą się dane, więc podmiana magazynu na bazę to zmiana jednego pliku. Bazy potrzeba dopiero przy fazie 2, gdy klient loguje się z telefonu.

**Nowy walidator, którego nie było w planie** — `POZA_BAZA`. Ćwiczenie wpisane z literówką nie trafia do BAZY, więc arkusz pomija slot po cichu: bez ciężaru, bez stresu, poza objętością. Żadna z 11 kontroli w zakładce Analiza tego nie łapie.

**Wyjście fazy:** plany powstają w aplikacji, wychodzą jako arkusz. Znika LISTY, znika ręczne pilnowanie kolejności wierszy, znika kopiowanie plików przy nowej wersji, pojawia się walidacja przed wysyłką.

**To jest moment, w którym można się zatrzymać na dłużej.** Jeśli reszta projektu utknie, faza 1 sama w sobie zwraca kilka godzin przy każdym nowym planie.

---

## Faza 2 — Aplikacja klienta

*Faza, w której arkusz przestaje jeździć mailem.*

1. ~~Dostęp klienta, PWA, offline-first~~ — **zrobione**. Zamiast kont: link z tokenem (192 bity), do unieważnienia w konsoli. Service worker + kolejka w przeglądarce, więc oceny nie giną bez zasięgu.
2. ~~Ekran `Serie maksymalne`, ekran treningu, feedback trzystanowy~~ — **zrobione**. [`klient/`](../klient/README.md).
3. ~~Pętla zamyka się w aplikacji~~ — **zrobione i sprawdzone na żywo**: „za łatwe" w T1 → mnożnik 1,05 → ciężar 85 → 87,5 kg w T2. Bez odsyłania arkusza.
4. ~~Historia wykonań~~ — **zrobione**. Każde dotknięcie zapisuje się z datą.
5. ~~Wpisywanie faktycznie wykonanego ciężaru i powtórzeń~~ — **zrobione**. Pola zwinięte pod oceną: kto chce, dotyka „zapisz, co poszło"; kto nie chce, ocenia i idzie dalej.
6. ~~Ekran postępu klienta: 1RM w czasie, frekwencja, waga~~ — **zrobione**. Ciężary w czasie z szacowanym 1RM, frekwencja tydzień po tygodniu, log wagi (jeden wpis na dzień).
7. Eksport `.xlsx` zostaje. Klienci stacjonarni i ci, którzy wolą arkusz, dostają arkusz.

**O dostępie bez hasła — świadomy kompromis.** Kto ma link, ten widzi plan. Przy kilkunastu klientach to proporcjonalne, a konta z hasłami to osobny kawałek pracy i kłopot dla klienta. Gdy dojdą setki klientów albo dane wrażliwe (kontuzje, historia zdrowotna), trzeba to zamienić na prawdziwe konta — i wtedy przyda się baza z `03-architektura.md`.

**Wyjście fazy:** klient online realizuje plan z telefonu, trener widzi realizację.

---

## Faza 3 — To, czego arkusz nie umiał

**Domknięta.** Kolejność była wg tego, co najczęściej bolało:

1. ~~**Walidator powtórek między cyklami**~~ — `POWTORKA_Z_POPRZEDNIEGO`. **Zrobione.** Otwarty temat Maćka Tabakowskiego (nakładanie się ćwiczeń) rozwiązał się sam.
2. ~~**Automatyczna aktualizacja 1RM z wykonań**~~ — **zrobione.** `silnik/src/odczyt-1rm.ts` odwraca wzór arkusza: `1RM = ciężar / (%1RM z tabeli)`, gdzie RPE bierze się z planu skorygowanego odczuciem (±1 stopień). Mediana z ostatnich trzech serii, żeby jedna pomyłka przy wpisywaniu nie zawyżyła wyniku. W konsoli karta **1RM z serii roboczych** — propozycja z oceną zaufania, przyjmowana kliknięciem. Nic nie zmienia się samo.
3. ~~**Porównanie cykli**~~ — **zrobione.** `silnik/src/porownanie-cykli.ts`: objętość, wzorce ruchu, 1RM na wejściu, ćwiczenia powtórzone / nowe / usunięte. W konsoli karta *Wobec poprzedniego cyklu*, widoczna gdy plan wskazuje poprzedni. Opisuje, nie ocenia — mniej objętości przy powrocie po kontuzji to dokładnie to, co trzeba.
4. ~~**Moduły ODDECH i BIEG**~~ — **zrobione.** `silnik/src/oddech.ts` i `silnik/src/bieg.ts`, oba sprawdzone przeciwko 5.18 przeliczonemu w LibreOffice (262 wartości). W konsoli karty *Oddech* i *Bieg*, u klienta osobny ekran „Oddech i bieg".
5. ~~**Przegląd wszystkich klientów**~~ — **zrobione.** Panel *Wymaga uwagi* na górze listy: kto stanął, kto nie zaczął, kto nie ma linku, komu kończy się cykl. Plus tydzień cyklu przy każdym planie.

---

## Faza 3,5 — Wersja produkcyjna dla trenera

*Decyzja podjęta: najpierw narzędzie dla Pawła i jego klientów, SaaS dla innych trenerów później. A jest warunkiem koniecznym dla B, więc nic z tej fazy się nie marnuje.*

1. ~~**Baza danych zamiast plików JSON**~~ — **zrobione.** SQLite (`node:sqlite`, wbudowane w Node 22, dalej zero zależności). Powód: klient odhacza trening z telefonu w tej samej chwili, w której trener otwiera jego plan — pliki nie znoszą dwóch zapisów naraz. Zapis idzie w transakcji. **Każdy wiersz od początku nosi `trener_id`**, choć trener jest jeden; to jedyna rzecz, której nie da się dołożyć później bez przepisywania wszystkiego. 11 testów magazynu, `npm run migruj` przenosi stare pliki.
2. ~~**Logowanie trenera**~~ — **zrobione.** Dwa tryby rozpoznawane automatycznie, bez przełącznika w konfiguracji: bez hasła konsola przyjmuje połączenia tylko z tej samej maszyny, z hasłem wymaga logowania zawsze. `scrypt` z `node:crypto`, sesje w bazie (unieważnialne), ciasteczko `HttpOnly` + `SameSite=Lax` + `Secure` za HTTPS. `npm run haslo`. 15 testów.
3. ~~**Wdrożenie**~~ — **zrobione.** `Dockerfile`, `docker-compose.yml` z Caddy (certyfikat sam się bierze i odnawia) i [`WDROZENIE.md`](../WDROZENIE.md) pisane dla nietechnicznego czytelnika. Obraz zbudowany i sprawdzony naprawdę: healthcheck, bramka bez hasła, logowanie, eksport `.xlsx` w kontenerze.
4. ~~**Kopie zapasowe**~~ — **zrobione.** `npm run kopia` przez `backup()` z `node:sqlite`, bo zwykłe skopiowanie pliku w trybie WAL potrafi dać bazę bez ostatnich treningów. W `docker compose` osobna usługa robi to raz na dobę i trzyma 30 ostatnich.

**Czego ta faza świadomie nie robi:** płatności w aplikacji. Rozliczenia z klientami zostają tak, jak są. Płatności mają sens dopiero przy SaaS dla innych trenerów.

**Dane zdrowotne — decyzja odłożona.** Aplikacja celowo nie przechowuje kontuzji ani historii leczenia, więc dostęp przez link bez hasła zostaje proporcjonalny. Gdy to się zmieni, wchodzą dane szczególnej kategorii wg RODO: prawdziwe konta klientów, szyfrowanie, umowy powierzenia. Schemat jest na to przygotowany — notatki wrażliwe pójdą do osobnej tabeli, nie do dokumentu planu.

---

## Faza 4 — Warstwa AI

**Domknięta.** Weszła dopiero po tym, jak jądro było sprawdzone przeciwko arkuszowi — i to jest cała różnica między asystentem a generatorem planów. Trzy zadania z `03-architektura.md` §6, żadne nie dotyka liczb:

1. ~~**Propozycja szkieletu + dobór ćwiczeń w ramach kategorii**~~ — **zrobione.** Jedno zadanie, bo w praktyce nie da się ich rozdzielić: kategoria bez ćwiczenia to pusty slot. Model dostaje cel, staż, sprzęt, liczbę dni, notatkę i ćwiczenia z poprzedniego cyklu; oddaje układ dni z ID-kami z BAZY. Wszystko, co wróci, przechodzi weryfikację katalogiem — ID spoza bazy wypada, kategoria bierze się z BAZY, nadmiar jest przycinany, powtórki dostają znacznik. Do planu trafia dopiero po kliknięciu, a jeśli coś nadpisze, przycisk mówi ile.
2. ~~**Odczytanie analizy słowami**~~ — **zrobione.** Model dostaje gotowy raport liczbowy z silnika i mówi, co z niego wynika. Nie liczy, nie ocenia planu, nie podaje wartości do wpisania.
3. ~~**Sygnał zdrowotny**~~ — **zrobione**, choć w §6 był tylko zdaniem. Deterministyczna lista rdzeni słów (ból, kontuzja, leczenie) podnosi ostrzeżenie niezależnie od modelu — bo model może przeoczyć, a to jest ta jedna rzecz, której przeoczyć nie wolno.

**Granica, której nie wolno przesunąć:** AI nie liczy ciężaru, RPE, serii ani powtórzeń. Liczy je silnik, deterministycznie. Pilnują tego testy — m.in. taki, który po wstawieniu propozycji sprawdza, że żadne pole liczbowe planu nie zostało tknięte.

**Bez klucza do API funkcja jest wyłączona, nie zepsuta.** Konsola startuje, plany się liczą, klient ćwiczy; nieaktywne są dwa przyciski. To jest warunek, żeby aplikacja została narzędziem, a nie nakładką na cudze API.

**Prywatność:** do modelu nie idzie nazwisko klienta ani żadne dane z bazy poza doborem ćwiczeń i policzonymi liczbami. Notatka trenera nigdzie się nie zapisuje — leci przy jednym zapytaniu i znika.

40 testów warstwy AI, w tym pełna droga zapytania przez podstawiony serwer HTTP — bez ani jednego zapytania do prawdziwego API.

---

## Faza 5 — Klient jako encja, nie kolumna

**Domknięta.** Faza spoza pierwotnego planu — wyszła z używania aplikacji, a nie z dokumentu. Przez pierwsze cztery fazy klient był kolumną tekstową w planie i to wystarczało dokładnie do chwili, w której okazało się, że trzy rzeczy nie mają gdzie mieszkać:

1. ~~**Link dostępowy**~~ — token wisiał przy planie, więc każdy nowy cykl znaczył nowy adres do wysłania, a stary link zamrażał klienta na poprzednim planie. Teraz token należy do klienta i sam prowadzi do jego aktualnego cyklu. Szkic pozostaje niewidoczny: klient widzi komunikat, że plan jest w przygotowaniu.
2. ~~**Waga ciała**~~ — tabela była kluczowana planem, więc wykres zerował się co sześć tygodni. Waga należy do człowieka, nie do sześciotygodniowego dokumentu.
3. ~~**Historia dłuższa niż jeden cykl**~~ — `silnik/src/historia-klienta.ts` plus ekran kartoteki: 1RM przez kolejne cykle, obciążenie i wzorce cykl po cyklu, frekwencja, waga. Porównanie dwóch sąsiednich cykli mówi, co się zmieniło; to odpowiada na pytanie, co się dzieje z tym człowiekiem od roku.

Przy okazji **panel „Wymaga uwagi" liczy klientami**, nie planami: wcześniej klient z trzema zamkniętymi cyklami wołał o uwagę trzy razy.

**Dwie rzeczy wyszły dopiero przy sprawdzaniu tego na ekranie:**

- **Nie było jak zmienić statusu planu.** Odznaka „szkic / wysłany / zakończony" była tylko do czytania, więc każdy plan zostawał szkicem na zawsze. Wcześniej to nie przeszkadzało; odkąd klient widzi wyłącznie plan wysłany, oznaczało to, że nie zobaczyłby nic. Status jest teraz w pasku nad planem, a przestawienie go na *wysłany* przy otwartych błędach wymaga potwierdzenia.
- **Pusty plan przechodził kontrolę.** Arkusz nie potrzebował takiego sprawdzenia, bo plik z planem zawsze miał treść. W aplikacji pusty plan powstaje jednym kliknięciem i dało się go wysłać — klient zobaczyłby pusty ekran. Doszedł walidator `PLAN_PUSTY`.

**Porządek w kartotekach.** Skoro klient jest encją, pomyłka w nazwisku zakłada osobę, a nie psuje pola tekstowego — i trzeba umieć ją posprzątać. Kartoteka dostała *usuń* (bez tego kartoteka bez cykli zostawała na liście na zawsze) i *połącz*, które przenosi cykle, wykonania i wagę do właściwej osoby zamiast kazać wpisywać wszystko od nowa. Przy przenoszeniu numery cykli idą dalej za tym, co cel już ma, więc w kartotece nie stają obok siebie dwa „1.0". Zmiana nazwy na nazwę istniejącego klienta jest odrzucana i odsyła do scalenia.

**Konsola działa na telefonie.** Zmierzone i naprawione: strona nie jedzie w bok na żadnym z trzech ekranów (wcześniej 912 px treści przy 390 px okna na ekranie planu). Tabela slotów przewija się we własnej ramce, formularze schodzą pod listę klientów — z telefonu się zagląda, a nie zakłada nowe plany.

**Migracja jest prawdziwa, nie deklaratywna.** Schemat podnosi się z wersji 1 do 2 przy pierwszym starcie: z nazw w planach powstają klienci (dopasowanie po slugu, więc „Zuzanna C" i „zuzanna c." to jedna osoba), token przechodzi z najnowszego planu na klienta, waga z wszystkich cykli scala się w jedną historię. Test buduje bazę w starym schemacie, wypełnia ją i sprawdza, że nic nie zginęło — łącznie z tym, że **link, który klient ma w telefonie, dalej działa**.

---

## Faza 6 — Progresja z szablonu i dwa błędy, które ją zasłaniały

**Domknięta.** Faza znowu spoza planu: wyszła z pytania „co trener robi najczęściej".

~~**Wypełnianie sześciu tygodni**~~ — **zrobione.** `silnik/src/progresja.ts` niesie blok odczytany z `MasterTemplate-5-18.xlsx`: bój główny 6×6 @6,5 → 5×6 @7 → 5×5 @7 → 4×5 @7,5 → 5×4 @7,5 → 6×3 @7,5, akcesoria trzy serie przy RPE 8 w pierwszym bloku i 9 w drugim (C2 i D2 o stopień wyżej). Do tego kopiowanie jednego tygodnia na pozostałe. Wartości lądują w polach **widocznie**, jako liczby do poprawienia — nie jako ukryta domyślność, bo to była właśnie pułapka, przez którą arkusz pokazywał kiedyś inne ciężary niż konsola.

**Dwa błędy znalezione po drodze — oba istniały od dawna i oba były niewidoczne:**

- **Przełączanie tygodni nie działało w ogóle.** Zakładki `T1…T6` stały w `<label>`, a kliknięcie w `<label>` uruchamia jego kontrolkę — czyli pierwszy przycisk w środku. Klik w „T4" wracał natychmiast na „T1". Ekran planu istnieje po to, żeby ustawiać sześć tygodni parametrów, i przez cały czas pokazywał wyłącznie pierwszy. Handler w JavaScripcie jest poprawny i nawet się uruchamia — z kodu tego nie widać, widać dopiero w przeglądarce.
- **Polski cudzysłów zamykał łańcuchy.** `"użyj „Połącz" — historia zostanie"` to składniowo koniec łańcucha po słowie „Połącz". Trafiło się trzy razy, za każdym razem kończąc serwerem, który się nie uruchamia. Doszedł test parsujący **wszystkie** źródła bez ich wykonywania — także `serwer.ts`, którego zwykły import postawiłby nasłuch.

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

## Decyzje podjęte

Pięć pytań, które blokowały fazę 1 — rozstrzygnięte 15.08.2026.

**1. Klienci stacjonarni zostają poza systemem.**
Aktualnych nie migrujemy. `CLAUDE.md` mówi wprost: inny układ, nie mieszać założeń — i tak zostaje. Schemat zachowuje `klienci.user_id = null` jako furtkę na przyszłość, ale kreator planu projektujemy wyłącznie pod układ 6-tygodniowy.

**2. Przełącznik objętość / intensywność zostaje ręczny.**
Bez automatycznego przełączania w połowie cyklu. `czesc_planu` pozostaje własnością planu, ustawianą przez trenera — dokładnie jak `Analiza!B5` dziś. Silnik już tak działa.

**3. Katalog: bez `dom / siłownia`, z oznaczeniem ćwiczeń jednostronnych.**
Na razie tylko siłownia, więc pole lokalizacji nie wchodzi. Jednostronne — wchodzi jako oznaczenie:

- **19 pozycji** ma jawny marker w nazwie (`s/a`, `s/l`, `alternating`) → oznaczone automatycznie.
- **11 pozycji** to wzorce z natury jednostronne bez markera (`bulgarian`, `pistol`, `lunge`, `step up`, `split squat`) → wypisane jako kandydaci i **potwierdzone przez trenera 15.08.2026**.
- Razem **30 oznaczonych** z 164.
- `B/l dragonflag eccentric` ma marker *przeciwny* (obustronne) i celowo nie jest oznaczone.

Mechanizm „do potwierdzenia" zostaje w silniku pusty — przyda się przy ćwiczeniach dokładanych do bazy w przyszłości.

Lista: [`dane/jednostronne.json`](dane/jednostronne.json), podgląd: `npm run policz -- kontrola`.

**3a. Serie i powtórzenia przy jednostronnych znaczą NA STRONĘ.** *(rozstrzygnięte)*

Zapis `3 × 10` to sesyjnie **6 serii roboczych**. Arkusz liczy 3 — czyli zaniża objętość i stres tych 30 pozycji dwukrotnie.

Silnik dostał opcję `liczenieJednostronnych`, **domyślnie `"jak w arkuszu"`**. Powód jest praktyczny: normy objętości w zakładce Analiza (`s` 4–7, `b` 8–13, `r` 7–11 serii na dzień) powstały na planach liczonych po staremu. Przełączenie bez przeliczenia norm wypchnęłoby z zakresu każdy plan zawierający pracę jednostronną — na przykładowym dniu z trzema takimi pozycjami stres tygodniowy rośnie z 4,18 do 7,55.

`porownajLiczenieJednostronnych(plan)` pokazuje różnicę dla dowolnego planu i wskazuje, przy których wzorcach zmienia się ocena normy.

**Do zrobienia przy fazie 1 — jedna z dwóch dróg:**
- przeliczyć normy na nowe liczenie i przełączyć tryb na stałe, albo
- zostawić liczenie jak jest, a klientowi po prostu wyświetlać „na stronę”.

Warto przy tym rozważyć, czy płaskie ×2 jest właściwe na wszystkich trzech osiach stresu: koszt **obwodowy na kończynę** się nie podwaja (każda strona dostaje swoje `3 × 10`), podwaja się raczej **centralny**. Szczegóły: [`02-silnik-obliczeniowy.md`](02-silnik-obliczeniowy.md) §8a.

**4. Zmiana liczby dni w trakcie cyklu — funkcja do dodania, nie na start.**
Dziś nie ma takiej możliwości i to zostaje. Silnik jest na to gotowy: `dniTreningowe` wylicza się z faktycznie wypełnionych slotów, a wszystkie normy skalują się tą liczbą — więc dołożenie tego później to zmiana w UI, nie w jądrze.

**5. TOP SET w arkuszu naprawiony.**
Zrobione: [`arkusz/`](../arkusz/README.md) produkuje 5.18. Przy okazji wyszły dwa nieznane wcześniej błędy — brakujące formuły `START!B7` i `T1!G8`, oba na slocie `D1-S02`. Naprawione jako osobne, możliwe do pominięcia poprawki.

## Co jest zrobione tym dokumentem

- Silnik 5.17 rozłożony na funkcje z sygnaturami i wzorami — `02-silnik-obliczeniowy.md`.
- Dane referencyjne wyciągnięte i zweryfikowane przeciwko plikowi — `docs/dane/`.
- Schemat bazy, warstwy, ekrany, rekomendacja stacku — `03-architektura.md`.
- Rozbieżności instrukcja ↔ plik wypisane, jeden ze znanych błędów zamknięty jako naprawiony — `01-analiza-zrodel.md`.

Czego nie ma i wymaga Twojej decyzji przed startem fazy 0: pięć punktów wyżej.
