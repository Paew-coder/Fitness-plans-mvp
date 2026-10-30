# 06 — Analiza ruchu (MediaPipe Pose Landmarker)

Moduł konsoli trenera, od 07.10.2026: **film → sylwetka klatka po klatce →
punkty → kąty i trajektorie → zatrzymana klatka → sugerowana pozycja.**
Strona `/ruch/`, wejście linkiem „Analiza ruchu” z ekranu głównego konsoli.

Pierwszy etap: stabilny przepływ danych i prototyp dla przysiadu. Warstwy AI,
która generuje rekomendacje, **jeszcze nie ma** — dane i model sugestii są na
nią przygotowane (niżej, „Co dalej”).

---

## 1. Gdzie to siedzi i dlaczego tak

**Obecna architektura** (stan przed modułem): serwer Node 22 bez zależności
(`konsola/serwer.ts`), dane w SQLite, konsola trenera i aplikacja klienta jako
statyczne strony z czystym JavaScriptem, silnik obliczeń jako osobny pakiet
funkcji bez I/O (`silnik/`), testy `node:test`, przeglądy klikane Playwrightem.
Konsola chodzi pod `craftmyplan.pl` za HTTPS i hasłem — to ważne, bo kamera
w przeglądarce działa tylko przez HTTPS (albo na `localhost`).

**Decyzje:**

| Decyzja | Dlaczego |
|---|---|
| Analiza **w przeglądarce**, nie na serwerze | Film klienta nie opuszcza urządzenia trenera (RODO, dane o zdrowiu). Serwer nie potrzebuje GPU ani Pythona. Ten sam kod na laptopie i iPadzie. |
| Osobna strona `/ruch/`, za tym samym logowaniem | Konsola ma już ~2900 linii w jednym pliku; analiza ruchu to inny rodzaj pracy. Brama dostępu się nie zmienia — bez logowania `/ruch/` pokazuje ekran logowania, a po nim wraca na analizę. |
| Logika jako **czyste moduły ES** (`szkielet`, `geometria`, `przebieg`, `profile`, `sesja`) | Bez DOM i bez MediaPipe — te same pliki ładuje przeglądarka i testy Node (`testy/analiza-ruchu.test.ts`). Tak jak silnik: liczby da się sprawdzić bez ekranu. |
| MediaPipe z CDN, **wersja przypięta: 0.10.35** | Zero zależności w repozytorium (biblioteka + model ~20 MB). Od wersji 1.0 MediaPipe co minutę wysyła do Google statystyki użycia (`odml.pa.googleapis.com`), a dokumentacja przerzuca na właściciela aplikacji obowiązek zebrania zgody. 0.10.35 nie wysyła nic. Przegląd ruchu blokuje i zgłasza każde połączenie poza bibliotekę i model — sprawdzone: z wersją 1.0.1 robi się czerwony. |
| Zapis do pliku (JSON, CSV), **jeszcze nie do bazy** | Format jest gotowy do zapisu w bazie przy kliencie — ale to decyzja o przechowywaniu danych biometrycznych klientów, więc czeka na trenera. |

## 2. Przepływ

```
film (plik albo kamera → MediaRecorder)
  │  <video> w przeglądarce
  ▼
analiza klatka po klatce (detektor.js)
  │  odtwarzanie z pauzą na każdej klatce (requestVideoFrameCallback):
  │  klatka → płótno ≤ 960 px → PoseLandmarker.detectForVideo
  │  zgubione klatki (obciążony procesor) — cofnięcie i uzupełnienie
  ▼
sesja (sesja.js): 33 punkty obrazu + 33 punkty 3D na klatkę, z czasem w ms
  ▼
kąty (geometria.js) · trajektorie i powtórzenia (przebieg.js, profile.js)
  ▼
ekran (app.js): nakładka, klatka po klatce, tabele, wykres, sugestie, zapis
```

**Dlaczego odtwarzanie, a nie przewijanie co 1/30 s.** Zmierzone na filmie
12 s: przewinięcie kosztuje ~120 ms na klatkę (dekoder wraca do ostatniej
klatki kluczowej), MediaPipe ~70 ms. Odtwarzanie z pauzą dekoduje po kolei:
**34 s zamiast 235 s**, każda klatka filmu dokładnie raz, z jej prawdziwym
czasem. Przewijanie zostało jako zapas dla przeglądarek bez
`requestVideoFrameCallback`.

**Zgubione klatki.** Przy obciążonym procesorze przeglądarka potrafi pokazać
dwie klatki w jednym odświeżeniu ekranu. Analiza mierzy odstęp klatek filmu
na początku, wykrywa lukę, odkłada bieżącą klatkę, cofa się po brakujące i liczy
je po kolei. Przegląd sprawdza to przy sztucznie zajętym procesorze: 45–49
uzupełnionych, komplet 132 z 132.

