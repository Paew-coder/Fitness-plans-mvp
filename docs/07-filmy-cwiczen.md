# 07 — Filmy ćwiczeń w aplikacji (test biblioteki OPEX Fitness)

Test z 09.10.2026 na **jednym ćwiczeniu**: Barbell Bench Press. Film
z oficjalnego kanału OPEX Fitness gra w karcie ćwiczenia w aplikacji
klienta, bez wychodzenia do YouTube. Innych ćwiczeń nie ruszałem — najpierw
ocena wyglądu i działania tego jednego.

---

## 1. Film

| | |
|---|---|
| Tytuł | Barbell Bench Press - OPEX Exercise Library |
| Identyfikator | `ejI1Nlsul9k` · https://www.youtube.com/watch?v=ejI1Nlsul9k |
| Kanał | OPEX Fitness · `@OPEXFitness` · `UCCgDGih2kSp0A6W_0cVYuaQ` |
| Długość | 9 s (krótka pętla demonstracyjna, bez komentarza) |
| Osadzanie | dozwolone |

**Jak sprawdzone** (tylko metadane, bez pobierania filmu):
- kanał — oficjalna strona opexfit.com linkuje do `youtube.com/@OPEXFitness`;
  metadane kanału: nazwa „OPEX Fitness”, opis „OPEX Fitness & CoachRx”;
- film — wynik wyszukiwania na tym kanale; oEmbed YouTube zwraca kod
  odtwarzacza i autora `@OPEXFitness` (przy zablokowanym osadzaniu zwraca błąd);
- w przeglądarce — IFrame Player API zgłasza ten identyfikator i tytuł,
  `isPlayable: true`.

**Uwaga:** ten sam film był już podpięty w BAZIE jako link przy EX-0011
(kolumna filmu z arkusza). Twoja baza najpewniej już odsyła do biblioteki
OPEX także przy innych ćwiczeniach — warto to sprawdzić przed importem.

## 2. Ćwiczenie — bez duplikatu

Barbell bench press **już był w BAZIE** (EX-0011, bój główny, Upper push
horizontal). Nowa pozycja oznaczałaby dwa wyciskania na liście, dwie
historie i rozjazd z regułami bojów — więc istniejące ćwiczenie dostało pola
opisu (`docs/dane/baza-cwiczen.json`):

| Pole | Wartość |
|---|---|
| `nazwa_en` | Barbell Bench Press |
| `nazwa_pl` | Wyciskanie sztangi leżąc |
| `miesnie_glowne` | mięsień piersiowy większy |
| `miesnie_pomocnicze` | triceps, przednia część mięśnia naramiennego |
| `sprzet` | sztanga, ławka pozioma |
| `rodzaj` | trening siłowy (na karcie: „Kategoria”) |

`nazwa` zostaje „Barbell bench press”: po niej import arkusza dopasowuje
ćwiczenia, a reguły klasycznych bojów porównują ją dosłownie. `kategoria`
w BAZIE to wzorzec ruchu z arkusza (na karcie: „Wzorzec ruchu”), dlatego
„trening siłowy” ma osobne pole.

## 3. Filmy osobno od BAZY

`docs/dane/filmy-cwiczen.json` → `silnik/src/dane/filmy.ts` (generator),
logika w `silnik/src/wideo.ts`:

```jsonc
"zrodla": [{ "id": "opex-youtube", "nazwa": "OPEX Fitness", "platforma": "YouTube",
             "kanal": "@OPEXFitness", "kanal_id": "UCCg…", "url": "…" }],
"filmy":  [{ "id": "WID-0001", "cwiczenie_id": "EX-0011", "typ": "youtube",
             "youtube_id": "ejI1Nlsul9k", "zrodlo": "opex-youtube",
             "tytul": "…", "url": "…", "czas_s": 9 }]
```

- Ćwiczenie ma swój identyfikator (EX-…), film swój (WID-…); wpis wiąże je
  po `cwiczenie_id`. BAZA nie wie, skąd jest film.
- **Własne MP4 zamiast YouTube** = zmiana jednego wpisu:
  `"typ": "plik", "plik": "https://…/EX-0011.mp4"` (+ źródło np. „własne”).
  BAZA, plany i aplikacja bez zmian — karta gra plik w `<video>`
  (sprawdzone przeglądem: odtwarzanie, pauza, przewijanie).
  Przy hostingu plików serwer musi obsługiwać zakresy bajtów (`Range`) —
  bez nich Safari na iPhonie/iPadzie filmu nie odtworzy, a żadna przeglądarka
  go nie przewinie. Dzisiejszy serwer konsoli zakresów nie obsługuje — do
  dołożenia razem z pierwszymi własnymi plikami (albo pliki z CDN).
- `sprawdzFilmy()` pilnuje spójności, gdy wpisów będą setki: istniejące
  ćwiczenie, znane źródło, najwyżej jeden film na ćwiczenie, unikalne id,
  poprawne id YouTube.
- Ćwiczenia bez wpisu zostają przy dotychczasowym linku `film` z arkusza
  (otwiera YouTube w nowej karcie) — jak przed testem.

## 4. Karta ćwiczenia w aplikacji klienta

`konsola/public/klient/karta-cwiczenia.js`. Przycisk **▶ film** przy
ćwiczeniu z kartą: na liście treningu, w nagłówku panelu serii (także przy
TOP SECIE) i przy seriach maksymalnych.

