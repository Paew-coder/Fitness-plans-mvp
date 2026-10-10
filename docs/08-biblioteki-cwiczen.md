# 08 — Biblioteki ćwiczeń z filmami (Theory of Motion, Catalyst Athletics)

Trener, 09.10.2026: „przygotuj bazę ćwiczeń na bazie kanału Theory of Motion
Exercise Library razem z ich filmami … dostosować do każdego ćwiczenia coeff,
part i kategorię … całą ich bibliotekę … drugi kanał (Catalyst Athletics)
z filmami bardziej poradnikowymi — jeżeli w pierwszej bazie jest już to samo
ćwiczenie, to może zawierać dwa nagrania … jeżeli nie będziesz pewien
kategorii albo tego, czy ćwiczenie jest jedno- czy dwustronne, zostaw do
weryfikacji”.

## 1. Co powstało

| | |
|---|---|
| Ćwiczeń z bibliotek | **3420** (EX-0206 … EX-3625): Theory of Motion 2928, Catalyst Athletics 492 |
| Pewne | 2221 |
| Do weryfikacji | 1199 (`uwagi` = „DO WERYFIKACJI – powód”, `weryfikacja` = kody) |
| Filmów | 3916: Theory of Motion 3297, Catalyst 618, OPEX 1 |
| Ćwiczeń z kilkoma nagraniami | 324 (np. Deadlift EX-0053 — 7, Barbell bench press EX-0011 — 6) |
| Ćwiczeń BAZY trenera z filmem | 76 ze 166 (160 filmów z bibliotek) |
| Pominięte filmy | 32 (nagrania konkretnych osób, migawki, „IMG 0906”…) |
| Poradniki ogólne bez ćwiczenia | 23 (mobilność, „5 Tips for a Better Squat”, vlogi) — do przypięcia w arkuszu |

Pliki: `docs/dane/biblioteka-cwiczen.json` (ćwiczenia, osobno od BAZY
trenera) i `docs/dane/filmy-cwiczen.json` (filmy) → generator
`silnik/narzedzia/generuj-dane.py` → `silnik/src/dane/cwiczenia.ts`,
`filmy.ts`.

## 2. Źródła

- **Theory of Motion Exercise Library** — `@theorylibrary`
  (`UC3f1WJ6Uqr1SBkdUkfTChYQ`): wszystkie 3469 filmów kanału (playlista
  przesłanych `UU3f1WJ6Uqr1SBkdUkfTChYQ`). Krótkie pokazy — rola
  `demonstracja`.
- **Catalyst Athletics** — `@CatalystAthletics` (`UCOe24b2O8eoeHz9fwWuKRVA`):
  playlista „Olympic Weightlifting Exercise Library”
  (`PLEaPUUsRrMbwMMSS5L2z3eskcz6lHXkj0`), 618 filmów. Omówienia techniki —
  rola `poradnik`.
- Każdy film sprawdzony przez oEmbed YouTube: osadzanie dozwolone, autor =
  ten kanał (4087 / 4087). Pobieramy tylko metadane (tytuł, id, długość);
  filmy grają w odtwarzaczu YouTube w karcie ćwiczenia.

## 3. Dopasowanie

1. **Czyszczenie list** — poza ćwiczeniami: vlogi, odcinki, promocje,
   nagrania konkretnych osób; ogólne poradniki osobno.
2. **Klucz kanoniczny nazwy** (`kanon.py`): skróty (BB, DB, KB, SA, Alt…),
   „&”/„and”, „w/”/„with”, „band/cable”, kolejność słów. Ten sam klucz =
   to samo ćwiczenie (warianty tytułów ToM w `inne_tytuly`). Po kluczu
   kolejny import zachowuje id.
3. **Do BAZY trenera** (`mapa_baza.py`, 76 ćwiczeń): ręcznie przejrzana
   mapa — np. Barbell stiff legged deadlift ← „BB Stiff-Legged Deadlift” +
   Catalyst „Stiff-Legged Deadlift (SLDL)”; Clean ← „BB Clean”, „Clean” +
   Catalyst „Clean”. Filmy idą do ćwiczenia z BAZY, bez duplikatu.
   Przy przeglądzie wyszły jeszcze 2 (BB Conventional Deadlift → Deadlift
   EX-0053, Proper Strict Pull Up Form → EX-0158).
