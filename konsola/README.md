# Konsola trenera

Plany powstają tutaj, do klienta idą jako arkusz. Klient nie zauważa zmiany.

```bash
cd konsola
npm start          # → http://localhost:4173
```

Nic nie trzeba instalować ani stawiać. Node 22, zero zależności, dane w jednym
pliku SQLite obok. Chodzi na Twoim komputerze i nic nie wychodzi na zewnątrz —
z jednym wyjątkiem, który sam włączasz kluczem do API: [asystent](#asystent-co-robi-a-czego-nie).

## Co robi

**Układasz plan** — 5 dni × 12 slotów, ćwiczenie wybierasz z listy filtrowanej
kategorią szkieletu. Serie, powtórzenia i RPE ustawiasz osobno dla każdego
z sześciu tygodni.

**Widzisz skutki od razu.** Ciężar, stres na trzech osiach, bilans wzorców ruchu,
obciążenie tydzień po tygodniu z oceną normy — wszystko przelicza się przy każdej
zmianie, tak jak w arkuszu.

**Kontrola przed wysyłką.** Panel po prawej pokazuje, co blokuje wysyłkę (pusty
plan, brak serii maksymalnej, powtórzenia poza tabelą) i co warto sprawdzić
(ćwiczenie bez nagrania, niezgodne ze szkieletem, powtórka z poprzedniego cyklu).

**Eksport do arkusza** — `Eksportuj arkusz` tworzy plik w formacie 5.18
z żywymi formułami, walidacjami i zakładkami ODDECH/BIEG. Ląduje w
`konsola/dane/eksport/`.

**Wczytanie istniejącego planu** — `Wczytaj plan z arkusza` bierze plik `.xlsx`
w układzie 5.17/5.18 i przenosi go do konsoli. Ćwiczenia, których nie ma w BAZIE
(literówki, pozycje jeszcze niedodane), wypisuje osobno — te sloty zostają puste
i trzeba je dobrać ręcznie.

**Widzisz, czy klient ćwiczy.** Karta *Realizacja* pokazuje treningi tydzień
po tygodniu: kropka pełna to trening domknięty, blada to zaczęty (klient oceniał
ćwiczenia, ale nie kliknął „Zakończ trening" — na siłowni zdarza się to
notorycznie). Na liście klientów każdy ma sygnał: *aktywny* / *zwolnił* /
*stanął*. Arkusz nie odpowiadał na to pytanie w ogóle.

**1RM z serii roboczych.** Jeśli klient wpisuje, ile faktycznie podniósł, konsola
proponuje nowe 1RM policzone z tych serii — zamiast wysyłać go na kolejną serię
maksymalną. Przy każdej propozycji widać, z czego wyszła i czy można jej ufać.
Przyjmujesz kliknięciem; bez kliknięcia nic się nie zmienia.

Ta propozycja czeka też na początku nowego cyklu — i tam jest najbardziej
potrzebna. Serie maksymalne przechodzą do nowego planu razem z doborem
ćwiczeń, więc wygląda on na kompletny, a liczy z 1RM sprzed sześciu tygodni:
klient przez ten czas urósł, każdy ciężar wychodzi za lekki i **nic tego nie
widać**. Wykonania z poprzedniego cyklu są najlepszym, co w tym momencie mamy,
więc konsola wyciąga je stamtąd i podpisuje: „Z cyklu 1.0 — ten dopiero się
zaczyna". Wykonanie z bieżącego cyklu, gdy już będzie, wygrywa ze starszym.

**Ciężar wpisany ręcznie.** Kolumna CIĘŻAR jest polem, nie napisem — zasada
ta sama co przy powtórzeniach: **puste znaczy „licz automatem"**, a podpowiedź
pokazuje, co z tego wychodzi. Wpisana liczba wygrywa, dostaje kropkę i ramkę
w kolorze akcentu, a kontrola planu wymienia wszystkie takie miejsca — ciężar,
który nie reaguje ani na 1RM, ani na oceny klienta, nie może wyglądać jak reszta.

Do czego to służy: maszyna z ustalonymi płytkami, ograniczenie po kontuzji,
ćwiczenie z progresją „ręczne ustawienie", slot bez serii maksymalnej, który
mimo to ma dziś mieć ciężar. Silnik przyjmował to od początku (`ciezarOverride`
zachowywany przez progresję, czyszczony przy nowym cyklu) — brakowało jedynego,
co widzi trener: miejsca, w którym da się wpisać. W arkuszu było to zwykłe
wpisanie liczby do komórki z formułą.

Przez arkusz przechodzi tak samo: w wyeksportowanym pliku w tej komórce staje
liczba zamiast formuły, a przy wczytaniu z powrotem wraca jako nadpisanie.
Sprawdza to `npm run sprawdz-kolko`.

**Podmiana ćwiczenia, które klient już ocenił.** Mnożnik adaptacji liczy się
z odczuć **slotu**, nie ćwiczenia — tak samo jak w arkuszu. Po podmianie oceny
zostają i działają dalej: dwa razy „za łatwe" przy przysiadzie podniosłoby
o 10% ciężar ćwiczenia, którego klient nawet nie robił. W arkuszu było
identycznie, tylko trener miał ten wiersz przed oczami.

Konsola pyta w chwili podmiany: zostawić oceny czy wyczyścić. Nie decyduje za
Ciebie, bo bywa, że to ten sam ruch na innym sprzęcie i oceny mają prawo zostać.
Czyszczone są wyłącznie oceny **w planie** — historia wykonań klienta zostaje
w obu przypadkach, bo ten trening naprawdę się odbył.

**Wymaga uwagi.** Panel na górze listy: kto stanął (ponad 10 dni bez treningu),
komu wysłałeś plan, a on nie zaczął, kto nie dostał linku, komu kończy się cykl.
Cała jego wartość polega na tym, że **milczy, gdy nie ma o czym mówić** — panel
wołający o wszystkich jest tym samym co panel wyłączony. Pilnuje tego trzynaście
testów, które cofają daty w bazie, bo inaczej sprawdzenie „ktoś nie ćwiczy od
jedenastu dni" trwałoby jedenaście dni.
Jeden wiersz na klienta i tylko o jego bieżącym planie — szkice to jeszcze nie
zobowiązanie, a zamknięte cykle nie mają po co wołać. Przy kilkunastu klientach
arkusz wymagał otwarcia kilkunastu plików, żeby to zauważyć.

**Kartoteka klienta.** Konsola myśli ludźmi, nie dokumentami: na wejściu jest
lista klientów, a cykle leżą w kartotece każdego z nich. Widać tam wszystkie
plany po kolei, 1RM przez kolejne cykle (`100 → 112,5 → 125 kg`), obciążenie
i wzorce ruchu cykl po cyklu, frekwencję i wagę ciała. Porównanie dwóch
sąsiednich cykli mówi, co się zmieniło; kartoteka odpowiada na pytanie szersze —
co się dzieje z tym człowiekiem od roku.

**Jeden link na klienta, na stałe.** Wcześniej token dostępowy wisiał przy
planie, więc każdy nowy cykl znaczył nowy adres do wysłania, a stary link
zamrażał klienta na poprzednim planie. Teraz link należy do klienta: oznaczasz
nowy plan jako *wysłany* i klient widzi go pod tym samym adresem. Szkice nie są
widoczne — do czasu wysyłki klient widzi „trener przygotowuje Twój plan".

**Porządek w kartotekach.** Literówka w nazwisku zakłada drugą osobę, a widać
to zwykle po cyklu pracy. Dlatego kartoteka ma trzy operacje: *zmień nazwę*
(identyfikator zostaje, więc historia się nie rozjeżdża), *połącz* (przenosi
cykle, wykonania i wagę do właściwej kartoteki i kasuje pomyłkową — link
przechodzi, jeśli cel jeszcze go nie ma) i *usuń*. Zmiana nazwy na nazwę
istniejącego klienta jest odrzucana z podpowiedzią, żeby nie powstały dwie
kartoteki o tej samej nazwie.

**Wypełnianie sześciu tygodni.** Dwa przyciski w pasku nad planem.
*Progresja 5.18* wpisuje do wszystkich tygodni blok z Twojego szablonu — bój
główny 6×6 @6,5 → 5×6 @7 → 5×5 @7 → 4×5 @7,5 → 5×4 @7,5 → 6×3 @7,5, akcesoria
trzy serie przy RPE 8 w pierwszym bloku i 9 w drugim. *Kopiuj T{n}* rozprowadza
bieżący tydzień na pozostałe. Jedno i drugie zostawia oceny klienta i ręcznie
ustawione ciężary na miejscu.

Te liczby nie są niczyim pomysłem — zostały odczytane z
`arkusz/MasterTemplate-5-18.xlsx`. Wcześniej konsola kazała wpisywać je od zera:
przy planie na trzy dni po piętnaście pozycji to około dziewięćdziesięciu pól
i jedyne miejsce, w którym aplikacja była gorsza od arkusza.

**Status planu** ustawiasz w pasku nad planem: *szkic → wysłany → zakończony*.
To nie jest etykieta, tylko przełącznik widoczności: klient widzi wyłącznie plan
oznaczony jako wysłany. Gdy przestawiasz na *wysłany* przy otwartych błędach
kontroli, konsola wypisuje je i pyta wprost — decyzja jest Twoja, ale musi paść
świadomie. Jeśli klient nie ma jeszcze linku, dostajesz go od razu po wysłaniu.

**Działa na telefonie.** Trener nie siedzi przy biurku — między klientami
zagląda tu z telefonu. Lista, panel *Wymaga uwagi* i kartoteka układają się
w jedną kolumnę; tabela slotów, która ma osiem kolumn z polami, przewija się
we własnej ramce, a nie całą stroną. Układanie planu jest wygodniejsze na
dużym ekranie, ale zajrzenie do klienta działa wszędzie.

**Wobec poprzedniego cyklu.** Gdy plan wskazuje poprzedni cykl, karta pokazuje
różnice: objętość, wzorce ruchu, 1RM na wejściu, które ćwiczenia wróciły,
które są nowe, a które wypadły. Arkusz widzi jeden plan naraz — to porównanie
wymagało otwarcia dwóch plików obok siebie.

**Asystent.** Dwa przyciski w panelu bocznym. *Zaproponuj szkielet* — podajesz
cel, staż, sprzęt i liczbę dni, dostajesz układ dni z konkretnymi ćwiczeniami
z BAZY, z uzasadnieniem przy każdej pozycji. *Odczytaj analizę* — model czyta
policzone liczby i mówi, co z nich wynika. Szczegóły niżej: [Asystent](#asystent-co-robi-a-czego-nie).

**Oddech i bieg.** Dwa kalkulatory z zakładek ODDECH i BIEG, te same liczby.
Wpisujesz wynik testu TWOT — wychodzi dawka oddechowa. Wpisujesz wiek i bieg
testowy — wychodzi sześć tygodni jednostek z czasem, tempem i tętnem. Klient
widzi jedno i drugie na telefonie, w zakładce *Oddech i bieg*.

## Dlaczego wybór z listy, a nie wpisywanie

Ćwiczenie zawsze wybiera się z rozwijanej listy. To nie jest wygoda — to
zabezpieczenie.

W arkuszu nazwę wpisuje się ręcznie. Literówka sprawia, że BAZA nie znajduje
ćwiczenia, a wtedy slot **przestaje istnieć dla wszystkich obliczeń**: bez
ciężaru, bez stresu, poza objętością — a w planie wygląda normalnie. Żadna
z 11 kontroli w zakładce Analiza tego nie łapie. Wybór z listy usuwa ten błąd
z definicji.

**Nowa wersja planu** — `Nowa wersja` na liście kopiuje dobór ćwiczeń, serie,
powtórzenia i RPE jako kolejną wersję dla tego samego klienta. Znikają odczucia
klienta (należą do wykonanego cyklu — nowy zaczyna od mnożnika 1) i ręczne
nadpisania ciężaru. Kopia od razu wskazuje poprzedni cykl, więc ostrzeżenie
o powtórkach działa bez ustawiania czegokolwiek.

**Zmiana kolejności** — strzałki przy numerze pozycji, widoczne po najechaniu
na wiersz. Zamieniają **treść** slotów, nie całe wiersze: `position_id` i `Lp.`
należą do miejsca w planie, nie do ćwiczenia — dokładnie jak w arkuszu, gdzie
przenosi się tylko widoczny zakres komórek, a kolumny techniczne zostają.

> Skutek uboczny warty zapamiętania: przeniesienie ćwiczenia na pozycję **A1**
> czyni je bojem głównym, więc powtórzenia przestaje liczyć automat akcesoriów.
> Ciężar zmieni się od razu — to poprawne, bo A1 jest bojem głównym z definicji.

## Powtórki z poprzedniego cyklu

Przy tworzeniu planu można wskazać poprzedni cykl klienta. Wtedy konsola ostrzega,
jeśli ćwiczenie już w nim było — realizacja zasady „sprawdzać poprzednie plany,
żeby unikać powtórzeń". W arkuszu wymagało to otwierania starych plików ręcznie.

## Sprawdzone

```bash
npm run sprawdz-kolko         # wymaga LibreOffice, trwa ~2 minuty
```

Pełne kółko w jednym poleceniu: plan ułożony w konsoli → eksport do `.xlsx` →
przeliczenie arkusza w LibreOffice → porównanie z silnikiem (**758 wartości,
wszystkie zgodne**) → wczytanie tego samego pliku z powrotem → porównanie
z planem wyjściowym (**786 wartości: ćwiczenia, serie, powtórzenia, RPE,
odczucia, ciężary ręczne i policzone oraz stres — identycznie, zero różnic**).

Arkusz liczy dokładnie to, co pokazywała konsola, a konsola czyta z powrotem
dokładnie to, co arkusz. Na tym stoi cała umowa tej aplikacji, więc kontrola
jest jedną komendą, a nie kilkunastoma — bo rytuał do powtarzania ręcznie
po każdej zmianie w eksporcie po prostu przestaje się powtarzać.

> **Co ta kontrola wykryła.** Slot, w którym trener nie ruszył serii ani RPE,
> wychodził z konsoli jako „nie ustawione". Wypełniacz pomijał puste pola, więc
> w arkuszu zostawały wartości szablonu (6 serii, RPE 6,5 dla boju głównego
> w T1), a silnik liczył swoje (1 seria, RPE 8) — klient dostawał inne liczby
> niż te, które trener widział na ekranie. Do tego eksport w ogóle nie zapisywał
> odczuć klienta, choć import je czytał, więc odesłany arkusz startował od
> mnożnika 1 i od T2 rozjeżdżał się jeszcze bardziej. Jedno i drugie naprawione;
> pilnuje tego sześć testów w `testy/eksport.test.ts`, które nie potrzebują
> ani Pythona, ani LibreOffice.

Wymaga LibreOffice i Pythona z `openpyxl`, więc nie chodzi w `npm test` —
przeliczenie arkusza trwa kilkadziesiąt sekund.

> **I co przeoczyło.** Właśnie to przeliczenie. Identyfikator ćwiczenia stoi
> w arkuszu w ukrytej kolumnie liczonej formułą, a plik prosto z eksportu nie
> ma jeszcze policzonych formuł — ich wartości wpisuje dopiero Excel albo
> LibreOffice przy pierwszym otwarciu. Kółko szło przez przeliczenie, więc
> działało; wczytanie pliku **wprost po eksporcie**, bez otwierania go w
> arkuszu kalkulacyjnym, dawało plan bez ani jednego ćwiczenia — i meldunek
> o powodzeniu. Teraz, gdy w tej kolumnie nic nie stoi, rozstrzyga nazwa
> z kolumny ĆWICZENIE (ta sama BAZA, to samo źródło co formuła), a import,
> który nie rozpoznał niczego, **odmawia zamiast zakładać pusty plan**.
> Pilnuje tego dziewięć testów w `../silnik/testy/import-arkusza.test.ts`.

Ta sama kontrola na dowolnym własnym pliku:

```bash
cd ../silnik
npm run sprawdz -- "../konsola/dane/eksport/Zuzanna C 4.0.xlsx"
```

## Asystent — co robi, a czego nie

Asystent ma trzy zadania i ani jedno z nich nie polega na liczeniu.

**Czego nie robi nigdy:** nie podaje ciężaru, RPE, serii ani powtórzeń.
Te liczy silnik — deterministycznie, z 93 testami przeciwko arkuszowi.
Model dobiera ćwiczenia i opisuje policzone liczby słowami. Gdyby liczył
sam, straciłbyś jedyną rzecz, która w tej aplikacji jest pewna.

**Propozycja szkieletu.** Podajesz cel, staż, sprzęt, liczbę dni i notatkę.
Dostajesz układ dni: A1 bój główny, pary B1/B2 jako superserie, wszystko
z ID-ków, które naprawdę są w BAZIE. Model zna rozkład wzorców ruchu i normy
objętości, więc równoważy plan po `part`, nie po nazwach ćwiczeń. Jeśli plan
wskazuje poprzedni cykl, wie, czego nie powtarzać.

Zanim propozycja pokaże się na ekranie, przechodzi weryfikację katalogiem:
- ID spoza BAZY **wypada** (z wypisaniem, co i dlaczego),
- kategoria bierze się z BAZY, nie z odpowiedzi modelu,
- to samo ćwiczenie dwa razy w dniu zostaje raz,
- nadmiar pozycji i nadmiar dni jest przycinany do tego, co mieści się w planie,
- powtórka z poprzedniego cyklu, brak filmu i „DO WERYFIKACJI" dostają znacznik,
- brakujące wzorce ruchu są wypisane po nazwie.

Do planu nic nie trafia samo. Klikasz *Wstaw do planu* — a jeśli w tych dniach
coś już stoi, przycisk mówi wprost, ile pozycji zniknie. Wstawienie wymienia
dzień w całości razem z seriami i RPE: należały do poprzednich ćwiczeń,
a przeniesione na nowe byłyby cudzymi liczbami pod cudzą nazwą.

**Odczytanie analizy.** Model dostaje gotowy raport — stres tygodniowy na trzech
osiach, serie per wzorzec, oceny względem norm, realizację, odczucia klienta —
i mówi, co w nim widzi. Może wskazać kierunek („rozważ mniej objętości
w wyciskaniu w T3"); wartość ustala trener.

**Sygnał zdrowotny.** Jeśli w notatce padnie słowo o bólu, kontuzji czy leczeniu,
nad propozycją pojawia się ostrzeżenie i przypomnienie, czyja to decyzja.
Wykrywa to deterministyczna lista rdzeni słów, a **nie** model — bo model może
przeoczyć, a to jest ta jedna rzecz, której przeoczyć nie wolno.

**Notatka nigdzie się nie zapisuje.** Leci do API przy tym jednym zapytaniu
i znika razem z odpowiedzią. Baza nie przechowuje żadnych danych o zdrowiu —
tak długo, jak ich nie ma, tak długo nie trzeba ich chronić. Do modelu nie
idzie też nazwisko klienta: do dobrania ćwiczeń jest niepotrzebne.

### Włączenie

```bash
export ANTHROPIC_API_KEY="sk-ant-..."     # klucz z console.anthropic.com
npm start
```

Bez klucza konsola startuje normalnie i wszystko poza asystentem działa tak
samo — dwa przyciski są po prostu nieaktywne, z wyjaśnieniem dlaczego.

Każde zapytanie kosztuje ułamek dolara i konsola pokazuje ile, pod odpowiedzią.
Katalog 164 ćwiczeń jest oznaczony do cache, więc drugie i kolejne zapytanie
w ciągu paru minut płaci za niego dziesiątą część ceny.

## Odporność serwera

Konsola obsługuje jednego trenera, ale jego klienci wchodzą z zewnątrz — więc
żadne żądanie nie może położyć procesu. Do tej pory mogło, i to bez hasła:

> **`GET /klient/` zabijało cały serwer.** Adres wskazuje katalog, a sprawdzenie
> „czy plik istnieje" jest dla katalogu prawdziwe. Serwer wysyłał nagłówki
> i dopiero potem próbował odczytać katalog jako plik — wyjątek leciał **po**
> rozpoczęciu odpowiedzi, obsługa błędu próbowała odpowiedzieć drugi raz,
> a to rzucało już spoza bloku `try` i kończyło proces. Konsola znikała razem
> z dostępem wszystkich klientów.
>
> Najgorsze: `/klient/` było dokładnie tym adresem, który otwierała aplikacja
> **dodana do ekranu głównego** — `start_url` w manifeście prowadził do
> katalogu zamiast do linku klienta. Klient instalował sobie skrót, dotykał go
> i kładł trenerowi serwer.

Naprawione w trzech warstwach: katalog nie udaje pliku, odpowiedź wysyła się
dokładnie raz, a wyjątek w obsłudze żądania w najgorszym razie zrywa jedno
połączenie. Manifest nie narzuca już adresu startowego, więc aplikacja otwiera
ten, pod którym klient ją dodał. Pilnuje tego trzynaście testów, łącznie
z próbami wyjścia poza katalog publiczny.

```bash
npm run sprawdz-odpornosc     # ~10 sekund, bez dodatkowych narzędzi
```

Dziewięćdziesiąt dwie próby na trzydziestu sześciu adresach: katalogi zamiast
plików, wyjścia poza `public/`, obcięty JSON, tablica zamiast obiektu, liczba
zamiast nazwiska, pięćdziesiąt tysięcy znaków w nazwie, znaki sterujące,
nieskończoności w polach liczbowych, metody, których adres nie obsługuje.
Osiem kontroli: że serwer zawsze odpowiada, że złe wejście dostaje odmowę (4xx),
a nie awarię (5xx), że w komunikacie nie ma śladów wnętrza, że wartości spoza
świata są **odrzucane, a nie zapisywane**, i że po całej serii dane klienta
są co do liczby takie same jak przed nią.

> **Dlaczego 4xx zamiast 500 to nie kosmetyka.** Kolejka offline w telefonie
> klienta czyta te kody: 5xx znaczy „serwer ma zły dzień, spróbuj później",
> 4xx znaczy „tego nie da się zapisać nigdy, wyrzuć zadanie". Zniekształcone
> żądanie odsyłane z kodem 500 wracałoby w nieskończoność i zatykało kolejkę —
> czyli ten sam błąd, który już raz naprawialiśmy, wpuszczony tylnymi drzwiami.

Nazwisko klienta ma teraz własną kontrolę, bo trafia do identyfikatora planu,
do nazwy pliku eksportu i na ekran klienta: najwyżej 120 znaków, bez znaków
sterujących. Numer cyklu musi być całkowity z zakresu 1–999.

> **„Nie wywala się" to nie to samo co „waliduje".** Pierwszy przebieg tej
> kontroli wyszedł na zielono przy sprawdzaniu samych kodów odpowiedzi —
> a potem okazało się, że serwer **przyjmował i zapisywał** prawie wszystko:
> ocenę z tygodnia 99, ciężar −100 kg, sto tysięcy powtórzeń, wagę biliona
> kilogramów, domknięcie dnia, którego w planie nie ma. Najgorsza była seria
> maksymalna: 100 kg × 999 powtórzeń podmieniało tę prawdziwą i przeliczało
> ciężary na całe sześć tygodni. Nieznane odczucie dawało z kolei 500 — czyli
> kolejka w telefonie wracałaby z nim w nieskończoność.
>
> **To samo po stronie trenera.** Zapis planu — największe i najbardziej
> złożone wejście w całym API — rozsypywał ciało żądania wprost na zapisany
> rekord. Znaczyło to, że jedno żądanie mogło podmienić **cokolwiek**:
> właściciela planu, datę utworzenia, a nawet historię wykonań klienta. Plan
> jako tekst albo bez listy slotów kończył się piątką z komunikatem z wnętrza
> Node'a; plan z `serieMaksymalne` jako tekstem zapisywał się bez słowa i psuł
> dopiero przy odczycie — czyli trener tracił dostęp do cyklu, którego przed
> chwilą używał. Zapis zmienia teraz dokładnie trzy rzeczy, które trener
> zmienia z ekranu (plan, datę startu, status), a kształt planu sprawdza
> `ksztalt-planu.ts` na granicy. Data 30 lutego też już nie przechodzi —
> `Date.parse` przyjmował ją i po cichu przesuwał cykl na 2 marca.
>
> Klient nie jest przeciwnikiem, ale jest **bez nadzoru**: zamiast 100 kg wpisze
> 1000, a kolejka sprzed dwóch cykli przyniesie numer tygodnia, którego już nie
> ma. Zapisy z telefonu mają teraz granice — tydzień 1–6, dzień z planu, ciężar
> 0–1000 kg, powtórzenia do 200 (w serii maksymalnej do 15, bo dalej nie ma
> z czego liczyć 1RM), waga 20–400 kg, odczucie z trzech dozwolonych. Granice
> są szeroko postawione: mają odciąć to, co nie może być prawdziwe, a nie
> zgadywać, co klient miał na myśli.

## Dostęp — dwa tryby

Konsola sama rozpoznaje, w którym trybie chodzi. Nie ma przełącznika
w konfiguracji, bo przełącznik dałoby się zostawić w złej pozycji przy
wdrożeniu — a to jest dokładnie ta pomyłka, po której cudze plany treningowe
leżą w internecie.

**Lokalny (domyślny).** Konto bez hasła. Konsola przyjmuje połączenia
**wyłącznie z tego komputera**; zapytanie z zewnątrz dostaje odmowę
z wyjaśnieniem. Tak ma być, dopóki konsola stoi u Ciebie na biurku.

**Z hasłem.** Gdy ustawisz hasło, logowanie jest wymagane zawsze — także
lokalnie. To jedyny tryb, w którym wolno wystawić konsolę na świat.

```bash
npm run haslo              # ustaw albo zmień hasło
npm run haslo -- --usun    # wróć do trybu lokalnego
```

Ustawienie albo zmiana hasła **wylogowuje wszystkie urządzenia** — również
zgubiony telefon. Sesja trwa 30 dni i siedzi w bazie, nie w podpisanym
ciasteczku, właśnie po to, żeby dało się ją unieważnić natychmiast.

Wystawiając konsolę na zewnątrz, postaw ją za HTTPS i ustaw `ZA_HTTPS=1` —
ciasteczko sesji dostanie wtedy flagę `Secure`. HTTPS nie jest tu ozdobą:
link klienta zawiera token w adresie.

**Aplikacja klienta chodzi obok tego wszystkiego.** Jej kluczem jest token
w linku i logowanie trenera jej nie dotyczy — klient nie ma i nie potrzebuje
konta.

## Gdzie leżą dane

```
konsola/dane/craftmyplan.db                 baza SQLite — wszystkie plany
konsola/dane/eksport/<Klient> <wersja>.0.xlsx
```

Jeden plik. Kopia zapasowa to skopiowanie go na Dysk; przeniesienie na inny
komputer albo na serwer — to samo. Katalog `dane/` jest poza repozytorium,
plany klientów nie trafiają na GitHub.

**Dlaczego baza, skoro wcześniej wystarczały pliki JSON.** Bo klient odhacza
trening z telefonu w tej samej chwili, w której Ty otwierasz jego plan.
Pliki nie znoszą dwóch zapisów naraz — jeden po cichu wygrywa, drugi znika.
Baza zapisuje wszystko w transakcji: albo cały plan, albo nic. Sprawdzone:
dwanaście ocen wysłanych równocześnie, wszystkie na miejscu.

`node:sqlite` jest wbudowane w Node 22, więc dalej zero zależności i zero
instalowania czegokolwiek.

**Kopia zapasowa — robi się sama**

Konsola kopiuje bazę **raz na dobę** (przy starcie i potem w tle) oraz
**przed każdą migracją**. Kopie leżą w `konsola/dane/kopie/`, zostaje 30
ostatnich; kopie sprzed migracji liczą się osobno, żeby nie wypadły spod
codziennych akurat wtedy, gdy są potrzebne.

To nie jest ozdoba. Instrukcja mówiła dotąd: „przed aktualizacją zrób kopię" —
i tak samo mówi każda instrukcja na świecie, po czym nikt tego nie robi.
W tych danych leży po sześć tygodni pracy każdego klienta, a jedno kliknięcie
„Usuń klienta" kasowało je bezpowrotnie.

Kopia na żądanie — na przykład na pendrive albo na Dysk — dalej jest:

```bash
npm run kopia                    # do konsola/dane/kopie/
npm run kopia -- /sciezka/gdzies # np. na Dysk
```

Nie kopiuj pliku `.db` ręcznie w trakcie pracy konsoli: baza chodzi w trybie
WAL, więc część świeżych zapisów siedzi w pliku obok. `npm run kopia` robi to
poprawnie na działającej bazie.

**Masz plany z poprzedniej wersji?**

```bash
npm run migruj     # pliki JSON → baza; pliki zostają nietknięte
```

**Wielu trenerów.** Każdy wiersz w bazie od początku nosi `trener_id`, choć
dziś trener jest jeden i konsola nie ma logowania. To jedyna rzecz, której
nie da się dołożyć później bez przepisywania wszystkiego — a jest darmowa,
dopóki robi się ją od razu.

## Przegląd ekranów

```bash
npm run przeglad-ekranow      # wymaga Playwrighta z Chromium, trwa ~40 sekund
```

Idzie tą samą drogą co trener: lista klientów → nowy plan → ułożenie cyklu →
eksport i wysyłka → wczytanie tego samego arkusza z powrotem → kartoteka
klienta, nowy cykl, poprawienie nazwiska, scalenie dwóch kartotek, usunięcie.
Po każdym kliknięciu pyta **serwer**, czy coś się faktycznie zapisało. Ekran,
który ładnie wygląda i nic nie zapisuje, wypada tu na czerwono.

> **Co ten przegląd wykrył.** Cztery błędy, których nie widać ani w kodzie,
> ani w `npm test`. Zakładki tygodni siedziały w `<label>`, więc każde
> kliknięcie trafiało w T1 i konsola pokazywała wyłącznie pierwszy tydzień.
> Panel serii maksymalnych nie odrysowywał się po dobraniu ćwiczenia, więc
> pola pojawiały się dopiero po ponownym otwarciu planu. Pola tej serii
> kasowały się nawzajem: wpisanie ciężaru czyściło powtórzenia i odwrotnie —
> czyli **serii maksymalnej nie dało się wpisać wcale**, a bez niej nie liczy
> się żaden ciężar. A wczytanie własnego, dopiero co wyeksportowanego arkusza
> dawało **pusty plan i komunikat o powodzeniu** (opis niżej).

Drugi przegląd chodzi po aplikacji klienta — po telefonie:

```bash
npm run przeglad-klienta      # wymaga Playwrighta z Chromium, trwa ~20 sekund
```

Otwiera link na ekranie 390×844 i przechodzi pętlę, dla której cała aplikacja
powstała: klient dostaje policzony ciężar → ocenia serię → **ocena podnosi
ciężar w kolejnym tygodniu** → zapisuje, ile faktycznie podniósł → domyka
trening → wpisuje serię maksymalną i wagę → widzi swój postęp, a trener widzi
realizację. Sprawdza przy tym, że liczba na telefonie to **dokładnie** ta,
którą policzył silnik — rozjazd tutaj znaczy, że klient trenuje wg innych
liczb niż trener.

Przegląd sprawdza też to, co dzieje się bez zasięgu — bo tam wyszły dwa
błędy, każdy cichy i każdy o liczby.

> **Zapis, który dotarł po zmianie cyklu.** Klient trenuje bez zasięgu, a
> kolejka wychodzi dopiero w domu — czasem po kilku dniach. Jeśli w tym czasie
> trener wysłał kolejny cykl, zapis szedł do planu **aktywnego w chwili
> dotarcia**: oceny z poprzedniego cyklu przepadały bez śladu, a nowy dostawał
> odczucia z treningu, którego jeszcze nie było — i liczył z nich ciężary na
> kolejne tygodnie. Teraz każde zadanie niesie identyfikator cyklu, którego
> dotyczy, i trafia tam, gdzie należy; na ekran wraca zawsze cykl aktywny,
> więc telefon sam przechodzi na nowy plan.
>
> **Odrzucone zadanie blokowało kolejkę.** Brak sieci i odmowa serwera
> kończyły się tak samo: zadanie zostawało na czele kolejki. Wystarczyło,
> żeby trener wyjął ćwiczenie z planu, gdy klient był offline — ocena tego
> ćwiczenia nie mogła się już zapisać nigdy, a każda kolejna czekała za nią.
> Klient oceniał, ekran potwierdzał, do trenera nie docierało już nic. Teraz
> odmowa (4xx) wyrzuca zadanie i mówi o tym klientowi; brak sieci i awaria
> serwera dalej znaczą „spróbuj później".

Sam interfejs klienta ma też pokrycie bez przeglądarki — `testy/api-klienta.test.ts`
stawia serwer i sprawdza, do którego cyklu trafia każdy rodzaj zapisu.

Testy jednostkowe pilnują silnika i serwera, ale nie dotykają przeglądarki.
Te przeglądy są po to, żeby po zmianach w `public/` nie trzeba było klikać
ręcznie — i żeby nie odpuścić klikania wtedy, gdy zmiana wygląda niewinnie.

## Przed wdrożeniem

```bash
npm run sprawdz-wdrozenie     # wymaga Dockera, trwa ~2 minuty
```

Buduje obraz, stawia kontener **na bazie w starym schemacie** — takiej, jaką ma
działająca instalacja — i sprawdza dwadzieścia rzeczy, które muszą działać na
serwerze: czy migracja podniosła bazę sama, czy nie zginął żaden plan, czy link,
który klient ma w telefonie, dalej prowadzi do jego aktualnego cyklu, czy eksport
arkusza i kopia zapasowa chodzą w kontenerze, i czy bramka dostępu odmawia bez
hasła, a wpuszcza po zalogowaniu.

Te kontrole robiło się dotąd ręcznie i przez to nie robiło się ich wcale.
A psują się cicho: dołożony plik, którego `Dockerfile` nie kopiuje, wychodzi
dopiero na serwerze, przy pierwszym kliknięciu.

## Aktualizacja z wcześniejszej wersji

Baza podnosi się sama przy pierwszym uruchomieniu — z kolumny tekstowej
`plan.klient` powstają klienci, a token dostępowy i waga ciała przechodzą
z planu na klienta. **Link, który klient ma już w telefonie, działa dalej**
i od tej pory sam pokazuje aktualny cykl.

Migracja nie kasuje danych, ale zmienia układ tabel — dlatego konsola robi
kopię **sama, tuż przed nią**, i mówi w konsoli, gdzie ją położyła. Gdybyś
chciał mieć jeszcze jedną, u siebie:

```bash
npm run kopia
```

> **Baza z wersji sprzed wersjonowania schematu** też się podniesie. Wcześniej
> nie: konsola pytała taką bazę o numer wersji, tabeli z numerami tam jeszcze
> nie było i aplikacja **nie wstawała wcale** — z komunikatem o błędzie SQL,
> na pliku pełnym danych. Test migracji buduje teraz dokładnie taką bazę,
> bez tej tabeli, bo tylko wtedy sprawdza to, co naprawdę może się zdarzyć.

## Czego jeszcze nie ma

- Kont dla klientów — dziś dostęp daje token w linku.
- Rejestracji kolejnych trenerów i płatności. Baza jest na to gotowa
  (`trener_id` w każdej tabeli), interfejsu jeszcze nie ma.

## Jak to jest zbudowane

| Plik | Odpowiada za |
|---|---|
| `serwer.ts` | HTTP + API, bez frameworka |
| `baza/schemat.sql` | tabele; każda z `trener_id` |
| `baza/polaczenie.ts` | otwarcie bazy, wersja schematu |
| `baza/kopie.ts` | kopie zapasowe: dobowa, przed migracją, na żądanie |
| `magazyn.ts` | zapis i odczyt klientów i planów |
| `baza/migracje.ts` | doprowadzenie istniejącej bazy do aktualnego schematu |
| `nazwy.ts` | nazwa klienta → identyfikator (jedno miejsce dla trzech modułów) |
| `uklad-planu.ts` | szablon 5 dni × 12 slotów i numeracja Lp. |
| `ksztalt-planu.ts` | granica: czy to, co przyszło z sieci, jest w ogóle planem |
| `uwierzytelnianie.ts` | hasło, sesje, tryb dostępu |
| `ai/klient.ts` | jedyne miejsce, które wychodzi do internetu |
| `ai/szkielet.ts` | propozycja szkieletu i jej weryfikacja katalogiem |
| `ai/analiza.ts` | odczytanie policzonych liczb słowami |
| `ai/sygnaly.ts` | wykrywanie sygnałów zdrowotnych w notatce |
| `testy/` | 231 testów magazynu, migracji, eksportu, składni, trybu offline, logowania i asystenta (`npm test`) |
| `eksport-xlsx.ts` | przygotowanie danych do wypełnienia szablonu |
| `narzedzia/wypelnij-arkusz.py` | wpisanie ich do 5.18 bez ruszania formuł |
| `narzedzia/sprawdz-wdrozenie.ts` | cała ścieżka wdrożeniowa na obrazie Dockera |
| `narzedzia/przeglad-ekranow.ts` | klikanie po kontrolkach konsoli w przeglądarce |
| `narzedzia/przeglad-klienta.ts` | pętla klienta na telefonie, od oceny po zmianę ciężaru |
| `narzedzia/sprawdz-kolko.ts` | kółko konsola → arkusz → konsola, wartość po wartości |
| `narzedzia/sprawdz-odpornosc.ts` | całe API zapytane źle — 92 próby, serwer ma przeżyć i odmówić |
| `narzedzia/przegladarka.ts` | serwer na czystej bazie i Chromium — wspólne dla obu przeglądów |
| `public/` | interfejs — czysty HTML/CSS/JS, bez frameworka |
| `public/klient/` | aplikacja klienta na telefon (PWA) |

Cała matematyka to [`../silnik/`](../silnik/README.md). Konsola niczego nie
liczy sama — gdyby liczyła, mielibyśmy dwa źródła prawdy i jedno z nich
prędzej czy później by się rozjechało.
