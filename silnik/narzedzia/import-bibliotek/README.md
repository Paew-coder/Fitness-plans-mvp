# Import bibliotek filmów (Theory of Motion, Catalyst Athletics)

Skrypty, którymi 09.10.2026 powstały `docs/dane/biblioteka-cwiczen.json`
i wpisy bibliotek w `docs/dane/filmy-cwiczen.json`. Opis wyniku:
[`docs/08-biblioteki-cwiczen.md`](../../../docs/08-biblioteki-cwiczen.md).

Dane robocze (listy kanałów, wyniki przeglądu, klatki — ok. 35 MB) są poza
repo, w katalogu wskazanym przez `KATALOG_IMPORTU` (domyślnie bieżący).
Stan decyzji jest w `biblioteka-cwiczen.json` — po weryfikacji przez trenera
to on jest źródłem prawdy, a `buduj.py` zachowuje zatwierdzone pozycje,
przypięte poradniki i odpięte filmy.

## Kroki

| Krok | Plik | Wejście → wyjście |
|---|---|---|
| 1. Listy filmów | `python3 -m yt_dlp --flat-playlist -J --sleep-requests 1.5 --extractor-retries 15 --retry-sleep extractor:exp=2:30` (YouTube przerywa dłuższe listy — ponowienia) | playlista przesłanych `UU3f1WJ6Uqr1SBkdUkfTChYQ` → `tom-uploads.json`; playlista Catalyst `PLEaPUUsRrMbwMMSS5L2z3eskcz6lHXkj0` → `catalyst-biblioteka.json` |
| 2. Czyszczenie ToM | `czysc.py` | → `tom-cwiczenia.json`, `tom-poradniki.json`, `tom-pominiete.json` |
| 3. Czyszczenie Catalyst | (jednorazowo) | sufiks „\| Olympic Weightlifting Exercise Library” (albo „- …”) zdjęty z tytułu → `catalyst-cwiczenia.json` |
| 4. Osadzanie | `osadzanie.py` | oEmbed każdego filmu → `osadzanie.jsonl` (wznawialne) |
| 5. Grupy wariantów | `grupuj.py` + `kanon.py` | → `tom-grupy.json` |
| 6. Encje | `encje.py` + `mapa_baza.py`, `mapa_cat_tom.py`, `mapa_poradniki.py`, `reguly.py` | jedno ćwiczenie = jeden wpis, z propozycją klasyfikacji → `encje.json` |
| 7. Przegląd | `INSTRUKCJA-PRZEGLADU.md`, `USTALENIA-PRZEGLADU.md`, `pokaz.py`, `klatki.py`, `scal_reczne.py`, `sprawdz_wynik.py`, `spojnosc.py` | partie po ~230 → `wyniki/partia-XX.jsonl` |
| 8. Budowa | `buduj.py` (+ `scal.txt`) | → `docs/dane/biblioteka-cwiczen.json`, `docs/dane/filmy-cwiczen.json`, `raport.json` |

Potem: `python3 silnik/narzedzia/generuj-dane.py` i testy.

## Nowe filmy na kanałach

Lista (krok 1) → porównanie `youtube_id` z `filmy-cwiczen.json` → nowe
przez kroki 2–7 → `buduj.py`. Id ćwiczeń i filmów są stałe (po kluczu
kanonicznym i parze ćwiczenie–film), więc plany trenera się nie rozjadą.
