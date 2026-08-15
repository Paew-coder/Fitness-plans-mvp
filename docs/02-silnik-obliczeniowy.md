# 02 — Silnik obliczeniowy

Specyfikacja jądra przeniesionego z MasterTemplate 5.17. Wszystko tutaj to **funkcje czyste**: te same wejścia → ten sam wynik, zero zapytań do bazy, zero dat, zero losowości. To warunek, żeby dało się to przetestować przeciwko arkuszowi.

Dane referencyjne: [`dane/tabele-przeliczeniowe.json`](dane/tabele-przeliczeniowe.json), [`dane/baza-cwiczen.json`](dane/baza-cwiczen.json), [`dane/oddech-progi.json`](dane/oddech-progi.json).

---

## 1. Typy podstawowe

```ts
type Part      = 's' | 'd' | 'b' | 'r' | 'c';
type Coeff     = 1 | 0.75 | 0.5 | 0.25;
type Kategoria =
  | 'Lower push' | 'Lower pull'
  | 'Upper push horizontal' | 'Upper push vertical'
  | 'Upper pull horizontal' | 'Upper pull vertical'
  | 'Core' | 'Bicep' | 'Tricep';
type Progresja =
  | 'kg' | 'asysta' | 'masa ciała' | 'dodatkowy ciężar'
  | 'czas' | 'dystans' | 'ręczne ustawienie';

type Cwiczenie = {
  id: string;              // EX-0001 — klucz obcy, nigdy nazwa
  nazwa: string;
  kategoria: Kategoria;
  part: Part;              // gdzie ląduje obciążenie ≠ kategoria
  coeff: Coeff;            // 1 złożony główny · 0,75 pomocniczy · 0,5 semi-izolacja · 0,25 izolacja
  skokKg: number;          // najmniejszy sensowny przyrost
  progresja: Progresja;
  film?: string;
  uwagi?: string;
  scaloneId?: string;      // duplikat zwinięty w tę pozycję
};

type Slot = {
  positionId: string;      // D1-S01 … D5-S12
  lp: string;              // 'A1.' 'B1.' 'B2.' … litera = grupa/superseria
  cwiczenieId: string | null;
  kategoriaSzkieletu: Kategoria | null;  // filtr doboru; null = pełna baza
};

type Feedback = 'OK' | 'za łatwe' | 'za trudne';
type WynikCiezaru = number | '— brak 1RM' | '— ustaw ręcznie' | Progresja;
```

**Zasada twarda:** slot referuje ćwiczenie przez `id`, nigdy przez nazwę. To jedyna poprawka do arkusza, która zmienia semantykę — w 5.17 wszystkie `MATCH` idą po nazwie, więc zmiana nazwy w BAZIE zrywa plan po cichu. W bazie Base44 to już się stało (`Bulgarian Split Squat` vs `Bulgarian squat assisted`).

---

## 2. `oblicz1RM` — z serii maksymalnej

Klient wykonuje jedną serię do odmowy. Odmowa = RPE 10.

```ts
function oblicz1RM(ciezar: number, powtorzenia: number): number | null {
  if (powtorzenia < 1 || powtorzenia > 15) return null;   // poza tabelą
  const procent = TABELA_RPE[powtorzenia][10];            // %1RM przy RPE 10
  return round(ciezar / (procent / 100), 1);
}
```

Odpowiednik `START!E6`. Zaokrąglenie do 0,1 kg.

**Deduplikacja:** to samo ćwiczenie może stać w kilku dniach. 1RM ćwiczenia = `MAX` po wszystkich wpisanych seriach maksymalnych dla tego ćwiczenia (`START!N`). Rozbieżność między wpisami (`M ≠ N`) to ostrzeżenie „Serie maksymalne w konflikcie", nie błąd.

```ts
function rozwiaz1RM(cwiczenieId: string, serie: SeriaMaksymalna[]): number {
  const dla = serie.filter(s => s.cwiczenieId === cwiczenieId && s.oneRM > 0);
  return dla.length ? Math.max(...dla.map(s => s.oneRM)) : 0;
}
```

---

## 3. `procent1RM` — tabela RPE

```ts
function procent1RM(powtorzenia: number, rpe: number): number | null {
  return TABELA_RPE[powtorzenia]?.[rpe] ?? null;   // powt. 1–15 × RPE 6…10 co 0,5
}
```

