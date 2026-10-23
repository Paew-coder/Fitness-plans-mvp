# Przegląd klasyfikacji ćwiczeń — instrukcja dla partii

Budujemy bazę ćwiczeń aplikacji trenera personalnego (CraftMyPlan) z dwóch
bibliotek filmów na YouTube: **Theory of Motion Exercise Library** (krótkie
pętle demonstracyjne, kanał Achieve Fitness — dużo kettlebelli, hantli, gum,
TRX) i **Catalyst Athletics — Olympic Weightlifting Exercise Library**
(dwubój olimpijski i ćwiczenia pomocnicze, sztanga). Każde ćwiczenie w bazie
musi mieć kategorię (wzorzec ruchu), coeff, progresję i skok, jednostronność
— albo uczciwe „do weryfikacji” z powodem. **Trener wprost prosi: jeśli nie
jesteś pewien kategorii, coeff albo tego, czy ćwiczenie jest jedno- czy
dwustronne — oznacz do weryfikacji.** Nie zgaduj po cichu.

Ćwiczenia z bibliotek trener wstawia do planów ręcznie (generator ich nie
losuje). Kategoria i coeff liczą obciążenie w planie, więc mają znaczenie.

## Co przeczytać (najpierw)

1. `docs/dane/zasady-klasyfikacji.md` — zasady (źródło prawdy).
2. `partie/baza-wzorce.txt` — 166 decyzji trenera z jego BAZY (kalibracja: jak on klasyfikuje).
3. Swoją partię `partie/partia-XX.txt` — jedna linia na ćwiczenie, z propozycją
   reguł automatycznych (bywa błędna — po to jest przegląd).

Ścieżki względne liczone od katalogu roboczego importu (`KATALOG_IMPORTU`).

## Wynik

Plik `wyniki/partia-XX.jsonl` — **jedna linia JSON na każdą pozycję partii**, w tej
samej kolejności, wszystkie pozycje (także te, gdzie propozycja jest dobra):

```json
{"t":"N0854","kategoria":"Lower push","coeff":0.5,"progresja":"kg","skok_kg":2.5,"jednostronne":"nie","rodzaj":"plyometria","sprzet":["hantle"],"status":"pewne","powody":[],"powod":""}
```

| Pole | Dozwolone wartości |
|---|---|
| `kategoria` | `Lower push`, `Lower pull`, `Upper push horizontal`, `Upper push vertical`, `Tricep`, `Upper pull horizontal`, `Upper pull vertical`, `Bicep`, `Core` (part wynika z kategorii — nie podawaj) |
| `coeff` | `1`, `0.75`, `0.5`, `0.25` |
| `progresja` | `kg`, `masa ciała`, `czas`, `dystans`, `dodatkowy ciężar`, `asysta`, `ręczne ustawienie` |
| `skok_kg` | `0`, `1`, `2.5`, `4`, `5` (zgodnie z tabelą w zasadach: kettlebell 4, piłka lekarska 1, izolacje na hantlach/wyciągu 1, sztanga/hantle/wyciąg/maszyna 2,5, asysta 5, bez ciężaru 0) |
| `jednostronne` | `tak`, `nie`, `?` |
| `rodzaj` | `trening siłowy`, `dwubój olimpijski`, `plyometria`, `mobilność`, `rozciąganie`, `oddech`, `kondycja`, `kompleks` |
| `sprzet` | lista z: `sztanga`, `hantle`, `kettlebell`, `wyciąg`, `guma`, `maszyna`, `TRX`, `piłka lekarska`, `piłka gimnastyczna`, `ławka`, `skrzynia`, `drążek`, `kółka`, `landmine`, `trap bar`, `gryf łamany`, `talerz`, `slider`, `sanie`, `worek`, `roller`, `lina`, `kamizelka`, `ściana` — pusta lista = bez sprzętu |
| `status` | `pewne`, `do weryfikacji`, `pominąć` |
| `powody` | przy `do weryfikacji`: lista kodów z `KOMPLEKS`, `MOBILNOSC`, `KONDYCJA`, `KATEGORIA`, `COEFF`, `JEDNOSTRONNE`, `PROGRESJA`, `NAZWA`; przy `pominąć`: `["NIE_CWICZENIE"]` |
| `powod` | krótko po polsku, konkretnie (np. „thruster: przysiad + wyciskanie — Lower push czy Upper push vertical?”) — przy `pewne` pusty |

