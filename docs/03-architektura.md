# 03 — Architektura aplikacji

## 1. Czym ta aplikacja jest

**Konsola trenera + aplikacja klienta na jednym silniku.**

Nie „aplikacja fitness". Rynek aplikacji treningowych jest pełen, a żadna nie robi tego, co robi ten arkusz: nie liczy stresu na trzech osiach, nie rozdziela `part` od kategorii, nie zamyka pętli feedback → mnożnik → ciężar. To jest produkt trenerski z widokiem dla klienta, nie odwrotnie.

Dwie role, jeden model danych:

| | Trener | Klient |
|---|---|---|
| Wejście | dobór ćwiczeń, szkielet, serie/RPE boju głównego, przełączniki | serie maksymalne, feedback, odhaczenie treningu |
| Wyjście | analiza obciążenia, walidacja, porównanie cykli, podgląd wszystkich klientów | dzisiejszy trening z ciężarami i filmami, historia, postęp |
| Urządzenie | desktop | telefon |

---

## 2. Warstwy

```
┌─────────────────────────────────────────────────────┐
│  UI trenera (desktop)      UI klienta (mobile PWA)  │
├─────────────────────────────────────────────────────┤
│  Warstwa aplikacji — przypadki użycia, autoryzacja  │
├─────────────────────────────────────────────────────┤
│  ★ JĄDRO (@craftmyplan/silnik) — funkcje czyste     │
│    ciężar · powtórzenia · stres · bilans · walidacja│
│    zero I/O, zero zależności, testy przeciw 5.17    │
├─────────────────────────────────────────────────────┤
│  Repozytoria — Postgres                             │
├─────────────────────────────────────────────────────┤
│  Adaptery: import .xlsx · eksport .xlsx · Sheets API │
└─────────────────────────────────────────────────────┘
```

**Najważniejsza decyzja architektoniczna: jądro jest osobnym pakietem bez żadnych zależności.**

Powody:
1. Da się je przetestować co do liczby przeciwko arkuszowi (`02-silnik-obliczeniowy.md` §13). Gdyby siedziało w komponentach UI albo w kodzie generowanym przez Base44 — nie da się.
2. Przeżyje zmianę frontendu, backendu i platformy. Frontend przepiszesz w rok, jądro nie.
3. Jest jedyną częścią systemu, której nie da się kupić ani odtworzyć z dokumentacji. To jest własność intelektualna.

---

## 3. Stack — rekomendacja

**Rekomendacja: własne repo, TypeScript end-to-end, Postgres. Base44 zostaje jako makieta, nie jako fundament.**

| Warstwa | Wybór | Dlaczego ten |
|---|---|---|
| Jądro | TypeScript, zero zależności | Ten sam kod na serwerze i w kliencie; ciężary liczą się offline na siłowni |
| Baza | Postgres (Supabase) | Relacje, migracje, RLS na poziomie wiersza (klient widzi tylko swoje) |
| Backend | Next.js API routes / Supabase Edge | Jeden język, jedno repo |
| UI trenera | React + TypeScript, tabela wirtualizowana | 5 dni × 12 slotów × 6 tygodni — musi się przewijać płynnie |
| UI klienta | PWA (React), offline-first | Zasięg na siłowni bywa żaden. To nie jest opcja, to wymaganie |
| Import/eksport | `exceljs` / `openpyxl` | Migracja i awaryjny powrót do arkusza |

Dlaczego nie zostać na Base44: silnik z 5.17 to ~600 linii logiki z twardym kontraktem liczbowym i zestawem testów regresyjnych. Buduje się to raz, a potem nie rusza. Base44 świetnie generuje ekrany, ale nie da się w nim trzymać kodu, który musi zgadzać się co do grosza z arkuszem i mieć testy — a bez tego migracja z arkusza nigdy nie będzie bezpieczna.

Co zabrać z Base44: układ onboardingu, ekran wyboru ćwiczeń per slot, kalendarz z przesuwaniem dat (`date_overrides` to dobry pomysł), log wagi, integrację Stripe. To są przemyślane ekrany — projekt UI jest dalej niż silnik.

**Trzeźwo o kosztach:** to jest projekt na miesiące, nie na weekend, i wchodzi w podstawy (SQL, TypeScript, testy), które i tak są na Twojej trajektorii. Jeśli priorytetem jest szybkie postawienie czegokolwiek przed klientami — patrz roadmapa, faza 0: konsola trenera na własnym silniku, klient dalej dostaje wyeksportowany arkusz. Silnik jest wtedy potrzebny od razu, UI klienta później.

---

