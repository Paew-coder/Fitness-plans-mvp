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

**6. TOP SET stawia trener — przy dowolnym ćwiczeniu.** *(20.09.2026)*

Aplikacja nie rozstrzyga, gdzie TOP SET może być. W konsoli każdy wypełniony wiersz ma przycisk „T": kliknięcie stawia TOP SET przy tym ćwiczeniu, kolejne — zdejmuje. W dniu jest jeden, jak jeden wiersz TOP SET w arkuszu, więc kliknięcie gdzie indziej przenosi go, zamiast dokładać drugi. W nowym planie nie ma go wcale.

Osobno od tego zapisana jest **wiedza trenera**, słowami z 20.09.2026: *„zazwyczaj top set będzie tylko do ćwiczeń barbell bench press, low bar squat, high bar squat, deadlift, sumo deadlift — w innych przypadkach się nie zdarza niezależnie od coeff"*. Lista siedzi w [`silnik/src/top-set.ts`](../silnik/src/top-set.ts) i **niczego nie blokuje** — służy podpowiedzi w konsoli i rozpisywaniu planów, gdy będzie automatyczne.

Krótko przedtem TOP SET pojawiał się wyłącznie przy ćwiczeniu z `coeff` 1,0 i tylko w pierwszym wierszu dnia. To było za wąsko i za szeroko naraz: odbierało trenerowi wybór, a jednocześnie proponowało TOP SET przy dipach, wykrokach i cleanie, bo one też mają 1,0.

Jeden przypis do nazw: „high bar squat" to w BAZIE `Barbell back squat` — przysiad ze sztangą wysoko, domyślny wariant bez dopisku.

**`Sumo deadlift` dodany do katalogu 20.09.2026** jako `EX-0204`, z parametrami jak `Deadlift` (Lower pull, part `d`, coeff 1,0, skok 2,5 kg, progresja w kg). W BAZIE 5.17 go nie było — to pierwsza pozycja katalogu spoza arkusza, oznaczona `wiersz_baza: null` i notatką w `uwagi`. Nagrania jeszcze nie ma, więc kontrola planu zgłasza przy nim „Ćwiczenie bez nagrania" — to ostrzeżenie, nie błąd, i zniknie po dodaniu linku do `docs/dane/baza-cwiczen.json`.

**7. Drugi cykl ma własną progresję boju — cz.2 z arkuszy.** *(20.09.2026)*

Przełącznik *Część planu* zmieniał dotąd tylko zakres powtórzeń akcesoriów. Od teraz zmienia też bój główny, bo tak jest w szablonach trenera — „rozpisywanie bench pressa w cz.1 było inne niż w cz.2".

| Część planu | T1 | T2 | T3 | T4 | T5 | T6 |
|---|---|---|---|---|---|---|
| objętość (cz.1) | 6×6 @6,5 | 5×6 @7 | 5×5 @7 | 4×5 @7,5 | 5×4 @7,5 | 6×3 @7,5 |
| intensywność (cz.2) | 6×4 @7 | 6×4 @7 | 5×4 @7,5 | 5×3 @7,5 | 5×3 @8 | 6×2 @8 |

Odczytane z „Szablon 3 dni, 3 złożone cz.1 / cz.2" (Day I, sześć tygodni) i sprawdzone na drugim komplecie — „3 dni, 6 złożonych, 6 akcesoriów cz.2" ma w boju te same liczby. Kolumna `objętość` jest tożsama z tym, co niesie MasterTemplate 5.18: 5.18 wziął bój właśnie z Day I części pierwszej.

Przy okazji potwierdziło się, że **akcesoria już były zrobione dobrze**: cz.1 w arkuszu to 3×8 i 3×10 przy RPE 8/9, cz.2 to 3×6 i 3×8 — dokładnie to, co automat powtórzeń liczy z `coeff` przy przełączniku objętość/intensywność.

Czego świadomie nie przenosimy: różnic między dniami. W arkuszach Day II i III mają o serię mniej i nierówne RPE (cz.2 Day II: 5×3 w T4, 4×2 w T5, znów 4×3 w T6). MasterTemplate spłaszczył to do Day I i tak zostaje.