Opcjonalnie `"uwaga_nazwa": "..."` — gdy tytuł ma oczywistą literówkę
(np. „Overgead”) albo nie wiadomo, co to za ćwiczenie. Nazw nie zmieniaj.

## Jak decydować

- **Kategoria** = wzorzec ruchu jak w BAZIE i w tabeli zasad. Patrz na
  dominujący ruch i to, co jest obciążone. Przykłady z BAZY: mosty i hip
  thrusty → Lower pull; łydki, przywodziciele, zginacze bioder, skoki →
  Lower push; odwodziciele, clamshell, kickback pośladka → Lower pull;
  carry (noszenie) i TGU → Core; slam piłką → Upper push horizontal;
  unoszenia bokiem/przodem → Upper push vertical; face pull, rear delt,
  rotacje zewnętrzne → Upper pull horizontal; pullover, straight-arm
  pulldown → Upper pull vertical. Zarzut/rwanie i ich ciągi → Lower pull;
  podrzut, push press, wyciskania nad głowę → Upper push vertical;
  overhead squat, snatch balance → Lower push.
- **coeff** — konserwatywnie. `1` tylko dla bojów głównych ze sztangą
  (przysiad, martwy, wyciskanie leżąc, hip thrust ze sztangą, pełny zarzut,
  rwanie, podrzut, power clean/snatch z podłogi) i podciągania/dipów
  z obciążeniem. Warianty z zawieszenia/z bloków 0,75; ciągi zarzutowe
  i rwaniowe, martwe ciągi dwuboju 0,75; ćwiczenia techniczne dwuboju
  (tall, muscle, segment, no-jump, z riserów, floating, slow, lift-off,
  balance, drop) 0,5. Złożone z hantlami/kettlebellem/sztangą (wiosła,
  wykroki, split squat, step-up, wyciskania hantlami) 0,75; wyciąg,
  maszyna, guma, TRX, pompki, większość core w ruchu, deski 0,5;
  izolacje (uginania/wyprosty ramion, unoszenia, rotacje, łydki,
  odwodzenie/przywodzenie, maszyny do kolana) 0,25. Skoki: box/broad/squat
  jump 0,5, pogo/hopy/skipy 0,25. Izometria wariantu ćwiczenia — o stopień
  niżej niż ćwiczenie w ruchu, ale nie niżej niż 0,25.
- **Progresja** — kg dla obciążenia zewnętrznego; masa ciała bez sprzętu;
  czas dla izometrii bez ciężaru, desek, wall sit; dystans dla carry,
  sań, czołgania; dodatkowy ciężar dla ćwiczeń z masą ciała + obciążenie
  (kamizelka, talerz, pas); asysta dla wersji z gumą pomagającą; ręczne
  ustawienie dla samej gumy, mobilności, rozciągania. „Goblet” bez nazwy
  sprzętu → hantel, skok 2,5. Drobnej niepewności skoku (2,5 czy 4) nie
  zgłaszaj.
- **Jednostronne** — `tak`, gdy ćwiczenie wykonuje się jedną stroną naraz
  i serie liczy się na stronę: single arm/leg, SA/SL, 1-arm, alternating
  (naprzemienne — w BAZIE `tak`), wykroki, split squat, bułgarski,
  step-up/down, pistol, archer, skater, cossack, single-arm row/press.
  **Precedens trenera (BAZA): side plank, Copenhagen plank, suitcase carry,
  kickback pośladka, landmine rotations, bird dog, dead bug → `nie`** —
  dla tych samych wzorców daj `nie` i w `powod` nic nie pisz. `?` (→ do
  weryfikacji, kod JEDNOSTRONNE) gdy naprawdę nie wiadomo: jeden ciężar
  w jednej ręce przy ruchu obu nóg (offset, racked jednostronnie, 1KB/1DB
  bez „single arm”), TGU, windmill, half kneeling z jednym ciężarem, ruchy
  rotacyjne na stronę (chop/lift, rzuty rotacyjne). Gdy z nazwy nie wynika,
  a ma to znaczenie — możesz obejrzeć klatki filmu (niżej).