## 4. Model danych

```sql
-- ═══ KATALOG ═══════════════════════════════════════════════

create table cwiczenia (
  id              text primary key,          -- 'EX-0001'
  nazwa           text not null unique,
  kategoria       kategoria_enum not null,
  part            part_enum not null,        -- s d b r c
  coeff           numeric(3,2) not null check (coeff in (0.25,0.5,0.75,1)),
  skok_kg         numeric(4,2) not null default 2.5,
  progresja       progresja_enum not null,
  film            text,
  uwagi           text,
  scalone_z       text references cwiczenia(id),   -- duplikat zwinięty
  do_weryfikacji  boolean not null default false,
  archiwalne      boolean not null default false
);
-- 164 rekordy z docs/dane/baza-cwiczen.json

create table tabela_rpe (
  powtorzenia int, rpe numeric(3,1), procent_1rm numeric(4,1),
  primary key (powtorzenia, rpe)
);

create table tabela_stresu (
  os stres_os_enum,                          -- calkowity | centralny | obwodowy
  rpe numeric(3,1), powtorzenia int, wartosc numeric(3,1),
  primary key (os, rpe, powtorzenia)
);

-- ═══ KLIENCI I PLANY ═══════════════════════════════════════

create table klienci (
  id uuid primary key,
  trener_id uuid not null references uzytkownicy(id),
  user_id uuid references uzytkownicy(id),   -- null = klient stacjonarny bez konta
  imie text not null, nazwisko text,
  data_urodzenia date, plec text,
  notatki_zdrowotne text,                    -- kontuzje, przeciwwskazania
  utworzony timestamptz not null default now()
);

create table plany (
  id uuid primary key,
  klient_id uuid not null references klienci(id),
  nazwa text not null,                       -- 'Plan Treningowy Zuzanna C'
  wersja int not null,                       -- 1, 2, 3 … zamiast kopiowania pliku
  poprzednia_wersja_id uuid references plany(id),
  status plan_status not null default 'szkic',  -- szkic|wyslany|w_trakcie|zakonczony
  data_startu date,
  liczba_dni int not null check (liczba_dni between 1 and 5),
  tryb_akcesoriow tryb_enum not null default 'trzymaj z bloku',
  czesc_planu czesc_enum not null default 'objętość',
  utworzony timestamptz not null default now(),
  unique (klient_id, nazwa, wersja)
);

-- Struktura planu: sloty niezależne od tygodnia (odpowiednik T1 + szkielet)
create table sloty (
  id uuid primary key,
  plan_id uuid not null references plany(id) on delete cascade,
  dzien int not null check (dzien between 1 and 5),
  pozycja int not null check (pozycja between 1 and 12),
  lp text not null,                          -- 'A1.' 'B1.' 'B2.'
  grupa text generated always as (left(lp,1)) stored,   -- superseria
  cwiczenie_id text references cwiczenia(id),
  kategoria_szkieletu kategoria_enum,        -- null = pełna baza
  unique (plan_id, dzien, pozycja)
);

-- Parametry per slot × tydzień (odpowiednik T1..T6, ale bez formuł lustrzanych)
create table parametry_tygodnia (
  slot_id uuid not null references sloty(id) on delete cascade,
  tydzien int not null check (tydzien between 1 and 6),
  serie int,
  powtorzenia int,                           -- null = wylicz automatem
  rpe numeric(3,1),
  cwiczenie_id_override text references cwiczenia(id),  -- podmiana w T4–T6
  one_rm_reczny numeric(6,2),                -- odpowiednik kol. AA
  ciezar_override numeric(6,2),              -- jawne nadpisanie, cofalne
  notatka text,
  primary key (slot_id, tydzien)
);

create table top_sety (
  plan_id uuid references plany(id) on delete cascade,
  dzien int, tydzien int,
  wlaczony boolean not null default true,
  rpe numeric(3,1) not null default 7,
  slot_id uuid references sloty(id),          -- JAWNA referencja — naprawa buga z wiersza 7
  primary key (plan_id, dzien, tydzien)
);

-- ═══ WEJŚCIE KLIENTA ═══════════════════════════════════════

create table serie_maksymalne (
  id uuid primary key,
  plan_id uuid not null references plany(id) on delete cascade,
  cwiczenie_id text not null references cwiczenia(id),
  ciezar numeric(6,2) not null,
  powtorzenia int not null check (powtorzenia between 1 and 15),
  one_rm numeric(6,2) not null,              -- wyliczone, przechowane dla audytu
  data date not null default current_date,
  unique (plan_id, cwiczenie_id, data)       -- historia, nie nadpisywanie
);

create table wykonania (                      -- czego arkusz nie ma w ogóle
  id uuid primary key,
  slot_id uuid not null references sloty(id),
  tydzien int not null,
  data timestamptz not null default now(),
  ciezar_wykonany numeric(6,2),
  powtorzenia_wykonane int,
  feedback feedback_enum,                     -- OK | za łatwe | za trudne
  notatka text,
  unique (slot_id, tydzien)
);

create table dni_ukonczone (
  plan_id uuid references plany(id) on delete cascade,
  dzien int, tydzien int,
  data_planowana date, data_faktyczna date,   -- odpowiednik date_overrides
  ukonczony boolean not null default false,
  primary key (plan_id, dzien, tydzien)
);

-- ═══ MODUŁY POBOCZNE ═══════════════════════════════════════

create table modul_oddech (
  plan_id uuid primary key references plany(id) on delete cascade,
  twot_sekundy int, przeciwwskazania boolean not null default false
);

create table modul_bieg (
  plan_id uuid primary key references plany(id) on delete cascade,
  wiek int, hr_max int,
  test_dystans_km numeric(4,1), test_czas_min numeric(5,1),
  jednostek_tygodniowo int check (jednostek_tygodniowo between 1 and 5)
);

create table pomiary_wagi (
  id uuid primary key,
  klient_id uuid not null references klienci(id),
  waga numeric(5,2) not null, data date not null, notatka text
);
```