**Początek i koniec filmu (23.10.2026).** Trener: „aplikacja ucina mi
początek filmu, gdzie osoba stoi prosto przed przysiadem”. Odtwarzanie
zgłasza dopiero klatki pokazane po starcie, więc pierwsza (widoczna już po
przewinięciu na 0) przepadała zawsze, a gdy start trwał dłużej (Safari,
pierwsze uruchomienie modelu) — cały początek, bo przerwy przed pierwszą
zgłoszoną klatką nikt nie uzupełniał. Zmierzone na filmie z licznikiem
klatek, gdy przeglądarka przez 1,2 s nie zgłasza klatek: analiza zaczynała
się od 1000 ms, 90 ze 120 klatek. Teraz klatka 0 liczy się przed startem
odtwarzania, przerwa za nią uzupełnia się jak każda inna (także przy limicie
kl./s — co krok analizy), a ostatnie klatki po „ended” (najwyżej trzy) —
przewinięciem. Wynik: 120 ze 120 od 0 ms, także przy wolnym starcie
i obciążonym procesorze (przegląd ruchu, „Początek filmu”).

**Karta graficzna.** Gdy przeglądarka ma tylko programową „kartę” (SwiftShader,
llvmpipe — np. komputer bez sterowników), MediaPipe liczy na niej ~600 ms na
klatkę. Wtedy od razu procesor.

## 3. Dane — format `craftmyplan/analiza-ruchu`, wersja 2

Wersja 2 (24.10.2026) dokłada punkt sztangi, badanie i wersję narzędzia —
wszystko opcjonalne, więc pliki wersji 1 otwierają się bez zmian (szczegóły
w 5c). Poniżej pola wspólne.

```jsonc
{
  "format": "craftmyplan/analiza-ruchu", "wersja": 1,
  "utworzono": "2026-10-07T10:15:00.000Z",
  "cwiczenie": "przysiad",
  "wideo": { "nazwa": "przysiad.mp4", "szerokosc": 1280, "wysokosc": 720, "czasTrwania": 12263 },
  "analiza": { "biblioteka": "@mediapipe/tasks-vision 0.10.35", "model": "pose_landmarker_full",
               "delegat": "GPU", "tryb": "odtwarzanie", "fps": 23.98, "czasAnalizyMs": 33800 },
  "landmarki": ["nose", "left_eye_inner", … 33 identyfikatory MediaPipe],
  "klatki": [
    { "i": 0, "t": 0,
      "p": [[x, y, z, widocznosc, obecnosc] × 33],   // obraz, 0–1
      "w": [[x, y, z] × 33] }                          // model 3D, metry, środek bioder
  ],
  "sugestie": [
    { "id": "s…", "klatka": 43, "t": 1835, "punkt": "left_hip", "x": 0.5178, "y": 0.8062,
      "autor": "trener", "notatka": "biodra dalej w tył" }
  ]
}
```

- **Zawsze wszystkie 33 punkty** — główne (głowa, barki, łokcie, nadgarstki,
  biodra, kolana, stawy skokowe) to tylko wybór ekranu. Identyfikatory to nazwy
  MediaPipe; „left” = lewa strona ciała osoby na filmie.
- **Kąty się nie zapisują** — liczą się z punktów, więc poprawka wzoru działa
  też na stare nagrania.
- **Głowa** = środek uszu (z boku — ucho widoczne, bez uszu — nos).
- CSV: klatka w wierszu, czas, 13 głównych punktów w pikselach z widocznością,
  wszystkie kąty 2D; średnik i przecinek dziesiętny, BOM — otwiera się w Excelu.

## 4. Kąty

Konwencja kliniczna. Dwa układy: **2D** z obrazu (piksele — inaczej film 16:9
zniekształca kąty) i **3D** z modelu MediaPipe (mniej zależne od kamery, głębia
szacowana).

| Kąt | Definicja |
|---|---|
| Zgięcie kolana L/P | 180° − kąt biodro–kolano–staw skokowy; 0° = wyprost |
| Zgięcie biodra L/P | 180° − kąt bark–biodro–kolano; 0° = tułów w linii z udem |
| Zgięcie grzbietowe stopy L/P | 90° − kąt goleń (staw skokowy→kolano) / stopa (pięta→palce); + = goleń nad palcami |
| Zgięcie łokcia L/P | 180° − kąt bark–łokieć–nadgarstek |
| Ramię względem tułowia L/P | kąt biodro–bark–łokieć; 0° = wzdłuż tułowia, 90° = w przód lub w bok |
| Pochylenie tułowia | linia środek bioder → środek barków względem pionu |
| Głowa względem tułowia | linia barki → głowa względem linii biodra → barki |
| Głowa przed barkami (2D) | poziomo, % długości tułowia, + w stronę patrzenia |
| Przechył linii barków / bioder (2D) | względem poziomu, + = lewa strona niżej |

**Pewność.** Każdy kąt ma pewność = najmniejsza widoczność użytych punktów;
poniżej 50 % tabela pokazuje go ze znakiem „?”, a wykres pomija. Do tego
**ujęcie**: moduł rozpoznaje „z boku / z przodu / skos” z proporcji szerokości
barków i bioder do długości tułowia i oznacza jako niepewne kąty, których z tego
ujęcia nie widać — z powodem w podpowiedzi. Powód jest konkretny: na filmie
z przodu zgięcie grzbietowe stopy w 2D wychodziło od −90° do +40°.