Tabela **nie interpoluje** — dokładne trafienie albo `null`. Wartości brzegowe: `[1][10] = 100`, `[15][6] = 45,5`.

---

## 4. `mnoznikAdaptacji` — pętla feedbacku

```ts
function mnoznikAdaptacji(historia: Feedback[]): number {
  const latwe  = historia.filter(f => f === 'za łatwe').length;
  const trudne = historia.filter(f => f === 'za trudne').length;
  return clamp(1 + 0.05 * latwe - 0.05 * trudne, 0.85, 1.15);
}
```

`historia` = feedback **z tego samego slotu** z wszystkich poprzednich tygodni cyklu:

| Tydzień | Zakres historii |
|---|---|
| T1 | — (mnożnik = 1) |
| T2 | T1 |
| T3 | T1, T2 |
| T4 | T1, T2, T3 |
| T5 | T1…T4 |
| T6 | T1…T5 |

Uwaga: mnożnik jest **kumulatywny, nie resetuje się w T4** — restartuje się tylko baza ciężaru, nie historia odczuć. To celowe i tak działa arkusz.

---

## 5. `korektaPowtorzen` — dla ćwiczeń bez kg

```ts
const BEZ_CIEZARU: Progresja[] = ['masa ciała', 'czas', 'dystans', 'ręczne ustawienie'];

function korektaPowtorzen(progresja: Progresja, mnoznik: number): number {
  if (!BEZ_CIEZARU.includes(progresja)) return 0;
  return clamp(Math.round((mnoznik - 1) / 0.05), -3, 3);
}
```

Mnożnik 1,10 → +2 powtórzenia. Mnożnik 0,90 → −2 powtórzenia.

---

## 6. `powtorzeniaAkcesorium` — automat

```ts
type CzescPlanu = 'objętość' | 'intensywność';

function powtorzeniaAkcesorium(
  coeff: Coeff, czesc: CzescPlanu, offsetTygodnia: 0|1|2, korekta: number
): number {
  const bazowe =
    coeff >= 1     ? 6 :
    coeff >= 0.75  ? (czesc === 'objętość' ? 8  : 6) :
                     (czesc === 'objętość' ? 10 : 8);
  return clamp(bazowe + offsetTygodnia + korekta, 1, 15);
}
```

`offsetTygodnia`: T1 = 0, T2 = 1, T3 = 2, T4 = 0, T5 = 1, T6 = 2.

Dotyczy slotów **innych niż A1**. Bój główny (`lp` zaczyna się na `A`) ma serie/powtórzenia/RPE ustawiane wprost przez trenera.

---

## 7. `obliczCiezar` — cztery reguły

```ts
type KontekstCiezaru = {
  tydzien: 1|2|3|4|5|6;
  jestBojemGlownym: boolean;        // lp zaczyna się na 'A'
  trybAkcesoriow: 'trzymaj z bloku' | 'licz z RPE';
  oneRM: number;                    // 0 = brak
  oneRMReczny?: number;             // gdy ćwiczenie podmienione w T4–T6
  cwiczenieZmienioneWzgledemT1: boolean;
  powtorzenia: number;
  rpe: number;
  skokKg: number;
  progresja: Progresja;
  mnoznik: number;                  // AC tego tygodnia
  // dla trybu 'trzymaj z bloku':
  ciezarBazowy?: number;            // ciężar z T1 (dla T2,T3) albo z T4 (dla T5,T6)
  mnoznikBazowy?: number;           // AC z T1 / z T4
};

function obliczCiezar(k: KontekstCiezaru): WynikCiezaru {
  if (BEZ_CIEZARU.includes(k.progresja)) return k.progresja;   // wyświetl nazwę progresji

  const dziedziczy =
    !k.jestBojemGlownym &&
    k.trybAkcesoriow === 'trzymaj z bloku' &&
    [2, 3, 5, 6].includes(k.tydzien) &&
    !k.cwiczenieZmienioneWzgledemT1;

  if (dziedziczy) {
    if (typeof k.ciezarBazowy !== 'number') return k.ciezarBazowy!;   // propaguj komunikat
    return mround(k.ciezarBazowy * k.mnoznik / Math.max(k.mnoznikBazowy!, 0.0001),
                  Math.max(k.skokKg, 0.5));
  }

  const baza = k.cwiczenieZmienioneWzgledemT1 ? k.oneRMReczny : k.oneRM;
  if (!baza) return k.cwiczenieZmienioneWzgledemT1 ? '— ustaw ręcznie' : '— brak 1RM';

  const procent = procent1RM(k.powtorzenia, k.rpe);
  if (procent === null) return '— ustaw ręcznie';

  return mround(baza * procent / 100 * k.mnoznik, Math.max(k.skokKg, 0.5));
}
```

