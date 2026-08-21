# CraftMyPlan — projekt aplikacji treningowej

Projekt aplikacji zbudowanej wokół silnika z **MasterTemplate 5.17** — arkusza, który
liczy ciężary z RPE i 1RM, model stresu na trzech osiach, bilans wzorców ruchu
i pętlę adaptacji na feedbacku klienta.

Dokumentacja opisuje, **jak ten silnik faktycznie działa** (zweryfikowane w pliku,
nie z pamięci) i **jak przenieść go do aplikacji** bez utraty ani jednej liczby.

## Dokumenty

| | |
|---|---|
| [`01-analiza-zrodel.md`](docs/01-analiza-zrodel.md) | Co robi arkusz 5.17, rozbieżności instrukcja ↔ plik, gdzie jest Base44 |
| [`02-silnik-obliczeniowy.md`](docs/02-silnik-obliczeniowy.md) | Jądro rozłożone na funkcje czyste — wzory, sygnatury, plan testów |
| [`03-architektura.md`](docs/03-architektura.md) | Warstwy, schemat bazy, ekrany, rekomendacja stacku, miejsce dla AI |
| [`04-roadmapa.md`](docs/04-roadmapa.md) | Siedem faz, migracja danych, otwarte decyzje |

## Dane referencyjne

Wyciągnięte z 5.17 i sprawdzone przeciwko komórkom arkusza:

| Plik | Zawartość |
|---|---|
| [`dane/tabele-przeliczeniowe.json`](docs/dane/tabele-przeliczeniowe.json) | RPE → %1RM (powt. 1–15 × RPE 6–10) + 3 tabele stresu |
| [`dane/baza-cwiczen.json`](docs/dane/baza-cwiczen.json) | 164 ćwiczenia: kategoria, part, coeff, skok kg, progresja, film, uwagi |
| [`dane/oddech-progi.json`](docs/dane/oddech-progi.json) | 5 progów TWOT → dawka oddechowa |
| [`dane/bieg-parametry.json`](docs/dane/bieg-parametry.json) | strefy tętna, tempa, wzory jednostek biegowych |
| [`dane/jednostronne.json`](docs/dane/jednostronne.json) | 30 ćwiczeń jednostronnych |

## Trzy rzeczy, które trzeba wiedzieć przed czytaniem

**1. Plik wygrywa nad instrukcją.** `CLAUDE.md` opisuje 3 dni i zakładkę PANEL — 5.17
ma 5 dni i zakładkę `Analiza`. Wszystko poniżej opisuje plik.

**2. Znany błąd „przełączniki B4/B5 jako C3/C4" jest już naprawiony w 5.17.**
Zero odwołań do `Analiza!$C$3`/`$C$4` w XML. Przełącznik „trzymaj z bloku" działa.
Błąd TOP SET (formuły zaszyte w wierszu 7) — potwierdzony i naprawiony w 5.18,
razem z dwoma nieznanymi wcześniej brakami formuł.

**3. Base44 „CraftMyPlan" nie ma silnika.** Ma poprawne ekrany i 1 ćwiczenie w katalogu.
Nie ma tabeli RPE, tabel stresu, skoku kg, pętli feedbacku ani reguł ciężaru per tydzień.
To prototyp UI, nie aplikacja do dokończenia.

## Silnik

W [`silnik/`](silnik/) leży działające jądro: ciężary, stres, bilans, walidacja.
Zero zależności, Node 22 uruchamia je wprost.

```bash
cd silnik
npm test                                        # 127 testów, 912 wartości zgodnych z arkuszem
npm run sprawdz -- "Plan klienta.xlsx"          # co jest nie tak z planem
npm run policz -- 1rm 80 5                      # 1RM z serii maksymalnej
npm run policz -- blok "Rope pushdown" --1rm 40 # sześć tygodni naraz
npm run policz -- kontrola                      # listy robocze z BAZY
```

Szczegóły i sposób dokładania własnych planów do testów: [`silnik/README.md`](silnik/README.md).

## Uruchomienie

