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

1. ~~**Walidator powtórek między cyklami**~~ — `POWTORKA_Z_POPRZEDNIEGO`. **Zrobione.** Otwarty temat Marka Nowaka (nakładanie się ćwiczeń) rozwiązał się sam.
2. ~~**Automatyczna aktualizacja 1RM z wykonań**~~ — **zrobione.** `silnik/src/odczyt-1rm.ts` odwraca wzór arkusza: `1RM = ciężar / (%1RM z tabeli)`, gdzie RPE bierze się z planu skorygowanego odczuciem (±1 stopień). Mediana z ostatnich trzech serii, żeby jedna pomyłka przy wpisywaniu nie zawyżyła wyniku. W konsoli karta **1RM z serii roboczych** — propozycja z oceną zaufania, przyjmowana kliknięciem. Nic nie zmienia się samo.
3. ~~**Porównanie cykli**~~ — **zrobione.** `silnik/src/porownanie-cykli.ts`: objętość, wzorce ruchu, 1RM na wejściu, ćwiczenia powtórzone / nowe / usunięte. W konsoli karta *Wobec poprzedniego cyklu*, widoczna gdy plan wskazuje poprzedni. Opisuje, nie ocenia — mniej objętości przy powrocie po kontuzji to dokładnie to, co trzeba.
4. ~~**Moduły ODDECH i BIEG**~~ — **zrobione.** `silnik/src/oddech.ts` i `silnik/src/bieg.ts`, oba sprawdzone przeciwko 5.18 przeliczonemu w LibreOffice (262 wartości). W konsoli karty *Oddech* i *Bieg*, u klienta osobny ekran „Oddech i bieg".
5. ~~**Przegląd wszystkich klientów**~~ — **zrobione.** Panel *Wymaga uwagi* na górze listy: kto stanął, kto nie zaczął, kto nie ma linku, komu kończy się cykl. Plus tydzień cyklu przy każdym planie.

---

## Faza 3,5 — Wersja produkcyjna dla trenera

*Decyzja podjęta: najpierw narzędzie dla trenera i jego klientów, SaaS dla innych trenerów później. A jest warunkiem koniecznym dla B, więc nic z tej fazy się nie marnuje.*

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

**Migracja jest prawdziwa, nie deklaratywna.** Schemat podnosi się z wersji 1 do 2 przy pierwszym starcie: z nazw w planach powstają klienci (dopasowanie po slugu, więc „Zofia K" i „zofia k." to jedna osoba), token przechodzi z najnowszego planu na klienta, waga z wszystkich cykli scala się w jedną historię. Test buduje bazę w starym schemacie, wypełnia ją i sprawdza, że nic nie zginęło — łącznie z tym, że **link, który klient ma w telefonie, dalej działa**.

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
- *Kamil Lis, brakuje „Tricep pushdown" w BAZIE.* Jest: **`EX-0194 Tricep cable pushdown`** (Tricep, part `b`, coeff 0,25, progresja kg). Wskazany tam zamiennik `EX-0170` to `Rope pushdown` — też Tricep/`b`/0,25. Kategoria Tricep ma w 5.17 dziewięć pozycji.
- *Marek Nowak, propozycje zamienników.* Wszystkie trzy są w bazie: `EX-0004 Arnold press`, `EX-0019 Bayesian curl`, `EX-0195 Tricep JM press`.

Numeracja `EX-` sięga `EX-0203` przy 164 wypełnionych wierszach — ID nie są ciągłe, bo część pozycji została zwinięta przez `scalone_id`. Import musi iść po ID, nie po pozycji w zakresie.

### Krok 2 — plany klientów

~30 plików z Dysku. Nie wszystkie warto przenosić — część to warianty i testy (`TEST – Zofia K 3.0`, trzy kopie `Zofia K 2.0` z tego samego dnia, `Plan Sprint GPT`).

Rekomendacja: przenieść **najnowszą wersję każdego aktywnego klienta** plus jedną wstecz (żeby walidator powtórek miał na czym pracować). Reszta zostaje na Dysku jako archiwum.

Aktywni wg `STAN-PROJEKTU.md`: Marek Nowak (3.0), Kamil Lis, Ewa Mazur (1.0), Plan-trenera-3tyg.
Widoczne na Dysku i warte sprawdzenia, czy nadal aktywne: Zofia K (3.0), Jan Wrona (1.0), Tomek (3.0), Igor (2.0), Ola Zielińska (2.0), Piotr Sowa, Adam, Michał T..

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

**Rozstrzygnięte 25.09.2026: zostaje jak w arkuszu.** Trener: „zostawmy jak jest”. Normy powstały na tym liczeniu (przy planie z dwoma jednostronnymi przełączenie zmieniało stres z 16,6 „w normie” na 20,3 „powyżej”, choć plan nie był cięższy), a lokalnie każda strona i tak robi swoje serie. Klient widzi „na stronę”, konsola pod wzorcami pokazuje różnicę. Wariant „podwójnie tylko w stresie centralnym” zostaje do rozważenia, gdyby praktyka pokazała, że jednostronne męczą ogólnie bardziej.

Warto przy tym rozważyć, czy płaskie ×2 jest właściwe na wszystkich trzech osiach stresu: koszt **obwodowy na kończynę** się nie podwaja (każda strona dostaje swoje `3 × 10`), podwaja się raczej **centralny**. Szczegóły: [`02-silnik-obliczeniowy.md`](02-silnik-obliczeniowy.md) §8a.

**4. Zmiana liczby dni w trakcie cyklu — funkcja do dodania, nie na start.**
Dziś nie ma takiej możliwości i to zostaje. Silnik jest na to gotowy: `dniTreningowe` wylicza się z faktycznie wypełnionych slotów, a wszystkie normy skalują się tą liczbą — więc dołożenie tego później to zmiana w UI, nie w jądrze.

**5. TOP SET w arkuszu naprawiony.**
Zrobione: [`arkusz/`](../arkusz/README.md) produkuje 5.18. Przy okazji wyszły dwa nieznane wcześniej błędy — brakujące formuły `START!B7` i `T1!G8`, oba na slocie `D1-S02`. Naprawione jako osobne, możliwe do pominięcia poprawki.

**6. TOP SET stawia trener — przy dowolnym ćwiczeniu.** *(20.09.2026)*

Aplikacja nie rozstrzyga, gdzie TOP SET może być. W konsoli każdy wypełniony wiersz ma przycisk „T": kliknięcie stawia TOP SET przy tym ćwiczeniu, kolejne — zdejmuje. W dniu jest jeden, jak jeden wiersz TOP SET w arkuszu, więc kliknięcie gdzie indziej przenosi go, zamiast dokładać drugi. *(Zmienione 27.09.2026 — punkt 34: TOP SETÓW w dniu może być kilka.)* W nowym planie nie ma go wcale.

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

**Zmiana 24.09.2026:** trener jednak przestawił „Dead bug izo + OH” (EX-0049) z `masa ciała` na `ręczne ustawienie` — w `docs/dane/baza-cwiczen.json`, skąd generuje się katalog silnika. Zasada wyżej zostaje: masa ciała nadal nie ma pola ciężaru; zmieniło się tylko to jedno ćwiczenie, które teraz dostaje pole ręcznego ciężaru w konsoli, a klient widzi ten ciężar w planie i może zapisać kilogramy. Test w `konsola/testy/seria-maksymalna.test.ts` pilnuje, żeby nie wróciło po cichu. Tego samego dnia poprawiony telefon: dopóki trener nie wpisze ciężaru, klient widzi w kolumnie „dobierz” (zamiast napisu z BAZY „ręczne ustawienie”), jedno zdanie, że ciężar dobiera sam, i otwarte pola kg — na liście tak samo jak w prowadzeniu. Flaga `ciezarWybieraKlient` w widoku klienta; nic się z tego wpisu nie liczy do 1RM.

**13. Jak dużo da się przeczytać z Base44 bez planu Builder — 21.09.2026.**

Trener zapytał, co zrobić, żeby dało się tamtą aplikację przestudiować dokładnie. Sprawdzone, co jest dostępne na jego obecnym planie:

| Droga | Stan |
|---|---|
| Pliki źródłowe przez MCP (`grep`, `read_file`) | **nie** — wymaga planu Builder |
| Synchronizacja z GitHubem | **nie** — `402: GitHub Integration is not available on your current plan` |
| Eksport projektu do `.zip` | **nie** — „ZIP file export is only available on Builder, Pro, Elite and Enterprise plans". Wywołanie API wróciło z błędem „binary_response" po naszej stronie, więc przez chwilę wyglądało na dostępne; rozstrzygnął ekran w Base44 |
| Opublikowany pakiet JS | **tak, bez żadnego planu** — `https://craftmyplan.base44.app/assets/index-*.js` |
| Source map do tego pakietu | nie — 404 |

Pakiet jest zminifikowany (bez komentarzy, nazwy zmienne pomieszane), ale **cała logika i wszystkie teksty są w środku**. Stamtąd wzięły się szablony z punktu 10; teraz doszły teksty interfejsu — [`dane/teksty-base44.json`](dane/teksty-base44.json), 144 pozycje.

**Płatna jest więc każda droga do źródła z komentarzami.** Ale okazało się, że nie jest potrzebna: pakiet, choć zminifikowany, zachowuje **strukturę JSX, klasy CSS, nazwy pól danych i wszystkie teksty**. Mieszają się tylko nazwy zmiennych lokalnych. Sprawdzone na dwóch rzeczach naraz:

* ekran ćwiczenia z komunikatem o braku max setu czyta się wprost, razem z układem przycisków (`Zakończ serię`, `Historia / najlepsza seria`, `Szacowane 1RM`);
* wzór liczący 1RM z serii roboczej to `ciężar / (%1RM / 100)` — **ten sam, co nasz `oneRMzSerii`**, z tą samą tabelą RPE.

**I rzecz, która okazała się najcenniejsza: cała rozmowa trenera z AI Base44 jest do odczytania** — `GET /api/apps/{id}/chat/full-conversation`, bez żadnego planu. Między 600 a 1200 wiadomości od maja 2026. Są tam jego własne polecenia, czyli **zamiar**, którego zminifikowany kod nie niesie nigdy: co miało robić, dlaczego tak, co go w poprzedniej wersji uwierało. Do wiadomości doczepione są zrzuty ekranu (`file_urls`), też publiczne.

Jedno ograniczenie tej drogi: argumenty wywołań narzędzi (a w nich treść plików) bywają **ucięte do 500 znaków**, chyba że wywołanie czekało na zgodę trenera. Czyli z rozmowy odtworzy się zamiar i nazwy plików, ale nie całe pliki.

**Czego naprawdę nie da się dostać za darmo:** funkcji backendowych (`functions/*.js`, uruchamianych po stronie Base44). W pakiecie klienta ich nie ma — widać je wyłącznie we fragmentach z rozmowy. Dla ekranów, o które trenerowi chodzi (kalendarz, panele treningu, licznik przerwy), nie ma to znaczenia: to wszystko dzieje się w przeglądarce.

Wniosek: do przestudiowania tamtej aplikacji **nie trzeba kupować planu**. Gdyby przy jakimś ekranie zabrakło szczegółu, w menu Base44 jest „This page's files" — trener otwiera konkretną stronę i wkleja jej kod, bez wykupywania całości.

**Funkcja, o którą trener zapytał, jest w tamtej aplikacji zrobiona** — teksty z pakietu mówią to wprost: *„Brak wpisanego max setu — 1RM zostanie wyliczone po wpisaniu ciężaru podczas treningu"*, *„Ciężar możesz uzupełnić podczas pierwszego treningu"*, *„Max set zapisany — kolejne serie będą już z wyliczonym ciężarem"*. Czyli klient może pominąć serie maksymalne i skalibrować plan pierwszym treningiem.

W CraftMyPlan silnik umie to od dawna (`oneRMzSerii` liczy 1RM z serii roboczej, z RPE poprawionym o ocenę). Brakuje trzech rzeczy po stronie ekranów:
1. pole ciężaru w planie klienta zamiast liczby — dziś jest, ale zwinięte pod „zapisz, co poszło";
2. sensownego stanu, gdy 1RM jeszcze nie ma — dziś klient widzi „— brak 1RM" zamiast zaproszenia do dobrania ciężaru;
3. instrukcji: dwie drogi na start i czym jest RPE.