Tabela decyzyjna — powtórzona za `01-analiza-zrodel.md`, bo to najczęstsze źródło pomyłek:

| Tydzień | A1 | Akcesoria `trzymaj z bloku` | Akcesoria `licz z RPE` |
|---|---|---|---|
| T1 | `1RM × %` | `1RM × %` | `1RM × %` |
| T2, T3 | `1RM × % × AC` | `ciężarT1 × AC / AC_T1` | `1RM × % × AC` |
| T4 | `1RM × % × AC` | `1RM × % × AC` | `1RM × % × AC` |
| T5, T6 | `1RM × % × AC` | `ciężarT4 × AC / AC_T4` | `1RM × % × AC` |

`mround(x, k)` = `Math.round(x / k) * k`. W T1 mnożnik = 1, więc wzór jest jednolity dla wszystkich sześciu tygodni.

---

## 8. `stresSlotu` — trzy osie

```ts
type Stres = { calkowity: number; centralny: number; obwodowy: number };

function stresSlotu(coeff: Coeff, serie: number, rpe: number, powtorzenia: number): Stres {
  const p = clamp(powtorzenia, 1, 15);
  const r = clamp(rpe, 5, 10);
  return {
    calkowity: coeff * serie * TABELA_STRES_T[r][p],
    centralny: coeff * serie * TABELA_STRES_C[r][p],
    obwodowy:  coeff * serie * TABELA_STRES_P[r][p],
  };
}
```

Trzy tabele mają **różne charakterystyki i to jest sedno modelu**:

| | 1 powt. @ RPE 10 | 15 powt. @ RPE 10 |
|---|---|---|
| całkowity | 1,2 | 1,0 |
| **centralny** | **1,8** | **0,4** |
| **obwodowy** | **0,3** | **1,4** |

Ciężki singiel kosztuje ośrodkowo, wysokie powtórzenia kosztują obwodowo. Suma całkowita bywa podobna — dlatego sam „tonaż" niczego nie mówi, a te trzy liczby mówią.

---

## 8a. Ćwiczenia jednostronne — `serieEfektywne`

W planie `3 × 10` przy pozycji jednostronnej znaczy **na stronę**. Sesja zawiera
więc 6 serii roboczych, nie 3.

**Arkusz 5.17 liczy 3.** Dotyczy to 30 z 164 ćwiczeń — najwięcej w przysiadzie (11),
wyciskaniu (9) i wiosłowaniu (7).

```ts
export type TrybJednostronnych = "jak w arkuszu" | "obie strony";

function serieEfektywne(serie: number, jednostronne: boolean | undefined,
                        tryb: TrybJednostronnych): number {
  return jednostronne && tryb === "obie strony" ? serie * 2 : serie;
}
```

**Domyślnie `"jak w arkuszu"` — i to nie jest przeoczenie.** Normy objętości
w zakładce Analiza (`s` 4–7, `b` 8–13, `r` 7–11 serii na dzień) powstały na planach
liczonych po staremu. Przełączenie trybu bez przeliczenia norm wypchnęłoby
z zakresu wszystko, co zawiera pracę jednostronną.

Przykład — dzień z trzema pozycjami jednostronnymi na cztery:

| wzorzec | serie: arkusz → obie strony | stres | ocena |
|---|---|---|---|
| przysiad | 3 → 6 | 1,80 → 3,60 | ▼ poniżej → ✓ w normie |
| wyciskanie | 4 → 7 | 1,32 → 1,85 | ▼ poniżej → ▼ poniżej |
| wiosłowanie | 3 → 6 | 1,05 → 2,10 | ▼ poniżej → ▼ poniżej |
| **RAZEM (stres)** | **4,18 → 7,55** | | |