- Warstwa nad ekranem (na telefonie arkusz od dołu, szerzej — okno na
  środku): nazwa polska i angielska, odtwarzacz 16:9, podpis „Film: OPEX
  Fitness / YouTube” z linkiem „Otwórz na YouTube ↗”, mięśnie, sprzęt,
  kategoria, wzorzec ruchu, „Wróć do treningu”.
- **Odtwarzacz**: oficjalny YouTube IFrame Player API, `playsinline=1`
  (iPhone nie wyskakuje na pełny ekran), `rel=0`, `enablejsapi=1`,
  `origin` = adres aplikacji. Domena **youtube-nocookie.com** (tryb ochrony
  prywatności — bez ciasteczek śledzących przed odtworzeniem). Elementy
  YouTube (logo, przyciski) zostają — niczego nie ukrywamy.
- **Referer**: serwer wysyła `Referrer-Policy: no-referrer` (link klienta
  niesie token). YouTube wymaga dziś Referera od osadzonego odtwarzacza
  (bez niego błąd 153). Ramka ma własną politykę
  `strict-origin-when-cross-origin` — YouTube dostaje samą domenę, token
  nie wychodzi.
- **Dane treningu bezpieczne**: karta nie zmienia ekranu, więc wpisane
  ciężary i powtórzenia zostają. Systemowe „wstecz” zamyka kartę (aplikacja
  przy cofnięciu rysuje ekran od nowa — bez tego wpisane liczby by przepadły).
  Esc, ✕, dotknięcie tła — też zamykają; zamknięcie zatrzymuje film.
- **Błędy**: brak internetu, film zablokowany do osadzania, usunięty —
  komunikat w miejscu filmu i link do YouTube. Skrypt API wczytuje się
  z ponowieniem; nieudana próba nie blokuje kolejnych.

## 5. Sprawdzone

`npm run przeglad-filmu` (Chromium, prawdziwy odtwarzacz YouTube; aplikacja
pod adresem https z nagłówkami jak w produkcji), na telefonie i komputerze:

- ćwiczenie w bibliotece (raz, EX-0011, z filmem) i w planie;
- przycisk filmu przy wyciskaniu, zwykły link przy innym ćwiczeniu;
- karta: nazwy, mięśnie, sprzęt, kategoria, podpis źródła; cała na ekranie;
- ramka: `youtube-nocookie.com/embed/ejI1Nlsul9k`, `playsinline=1`,
  `enablejsapi=1`, `origin`, polityka Referera;
- IFrame Player API gotowy, zgłasza **ten film** i `isPlayable: true`;
  polecenie startu przyjęte (odtwarzacz przechodzi w buforowanie);
- adres strony bez zmian, żadnej nowej karty;
- wpisane 87,5 kg × 5 i 90 kg w panelu zostają po zamknięciu karty,
  „wstecz” zamyka kartę, Esc zamyka, historia ekranów nietknięta;
- własny plik wideo w tej samej karcie: gra, pauza, przewijanie, `playsinline`;
- bez błędów aplikacji w przeglądarce.

Plus `npm test` (konsola) i testy silnika: karta w widoku klienta, dane
filmów spójne z BAZĄ, zamiana na MP4 bez ruszania BAZY.

**Środowisko testowe nie przepuszcza strumienia wideo z serwerów YouTube**
— odtwarzacz zostaje na „buforuje” i obraz nie rusza. Skrypt odtwarzacza
też dochodził tu z przerwami (przegląd wtedy ponawia i mówi to wprost).
Dlatego **do sprawdzenia ręcznie**:

1. iPhone (Safari) i iPad: przycisk ▶ film przy „Barbell bench press” →
   karta → miniatura z przyciskiem odtwarzania YouTube.
2. Odtworzenie: film gra **w karcie**, nie na pełnym ekranie i nie w aplikacji
   YouTube.
3. Pauza, wznowienie, przewijanie paskiem odtwarzacza.
4. „Wróć do treningu” w trakcie odtwarzania — dźwięk/obraz się zatrzymuje,
   wpisany ciężar jest na miejscu.
5. To samo na komputerze (Chrome/Safari).
6. Gest „wstecz” (przesunięcie od lewej krawędzi na iPhonie) zamyka kartę,
   a nie trening.

## 6. Pod przyszłą bibliotekę (bez importu teraz)

Import kanału = dopisanie wpisów do `filmy-cwiczen.json`, bez zmian w kodzie:

1. Lista filmów kanału (YouTube Data API z kluczem albo lista ręczna) —
   tytuły mają stały wzór „<Ćwiczenie> - OPEX Exercise Library”.
2. Dopasowanie do BAZY po nazwie (jak import arkusza: `katalog.poNazwie`),
   niedopasowane — do decyzji trenera, nie zgadywane.
3. Każdy film przez oEmbed (osadzanie dozwolone, autor = kanał OPEX).
4. `sprawdzFilmy()` przed zapisem; generator; testy.

Licencja: osadzanie publicznego filmu odtwarzaczem YouTube jest zgodne
z warunkami YouTube, ale **nie daje prawa do pobrania i hostowania** tych
filmów jako własnych MP4 — na to potrzebna zgoda OPEX. Własne MP4 to
osobna droga (własne nagrania albo licencja).