### Trzy decyzje warte uzasadnienia

**1. `parametry_tygodnia` zamiast sześciu kopii planu.**
W arkuszu T2–T6 to formuły lustrzane, a nadpisanie „zrywa link tylko w tej komórce" — czyli stan „czy to jest jeszcze lustro?" jest niejawny i nieodwracalny. Tutaj ćwiczenie mieszka w `sloty` (jedno miejsce, sześć tygodni), a tydzień trzyma tylko to, co się różni. `null` = policz automatem. `ciezar_override` = jawne nadpisanie, które widać i które można cofnąć jednym kliknięciem.

**2. `wykonania` jako osobna tabela.**
Arkusz przechowuje plan. Nie przechowuje tego, co klient faktycznie zrobił — kolumna `H` to jedno pole feedbacku, nadpisywane. Rozdzielenie *zaplanowane* od *wykonane* odblokowuje wszystko, czego arkusz nie umie: historię obciążeń, wykresy postępu, automatyczną aktualizację 1RM, realną frekwencję klienta.

**3. `plany.wersja` + `poprzednia_wersja_id` zamiast kopiowania pliku.**
`Zuzanna C 1.0 → 2.0 → 3.0` to dziś trzy niezależne pliki. Tutaj to łańcuch, po którym da się przejść zapytaniem — czyli walidator „to ćwiczenie było w poprzednim cyklu" działa sam z siebie.

---

## 5. Ekrany

### Konsola trenera

**`Klienci`** — lista z sygnałem: kto ćwiczy, kto przestał, komu kończy się cykl, kto ma otwarty plan w szkicu. Dziś ta informacja nie istnieje nigdzie.