## 5. Przysiad — prototyp profilu

`profile.js`: wykres (kolano, biodro, stopa, tułów), trajektorie (biodro,
kolano, bark), powtórzenia ze zgięcia kolana (progi z samego nagrania,
histereza 60 % / 30 % zakresu). W każdym powtórzeniu: czas ruchu, zejścia
i wstawania, największe zgięcia, pochylenie tułowia, biodro względem kolana
w dole (% uda; „pod” = poniżej równoległej), rozstaw kolan do stóp (z przodu).
Nowe ćwiczenie = nowy wpis w `PROFILE`; profil „Inne ćwiczenie” działa bez
liczenia powtórzeń.

**Najgłębszy punkt (23.10.2026).** Trener: „w pracy magisterskiej sczytywałem
zakresy w stawach w najgłębszym momencie przysiadu”. Tabela powtórzeń ma dla
każdego powtórzenia wiersz z czasami i dwa wiersze kątów z tymi samymi
kolumnami: **największe w ruchu** (każdy kąt w swojej klatce — jak dotąd)
i **w najgłębszym punkcie** — wszystko z jednej klatki, tej, w której biodro
jest najniżej na obrazie (jak krętarz większy najbliżej podłoża w pracy;
biodro strony z analizy, przy słabej widoczności — drugiej, potem środek bioder;
`najglebszaKlatka` w `profile.js`). Biodro względem kolana, rozstaw kolan do
stóp i środek ciężkości — też z tej klatki; wiersz przenosi do niej. Pełne
nazwy kolumn: zgięcie kolana, zgięcie biodra, zgięcie grzbietowe stawu
skokowego, pochylenie tułowia, biodro względem kolana (% długości uda, „pod” =
poniżej równoległej), rozstaw kolan do stóp (tylko z przodu; < 1 = kolana do
środka). Kąt „Zgięcie grzbietowe stopy” nazywa się teraz „Zgięcie grzbietowe
stawu skokowego”.

## 5a. Punkty na obrazie (23.10.2026)

Trener: „chciałbym móc obserwować tylko punkty po prawej stronie bez lewej”.
Pod przełącznikami, od razu rozwinięte (zwinięcie pamięta przeglądarka):
**„Punkty na obrazie”** — tabela ułożona jak ciało (wiersze od głowy do stóp,
kolumny Lewa i Prawa; pole w nagłówku kolumny zaznacza lub odznacza całą
stronę) i przyciski „Wszystkie”, „Tylko prawa strona”, „Tylko lewa strona”.
Schowany punkt znika z obrazu razem z odcinkami do niego, etykietą kąta przy
nim i punktami, które do niego należą przy „wszystkich 33” (`grupaPunktu`:
twarz → głowa, palce dłoni → nadgarstek, pięta i palce stopy → staw skokowy;
oko, ucho i kącik ust jednej strony znikają razem z całą tą stroną —
`punktWidoczny`). Znika też trajektoria schowanego punktu (na liście trajektorii
dopisek „schowany”), a „Tylko prawa / lewa strona” przenosi wybrane trajektorie
na widoczną stronę. Szyja przy jednej stronie idzie od jej barku. Schowanego
punktu nie da się wybrać dotknięciem obrazu (z tabeli — tak).

To ustawienie ekranu, nie analizy: tabele, wykres, trajektorie i zapis
JSON/CSV mają dalej wszystkie punkty. „Tylko prawa / lewa strona” przestawia
też „Stronę ciała” (kąty w tabeli, na wykresie i w powtórzeniach). Wybór
pamięta przeglądarka na tym urządzeniu (`localStorage`).

## 5b. Środek ciężkości — metoda segmentowa (23.10.2026)

Trener: „dodajmy do aplikacji możliwość analizy środka ciężkości metodą
segmentową — De Leva razem z rozróżnieniem na płeć, plus wygładzenie
trajektorii”. To ta sama metoda co w jego pracy magisterskiej (środki
segmentów na zdjęciu → średnia ważona masą), tylko w każdej klatce filmu.
Kod: `public/ruch/srodek.js` (czysty moduł, testy w `testy/analiza-ruchu.test.ts`).

**Model segmentów** — wybór w panelu „Środek ciężkości” (zapisuje się w JSON):

| Segment | Końce (de Leva → MediaPipe) | Masa K / M (%) | Środek K / M (% długości od pierwszego końca) |
|---|---|---|---|
| głowa | — → środek uszu (punkt) | 6,68 / 6,94 | — |
| tułów | SUPR/MIDS–MIDH → środek barków – środek bioder | 42,57 / 43,46 | 41,51 / 44,86 |
| ramię | SJC–EJC → bark – łokieć | 2,55 / 2,71 | 57,54 / 57,72 |
| przedramię | EJC–WJC → łokieć – nadgarstek | 1,38 / 1,62 | 45,59 / 45,74 |
| ręka | WJC–MET3 → nadgarstek – ⅓ drogi od palca wskazującego do małego | 0,56 / 0,61 | 74,74 / 79,00 |
| udo | HJC–KJC → biodro – kolano | 14,78 / 14,16 | 36,12 / 40,95 |
| podudzie | KJC–LMAL → kolano – kostka | 4,81 / 4,33 | 44,16 / 44,59 |
| stopa | HEEL–TTIP → pięta – palce stopy | 1,29 / 1,37 | 40,14 / 44,15 |