4. **Catalyst ↔ Theory of Motion** (`mapa_cat_tom.py`, 39 par + te same
   klucze): jedno ćwiczenie z dwoma nagraniami — pokaz ToM i poradnik
   Catalyst (np. Clean & Jerk, Front Plank, Rear Foot Elevated Split Squat).
5. **Poradniki ToM** (`mapa_poradniki.py`, 16): przypięte do konkretnego
   ćwiczenia jako `poradnik`.

## 4. Klasyfikacja

Zasady: `docs/dane/zasady-klasyfikacji.md` (kategoria → part, poziomy coeff
z przykładami z BAZY 5.17, progresja i skok, jednostronność, kody powodów).
Każda pozycja przejrzana: propozycja z reguł → przegląd partiami po ~230
(nazwa, sprzęt, przy wątpliwościach klatki z filmu) → kontrola spójności
między wariantami sprzętu.

Rozkład: Lower push 965, Lower pull 813, Core 631, Upper push vertical 306,
Upper pull horizontal 299, Upper push horizontal 172, Bicep 93, Upper pull
vertical 78, Tricep 63. coeff: 1 — 42, 0,75 — 1141, 0,5 — 1310, 0,25 — 927.
Jednostronne: tak 1030, nie 2245, ? 145.

Decyzje warte uwagi trenera:

- **Kettlebell — skok 4 kg** (kettlebelle rosną co 4 kg); BAZA miała przy
  KB 2,5. 450 ćwiczeń — do potwierdzenia.
- **Bój dwuboju**: pełny bój 1, z zawieszenia / z bloków 0,75, ciągi 0,75,
  ćwiczenia techniczne 0,5 (Clean z BAZY = Lower pull, 1).
- **Pauza / tempo / 1,5** przy boju głównym — coeff jak bój bazowy (precedens
  BAZY: Bench press paused 3sec = 1).
- **Jednostronność** wg precedensów BAZY: staggered (jedna noga z tyłu) =
  obustronne; side plank, Copenhagen, suitcase carry, kickback pośladka,
  bird dog, dead bug = „nie”. Jednorącz/jednonóż = „tak” (serie na stronę).
- **Izometria** (hold) — stopień niżej niż wersja w ruchu; skoki 0,5,
  pogo 0,25.

Do weryfikacji (kody; pozycja może mieć kilka): KOMPLEKS 463, MOBILNOSC
320, KATEGORIA 197, JEDNOSTRONNE 145, COEFF 106, KONDYCJA 79, PROGRESJA 24,
NAZWA 14.

## 5. W aplikacji

- **Generator nie losuje ćwiczeń z bibliotek** (ani niczego „DO
  WERYFIKACJI”) — działa jak dotąd na BAZIE trenera (`katalog.bazaTrenera`).
  Ćwiczenia z bibliotek trener wstawia ręcznie.
- **Konsola**: lista w slocie pokazuje BAZĘ trenera (jak dotąd) + opcję
  „🔎 Szukaj w całej bazie i bibliotekach filmów…” i przycisk 🔎 obok.
  Wyszukiwarka: po polsku i angielsku (przysiad/squat, hantle/DB,
  wiosłowanie/row…), filtry kategorii, źródła (Twoja baza / Theory of
  Motion / Catalyst) i „bez do weryfikacji”, ▶ podgląd karty z filmami.
  Wybrane ćwiczenie z biblioteki stoi w slocie z dopiskiem „(biblioteka)”.
- **▶ przy każdym ćwiczeniu w planie** (10.10.2026): filmy wybranego
  ćwiczenia jednym dotknięciem — ta sama karta, co u klienta, z przyciskami
  nagrań. Na przycisku liczba nagrań („▶ 6”); ćwiczenie BAZY tylko z linkiem
  w arkuszu też gra w karcie (podpis „link z arkusza”); bez filmu — przycisk
  wyszarzony. U klienta bez zmian: link z arkusza zostaje linkiem.
