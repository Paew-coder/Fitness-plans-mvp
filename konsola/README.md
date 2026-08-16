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

## Gdzie leżą dane

```
konsola/dane/plany/<klient>-<wersja>.json   jeden plik = jeden plan
konsola/dane/eksport/<Klient> <wersja>.0.xlsx
```

Zwykłe pliki tekstowe — można je skopiować, wrzucić na Dysk, otworzyć w notatniku.
Katalog `dane/` jest poza repozytorium; plany klientów nie trafiają na GitHub.

## Czego jeszcze nie ma

- Aplikacja dla klienta na telefon — to faza 2.

## Jak to jest zbudowane

| Plik | Odpowiada za |
|---|---|
| `serwer.ts` | HTTP + API, bez frameworka |
| `magazyn.ts` | zapis planów do plików JSON |
| `eksport-xlsx.ts` | przygotowanie danych do wypełnienia szablonu |
| `narzedzia/wypelnij-arkusz.py` | wpisanie ich do 5.18 bez ruszania formuł |
| `public/` | interfejs — czysty HTML/CSS/JS, bez frameworka |

Cała matematyka to [`../silnik/`](../silnik/README.md). Konsola niczego nie
liczy sama — gdyby liczyła, mielibyśmy dwa źródła prawdy i jedno z nich
prędzej czy później by się rozjechało.