Źródło: de Leva P., *Adjustments to Zatsiorsky–Seluyanov's segment inertia
parameters*, J Biomech 1996;29(9):1223–1230, Tabela 4 (pierwszy wiersz każdego
segmentu; sprawdzone z przedrukiem tabeli i z dokumentacją Visual3D). Trzeci
model — **Braune i Fischer, jak w pracy magisterskiej** (Ryc. 3): masy 7 / 43 /
3 / 2 / 1 / 12 / 5 / 2%, środki 0,44 tułowia, 0,47 ramienia, 0,42 przedramienia,
0,44 uda, 0,42 podudzia, 0,44 stopy od pięty, ręka w połowie śródręcza; głowa —
ucho. Test odtwarza przykład z pracy: Xc 3,69, Yc 4,84.

**Przybliżenia** (MediaPipe nie ma punktów anatomicznych de Levy): punkty
MediaPipe zamiast środków stawów; głowa — środek uszu (de Leva liczy od szczytu
głowy); tułów od środka barków (u de Levy wcięcie jarzmowe mostka / środek
stawów ramiennych) do środka bioder; głowa III kości śródręcza — na ⅓ drogi
między punktami palca wskazującego i małego.

**Strony ciała:** ujęcie z boku (rozpoznane z całego nagrania) — strona z pola
„Strona ciała” liczona podwójnie, bo dalsza ręka i noga są zasłonięte i MediaPipe
je zgaduje (jak w pracy: „RA 3+3%”); tułów wtedy od jej barku do biodra. Ujęcie
z przodu i skośne — obie strony osobno.

**Wynik:** w każdej klatce x, y w pikselach i położenie względem stóp — z boku
nad stopą (pięta 0%, palce 100%; kierunek stopy z obrazu, działa przy osobie
zwróconej w lewo i w prawo), z przodu między stopami (lewa 0%, prawa 100%).
Na obrazie symbol (koło w czarno-białe ćwiartki), przerywany pion do linii stóp
i droga środka ciężkości; wykres w % z pasami powtórzeń; w tabeli powtórzeń
kolumna „ŚC” (wartość w dole powtórzenia); w CSV pięć kolumn na końcu.

**Miejsce na ekranie:** na szerokim ekranie panel stoi na górze prawej
kolumny, obok filmu (wykres na wysokości filmu); w jednej kolumnie (iPad
w pionie, telefon) — zaraz pod filmem i przełącznikami. Obciążenie zwinięte
(„Obciążenie: bez obciążenia”), opis metody pod „Jak to jest liczone”.

**Pewność:** klatka niepewna („?”), gdy słabo widoczne (poniżej 50%) są punkty
segmentów o łącznej masie ponad 10% ciała. Niepewne klatki nie wchodzą do serii.

**Wygładzanie:** Butterworth 2. rzędu, 6 Hz (najwyżej 0,4 × kl./s), w przód
i w tył — bez przesunięcia w czasie; odcięcie poprawione o 0,802 na dwa
przejścia (Winter). Luki do 5 klatek wypełniane liniowo, dłuższe dzielą serię.
Na wykresie blada linia — bez wygładzania.

**Obciążenie:** kg i miejsce (barki — środek barków; dłonie — środek rąk;
od 24.10.2026 także **sztanga — punkt końca gryfu na obrazie**, domyślne, gdy
analiza ma ten punkt, patrz 5c) plus masa ciała: środek wspólny = średnia
ważona masą ciała i obciążenia. Bez masy ciała obciążenie nie jest doliczane
(komunikat w odczycie).

**Ograniczenia:** 2D z obrazu (płaszczyzna kamery), wynik w pikselach i % stopy,
nie w centymetrach; przesunięcie punktów bioder o 3 cm przesuwa środek
ciężkości o ok. 1 cm. Porównania tej samej osoby przy tym samym ustawieniu
kamery są pewniejsze niż wartości bezwzględne.

## 5c. Punkt sztangi — badanie high bar / low bar (24.10.2026)

Trener przygotowuje badanie do doktoratu: przysiad high bar bez wskazówki,
high bar ze wskazówką i low bar, kamera z boku. „Narzędzie musi odróżnić high
bar od low bar” — a obciążenie w punkcie barku tego nie widzi: sztanga leży
wyżej albo niżej na plecach, bark jest ten sam. Dlatego obciążenie liczy się
teraz w punkcie końca gryfu na obrazie. Instrukcja dla trenera (bez języka
programisty): `docs/instrukcja-badania-sztanga.md`.

Kod: `public/ruch/sztanga.js` (śledzenie), `srodek.js` (trzy wyniki),
`miary-srodka.js` (miary w powtórzeniu), `sesja.js` (zapis) — czyste moduły
bez DOM; testy w `testy/analiza-ruchu.test.ts`; ekran w `app.js`.