- **Do weryfikacji** zawsze: kompleksy/serie/finishery/„A to B”/„A + B”
  (kilka ćwiczeń: KOMPLEKS — kategoria wg ćwiczenia dominującego), mobilność,
  rozciąganie, oddech, rozgrzewka (MOBILNOSC — kategoria wg okolicy ciała:
  biodro/pośladek → Lower pull, kolano/staw skokowy → Lower push,
  bark/klatka → Upper pull horizontal, kręgosłup/tułów → Core; coeff 0,25;
  progresja ręczne ustawienie), kondycja i koordynacja — agility, sprint,
  czołganie, burpee (KONDYCJA), kategoria na granicy (KATEGORIA: thruster,
  szrugsy, przedramię/nadgarstek, rzuty piłką inne niż slam/chest pass,
  ruchy, których nie potrafisz jednoznacznie przypisać), niepewny coeff
  (COEFF), niepewna jednostronność (JEDNOSTRONNE).
  „Ćwiczenie łączone” z dwóch faz jednego ruchu (np. „Romanian Deadlift to
  Row”) to też KOMPLEKS. Wariant tempa/pauzy/zakresu jednego ćwiczenia
  (pause, 1.5, tempo, ISO hold, deficit, eccentric) to NIE kompleks.
- **Pominąć** tylko nagrania, które nie są demonstracją ćwiczenia: rekord
  konkretnej osoby („Mom Trap Bar Deadlift 170lbs”, „Sumo Deadlift 225lb”,
  imię w tytule), pokaz błędnej techniki („Poor Pull Up Form”), vlog.
- Spójność: te same wzorce w całej partii klasyfikuj tak samo. Jeśli
  propozycja reguł jest dobra — przepisz ją (z `rodzaj` zamienionym na
  słownik powyżej: „siłowe” → „trening siłowy”, „mobilność/rozciąganie” →
  `mobilność` albo `rozciąganie`, „kondycja/koordynacja” → `kondycja`).

## Klatki z filmu (gdy nazwa nie wystarcza)

```
python3 -I kod/klatki.py wyniki/klatki-XX-1.jpg YT_ID [YT_ID ...]   # do 4 filmów naraz
```
potem obejrzyj obraz narzędziem Read (3 klatki z 25/50/75% każdego filmu).
Tylko gdy sprzęt albo jednostronność są naprawdę niejasne i mają znaczenie
— najwyżej ~15 sprawdzeń na partię. Nie pobieraj filmów, nie łącz się
z innymi adresami niż i.ytimg.com.

## Zasady pracy

- Zmieniasz tylko swój plik `wyniki/partia-XX.jsonl` (i obrazy klatek w `wyniki/`).
  Nie ruszaj repozytorium ani innych plików.
- Zapisuj wynik partiami (np. po ~70 linii, dopisując), żeby nic nie przepadło.
- Na końcu sprawdź skryptem, że plik ma tyle linii co partia, każda linia to
  poprawny JSON z dozwolonymi wartościami i `t` w tej samej kolejności:
  `python3 -I kod/sprawdz_wynik.py XX`
- W odpowiedzi końcowej podaj krótko: liczby pewne / do weryfikacji (wg kodów) /
  pominąć, powtarzające się wątpliwości (żeby ujednolicić z innymi partiami)
  i ćwiczenia, przy których propozycja reguł była wyraźnie zła (wzorce błędów).

## Wznowienie i oszczędność (dopisane po przerwie limitu)

- Jeśli `wyniki/partia-XX.jsonl` już istnieje i ma poprawne linie — **nie zaczynaj
  od nowa**: sprawdź ostatni `t` w pliku i dopisuj kolejne pozycje od następnej.
- Zapisuj wynik **od pierwszej partii ~60 pozycji** (dopisując do pliku), nie
  dopiero po przejrzeniu wszystkiego — przerwa nie może skasować pracy.
- Klatki z filmów: najwyżej ~8 sprawdzeń na partię, tylko gdy naprawdę
  zmienia to decyzję. Nie czytaj ponownie dużych plików, które już znasz.