**`Kreator planu`** — główny ekran, następca T1.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Zuzanna C · wersja 4 (szkic)      [ objętość ▾ ] [ trzymaj z bloku ▾ ]│
│ [T1] T2  T3  T4  T5  T6                        start: 01.09.2026     │
├──────────────────────────────────────────────────────────────────────┤
│  DZIEŃ I                                          ▲ TOP SET  RPE 7   │
│  Lp.  ĆWICZENIE            SERIE POWT  RPE  CIĘŻAR   ▓ stres         │
│  A1.  High bar back squat    6    6    6,5   85 kg   ██████ 3,6  s   │
│  B1.  Dumbbell bench press   3    8    8     32 kg   ███    1,8  b   │
│  B2.  Machine row            3    8    8     50 kg   ███    1,8  r   │
│  C1.  ⌷ wybierz — Core                                               │
│  …                                                                    │
│  Dzień I — razem: 19 serii · 152 powt. · stres 12,4                  │
├──────────────────────────────────────────────────────────────────────┤
│  ROZKŁAD  s ████████░░ 28%  d ████░░░░ 14%  b ██████░░ 24%           │
│           r ██████░░ 22%  c ███░░░░░ 12%   ·  dolne/górne  42/46     │
│           centralny/obwodowy  38/62     ·  RAZEM 44,1  ✓ w normie    │
├──────────────────────────────────────────────────────────────────────┤
│  ⚠ 2 ostrzeżenia    ✗ 1 błąd — Machine row: brak serii maksymalnej   │
└──────────────────────────────────────────────────────────────────────┘
```

Zasady tego ekranu:
- **Analiza liczy się na żywo, przy każdej zmianie.** W arkuszu też, i to jest jego największa zaleta — nie wolno tego zgubić.
- Wybór ćwiczenia filtruje się kategorią szkieletu (zastępuje całą zakładkę LISTY).
- Zmiana kolejności = przeciągnięcie wiersza. Problem „wycinaj tylko widoczny zakres, nigdy całe wiersze" przestaje istnieć — `position_id` jest atrybutem, nie miejscem.
- Wspólna litera = wspólne tło = superseria, jak w arkuszu.
- Błędy blokują wysyłkę. Ostrzeżenia wymagają potwierdzenia.

**`Analiza`** — sześć tygodni obok siebie: stres tygodniowy z oceną, objętość per wzorzec, kategorie, realizacja i odczucia. Port zakładki `Analiza` 1:1, plus jedna rzecz, której arkusz nie ma: **porównanie z poprzednim cyklem tego klienta**.

**`Baza ćwiczeń`** — CRUD ze wszystkimi polami. Kolejka „do weryfikacji" (16 pozycji) i „bez filmu" (26 pozycji) jako listy robocze, nie jako flagi zakopane w komórkach.

### Aplikacja klienta

**`Dzisiaj`** — jeden ekran, kciukiem, offline.

```
┌─────────────────────────────┐
│ Tydzień 2 · Dzień I         │
├─────────────────────────────┤
│ ▲ TOP SET   1 × 1  RPE 7    │
│   High bar back squat 92 kg │
├─────────────────────────────┤
│ A1. High bar back squat  ▶  │
│     6 serii × 6   RPE 6,5   │
│     ▸ 85 kg                 │
│     ○ ○ ○ ○ ○ ○             │
│     [ OK ] [ łatwe ] [trud] │
├─────────────────────────────┤
│ B1. Dumbbell bench press ▶  │
│ B2. Machine row          ▶  │   ← wspólne tło = superseria
│ …                           │
├─────────────────────────────┤
│      [ zakończ trening ]    │
└─────────────────────────────┘
```

- `▶` = film z BAZY, otwiera się w miejscu.
- Feedback trzystanowy dokładnie jak w kolumnie `H` — jedno dotknięcie, bez wpisywania.
- Odhaczenie serii jest lokalne, synchronizuje się gdy wróci zasięg.
- Zakończenie dnia domyślnie ustawia `OK` tam, gdzie klient nic nie zaznaczył — tak działa arkusz (`AB = IF(H<>"", H, IF(dzień ukończony, "OK", ""))`).

**`Serie maksymalne`** — onboarding cyklu. Lista ćwiczeń wymagających 1RM, wpis ciężar + powtórzenia, wynik od razu. Odpowiednik START.

**`Postęp`** — czego arkusz nie ma: 1RM w czasie, obciążenie tydzień po tygodniu, frekwencja, waga.

**`Oddech` / `Bieg`** — widoczne tylko gdy trener włączył moduł.

---

## 6. Warstwa AI — dopiero gdy jądro stoi

Cel z `STAN-PROJEKTU.md` to trener AI-native. Kolejność ma znaczenie: **AI nie może liczyć ciężarów.** Ciężary liczy jądro, deterministycznie i sprawdzalnie. AI dostaje trzy zadania, w których nie może zrobić szkody:

1. **Propozycja szkieletu** — wejście: cel, staż, dostępne dni, sprzęt, kontuzje, poprzedni cykl. Wyjście: kategorie per slot (`kategoria_szkieletu`), do akceptacji trenera. To dokładnie tryb A z `CLAUDE.md`: „propozycja szkieletu → czekać na akceptację".
2. **Dobór ćwiczeń w ramach kategorii** — z filtrem, który już masz: bez powtórek z poprzedniego cyklu, z respektowaniem sprzętu i notatek zdrowotnych. Trener zatwierdza.
3. **Odczytanie analizy słowami** — „obwodowy 68% przy dwóch tygodniach z rzędu powyżej normy w wyciskaniu; rozważ ścięcie serii b w T3". Interpretacja liczb policzonych przez jądro, nigdy ich zastępowanie.

Czego AI nie robi nigdy: nie liczy ciężaru, nie zmienia RPE, nie decyduje przy sygnale kontuzji. Sygnał bólu / przeciwwskazania → oznaczenie i propozycja konsultacji, zgodnie z zasadą bezpieczeństwa z `CLAUDE.md`.