### Zaznaczenie

- **Przed analizą** (zalecane): pole „Przysiad ze sztangą” w panelu źródła
  (zapamiętane na urządzeniu). Po wgraniu filmu analiza nie rusza od razu —
  pierwsza klatka filmu z prośbą „Zaznacz koniec gryfu”: dotknięcie stawia
  punkt, przeciągnięcie przesuwa, w rogu lupa ×3 (palec zasłania punkt).
  Wybór sposobu śledzenia, potem „Analizuj” — sylwetka i sztanga liczą się
  w jednym przejściu, na tym samym płótnie (dłuższy bok 960 px).
- **Po analizie**: „Zaznacz koniec gryfu” w panelu „Środek ciężkości” —
  przenosi na klatkę 1, dotknięcie stawia punkt, a program przechodzi film
  drugi raz, tylko dla sztangi (bez MediaPipe, szybciej).

### Śledzenie (bez bibliotek)

| | wzór obrazu (`wzorzec`) | kolorowa naklejka (`naklejka`) |
|---|---|---|
| Co | wycinek 25 × 25 px wokół punktu szukany w następnej klatce | piksele w kolorze naklejki, plama najbliżej przewidywanego miejsca |
| Jak | znormalizowana korelacja wzajemna (NCC) jasności, okno ±40 px wokół pozycji przewidzianej z prędkości, najpierw co 2 px, potem co 1 px, parabola — część piksela | odcień ±20°, nasycenie i jasność z miejsca zaznaczenia; punkt = środek plamy |
| Pewność | wartość NCC (0–1), próg 0,6 | zgodność wielkości plamy z tą z punktu kontrolnego (0–1), próg 0,5 |
| Odporność | wzorzec odświeżany przy NCC ≥ 0,8, pozycja poprawiana porównaniem z wzorcem z punktu kontrolnego (±3 px) — bez narastania błędu (Matthews, Ishikawa, Baker 2004) | kolor nie zmienia się, gdy talerze się obracają albo zmienia się tło; zaznaczenie przeskakuje na środek naklejki |

Klatka poniżej progu = zgubiona, „?”: nie wchodzi do wyników (ani sztanga, ani
środek układu), na filmie przerywany pierścień ze znakiem „?”, na wykresie
czerwona kreska pod osią. Następna klatka szuka w oknie szerszym o 50% (do ×3).
Parametry i próg zapisują się w analizie (`sztanga.parametry`, `sztanga.prog`) —
zmiana w kodzie nie zmienia starych plików.

Sprawdzone na sztucznym znaczniku (testy) i na sztucznym filmie z ffmpeg
(przegląd ruchu, kodek VP8): największy błąd ok. 1,4 px (wzór obrazu) i ok. 1,5 px (naklejka) przy
znaczniku ~29 px; zasłonięcie na 3 klatki → dokładnie te 3 klatki „?”, potem
punkt wraca.

### Poprawki — punkty kontrolne

„Popraw sztangę” → dotknięcie albo przeciągnięcie pierścienia na bieżącej
klatce (z lupą). Ta klatka staje się **punktem kontrolnym** (źródło `korekta`,
pewność 1, biała obwódka), a śledzenie liczy się od niej od nowa **do następnego
punktu kontrolnego** (tamten też postawił trener, więc go nie nadpisuje).
Klatki w tym odcinku, których przejście nie trafiło, zostają bez punktu, nie ze
starym. „cofnij poprawkę w tej klatce” — klatka wraca do śledzenia, odcinek
liczy się od poprzedniego punktu kontrolnego. „następna klatka „?”” — do
sprawdzenia po kolei. Zmiana sposobu śledzenia albo „Śledź od nowa” — cały film
od każdego punktu kontrolnego po kolei. Bez filmu (sam JSON) poprawka zmienia
tylko tę klatkę; ponowne śledzenie wymaga dołączenia filmu.

### Trzy wyniki

W każdej klatce, osobno (`srodekSesji(...).wyniki`):

- **ciało** — środek ciężkości samego ciała (metoda segmentowa z 5b, bez
  obciążenia),
- **sztanga** — punkt końca gryfu (tor sztangi),
- **układ** — ciało + sztanga: `(M·ciało + m·gryf) / (M + m)`, M — masa
  ciała, m — kilogramy na gryfie (gryf + talerze); tylko z masą ciała.

Każdy w pikselach filmu (x, y), w % stopy (pięta 0%, palce 100% — jak w 5b)
i w pikselach od pięty (dodatnie w stronę palców), surowo i po tym samym
filtrze Butterwortha (6 Hz, w przód i w tył). Niepewna klatka ciała — bez
ciała i układu; niepewny punkt sztangi — bez sztangi i układu. Kolumny
„srodek_ciezkosci_…” w CSV znaczą to samo co wcześniej (z obciążeniem).

Test ręczny: 80 kg ciała, 100 kg na gryfie → układ = (80·C + 100·G)/180
dokładnie. High bar vs low bar (gryf 22 px dalej w tył) → układ w tył
o 22·100/180 px, ciało bez zmian; to samo z obciążeniem „na barkach” — zero
różnicy (dlatego punkt sztangi).

