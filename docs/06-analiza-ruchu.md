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