Jedyne, co trzeba mieć zainstalowane, to **Node 22** ze strony
[nodejs.org](https://nodejs.org) (wersja LTS). Aplikacja nie ma ani jednej
zewnętrznej biblioteki — nie ma czego doinstalowywać.

Potem wystarczy kliknąć plik w głównym katalogu projektu:

| System | Plik |
|---|---|
| Mac | `Uruchom CraftMyPlan.command` |
| Windows | `Uruchom CraftMyPlan.bat` |

Sprawdza wersję Node'a, uruchamia konsolę i sam otwiera przeglądarkę pod
`http://localhost:4173`. Okno terminala musi zostać otwarte — jego zamknięcie
wyłącza aplikację. Gdy czegoś brakuje, plik mówi po polsku czego i zostawia
okno otwarte, zamiast zniknąć.

> Na Macu przy pierwszym kliknięciu system może odmówić otwarcia pliku
> pobranego z internetu. Wtedy: **prawy przycisk → Otwórz → Otwórz**. Raz.

Z terminala, dla tych którzy wolą:

```bash
cd konsola
npm start          # → http://localhost:4173
```

Eksport i import arkusza wymagają dodatkowo Pythona z biblioteką `openpyxl`
(`pip install openpyxl`). Bez nich reszta konsoli działa normalnie.

## Konsola trenera

Układasz plan (5 dni × 12 slotów), widzisz ciężary i analizę na żywo, kontrola
pokazuje co blokuje wysyłkę, przycisk eksportuje arkusz w formacie 5.18.
Sprawdzone całe kółko: plan z konsoli → arkusz → przeliczenie w LibreOffice
(**753 wartości zgodne z silnikiem**) → wczytanie z powrotem do konsoli
(**420 wartości identycznych z planem wyjściowym**).

Dwie rzeczy, których arkusz nie miał: karta **Realizacja** (czy klient w ogóle
ćwiczy — domknięte i zaczęte treningi tydzień po tygodniu) i **1RM z serii
roboczych** (propozycja nowego 1RM policzona z tego, co klient faktycznie
podnosił, zamiast kolejnej serii maksymalnej). Do tego moduły **Oddech** i
**Bieg** — te same kalkulatory co w zakładkach ODDECH i BIEG, sprawdzone
wartość po wartości.

**Kartoteka klienta** — konsola myśli ludźmi, nie dokumentami. Lista klientów
na wejściu, a w kartotece każdego z nich: wszystkie cykle po kolei, 1RM przez
kolejne cykle, obciążenie i wzorce ruchu cykl po cyklu, frekwencja i waga.
Link dla klienta jest jeden i na stałe — nowy cykl nie wymaga wysyłania nowego
adresu.

**Asystent AI** — dwa przyciski: *Zaproponuj szkielet* (układ dni z konkretnymi
ćwiczeniami z BAZY, pod cel, staż i sprzęt) i *Odczytaj analizę* (co wynika
z policzonych liczb, słowami). Granica jest ostra i pilnowana testami: **AI nie
liczy ciężaru, RPE ani serii** — od tego jest silnik. Bez klucza do API funkcja
jest wyłączona, a cała reszta konsoli działa tak samo.

Konsola ma własny przegląd: `npm run przeglad-ekranow` przechodzi drogą trenera
w prawdziwej przeglądarce — lista, plan, eksport, wczytanie arkusza z powrotem,
kartoteka — i po każdym kliknięciu pyta serwer, czy coś się faktycznie
zapisało. Wyszły z tego cztery błędy niewidoczne w testach: **serii maksymalnej
nie dało się wpisać wcale**, bo dwa pola kasowały się nawzajem, a wczytanie
własnego, dopiero co wyeksportowanego arkusza dawało **pusty plan i komunikat
o powodzeniu**.

Szczegóły: [`konsola/README.md`](konsola/README.md).

## Aplikacja klienta

W konsoli: **Link dla klienta** → wysyłasz adres → klient otwiera na telefonie.
Widzi dzisiejszy trening z policzonymi ciężarami, ocenia jednym dotknięciem,
działa bez zasięgu.

Pętla się domyka: ocena klienta zmienia ciężar w kolejnym tygodniu, bez
odsyłania arkusza. Kto chce, dopisuje jeszcze, ile faktycznie podniósł — i z
tego wychodzi nowe 1RM oraz jego własny ekran postępu.

Że ta pętla naprawdę się domyka, sprawdza `npm run przeglad-klienta`: otwiera
link na ekranie telefonu i przechodzi ją całą — ocena „za łatwe” w pierwszym
tygodniu podnosi ciężar w drugim z 90 na 95 kg. Szczegóły i uwagi
o bezpieczeństwie: [`klient/README.md`](klient/README.md).

## Postawienie na serwerze

Konsola domyślnie chodzi na Twoim komputerze i wtedy nic więcej nie trzeba.
Gdy ma być dostępna z telefonu i z drugiego komputera — a klienci mają
otwierać linki niezależnie od tego, czy Twój laptop jest włączony:

**[`WDROZENIE.md`](WDROZENIE.md)** — instrukcja od zera. Serwer, domena,
HTTPS z automatycznym certyfikatem, kopie zapasowe raz na dobę.

## Poprawki do arkusza

[`arkusz/`](arkusz/README.md) robi z 5.17 plik **5.18** z trzema poprawkami:
TOP SET czytający bój główny zamiast pierwszego slotu, plus dwie brakujące formuły
(`START!B7` i `T1!G8`), które wyszły przy testowaniu. Oryginał zostaje nietknięty,
każda poprawka jest do pominięcia osobno.

## Gdzie to jest

Fazy 0–6 z [`04-roadmapa.md`](docs/04-roadmapa.md) są domknięte: jądro
sprawdzone przeciwko arkuszowi, konsola trenera, aplikacja klienta, to czego
arkusz nie umiał, wersja produkcyjna (baza, logowanie, wdrożenie, kopie),
warstwa AI, kartoteka klienta i progresja z szablonu.

Otwarte decyzje — liczenie ćwiczeń jednostronnych i to, czy aplikacja ma kiedyś
przechowywać dane o zdrowiu — są zapisane na końcu roadmapy. Model SaaS dla
innych trenerów (rejestracja, subskrypcje) jest świadomie odłożony: najpierw
narzędzie ma być używane na co dzień.