### Śródstopie

Pas stały, domyślnie **40–60% długości stopy od pięty**, do zmiany pod
wykresem (zapisuje się w analizie: `srodekCiezkosci.pasmo`). Na filmie
zielonkawy pas od linii stóp do góry obrazu (pięta i palce z tej klatki), na
wykresie — tło 40–60%. Tylko z boku (z przodu skala jest między stopami).

### Miary w powtórzeniu (`miary-srodka.js`)

Dla każdego z trzech wyników, w każdym powtórzeniu (początek i koniec —
z wykrytych powtórzeń, najgłębszy punkt — `najglebszaKlatka`, biodro
najniżej; zejście = początek → najgłębszy punkt, wstawanie = najgłębszy
punkt → koniec):

| Miara | Definicja |
|---|---|
| na początku | położenie w pierwszej klatce zejścia z wynikiem |
| najdalej w stronę palców (w dół) | max(położenie) − położenie na początku, w zejściu; z klatką i samym położeniem |
| w najgłębszym punkcie | położenie w klatce najgłębszego punktu |
| zakres przód–tył | max − min w całym powtórzeniu; osobno w zejściu i we wstawaniu |
| czas w śródstopiu | % klatek powtórzenia z wynikiem, w których położenie jest w paśmie (klatki „?” się nie liczą; ile ich było — w CSV) |

Na ekranie — tabela „Środek ciężkości i sztanga w powtórzeniach” (z serii
wygładzonych, gdy wygładzanie jest włączone; % stopy, piksele w dymku;
klatka „najdalej” klikalna); w CSV powtórzeń — surowe i wygładzone, % i px.

### Na ekranie

Ciało — symbol w ćwiartki z niebieską obwódką (jak dotąd), sztanga —
czerwony pierścień z kropką (jak talerz na gryfie), układ — symbol
w ćwiartki z zieloną (limonkową) obwódką i pionem do linii stóp. Każdy
z drogą w całym nagraniu; legenda z polami „pokaż” i wartością w bieżącej
klatce; na wykresie trzy linie (+ blade bez wygładzania), pas śródstopia
i kreski klatek „?”. Każda nowa miara ma „i” z dymkiem (najechanie albo
dotknięcie): co znaczy i jak to czytać. W panelu — zwijane „Jak nagrać
i zaznaczyć sztangę” (7 kroków).

### Zapis

- **JSON, wersja 2**: `klatki[].sztanga = { x, y, pewnosc, zrodlo }` (x, y 0–1,
  źródło `sledzenie` / `korekta`), `sztanga = { tryb, prog, parametry, narzedzie }`,
  `srodekCiezkosci.pasmo`, `badanie = { kodOsoby, warunek }`, `narzedzie`
  (niżej), `analiza.narzedzie` — wersja, która liczyła sylwetkę. Plik wersji 1
  otwiera się jak dotąd, a zapisany — jest już wersją 2. Analiza z pliku bez
  filmu pokazuje sztangę i wszystkie wyliczenia.
- **CSV (klatki)** — nowe kolumny na końcu: punkt sztangi (`sztanga_punkt_x_px`,
  `…_y_px`, `sztanga_pewnosc`, `sztanga_pewna`, `sztanga_zrodlo`), trzy wyniki
  (`cialo_` / `sztanga_` / `uklad_` + `x_px`, `y_px`, wygładzone,
  `wzgledem_stop_proc`, `od_piety_px`) i parametry w każdym wierszu
  (`wersja_narzedzia`, `kod_osoby`, `warunek`, `model_segmentow`,
  `strona_konczyn`, `filtr`, `odciecie_hz`, `pasmo_srodstopia_od/do_proc`,
  `tryb_sledzenia_sztangi`, `prog_pewnosci_sztangi`, `obciazenie_kg`,
  `masa_ciala_kg`, `miejsce_obciazenia`).
- **CSV (powtórzenia)** — układ „długi”: wiersz = powtórzenie × wynik × seria
  (surowa, wygładzona); wszystkie miary w % i px, klatki i czasy, te same
  kolumny parametrów.
- **Nazwy plików**: z kodem osoby i warunkiem — `P01_HB-bez-wskazowki_2026-11-03_analiza.json`,
  `…_klatki.csv`, `…_powtorzenia.csv` (data analizy); bez nich — jak dotąd.
  Kod osoby i warunek czyszczą się przy nowym filmie (nie przechodzą na
  następną osobę); kod wyglądający jak imię — ostrzeżenie.

### Wersja narzędzia (do artykułu)

Numer z `konsola/package.json` (od tej zmiany 0.2.0) + skrót commita, np.
`0.2.0+a1b2c3d` (`konsola/wersja-narzedzia.ts`, `GET /api/wersja`). Commit:
zmienna `CRAFTMYPLAN_COMMIT` → plik `konsola/wersja-commit.txt` (zapisuje go
skrypt wdrożenia przed zbudowaniem obrazu — w obrazie nie ma gita) → katalog
`.git` → „lokalna”. W JSON `narzedzie = { nazwa, wersja, parametry }`
(MediaPipe i model, model segmentów, strona, filtr, odcięcie w Hz, poprawka
0,802, kl./s, pasmo, obciążenie, śledzenie z parametrami) — z chwili zapisu.