`porownajLiczenieJednostronnych(plan)` zwraca to zestawienie dla dowolnego planu,
razem z informacją, przy których wzorcach ocena normy się zmienia.

> **Nierozstrzygnięte, i warte uwagi przy fazie 1.** Płaskie ×2 jest proste, ale
> nie jest oczywiście poprawne na wszystkich trzech osiach. Koszt **obwodowy
> na kończynę** się nie podwaja — każda strona i tak dostaje swoje 3 × 10.
> Podwaja się raczej koszt **centralny**: dwa razy więcej serii, dwa razy dłuższa
> jednostka. Rozdzielenie tego wymagałoby innego mnożnika per oś — do decyzji,
> gdy będzie na czym to skalibrować.

Ciężar nie zmienia się w żadnym trybie: to samo obciążenie na stronę.

---

## 9. `bilansTygodnia` — agregacja

```ts
type BilansWzorca = { part: Part; calkowity: number; centralny: number;
                      obwodowy: number; serie: number; powtorzenia: number };

function bilansTygodnia(sloty: SlotObliczony[]) {
  const wg = groupBy(sloty, s => s.part);                       // po part, NIE po kategorii
  const wzorce: BilansWzorca[] = (['s','d','b','r','c'] as Part[]).map(part => ({
    part,
    calkowity:   sum(wg[part], s => s.stres.calkowity),
    centralny:   sum(wg[part], s => s.stres.centralny),
    obwodowy:    sum(wg[part], s => s.stres.obwodowy),
    serie:       sum(wg[part], s => s.serie),
    powtorzenia: sum(wg[part], s => s.serie * s.powtorzenia),
  }));

  const g = (p: Part) => wzorce.find(w => w.part === p)!;
  return {
    wzorce,
    dolne:     g('s').calkowity + g('d').calkowity,
    gorne:     g('b').calkowity + g('r').calkowity,
    core:      g('c').calkowity,                    // osobno, tylko do sumy RAZEM
    centralny: sum(wzorce, w => w.centralny),
    obwodowy:  sum(wzorce, w => w.obwodowy),
    razem:     sum(wzorce, w => w.calkowity),
  };
}
```

---

## 10. `ocenaNorm` — normy skalowane liczbą dni

```ts
const NORMY = {
  stresTygodniowy: [12, 18],
  serie: { s: [4, 7], d: [4, 7], b: [8, 13], r: [7, 11], c: [3, 6] },
} as const;

function ocena(wartosc: number, [min, max]: readonly [number, number], dni: number) {
  if (dni === 0) return '—';
  if (wartosc < min * dni) return '▼ poniżej';
  if (wartosc > max * dni) return '▲ powyżej';
  return '✓ w normie';
}
```

`dni` = liczba dni, w których stoi choć jedno ćwiczenie. Ocena serii liczy się od **średniej z sześciu tygodni**, nie z pojedynczego tygodnia (`Analiza!L42`).

---

## 11. Walidatory — port 11 kontroli

Każdy zwraca `{ kod, poziom: 'blad' | 'ostrzezenie', liczba, pozycje[] }`.

| Kod | Warunek | Poziom |
|---|---|---|
| `SLOTY_Z_CWICZENIEM` | licznik informacyjny | info |
| `SERIE_MAX_UZUPELNIONE` | licznik informacyjny | info |
| `SLOT_PUSTY_MIMO_SZKIELETU` | kategoria wpisana, ćwiczenie puste | błąd |
| `NIEZGODNY_ZE_SZKIELETEM` | kategoria ćwiczenia ≠ kategoria szkieletu | ostrzeżenie |
| `BEZ_FILMU` | ćwiczenie bez `film` | ostrzeżenie |
| `DO_WERYFIKACJI` | `uwagi` zaczyna się od `DO WERYFIKACJI` | ostrzeżenie |
| `USTAW_RECZNIE` | ciężar = `— ustaw ręcznie` w T2–T6 | błąd |
| `BRAK_1RM` | ciężar = `— brak 1RM` w T1 | błąd |
| `POWT_POZA_TABELA` | powtórzenia > 15 | błąd |
| `KONFLIKT_SERII_MAX` | dwa różne 1RM dla jednego ćwiczenia | ostrzeżenie |
| `DNI_TRENINGOWE` | licznik informacyjny (baza norm) | info |