**Cztery rzeczy do przypomnienia** (trener: „trzymaj te 4 rzeczy i przypomnisz później"):

1. ~~**Biblioteka szkieletów z Base44**~~ — zrobione 25.09.2026 (punkt 24); trzy nazwy bez odpowiednika zostają pustą pozycją z kategorią.
2. ~~**Deload i tydzień max out**~~ — zrobione 25.09.2026 na prośbę trenera, przed pełnym cyklem z klientem (punkt 22).
3. ~~**Progresja hipertroficzna 12/14**~~ — zrobione 25.09.2026 (punkt 23).
4. **Scalenie gałęzi roboczej do `main`** — decyzja trenera. **25.09.2026: zostaje jak jest.** Serwer bierze zmiany z gałęzi roboczej co kwadrans (od 17.10.2026 co minutę) i trener woli to od zatwierdzania. Wersja testowa (`test.craftmyplan.pl` na gałęzi roboczej, klienci na `main` po „Merge") — do przypomnienia przed pierwszym pełnym cyklem z prawdziwym klientem.

**14. Wiosłowanie zostaje akcesorium, a trening dostaje prowadzenie — 22.09.2026.**

Dwie decyzje po analizie aplikacji z Base44.

**Wiosłowanie nie jest bojem głównym.** Pytanie wisiało otwarte od 20.09, a `diff_class` z tamtej aplikacji przyniosło dowód w drugą stronę: `Barbell Row` i `Pendlay Row` są tam liczone do ćwiczeń głównych mimo coeff 0,75. Trener rozstrzygnął odwrotnie — *„wiosłowania nie zaliczajmy do boju głównego tylko liczmy je jako akcesorium"*. Bojem głównym pozostaje wyłącznie ćwiczenie z coeff 1,0 w pozycji A; wiosłowanie w A1 dostaje progresję akcesorium. Kod nie wymagał zmiany — pytanie było otwarte, nie usterka. Zapisane przy `jestBojemGlownym` w [`silnik/src/szablon-boju.ts`](../silnik/src/szablon-boju.ts).

**Punkt 1 z listy „co przenieść" jest zrobiony** — trening panel po panelu z licznikiem przerwy, [`docs/05-base44-co-przeniesc.md`](05-base44-co-przeniesc.md#1-trening-panel-po-panelu-z-licznikiem-przerwy--%E2%9C%85-zrobione-22092026). Nowe: `silnik/src/przerwa.ts` (przerwa liczona z `coeff`: 180 / 120 / 90 / 60 s — liczby wzięte wprost z aplikacji trenera), ekran `#ekran-seria` w aplikacji klienta, sekcja 22 w `npm run przeglad-klienta` i `konsola/testy/przerwa.test.ts`.

Trzy rzeczy zrobione **inaczej niż w Base44**, bo trener uprzedził, że tamta aplikacja nie wszędzie działała poprawnie:

| rzecz | tam | u nas |
|---|---|---|
| superseria | przerwa po każdej serii, także między `B1` a `B2` | `B1` s1 → `B2` s1 → przerwa; przerwa rundy wg najcięższego ćwiczenia |
| licznik | `setInterval` odejmujący 1 — na zablokowanym telefonie zwalniał razem z przeglądarką | znacznik końca; po odblokowaniu telefonu czas jest prawdziwy |
| zapis serii | każda seria nadpisywała poprzednią | do trenera idzie **najcięższa** (z niej liczy się 1RM), wszystkie widać na panelu |

Do zrobienia zostaje reszta listy z punktu 05, po kolei: kalendarz z przesuwaniem treningów (2), kalibracja pierwszym treningiem (3), podgląd planu przy ustawianiu startu (4), historia ćwiczenia w panelu (5), rozgrzewka jako pozycja planu (6).

**15. Kalendarz odłożony, kalibracja pierwszym treningiem zrobiona — 23.09.2026.**

**Kalendarz (punkt 2 z listy 05) — odłożony decyzją trenera:** *„pomińmy narazie kalendarz. Wrócimy do tego pomysłu jak przyjdzie na to czas"*. Powody: w Base44 kalendarz nadrabiał brak trenera, a u nas pytanie „czy klient nadąża" ma już odpowiedź w panelu „wymaga uwagi" (`stanął`, `nie zaczął`); plan siłowy jest sekwencją, nie terminarzem, więc daty przy treningach produkują „Pominięty" tam, gdzie nie ma błędu; to najdroższa pozycja listy — jedyna, która rusza model danych. Wrócić do niego, gdy żywy klient się pogubi albo trener zacznie prowadzić kilkunastu naraz — i wtedy razem z przypomnieniami, bo kalendarz bez nich to połowa funkcji.

**Kalibracja pierwszym treningiem (punkt 3) — zrobiona.** Klient bez serii maksymalnych może zacząć od razu: dobiera ciężar według RPE z planu, a pierwsza wpisana seria staje się 1RM ćwiczenia i z niego liczy się cały cykl. Opis dla klienta: [`klient/README.md`](../klient/README.md#dwie-drogi-na-start); różnica wobec Base44 (tam pierwsza seria szła do upadku, u nas jest zwykłą serią roboczą na RPE z planu): [`05-base44-co-przeniesc.md`](05-base44-co-przeniesc.md).

Trzy braki wymienione w punkcie 13 są zamknięte: pola na ciężar są od razu na wierzchu, gdy ciężaru nie ma; zamiast `— brak 1RM` stoi „dobierz ciężar" z jednym zdaniem jak; dwie drogi na start i objaśnienie RPE są w banerze i przy każdym ćwiczeniu do dobrania.

Nowe: `konsola/kalibracja.ts`, `oneRMzKalibracji` w `silnik/src/odczyt-1rm.ts`, opcjonalne pole `kalibracja` przy wpisie serii maksymalnej (silnik go nie czyta — wpis ma postać `1RM × 1`, tę samą co przyjęta propozycja, więc arkusz i eksport działają bez zmian). Testy: `konsola/testy/kalibracja.test.ts`, trzy w `api-klienta.test.ts`, sekcja 23 w `przeglad-klienta`, sekcja 13d w `przeglad-ekranow`.

Przy okazji trzy błędy, każdy złapany przejściem w przeglądarce:

* **Baner „brakuje ciężarów" nie znikał nigdy w planie z ćwiczeniem na masie ciała.** Liczył je do brakujących, a one 1RM nie dostaną z definicji. Wprowadzone 21.09, kiedy takie ćwiczenia zostały na liście pomiarów.
* **Lista tygodni i ekran serii maksymalnych nie odświeżały się po powrocie z treningu.** Zapis z treningu idzie bez przerysowania (klient pisze), więc baner wisiał, choć 1RM już był. Dotyczyło też zapisu z listy.
* **Wpisanie samego ciężaru serii maksymalnej, bez powtórzeń, kasowało na serwerze poprzedni wpis** — zanim klient dopisał drugie pole. Przy kalibracji znaczyłoby to utratę 1RM i ciężarów w całym planie. Teraz seria idzie do serwera tylko w komplecie.

Następne z listy 05: podgląd planu przy ustawianiu startu (4), historia ćwiczenia w panelu (5), rozgrzewka jako pozycja planu (6).

**16. Poprawki z testów na planie Marka X — 23.09.2026.**

* **Instrukcja doboru ciężaru wisiała po wpisaniu serii.** Zapis z listy dnia celowo nie przerysowuje ekranu (żeby nie zamknąć klawiatury w połowie liczby), więc karta zostawała w stanie sprzed wpisu. Teraz instrukcja znika w chwili wpisania pełnej serii, a karta rysuje się od nowa, gdy wróci policzony ciężar. W prowadzeniu ta sama zasada.
* **Równoległe opróżnianie kolejki offline** — błąd starszy niż kalibracja. Dwa szybkie zapisy (ciężar, a zaraz powtórzenia) wysyłały kolejkę dwa razy naraz; odpowiedź na starszy zapis potrafiła przyjść później i nadpisać świeższy widok. Kontrola z przeglądu klienta łapała to co drugi przebieg. Teraz opróżnianie idzie łańcuchem — po poprawce sześć przebiegów z rzędu bez błędu.

**17. Wszystkie serie ćwiczenia, nie tylko najcięższa — 23.09.2026.**

Pytanie trenera: czy w „co poszło" pokazywać wszystkie serie, skoro nie chce zasypywać klienta liczbami. Rozstrzygnięcie: **wszystkie, ale w jednej linijce** (`80 · 90 · 85 · 80 kg × 6`). Do tej pory serie żyły wyłącznie w telefonie i tylko dla jednego treningu naraz, a do bazy szła jedna para — najcięższa. Trener widział „90×6" i zakładał 4 × 6 na 90, a klient przy planie na 80 kg zrobił 90, 85, 80: przestrzelił i opadł z sił.

* **Baza, wersja 6:** kolumna `serie_json` przy wykonaniu. Stare wpisy zostają z `NULL` i pokazują się jako jedna seria — rozpisanie ich na wszystkie serie z planu byłoby wymyślaniem liczb.
* **Serwer** przyjmuje listę serii (`serie`) i sam wylicza z niej najcięższą, która dalej karmi 1RM: propozycje, kalibrację, postęp. Sama para (z aplikacji sprzed zmiany, jeszcze w pamięci telefonu) zapisuje się jako jedna seria.
* **Telefon:** zwinięte „co poszło" to jedna linijka; rozwinięte — wiersz na serię, odsłaniane po jednym. Prowadzenie zapisuje każdą serię na serwer, więc lista dnia i prowadzenie pokazują to samo, a serie przeżywają zmianę telefonu.
* **Konsola:** pod ciężarem w tabeli tygodnia linijka *„zrobione: …"* — do tej pory trener nie widział w tabeli, co klient podniósł, wcale.

Moduł: `konsola/serie-wykonane.ts`. Testy: `serie-wykonane.test.ts`, pięć w `api-klienta.test.ts`, dwa w `migracja.test.ts`, kontrole w obu przeglądach, pięć nowych prób w `sprawdz-odpornosc`.

**18. „Liczba, którą widać w polu, to liczba, która się zapisze" — 23.09.2026.** Z drugiej tury testów na planie Marka X:

* W prowadzeniu pole ciężaru pokazywało szare „9" z planu; trener wpisał tylko powtórzenia (11 zamiast 10) i zapisało się **„11" bez ciężaru**. Teraz pola stoją od razu z prawdziwymi liczbami (poprzednia seria, przy pierwszej plan), a na liście puste pole z szarą podpowiedzią liczy się jak ta podpowiedź. Do pola pod palcem niczego nie wstawiamy — pierwsza wersja poprawki tak robiła i przegląd złapał, że „6" wstawione w chwili przejścia do pola sklejało się z wpisywanym „5" w „65".
* Seria bez ciężaru pisze się „11 powt.", a nie gołe „11".
* Lista po treningu pokazuje *Zrobione: …* i osobno **✎ edytuj** zamiast formularza na wierzchu. Pytanie trenera „po co tam edycja": do poprawienia literówki, która poszłaby prosto do 1RM, i dla klientów trenujących z listy, bez prowadzenia.
* Drugi zrzut trenera („✎ zmień, co poszło" z jedną parą pól) pokazywał wersję sprzed punktu 17 — serwer albo telefon nie miały jeszcze aktualizacji.

**19. Na liście żadnych szarych liczb; słaby zasięg nie gubi serii — 23.09.2026.**

* Pytanie trenera: „dlaczego przy B2 są zapisane 2 serie, skoro w ćwiczeniu są 3?". Zapisana była **jedna**, niepełna („18 kg" bez powtórzeń). Drugi wiersz był pustym wierszem na następną serię z szarymi podpowiedziami 18 × 8 — nie do odróżnienia od wpisanych. Podpowiedzi z listy zniknęły (zostały w prowadzeniu, gdzie zatwierdza się je przyciskiem), wierszy jest tyle, ile serii w planie, niepełna seria przy dobieraniu ciężaru mówi, czego brakuje, a dziura w środku pokazuje się jako „—" (także w konsoli).
* **Kolejka przyjmowała widok z odpowiedzi na każdy zapis**, także gdy za nim czekały kolejne. Przy zasięgu gasnącym w połowie kolejki telefon zostawał z widokiem bez serii wpisanej przed chwilą — i następna seria tego ćwiczenia zapisywała się na starej liście, gubiąc poprzednią. Teraz widok z serwera przychodzi dopiero po opróżnieniu kolejki. Sekcja 24 przeglądu klienta odtwarza to zerwanym połączeniem; ze starą regułą kontrola czerwienieje.

**20. Powrót do zrobionych ćwiczeń i „Tu jesteś" na liście — 23.09.2026.**

Prośba trenera: w panelach ma być możliwość powrotu do ćwiczeń oznaczonych jako zrobione, a na liście dnia po wyjściu z paneli — widać, w którym momencie treningu się jest.

* Prowadzenie pamięta teraz, **które serie są zrobione**, a nie tylko numer bieżącego kroku. Dotąd cofnięcie gubiło postęp: wszystko przed numerem kroku uchodziło za zrobione, wszystko po nim — za niezrobione.
* **Mapa dnia** nad panelem — kafelek na ćwiczenie, stan zrobione / zaczęte / tu. Dotknięcie przenosi do pierwszej niezrobionej serii ćwiczenia, a przy zrobionym — do pierwszej, do poprawki. Działa też do przodu (zajęta maszyna); przeskoczone ćwiczenie wraca na końcu.
* **Zrobiona seria otwarta ponownie** ma dopisek, przycisk *Zapisz poprawkę* i link *↩ Wróć do: …*. Po poprawce klient wraca do pierwszej niezrobionej serii, bez przerwy.
* **Lista dnia**: *▶ Tu jesteś · seria X z Y* z ramką przy bieżącym ćwiczeniu, *✓ zrobione*, *◐ zrobione X z Y serii* — każdy napis wraca do panelu. Przycisk nad listą mówi, dokąd wraca.
* Stary zapis prowadzenia (sam numer kroku) przelicza się przy wczytaniu na listę zrobionych serii — nikt nie traci zaczętego treningu przez aktualizację.

**21. Konsola tak samo na laptopie i na iPadzie — 23.09.2026.**

Trener pracuje na zmianę na laptopie i na iPadzie. Przegląd konsoli sprawdzał tylko laptop i telefon, więc iPad dostawał wersję dla myszy: przyciski przy ćwiczeniu 14×11 px (rozmiary pod palec włączały się poniżej 760 px) i objaśnienia wyłącznie w dymkach po najechaniu. Teraz rozmiary pod palec zależą od sposobu sterowania (`pointer: coarse`), objaśnienia są widocznym tekstem na obu urządzeniach (legenda nad tabelą, podpowiedzi pod przełącznikami, „treningi: 2 z 12 + 1 zaczęty" zamiast „2+1/12"), a przyciski przy ćwiczeniu widać zawsze i wszędzie w tym samym układzie. Przegląd konsoli dostał dwa nowe ekrany: iPad w pionie i w poziomie. Szczegóły: [`konsola/README.md`](../konsola/README.md#laptop-i-ipad--to-samo-tak-samo).

**22. Deload i tydzień maksów — 25.09.2026.**

Trener: „czy byłoby możliwe dodanie jako opcji w konsoli trenera dodawanie komuś do planu albo maxów albo tygodnia deloadu?". Wzór z jego periodyzacji (`dane/periodyzacja-13-tygodni.json`), decyzje trenera w trzech punktach:

* **Deload (T7)** — „jak T6, RPE niżej, bez TOP SETU". Serie i powtórzenia z T6 (z poprawkami trenera i podmianą ćwiczenia z T4–T6), RPE **o 1 niżej**, ale nie niżej niż 6 — tam zaczyna się tabela. Najpierw stało „o 2" wprost z periodyzacji; trener: „zrób tak, żeby było to spójne z resztą planu". Periodyzacja zapisuje RPE o 0,5–1,5 wyżej niż jego plany (ustalone 21.09 na kilogramach), więc jej „o 2" to w skali planu „o 1": deload waży wtedy średnio 91,5 % ostatniego tygodnia, w periodyzacji 91,4 % (12 ćwiczeń, 87–96 %). Przy „o 2" wychodziło 85 %, a akcesoria w trybie „trzymaj z bloku" 79–83 %. Test porównuje te kilogramy z `dane/periodyzacja-13-tygodni.json`. Ciężar liczy się z tabeli jak zawsze, z korektą z ocen klienta. Każdą liczbę da się poprawić ręcznie; w deloadzie nie ma », T ani R.
* **Maksy (T8)** — 1 × 1 @ RPE 10, **wszystkie boje jednego dnia**. Domyślnie przysiady, wyciskanie leżąc i martwe ciągi z planu (lista od TOP SETU), po razie; trener zaznacza w konsoli inne. Ciężar w planie to obecne 1RM — dla klienta „1RM teraz", punkt odniesienia. Bez ocen „za łatwe/za trudne".
* **Kolejność jak w periodyzacji** — najpierw deload, potem maksy. Oba to osobne przełączniki „Po cyklu". Klucze tygodni są stałe (7 deload, 8 maksy), żeby włączenie deloadu po fakcie nie przenosiło wpisów klienta; bez deloadu maksy są na ekranie tygodniem siódmym.
* **Wynik maksów wchodzi do nowego cyklu sam** — „Nowa wersja" wstawia go jako serię maksymalną (`zTygodniaMaksow`, konsola pisze skąd), a propozycja z serii roboczych dla tego boju znika.
* Tygodnie po cyklu leżą osobno (`tygodnieDodatkowe`): średnie, normy objętości, porównania cykli i historia liczą się dalej z sześciu tygodni pracy. Stres deloadu i maksów nie jest oceniany normą.

Przy okazji wyszedł błąd sprzed tej zmiany: po podmianie ćwiczenia od T4 (`cwiczenieIdOverride`) wpis klienta zapisywał się pod starym ćwiczeniem ze slotu, a telefon pokazywał go jako „wcześniej tutaj". Serwer zapisuje teraz ćwiczenie z danego tygodnia.

**23. Hipertrofia jako trzecia część planu — 25.09.2026.**

Zaplanowana 21.09 („możemy zrobić osobną progresję 12/14"), dodana na prośbę trenera. Przełącznik *Część planu* ma trzecią pozycję, **hipertrofia (12/14)**:

* **Bój główny** — 4 × 12 → 13 → 14 na RPE 8, w drugim bloku to samo na RPE 9. Liczby z szablonów „Hipertroficzny 1–4 dni" z aplikacji trenera w Base44 (pozycja A); tamte szablony stoją na tej samej skali RPE co nasze („Klasyczny 2 dni" to dokładnie nasza `objętość`).
* **Bez TOP SETU** — tak jest we wszystkich czterech szablonach. Wpisane ręcznie RPE TOP SETU dalej wygrywa.
* **Akcesoria 12/14** — trzecia kolumna obok 8/10 i 6/8: coeff ≥ 0,75 zaczyna od 12, lżejsze od 14, plus tydzień w bloku (+0, +1, +2), nie ponad 15 z tabeli. Serie i RPE akcesoriów jak w pozostałych częściach (3 serie, RPE 8 / 9).
* **Eksport** — arkusz 5.18 zna dwie części, więc przy hipertrofii powtórzenia akcesoriów jadą wpisane wprost (jego automat liczyłby 8/10).

**24. Szablony z Base44 w konsoli — 25.09.2026.**

Trener: „dodaj szkielety z planów z Base44 do wykorzystania w konsoli trenera". Przy planie jest lista **Szablon z Base44** — 14 pozycji z `dane/szablony-base44.json`, generowanych do `silnik/src/dane/szablony.ts` (serwer w Dockerze nie ma katalogu `docs/`).

* Szablon rozpisuje **układ**: dni, numerację (A1, A2, B1/B2…), kategorię każdej pozycji i TOP SET tam, gdzie stał w Base44. Pozycje za ostatnią zostają bez numeru, jak zapas w pustym planie.
* *(Wycofane 26.09.2026 — punkt 30.)* Przy czterech szablonach, dla których trener miał w Base44 zapisany plan (`dane/szkielety-base44.json`), wchodzi też **dobór ćwiczeń** — nazwy zmapowane na BAZĘ (`High Bar Back Squat` → `Barbell back squat` itd.). Trzy bez odpowiednika (`Close-Grip Bench Press`, `Machine Shoulder Press`, `Plank`) zostają pustą pozycją z kategorią; konsola pisze, ile pozycji czeka i których nazw brak. Test pilnuje, że każde zmapowane ćwiczenie pasuje kategorią do swojej pozycji.
* **Liczb z Base44 szablon nie przenosi.** Serie, powtórzenia i RPE liczy „Część planu"; szablon ustawia ją na start: klasyczne i rozbudowane → objętość, „(część 2)" → intensywność, hipertroficzne → hipertrofia.
* Plan, w którym klient już coś wpisał, jest historią — serwer odmawia i radzi nową wersję. Przy planie z wybranymi ćwiczeniami konsola pyta przed nadpisaniem.

**25. Rozgrzewka na początek dnia — 25.09.2026.**

Trener: „rozgrzewkę też dajmy jako opcjonalne miejsce, żeby wrzucić komuś przed planem (widoczne np. na początku dnia 1 / dnia 2 itd.)". Przy każdym dniu w konsoli jest *+ rozgrzewka*: tekst wiersz po wierszu i link do filmu (tylko http(s) — trafia wprost do `href` u klienta, serwer sprawdza). Ta sama w każdym tygodniu, w deloadzie też; w dniu maksów nie, bo tam każdy bój ma własną instrukcję rozgrzewki. Klient widzi kartę na początku dnia — rozwiniętą, dopóki nic nie zrobił — i w pierwszym panelu prowadzenia. Nie wchodzi do stresu ani objętości.

**26. Ręczny ciężar zostaje do końca planu — 26.09.2026.**

Trener przy „SLDL balance" (progresja `ręczne ustawienie`): „skoro są odgórnie ustalone powtórzenia i serie, to jak klient dobierze sobie ciężar w T1, to zostaje on do końca planu". Dotąd bez wpisu trenera w danym tygodniu stało „dobierz" i klient wybierał ciężar co tydzień od nowa.

* Serwer zapisuje przy wpisie serii ciężar wybrany przez klienta (`ciezarKlienta`, najcięższa seria, razem z ćwiczeniem) w parametrach tego tygodnia.
* Silnik szuka wstecz: wybór klienta albo wpis trenera z najbliższego wcześniejszego tygodnia; w tym samym tygodniu klient przed trenerem (jego ciężar już się odbył). Wpis trenera w danym tygodniu wygrywa zawsze. Tylko przy tym samym ćwiczeniu — podmiana przerywa przenoszenie. Działa też w deloadzie.
* Klient widzi „2 kg · jak w T1", konsola pod pustym polem „z T1 · wybór klienta" albo „z T1 · Twój wpis". Eksport wpisuje ten ciężar do arkusza. Nowa wersja planu zaczyna czysto.
* Ciężaru nie podnosimy samoczynnie: SLDL balance i Dead bug mają w BAZIE skok 0 kg. Oceny klienta zmieniają przy tej progresji powtórzenia (±1 na ocenę), jak dotąd.
* Wpisy sprzed tej zmiany nie mają zapisanego wyboru — wystarczy raz wpisać ciężar (klient przy serii albo trener w konsoli).

**27. Bój główny z decyzji trenera — przycisk „G" — 26.09.2026.**

Trener: front squat w planie Marka X „liczy się jak ćwiczenie akcesoryjne — chciałbym, żeby liczył się jak ćwiczenie główne". Front squat ma coeff 1,0, ale stał na B1, a reguła (22.09) mówi: bój główny to pozycja A **i** ćwiczenie złożone. Reguła zostaje — bez niej każdy przysiad z B1 w szablonach dostałby 6 × 6 — a trener dostał przy każdym ćwiczeniu przycisk **„G"**: podświetlony, gdy ćwiczenie liczy się jak bój; kliknięcie przestawia rolę w obie strony (`SlotPlanu.bojGlowny`, pusto = reguła). Zmiana roli czyści serie, powtórzenia i RPE tego ćwiczenia, żeby weszła progresja nowej roli; oceny i ręczne ciężary zostają. Kontrola „akcesorium na pozycji A" milknie, gdy trener rozstrzygnął sam.

Przy okazji dwie poprawki: „progresja 5.18" i kopiowanie tygodnia gubiły ciężar wybrany przez klienta (punkt 26), a eksport do arkusza rozpoznawał bój po samej literze A — funkcją z importu, która po cichu pomijała `coeff`.

**28. Ocena przy każdej serii i lżejsza następna seria — 26.09.2026.**

Trener: „ktoś pierwszą zrobił normalnie, ale w drugiej stwierdził, że jest za ciężkie — wtedy aplikacja powinna mu już na 3 serii pokazać ułatwioną wersję. Z drugiej strony nie chciałbym, żeby ktoś pomyślał, że w każdej serii musi kliknąć OK".

* W panelu prowadzenia każda seria poza ostatnią ma **`Za trudne` / `Za łatwe`** bez `OK`, z dopiskiem „Jeśli jest OK — nic nie klikaj". Ostatnia seria ma pełną ocenę jak dotąd.
* Ocena przy serii zmienia **następną serię tego treningu**: ciężar faktycznie wpisany ±5 %, zaokrąglony do skoku ćwiczenia (`skokKg` z BAZY, w widoku klienta od tej zmiany). Gdy zaokrąglenie wróciłoby do tej samej liczby, schodzi o jeden skok. Duża liczba „Ciężar" pokazuje wtedy ciężar po korekcie z dopiskiem „w planie …", a nad polami stoi zdanie, skąd ta liczba. To podpowiedź w polu — klient zmienia ją jak każdą inną; silnik niczego tu nie liczy od nowa.
* Ta sama ocena idzie do trenera i do następnych tygodni bez zmian (jedna na ćwiczenie w tygodniu, ostatnia wygrywa) i przy ostatniej serii stoi zaznaczona.
* **Duża liczba „Ciężar" w panelu idzie za polem** także bez oceny — trener: „zmieńmy tak, że duża liczba też się zmienia". Druga seria na 45 kg przy planie 50 → trzecia pokazuje 45 z dopiskiem „w planie 50". Powtórzenia zostają z planu; przy maksach duża liczba to dalej obecne 1RM.
* Korekta trzyma się miejsca w treningu (`prowadzenie.korekty`), więc przeżywa przerwę i zamknięcie aplikacji; ręcznie wpisany ciężar w następnej serii ją wyłącza.

Przy okazji błąd: dotknięcie oceny przy ostatniej serii przerysowywało panel i czyściło wpisane, jeszcze niezapisane liczby.

**29. Poprawki wyglądu przed samodzielnym testem — 26.09.2026.**

Trener poprosił o ocenę wyglądu, a potem o poprawki z dwóch pierwszych grup („popraw 1 i 2"; logo jeszcze nie ma, marka zostaje na później).

* **Błędy:** w panelu na telefonie ciężar wjeżdżał na powtórzenia („77,5 kg6"); link filmu przy rozgrzewce miał domyślny niebieski z podkreśleniem; w konsoli znacznik „TS" przy A1 był ucięty do „T" pod listą ćwiczeń (teraz stoi pod numerem, razem z „RPE"); podpis strony startowej konsoli mówił, że plan idzie do klienta jako arkusz.
* **Lista tygodni:** rozwinięty tydzień następnego treningu, reszta zwinięta do linijki z licznikiem; skład dnia na kafelku; następny trening z ramką.
* **iPad:** większa podstawa czcionki i szersza kolumna.
* **Jedna czcionka** zamiast pisma maszynowego przy podpisach i liczbach; cyfry o równej szerokości.
* **Tytuł u klienta:** samo imię, cykl w podtytule.

Szczegóły: `klient/README.md`, „Ekran startowy i wygląd". Przegląd klienta sprawdza zwijanie tygodni, tytuł i kolumny panelu na ekranie 360 px (ta kontrola jest czerwona na starym układzie).

**30. Szablony pod nazwami z Base44, bez ćwiczeń — 26.09.2026.**

Trener po pierwszym użyciu: „nazwy się nie zgadzają, są jakieś wersje »z ćwiczeniami«, gdzie nie powinno być czegoś takiego, a jak wybrałem jeden z takich, to rozpisały się głupoty — jakieś pomijanie kolejności ćwiczeń (bez D1) i nie wiem, skąd akurat takie ćwiczenia są wybrane".

* **Nazwy.** Konsola pokazywała wewnętrzne nazwy z kodu Base44 („FBW 3 dni – 3 główne ćwiczenia", „FBW 6 ćwiczeń złożonych" — bez liczby dni, choć ma trzy). Trener zna je z ekranu „Wybierz szablon" jako **Klasyczny / Rozbudowany / Hipertroficzny – 1…4 dni** i kontynuacje „(cz. 2)". Mapę id → nazwa i opisy rodzin wyciągnięto z tego samego publicznego pakietu: [`dane/rodziny-szablonow-base44.json`](dane/rodziny-szablonow-base44.json). Lista w konsoli jest pogrupowana w te rodziny, w kolejności z Base44. Ekran Base44 pokazuje 24 warianty, ale treść ma tylko 14: dziesięć kontynuacji „(cz. 2)” (Klasyczny 1 i 4 dni, cały Rozbudowany i Hipertroficzny) Base44 po cichu zastępuje szablonem „Klasyczny – 3 dni” (`rejestr[id] || fbw_3dni_6w` w opublikowanym kodzie). Kontynuacja ma ten sam układ co część 1, a różni się progresją boju i akcesoriami 6–8 zamiast 8–10 — u nas robi to przełącznik „Część planu: intensywność (cz. 2)” przy dowolnym szablonie.
* **Bez ćwiczeń.** Dobór w czterech szablonach pochodził z pięciu zapisanych planów w „Głównej wersji 10.05.26r." — trener go nie rozpoznał, a trzy nazwy spoza BAZY zostawiały w środku dnia puste pozycje. Szablon rozpisuje teraz tylko układ: dni, numerację, kategorie i TOP SET. `szkielety-base44.json` zostaje w `docs/dane/` jako zapis, generator go nie czyta.
* **Cały szkielet na ekranie.** Konsola chowała puste pozycje po ostatnim ćwiczeniu, więc po szablonie widać było samo A1 w każdym dniu. Pozycja z kategorią to część szkieletu i jest widoczna; chowany jest tylko zapas bez kategorii. Przegląd ekranów sprawdza osiem wierszy dnia I z kategoriami (na starej regule — jeden).

Układ czternastu szablonów (pozycje, kategorie, TOP SET) jest identyczny jak przed zmianą — sprawdzone porównaniem starego i nowego pliku.

**31. Kontynuacja to część planu, nie osobny szablon; hipertrofia cz. 2 — 27.09.2026.**

Trener: „skoro mamy przełącznik na intensywność, co jest 2 częścią planu, to usuńmy z szablonów te wersje (cz. 2), bo to jest mylące — tylko upewnijmy się, że wszystkie szablony mają swój odpowiednik jako cz. 2".

* **Lista szablonów** ma 12 pozycji: Klasyczny, Rozbudowany i Hipertroficzny po 1–4 dni. Dwie kontynuacje „(cz. 2)” zniknęły — w Base44 miały ten sam układ co część 1, a u nas drugą część ustawia *Część planu*.
* **Hipertrofia cz. 2** — czwarta wartość `CzescPlanu` („hipertrofia 2”). Każdy szablon ma teraz drugą część: siłowe → *intensywność (cz.2)*, hipertroficzne → *hipertrofia (cz.2)*; test liczy każdy szablon w obu częściach.
* **Liczby hipertrofii** (trener, 27.09): cz. 1 — bój 4 × 12 → 13 → 14, akcesoria złożone 10–12, izolacje 12–14 (do 27.09 było 12/14, czyli 12–14 i 14–15); cz. 2 — bój 4 × 10 → 11 → 12, akcesoria 8–10 i 10–12. RPE jak dotąd: 8 w pierwszym bloku, 9 w drugim; bez TOP SETU. Plany zapisane jako „hipertrofia” liczą się od razu nowymi zakresami.
* Eksport do arkusza wpisuje przy obu częściach hipertrofii powtórzenia wprost — arkusz 5.18 zna tylko dwie części siłowe.

**32. Bój siłowy w planie hipertroficznym — przycisk „S” — 27.09.2026.**

Trener: „dodaj taką opcję, żeby móc zrobić standardowo ćwiczenie główne razem z TOP SETEM w hipertrofii”.

* Przy boju głównym w planie hipertroficznym jest przycisk **„S”** (`SlotPlanu.bojSilowy`). Taki bój liczy się jak w części siłowej tego samego etapu: hipertrofia cz. 1 → *objętość* (6×6 @6,5 … 6×3 @7,5), cz. 2 → *intensywność* (6×4 @7 … 6×2 @8), a jego TOP SET dostaje RPE części siłowej (od T2: 6 → 8 albo 7 → 9). Akcesoria zostają hipertroficzne.
* Włączenie „S” stawia przy tym ćwiczeniu TOP SET dnia, wyłączenie go zdejmuje; liczby boju czyszczą się jak przy „G”, żeby weszła właściwa progresja. Zdjęcie roli boju („G”) zdejmuje też „S”.
* Poza hipertrofią znacznik nic nie zmienia (`czescBoju` w `szablon-boju.ts`). Testy silnika sprawdzają obie części i to, że bez znacznika reguły się nie zmieniły (na wyłączonej regule są czerwone); przegląd konsoli klika „S” tam i z powrotem.
* Przy okazji: zmiana *Części planu* przerysowuje tabelę od razu — przycisk „S” pojawia się i znika bez przeładowania.

**33. „Wpisz progresję” i pytanie przy zmianie części planu — 27.09.2026.**

* Przycisk „progresja 5.18” nazywa się **„wpisz progresję”** (trener: nazwa starego arkusza „dziwnie tam wygląda”); podpowiedź i pytanie przed nadpisaniem mówią, z której części planu biorą się liczby.
* Pułapka: po „wpisz progresję” liczby boju stoją w polach na stałe i wygrywają z częścią planu — zmiana cz. 1 → cz. 2 zostawiała bój z liczbami cz. 1. Teraz zmiana „Części planu” przy boju z wpisanymi liczbami pyta, czy przepisać je nową częścią. „Tak” przepisuje **tylko boje główne** (`zastosujProgresje(..., { tylkoBoje: true })`, tryb `progresja-bojow`); ręczne poprawki przy akcesoriach zostają. „Nie” zostawia wpisane liczby.
* Przegląd konsoli sprawdza obie odpowiedzi; test silnika — że akcesorium z ręczną poprawką zostaje nietknięte.

**34. Kilka TOP SETÓW w jednym dniu — 27.09.2026.**

Trener przy szablonie Rozbudowanym: „A1 barbell bench press robię TOP SET i później robocze, a następnie B1 low bar squat i tam też na początek TOP SET i później robocze".

* **Silnik:** `plan.topSety` może mieć kilka włączonych wpisów w dniu, każdy przy swoim ćwiczeniu (`slotPositionId`). `TopSetWyliczony` niesie `positionId`, TOP SETY idą w kolejności tabeli, dwa wpisy przy jednym ćwiczeniu liczą się raz, a każdy TOP SET to +1 seria w podsumowaniu dnia.
* **Konsola:** „T” przełącza TOP SET przy tym jednym ćwiczeniu — kliknięcie w innym wierszu dokłada drugi, zamiast go przenosić. Nad tabelą pasek na każdy TOP SET (z numerem ćwiczenia), każdy z własnym RPE tygodnia i „✕”.
* **Telefon:** TOP SET stoi tuż przed swoim ćwiczeniem — na liście dnia (karta „TOP SET · A1”), w prowadzeniu (przed pierwszą rundą swojej grupy) i na mapie dnia (kafelek „TS” w grupie ćwiczenia). Przerwa po nim liczy się z jego ćwiczenia. Widok klienta ma `topSety`; `topSet` (pierwszy) zostaje dla telefonów ze starą wersją aplikacji w pamięci.
* **Eksport:** arkusz ma jeden wiersz TOP SETU na dzień — idzie pierwszy w kolejności tabeli.
* Testy silnika (dwa TOP SETY, kolejność, podsumowanie), API klienta i eksportu; przegląd konsoli (drugi „T” dokłada, kolejny zdejmuje tylko swój) i przegląd klienta (dwa TOP SETY przed swoimi ćwiczeniami, w prowadzeniu z przerwą 3 i 2 min).

**35. Bieg na tempie i czasie, nowy zestaw jednostek; oddech z objaśnieniami — 27.09.2026.**

Trener: „zakresy tętna są tylko poglądowe, a rozpiska dotyczy głównie tempa na kilometr i czasu. Popraw nazwy treningów biegowych, bo mamy tylko spokojny i ciągły — może jakiś progowy / interwały? Co do treningu oddechowego — pokazuje się tak, że za bardzo nie wiadomo, o co chodzi”.

* **Zestaw jednostek** (trener wybrał „stały zestaw”): przy N biegach w tygodniu pierwsze N z listy — spokojny · progowy (dawny „interwał progowy” z arkusza: odcinki 4 min, 2 min truchtu, 20 min rozgrzewki i schłodzenia) · długie wybieganie · interwały (nowe: odcinki 3 min w tempie interwałowym, 2 min truchtu) · spokojny z przebieżkami (nowe: 6 × 20 s). W arkuszu przy 2–3 biegach były tylko spokojne i „ciągły”, progowy dopiero przy piątym, a tempa interwałowego nie używała żadna jednostka. „Bieg ciągły” wypadł z zestawu. Wzory minut, mnożniki tygodni i liczby biegów, tempa i strefy — bez zmian; złoty test porównuje teraz jednostki z arkuszem po rodzaju (spokojny, długie, progowy), nie po miejscu na liście. Stary układ zostaje w `bieg-parametry.json` (`jednostki_z_arkusza`).
* **Rozpiska na tempie i czasie:** silnik oddaje przy jednostce nazwę, przebieg krok po kroku (`kroki`) i tempo spokojne rozgrzewki; telefon pokazuje duże tempo na kilometr i czas, a dystans i **tętno orientacyjnie** drobno. Tygodnie biegu zwijane, rozwinięty bieżący. Konsola: krótkie nazwy (progowy 4×4′, interwały 5×3′), kolumna „tętno ≈”, lista temp tylko używanych.
* **Oddech:** klient widzi przy każdym kroku dawki, jak go zrobić — teksty trenera z zakładki ODDECH arkusza (Breathe Light, bezdech w marszu, przerwa, kadencja 4–6), ramkę „Przerwij, gdy…”, zwinięte „Jak zmierzyć TWOT?” i „Kiedy powtórzyć test?”, swój wynik TWOT i poziom. Teksty w `oddech-progi.json` (`instrukcje`), generowane do `OBJASNIENIA_ODDECHU`; jedno zdanie retestu zmienione („Nowy wynik przekaż trenerowi” — w konsoli wpisuje go trener).
* Testy silnika: zestaw przy 1–5 biegach, bieg progowy, interwały, przebieżki; przegląd klienta: nazwy, tempo /km, tętno orientacyjnie, technika oddechu.

**36. Poprawki w BAZIE z testu trenera — 27.09.2026.**

* **Reverse Nordic** (EX-0169) i **Glute crusher** (EX-0092): progresja `kg` → `masa ciała` („każe mi dobrać ciężar, a to ćwiczenie jest bez ciężarowe”). Bez pola ciężaru i bez serii maksymalnej; oceny klienta zmieniają powtórzenia (±1), jak przy innych ćwiczeniach na masie ciała. Ćwiczeń bez serii maksymalnej jest teraz 27 ze 165.
* **Halfkneeling wood chopper** (EX-0095) dopisany do ćwiczeń jednostronnych — serie i powtórzenia na stronę, klient widzi „na stronę”. Jednostronnych jest 31.
* Zmiany w `docs/dane/baza-cwiczen.json` i `jednostronne.json`, generowane do katalogu silnika; testy pilnują wszystkich trzech.

**37. Lista dnia: kolejne serie proponują się same — 27.09.2026.**

Trener (zrzut z listy dnia, Deadlift po serii kalibrującej): „jeżeli ktoś chciałby ćwiczyć w takim widoku, to po wpisaniu pierwszej serii reszta powinna mu się sama uzupełnić".

* Po pierwszej pełnej serii kolejne wiersze dostają liczby poprzedniej serii jako **propozycję** — przerywana ramka, blade liczby, przycisk ✓ — tak jak panel prowadzenia podsuwa poprzednią serię.
* Zapis dopiero po ✓, po poprawce liczby (zapisuje się cały wiersz, jak stoi) albo po „✓ Pozostałe serie tak samo”. Wcześniejsza uwaga z testów (podpowiedzi nie do odróżnienia od wpisanych serii) zostaje uszanowana: propozycja wygląda inaczej niż zapis, a „Zrobione: …” liczy tylko zatwierdzone serie. Przed pierwszą serią pola dalej są puste.
* Przegląd klienta (sekcja 28): pola puste przed pierwszą serią, 5 propozycji po pierwszej i żadna na serwerze, ✓ zapisuje jedną, poprawka zapisuje wiersz i przestawia dalsze propozycje, „Pozostałe serie tak samo” zapisuje resztę.

**38. Panel prowadzenia bez „OK” — 27.09.2026.**

Trener: „w 3 serii nie musimy dodawać tego OK — brak kliknięcia czegokolwiek oznacza ćwiczenie jako OK”, a potem: „możemy zostawić to OK w widoku całego planu, a nie w panelach — w panelach tylko nie ma ono sensu”.

* **Panel:** przy każdej serii, także ostatniej, tylko „Za trudne” i „Za łatwe” (na pół szerokości) i dopisek „Jeśli jest OK — nic nie klikaj” (przy ostatniej „Jeśli było OK — nic nie klikaj. Ocena zmienia ciężar w kolejnych tygodniach.”). Pytanie zawsze „Za ciężko albo za lekko?”.
* **Lista dnia:** bez zmian — „Za trudne / OK / Za łatwe”.
* Ćwiczenie bez oceny zapisuje się przy końcu treningu jako OK, jak dotąd. Licznik nad treningiem: „X z N ćwiczeń zaczętych” (wpisana seria albo ocena) zamiast „ocenionych”.
* Przegląd klienta: panel przy ostatniej serii bez „OK” z dopiskiem, lista z „OK” pośrodku.

**39. Serie maksymalne: „Zapisz”, a 1RM z treningu da się przywrócić — 02.10.2026.**

Trener (zrzut z iPada): „1RM jest już widoczne z boku, po prawej od okienek, a chciałbym, żeby było gdzieś indziej, bo wpisanie serii maksymalnej zmienia ten RM bezpowrotnie — jak coś wpiszę testowo i usunę, to się zapisuje jako seria do 1RM. Może dodajmy przycisk »zapisz« albo małą informację, że dany 1RM był liczony z serii”.

* **Skąd 1RM — nad polami:** „Twoje 1RM teraz: X kg” i źródło (seria z treningu z RPE, seria maksymalna albo trener). Kolumna obok pól („1RM z serii”) pokazuje tylko podgląd z wpisanych liczb — blady, z „≈”, dopóki seria nie jest zapisana. Podgląd liczy telefon z tabeli %1RM silnika, którą serwer dosyła w widoku (`procent1RM`).
* **„Zapisz serię”:** plan zmienia się dopiero po przycisku (albo Enter w polu powtórzeń). Przy ćwiczeniu z 1RM z treningu nad przyciskiem stoi, że zapis je zastąpi, a usunięcie serii przywróci. Powyżej 15 powtórzeń przycisku nie ma, a przy polu stoi, co zrobić.
* **Przywracanie:** seria maksymalna z telefonu zapamiętuje kalibrację, którą zastąpiła (`zastapionaKalibracja`, także przez kolejne poprawki). „Usuń serię — wróci 1RM z treningu (X kg)” ją przywraca. Usunięcie serii bez kalibracji pod spodem pyta o potwierdzenie.
* Przy okazji: etykiety równo nad polami, strzałka filmu w kolorze akcentu.
* Testy API (zapamiętanie, poprawka, przywrócenie, tabela %1RM), kształtu planu (uszkodzone `zastapionaKalibracja`); przegląd klienta: bez „Zapisz” plan stoi, podgląd obok, zapis, „Usuń serię” przywraca 1RM z treningu, 16 powtórzeń bez przycisku.

**40. Rozgrzewka rampą i ocena TOP SETU — 02.10.2026.**

Trener (zrzut z iPada, TOP SET B1 Barbell low bar squat): „przy ćwiczeniach głównych / złożonych, zarówno jak zaczynają się serią albo TOP SETEM, nie powinna być informacja, żeby zrobić rozgrzewkę stopniowo, zakładając coraz większy ciężar (rampa)? Poza tym przy samym TOP SECIE nie dajemy opcji za łatwe / za trudne albo dopisania innego ciężaru? Nie wiem, jak by to wpłynęło na resztę serii roboczych, bo może być tak, że dla kogoś TOP SET byłby za ciężki, a robocze byłyby okej”. Wybrał rampę z ciężarami i ocenę TOP SETU jako samą informację dla siebie.

* **Rampa** (`silnik/src/rampa.ts`): lekko × 8–10, 50 % × 5, 70 % × 3, 85 % × 1 ciężaru pierwszej ciężkiej serii — TOP SETU, a bez niego pierwszej serii roboczej — zaokrąglone do skoku ćwiczenia; krok, który nie rośnie albo dochodzi do celu, odpada. Przy ćwiczeniu z TOP SETEM, boju głównym (G, S) i złożonym z BAZY (coeff 1,0), z progresją w kg, przy pierwszym wystąpieniu w dniu; nie w tygodniu maksów (tam jest własna instrukcja). Serwer dokłada `rampa` do ćwiczenia w widoku klienta. Telefon: ramka na liście (do zaczęcia ćwiczenia) i w panelu (TOP SET albo seria 1).
* **TOP SET od klienta:** pole z ciężarem z planu i „Za trudne” / „Za łatwe” (bez „OK”) w panelu, te same przyciski i „Inny ciężar niż w planie?” na liście. `POST /topset` → `slot.tygodnie[t].topSetKlienta` (`feedback`, `kg` — tylko gdy inny niż w planie); oba puste kasują wpis, „OK” i TOP SET, którego nie ma, dostają 400. Silnik tego nie czyta: serie robocze i kolejne tygodnie bez zmian. Progresja i kopiowanie tygodni wpisu nie gubią i nie rozmnażają, nowy cykl go nie przenosi, zapis trenera przejmuje go przy konflikcie. Konsola: „klient: za trudne · zrobił X kg” na pasku TOP SETU w tym tygodniu.
* Testy: silnik (kroki rampy, kiedy rampa, progresja zachowuje wpis TOP SETU), API (rampa w widoku, zapis i brak wpływu na robocze, „OK” i brak TOP SETU odrzucone), kształt planu; przegląd klienta (rampa na liście i w panelu, ocena i inny ciężar TOP SETU idą do trenera, robocze bez zmian, rampa boju bez TOP SETU); przegląd konsoli (wpis klienta zostaje po zapisie trenera i stoi na pasku).

**41. „Za łatwe” w T1–T2 z wyjaśnieniem; ocena na liście poprawia dalsze serie dnia — 02.10.2026.**

Trener: „czy nie powinno być tak, że ktoś ma 6 serii wyciskania i na 3 serii zaznaczy, że ćwiczenie jest za lekkie, to arkusz poprawia mu nie tylko kolejne tygodnie, ale już kolejne serie w tym dniu? Możemy też pomyśleć o informacji, gdy ktoś będzie chciał zmienić ćwiczenie na »za lekkie« na początku planu, w 1 albo 2 tygodniu — pierwsze tygodnie nie powinny być skrajnie ciężkie, ćwiczenie i tak progresuje trudnością do ostatniego tygodnia, a jak oznaczy od razu, że jest za lekkie, to na koniec może się okazać za ciężkie. Mimo wszystko musi mieć możliwość zmiany, a to tylko informacja”.

* **Dalsze serie dnia:** w panelu prowadzenia od 26.09 (ocena przy serii 3 → seria 4 ±5 %, dalsze idą za nią). Na liście dnia ocena zmieniała dotąd tylko kolejne tygodnie — teraz propozycje dalszych serii idą ±5 % od ostatniej wpisanej, z dopiskiem skąd. Wspólny zapis z panelem (`prowadzenie.korekty`, `korektaZListy`).
* **Okienko w T1–T2** przy „za łatwe” (panel i lista): „Plan dopiero się rozkręca” — tygodnie celowo lżejsze, RPE tego tygodnia i zapas powtórzeń, skutek dla najtrudniejszego tygodnia, „Jeśli zapasu było wyraźnie więcej — śmiało, oznacz. To Twój plan.” Przyciski „Oznacz »za łatwe«” / „Zostaw bez zmiany”; raz na ćwiczenie w tygodniu; własne okienko zamiast `confirm()` (na iPadzie systemowe ma adres strony w nagłówku i nie mieści akapitów).
* Przegląd klienta: okienko w T1, „Zostaw bez zmiany” niczego nie zapisuje, po „Oznacz” ocena zapisana i dalsze serie 5 % ciężej, „Pozostałe serie tak samo” zapisuje skorygowane.

**42. Dobór ćwiczeń jednym kliknięciem — 02.10.2026.**

Trener: „czy możemy dodać funkcję, że w konsoli po wybraniu szablonu albo po wpisaniu kategorii w wybranej przeze mnie kolejności będzie możliwość wygenerowania ćwiczeń automatycznie jednym kliknięciem? Miałem już taką funkcję w Base44”. Import innych arkuszy — odłożony (trener i tak planuje nową BAZĘ i filmy).

* **Reguła** wyciągnięta z generatora Base44 (funkcja `tEe` w opublikowanym pakiecie: kategoria slotu; `is_main` → klasa „main” z preferencją listy klasycznych bojów; B → coef ≥ 0,65 bez „main”; reszta → coef ≤ 0,5; losowanie) i przełożona na BAZĘ: A = coeff 1,0 (najpierw `KLASYCZNE_BOJE`), B = 0,75, C–E = ≤ 0,5, najbliższy coeff, gdy kategoria nie ma docelowego. OHP i wiosłowanie (0,75) na A nie trafiają — bojem głównym jest tylko 1,0 (decyzja z 22.09).
* **Decyzje trenera** (inaczej niż w Base44, gdzie nic nie pilnowało powtórek): nigdy dwa razy w dniu; bój na A może wrócić w innym dniu; akcesoria bez powtórek w planie, dopóki kategoria ma inne (reguła pozycji ma pierwszeństwo przed „bez powtórek”); bez „DO WERYFIKACJI”; „do pustych” zostawia wybory trenera, „wszystko od nowa” pyta i omija pozycje z wpisami klienta.
* `silnik/src/dobor-cwiczen.ts` (`dobierzCwiczenia`, `kandydaci`), `POST /api/plany/:id/dobierz` (zwraca obraz planu i `dobor`: ile wstawiono, gdzie nie było kandydata, ile pozycji z historią zostało), konsola: pole „Dobierz ćwiczenia” z przyciskami *do pustych* / *wszystko od nowa* i podsumowaniem.
* Testy silnika (12 szablonów × 20 losowań: pozycje wypełnione z własnej kategorii, bez powtórek w dniu, bez „DO WERYFIKACJI”; reguła A/B/C–E; akcesoria bez powtórek; „od nowa” omija historię; najbliższy coeff), API (do pustych, drugi raz nic, od nowa omija pozycję z oceną klienta), przegląd konsoli (20 pozycji z ich kategorii, A1 trenera zostaje, „od nowa” pyta).

**43. Progresja ćwiczeń pauzowanych; jaśniejsze zdanie pod rampą — 02.10.2026.**

Trener (zrzut panelu B1 Bench press paused 3sec liczony 3×8 @8 jak akcesorium i zrzut swojej periodyzacji: Blok I/II po 5 tygodni + deload, max out w 13.): „ćwiczenia paused bench press i paused squat mają w tej periodyzacji swoją własną progresję — możemy ją zaimplementować?” oraz „»tych serii nie wpisujesz« popraw, żeby było jaśniej, że chodzi o te rozgrzewkowe”.

* **Decyzje trenera:** cz.1 = Blok I, cz.2 = Blok II; T1–T5 jak w arkuszu, T6 jak T5 (deload T7 wychodzi z T6); pauzowany przysiad w cz.1 jak RAW squat z Bloku I; dodać „Barbell low bar squat paused 3sec” do BAZY (EX-0205: Lower push, 1,0, skok 2,5, kg, bez filmu); zawsze, na każdej pozycji; „G” robi zwykły bój.
* **Silnik:** `PAUZOWANE` (EX-0022, EX-0205), `PROGRESJA_PAUZY`, `pauzaSlotu`, `parametrySzablonu` (jedno źródło dla planu i „wpisz progresję”); ciężar liczony jak bój (z RPE co tydzień); slot niesie `pauza`. „wpisz progresję” i przepisanie po zmianie części obejmują pauzowane. Ciężary z silnika zgadzają się z arkuszem trenera (85 · 87,5 · 90 · 92,5 kg przy 1RM 102).
* **Konsola:** znacznik „P” przy Lp., „G” przy pauzowanym przełącza progresja pauzowana ↔ zwykły bój, „R” ukryte (ciężar i tak z RPE). `/api/cwiczenia` niesie `pauza`. **Eksport:** pauzowane jadą do arkusza z powtórzeniami i ciężarem wpisanymi wprost.
* **Rampa:** „Tych serii nie wpisujesz” → „Serii rozgrzewkowych nie wpisujesz — wpisujesz dopiero serie robocze” (przed TOP SETEM: „— zapis zaczyna się od TOP SETU”), osobną linijką.
* Plany z liczbami wpisanymi wcześniej „wpisz progresję” trzymają stare liczby akcesorium, dopóki trener nie kliknie „wpisz progresję” jeszcze raz.
* Testy silnika (`pauzowane.test.ts`: obie części, oba ćwiczenia, A1/C1, „G”, hipertrofia i „S”, deload, wpisanie i przepisanie progresji), eksportu, liczników BAZY (166, bez filmu 28); przegląd konsoli („P” i 5×3 @7,5 na A1, „G” → 6×6 i z powrotem), przegląd klienta (nowe zdanie pod rampą).

**44. Ocena w panelu należy do jednej serii — 02.10.2026.**

Trener (zrzuty: Poliquin step up, „za trudne” przy serii 1 → seria 2 na 10 kg, ale przy serii 2 „Za trudne” dalej zaznaczone): „przeszło do następnej serii to oznaczenie »za trudne«, a powinno się zresetować na neutralne, gdyby ktoś chciał znowu oznaczyć »za trudne«, żeby ciężar zmniejszył się ponownie”.

* Panel trzyma ocenę każdej serii osobno (`prowadzenie.ocenySerii`): przy następnej przyciski neutralne; ponowne „za trudne” obniża kolejną serię jeszcze raz (65 kg po 67,5). Dotąd zaznaczenie pochodziło z oceny ćwiczenia na tydzień, więc drugie dotknięcie zdejmowało ocenę zamiast obniżać ciężar.
* Do trenera i do kolejnych tygodni idzie ocena z najpóźniejszej ocenionej serii; drugie dotknięcie zdejmuje ocenę tej serii (i jej korektę następnej). Przy ostatniej serii zdanie, która ocena zostaje dla kolejnych tygodni. Lista dnia bez zmian (jedna ocena na ćwiczenie, z „OK”).
* Przegląd klienta (sekcja 27): przy serii 3 nic nie zaznaczone, ponowne „za trudne” → „Następna seria: 65 kg”, drugie dotknięcie zdejmuje, ocena tygodnia z serii 2 zostaje; przy ostatniej serii przyciski neutralne i zdanie o serii 2. Ze starą logiką trzy kontrole czerwone.

**45. Ocena zawsze coś zmienia: mały ciężar o 1 kg, masa ciała o 1 powtórzenie — 02.10.2026.**

Trener: „jeżeli w danym ćwiczeniu ciężary są bardzo małe, np. 5 kg, to nasze oznaczenie »za trudne« coś zmieni, czy za mały jest %? (…) niech przeskakuje na 4 kg” oraz „mam zrobić ćwiczenie na 10 powtórzeń i jak zaznaczyłem, że jest za trudne, to w kolejnej serii znowu 10 — najlepiej, żeby powtórzenia spadały od następnej serii o 1 albo rosły o 1, a reszta dni/tygodni dostosowała się do tego przesunięcia”.

* **Było:** w serii — gdy 5 % ginęło w zaokrągleniu, o cały skok (5 kg → 2,5 kg przy skoku 2,5); w kolejnych tygodniach — wcale (5 × 0,95 = 4,75 → znów 5). Masa ciała: w serii nic; w tygodniach ±1 powtórzenie na ocenę (z arkusza).
* **Jest:** gdy ocena ginie w zaokrągleniu — do 10 kg o 1 kg do pełnych kilogramów (5 → 4, 7,5 → 7, 10 → 9), wyżej o skok (12,5 → 10). Silnik: `krokWidoczny`, `widocznaZmiana` w obu drogach liczenia ciężaru (z RPE i „trzymaj z bloku”), tyle kroków, ile ocen netto; slot dostaje `zmianaPoOcenie`, a eksport wpisuje wtedy ciężar wprost (arkusz zaokrągliłby z powrotem). Telefon: `poKorekcie` z tą samą regułą; opisy „o 1 kg”, gdy to nie 5 %.
* **Masa ciała w serii:** ocena → następna seria ±1 powtórzenie (panel: duża liczba, dopisek „w planie”, zdanie skąd; lista: propozycje i opis), dalsze serie za tym, co klient zrobił. Kolejne tygodnie — jak dotąd ±1 na ocenę, maks. ±3. Inne dni z tym samym ćwiczeniem to osobne pozycje planu — ocena jednej ich nie zmienia.
* Testy silnika (krok, liczba kroków, plan z małym ciężarem i znacznikiem, masa ciała −1 w T2–T3), eksportu; przegląd klienta (sekcja 29: 5 kg → 4 kg na liście, Knee raises 10 → 9 na liście i w panelu). Bez reguł trzy kontrole czerwone.

**46. Poprawki w BAZIE: Swiss ball leg curl i Bird dog row — 04.10.2026.**

Trener: „Swiss ball leg curl pokazuje, żeby dobrać ciężar, a ono jest bez — a bird dog row na odwrót, tam powinien być ciężar”.

* **Swiss ball leg curl** (EX-0190): `kg` → `masa ciała`, skok 0. Bez pola ciężaru i bez serii maksymalnej; oceny zmieniają powtórzenia (±1).
* **Bird dog row** (EX-0035): `masa ciała` → `kg`, skok 2,5 kg jak pozostałe wiosłowania hantlą. Bez 1RM klient dobiera ciężar według RPE, a pierwsza seria liczy resztę.
* Liczba ćwiczeń bez serii maksymalnej bez zmian (27 — jedno weszło, jedno wyszło). Test silnika pilnuje obu; na starych danych czerwony.

**47. Rampa bez ciężaru docelowego — w procentach, a w panelu w kilogramach — 04.10.2026.**

Trener: „opis rozgrzewki — rampy w ćwiczeniu barbell bench press przed wpisanym jeszcze jakimkolwiek ciężarem był dziwny i niejasny”. Bez 1RM (klient dobiera ciężar) rampa miała sam krok „lekko × 8–10” i zdanie „Potem 2–3 serie z rosnącym ciężarem…”.

* Teraz pełny schemat w procentach: „lekko × 8–10 · 50% × 5 · 70% × 3 · 85% × 1” i „Procenty liczysz od ciężaru pierwszej serii roboczej (TOP SETU), który dobierasz.”
* W panelu (seria 1 albo TOP SET) dopisek „Wpisz go w pole niżej — pokażę rampę w kilogramach” — wpisany ciężar od razu przelicza kroki (60 kg → 30 · 42,5 · 50 kg) i zdanie „Dalej pierwsza seria robocza — 60 kg”.
* Serwer dokłada do rampy `schemat` (`SCHEMAT_RAMPY`) i `skok`; telefon liczy kroki tą samą regułą co silnik (`krokiZCelu`). Stary widok w pamięci telefonu bez schematu pokazuje rampę jak dotąd.
* Przegląd klienta (sekcja 29): schemat w procentach na liście, przeliczenie po wpisaniu 60 kg w panelu; bez podpięcia pola kontrola czerwona.
* 05.10.2026, trener: „do tych liczb 8–10, × 5 itd. dopiszmy powt.” — każdy krok kończy się bladym „powt.” („lekko × 8–10 powt.”, „50% × 5 powt.”, „30 kg × 5 powt.”), żeby było jasne, że to powtórzenia, a nie procenty czy kilogramy.

**48. Inne powtórzenia niż w planie — następna seria wraca do planu z dopasowanym ciężarem — 04.10.2026.**

Trener (zrzut: Split squat 3 × 8 na stronę, seria 1: 12 kg × 10, propozycje 12 × 10): „jeżeli ktoś zrobi 10 powtórzeń w pierwszej serii, to nie powinno być tak, że aplikacja i tak dopasowuje mu ten ciężar do 8 powtórzeń, żeby spełniało to założenia planu?”.

* Następna seria (panel i propozycje na liście) dostaje powtórzenia z planu i ciężar o tym samym wysiłku: `kg × %1RM(plan, RPE) / %1RM(zrobione, RPE)` z tabeli RPE silnika, zaokrąglone do skoku. 12 × 10 @8 → 12,5 × 8 (to, co pokazuje plan); 15 × 12 → 17,5 × 8; mniej powtórzeń → lżej. Założenie: seria była na RPE z planu — jeśli nie, od tego jest ocena, która liczy się od dopasowanego ciężaru.
* Serwer dokłada do widoku `tabelaRPE`; telefon: `naPowtorzeniaPlanu` w `podpowiedzSerii`, w propozycjach listy i w zapowiedzi „Następna seria”. Zdanie w panelu („Na 8 powtórzeń z planu: …”), opis propozycji na liście. Bez zmian: masa ciała (tam liczą się powtórzenia), maksy, seria z już wpisanymi liczbami.
* Przegląd klienta (sekcja 29): Split squat z 1RM, seria 1 z 12 powtórzeniami przy planie 8 → lista i panel 17,5 kg × 8 ze zdaniem skąd; bez dopasowania dwie kontrole czerwone.

**49. Analiza ruchu — MediaPipe Pose Landmarker, prototyp dla przysiadu — 07.10.2026.**

Trener: „moduł analizy ruchu: nagrać kamerą albo wgrać wideo, MediaPipe klatka po klatce z landmarkami i połączeniami, pełny zestaw punktów zapisany na przyszłość, kąty i trajektorie, zatrzymanie na dowolnej klatce, sugerowana pozycja punktu — na razie bez AI”.

* Strona `/ruch/` w konsoli (link „Analiza ruchu”), za tym samym logowaniem; bez logowania — ekran logowania, po nim powrót na analizę. Analiza w przeglądarce, film nie wychodzi z urządzenia.
* Czysta logika w modułach ES (`public/ruch/`: szkielet, geometria, przebieg, profile, sesja) — 31 testów w `testy/analiza-ruchu.test.ts`; ekran, MediaPipe, nakładka i wykres osobno.
* Każda klatka filmu dokładnie raz: odtwarzanie z pauzą na klatce zamiast przewijania (34 s zamiast 235 s na filmie 12 s), zgubione przy obciążeniu klatki uzupełniane; programowa karta graficzna → procesor.
* Zapis JSON: 33 punkty obrazu + 33 punkty 3D na klatkę, czas w ms, sugestie (`autor`: trener, później ai). CSV do arkusza. Wczytanie zapisu także bez filmu.
* Kąty kliniczne 2D/3D z pewnością i rozpoznaniem ujęcia (z boku / z przodu / skos) — kąt niewidoczny z danego ujęcia oznaczony „?” z powodem. Przysiad: powtórzenia, czasy, największe zgięcia, głębokość, kolana względem stóp.
* MediaPipe przypięte na 0.10.35: od 1.0 biblioteka wysyła do Google statystyki użycia (wymagałoby zgody klientów). Przegląd ruchu blokuje i zgłasza każde połączenie poza bibliotekę i model — z 1.0.1 robi się czerwony.
* `npm run przeglad-ruchu`: 50 kontroli na prawdziwych filmach (przód, bok, kamera); opis i dalsze kroki w `docs/06-analiza-ruchu.md`. Do decyzji trenera: zapis analiz w bazie przy kliencie.
* 09.10.2026, trener: „co to jest to .json? próbowałem nagranie ekranu i się nie da” — przycisk przyjmował tylko JSON, więc film był wyszarzony. Teraz „Otwórz zapisaną analizę” z wyjaśnieniem pod przyciskami (plik .json z „Pobierz analizę”), a oba przyciski przyjmują i film, i zapis — film idzie do analizy, zapis na ekran.

**50. Film w aplikacji — test biblioteki OPEX Fitness na Barbell Bench Press — 09.10.2026.**

Trener: „przetestuj integrację z biblioteką ćwiczeń OPEX Fitness na jednym ćwiczeniu — film na karcie ćwiczenia, bez opuszczania aplikacji, IFrame Player API z playsinline, baza niezależna od źródła wideo, w przyszłości własne MP4”.

* Film: „Barbell Bench Press - OPEX Exercise Library” (`ejI1Nlsul9k`, 9 s), kanał `@OPEXFitness` (`UCCgDGih2kSp0A6W_0cVYuaQ`, podlinkowany z opexfit.com); osadzanie dozwolone (oEmbed). Tylko metadane, bez pobierania filmu.
* Ćwiczenie było już w BAZIE (EX-0011, z tym samym filmem jako linkiem) — dostało pola opisu (`nazwa_en`, `nazwa_pl`, mięśnie, sprzęt, `rodzaj`), bez duplikatu i bez zmiany `nazwa`.
* Filmy osobno od BAZY: `docs/dane/filmy-cwiczen.json` → `silnik/src/dane/filmy.ts`, `wideo.ts` (`wideoCwiczenia`, `kartaCwiczenia`, `sprawdzFilmy`); typ `youtube` albo `plik` (własne MP4 bez zmian w BAZIE). Serwer: `karta` w widoku klienta, `wideo` w `/api/cwiczenia`.
* Aplikacja klienta: karta ćwiczenia (`karta-cwiczenia.js`) z odtwarzaczem YouTube (IFrame Player API, `playsinline=1`, youtube-nocookie, ramka z `strict-origin-when-cross-origin` przy `no-referrer` strony), opisem i podpisem źródła; z listy, z panelu serii (także TOP SET) i z serii maksymalnych. „Wstecz” zamyka kartę, wpisane liczby zostają. Moduł w pamięci offline (test pilnuje każdego importu `app.js`). SW `trening-v62`.
* Sprawdzone: testy silnika i konsoli, `npm run przeglad-filmu` (telefon i komputer, prawdziwy odtwarzacz: właściwy film zgłoszony przez API, start przyjęty, dane treningu zostają, własny plik gra/pauza/przewija). Samo odtwarzanie obrazu YouTube nie do sprawdzenia w tym środowisku — lista do sprawdzenia ręcznie w `docs/07-filmy-cwiczen.md`.

**51. Biblioteki ćwiczeń z filmami — Theory of Motion i Catalyst Athletics — 09.10.2026.**

Trener: „przygotuj bazę ćwiczeń na bazie kanału Theory of Motion Exercise Library razem z ich filmami … coeff, part i kategoria … całą ich bibliotekę … Catalyst z filmami poradnikowymi — to samo ćwiczenie może mieć dwa nagrania … jeżeli nie będziesz pewien, zostaw do weryfikacji”.

* Cały kanał Theory of Motion (3469 filmów) i playlista Catalyst „Olympic Weightlifting Exercise Library” (618), każdy film sprawdzony oEmbedem (osadzanie dozwolone). Tylko metadane, bez pobierania filmów.
* `docs/dane/biblioteka-cwiczen.json`: 3420 ćwiczeń (ToM 2928, Catalyst 492) z kategorią, part, coeff, progresją, skokiem, jednostronnością, rodzajem i sprzętem; 2221 pewnych, 1199 „DO WERYFIKACJI” z kodem powodu (KOMPLEKS 463, MOBILNOSC 320, KATEGORIA 197, JEDNOSTRONNE 145, COEFF 106, KONDYCJA 79, PROGRESJA 24, NAZWA 14). Zasady: `docs/dane/zasady-klasyfikacji.md`. Kettlebell — skok 4 kg (do potwierdzenia).
* To samo ćwiczenie = jeden wpis: 76 ćwiczeń BAZY trenera dostało filmy (160), pary ToM–Catalyst łączone (pokaz + poradnik). `filmy-cwiczen.json`: 3916 filmów z rolą `demonstracja` / `poradnik`; `sprawdzFilmy` pilnuje duplikatów i ról zamiast „jednego filmu”.
* Generator nie losuje ćwiczeń z bibliotek (`katalog.bazaTrenera`). Konsola: wyszukiwarka po całej bazie (PL/EN, filtry, podgląd karty), dopisek „(biblioteka)”; eksport dopisuje brakujące ćwiczenia do zakładki BAZA szablonu z rozszerzeniem zakresów i formuł LISTY. `/api/cwiczenia` gzipem, karta z `/api/karta-cwiczenia`.
* Klient: karta z przyciskami *Pokaz* / *Poradnik* (jeden rząd, przewijany), CSS karty wspólny z konsolą. SW `trening-v64`.
* Weryfikacja: `silnik/narzedzia/weryfikacja-bibliotek.py arkusz` → arkusz z grupami, linkami do filmów i listami decyzji (OK, USUŃ = ukryte, poprawki, przypięcie poradnika, odpięcie filmu) → `zastosuj`. Kolejny import nie nadpisuje decyzji trenera. Narzędzia importu: `silnik/narzedzia/import-bibliotek/`.
* Sprawdzone: testy silnika i konsoli, `przeglad-ekranow` (13b: wyszukiwarka, podgląd, slot, eksport i import), `przeglad-filmu` (6 nagrań przy wyciskaniu, poradnik, cała karta na ekranie), `przeglad-klienta`. Ręcznie: odtwarzanie pokazu i poradnika na iPhonie/iPadzie i komputerze. Opis: `docs/08-biblioteki-cwiczen.md`.

**52. Filmy wybranych ćwiczeń jednym dotknięciem w planie — 10.10.2026.**

Trener (zrzut z iPada, edycja planu): „na etapie wyboru ćwiczenia chciałbym, żeby była szybsza możliwość zobaczenia, jakie filmy są załączone do wybranych przeze mnie ćwiczeń”.

* Obok 🔎 w każdym wierszu **▶** z liczbą nagrań („▶ 6” przy wyciskaniu, „▶ 2” przy Goblet Squat) — otwiera kartę tego ćwiczenia z przyciskami *Pokaz* / *Poradnik*, bez wyszukiwarki; „Zamknij podgląd” wraca do planu bez zmian. Bez filmu przycisk wyszarzony, w pustym wierszu niewidoczny.
* Ćwiczenia BAZY bez wpisu w filmach, ale z linkiem YouTube w arkuszu (72), też grają w karcie — `kartaPodgladu` / `idZLinkuYoutube` w `wideo.ts`, pole `filmZArkusza` w `/api/cwiczenia`. U klienta bez zmian (tam tylko filmy sprawdzone oEmbedem).
* Układ: lista + 🔎 + ▶ w jednym rzędzie (lista bez naturalnej szerokości, żeby długa opcja nie rozpychała tabeli); na telefonie przyciski linijkę pod listą. Sprawdzone: przegląd ekranów (stan ▶ w każdym wierszu, karta z wiersza, telefon i iPad bez wystawania poza ekran), testy silnika i konsoli.

**53. Cofanie zmian w planie — ↶ Cofnij i ⌘Z — 10.10.2026.**

Trener (zrzut z iPada, właśnie dodane „Overhead Split Squat”): „chciałbym mieć możliwość cofać dodane ćwiczenie — np. klawiszem cofania od razu”.

* **↶ Cofnij** w prawym dolnym rogu ekranu planu (widoczny także przy przewiniętym planie), z opisem kroku: „B2 · Overhead Split Squat”. **⌘Z / Ctrl+Z** robi to samo, **⇧⌘Z / Ctrl+Y** i **↷ Ponów** przywracają. Do 50 kroków w obrębie otwartego planu; ponowne otwarcie planu zaczyna od nowa.
* Krok = stan planu sprzed zmiany (plan, data startu, status). Seria szybkich zmian (pisanie w polu) to jeden krok. W polu liczby/tekstu ⌘Z cofa samo pole (przeglądarka), na liście wyboru i poza polami — plan.
* Cofa się też to, co robi serwer, bo zmienia tylko plan: wypełnienie i rozniesienie tygodni, progresja bojów, szablon, losowanie ćwiczeń, wstawienie z asystenta, przyjęcie 1RM, status. ▲▼ przenosi razem ze slotem wykonania klienta (poza planem), więc cofa się przestawieniem w drugą stronę.
* Cofnięcie nigdy nie zabiera wpisów klienta: oceny, jego ciężary i TOP SETY zostają z bieżącego planu; gdy klient wpisał coś w międzyczasie, zapis i tak przechodzi przez scalanie (409 → przejęcie wpisów klienta).
* Przegląd ekranów (13c): dodanie → ⌘Z → pusto, ⇧⌘Z → wraca, przycisk „Cofnij”, ▼ i cofnięcie, liczba serii, plan w bazie identyczny jak przed, ocena klienta wpisana w międzyczasie zostaje.

**54. Backspace usuwa ćwiczenie albo kategorię; fokus przez przerysowanie tabeli — 10.10.2026.**

Trener: „cofnij działa, ale potrzebuję usuwania danego ćwiczenia klawiszem backspace — możliwość usunięcia nazwy ćwiczenia albo nazwy kategorii”.

* **Backspace / Delete** na liście ćwiczenia czyści wiersz (jak „— wybierz —”), na liście kategorii — wraca do „— pełna baza —”. Każde to krok do cofnięcia (⌘Z), z opisem „C1 · usunięte ćwiczenie” / „C1 · bez kategorii”. Przy ćwiczeniu, które klient już robił, konsola jak dotąd pyta, od którego tygodnia je zdjąć. Podpowiedź w legendzie nad tabelą.
* Po zapisie tabela rysuje się od nowa i fokus ginął — po Backspace nie dało się od razu wybrać innego ćwiczenia z klawiatury, a Tab między polami gubił się w połowie. Teraz fokus wraca na to samo pole w tym samym wierszu (wiersz po `positionId`, komórka, pole), z kursorem w tym samym miejscu.
* Przegląd ekranów (13c): Backspace na ćwiczeniu (zapisane, fokus zostaje), ⌘Z przywraca, Backspace na kategorii, cofanie po kolei do stanu wyjścia, Tab po zapisie.

**55. Numer pozycji (Lp.) do zmiany w wierszu — A1 i A2 przed B1 — 10.10.2026.**

Trener: „co mogę zrobić, żeby w dniu 1 było ćwiczenie A1 i A2 i dopiero później B1?”.

* Numeracja dnia była stała jak w pustym arkuszu (A1 · B1 B2 · C1 C2 · D1 D2 · E1 E2), choć szablony z Base44 miały już układy z A2. Teraz numer w kolumnie Lp. to lista (kropkowane podkreślenie): A1–H4 albo „—”. W arkuszu wystarczało wpisać inny numer — tu tak samo. Zmiana to krok do cofnięcia („B1 → A2”).
* Numer niesie znaczenie, jak w arkuszu: wspólna litera = superseria (u klienta jedna grupa), litera A = miejsce boju głównego (coeff 1,0 liczy się jak bój, „G” przestawia), C2 i D2 o stopień wyżej w szablonie akcesoriów. Eksport wpisuje numer do arkusza, import go czyta.
* Kontrola planu: ostrzeżenie „pierwsze miejsce dnia bez boju” tylko dla A1 (akcesorium w A2 przy boju to normalna superseria); nowe ostrzeżenie o tym samym numerze dwa razy w dniu. Serwer przyjmuje numer jako krótki tekst.
* Testy silnika (A2 z bojem i z akcesorium, powtórzony numer), kształtu planu, przegląd ekranów (B1 → A2 zapisane, u klienta grupa A, „Cofnij”).

**56. Wersja robocza planu — zmiany czekają na zatwierdzenie — 10.10.2026.**

Trener: „możemy dodać funkcję taką, że jak wprowadzam zmiany, to nie wpływa to na aktualne plany klientów, chyba że to zatwierdzę?”.

* Plan, który klient już ma (wysłany albo zakończony): pierwsza zmiana trenera odkłada kopię tego, co klient widzi. Telefon czyta odtąd tę kopię; konsola pracuje jak dotąd na planie trenera — tabela, ▲▼, tygodnie, szablon, losowanie, asystent, 1RM, eksport i cofanie bez zmian. Szkic (klient go nie widzi) zapisuje się od razu, jak dotąd; powrót do szkicu kończy czekanie.
* Nad planem pasek „Zmiany czekają na zatwierdzenie” — od kiedy, lista zmian (dodane / usunięte / podmienione ćwiczenie, parametry T1–T6, numer, przestawienie, ustawienia planu) i dwa przyciski: **✓ Zatwierdź — pokaż klientowi** albo **Odrzuć zmiany** (plan wraca do wersji klienta; ⌘Z przywraca odrzucone). Cofnięcie wszystkich zmian do wersji klienta chowa pasek samo. W kartotece przy cyklu znacznik „zmiany czekają”.
* Wpisy klienta w czasie czekania (oceny, jego ciężary, TOP SETY, serie maksymalne, wykonania) idą do obu wersji — trener widzi je przy pracy, a zatwierdzenie ani odrzucenie ich nie zabiera. ▲▼ przy czekających zmianach: mapa pozycji, żeby wykonania stały u klienta i u trenera przy właściwych ćwiczeniach.
* Od razu, bez zatwierdzania: data startu, status i moduły oddech/bieg.
* Baza: wersja 7 (`plan_klienta_json`, `pozycje_klienta_json`, `zmiany_od`; kopia przed migracją jak zawsze). Logika: `konsola/wersja-robocza.ts`; zapis w `magazyn.zapisz` (widok trenera / widok klienta); trasy `/zatwierdz`, `/odrzuc`.
* Testy: `testy/wersja-robocza.test.ts` (logika i cała droga przez serwer, 17), migracja, testy API zaktualizowane o zatwierdzanie; przeglądy ekranów (pasek, Zatwierdź, Odrzuć, ⌘Z) i klienta.

**57. „↺ Resetuj plan” i „Wybierz szablon” — 10.10.2026.**

Trener: „z poziomu konsoli chcę mieć przycisk, który resetuje plan, żeby ktoś mógł zacząć go od początku — z pytaniem o potwierdzenie, żeby nie zrobić tego przypadkiem. W miejscu »Szablon z Base44« samo »Wybierz szablon«”.

* **↺ Resetuj plan** w nagłówku planu. Okno mówi, co zniknie — wpisy klienta z tego cyklu: ukończone treningi, zapisane wykonania (ciężary, serie), oceny, ciężary i TOP SETY wybrane przez klienta, 1RM wyliczone z jego treningu — i co zostaje: cały plan trenera (ćwiczenia, serie, powtórzenia, RPE, ciężary wpisane na sztywno), serie maksymalne, waga klienta. Pole „Ustaw start na dziś” (zaznaczone, gdy start jest w przeszłości). „Tego nie da się cofnąć”; fokus na „Anuluj”, więc Enter nic nie resetuje; jedyne wyjścia: „Resetuj plan — od początku” albo „Anuluj”.
* Przy czekających zmianach (wersja robocza) reset czyści wpisy klienta w obu wersjach, a zmiany trenera dalej czekają. Historia cofania startuje od nowa — ⌘Z nie przywróciłby wykonań, które leżą poza planem.
* Serwer: `POST /api/plany/:id/reset` (`magazyn.resetujPostep`, `bezWpisowKlienta` w `wersja-robocza.ts`), data startu sprawdzana jak przy zapisie.
* „Szablon z Base44” → **„Wybierz szablon”**.
* Testy: reset przez serwer (wpisy klienta i 1RM z treningu znikają w obu wersjach, plan trenera i czekająca zmiana zostają, data startu, zła data — odmowa), przegląd ekranów (okno, „Anuluj” nic nie rusza, reset, start od dziś).

**58. Masa ciała: powtórzenia rosną przez cały cykl, bez restartu w T4 — 10.10.2026.**

Trener: „ćwiczenie glute crusher na tygodnie 1–3 ma progresję 10–12 powtórzeń, bo jest z masą ciała, ale na tygodnie 4–6 znowu ma 10–12, co jest bez sensu, bo ktoś powtarza to samo. W tego typu ćwiczeniu powinno być od T1 do T6 10–15 powtórzeń, i w innych ćwiczeniach typu glute crusher tak samo”.

* Automat powtórzeń akcesoriów (baza z coeff + przesunięcie tygodnia) restartował w T4 — przy ciężarze słusznie, bo blok II podnosi RPE. Przy progresji „masa ciała” nie ma czego dociążyć, więc przesunięcie idzie teraz przez cały cykl (`offsetCyklu`): objętość coeff 0,5 → 10, 11, 12, 13, 14, 15; coeff 0,75 (Pull up, Dips) → 8 … 13; intensywność o 2 niżej; hipertrofia 12 … 15 (tabela kończy się na 15). Deload wraca do powtórzeń z T1 (trener: „deload może wracać liczbą powtórzeń do T1” — RPE o 1 niżej nic nie ujmuje, gdy nie ma ciężaru); z ciężarem deload dalej jak T6 z RPE o 1 niżej. Korekta z ocen klienta (±1 powtórzenie za 5%) działa jak dotąd, w granicach 1–15.
* Dotyczy wszystkich ćwiczeń z progresją „masa ciała” — 17 w BAZIE trenera (Glute crusher, Push up, Pull up, Dips, Knee raises, Reverse Nordic, Swiss ball leg curl…) i tych z bibliotek. Powtórzenia wpisane ręcznie przez trenera — bez zmian. Akcesoria z ciężarem, „czas”, „dystans” i „ręczne ustawienie” — jak dotąd.
* Zmiana w automacie, więc działa od razu we wszystkich planach (także wysłanych — to nie zmiana trenera w planie, nie czeka na zatwierdzenie). Eksport wpisuje te powtórzenia do arkusza wprost — formuła arkusza zaczęłaby blok od nowa.
* Testy: automat (trzy części planu, obcięcie), plan z Glute crusherem obok akcesorium z ciężarem (restart zostaje), eksport.

**59. Przy „dobierz ciężar” bez „za lekko / za ciężko” — 10.10.2026.**

Trener: „w trakcie treningu, jeżeli ktoś ma na panelu »dobierz ciężar«, bo jeszcze nie robił tego ćwiczenia, nie powinny być widoczne opcje »za lekko« / »za ciężko«, nie uważasz?”. Zgoda: nie ma ciężaru z planu, do którego ocena by się odnosiła, a poszłaby do trenera i do kolejnych tygodni jako korekta ciężaru, który klient sam wybrał — choć instrukcja doboru i tak mówi „wyszło za lekko? dołóż w następnej serii i wpisz ją”.

* Panel serii: gdy stoi „dobierz” (brak 1RM albo ręczne ustawienie bez wpisu trenera), zamiast oceny jedno zdanie: „Za lekko albo za ciężko? Nic nie klikaj — zmień ciężar w następnej serii i wpisz go. Ocena pojawi się, gdy ciężar będzie już ustalony.” Gdy ciężar jest już policzony z pierwszej serii, ocena wraca. TOP SET bez 1RM — tak samo. Masa ciała (ocena zmienia powtórzenia) i lista ćwiczeń — bez zmian. SW `trening-v66`.
* Przegląd klienta: przy dobieraniu brak oceny i jest zdanie; po pierwszej serii ocena wraca.

**60. Reset planu czyści też postęp treningu w telefonie — 10.10.2026.**

Trener: „po zresetowaniu planu usunęły mi się zapisane ciężary, ale serie zostały zapisane — byłem nadal w serii 2 z 6 i musiałem znowu dobrać ciężar, czyli nie zresetował się plan całkowicie”.

* Przyczyna: postęp prowadzonego treningu (zrobione serie, bieżąca seria, oceny serii, korekty) żyje w pamięci telefonu, kluczowany planem, tygodniem i dniem. Reset czyścił bazę, a telefon wznawiał trening tam, gdzie stał — z ciężarem do dobrania, bo 1RM z treningu zniknęło.
* Teraz reset zapisuje znacznik (`reset_od`, baza w wersji 8), widok klienta go niesie, a telefon porzuca postęp sprzed resetu — trening zaczyna się od pierwszej serii. Baner „Skąd wziąć ciężary” wraca rozwinięty, jak przy nowym planie.
* Zadania z kolejki offline niosą znacznik, który telefon widział; zapis sprzed resetu serwer odrzuca (409 z wyjaśnieniem), zamiast przywrócić to, co trener wyczyścił. Zadania bez znacznika (starsza wersja aplikacji) przechodzą jak dotąd. SW `trening-v67`.
* Przegląd klienta (sekcja 30): dwie serie w prowadzeniu, reset, ponowne wejście — „Seria 1 z 9 · zrobione 0” zamiast „zrobione 2”; zapis ze starym znacznikiem — 409, z bieżącym — przechodzi. Testy: znacznik w widoku, odmowa, zgodność wstecz, migracja.

**61. Bez zdania „Za lekko albo za ciężko?” przy dobieraniu ciężaru — 13.10.2026.**

Trener (zrzut panelu ze strzałką): „ten opis (za ciężko / za lekko…) nie ma sensu na tym panelu, bo i tak nie mamy tutaj tych przycisków. Musimy to jakoś zmienić”.

* Zdanie z punktu 59 usunięte z panelu serii i z TOP SETU bez 1RM — w miejscu oceny nie ma nic. Co zrobić przy złym ciężarze, mówi już instrukcja doboru nad polami („Wpisz, co podniosłeś — z tej serii policzę Twoje ciężary na cały plan”) i opis RPE („Wyszło za lekko? Dołóż w następnej serii…”). SW `trening-v68`.
* Przegląd klienta: przy dobieraniu nie ma oceny ani zdania o „za lekko / za ciężko” poza opisem RPE; po pierwszej serii ocena wraca.

**62. Dragonflag ekscentryczny na masie ciała; film z arkusza gra w aplikacji — 16.10.2026.**

Trener: „ćwiczenie s/l dragonflag eccentric ma dopisane »dobierz ciężar«, mimo że ciężar nie jest tam wykorzystywany. Poza tym przycisk film przenosi do YouTube zamiast otwierać film w aplikacji”.

* **S/l dragonflag eccentric** (EX-0174) i **B/l dragonflag eccentric** (EX-0006, ten sam ruch obunóż): `kg` → `masa ciała`, skok 0. Bez „dobierz ciężar” i bez serii maksymalnej; oceny zmieniają powtórzenia, powtórzenia rosną przez cały cykl (punkt 58). Ćwiczeń BAZY bez serii maksymalnej: 29 (było 27).
* **Film w aplikacji**: ćwiczenia BAZY bez wpisu w filmach miały u klienta zwykły link do YouTube (w aplikacji grały tylko filmy sprawdzone oEmbedem). Sprawdzone 16.10.2026: 71 z 72 takich linków da się osadzić; jeden — **Barbell row dead stop pins** (EX-0017, `youtu.be/qelbH7YGpms`) — jest na YouTube niedostępny, do podmiany w arkuszu. Teraz link YouTube z arkusza gra w karcie w aplikacji (podpis „wybrany przez trenera”); film, którego nie da się odtworzyć, karta opisuje w ramce z linkiem do YouTube. Film rozgrzewki dnia — tak samo. Link spoza YouTube zostaje linkiem. SW `trening-v69`.
* Testy: progresja obu dragonflagów, liczba ćwiczeń bez serii maksymalnej, karta klienta z linku (każde ćwiczenie BAZY z linkiem YouTube ma kartę), karta rozgrzewki, widok klienta. Przegląd filmu: przycisk karty przy ćwiczeniu z linkiem z arkusza, film `t5Ft8OMG_D8` w karcie, podpis bez „arkusza”; przegląd klienta: przycisk filmu w rozgrzewce.

**63. „Jak trenować” na ekranie dnia; co robi wpisany ciężar — 16.10.2026.**

Trener: „poinformować użytkownika o tym, że wpisanie przez niego w panelu ciężaru powoduje dostosowanie ciężaru w reszcie planu, a alternatywą jest któryś z przycisków za lekkie / za ciężkie … ewentualnie informacja, że można robić trening, patrząc po prostu na listę ćwiczeń, i oznaczać zrobione ćwiczenia, ewentualnie przejść do prowadzenia — żeby jasno zaznaczyć, że nie jest konieczne wchodzenie w panele”.

Tekst zgodny z tym, jak aplikacja liczy: **kolejne tygodnie zmienia ocena** (przy masie ciała — powtórzenia). Wpisany ciężar, gdy ciężar jest z planu, idzie do historii i do trenera (propozycja 1RM — decyduje trener), a w prowadzeniu do następnej serii; na resztę planu przechodzi tylko przy „dobierz” (kalibracja z pierwszej serii, ciężar klienta przy ręcznym ustawieniu).

* **Ekran dnia — „Jak trenować”** (zwijany baner nad „▶ Prowadź mnie seria po serii”): z listy (odhaczanie „OK”, ciężaru nie trzeba wpisywać, „Zakończ trening”), z prowadzeniem (nieobowiązkowe, powrót do listy w każdej chwili), co zmienia ciężar na kolejne tygodnie; w dniu z „dobierz” — wyjątek. Rozwinięty, dopóki klient raz go nie zwinie (pamięć telefonu). W dniu maksów go nie ma.
* **Panel**: przy pierwszej serii ćwiczenia z ciężarem z planu — „Podniosłeś inny ciężar? Wpisz go — następną serię policzę od niego. Kolejne tygodnie zmienia ocena niżej.” Podpowiedź oceny przed ostatnią serią: „dopasuję następną serię i ciężar (powtórzenia) w kolejnych tygodniach”. Przy „dobierz” bez zmian — tam mówi instrukcja doboru. SW `trening-v70`.
* Przegląd klienta: treść, miejsce przed prowadzeniem, zwinięcie zostaje, wyjątek „dobierz” w dniu z doborem, brak w dniu maksów; zdanie o wpisanym ciężarze tylko przy pierwszej serii i nie przy „dobierz”.

**64. Dziewięć kolejnych ćwiczeń BAZY na masie ciała — 16.10.2026.**

Trener (o liście ćwiczeń z `kg`, przy których i tak nie ma obciążenia): „wszystkie ćwiczenia, które wymieniłeś, powinny być z masą ciała”.

* `kg` → `masa ciała`, skok 0: **Toes to bar** (EX-0191), **GHD flexion** (EX-0090), **Incline sit-ups** (EX-0113), **Supine pigeon abs** (EX-0189), **Back extension** (EX-0007), **Box jump** (EX-0036), **Horizontal jump** (EX-0104), **Seated broad jump** (EX-0176), **Extensive plyo jumps s/l** (EX-0085). Bez „dobierz ciężar” i bez serii maksymalnej; oceny zmieniają powtórzenia, powtórzenia rosną przez cały cykl (punkt 58).
* Skoki dostają ten sam automat powtórzeń co reszta masy ciała (np. coeff 0,5 w części siłowej: T1 8 → T6 13). Gdy przy skokach ma być mniej powtórzeń, trener wpisuje je ręcznie w slocie.
* Ćwiczeń BAZY bez serii maksymalnej: 38 (było 29). Test silnika pilnuje wszystkich dziewięciu.

**65. Dwubój olimpijski — rwanie i zarzut w % 1RM — 16.10.2026.**

Trener poprosił o sposób rozpisywania periodyzacji dla clean / snatch z blokiem objętościowym i intensyfikującym. Po propozycji: „to, co zaproponowałeś, mi się podoba i może tak być … skok 1 kg, wdrażaj całość”.

* **Dlaczego procenty:** tabela RPE zaczyna się od RPE 6 (76,5 % przy trójkach, 79,5 % przy dwójkach) — techniczna objętość na 70–75 % się w niej nie mieści; w dwuboju o ciężarze decyduje technika i szybkość, nie zapas powtórzeń.
* **Tabela** (`PROGRESJA_DWUBOJU`): cz.1 objętość 6×3 @70 · 6×3 @72 · 5×3 @75 · 6×2 @75 · 6×2 @78 · 5×2 @80 %; cz.2 intensyfikacja 6×2 @80 · 6×2 @82 · 5×2 @85 · 8×1 @85 · 7×1 @88 · 5×1 @90 %. Deload 4×2 @70 %. TOP SET opcjonalny, tylko cz.2 od T4: 88 · 91 · 93 %. Hipertrofia — tabela objętościowa, „S” — siłowa tego etapu. Ciężar = 1RM tego ćwiczenia × % × korekta z ocen, skok 1 kg (przy Clean 1RM 100: 70 · 72 · 75 · 75 · 78 · 80 kg).
* **Ćwiczenia** (`DWUBOJ`, 33): Clean i Clean pins z BAZY; z bibliotek rwanie i zarzut ze sztangą — pełne, power, z zawieszenia (hang, high/mid/low), z bloków, zarzut z podrzutem. Bez ciągów, martwych ciągów, ćwiczeń technicznych (muscle, tall, no jump, z pozycji mocy, segmentowe), kompleksów, hantli i kettlebelli. Na każdej pozycji; „G” robi zwykły bój.
* **1RM:** od trenera, z serii maksymalnej klienta (przy dwuboju: najcięższe czyste powtórzenie, nie seria do odmowy) albo z tygodnia maksów (domyślnie bierze też dwubój). Bez 1RM klient robi w pierwszym treningu test pojedynczego — zapis jako seria maksymalna × 1 — zamiast doboru według RPE. Serie robocze dwuboju nie kalibrują 1RM i nie idą do propozycji 1RM (seria na 70 % nic nie mówi o maksimum).
* **Konsola:** znacznik „D”, w kolumnie RPE procent (pole `procent` tygodnia, 20–120), TOP SET w % (`procentTygodni`), „wpisz progresję” i zmiana części planu przepisują dwubój. **Telefon:** „70 % 1RM” zamiast RPE, „test 1RM” i blok testu, ocena z dopiskiem o technice i szybkości, punkt w „Jak trenować”. **Eksport:** powtórzenia i ciężary wprost; TOP SET dwuboju idzie do arkusza z RPE najbliższym procentowi (arkusz nie zna procentów). SW `trening-v71`.
* Testy: silnik (`dwuboj.test.ts` — lista, obie tabele, Snatch od własnego 1RM, procent trenera, ocena, brak 1RM, „G”, hipertrofia i „S”, deload, TOP SET, tydzień maksów, „wpisz progresję”), serwer (widok klienta, brak kalibracji, test 1RM liczy plan, bez propozycji, kształt procentu, lista ćwiczeń), eksport. Przeglądy: konsola (znacznik, procent, wpis, „G” w obie strony), telefon (sekcja 31: lista, „Jak trenować”, panel z testem, 70 kg po teście, bez rampy po teście, ocena z dopiskiem, seria maksymalna 100 × 1, ekran serii maksymalnych, szerokość telefonu).

**66. Dwubój: „sprawdź swój maks” zamiast „test 1RM” — 16.10.2026.**

Trener: „nie podoba mi się ten opis »najpierw test 1RM« przy ćwiczeniu Clean — mało naturalny jest”.

* Językiem sali: w kolumnie ciężaru „sprawdź maks”, blok „Najpierw sprawdź swój maks” („rozgrzej się i dokładaj w kolejnych podejściach, aż dojdziesz do najcięższego powtórzenia, które zrobisz czysto i szybko… następnie robisz już serie z planu” — końcówka wg trenera), przycisk „Zapisz maks”, w „Jak trenować” punkt „Rwanie i zarzut bez maksa”, na ekranie serii maksymalnych „Twój maks to najcięższe powtórzenie zrobione czysto i szybko…”. Działanie bez zmian. SW `trening-v72`.

**67. Ćwiczenia z własną progresją — na każdej pozycji — 16.10.2026.**

Trener: „rozpisuję teraz plan i mam ćwiczenie barbell bench press jako B1 i liczy mi się jako akcesorium — zrób tak, żeby ćwiczenia, które mają swoją własną progresję, zawsze miały ją docelowo w planie niezależnie od miejsca w rozpisce”.

* **Reguła boju** (`jestBojemGlownym`): złożone z ciężarem (coeff 1,0, progresja `kg` albo `dodatkowy ciężar`) — bój na każdej pozycji. Złożone bez kilogramów (Dips na masie ciała, Bulgarian squat assisted) — jak dotąd tylko w A; poza A ich własny automat. Pauzowane i dwubój — już wcześniej na każdej pozycji. „G” dalej przestawia rolę w obie strony (wyłączone = akcesorium z decyzji trenera). Konsola liczy tę samą regułę (`bojGlownyZReguly`).
* Teraz bojem są więc wszędzie m.in.: Barbell bench press, back / low bar / front squat, Deadlift, Sumo, Trap bar, RDL, Hip thrust barbell, Push press, Pull up / Dips weighted, Walking lunges, Landmine core, Squat izo (15 sek) i 42 ćwiczenia z coeff 1,0 z bibliotek.
* **Migracja bazy v9:** przy takich ćwiczeniach poza A zdejmuje liczby akcesorium wpisane przyciskiem „wpisz progresję” (3 serie i dokładnie RPE akcesorium, bez powtórzeń) — inaczej bench na B1 wyszedłby „3 × 6 @ 8”. Ręczne zmiany trenera, oceny i ciężary klienta zostają; plan trenera i wersja klienta.
* **Import z arkusza:** arkusz liczy bój tylko w A, więc takie ćwiczenie poza A wchodzi z wyłączonym „G” — plan zostaje tym, czym był w arkuszu. **Eksport:** bój poza A idzie z ciężarem wprost (arkusz trzymałby go z bloku jak akcesorium).
* Testy: silnik (front squat na B1 — bój; „G” wyłączone — akcesorium; dipy na masie ciała poza A — swój automat), migracja v9 (liczby automatu znikają, ręczne i ocena zostają, „G” wyłączone nietknięte), eksport (bench na B1). Przegląd konsoli: przysiad przeniesiony na B1 z podświetlonym „G” i progresją boju, wyłączenie „G”.

**68. Bojem tylko przysiady, martwe ciągi i bench — 16.10.2026.**

Trener, po punkcie 67 (lista złożonych, które stały się bojem wszędzie): „zostaw jako boje tylko przysiady, martwe ciągi, bench — te mniej oczywiste mogą liczyć się jako akcesoria”.

* **Reguła:** bój = ćwiczenie z listy `BOJE` (przysiady, martwe ciągi, bench ze sztangą — 9 z BAZY, w tym dwa pauzowane, i 21 wariantów z bibliotek), **na każdej pozycji**. Pozycja przestała decydować. Pozostałe złożone z coeff 1,0 — Hip thrust barbell, RDL, Push press, Pull up / Dips weighted, Pull up eccentric weighted, Walking lunges, Landmine core, Squat izo, Dips, Bulgarian squat assisted, jerki i hip lifty z bibliotek — liczą się jak akcesoria, także na A1. „G” dalej przestawia rolę w obie strony; pauzowane i dwubój — własne progresje.
* **Lista zamiast obniżenia coeff w BAZIE:** coeff decyduje też o powtórzeniach akcesoriów i o stresie w analizie — trener chciał zmienić rolę, nie te liczby.
* **Migracja bazy v10:** przy złożonych, które przestały być bojem, zdejmuje liczby boju wpisane przyciskiem „wpisz progresję” (trójka serie / powtórzenia / RPE identyczna z szablonem boju dla części planu). Ręczne zmiany trenera, oceny i ciężary klienta zostają; „G” trenera też. v9 (punkt 67) działa już według listy.
* **Import z arkusza:** arkusz rozstrzyga pozycją, aplikacja ćwiczeniem — rozbieżność zapisuje się jako „G” (złożone z coeff 1,0 w A — bój jak w arkuszu; bój poza A — akcesorium). **Eksport:** gdy rola w aplikacji i pozycja w arkuszu się rozjeżdżają, ciężar idzie wprost; w pozycji A zawsze powtórzenia wprost.
* Testy: silnik (bench na B1, deadlift na C1 — bój; push press, hip thrust, RDL, Squat izo, lunges, pull up weighted na A1 — akcesorium; lista bojów kompletna i tylko przysiady / martwe / bench z coeff 1,0), migracja v10, eksport (push press na A1). Przeglądy konsoli i telefonu bez zmian zielone.

**69. Ćwiczenia naprzemienne liczone na stronę — 17.10.2026.**

Trener: „gorilla row robi się naprzemian, ale w bazie mamy je jako ćwiczenie jednostronne, przez co wychodzi tam mała liczba powtórzeń (np. 8), a chciałbym, żeby to było liczone tak, że 8 robi jedna ręka, czyli łącznie 16 — chyba trzeba poprawić to i tego typu ćwiczenia na dwustronne”.

* Było odwrotnie: Gorilla row stało jako **dwustronne**, więc „8” znaczyło 8 łącznie. To, czego trener chce („8 na rękę, łącznie 16”), w aplikacji to oznaczenie „jednostronne” — serie i powtórzenia **na stronę**, z dopiskiem „na stronę” u klienta. Tak już stały „alternating” z BAZY (Arnold press, Dumbbell bench / OH / incline press alternating).
* **BAZA** (`jednostronne.json`, potwierdzone): Gorilla row, Seesaw press, Seated seesaw press (nogi proste), Bear renegade row. Jednostronnych w BAZIE: 35 (było 31).
* **Biblioteki** (`jednostronne: "tak"`): 16 naprzemiennych z hantlami / kettlebellami — seesaw press i row (2DB, 2KB, half kneeling, staggered), renegade row (w tym z kolan i ISO).
* Liczenie serii bez zmian („jak w arkuszu” — 3 serie, nie 6). Liczba powtórzeń z automatu też bez zmian — zmienia się jej znaczenie: na stronę.
* Dalej tego samego dnia, po odpowiedziach trenera — też **na stronę**:
  * **Dead bug** — „tak jak gorilla row”: w BAZIE Dead bug straight legs i Deadbug OH, w bibliotekach 11 dynamicznych (bez izometrii na czas i bez opuszczania obu nóg naraz). Dead bug izo + OH (izometria) bez zmian.
  * **Bird dog row** — „klasyczne raz na jedną stronę, a raz na drugą”: BAZA i DB Bird Dog Row z biblioteki. W aplikacji jedno i drugie (naprzemiennie albo najpierw jedna strona) to te same powtórzenia na stronę.
  * **Kettlebell march** — „kettel po jednej stronie, np. 10 kroków (po 5 na nogę), po zmianie strony kettla znowu 10”: na stronę = na stronę kettla. Tak samo 1KB Suitcase March i 2KB Offset + Overhead Rack Marching z bibliotek. Marsze z dwoma kettlebellami bez zmiany strony zostają dwustronne; Suitcase carry (dystans) bez zmian.
  * **Naprzemienne z masą ciała z bibliotek** — „liczymy naprzemiennie tak jak gorilla row”: 18 (shoulder taps, push up + alternating shoulder tap, prone alternating superman, alternating lying leg raise, marsze leżąc i w moście, knee to elbow, psoas march, penguin marches, wall marching). Wersje na czas (ISO, plank marching) bez zmian. Psoas march stracił znacznik „DO WERYFIKACJI – JEDNOSTRONNE”, offset marching — kod JEDNOSTRONNE (zostaje NAZWA).
  * Jednostronnych w BAZIE: 39.

**70. Podpowiedź „Dodaj trening do ekranu głównego” od pierwszego wejścia, zwijana — 17.10.2026.**

Trener: „wchodząc teraz w link do planu nie ma informacji o tej możliwości dodania skrótu / ikony do ekranu startowego tak jak było wcześniej — dodaj z powrotem z możliwością chowania go”.

* Przyczyna: podpowiedź czekała na pierwszy domknięty trening i po „Nie teraz” znikała na zawsze — po „↺ Resetuj plan” albo u kogoś, kto raz ją odłożył, nie było jej wcale.
* Teraz zwijany baner (jak „Skąd wziąć ciężary”) od pierwszego wejścia w link, rozwinięty. „Schowaj” albo dotknięcie nagłówka zwija go do jednej linijki i tak zostaje (pamięć telefonu); dotknięcie linijki rozwija. Dawne „Nie teraz” liczy się jak zwinięcie. Nie ma go, gdy aplikacja jest otwarta z ikony; po dodaniu przyciskiem (Android) znika.
* Treść wg urządzenia: iPhone — udostępnianie „na dole”, iPad (także podający się za Maca) — „u góry”, potem „Do ekranu początkowego”; Android z przyciskiem „Dodaj do ekranu głównego” albo „W menu przeglądarki (⋮)…”. SW `trening-v74`.
* Przegląd klienta: widoczna od pierwszego wejścia, po treningu dalej, „Schowaj” zwija, zostaje zwinięta po ponownym otwarciu, dotknięcie rozwija.

**71. Opis maksa przy dwuboju — brzmienie trenera — 17.10.2026.**

Trener (zrzut karty Clean): „opis powinien być bardziej w stylu: stopniowo zwiększaj ciężar, aż dojdziesz do najcięższego powtórzenia, które jesteś w stanie zrobić dynamicznie i z zachowaniem dobrej techniki. Wpisz ten ciężar — na jego podstawie będą policzone ciężary w reszcie planu”.

* Blok „Najpierw sprawdź swój maks” — dokładnie to zdanie. Tym samym językiem ekran serii maksymalnych („…dynamicznie i z zachowaniem dobrej techniki. Wpisz ten ciężar — powtórzenia: 1.”) i punkt „Rwanie i zarzut bez maksa” w „Jak trenować”. SW `trening-v76`.

**72. „✕” przy podpowiedzi o ekranie głównym — 17.10.2026.**

Trener: „poza opcją chowania tej informacji o ekranie głównym dodajmy też x, którym się ją usuwa”.

* „✕” w nagłówku banera (na samym końcu, za strzałką zwijania) usuwa podpowiedź na dobre — pamięć telefonu, także po ponownym otwarciu. „Schowaj” i dotknięcie nagłówka dalej tylko zwijają. Tytuł skrócony do „Dodaj do ekranu głównego”, żeby z krzyżykiem mieścił się w jednej linii na wąskim telefonie (360 px). SW `trening-v77`.
* Przegląd klienta: „✕” usuwa od razu i podpowiedź nie wraca po ponownym otwarciu.

**73. „Twój postęp” schowany; poprawka zdania o maksie — 17.10.2026.**

Trener: „usuńmy na razie zakładkę »twój postęp« z treningu — dodamy ją kiedyś, jak będzie lepiej dopracowana”, oraz w „Jak trenować”: „powinno być »powtórzenia, które jesteś w stanie zrobić dynamicznie…«, a przed »i wpisz je« chyba nie powinno być przecinka”.

* **„Twój postęp”:** przycisk na liście tygodni schowany. Ekran, jego kod i dane zostają — wraca jednym przełącznikiem (`POSTEP_WIDOCZNY` w `klient/app.js`; w pamięci telefonu `postep-widoczny` = „1” pokazuje go — tak robi przegląd klienta, który dalej sprawdza ten ekran). Konsola trenera bez zmian.
* **Zdanie:** „Rwanie i zarzut bez maksa — najpierw stopniowo dojdź do najcięższego powtórzenia, które jesteś w stanie zrobić dynamicznie i z zachowaniem dobrej techniki. Wpisz je — na jego podstawie będą policzone ciężary w reszcie planu.” Dwa zdania zamiast przecinka przed „i wpisz je” (przecinek zamykał wtrącone zdanie podrzędne, ale tak czyta się prościej). SW `trening-v78`.

**74. Wpisany inny ciężar liczy resztę planu; czytelniejsze tygodnie i dni; guma — 17.10.2026.**

Trener: „po namyśle zróbmy jednak tak, że jeżeli ktoś wpisze inny ciężar — np. miał zrobić 40 kg × 8, a zrobił 45 kg × 9 — to niech ta seria będzie podstawą do wyliczenia obciążeń do całej reszty planu, a nie tylko do końca tego dnia treningowego”; „napisy dzień / tydzień zlewają się ze sobą”; „przy SL Glute Bridge ISO Band Hip Flexion jest wpisane »czas« przy kolumnie ciężar, a to jest ćwiczenie z gumą — musimy zrobić osobny wpis w tamto miejsce dla ćwiczeń z gumą”.

* **Inny ciężar w środku cyklu** (`konsola/kalibracja.ts`). Najcięższa seria z treningu, przeliczona na powtórzenia z planu (przy RPE z planu), do ciężaru z planu — w tej proporcji zmienia się 1RM. Przykład trenera: 40 × 8 → 45 × 9 to ok. +17 %. Zmiana działa **od tygodnia tej serii do końca planu**; przerobione tygodnie zostają przy ciężarach, które klient wtedy dostał (`wczesniej` przy wpisie serii maksymalnej — silnik bierze 1RM tygodnia, `rozwiaz1RM(id, serie, tydzien)`). Akcesoria „trzymaj z bloku” idą w górę razem z bojem (ciężar z T1/T4 przeskalowany do 1RM tygodnia). Kolejna seria z tego samego treningu poprawia zmianę od tej samej podstawy (plan sprzed zmiany), powrót do ciężaru z planu przywraca plan.
* **Kiedy nie:** ciężar jak w planie (same powtórzenia — od tego jest ocena), różnica ponad 30 % (pomyłka w wpisie albo inne ćwiczenie — idzie do propozycji 1RM dla trenera), ciężar wpisany przez trenera na sztywno, ciężar ręczny niesiony z tygodnia, dwubój (procenty), deload i tydzień maksów, zaległy trening z tygodnia wcześniejszego niż ostatnia zmiana, sama ocena wysłana później.
* **Trener widzi** w serii maksymalnej: „z serii roboczej klienta: 92,5 kg × 5 przy RPE 7 · T3, dzień I (w planie było 85 kg) · od T3 do końca planu, wcześniej 1RM 113 kg”. Nadpisanie pól zamienia wpis w zwykłą serię maksymalną. Seria, która ustaliła 1RM, nie wraca już jako propozycja 1RM. „Resetuj plan” wraca do serii maksymalnej sprzed zmian (`pierwotne`). Nowa wersja planu bierze obecne 1RM, bez tygodni sprzed zmiany. Eksport: przy takim ćwiczeniu ciężary idą liczbami wprost (arkusz ma jedno 1RM na ćwiczenie).
* **Klient widzi:** „Jak trenować” — „Ciężar na kolejne tygodnie — zrobiłeś inny ciężar niż w planie? Wpisz go — od tej serii policzę resztę planu. Nie chcesz wpisywać? Wystarczy ocena…”; w panelu przy pierwszej serii — „Podniosłeś inny ciężar? Wpisz go — od tej serii policzę resztę planu. Nie chcesz wpisywać? Wystarczy ocena niżej.”; przy ćwiczeniu po zmianie — „✓ Reszta planu liczona od Twojej serii: 92,5 kg × 5”. Przy dwuboju bez zmian (liczy się ocena).
* **Tydzień i dzień:** w nagłówku treningu i prowadzenia tydzień stoi małą linijką nad dniem („TYDZIEŃ 3 Z 6”, kolorem akcentu), a pod nim duże „Dzień I” i postęp osobno. Lista: „**Tydzień 3** z 6” (numer mocno, „z 6” słabiej), deload i maksy jako znaczek, licznik „1 z 3 treningów”. Przycisk: „▶ Następny trening: Dzień I, tydzień 3”.
* **Guma** (`zGuma` w `silnik/src/typy.ts`): guma w sprzęcie albo „band” w nazwie, a progresja bez kilogramów (czas, ręczne ustawienie, asysta, masa ciała, dystans) — 136 ćwiczeń. W kolumnie ciężaru „guma”, pod spodem „na czas” / „asysta” / „na dystans”; bez pola na kilogramy u klienta i w konsoli, bez serii maksymalnej („Ćwiczenie z gumą — opór dobiera się gumą, nie kilogramami.”). Guma razem ze sztangą, hantlami, kettlem czy wyciągiem zostaje przy kilogramach. Guma na masie ciała („Spanish Squat”, „RNT Step-Up”) dalej zmienia po ocenie powtórzenia. SW `trening-v79`.
* Testy: silnik (`guma.test.ts`, `zmiana-1rm.test.ts`), konsola (`kalibracja.test.ts` — przykład trenera, mniej niż w planie, same powtórzenia, akcesorium z bloku, poprawka, druga zmiana, zaległy trening, 30 %, ciężar trenera, reset; API — guma, zmiana od T3, notka w telefonie, sama ocena; eksport). Przeglądy: nagłówek dnia z tygodniem nad nim, lista tygodni, nowe zdania.

**75. Ćwiczenia robione razem stoją razem — 17.10.2026.**

Trener: „na liście wyświetlającej dany dzień treningowy może zróbmy tak, że jak jest ćwiczenie np. B1 i B2, to są one blisko siebie, i później jakaś przerwa delikatna przed C1 — tak żeby wizualnie oddzielić ćwiczenia, które robi się wspólnie”.

* Lista dnia u klienta: karty jednej litery (B1, B2) stoją ciasno (odstęp ok. 6 px), między literami przerwa (ok. 22 px). Grupa to ta sama litera, po której prowadzenie układa superserie; TOP SET należy do grupy swojego ćwiczenia, ćwiczenie bez numeru stoi osobno. Inne ekrany bez zmian. SW `trening-v80`.
* Przegląd klienta: odstęp w grupie mniejszy niż między grupami.

**76. Dwa ćwiczenia dodane do BAZY — 17.10.2026.**

Trener: „dodaj mi do bazy ćwiczenie S/l clean i B/l dragonflag bent knees” (z linkiem do filmu „Dragon Flags (bent legs)”).

* **B/l dragonflag bent knees** (EX-3626): Core, part c, coeff 0,75, masa ciała, obustronne — jak B/l dragonflag eccentric. Film z linku gra w aplikacji.
* **S/l clean** (EX-3627): Lower pull, part d, coeff 0,5, kg, skok 1 kg, na jednej nodze — powtórzenia na stronę. Parametry jak Bulgarian clean plyo, skok jak Clean. Poza listą dwuboju — progresja zwykłego akcesorium. Bez filmu (kontrola planu zgłosi „bez nagrania”, dopóki trener nie poda linku).
* Numery za bibliotekami filmów (import bierze kolejny numer po wszystkich). BAZA trenera: 164 z arkusza + 4 dodane.

**77. Własne ćwiczenia w konsoli — 17.10.2026.**

Trener: „dodaj możliwość wpisywania własnej nazwy ćwiczenia podczas tworzenia planu — razem z coeff, part, kategorią itp.”

* **Konsola:** w liście ćwiczeń pozycji „＋ Własne ćwiczenie…”, w wyszukiwarce „Nie ma na liście? Dodaj własne ćwiczenie” (z wpisaną nazwą). Okienko: nazwa, kategoria (domyślnie z szkieletu pozycji), wzorzec ruchu (part), coeff, progresja, skok (tylko przy kg / dodatkowym ciężarze), jednostronne, film. Po zapisie ćwiczenie stoi w pozycji, na liście z dopiskiem „· własne”; ✎ obok poprawia pola we wszystkich planach. Brak pola i zajęta nazwa — komunikat w okienku od razu.
* **Zaplecze** (`konsola/cwiczenia-wlasne.ts`): tabela `cwiczenie_wlasne` (schemat v11), numery `WL-0001…`. Przy starcie serwera i po każdej zmianie ćwiczenia wchodzą do katalogu silnika (`katalog.ustawWlasne`) — plan, telefon, eksport (zakładka BAZA) i import arkusza widzą je jak każde inne. Serwer sprawdza pola jeszcze raz (nazwa wolna w całym katalogu, kategoria, part, coeff 1/0,75/0,5/0,25, progresja, skok 0–20 kg, link). `/api/cwiczenia-wlasne` — lista trenera, `POST` dodaje, `PUT /…/WL-…` poprawia. Generator ich nie losuje.
* Testy: `konsola/testy/cwiczenia-wlasne.test.ts` (dodanie, odmowy, skok bez kg, w planie z ciężarem i na telefonie z filmem, poprawka we wszystkich planach, restart serwera), eksport, migracja (v11). Przegląd ekranów: odmowa przy zajętej nazwie, zapis z pól okienka, „· własne” i ✎, poprawka coeff liczy się od razu, „Nie ma na liście?” z nazwą.

**78. Serwer bierze zmiany co minutę — 17.10.2026.**

Trener: „jest możliwe, żeby zmiany były od razu, a nie po tych 15 minutach?”

* `konsola/wdrozenie/aktualizuj-serwer.sh`: cron co minutę zamiast co kwadrans — poprawka jest na serwerze w 1–3 minuty (do minuty na zauważenie, reszta to kopia bazy i przebudowa). Stary wpis „*/15” skrypt przestawia sam przy pierwszym przebiegu po aktualizacji — bez logowania się na serwer; nowa instalacja (`instaluj.sh`) od razu co minutę.
* Blokada `flock` — przebudowa trwa dłużej niż minuta, drugi przebieg nie zacznie drugiej obok. Przebieg „bez zmian” nie zapycha logu (1440 linijek na dobę), tylko nadpisuje `aktualizacja-ostatnio.txt`.
* Kopie przed aktualizacją we własnej puli (`przed-aktualizacja`, 30 ostatnich) — przy kilku aktualizacjach dziennie nie wypychają codziennych (te zostają na miesiąc).
* Natychmiast co do sekundy dałby tylko webhook z GitHuba albo GitHub Actions z kluczem SSH — oba wymagają ustawień w GitHubie i na serwerze, a i tak zostaje przebudowa (ok. minuty). Co minutę daje prawie to samo bez żadnej konfiguracji.
* Sprawdzone na próbnym repozytorium z podstawionym cronem: przestawienie wpisu, jeden wpis do logu, wyjście przy zajętej blokadzie. Test puli kopii w `testy/kopie.test.ts`.

**79. Bez dopisku „(biblioteka)” — 17.10.2026.**

Trener: „usuń z niektórych nazw ćwiczeń »(biblioteka)«, jeżeli nie jest ona potrzebna”.

* Konsola: ćwiczenie z biblioteki filmów w wierszu planu stoi samą nazwą. Dopisek zostaje tylko jeden — „(spoza szkieletu)”, gdy kategoria ćwiczenia nie pasuje do kategorii pozycji (tak samo dla BAZY, bibliotek i własnych). Skąd jest ćwiczenie, dalej widać w wyszukiwarce 🔎 (źródło w opisie pod nazwą). Telefon klienta i arkusz nigdy go nie pokazywały.

**80. 🗑 — usunięcie ćwiczenia z pozycji — 17.10.2026.**

Trener (zrzut planu z „Landmine core” w D1): „chciałbym teraz możliwość usuwania wybranych ćwiczeń … przycisk x albo kosz, może być z pytaniem o potwierdzenie”.

* Konsola: 🗑 w każdym wierszu z ćwiczeniem (obok 🔎 i ▶; w pustym wierszu niewidoczny, kolumna się nie przesuwa). Pytanie: „Usunąć „Landmine core” z D1?”, przy ćwiczeniu, które klient już robił — dopisek, że jego wpisy zostaną w historii, a z planu zniknie we wszystkich tygodniach. Po „OK” znika ćwiczenie i ustawienia trenera pod nie (serie, powtórzenia, RPE, procent, ciężar na sztywno, podmiany, „G”, „S”, „R”); numer pozycji i kategoria szkieletu zostają. ⌘Z / „Cofnij” przywraca.
* Przegląd ekranów: pytanie z nazwą i „Anuluj” bez zmian, „OK” usuwa i zapisuje, „Cofnij” przywraca, w pustym wierszu kosza nie widać; cele dotykowe ≥ 24 px na telefonie i iPadzie.

**81. S/l clean z progresją jak Clean — 17.10.2026.**

Trener: „moje ćwiczenie s/l clean — zrób, żeby progresja w nim przebiegała podobnie jak w zwykłym clean”.

* S/l clean (EX-3627) na liście dwuboju (`DWUBOJ`, teraz 34): ten sam blok objętościowy i intensyfikujący w % 1RM, deload 4 × 2 na 70 %, TOP SET 88 / 91 / 93 % w intensyfikacji, „Najpierw sprawdź swój maks” bez 1RM, ocena techniki i szybkości sztangi. Procent od własnego 1RM (na jedną nogę), powtórzenia na stronę. Przykład: 1RM 50 kg → T1–T6 35 · 36 · 38 · 38 · 39 · 40 kg (objętość). Konsola pokazuje „D” i procent zamiast RPE; „G” robi z niego zwykły bój.
* Migracja v12: przy ćwiczeniach dwuboju w zapisanych planach znikają liczby akcesorium wpisane kiedyś przyciskiem „wpisz progresję” (3 serie i RPE akcesorium) — inaczej wygrywałyby z tabelą dwuboju. Ręczne zmiany trenera, „G”, oceny i ciężary klienta zostają. Plan trenera i wersja u klienta.
* Testy: silnik (`dwuboj.test.ts` — S/l clean jak Clean, na stronę), migracja v12.

**82. ↗ — RPE 7,5 → 10 przy stałych powtórzeniach — 17.10.2026.**

Trener: „do przycisków, które są po lewej stronie przy każdym ćwiczeniu — typu G — dodajmy przycisk, który będzie wpisywał w danym ćwiczeniu samo RPE od 1 tygodnia — 7,5, przeskok o 0,5, tak żeby w 6 tygodniu było RPE 10 — i to, że wtedy ciężar liczy się na podstawie RPE. Przyda mi się do ćwiczeń, w których będę chciał zostawić daną liczbę powtórzeń i progresować ciężarem”.

* Konsola: „↗” w siatce przy Lp. (obok G, R, T), przy ćwiczeniach na kilogramy i z dodatkowym ciężarem, poza dwubojem (tam procenty) i tygodniami po cyklu. Kliknięcie wpisuje RPE 7,5 · 8 · 8,5 · 9 · 9,5 · 10 w T1–T6, stałe powtórzenia (z T1 — wpisane albo z planu — do tygodni bez wpisu) i „R” (ciężar z RPE co tydzień, nie z bloku); bój i pauzowane liczą z RPE i tak. Liczby stoją w tabeli i każdą da się poprawić. Znacznik „RPE↗” przy numerze, ↗ podświetlone. Drugie kliknięcie zdejmuje RPE i „R”, powtórzenia zostają; ⌘Z cofa. Przykład: wiosłowanie 1RM 80 kg, 8 powtórzeń → 55 kg w T1, 65 kg w T6.
* Eksport: przy „R” (i „↗”) ciężary idą do arkusza wprost — arkusz zna tylko tryb całego planu i trzymałby ciężar z bloku. Dotąd sam „R” rozjeżdżał się z arkuszem po cichu.
* Testy: eksport (RPE, powtórzenia i ciężar wprost); przegląd ekranów — wpisanie drabinki, stałe powtórzenia, „R”, liczone RPE i T6 cięższy niż T1, znacznik, zdjęcie, dwa razy „Cofnij”, brak ↗ w deloadzie.

**83. Niebieska krawędź tylko przy superserii — 18.10.2026.**

Trener (zrzut: E1 i E2 z krawędzią, F1 bez): „dlaczego niektóre kafelki mają niebieską krawędź, a niektóre nie?” — wybrana opcja 1.

* Telefon: krawędź stała na sztywno przy literach B–E (superserie w szablonie arkusza) — samotne C1 ją miało, para F1 + F2 nie. Teraz tylko przy prawdziwej superserii: co najmniej dwa ćwiczenia dnia z tą samą literą. Mówi to samo co odstęp między grupami (punkt 75) i „superseria B” w prowadzeniu. SW `trening-v81`.
* Przegląd klienta: krawędź przy B1 i B2, bez niej przy samotnym A1.

**84. Single Arm Lat Pullover — skok 1 kg — 18.10.2026.**

Trener (zrzut z telefonu, T2: „ciężar 5 kg”, „Ostatnio (T1): 6 · 6 · 6 kg × 10”): „dlaczego tutaj ciężar został 5 kg, skoro ostatnio wpisałem wszystkie serie z 6 kg? Nie powinno się dostosować?”

* Przyczyna: ćwiczenie z biblioteki Theory of Motion miało skok 2,5 kg. Seria z 6 kg zmieniała 1RM (punkt 74), ale ciężar w planie zaokrąglał się do 2,5 · 5 · 7,5 kg — 6 kg nie było na tej siatce, więc wracało 5 (symulacja: 1RM 7,5 → 9 kg, plan dalej 5 kg w T1–T3, 7,5 w T4).
* EX-2497 Single Arm Lat Pullover: skok 1 kg (jak w BAZIE trenera przy małych ćwiczeniach na wyciągu i z hantlami: „Cable lateral raise s/a”, „Dumbbell curl”), oznaczone jako zatwierdzone — ponowny import bibliotek tego nie cofnie. Ta sama symulacja: 6 kg w T1 → 6 kg w T1–T6.
* Szerzej: w bibliotekach 694 ćwiczenia z hantlami, kettlem albo wyciągiem mają skok 2,5 kg (448 — 4 kg przy kettlach, 228 — 1 kg). Do decyzji trenera, czy przestawić małe (coeff 0,25–0,5) na 1 kg.

**85. Mniejsze ćwiczenia z hantlami i na wyciągu — skok 1 kg — 18.10.2026.**

Trener: „tak, przestaw mniejsze na 1 kg” (dalszy ciąg punktu 84).

* Biblioteki filmów: 275 ćwiczeń z coeff 0,25–0,5 z hantlami albo na wyciągu (bez sztangi, trap bara, landmine i maszyny) — skok 1 kg zamiast 2,5. Duże ćwiczenia z hantlami (coeff 0,75–1, 401 pozycji) zostają na 2,5 kg; kettle — na 4 kg.
* Reguła importu (`silnik/narzedzia/import-bibliotek/reguly.py`) przestawiona tak samo — kolejny import da ten sam wynik.
* BAZA trenera bez zmian — 13 mniejszych ćwiczeń z hantlami i na wyciągu ma tam 2,5 kg (m.in. Cable row, Dumbbell fly, Seated cable facepull); do decyzji trenera.

**86. Mniejsze ćwiczenia BAZY na 1 kg; eksport z wartościami aplikacji; widoczny postęp — 18.10.2026.**

Trener: „tak, przestaw je też na 1 kg”, oraz: „na przykładzie single arm lat pullover jest już 6 kg na 10–12 powt. T1–T3 z RPE 8, ale później po zmianie RPE na 9 i powrocie na 10 powtórzeń ciężar nadal zostaje 6, bo zmiana jest za mała — co możemy zrobić, żeby uniknąć tego w planie, bo T4 wygląda tak samo jak T1 i jest to cofnięcie progresu”.

* **BAZA trenera — skok 1 kg:** Cable fly, Cable row, Cable row s/a, Dumbbell external rotation, Dumbbell fly, Dumbbell s/a Arnold press, Dumbbell s/a row, Halfkneeling s/a cable pull, Hinged dumbbell row, Hip flexors cable, Incline dumbbell fly, Jefferson cable, Seated cable facepull — i Bird dog row (wiosłowanie hantlą, ten sam skok co Dumbbell s/a row).
* **Eksport — zakładka BAZA z wartościami aplikacji:** szablon 5.18 trzymał swoje stare kategorie, part, coeff, skok i progresję (46 rozbieżności: masa ciała przy 9 ćwiczeniach i dragonflagach, skok 1 kg przy Clean, nowe skoki 1 kg…), więc arkusz liczył inaczej niż konsola. `wypelnij-arkusz.py` nadpisuje teraz te pola w wierszach, które szablon zna. Sprawdzone na wygenerowanym arkuszu (Cable row — skok 1, S/l dragonflag — masa ciała). Kółko przez LibreOffice w tym środowisku nie rusza — LibreOffice nie otwiera tu nawet niezmienionego szablonu.
* **Widoczny postęp** (`silnik/src/plan.ts`): gdy powtórzeń jest mniej niż tydzień wcześniej, a plan zakłada większy ułamek 1RM, a po zaokrągleniu do skoku wychodzi tyle samo albo mniej — ciężar idzie o jeden skok w górę. Przykład trenera: 6 × 10–12 w T1–T3 → T4 7 × 10 przy RPE 9, T5–T6 trzymają 7. Po ocenie „za trudne” (mnożnik niższy niż tydzień wcześniej) nic się nie podnosi. Tylko ciężar liczony — wpis trenera, ciężar ręczny i dwubój bez zmian. Konsola: „↑” przy ciężarze z wyjaśnieniem; eksport wpisuje go wprost.
* Testy: silnik (`widoczny-postep.test.ts`, trzy testy trybu ciężaru z nowym skokiem Cable row), eksport.

**87. Krawędź przy każdej grupie, kolory na przemian, superseria połączona — 18.10.2026.**

Trener: „zróbmy tak, że jak ćwiczenie jest w superserii, to są połączone tą krawędzią — wszystkie ćwiczenia mogą mieć krawędź, te pojedyncze tak samo, tylko niech zmienia się ich kolor na przemian”.

* Telefon, lista dnia: każda karta ma krawędź po lewej (4 px). Kolejne grupy — pojedyncze ćwiczenie albo superseria — na przemian niebieska i fioletowa. Karty jednej superserii łączy ciągła krawędź przez odstęp między nimi, złączone rogi bez zaokrąglenia. TOP SET w grupie swojego ćwiczenia; bieżące ćwiczenie zostaje przy kolorze swojej grupy. Zastępuje punkt 83 (krawędź tylko przy superserii). SW `trening-v82`.
* Przegląd klienta: krawędź przy każdym ćwiczeniu, A1 innym kolorem niż B1 + B2, B1 i B2 połączone.

**88. Strona główna aplikacji klienta — przejrzyściej, bez zmiany działania — 18.10.2026.**

Trener (zrzut listy tygodni): „to jest teraz tak naprawdę strona główna / panel główny aplikacji klienta. Jesteśmy w stanie zmienić to, żeby było bardziej przejrzyste i wyglądało profesjonalniej, ale tak, żeby nie zmieniać działania aplikacji?”

* **Nagłówek:** „Twój plan treningowy” małą linijką, imię większe, pod nim znaczek „Cykl 8”, „5 z 18 treningów za Tobą” i pasek postępu cyklu.
* **Następny trening:** karta zamiast jednej linijki — „Wróć do treningu” / „Następny trening” małymi literami, „Dzień III · tydzień 2” dużo, skład dnia pod spodem, strzałka po prawej.
* **Tygodnie:** nagłówek sekcji „Tygodnie cyklu”, każdy tydzień jako zaokrąglona karta z ikoną stanu (✓ zrobiony na zielono, kropka — bieżący, puste kółko — przyszły), kropkami treningów i licznikiem; bieżący obwiedziony akcentem, zrobione przygaszone. Dni w środku na tle o ton jaśniejszym; zrobione przygaszone, następny obwiedziony.
* **Więcej:** „Serie maksymalne” (i „Oddech i bieg”, gdy jest) jako pozycja z opisem i strzałką.
* Działanie bez zmian — te same przyciski, identyfikatory, zwijanie tygodni, banery. SW `trening-v83`. Przegląd klienta: karta następnego treningu (etykieta, dzień, skład), znaczek cyklu i pasek.

**89. Złączenie krawędzi superserii bez przerwy — 18.10.2026.**

Trener (zrzut B1/B2): „miejsca łączenia tych krawędzi wyglądają źle, bo jest tam przerwa”.

* Przerwę robiły dwie rzeczy: zaokrąglone (3 px) rogi przy złączeniu i cienka górna ramka dolnej karty, która przecinała łącznik.
* Teraz rogi po stronie złączenia są proste, a łącznik zaczyna się tuż pod górną kartą, sięga przez odstęp i górną ramkę dolnej karty i leży nad nimi — krawędź idzie jednym pasem. Sprawdzone na powiększonym zrzucie (×3) w ciemnym i jasnym motywie. SW `trening-v84`.

**90. Eksport arkusza pobiera się na urządzenie trenera — 18.10.2026.**

Trener: „gdzie się eksportuje ten plan jako plik xlsx, bo go nie widzę?”

* Dotąd „Eksportuj arkusz” zapisywał plik na dysku i pokazywał ścieżkę. To działało, póki konsola stała na laptopie; na serwerze była to ścieżka na dysku serwera, nieosiągalna z laptopa i iPada.
* Teraz `GET /api/plany/<id>/eksport` oddaje sam plik (nazwa „<Klient> <wersja>.0.xlsx”, polskie litery w `filename*`). Konsola pobiera go od razu; okno mówi, gdzie go szukać (laptop: Pobrane, iPad: Pliki → Pobrane) i ma przycisk „⬇ Pobierz jeszcze raz”, gdyby Safari zatrzymało pierwsze pobranie. Kopia na dysku serwera zostaje jak dotąd.
* Testy: `eksport-pobieranie.test.ts` (nagłówek, plik zip z nazwą klienta, 404 dla nieistniejącego planu); przegląd ekranów łapie pobranie w przeglądarce i czyta z pliku zakładkę BAZA.

**91. Instrukcja dla klienta: strona, film i prezentacja — 18.10.2026.**

Trener: „czy jesteś w stanie przygotować mi jakieś wideo / prezentację / instrukcję używania tej aplikacji, którą będę mógł wysyłać klientom przed ich pierwszym planem?”

* **Strona `/instrukcja`** (bez logowania, bez danych — przykładowy klient „Jan Przykładowy”): film, „W skrócie” w pięciu krokach, osiem kroków ze zrzutami (otwórz plan, ekran główny, skąd wziąć ciężary, RPE, trening z listy i superserie, ocena i wpis serii, prowadzenie z przerwą, zakończenie i tryb offline), częste pytania. Jasny i ciemny motyw jak w aplikacji; teksty bez form rodzajowych tam, gdzie się da.
* **Film** 1080×1920, ~75 s, MP4 — dwanaście plansz z ekranami i podpisami, przejścia płynne. **Prezentacja PDF** — te same plansze. Oba do pobrania ze strony.
* **Skąd:** `npm run instrukcja` — aplikacja klienta na świeżej bazie, przykładowy plan na 3 dni, zrzuty z iPhone’a (×3) z zaznaczeniem, gdzie dotknąć; plansze składa Chromium, film i WebP ffmpeg. Po zmianach w aplikacji klienta wystarczy puścić jeszcze raz.
* **Gdzie trener ją ma:** okno „Link dla klienta” — link do instrukcji i przycisk „Kopiuj link + instrukcję”. **Klient:** „Więcej” → „Jak korzystać z aplikacji” (nowa karta). SW `trening-v85`.
* **Serwer:** odpowiedzi 206 na zakres bajtów (bez nich Safari na iPhonie nie włącza filmu), typy WebP, MP4 i PDF. Strona poza `/klient/`, żeby film nie szedł przez service worker.
* Testy: brama dostępu (instrukcja bez logowania, zakresy 206/416, podobny adres dalej za hasłem); przeglądy: link w aplikacji klienta i w oknie linku w konsoli.

**92. „Raised bird dog” → „Elevated bird dog” — 18.10.2026.**

Trener: „zmień nazwę ćwiczenia w bazie z raised bird dog na Elevated bird dog”.

* BAZA (`docs/dane/baza-cwiczen.json`, EX-0167) i dane silnika z generatora. Plany trzymają ID, więc każdy plan, konsola i telefon klienta pokazują nową nazwę od razu; wczytanie starego arkusza znajduje ćwiczenie po ID z ukrytej kolumny.
* Eksport: szablon 5.18 zna EX-0167 pod starą nazwą. Wiersz zakładki BAZA odnajduje się teraz po ID i dostaje nową nazwę (`dopisz_do_bazy`) — wcześniej doszedłby drugi wiersz z tym samym ID, a stara nazwa została w arkuszu klienta. Dotyczy też każdej przyszłej zmiany nazwy. Test: `eksport-pobieranie.test.ts` (bez poprawki: dwa wiersze, z poprawką: jeden).

**93. Usuniętą podpowiedź o ekranie głównym da się przywrócić — 18.10.2026.**

Trener: „u [klienta] w planie znowu nie ma tego okienka informującego o tym, że można dodać skrót do planu do ekranu startowego”.

* Podpowiedź chowa się tylko w dwóch przypadkach: trening otwarty z ikony (skrót już jest) albo „✕” dotknięte na tym telefonie — telefon pamięta to dla tego linku. „✕” stał ok. 10 px od strzałki zwijania, a cały nagłówek zwija baner — przypadkowe trafienie chowało podpowiedź na dobre, bez drogi powrotu. To samo, gdy link klienta był testowany na innym telefonie.
* Teraz: usunięta podpowiedź (poza aplikacją otwartą z ikony) ma pozycję „Dodaj do ekranu głównego” w „Więcej” — dotknięcie przywraca ją rozwiniętą i przewija do niej. Odstęp „✕” od strzałki większy. Zdanie o tym w instrukcji dla klienta (krok 2). SW `trening-v86`.
* Przegląd klienta: pozycji nie ma, póki podpowiedź jest; po „✕” jest; przywrócona — rozwinięta i zostaje po ponownym otwarciu.

**94. Powrót z instrukcji do planu w aplikacji z ekranu głównego — 18.10.2026.**

Trener: „po wejściu w »jak korzystać z aplikacji« ze skrótu dodanego do ekranu telefonu nie ma strzałki powrotnej do panelu głównego planu treningowego”.

* Przyczyna: link otwierał instrukcję w nowej karcie (punkt 91). W aplikacji otwartej z ikony nie ma paska przeglądarki ani strzałki wstecz, a nowe okno nie ma historii — przycisk powrotu na stronie pokazywał się tylko przy historii, więc nie było go wcale.
* Teraz: instrukcja otwiera się w tym samym oknie, a aplikacja dopisuje adres powrotu (`/instrukcja?wroc=/k/<token>`). Strona pokazuje wtedy przyklejony u góry pasek „← Wróć do planu”: z historią cofa (plan wraca tam, gdzie był), bez niej przechodzi pod adres planu. Przyjmowany jest wyłącznie adres planu na tej stronie (`/k/…`) — instrukcja wysłana linkiem albo z obcym adresem paska nie ma. SW `trening-v87`.
* Przegląd klienta: link z adresem powrotu i bez nowej karty, pasek przyklejony (widoczny także na dole strony), powrót z historią i bez niej (okno jak z ikony), brak paska bez adresu planu i z obcym adresem.

**95. Instrukcja na górze strony głównej klienta — 18.10.2026.**

Trener: „klient mi napisał, że na instrukcję i filmik natrafił dopiero po przeklikaniu samodzielnie wszystkiego w planie, więc chyba musimy dać go gdzieś na górze, ale z możliwością minimalizowania / usunięcia tej informacji”.

* Karta „Jak korzystać z aplikacji” zaraz pod „Następnym treningiem”, nad „Skąd wziąć ciężary” i podpowiedzią o ekranie głównym: „Pierwszy raz? Minutowy film i instrukcja krok po kroku…”, przyciski „▶ Obejrzyj instrukcję” i „Schowaj”.
* Od pierwszego wejścia rozwinięta. „Schowaj”, dotknięcie nagłówka albo obejrzenie instrukcji zwija ją do jednej linijki i tak zostaje (pamięć telefonu, osobno dla każdego linku); dotknięcie linijki rozwija. „✕” usuwa ją — instrukcja zostaje w „Więcej”. Ten sam wygląd i zachowanie co podpowiedź o ekranie głównym. SW `trening-v88`.
* `npm run instrukcja` chowa tę kartę na zrzutach — instrukcja nie pokazuje linku do samej siebie, a obecne zrzuty i film zostają aktualne.
* Przegląd klienta: na pierwszym ekranie, pod następnym treningiem i nad resztą; „Schowaj” → linijka, zostaje po ponownym otwarciu, rozwija się dotknięciem; po obejrzeniu sama linijka; „✕” usuwa, „Więcej” zostaje; usunięta nie wraca.

**96. Konsola bez „Wczytaj plan z arkusza”, nowy plan bez przykładowego nazwiska — 19.10.2026.**

Trener: „z konsoli trenera usuńmy opcję wczytaj z arkusza, a w opcji nowy plan usuńmy to »np. Zofia K«”.

* Z listy klientów zniknął panel „Wczytaj plan z arkusza” (z obsługą w `app.js`), a pole „Klient” w „Nowym planie” nie ma już podpowiedzi z nazwiskiem.
* Mechanizm wczytywania został w tle: `npm run wczytaj-arkusze` (cały katalog plików) i `POST /api/import` na serwerze. Z tego drugiego korzysta przegląd ekranów — wyeksportowany arkusz wraca z tymi samymi ćwiczeniami, a tak powstały klient służy dalej do sprawdzenia scalania kartotek. Przycisk da się przywrócić bez zmian po stronie serwera.
* Przegląd ekranów: brak panelu i podpowiedzi na liście; arkusz przyjęty przez serwer (201).

**97. Progresja dwóch ćwiczeń i „Wpisz serie ręcznie” — 19.10.2026.**

Trener (zrzut karty D1): „na tym ćwiczeniu jest wpisany w ciężarze czas, a to ćwiczenie jest robione z ciężarem (z piłką). W side plank hip drop jest czas, a to jest z masą ciała. Poza tym zamiast »+ zapisz, co poszło« dajmy »Wpisz serie ręcznie«”.

* **Supine Iso Adduction Knees to Chest** (EX-3601, biblioteka Catalyst): progresja „czas” → „kg”, skok 1 kg. Reguła importu dała „czas” po słowie „Iso” i nie rozpoznała piłki. Wpis ma „zatwierdzone” — kolejny import bibliotek zachowuje poprawkę (`buduj.py`, `POLA_TRENERA`).
* **Side plank hip drop** (EX-0181, BAZA): „czas” → „masa ciała”. Eksport poprawia ten wiersz w zakładce BAZA szablonu sam (pola uzgadniane).
* Obie zmiany działają od razu we wszystkich planach z tymi ćwiczeniami: zamiast „czas” w kolumnie ciężaru — kilogramy (najpierw „dobierz”) albo masa ciała.
* **Aplikacja klienta:** przycisk pól serii na karcie ćwiczenia — „Wpisz serie ręcznie” (dawniej „+ zapisz, co poszło”); po wpisaniu dalej „✎ edytuj”. Zdanie o nim w instrukcji (krok 6), zrzuty, film i PDF instrukcji odświeżone. SW `trening-v89`.
* **Przegląd filmów:** kontrola „ekran nie przewinięty” mierzyła położenie przed kliknięciem „▶ film”, a Playwright przed kliknięciem sam przewija stronę do przycisku (u góry karty, pola serii niżej) — dlatego od kilku dni była czerwona przy działającej aplikacji. Teraz pomiar pod otwartą kartą; po zamknięciu położenie to samo co do piksela.

**98. Kilogramy przy dwóch ćwiczeniach z piłką, „↗” wraca do stanu wyjściowego, „±” przesuwa powtórzenia — 19.10.2026.**

Trener: „tak, przestaw oba na kg. Poza tym przy kliknięciu strzałki ustawiającej RPE od 7,5 do 10 i odkliknięciu jej powtórzenia zostają zmienione na sztywno tą samą wartością i nie wracają do stanu wyjściowego. Chciałbym jeszcze opcję zmiany ilości powtórzeń, w której w zależności od tego, w jaki sposób progresuje dane ćwiczenie, powtórzenia dopasowują mi się do liczby powtórzeń z 1 tygodnia (…) wyjątkiem są ćwiczenia główne z własną periodyzacją”.

* **Hooklying Adductor Squeeze** (EX-1797, „czas”) i **Glute Bridge with MB Squeeze** (EX-1629, „masa ciała”) → „kg”, skok 1 kg, „zatwierdzone” (import bibliotek zachowuje).
* **„↗” wyłączone wraca do stanu sprzed włączenia.** Włączenie zapamiętuje w pozycji (`przedRpeRosnacym`) RPE trenera, tryb ciężaru i tygodnie, którym wpisało powtórzenia; wyłączenie przywraca RPE i tryb, a te powtórzenia usuwa — chyba że trener je potem zmienił. Pozycje, przy których „↗” wyłączono przed tą poprawką, nie mają zapisu — powtórzenia z nich zdejmuje „±” z pustym polem.
* **„±” — przesunięcie powtórzeń.** Okienko pyta o T1; cała progresja idzie o tyle samo (8–10/8–10 → 10–12/10–12; masa ciała 10–15 → 12–17). Silnik: `przesunieciePowtorzen` w pozycji, doliczane do automatu akcesorium (deload przy masie ciała — z przesuniętego T1); liczby wpisane w tygodniach (także przez „↗”) idą o tę samą różnicę. Nie przy boju, pauzowanych i dwuboju. Puste pole — progresja z planu (bez przesunięcia i bez wpisanych powtórzeń). Znacznik „powt. +2”, wpis w legendzie, 🗑 czyści, zmiana widoczna w „Zmiany czekają na zatwierdzenie”, eksport wpisuje powtórzenia wprost.
* **Granica 15 powtórzeń tylko przy ciężarze z tabeli %1RM** (kg, dodatkowy ciężar — `PROGRESJE_Z_TABELI`): automat bez tabeli sięga do 30, a kontrola „Powtórzenia poza tabelą” nie zgłasza masy ciała, czasu ani gumy. Przy masie ciała ocena „za łatwe” może więc teraz dać w T6 więcej niż 15.
* Testy: silnik `przesuniecie-powtorzen.test.ts` (7), eksport (1); przegląd ekranów: „↗” wraca do stanu wyjściowego, „±” o 2 (kształt, znacznik), odmowa powyżej 15, puste pole, brak „±” przy boju, „Cofnij”.

**99. Bez „Kopiuj link + instrukcję” — 19.10.2026.**

Trener: „przycisk kopiuj link i instrukcję nie działa prawidłowo, więc możesz go usunąć — zostaw tylko ten faktyczny link do instrukcji, który jest wyżej”. Okno „Link dla klienta”: „Kopiuj link”, link do instrukcji i „Unieważnij link”. Przegląd ekranów pilnuje, że przycisku nie ma, a link do instrukcji się otwiera.

**100. „±” liczy od progresji z planu — 19.10.2026.**

Trener: „ten nowy przycisk nie działa — jak wpisuję tam 6 zamiast 8, jak było wyjściowo, to kolejne tygodnie się nie dostosowują, bo w T2 nadal jest 9 po zmianie, a nie 7”.

* Przyczyna: „±” przesuwał o różnicę między nową liczbą a **bieżącym** T1. Po wpisaniu 6 w pole T1 i kliknięciu „±” okienko podsuwało 6 — różnica zero, nic się nie działo (odtworzone w przeglądarce: 6 · 9 · 10 · 8 · 9 · 10).
* Teraz liczy serwer (`powtorzeniaOdT1` w silniku, `POST …/tygodnie` z trybem `powtorzenia-od-t1`): przesunięcie = T1 − T1 z progresji planu, powtórzenia wpisane w T1–T6 ustępują, więc cała progresja idzie od T1 bez względu na to, czy liczbę wpisano w okienku, czy wcześniej w polu. Przy „↗” wszystkie tygodnie dostają liczbę z T1 (stałe powtórzenia), a po wyłączeniu „↗” zostaje automat od T1. Okienko podsuwa liczbę z pola T1; konsola najpierw czeka na zapis tego, co trener właśnie wpisał. Odmowa (powyżej 15 przy ciężarze, bój) przychodzi z serwera z wyjaśnieniem.
* Testy: silnik +7 (m.in. „najpierw 6 w T1, potem ±”), przegląd ekranów: ten sam przebieg w przeglądarce (6 · 7 · 8 · 6 · 7 · 8 przy 8–10), cofanie czterech kroków.

**101. Instrukcja: przy dobieraniu ciężaru powtórzenia nie są sztywne — 19.10.2026.**

Trener: „jeżeli ktoś dobiera ciężar w trakcie treningu, a nie z serii maksymalnej, i ma np. zrobić 8 powtórzeń przy RPE 8, a okaże się, że zrobił 10 i to było jego RPE (2 w zapasie), to też może to wpisać, a ciężar się dostosuje. Nie trzeba za wszelką cenę trzymać się liczby powtórzeń — musimy o tym poinformować i w instrukcji napisanej, i na filmie”.

* Sprawdzone na serwerze: „dobierz” przy 8 @ RPE 8, wpisane 30 kg × 8 → T2 30 kg, T4 32,5 kg; wpisane 30 kg × 10 → T2 32,5 kg, T4 35 kg (silnik liczy 1RM z wpisanych powtórzeń przy RPE z planu).
* **Strona `/instrukcja`:** krok 3 — pierwsza seria to ciężar i tyle powtórzeń, ile naprawdę wyszło, plus ramka z przykładem (8 w planie, 10 zrobione z 2 w zapasie → wpisz 10; od razu widać 32,5 kg × 8 w podpowiedziach kolejnych serii; liczy się zapas z planu); krok 6 — „wpisuj to, co naprawdę zrobiłeś”, zrzut „W planie 8 — wpisane 10”; nowe pytanie w „Częstych pytaniach” (także w drugą stronę: 6 zamiast 8 → lżej).
* **Film i PDF:** nowa plansza „Dobierasz ciężar? Powtórzenia nie są sztywne” (plan 8 przy RPE 8, wyszło 10 i nadal 2 w zapasie → wpisz 10 — ciężary pójdą w górę), z zaznaczonym planem i wpisem; wpis na karcie we wszystkich zrzutach to 30 × 10. Film ~83 s, 13 plansz.

**102. Karty na górze z „✕”, ich treść na stałe w „Więcej” — 19.10.2026.**

Trener (zrzut trzech kart): „wszystkie te zakładki na górze niech mają X, żeby je usunąć, czyli to »skąd wziąć ciężary« też, ale za to na dole żeby wszystkie te informacje były w zakładkach na stałe”.

* **„Skąd wziąć ciężary” ma „✕”** (jak „Jak korzystać z aplikacji” i „Dodaj do ekranu głównego”). Usunięcie per cykl, jak zwijanie (`pomiary-usuniete-<token>` = klucz cyklu): nowy plan z nowymi ćwiczeniami bez ciężarów przynosi kartę z powrotem — tak trener ustalił 10.10.2026.
* **„Więcej” na stałe**, bez względu na karty na górze: „Jak korzystać z aplikacji” (link), „Skąd wziąć ciężary” (rozwijana: obie drogi z działającymi przyciskami, zdanie, że dobierając ciężar wpisuje się powtórzenia, które wyszły, i „Co to jest RPE?”), „Dodaj do ekranu głównego” (rozwijana: ta sama podpowiedź, na Androidzie przycisk instalacji; otwarta z ikony — że trening już tam jest). Zastępuje pozycję, która od 18.10 tylko przywracała usuniętą podpowiedź (punkt 93).
* Instrukcja dla klienta: krok 1 — karty na górze zwija się albo usuwa, wszystko jest też w „Więcej”; krok 2 — zdanie o „Więcej”; zrzuty, film i PDF odświeżone (✕ przy „Skąd wziąć ciężary”). SW `trening-v90`.
* Przegląd klienta: trzy stałe pozycje od pierwszego wejścia; po „✕” podpowiedź instalacji rozwija się w „Więcej”; „Skąd wziąć ciężary” w „Więcej” (drogi, RPE, zdanie o powtórzeniach), „✕” na górze, nie wraca po ponownym otwarciu; dalsza droga „zacznij od razu” przyciskiem z „Więcej”.

**103. Karty zamknięte „✕” wracają po „Resetuj plan” — 20.10.2026.**

Trener: „zrób tak, że jeżeli ktoś pozamyka te karty z instrukcjami na górze X-em, to po resecie planu z konsoli trenera one wracają”.

* „Skąd wziąć ciężary” miało już reset w kluczu zapisu (`kluczZwiniecia` = plan@resetOd). „Jak korzystać z aplikacji” i „Dodaj do ekranu głównego” zapisują teraz stan razem ze znacznikiem resetu (`stanKarty` / `ustawStanKarty`: „usunieta|<resetOd>”): po „↺ Resetuj plan” serwer podaje nowe `resetOd`, zapis przestaje pasować i karty wracają rozwinięte. Zapis sprzed zmiany (bez „|”) dostaje przy pierwszym odczycie znacznik bieżącego resetu — nic nie wraca bez powodu.
* Okno „↺ Resetuj plan” w konsoli mówi o tym trenerowi. SW `trening-v91`.
* Przegląd klienta: trzy karty zamknięte „✕”, po ponownym otwarciu schowane, po resecie wszystkie rozwinięte; ponowne „✕” po resecie działa jak wcześniej.

**104. Bez nagrań z prywatnego kanału trenera — 23.10.2026.**

Trener: „popraw bazę ćwiczeń tak, żeby nie było w niej żadnych nagrań z [mojego prywatnego] kanału. Cała reszta nagrań może zostać — to często są moi klienci i nie chcę ich nigdzie wstawiać”.

* Autor każdego linku YouTube spoza zweryfikowanych bibliotek (ToM, Catalyst, OPEX) sprawdzony przez oEmbed: 14 filmów z prywatnego kanału trenera przy 15 ćwiczeniach BAZY (jeden film wisiał przy dwóch). Linki usunięte z `docs/dane/baza-cwiczen.json` (pole `film: null`), z katalogu silnika (generator) i z zakładki BAZA szablonu `arkusz/MasterTemplate-5-18.xlsx` — eksport planu do xlsx bierze wiersze BAZY z szablonu. Filmy z kanału CraftMyPlan i z innych kanałów zostały.
* Dwa z tych ćwiczeń (Eccentric pull up, Incline dumbbell press) mają filmy z bibliotek i klient widzi je jak dotąd; 13 zostało bez filmu — kontrola planu zgłosi przy nich „Ćwiczenie bez nagrania”, dopóki trener nie poda nowego linku. Ta kontrola liczy teraz także filmy z bibliotek (wcześniej patrzyła tylko na link z arkusza).
* Ćwiczenia własne trenera i filmy rozgrzewek leżą w bazie na serwerze, nie w repozytorium — tych zmiana nie dotyczy. Stare wersje plików zostają w historii repozytorium.

**105. Bez filmów z kanału CraftMyPlan; nowe ćwiczenie „Barbell shrugs behind the back” — 23.10.2026.**

Trener: „usuń też filmy z kanału CraftMyPlan. Poza tym dodaj mi to ćwiczenie do bazy” (link do filmu „Barbell Shrugs Behind The Back”).

* 6 linków z kanału CraftMyPlan usunięte tak samo jak w punkcie 104 (BAZA, katalog silnika, zakładka BAZA szablonu arkusza). Filmy z bibliotek zostają u Dumbbell bench press (4), Dumbbell bench press alternating (1) i Incline dumbbell press alternating (2). Bez filmu zostały Dumbbell over head press, Dumbbell over head press alternating i Dumbbell s/a Arnold press.
* **Barbell shrugs behind the back** (EX-3628): Upper pull vertical (szrugsy wg zasad klasyfikacji), part r, coeff 0,25 (izolacja, jak Calf raises), kg, skok 2,5 kg, obustronne. Film z kanału My PT Hub (sprawdzony oEmbedem: osadzanie dozwolone) gra w aplikacji z podpisem „wybrany przez trenera”. BAZA trenera: 164 z arkusza + 5 dodanych.

**106. Filmy Catalyst Athletics bez 7-sekundowego intro — 23.10.2026.**

Trener: „filmiki na kanale Catalyst Athletics zaczynają się 7-sekundowym intro, które jest irytujące podczas korzystania z aplikacji — mogłyby się zaczynać akurat z tego kanału od 7 sekundy?”

* Ustawienie przy źródle, nie przy 618 wpisach: `pomin_poczatek_s: 7` w `filmy-cwiczen.json` (i w imporcie bibliotek, żeby kolejny import go nie zgubił). Odtwarzacz w aplikacji i w podglądzie konsoli dostaje `start=7`; czas na przycisku „Poradnik” jest bez intro. Przewinąć do początku dalej można. Film krótszy niż intro + 5 s grałby od początku (Catalyst ma najkrótszy 31 s). Link „Otwórz na YouTube” bez zmian.
* Testy: silnik (`wideo.test.ts`: Catalyst od 7 s, inne kanały od początku, krótki film, kontrola danych 1–60 s), przegląd filmu (poradnik Catalyst z `start=7`, pokaz OPEX bez).
* Automat na serwerze (`aktualizuj-serwer.sh`) umie przejść na przepisaną historię gałęzi — przygotowanie do punktu 107. SW `trening-v92`.

**107. Linki do filmów trenera usunięte z historii repozytorium — 23.10.2026.**

Trener: „wyczyść też te linki z historii repozytorium”.

* `git filter-repo` na gałęzi (od pierwszego commita `main`, który zostaje nietknięty): w każdej wersji plików 20 linków z punktów 104–105 zamienione na `null` (BAZA, katalog silnika, dwa testy), a w każdej wersji szablonu arkusza wyczyszczone ich napisy w zakładce BAZA. Po przepisaniu żaden osiągalny obiekt gałęzi nie zawiera tych filmów; drzewo ostatniej wersji identyczne jak przed przepisaniem. Wszystkie commity mają nowe numery — numery commitów sprzed 23.10.2026 zapisane w tym dokumencie już nie istnieją.
* Wysłane z `--force-with-lease`. Automat na serwerze przeszedł na nową historię sam (punkt 106) — potwierdzone tym, że serwer podał nowy SW.
* Czego to nie usuwa: kopii po stronie GitHuba (stare commity zostają dostępne pod dawnym numerem, póki GitHub ich nie wyczyści — o to prosi się GitHub Support) i kopii, które ktoś zdążył pobrać lub rozwidlić.

**108. Analiza ruchu: wybór punktów widocznych na obrazie — 23.10.2026.**

Trener (pytanie o zaznaczenia w „Trajektoriach”, które nie chowały punktów): „dodajmy faktycznie tą opcję, żebym mógł samodzielnie ustalić, jakie punkty będą widoczne na analizie — chciałbym np. móc obserwować tylko punkty po prawej stronie bez lewej w niektórych sytuacjach”.

* „Punkty na obrazie” pod przełącznikami (zwinięte; w nagłówku stan: „wszystkie”, „tylko prawa strona”, „6 z 13”…): przyciski „Wszystkie”, „Tylko prawa strona”, „Tylko lewa strona” i pole przy każdym z 13 głównych punktów, z kropką w kolorze strony. Schowany punkt znika z obrazu razem z liniami, kątem przy nim, palcami i stopą; przy jednej stronie znikają też oko, ucho i kącik ust drugiej. Dotknięcie obrazu nie wybiera schowanego punktu. Dane bez zmian — tabele, wykres, trajektorie i zapis mają wszystkie punkty. „Tylko prawa / lewa” przestawia też stronę ciała dla kątów. Wybór zostaje w przeglądarce na tym urządzeniu. Opis w `docs/06-analiza-ruchu.md` (5a).
* Testy: `analiza-ruchu.test.ts` (+4: przynależność 33 punktów, „tylko prawa”, rysowanie na płótnie zapisującym kolory i linie, kąt i dotknięcie przy schowanym punkcie). Przegląd ruchu (+11, bez filmu — sztuczna analiza): piksele lewej strony na obrazie 314 → 0 po „Tylko prawa strona”, prawa zostaje; strona kątów P; tabela z obiema stronami; dotknięcie schowanego kolana; „6 z 13”; wybór po ponownym otwarciu; telefon i iPad bez przewijania w bok; „Wszystkie”.

**109. Analiza ruchu od pierwszej klatki filmu — 23.10.2026.**

Trener: „jak wstawiam nagranie przysiadu do analizy, to aplikacja ucina mi początek filmu, gdzie dana osoba stoi prosto jeszcze przed wykonaniem przysiadu, i filmik startuje, jak już zaczyna robić przysiad. Potrzebuję, żeby filmiki zaczynały się od samego początku — tak jak je prześlę — bo zależy mi też na oznaczonych punktach w pozycji początkowej”.

* Przyczyna (`detektor.js`): analiza brała klatki zgłaszane w trakcie odtwarzania, a przerwy przed pierwszą zgłoszoną klatką nie uzupełniała. Pierwsza klatka przepadała zawsze; gdy odtwarzanie ruszało wolno (Safari, pierwsze uruchomienie modelu) — cały początek. Odtworzone w przeglądzie: przy 1,2 s bez zgłoszeń analiza zaczynała się od 1000 ms, 90 ze 120 klatek. Ekran po analizie stawał na pierwszej policzonej klatce — stąd „film startuje od przysiadu”.
* Teraz: klatka 0 liczona przed startem odtwarzania, przerwa za nią uzupełniana przewinięciem jak każda inna (także przy „najwyżej 15/30 kl./s”), ostatnie klatki po końcu odtwarzania — też (najwyżej trzy). Dotyczy wgranego filmu i nagrania kamerą. Zapisane wcześniej analizy (.json) mają dalej ucięty początek — wystarczy przeliczyć film jeszcze raz.
* Przegląd ruchu, „Początek filmu” (+10): film z licznikiem klatek (ffmpeg, 4 s, 30 kl./s) — każda klatka, obciążony procesor, wolny start odtwarzania, 15 kl./s i 15 kl./s z wolnym startem: pierwsza klatka 0 ms, komplet klatek, największa przerwa jedna klatka, po analizie film stoi na początku. Na starej wersji wszystkie pięć czerwone.

**110. Punkty na obrazie — układ jak ciało, od razu widoczne — 23.10.2026.**

Trener: „możesz mi te punkty jakoś ułożyć w sposób bardziej przejrzysty? I tak, żeby to było od razu widoczne bez konieczności rozwijania — ewentualnie może być możliwość zwinięcia tego z powrotem”.

* Zamiast 13 pól w rzędzie — tabela: wiersze od głowy do stóp (głowa, bark, łokieć, nadgarstek, biodro, kolano, staw skokowy), kolumny Lewa i Prawa z kropką koloru strony, jak w tabeli kątów. Pole w nagłówku kolumny zaznacza lub odznacza całą stronę (pół-zaznaczone, gdy strona jest schowana częściowo). Przyciski „Wszystkie / Tylko prawa / Tylko lewa strona” obok tabeli, na telefonie pod nią w rzędzie.
* Panel od razu rozwinięty, w ramce; „zwiń” / „rozwiń” w nagłówku, zwinięcie zostaje na tym urządzeniu.
* Przegląd ruchu (+6): układ wierszy i kolumn, nagłówek kolumny pół-zaznaczony, pokazuje i chowa całą stronę, zwinięcie i jego zapamiętanie; telefon i iPad bez przewijania w bok.

**111. Trajektorie tylko przy widocznych punktach — 23.10.2026.**

Trener: „zrób tak, że jeżeli mamy trajektorie ruchu kolana, biodra i barku, ale któryś z tych punktów nie jest oznaczony, np. bark, to wtedy nie wyświetla się jego trajektoria — wyświetlają się tylko te, które mają swój punkt oznaczony”.

* `rysujKlatke`: trajektoria rysuje się tylko przy punkcie widocznym w „Punkty na obrazie” (`punktWidoczny`). Wybór trajektorii zostaje — po ponownym zaznaczeniu punktu droga wraca; na liście trajektorii przy schowanym punkcie dopisek „schowany”. Tabela trajektorii (zakres ruchu) bez zmian.
* „Tylko prawa / lewa strona” przenosi wybrane trajektorie na widoczną stronę (te same stawy i kolory) — inaczej przy ujęciu, w którym bliżej kamery jest druga strona, wszystkie by zniknęły.
* Testy: `analiza-ruchu.test.ts` (+1: droga barku znika, biodra zostaje); przegląd ruchu (+5, piksele kolorów trajektorii w środku ruchu: bark schowany → 0 px fioletu, biodro zostaje, dopisek „schowany”, powrót, przeniesienie na prawą).

**112. Środek ciężkości — metoda segmentowa (de Leva K/M, Braune–Fischer) — 23.10.2026.**

Trener (po rozmowie o pracy magisterskiej, de Levie i MediaPipe): „dodajmy do aplikacji możliwość analizy środka ciężkości tą metodą segmentową zgodnie z tym, co pisaliśmy — De Leva razem z rozróżnieniem na płeć, plus to wygładzenie trajektorii itd.”.

* Panel „Środek ciężkości” w analizie ruchu: model segmentów (de Leva 1996 — kobieta / mężczyzna, Braune i Fischer jak w pracy magisterskiej), obciążenie (kg, na barkach albo w dłoniach) z masą ciała, wygładzanie (Butterworth 6 Hz w obie strony). Odczyt dla bieżącej klatki, wykres w % z pasami powtórzeń (blada linia bez wygładzania), kolumna „ŚC” w tabeli powtórzeń, przełącznik „środek ciężkości” na obrazie (symbol, pion do stóp, droga). Ustawienia w zapisie JSON, wynik w CSV (5 kolumn).
* Z boku — strona z „Strona ciała” podwójnie (jak w pracy: „RA 3+3%”), wynik nad stopą (pięta 0%, palce 100%); z przodu — obie strony, między stopami. Klatka niepewna, gdy słabo widoczne punkty segmentów mają ponad 10% masy ciała.
* Parametry de Levy z Tabeli 4 (pierwszy wiersz segmentu), sprawdzone z przedrukiem tabeli i dokumentacją Visual3D; przybliżenia (głowa — środek uszu, tułów od środka barków, punkty MediaPipe zamiast środków stawów) opisane na ekranie i w `docs/06-analiza-ruchu.md` (5b).
* Testy: `analiza-ruchu.test.ts` (+11: masy modeli = 100%, przykład z pracy Xc 3,69 / Yc 4,84, strona podwójnie i niezależność od zgadywanej strony, środek uda 40,95/36,12%, nad stopą w obie strony, między stopami, obciążenie, filtr — stała / 1 Hz / 12 Hz / bez przesunięcia / luki, całe nagranie, JSON i CSV). Przegląd ruchu (+16, sztuczny przysiad z boku i z przodu): prośba o model, modele, „nad stopą” z lewą stroną podwójnie, symbol i droga na obrazie, wykres, kolumna „ŚC”, K ≠ M, obciążenie bez masy i z masą (środek wyżej), bez wygładzania, przełącznik, CSV, powrót z zapisu, telefon i iPad, „między stopami” z przodu.
* Tego samego dnia, trener: „nie widzę środka ciężkości na nagraniu” — przełącznik był zaznaczony, ale model (płeć) wybiera się w panelu niżej i nic o tym nie mówiło. Teraz przy przełączniku „środek ciężkości” stoi wyraźny przycisk „wybierz płeć osoby →” (przewija do panelu, podświetla go i ustawia kursor na liście modeli; to samo po zaznaczeniu przełącznika bez modelu), a po wyborze — nazwa modelu z „zmień”. Przegląd ruchu +3.

**113. Cofnięcie zrobionej serii w aplikacji klienta — 23.10.2026.**

Trener (zrzut z prowadzonego treningu: A1 i A2 z „✓”, „Ta seria jest już zrobiona — możesz ją poprawić”): „chciałbym, żebyśmy dodali możliwość cofania serii — tutaj mi pokazuje, że już mam zrobioną część serii z tego dnia treningowego, ale zaznaczyłem je przypadkiem”.

* Przy zrobionej serii, pod „↩ Wróć do…”, przycisk „↺ Cofnij — ta seria nie była zrobiona”. Najpierw okienko „Cofnąć tę serię?” z nazwą ćwiczenia, numerem serii i tym, co zniknie (np. „wpisane 90 kg × 6 powt.”, ocena) — „Cofnij serię” / „Zostaw”.
* Po cofnięciu: seria wraca do niezrobionych i stoi na ekranie z „Zakończ serię”; znika znacznik na mapie dnia i w liczniku „zrobione”; jej kilogramy i powtórzenia znikają też u trenera (lista serii bez niej), ocena tej serii — z oceną tygodnia, jeśli to ona ją ustaliła — i korekta następnej serii. Przy TOP SECIE — jego ciężar i ocena. Zakończony trening zostaje zakończony. SW `trening-v93`.
* Przegląd klienta (+6): przycisk przy zrobionej serii, pytanie z wpisanymi liczbami, „Zostaw” niczego nie zmienia, cofnięta seria na ekranie i licznik o jeden mniej, liczby znikają u trenera, ponowne zrobienie zapisuje serię i prowadzi dalej.

**114. Analiza ruchu: środek ciężkości obok filmu, kąty w najgłębszym punkcie, pełne nazwy — 23.10.2026.**

Trener: „segment »Środek ciężkości« dajmy bliżej samego ekranu z nagraniem, tak, żeby było możliwe obserwowanie jednocześnie nagrania i wykresu. W »Powtórzeniach« są maksymalne kąty i to jest okej, ale w pracy magisterskiej sczytywałem zakresy w stawach w najgłębszym momencie przysiadu — możemy też dodać coś takiego, bez usuwania tego, co już mamy? Możemy też dostosować nazwy — zamiast »stopa« zgięcie grzbietowe stawu skokowego”.

* Panel „Środek ciężkości” na górze prawej kolumny, obok filmu (wykres na wysokości filmu); w jednej kolumnie — zaraz pod filmem i przełącznikami (CSS: kolumny `display: contents`, kolejność). Obciążenie zwinięte z opisem w nagłówku, „wygładzanie” pod wykresem, opis metody pod „Jak to jest liczone”.
* Tabela powtórzeń: wiersz z czasami („Powtórzenie 1 · ruch · w dół · w górę”), pod nim „największe w ruchu” i „w najgłębszym punkcie” (klatka z biodrem najniżej — `najglebszaKlatka`); biodro względem kolana, rozstaw kolan do stóp i środek ciężkości z tej klatki, wiersz przenosi do niej. Osiem kolumn zamiast dwunastu — tabela mieści się obok filmu na laptopie i na iPadzie bez przewijania w bok.
* Pełne nazwy: zgięcie kolana / biodra, zgięcie grzbietowe stawu skokowego (też w tabeli kątów i na wykresie), pochylenie tułowia, biodro względem kolana, rozstaw kolan do stóp; opis pod tabelą tłumaczy oba wskaźniki.
* Testy: `analiza-ruchu.test.ts` (+1: najgłębsza klatka). Przegląd ruchu (+10): panel obok filmu na szerokim ekranie i pod filmem w jednej kolumnie (telefon, iPad), układ i nazwy tabeli, tabela bez przewijania, wiersz → klatka z biodrem najniżej, kąty „w najgłębszym punkcie” zgodne z tabelą kątów tej klatki, obciążenie zwinięte i opis w nagłówku. Próg przerwy przy 15 kl./s poprawiony na ≤ 1,5 kroku (dopuszczalne z założenia).

**115. Analiza ruchu: punkt sztangi do badania high bar / low bar — 24.10.2026.**

Trener (badanie do doktoratu: przysiad high bar bez wskazówki, high bar ze wskazówką, low bar, kamera z boku): „rozbuduj moduł analizy ruchu o punkt sztangi, który zastąpi obecne liczenie obciążenia w punkcie barku… narzędzie musi odróżnić high bar od low bar”. Szczegóły: `docs/06-analiza-ruchu.md`, 5c; instrukcja dla trenera: `docs/instrukcja-badania-sztanga.md`.

* Punkt sztangi: koniec gryfu zaznaczony na klatce 1 przed analizą („Przysiad ze sztangą”, lupa przy przeciąganiu) albo po niej; śledzony w tym samym przejściu co MediaPipe, bez bibliotek — wzór obrazu (NCC) albo kolorowa naklejka. Pewność w każdej klatce, „?” poza wynikami. Poprawka na dowolnej klatce = punkt kontrolny, śledzenie liczy się od niego do następnego (przejście przez film bez MediaPipe), cofnięcie poprawki, „następna klatka „?””, „Śledź od nowa”.
* Obciążenie „sztanga — punkt na obrazie” (domyślne, gdy jest punkt sztangi); barki i dłonie zostają. Trzy wyniki osobno — ciało, sztanga, układ (ciało + sztanga) — w px i % stopy, surowo i po tym samym filtrze; na filmie trzy znaki z drogami, na wykresie trzy linie, pas śródstopia 40–60% (do zmiany) na filmie i w tle wykresu.
* Tabela „Środek ciężkości i sztanga w powtórzeniach”: na początku, najdalej w stronę palców w zejściu (z klatką), w najgłębszym punkcie, zakres przód–tył (cały, w dół, w górę), czas w śródstopiu; „i” z dymkiem przy każdej nowej mierze.
* Zapis: JSON wersja 2 (punkt sztangi w każdej klatce, ustawienia śledzenia i pasma, kod osoby, warunek; wersja 1 otwiera się jak dotąd), CSV klatek — nowe kolumny na końcu, nowy CSV powtórzeń (powtórzenie × wynik × seria). Nazwy plików z kodu osoby i warunku. Wersja narzędzia (`0.2.0+commit`, `GET /api/wersja`; commit zapisywany przy wdrożeniu) i parametry analizy w każdym pliku — do zamrożenia na badanie, gdy trener powie.
* Testy: `analiza-ruchu.test.ts` (+17: śledzenie znacznika w obu trybach, zasłonięcie, punkty kontrolne, środek układu ręcznie, high vs low bar, miary i % w śródstopiu, stary plik wersji 1, zapis i CSV, wersja narzędzia). Przegląd ruchu (+36): sztuczny film z ffmpeg (znacznik na znanym torze) — zaznaczenie przed analizą z lupą, śledzenie ≤ 2 px, poprawka i jej cofnięcie, naklejka, analiza z pliku bez filmu; trzy wyniki, legenda, wykres z pasmem, tabela miar, dymki, CSV powtórzeń, JSON z wersją; telefon i iPad bez przewijania w bok.

**Kopia bazy poza serwerem — odłożona 26.09.2026.**

Propozycja: przycisk „Pobierz kopię" w konsoli z przypomnieniem po tygodniu. Automatyczne kopie (raz na dobę, 30 ostatnich) leżą na tym samym serwerze co baza, więc nie chronią przed utratą serwera. Trener: „nie zajmujmy się tym teraz, ryzyko faktycznie jest małe". Do tego czasu kopię poza serwer da się ściągnąć ręcznie (`WDROZENIE.md`, „Kopie zapasowe"). Wrócić, gdy klientów będzie więcej.

## Co jest zrobione tym dokumentem

- Silnik 5.17 rozłożony na funkcje z sygnaturami i wzorami — `02-silnik-obliczeniowy.md`.
- Dane referencyjne wyciągnięte i zweryfikowane przeciwko plikowi — `docs/dane/`.
- Schemat bazy, warstwy, ekrany, rekomendacja stacku — `03-architektura.md`.
- Rozbieżności instrukcja ↔ plik wypisane, jeden ze znanych błędów zamknięty jako naprawiony — `01-analiza-zrodel.md`.

Czego nie ma i wymaga Twojej decyzji przed startem fazy 0: pięć punktów wyżej.
