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

## 3. Dane — format `craftmyplan/analiza-ruchu`, wersja 1

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

**Pewność:** klatka niepewna („?”), gdy słabo widoczne (poniżej 50%) są punkty
segmentów o łącznej masie ponad 10% ciała. Niepewne klatki nie wchodzą do serii.

**Wygładzanie:** Butterworth 2. rzędu, 6 Hz (najwyżej 0,4 × kl./s), w przód
i w tył — bez przesunięcia w czasie; odcięcie poprawione o 0,802 na dwa
przejścia (Winter). Luki do 5 klatek wypełniane liniowo, dłuższe dzielą serię.
Na wykresie blada linia — bez wygładzania.

**Obciążenie:** kg i miejsce (barki — środek barków; dłonie — środek rąk)
plus masa ciała: środek wspólny = średnia ważona masą ciała i obciążenia.
Bez masy ciała obciążenie nie jest doliczane (komunikat w odczycie).

**Ograniczenia:** 2D z obrazu (płaszczyzna kamery), wynik w pikselach i % stopy,
nie w centymetrach; przesunięcie punktów bioder o 3 cm przesuwa środek
ciężkości o ok. 1 cm. Porównania tej samej osoby przy tym samym ustawieniu
kamery są pewniejsze niż wartości bezwzględne.

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