**Zamrożenie na badanie** (decyzja trenera, „jak powiem, to zamrozimy”):
znacznik w repozytorium na commicie z badania (np. `badanie-sztanga-1`),
a od tej chwili zmiany w obliczeniach `/ruch/` tylko za zgodą trenera. Serwer
aktualizuje się sam, więc każdy plik niesie swoją wersję — w CSV kolumna
`wersja_narzedzia` musi być ta sama we wszystkich plikach badania.

### Poprawka perspektywy (27.10.2026)

Trener po opisie ograniczeń: „dodaj poprawkę perspektywy”. W panelu
„Środek ciężkości” → „Perspektywa”: pole „poprawka perspektywy końca gryfu”,
odległość kamery D (od obiektywu do środka między stopami osoby, w metrach)
i długość gryfu L (domyślnie 2,20 m; damski 2,01 m). Kamera otworkowa, gryf
równoległy do osi obiektywu — koniec gryfu (głębokość D − L/2) i środek gryfu
(głębokość D, płaszczyzna ruchu ciała) leżą na jednym promieniu od środka
kadru c, więc środek gryfu na obrazie:

    x' = cx + (x − cx) · (D − L/2) / D,   y' = cy + (y − cy) · (D − L/2) / D

(`poprawPerspektywe` w `srodek.js`; przy 3,5 m i 2,2 m: × 0,686). Z poprawionego
punktu liczą się wyniki sztangi i układu (px, % stopy, miary w powtórzeniu);
punkt w klatkach zostaje taki, jak na obrazie (do sprawdzania śledzenia) —
na filmie czerwony pierścień na końcu gryfu i mała kropka z kreską w środku
gryfu. Liczby bez sensu (kamera bliżej niż metr od końca gryfu, gryf spoza
1–2,6 m) — poprawka nie działa, nagłówek prosi o odległość. Zapis: JSON
`srodekCiezkosci.perspektywa`, `narzedzie.parametry.perspektywa` (z wzorem),
CSV — na końcu `poprawka_perspektywy`, `odleglosc_kamery_m`, `dlugosc_gryfu_m`;
w CSV klatek `sztanga_punkt_…` — jak na obrazie, `sztanga_x_px` — po poprawce.
Bez poprawki przy sztandze — przypomnienie przed zapisem.

Czego poprawka nie robi: punkt główny obiektywu to środek kadru (telefon ze
stabilizacją albo przycięty film może go przesuwać), gryf ma być równoległy do
osi obiektywu (kamera obrócona — gryf widać jako kreskę i wzór nie pasuje),
bliższa stopa i kończyny (ok. 15–20 cm bliżej kamery) zostają bez poprawki —
pięta i palce tej samej stopy mają ten sam błąd, więc % stopy prawie się nie
zmienia.

### Czas klatki z obrazu (27.10.2026)

Przy przejściu przez film przeglądarka zgłasza klatkę t, ale zanim pauza
zadziała, potrafi pokazać już następną — na płótno szedł obraz klatki t + 1
z czasem t (złapane na sztucznym filmie: punkt sztangi w klatce 22 dokładnie
tam, gdzie znacznik w klatce 23; zdarzało się w ok. co trzecim przebiegu
przeglądu). Sylwetki dotyczyło to samo. `currentTime` tego nie pokazuje
(zostaje w tyle), `VideoFrame` z filmu — tak: niesie czas klatki, która jest
w filmie. Gdy jest późniejszy, obraz dostaje ten czas, a przeskoczoną klatkę
przejście dopełnia jak każdą zgubioną (`czasObrazu` w `detektor.js`; bez
`VideoFrame` — jak dotąd). Po zmianie: 8 przebiegów przeglądu bez ani jednej
przesuniętej klatki.

### Ograniczenia

- **Perspektywa.** Koniec gryfu jest bliżej kamery niż środek ciała —
  o pół gryfu, ok. 1,1 m przy gryfie 2,2 m. Z bliższego punktu kamera widzi
  wszystko powiększone: odległość od środka kadru rośnie o D / (D − 1,1)
  (D — odległość kamery od środka ciała): ×1,46 przy 3,5 m, ×1,38 przy 4 m,
  ×1,12 przy 10 m. Środek masy sztangi leży w połowie gryfu (w płaszczyźnie
  ciała), a obraz pokazuje jego koniec — więc położenie sztangi przód–tył jest
  dokładne tylko blisko środka kadru. Dlatego: **kamera z boku, prostopadle do
  płaszczyzny ruchu, czyli patrzy wzdłuż gryfu** (oba końce na sobie), **3–4 m
  od osoby, na wysokości bioder, poziomo**, a **śródstopie na środku kadru
  w poziomie**. Wtedy gryf przez cały ruch jest blisko środka kadru w poziomie:
  przy 10 cm od środka kadru błąd przód–tył to ok. 4 cm przy 4 m (wysokość
  gryfu jest powiększona bardziej — ona nie wchodzi do wyników w % stopy).
  Kamera obrócona względem gryfu — gryf widać jako kreskę, a koniec przesuwa
  się względem środka gryfu. Bliższa stopa i kończyny (strona liczona
  podwójnie) też są bliżej kamery, ale o ok. 15–20 cm — wpływ mały. To samo
  ustawienie we wszystkich trzech warunkach: porównania tej samej osoby są
  pewniejsze niż wartości bezwzględne. Od 27.10.2026 jest **poprawka
  perspektywy** (niżej) — ustawienie kamery dalej ma znaczenie: poprawka
  zakłada, że kamera patrzy wzdłuż gryfu, a środek obrazu to środek
  obiektywu.
