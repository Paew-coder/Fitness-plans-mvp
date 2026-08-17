-- Schemat bazy CraftMyPlan.
--
-- Dwie decyzje, które warto rozumieć przed czytaniem reszty:
--
-- 1. KAŻDY wiersz nosi `trener_id`, choć dziś trener jest jeden. To jedyna
--    rzecz, której nie da się dołożyć później bez przepisywania wszystkiego —
--    a jest darmowa, dopóki robi się ją od początku.
--
-- 2. Sam plan (60 slotów × 6 tygodni parametrów) leży jako JSON w jednej
--    kolumnie. Silnik konsumuje go w całości i nigdy nie pytamy „pokaż
--    wszystkie plany zawierające ćwiczenie X". Rozbicie na tabele kupiłoby
--    złożoność bez żadnego zapytania w zamian.
--
--    Wyjątek: wykonania, ukończone dni i waga MAJĄ własne tabele. One rosną
--    w czasie, dopisują się pojedynczo i to po nich liczymy postęp.

CREATE TABLE IF NOT EXISTS wersja_schematu (
  wersja  INTEGER NOT NULL,
  wgrana  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS trener (
  id         INTEGER PRIMARY KEY,
  email      TEXT    NOT NULL UNIQUE,
  nazwa      TEXT    NOT NULL,
  -- NULL znaczy „konto bez hasła" — tak wygląda instalacja lokalna u trenera
  -- na komputerze, gdzie logowanie byłoby tylko przeszkodą.
  hash_hasla TEXT,
  utworzony  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS plan (
  trener_id    INTEGER NOT NULL REFERENCES trener(id) ON DELETE CASCADE,
  id           TEXT    NOT NULL,
  klient       TEXT    NOT NULL,
  wersja       INTEGER NOT NULL,
  status       TEXT    NOT NULL CHECK (status IN ('szkic', 'wysłany', 'zakończony')),
  data_startu  TEXT,
  utworzony    TEXT    NOT NULL,
  zmieniony    TEXT    NOT NULL,
  poprzedni_id TEXT,
  -- Klucz dostępu klienta. Unikalny globalnie, bo szukamy po samym tokenie,
  -- bez wiedzy, czyj to plan.
  token        TEXT    UNIQUE,
  oddech_json  TEXT,
  bieg_json    TEXT,
  plan_json    TEXT    NOT NULL,
  PRIMARY KEY (trener_id, id)
);

CREATE INDEX IF NOT EXISTS plan_zmieniony ON plan (trener_id, zmieniony DESC);

CREATE TABLE IF NOT EXISTS wykonanie (
  trener_id            INTEGER NOT NULL,
  plan_id              TEXT    NOT NULL,
  position_id          TEXT    NOT NULL,
  tydzien              INTEGER NOT NULL,
  data                 TEXT    NOT NULL,
  ciezar_wykonany      REAL,
  powtorzenia_wykonane INTEGER,
  feedback             TEXT CHECK (feedback IN ('OK', 'za łatwe', 'za trudne')),
  PRIMARY KEY (trener_id, plan_id, position_id, tydzien),
  FOREIGN KEY (trener_id, plan_id) REFERENCES plan(trener_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ukonczony_dzien (
  trener_id INTEGER NOT NULL,
  plan_id   TEXT    NOT NULL,
  tydzien   INTEGER NOT NULL,
  dzien     INTEGER NOT NULL,
  data      TEXT    NOT NULL,
  PRIMARY KEY (trener_id, plan_id, tydzien, dzien),
  FOREIGN KEY (trener_id, plan_id) REFERENCES plan(trener_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pomiar_wagi (
  trener_id INTEGER NOT NULL,
  plan_id   TEXT    NOT NULL,
  -- `RRRR-MM-DD`. Jeden wpis na dzień; kolejny tego samego dnia nadpisuje.
  data      TEXT    NOT NULL,
  kg        REAL    NOT NULL,
  PRIMARY KEY (trener_id, plan_id, data),
  FOREIGN KEY (trener_id, plan_id) REFERENCES plan(trener_id, id) ON DELETE CASCADE
);