- **Eksport do arkusza**: ćwiczenia spoza zakładki BAZA szablonu są
  dopisywane na jej końcu (nazwa, kategoria, part, coeff, skok, progresja,
  film, id), a nazwane zakresy BAZA_* / LISTA_* i formuły LISTY rozszerzane —
  arkusz liczy je jak każde inne. Import wraca na to samo id.
- **Karta ćwiczenia u klienta**: przy kilku nagraniach przyciski „Pokaz” /
  „Poradnik · 4:00”, przełączanie w tej samej ramce.
- `/api/cwiczenia` — 3586 ćwiczeń, gzip i pamięć podręczna (~1 MB → ~140 kB);
  filmy dla karty z `/api/karta-cwiczenia?id=`.

## 6. Weryfikacja przez trenera

```
python3 silnik/narzedzia/weryfikacja-bibliotek.py arkusz weryfikacja.xlsx
python3 silnik/narzedzia/weryfikacja-bibliotek.py zastosuj weryfikacja.xlsx [--na-sucho]
python3 silnik/narzedzia/generuj-dane.py
```

Arkusz: „Jak sprawdzać”, „Grupy” (OK dla całego kodu, np. wszystkie
MOBILNOSC), „Do weryfikacji” (posortowane po kodzie, link do filmu i
poradnika, żółte kolumny decyzji z listami), „Pewne” (do wglądu i
poprawek), „Poradniki bez ćwiczenia” (przypnij do id), „Filmy przy BAZIE”
(ODEPNIJ, gdy film nie pasuje), „Pominięte”.

- **OK** — zatwierdza (`zatwierdzone` = data, uwagi i kody czyszczone);
  poprawka w kolumnie „Nowa …” też zatwierdza; part liczony z kategorii.
  Jednostronne „?” nie przejdzie bez tak/nie.
- **USUŃ** — `ukryte: true`: wyszukiwarka nie podsuwa, ale ćwiczenie zostaje
  w danych (mogło już trafić do planu; plan się otwiera i eksportuje).
- Przypięte poradniki: `przypisal: "trener"`; odpięte filmy: lista `odpiete`
  w `filmy-cwiczen.json`.
- Kolejny import (`import-bibliotek/buduj.py`) **nie nadpisuje decyzji
  trenera**: zachowuje klasyfikację zatwierdzonych, przypięte poradniki i
  odpięcia.
- `python3 silnik/narzedzia/weryfikacja-bibliotek.py test` — cała pętla na
  kopiach danych (grupa, OK, poprawka, „?”, USUŃ, poradnik, odpięcie).

## 7. Narzędzia importu

`silnik/narzedzia/import-bibliotek/` — skrypty jednorazowego importu
(czyszczenie list, klucze, mapy dopasowań, reguły propozycji, przegląd
partiami, budowa plików). Robocze dane (listy kanałów z yt-dlp, wyniki
przeglądu, klatki — ok. 35 MB) są poza repo; stan decyzji jest w
`biblioteka-cwiczen.json`. Opis kroków: `import-bibliotek/README.md`.

## 8. Sprawdzone

- `npm test` w `silnik/` i `konsola/`: kompletność bibliotek (każde
  ćwiczenie ma film, part zgodny z kategorią, unikalne nazwy także względem
  BAZY, id powyżej BAZY), generator nie bierze bibliotek, filmy EX-0011
  (pokazy przed poradnikami), lista z liczbą filmów, karta, gzip.
- `npm run przeglad-ekranow` (sekcja 13b): wyszukiwarka po angielsku i po
  polsku, filtr źródła, podgląd z przełączaniem „Poradnik”, wybór Goblet
  Squat do slotu, eksport do arkusza (wiersz w BAZIE) i import (to samo id).
- `npm run przeglad-filmu`: sześć nagrań przy wyciskaniu w jednym rzędzie,
  „Poradnik” podmienia film, powrót do pokazu OPEX, cała karta na ekranie
  telefonu i komputera.
- **Do sprawdzenia ręcznie** (sieć środowiska testowego nie przepuszcza
  obrazu YouTube): na iPhonie/iPadzie i komputerze — przełączenie „Pokaz” /
  „Poradnik” w karcie i odtworzenie obu; podgląd ▶ w wyszukiwarce konsoli.