- 2D z obrazu: piksele i % stopy, nie centymetry (jak w 5b).
- Wzór obrazu gubi się, gdy koniec gryfu jest jednolity (bez naklejki),
  rozmazany przy szybkim ruchu albo zasłonięty ręką — wtedy naklejka; kolor
  naklejki nie może występować na ubraniu ani w tle obok gryfu.
- % stopy zależy od pięty i palców z MediaPipe w tej klatce (jak w 5b).

## 6. Sugerowana pozycja

Na zatrzymanej klatce: wybór punktu (dotknięcie albo wiersz tabeli) →
„Zaznacz sugerowaną pozycję” → dotknięcie obrazu (przeciągnięcie poprawia).
Na obrazie: ● obecna → ○ sugerowana, przerywana strzałka. Panel pokazuje, jak
to zmienia kąty tej klatki (np. zgięcie biodra 97° → 130°) — kąty liczone
ponownie z podstawionym punktem. Jedna sugestia na punkt i klatkę, z notatką.
Pole `autor` („trener” teraz, „ai” później) — AI zapisze swoje sugestie w tym
samym miejscu i tym samym kształcie.

## 7. Sprawdzone

- `npm test` — 31 testów modułu na sylwetkach o znanej geometrii (kąty,
  proporcje obrazu, pewność, ujęcie, powtórzenia z histerezą, zapis, CSV,
  sugestie i ich skutek). Kontrola czułości: bez przeliczenia na piksele,
  bez reguły stopy, z „najbliższą” zamiast widocznej klatki i bez histerezy
  testy robią się czerwone.
- `npm run przeglad-ruchu` — prawdziwe MediaPipe w Chromium, 50 kontroli na
  dwóch filmach przysiadów (Mixkit, darmowa licencja; nie ma ich
  w repozytorium) i nagraniu z kamery. Z przodu: sylwetka w 293/293 klatkach,
  3 powtórzenia jak na filmie, w dole kolana 112°/116° (3D). Z boku: kolano
  40–132°, jedno powtórzenie. Plus: zatrzymanie klatki, wybór punktu,
  sugestia, wykres, 3D, zapis/odczyt JSON i CSV, analiza bez filmu, telefon
  i iPad bez przewijania w bok, zero połączeń poza bibliotekę i model.

```bash
WIDEO_PRZYSIAD_PRZOD=…/przod.webm WIDEO_PRZYSIAD_BOK=…/bok.webm \
KAMERA_Y4M=…/kamera.y4m ZRZUTY=…/zrzuty npm run przeglad-ruchu
```

Filmy w WebM — Chromium z Playwrighta nie odtwarza H.264. Safari na iPadzie
odtwarza wszystko, co nagra iPhone (także HEVC).

## 8. Ograniczenia pierwszego etapu

Punkt sztangi i perspektywa — w 5c („Ograniczenia”).

- Jedna osoba w kadrze (`numPoses: 1`).
- Kąty 2D zależą od ustawienia kamery — dlatego wskazówka ujęcia, rozpoznanie
  ujęcia i przełącznik 3D. Odległości w pikselach, nie w centymetrach.
- Analiza nie zapisuje się sama — trzeba pobrać JSON. Zamknięcie karty kasuje
  niepobraną analizę.
- Pierwsze otwarcie pobiera bibliotekę i model (~20 MB) — potem z pamięci
  przeglądarki. Bez internetu za pierwszym razem analiza nie ruszy.

## 9. Co dalej

1. **Zapis przy kliencie** (decyzja trenera): sesja JSON w bazie, przy karcie
   klienta i ćwiczeniu z planu; film zostaje na urządzeniu.
2. **Podgląd na żywo** przy nagrywaniu — szkielet na obrazie z kamery.
3. **Kolejne profile**: martwy ciąg, wyciskanie, wykroki — wpisy w `PROFILE`.
4. **Warstwa AI**: wejście — kąty, trajektorie i podsumowanie powtórzeń (liczby,
  nie film); wyjście — sugestie w istniejącym kształcie (`autor: "ai"`,
  punkt, klatka, x/y, notatka) i ich skutek liczony tym samym `skutekSugestii`.
  Tak jak przy planach: AI proponuje, trener zatwierdza, liczby liczy kod.
