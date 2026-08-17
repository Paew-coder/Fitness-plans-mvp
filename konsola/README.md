# Konsola trenera

Plany powstają tutaj, do klienta idą jako arkusz. Klient nie zauważa zmiany.

```bash
cd konsola
npm start          # → http://localhost:4173
```

Nic nie trzeba instalować ani stawiać. Node 22, zero zależności, dane w plikach
JSON obok. Chodzi na Twoim komputerze — nic nie wychodzi na zewnątrz.

## Co robi

**Układasz plan** — 5 dni × 12 slotów, ćwiczenie wybierasz z listy filtrowanej
kategorią szkieletu. Serie, powtórzenia i RPE ustawiasz osobno dla każdego
z sześciu tygodni.

**Widzisz skutki od razu.** Ciężar, stres na trzech osiach, bilans wzorców ruchu,
obciążenie tydzień po tygodniu z oceną normy — wszystko przelicza się przy każdej
zmianie, tak jak w arkuszu.

**Kontrola przed wysyłką.** Panel po prawej pokazuje, co blokuje wysyłkę (brak
serii maksymalnej, powtórzenia poza tabelą) i co warto sprawdzić (ćwiczenie bez
nagrania, niezgodne ze szkieletem, powtórka z poprzedniego cyklu).

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
notorycznie). Na liście planów każdy klient ma sygnał: *aktywny* / *zwolnił* /
*stanął*. Arkusz nie odpowiadał na to pytanie w ogóle.

**1RM z serii roboczych.** Jeśli klient wpisuje, ile faktycznie podniósł, konsola
proponuje nowe 1RM policzone z tych serii — zamiast wysyłać go na kolejną serię
maksymalną. Przy każdej propozycji widać, z czego wyszła i czy można jej ufać.
Przyjmujesz kliknięciem; bez kliknięcia nic się nie zmienia.

**Wymaga uwagi.** Panel na górze listy: kto stanął (ponad 10 dni bez treningu),
komu wysłałeś plan, a on nie zaczął, kto nie dostał linku, komu kończy się cykl.
Liczy się tylko z planów oznaczonych jako *wysłany* — szkice to jeszcze nie
zobowiązanie. Przy kilkunastu klientach arkusz wymagał otwarcia kilkunastu
plików, żeby to zauważyć.

**Wobec poprzedniego cyklu.** Gdy plan wskazuje poprzedni cykl, karta pokazuje
różnice: objętość, wzorce ruchu, 1RM na wejściu, które ćwiczenia wróciły,
które są nowe, a które wypadły. Arkusz widzi jeden plan naraz — to porównanie
wymagało otwarcia dwóch plików obok siebie.

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

Pełne kółko: plan ułożony w konsoli → eksport do `.xlsx` → przeliczenie arkusza →
porównanie z silnikiem (**500 wartości, wszystkie zgodne**) → wczytanie tego samego
pliku z powrotem do konsoli → **te same ciężary co na starcie**.

Arkusz liczy dokładnie to, co pokazywała konsola, a konsola czyta z powrotem
dokładnie to, co arkusz.

To sprawdzenie wymaga LibreOffice do przeliczenia pliku, więc nie chodzi
automatycznie w testach — trzeba je powtórzyć ręcznie po zmianach w eksporcie.

Powtórzenie tej kontroli na dowolnym pliku:

```bash
cd ../silnik
npm run sprawdz -- "../konsola/dane/eksport/Zuzanna C 4.0.xlsx"
```

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

**Kopia zapasowa**

```bash
npm run kopia                    # do konsola/dane/kopie/
npm run kopia -- /sciezka/gdzies # np. na Dysk
```

Nie kopiuj pliku `.db` ręcznie w trakcie pracy konsoli: baza chodzi w trybie
WAL, więc część świeżych zapisów siedzi w pliku obok. `npm run kopia` robi to
poprawnie na działającej bazie i trzyma 30 ostatnich kopii.

**Masz plany z poprzedniej wersji?**

```bash
npm run migruj     # pliki JSON → baza; pliki zostają nietknięte
```

**Wielu trenerów.** Każdy wiersz w bazie od początku nosi `trener_id`, choć
dziś trener jest jeden i konsola nie ma logowania. To jedyna rzecz, której
nie da się dołożyć później bez przepisywania wszystkiego — a jest darmowa,
dopóki robi się ją od razu.

## Czego jeszcze nie ma

- Porównania cykli — obciążenie i wzorce klienta przez kilka planów wstecz.

## Jak to jest zbudowane

| Plik | Odpowiada za |
|---|---|
| `serwer.ts` | HTTP + API, bez frameworka |
| `baza/schemat.sql` | tabele; każda z `trener_id` |
| `baza/polaczenie.ts` | otwarcie bazy, wersja schematu |
| `magazyn.ts` | zapis i odczyt planów |
| `uwierzytelnianie.ts` | hasło, sesje, tryb dostępu |
| `testy/` | 26 testów magazynu i logowania (`npm test`) |
| `eksport-xlsx.ts` | przygotowanie danych do wypełnienia szablonu |
| `narzedzia/wypelnij-arkusz.py` | wpisanie ich do 5.18 bez ruszania formuł |
| `public/` | interfejs — czysty HTML/CSS/JS, bez frameworka |
| `public/klient/` | aplikacja klienta na telefon (PWA) |

Cała matematyka to [`../silnik/`](../silnik/README.md). Konsola niczego nie
liczy sama — gdyby liczyła, mielibyśmy dwa źródła prawdy i jedno z nich
prędzej czy później by się rozjechało.