Plan nie może zostać wysłany klientowi z otwartym błędem. Ostrzeżenia wymagają potwierdzenia.

**Nowy walidator, którego arkusz nie ma** (bo nie może — wymaga dostępu do poprzednich planów):

| `POWTORKA_Z_POPRZEDNIEGO` | ćwiczenie występowało w poprzednim cyklu tego klienta | ostrzeżenie |

To wprost realizuje zasadę z `STAN-PROJEKTU.md`: *„Przy budowaniu nowych planów sprawdzać poprzednie plany klienta, żeby unikać powtórzeń ćwiczeń między wersjami."* Dziś wymaga otwierania starych plików ręcznie.

---

## 12. Kalkulatory poboczne

### ODDECH

```ts
function dawkaOddechowa(twotSekundy: number, przeciwwskazania: boolean) {
  if (przeciwwskazania) return { poziom: 'Wersja łagodna — ustal indywidualnie', zatrzymaj: true };
  return progTWOT(twotSekundy);   // MATCH przybliżony po progach z oddech-progi.json
}
```

Przeciwwskazanie zatrzymuje wynik i wyświetla komunikat — zgodnie z zasadą bezpieczeństwa: sygnał przeciwwskazania oznaczamy jasno, nie obchodzimy programowaniem.

### BIEG

```
HRmax     = podane albo round(208 − 0,7 × wiek)
strefy    = HRmax × [0,60–0,70 | 0,70–0,80 | 0,80–0,87 | 0,87–0,93 | 0,93–1,00]
tempoTest = czas / dystans                               [min/km]
tempa     = Z2 +1,25 · Z3 +0,667 · Z4 +0,25 · Z5 −0,167  [min/km od tempa testowego]

jednostka 1,2  bieg spokojny Z2        bazowo 30 min
jednostka 3    bieg ciągły Z3          bazowo 20 min + 20 min rozgrzewka/schłodzenie
jednostka 4    długie wybieganie Z2    bazowo 45 min
jednostka 5    interwał progowy Z4     bazowo 16 min = n × 4 min, przerwa 2 min truchtu

czas = MAX(10; round(baza × progresjaTygodnia × skalaLiczbyJednostek / 5) × 5)
progresjaTygodnia    = [1,0 · 1,1 · … ]          (T1…T6)
skalaLiczbyJednostek = [1,2 · 1,1 · 1,0 · 0,95 · 0,9]   dla 1…5 jednostek
dystans ≈ MROUND(czasPracy / tempoStrefy + czasDodatkowy / tempoZ2; 0,5)
```

---

## 13. Testowanie przeciwko arkuszowi

Jądro jest przenoszalne dokładnie dlatego, że da się je zweryfikować co do liczby. Proponowana procedura:

1. Wziąć 3–4 realne plany z Dysku (Zuzanna 3.0, Maciek 2.0, Bartek 3.0, Agnieszka 1.0).
2. Wyeksportować `.xlsx`, przeliczyć (LibreOffice headless), odczytać `data_only=True`.
3. Zrzucić do JSON: dla każdego slotu × tygodnia → `{ciężar, powtórzenia, stres_t, stres_c, stres_p}`.
4. Puścić te same wejścia przez jądro i porównać.
5. **Kryterium: zgodność co do grosza na ciężarze i do 0,1 na stresie. Zero tolerancji.**

Te zrzuty stają się złotym zestawem testowym. Dopóki nie przechodzi, aplikacja nie zastępuje arkusza — obie rzeczy działają równolegle.

Punkty, w których spodziewam się rozjazdu i które trzeba sprawdzić najpierw:
- kolejność zaokrągleń w trybie `trzymaj z bloku` (mnożenie przed `MROUND`, nie po),
- `MAX(skokKg, 0.5)` — łatwo pominąć dolne ograniczenie,
- kumulacja mnożnika przez restart w T4,
- ćwiczenia bez kg: arkusz wyświetla **nazwę progresji** w kolumnie ciężaru, nie liczbę,
- deduplikacja 1RM przez `MAX`, nie przez pierwsze trafienie.
