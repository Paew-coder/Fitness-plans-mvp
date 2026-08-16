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

## Dlaczego wybór z listy, a nie wpisywanie

Ćwiczenie zawsze wybiera się z rozwijanej listy. To nie jest wygoda — to
zabezpieczenie.

W arkuszu nazwę wpisuje się ręcznie. Literówka sprawia, że BAZA nie znajduje
ćwiczenia, a wtedy slot **przestaje istnieć dla wszystkich obliczeń**: bez
ciężaru, bez stresu, poza objętością — a w planie wygląda normalnie. Żadna
z 11 kontroli w zakładce Analiza tego nie łapie. Wybór z listy usuwa ten błąd
z definicji.

## Powtórki z poprzedniego cyklu

Przy tworzeniu planu można wskazać poprzedni cykl klienta. Wtedy konsola ostrzega,
jeśli ćwiczenie już w nim było — realizacja zasady „sprawdzać poprzednie plany,
żeby unikać powtórzeń". W arkuszu wymagało to otwierania starych plików ręcznie.

## Sprawdzone

Pełna droga: plan ułożony w konsoli → eksport do `.xlsx` → przeliczenie arkusza →
porównanie z silnikiem. **500 wartości, wszystkie zgodne.** Arkusz liczy dokładnie
to, co pokazywała konsola.

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

- Import istniejącego planu z `.xlsx` do konsoli (silnik już to potrafi —
  `silnik/src/import-arkusza.ts` — brakuje przycisku).
- Przeciąganie slotów, żeby zmienić kolejność.
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