**RPE TOP SETU rośnie przez cykl** — domknięte tego samego dnia, po decyzji trenera („zróbmy rosnące RPE tak samo jak było w cz.1 i cz.2, z takim samym skalowaniem"):

| Część planu | T1 | T2 | T3 | T4 | T5 | T6 |
|---|---|---|---|---|---|---|
| objętość (cz.1) | — | 6 | 6,5 | 7 | 7,5 | 8 |
| intensywność (cz.2) | — | 7 | 7,5 | 8 | 8,5 | 9 |

Pół stopnia na tydzień, części różni punkt wyjścia. **W T1 TOP SETU nie ma** i to nie jest przeoczenie — tak jest w obu arkuszach; w szablonie stoi tam `null`, bo „nie ma" to co innego niż „jest, na RPE 6". Trener potwierdził też, że w cz.2 tydzień drugi celowo powtarza pierwszy i różni się wyłącznie tym, że dochodzi TOP SET.

`TopSet.rpe` (jedna liczba na cykl) ustąpił miejsca `TopSet.rpeTygodni` — liczbom wpisanym ręcznie, osobno na każdy tydzień. Puste znaczy „z szablonu", wpisane wygrywa (także w T1, gdzie przywraca TOP SET), wyczyszczenie wraca do szablonu. Dokładnie jak pola serii i powtórzeń w tabeli niżej.

Migracja bazy do wersji 5 rozstrzyga starą liczbę tak: **7 kasuje** (nikt jej nie wybrał, tyle wpisywał szkielet nowego planu — zostawienie zablokowałoby rampę po cichu w każdym istniejącym planie), **każdą inną przepisuje na wszystkie sześć tygodni** (tam trener liczbę zmienił, więc jest wyborem).

**Eksport do .xlsx niesie rampę w całości** — po sprawdzeniu okazało się, że arkusz miał ją od zawsze. Jedna komórka na cykl to przełącznik TOP SETU (kolumna `B`, stoi w T1, reszta lustrzy); RPE (kolumna `F`) ma każdy tydzień własne, a stoją w nim dokładnie te liczby: 6 / 6,5 / 7 / 7,5 / 8. Spłaszczał to nasz wypełniacz, który pisał tylko do T1.

Zostało dołożenie jednej rzeczy, której w arkuszu naprawdę nie było: **pusty RPE znaczy „w tym tygodniu TOP SETU nie ma"** (poprawka 4 w [`arkusz/`](../arkusz/README.md), 90 komórek). Bez niej wyczyszczona komórka dawała `MATCH` bez trafienia → `IFERROR` → 0 → `MROUND` z zera, czyli **TOP SET na 0 kg** zamiast pustego wiersza — a pusty pierwszy tydzień to w szablonach trenera reguła, nie wyjątek.

**8. Tryb liczenia ciężaru przy pojedynczym ćwiczeniu.** *(20.09.2026)*

`SlotPlanu.trybCiezaru` nadpisuje `plan.trybAkcesoriow` dla jednego wiersza; pusto = jak w planie. Powód wprost od trenera: „licz z RPE wydaje mi się że nie jest przydatny bo zmienia wszystkie akcesoria naraz — zróbmy tak żeby dało się poszczególne ćwiczenia przełączyć". Przełącznik przy planie zostaje jako wartość domyślna dla nowych wierszy.

**9. Szkielety z Base44 — wyciągnięte 21.09.2026.**

Cztery szkielety FBW (1, 2, 3 i 4 dni) leżą w [`dane/szkielety-base44.json`](dane/szkielety-base44.json), z nazwami ćwiczeń **takimi, jakie są w Base44** — mapowanie na BAZĘ 5.17 jest osobną decyzją i część nazw odpowiednika nie ma.

Gdzie były: aplikacja „Główna wersja 10.05.26r." (`69ff4766434f5b4424fe682a`), encja `SavedPlan` — pięć rekordów, z czego dwa identyczne. Nowsza aplikacja „CraftMyPlan" (`6a005660818ba6a6c28f8b7d`) ma dziś `SavedPlan` **pusty** i jedno ćwiczenie w katalogu, więc szkielety siedzą wyłącznie w tej starszej.

Czego dalej nie da się przeczytać: **kodu aplikacji**. `template_id` (`fbw_3dni_6w`) wskazuje na szablon zdefiniowany w plikach, a dostęp do plików wymaga planu Builder — tak samo jak przy pierwszej analizie w fazie 0. Struktura dni i tak jest w rekordach, więc kod nie jest do tego potrzebny.

Dwie rzeczy warte odnotowania przy przenoszeniu:
* **To są szkielety FBW, nie układ 5.17.** Mają 7–8 pozycji w dniu (A1, B1/B2, C1/C2, D1/D2, E1/E2) i bój główny na A1 — więc wpasowują się w nasz szkielet 5 dni × 12 slotów bez naciągania.
* **Katalogi się rozjechały.** Z jedenastu nazw cztery trafiają w BAZĘ dokładnie, cztery po poprawieniu zapisu (`High Bar Back Squat` → `Barbell back squat`, `Conventional Deadlift` → `Deadlift`, `Overhead Barbell Press` → `Barbell OHP`, `Pull-Up` → `Pull up`), a trzy nie mają w BAZIE odpowiednika w ogóle: `Close-Grip Bench Press`, `Machine Shoulder Press` i samo `Plank` (BAZA ma wyłącznie warianty: `Plank contralateral`, `Plank leg raises`, `Copenhagen plank`…).

**10. Szablony z ekranu „Wybierz szablon" — wyciągnięte 21.09.2026.**

To jest to, o co trenerowi chodziło: **14 gotowych szkieletów** z aplikacji „CraftMyPlan", w [`dane/szablony-base44.json`](dane/szablony-base44.json). Każdy ma układ dni (kategoria na pozycji, z oznaczeniem boju głównego) **i pełną progresję: serie × powtórzenia × RPE dla każdej pozycji, tydzień po tygodniu, razem z TOP SETEM**.

| Rodzina | Warianty | Bój główny |
|---|---|---|
| Klasyczny (`fbw_*dni_6w`) | 1, 2, 3, 4 dni | z TOP SETEM od T2 |
| Rozbudowany (`fbw_*_6cwiczen_6w`) | 1, 2, 3, 4 dni | dwa boje na dzień |
| Hipertroficzny (`hyper_*`) | 1, 2, 3, 4 dni | **bez TOP SETU**, 4×12–14 |
| Kontynuacje bloków (`*_v2`) | 2 i 3 dni | TOP SET o stopień wyżej |

Skąd, skoro plików nie da się czytać: szablony siedzą w kodzie, ale kod jedzie do przeglądarki. Publiczny pakiet `https://craftmyplan.base44.app/assets/index-*.js` zawiera je w całości; `GET /api/apps/{id}/coding/export-to-zip` w katalogu API też je odda, ale zwraca binarny zip, którego narzędzie nie przepuszcza.

**Kategorie zgadzają się z naszymi co do jednej** — różni je wyłącznie wielkość liter (`Upper Push Horizontal` ↔ `Upper push horizontal`). Dziewięć, te same.

**Co z tego wynika dla silnika — i gdzie jest sprzeczność:**

* **„Klasyczny 2 dni" to dokładnie nasza kolumna `objętość`.** T1 6×6 @6,5, dalej 5×6 @7 → 5×5 @7 → 4×5 @7,5 → 5×4 @7,5 → 6×3 @7,5, a TOP SET wchodzi od T2 na RPE 6 i rośnie do 8. Niezależne potwierdzenie tego, co wczoraj weszło z arkuszy.
* **Kontynuacja bloku w aplikacji znaczy co innego niż cz.2 w arkuszu.** W aplikacji `*_v2` zostawia pracę bez zmian i podnosi wyłącznie TOP SET (7 → 9). W arkuszu cz.2 zmienia samą pracę (6×4 → 6×2), a TOP SET podnosi przy okazji. **To są dwa różne pomysły na to samo słowo i trzeba wybrać jeden.**
* **Klasyczny 3 i 4 dni ma jeszcze inną progresję boju** — 6×4 @7 → 5×4 @7 → 5×4 @7,5 → 4×3 @7,5 → 5×3 @8 → 6×2 @8. Podobna do naszej `intensywność`, ale nie ta sama (T2 i T4 się różnią).
* **Hipertroficzny nie mieści się w dzisiejszym automacie powtórzeń.** Stoi na 4×12–14 przy RPE 8/9, a `powtorzeniaBazowe` zna dwie kolumny: 8/10 (objętość) i 6/8 (intensywność).

  **Rozstrzygnięte 21.09.2026:** trzecia kolumna — „hipertrofia", 12/14 — wchodzi, ale **nie teraz**. Trener: „możemy zrobić osobną progresję 12/14. Na razie zaplanujmy bez dodawania". Czyli jest to zaplanowane, nie zapomniane: zakres powtórzeń akcesoriów rozszerza się o trzecią wartość `CzescPlanu`, a bój główny w tej rodzinie nie ma TOP SETU w ogóle.

**11. Periodyzacja, z której wzięło się wszystko — 21.09.2026.**

Trener przysłał arkusz periodyzacji siłowej, na której opierał swoje plany (ciężary przykładowe). Przepisany do [`dane/periodyzacja-13-tygodni.json`](dane/periodyzacja-13-tygodni.json) — **ze zrzutu ekranu, więc liczby warto sprawdzić z oryginałem**, zanim ktoś na nich coś policzy.

**Rozstrzygnięcie przy okazji:** „część 2" znaczy **kolejny sześciotygodniowy plan, w którym zmienia się też praca** — czyli wersja z arkusza, ta, która jest w kodzie. Wersja z Base44 (praca stoi, rośnie sam TOP SET) odpada.

Periodyzacja potwierdza obie kolumny `PROGRESJA_BOJU` u źródła. Wyciskanie:

| | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| Blok I | 6×6 | 5×6 | 5×5 | 4×5 | 5×4 |
| Blok II | 6×4 | 5×4 | 5×3 | 5×3 | 6×2 |

To jest dokładnie nasza `objętość` i `intensywność`, tylko rozłożone na pięć tygodni zamiast sześciu. TOP SET wchodzi od drugiego tygodnia — trzeci niezależny dowód na to samo.

**Czego w aplikacji nie ma, a w periodyzacji jest:**

* **Deload.** Po każdym bloku idzie tydzień lżejszy — mniej serii, niższe RPE (przysiad 97,5 kg 5×4 @7 po 102,5 kg 4×4 @9), bez TOP SETU. Nasz cykl ma sześć tygodni roboczych i nic takiego.
* **Tydzień 13: max out.** Jedno powtórzenie na RPE 10 w trzech bojach — to jest naturalne wejście w kolejny cykl, bo daje nowy 1RM. Dziś trener wpisuje serię maksymalną ręcznie.
* **Trzynaście tygodni jako całość** — dwa bloki po 5 + dwa deloady + max out. Aplikacja zna sześciotygodniowy cykl i nic ponad.

**RPE w periodyzacji a RPE w planach — rozstrzygnięte przez porównanie z kilogramami.**

Najpierw wyglądało to na „training max": ciężary robocze w periodyzacji wypadały 4–9 punktów procentowych poniżej tego, co daje tabela RPE od podanego 1RM. Po zestawieniu trzech rzeczy naraz — kilogramów z periodyzacji, jej własnej kolumny RPE i RPE z arkuszy cz.1/cz.2 — wyjaśnienie okazało się prostsze i mocniej poparte. **Nie ma żadnego training maxa. Jest różnica w tym, co kto wpisał w kolumnę RPE.**

Wyciskanie, 1RM 115 kg, blok I (serie robocze):

| serie × powt. | kg | ile to naprawdę RPE wg tabeli | periodyzacja pisze | arkusz cz.1 pisze |
|---|---|---|---|---|
| 6×6 | 80 | 6,5 | 7,5 | **6,5** |
| 5×6 | 82,5 | 7 | 8 | **7** |
| 5×5 | 85 | 7 | 8,5 | **7** |
| 4×5 | 87,5 | 7,5 | 8,5 | **7,5** |
| 5×4 | 90 | 7 | 9 | 7,5 |

I to samo w bloku II: arkusz trafia 5 razy na 5, periodyzacja jest wyżej o 0,5–1. **Kolumna RPE w arkuszach cz.1/cz.2 odtwarza kilogramy z periodyzacji prawie dokładnie; kolumna RPE w samej periodyzacji jest o 0,5–1,5 wyższa od tego, co te kilogramy znaczą w tabeli.** Czyta się to jak zamierzony wysiłek, nie jak odczyt z tabeli.

Wniosek dla silnika: **liczenie ze 100 % wpisanego 1RM jest w porządku** i nie trzeba żadnego mnożnika — bo arkusze, z których wzięte są nasze liczby, już się z kilogramami zgadzają.

**Ale przy TOP SECIE jest odwrotnie.** Tam kilogramy z periodyzacji zgadzają się z JEJ RPE (3 na 4 dokładnie), a rampa z arkusza jest niżej:

| | T2 | T3 | T4 | T5 |
|---|---|---|---|---|
| aplikacja (rampa z arkusza) | 95 kg · RPE 6 | 97,5 · 6,5 | 100 · 7 | 102,5 · 7,5 |
| periodyzacja | 100 kg | 102,5 | 105 | 107,5 |

Równe **5 kg lżej w każdym tygodniu** — czyli cały punkt RPE.

**Rozstrzygnięte 21.09.2026: zostaje niżej.** Trener wyjaśnił też, skąd wzięła się różnica w seriach roboczych — obniżał RPE u siebie świadomie, żeby przy liczeniu ze 100 % 1RM (tak liczy arkusz) wychodziły ciężary podobne do periodyzacji, która liczyła z mniejszego procentu. Najprostsze rozwiązanie po jego stronie i trafne. Przy TOP SECIE ta sama korekta poszła odruchowo, choć tam nie była potrzebna — kilogramy TOP SETU z periodyzacji to 87–93,5 % maksa, czyli dokładnie tabela przy 100 %.

Mimo to liczby zostają, i to jest decyzja, nie przeoczenie: *„żeby wartości kilogramów nadawały się dla trenujących mniej zaawansowanych i były bezpieczniejsze, skoro z aplikacji ma korzystać szerokie grono odbiorców"*. Periodyzacja powstała dla jednej osoby pod okiem trenera; aplikacja rozpisuje pojedyncze na maksimum komuś, kogo nikt nie obserwuje. Zapisane w `silnik/src/top-set.ts` przy samej tabeli i przypięte testem, żeby podniesienie tych liczb wymagało decyzji.

**12. Pierwsze godziny z Markiem X — 21.09.2026.**

Cztery rzeczy z prawdziwego używania, wszystkie o tym samym: **aplikacja działała zgodnie z BAZĄ i nigdzie tego nie mówiła.**

* **„SLDL balance" — wpisana seria maksymalna, a w ciężarze napis „ręczne ustawienie".** To był jedyny prawdziwy błąd z tej czwórki: przy tej progresji komórka ciężaru pokazywała napis i **nie dawała pola**. Aplikacja pisała „ustaw ręcznie" i nie dawała gdzie. Silnik od początku honorował `ciezarOverride` także tam — brakowało wyłącznie pola w konsoli.
* **„Dead bug izo + OH" — wpisany maks 10 kg × 15, a w planie „masa ciała".** Zachowanie poprawne, komunikat żaden. Teraz ćwiczenia bez serii maksymalnej (25 ze 165) zostają na liście pomiarów, ale zamiast pól mają jedno zdanie, dlaczego nie ma czego mierzyć. Zdania trzyma `silnik/src/seria-maksymalna.ts`; test pilnuje, żeby kopia w `public/app.js` brzmiała identycznie.
* **Granica 15 powtórzeń nie była nigdzie napisana**, a odmowa serwera brzmiała „trener zmienił plan" — przy serii na 16 powtórzeń nieprawda, z której nic nie wynika. Granica stoi teraz przy polu (`max`), nad listą i w komunikacie, który mówi, **co zrobić**: dołóż kilogramów, żeby zmieścić się w piętnastu. Aplikacja klienta pokazuje odmowę słowami serwera, nie własnym domysłem.

**Rozstrzygnięte przy okazji 21.09.2026:** pole ciężaru **nie** otwiera się przy ćwiczeniach na masie ciała. Padło pytanie, czy pozwolić wpisać tam stałe 2 kg (trener rozważał to przy „Dead bug izo + OH"); odpowiedź brzmi nie — „niech zostanie masa ciała tak jak jest". Pole ręcznego ciężaru ma wyłącznie progresja `ręczne ustawienie`, bo tylko ona mówi wprost, że ciężar ma się wziąć spoza 1RM.

**13. Jak dużo da się przeczytać z Base44 bez planu Builder — 21.09.2026.**

Trener zapytał, co zrobić, żeby dało się tamtą aplikację przestudiować dokładnie. Sprawdzone, co jest dostępne na jego obecnym planie:

| Droga | Stan |
|---|---|
| Pliki źródłowe przez MCP (`grep`, `read_file`) | **nie** — wymaga planu Builder |
| Synchronizacja z GitHubem | **nie** — `402: GitHub Integration is not available on your current plan` |
| `GET /api/apps/{id}/coding/export-to-zip` | **tak** — zwraca prawdziwy zip, tylko binarnie, więc nie przechodzi przez `execute_api` |
| Opublikowany pakiet JS | **tak, bez żadnego planu** — `https://craftmyplan.base44.app/assets/index-*.js` |
| Source map do tego pakietu | nie — 404 |

Pakiet jest zminifikowany (bez komentarzy, nazwy zmienne pomieszane), ale **cała logika i wszystkie teksty są w środku**. Stamtąd wzięły się szablony z punktu 10; teraz doszły teksty interfejsu — [`dane/teksty-base44.json`](dane/teksty-base44.json), 144 pozycje.

Najkrótsza droga do pełnego źródła z komentarzami: trener pobiera zip eksportem z Base44 i wrzuca go do repozytorium na GitHubie, które da się dołączyć do sesji. Wtedy czyta się to jak każdy inny kod, bez kosztu kontekstu.

**Funkcja, o którą trener zapytał, jest w tamtej aplikacji zrobiona** — teksty z pakietu mówią to wprost: *„Brak wpisanego max setu — 1RM zostanie wyliczone po wpisaniu ciężaru podczas treningu"*, *„Ciężar możesz uzupełnić podczas pierwszego treningu"*, *„Max set zapisany — kolejne serie będą już z wyliczonym ciężarem"*. Czyli klient może pominąć serie maksymalne i skalibrować plan pierwszym treningiem.

W CraftMyPlan silnik umie to od dawna (`oneRMzSerii` liczy 1RM z serii roboczej, z RPE poprawionym o ocenę). Brakuje trzech rzeczy po stronie ekranów:
1. pole ciężaru w planie klienta zamiast liczby — dziś jest, ale zwinięte pod „zapisz, co poszło";
2. sensownego stanu, gdy 1RM jeszcze nie ma — dziś klient widzi „— brak 1RM" zamiast zaproszenia do dobrania ciężaru;
3. instrukcji: dwie drogi na start i czym jest RPE.

**Cztery rzeczy do przypomnienia** (trener: „trzymaj te 4 rzeczy i przypomnisz później"):

1. **Biblioteka szkieletów z Base44** — 14 szablonów czeka na decyzję w trzech nazwach bez odpowiednika w BAZIE: `Close-Grip Bench Press`, `Machine Shoulder Press`, `Plank`.
2. **Deload i tydzień max out** — dopiero po pierwszym pełnym cyklu z żywym klientem.
3. **Progresja hipertroficzna 12/14** — zaplanowana, nie dodana (punkt 10).
4. **Scalenie gałęzi roboczej do `main`** — decyzja trenera.

## Co jest zrobione tym dokumentem

- Silnik 5.17 rozłożony na funkcje z sygnaturami i wzorami — `02-silnik-obliczeniowy.md`.
- Dane referencyjne wyciągnięte i zweryfikowane przeciwko plikowi — `docs/dane/`.
- Schemat bazy, warstwy, ekrany, rekomendacja stacku — `03-architektura.md`.
- Rozbieżności instrukcja ↔ plik wypisane, jeden ze znanych błędów zamknięty jako naprawiony — `01-analiza-zrodel.md`.

Czego nie ma i wymaga Twojej decyzji przed startem fazy 0: pięć punktów wyżej.
