import { PROGRESJE_Z_TABELI, zGuma } from "./typy.ts";
import { czasPoOcenie, naCzas } from "./czas.ts";
import type {
  Cwiczenie,
  CzescPlanu,
  Feedback,
  Kategoria,
  Stres,
  TrybAkcesoriow,
  Tydzien,
  TydzienCyklu,
  WynikCiezaru,
} from "./typy.ts";
import { Katalog, katalog as katalogDomyslny } from "./katalog.ts";
import { obliczCiezar, obliczCiezarTopSetu, SKOK_MINIMALNY, tydzienBazowyBloku } from "./ciezar.ts";
import { mround } from "./pomocnicze.ts";
import { korektaPowtorzen, mnoznikNaTydzien } from "./adaptacja.ts";
import { parzystePowtorzenia, powtorzeniaAkcesorium } from "./powtorzenia.ts";
import {
  bojGlownySlotu, czescBoju, DELOAD_DWUBOJU, DWUBOJ, dwubojSlotu, parametrySzablonuTygodnia, pauzaSlotu,
  procentTopSetuDwuboju, type RodzajPauzy,
} from "./szablon-boju.ts";
import {
  liczbaTygodni, numerNaEkranie, numerRoboczy, ostatniRoboczy, PREMIA_PROCENTU_BLOKU, PREMIA_RPE_BLOKU,
  poprzedniRoboczy, szablonTygodnia, TYDZIEN_DELOADU, TYDZIEN_MAKSOW, tygodnieRobocze, wczesniejszeRobocze, zPremiaRpe,
} from "./tygodnie.ts";
import { rpeTopSetu, zwyczajowyTopSet } from "./top-set.ts";
import {
  bilansTygodnia,
  NORMY,
  ocenaNormy,
  serieEfektywne,
  stresSlotu,
  type BilansTygodnia,
  type OcenaNormy,
  type SlotObliczony,
  type TrybJednostronnych,
} from "./stres.ts";
import { POWT_MAX, procent1RM, rozwiaz1RM, rpeDlaProcentu, type SeriaMaksymalna } from "./rpe.ts";

/**
 * Sześć tygodni planu domyślnego. Plan może mieć od 4 do 12 (22.11.2026) —
 * jego tygodnie daje `tygodnieRobocze(plan)` z `tygodnie.ts`.
 */
export const TYGODNIE: readonly Tydzien[] = [1, 2, 3, 4, 5, 6];

/** Tygodnie po cyklu mają stałe numery — patrz `numerTygodniaNaEkranie`. */
export { TYDZIEN_DELOADU, TYDZIEN_MAKSOW, liczbaTygodni, tygodnieRobocze };
/**
 * O ile RPE deloadu jest niżej niż w T6 — w skali planu, nie periodyzacji.
 *
 * Periodyzacja trenera pisze „o 2 niżej" (np. @9 → @7), ale jej RPE stoi
 * o 0,5–1,5 wyżej niż w jego planach — to ustalone 21.09.2026 na kilogramach
 * (arkusze cz.1/cz.2 obniżały RPE świadomie, żeby przy 100 % 1RM wychodziły
 * te same ciężary). Ta sama różnica w skali planu to 1: deload waży wtedy
 * średnio 91,5 % ostatniego tygodnia, a w periodyzacji 91,4 % (12 ćwiczeń,
 * 87–96 %). Przy 2 wychodziło 85 %, a akcesoria „trzymaj z bloku" 79–83 %.
 * Decyzja trenera z 25.09.2026: „żeby było spójne z resztą planu".
 * Test w `tygodnie-dodatkowe.test.ts` pilnuje tych kilogramów.
 */
export const OBNIZENIE_RPE_DELOADU = 1;
/** Tabela RPE zaczyna się od 6 — niżej nie ma z czego policzyć ciężaru. */
export const RPE_MIN_DELOADU = 6;
export const RPE_MAKSOW = 10;

/** Co trener ustawia dla slotu w konkretnym tygodniu. Puste pole = policz automatem. */
export type ParametryTygodnia = {
  serie?: number;
  /** Puste = automat powtórzeń akcesoriów. Bój główny wymaga wpisu. */
  powtorzenia?: number;
  rpe?: number;
  /**
   * % 1RM — tylko przy dwuboju (`PROGRESJA_DWUBOJU`, 16.10.2026). Tam ciężar
   * liczy się z procentu, nie z RPE; przy innych ćwiczeniach pole nic nie robi.
   */
  procent?: number;
  /** Podmiana ćwiczenia w T4–T6. */
  cwiczenieIdOverride?: string;
  /** 1RM wpisany ręcznie dla podmienionego ćwiczenia (kolumna AA). */
  oneRMReczny?: number;
  /** Jawne nadpisanie ciężaru — widoczne i cofalne, inaczej niż zerwany link w arkuszu. */
  ciezarOverride?: number;
  /**
   * Ciężar, który klient sam wybrał przy ćwiczeniu z progresją „ręczne
   * ustawienie" — zapisuje go serwer z wpisanych serii (najcięższa). Razem
   * z ćwiczeniem, żeby po podmianie w slocie nie przeszedł na inne.
   */
  ciezarKlienta?: { kg: number; cwiczenieId: string };
  /**
   * TOP SET z telefonu (trener, 02.10.2026): ocena bez „OK” i ciężar, jeśli
   * klient zrobił inny niż w planie. **Tylko informacja dla trenera** —
   * silnik tego nie czyta, serie robocze i kolejne tygodnie się nie zmieniają
   * („top set mógłby być za ciężki, a robocze okej”).
   */
  topSetKlienta?: { feedback?: "za trudne" | "za łatwe"; kg?: number };
  /** Odczucie klienta po wykonaniu (kolumna H). */
  feedback?: Feedback;
};

export type SlotPlanu = {
  /** D1-S01 … D5-S12 */
  positionId: string;
  dzien: number;
  /** "A1." "B1." "B2." — wspólna litera = superseria. */
  lp: string;
  cwiczenieId: string | null;
  kategoriaSzkieletu?: Kategoria | null;
  tygodnie?: Partial<Record<TydzienCyklu, ParametryTygodnia>>;
  /**
   * Tryb liczenia ciężaru dla tego jednego ćwiczenia. Pusto = jak w planie.
   *
   * Przełącznik przy planie zmieniał wszystkie akcesoria naraz i przez to był
   * bezużyteczny: trener chce, żeby jednemu ćwiczeniu ciężar schodził razem
   * z rosnącymi powtórzeniami, a reszcie nie. Tu decyduje wiersz.
   */
  trybCiezaru?: TrybAkcesoriow;
  /**
   * Bój główny z decyzji trenera — w obie strony. Pusto = reguła: przysiady,
   * martwe ciągi i bench na każdej pozycji (`BOJE`, `jestBojemGlownym`).
   * Patrz `bojGlownySlotu`.
   */
  bojGlowny?: boolean;
  /**
   * Bój siłowy w planie hipertroficznym (27.09.2026): progresja i TOP SET
   * jak w części siłowej tego samego etapu. Pusto = jak cały plan. Patrz
   * `czescBoju`.
   */
  bojSilowy?: boolean;
  /**
   * Przesunięcie powtórzeń („±” w konsoli, 19.10.2026). Trener: „wpiszę w T1
   * 10 — ma iść 10–12 w T1–T3 i 10–12 w T4–T6; ćwiczenie idzie T1–T6 10–15,
   * wpiszę 12 — ma iść 12–17”. Dodawane do automatu akcesorium w każdym
   * tygodniu, więc kształt progresji zostaje, a przy masie ciała ocena
   * klienta dalej dokłada powtórzenia. Bój, pauzowane i dwubój mają własną
   * periodyzację — ich to nie dotyczy. Pusto = 0.
   */
  przesunieciePowtorzen?: number;
  /**
   * Uwaga trenera do ćwiczenia (30.10.2026), ta sama w każdym tygodniu.
   * Trener: „możliwość dopisania uwagi do ćwiczenia — przy C2 ma być widoczna
   * i na liście, i w panelu, w formie rozwijanej, żeby nie zajmowała dużo
   * miejsca”. Silnik jej nie liczy; klient widzi ją zwiniętą pod „Uwaga
   * trenera”. Wiersz po wierszu, do 500 znaków (`konsola/ksztalt-planu.ts`).
   */
  uwaga?: string;
  /**
   * Stan sprzed „↗” (RPE 7,5 → 10) — tylko dla konsoli: wyłączenie przywraca
   * to, co było, zamiast zostawiać powtórzenia wpisane przez przycisk.
   */
  przedRpeRosnacym?: {
    rpe: Record<string, number | null>;
    /** Tygodnie, którym „↗” wpisało powtórzenia, i ile wpisało. */
    powtorzenia: Record<string, number>;
    trybCiezaru: TrybAkcesoriow | null;
  };
};

/**
 * TOP SET przy jednym ćwiczeniu. Od 27.09.2026 w dniu może ich być kilka —
 * trener w szablonie Rozbudowanym: „A1 bench press robię TOP SET i robocze,
 * a następnie B1 low bar squat i tam też na początek TOP SET i robocze".
 * Wpis rozpoznaje ćwiczenie po `slotPositionId`; `dzien` zostaje, bo stare
 * plany miały jeden wpis na dzień i tak też wychodzą z importu arkusza.
 */
export type TopSet = {
  dzien: number;
  wlaczony: boolean;
  /** % 1RM TOP SETU przy dwuboju, osobno na każdy tydzień. Puste = szablon. */
  procentTygodni?: Partial<Record<Tydzien, number>>;
  /**
   * RPE wpisane ręcznie, osobno na każdy tydzień. Puste = liczba z szablonu
   * (`PROGRESJA_TOP_SETU`), która rośnie o pół stopnia na tydzień.
   *
   * Wcześniej stała tu jedna liczba na cały cykl i to było zbyt mało:
   * w arkuszach trenera RPE TOP SETU idzie 6 → 6,5 → 7 → 7,5 → 8 (cz.1)
   * albo 7 → 7,5 → 8 → 8,5 → 9 (cz.2), więc jedno RPE na sześć tygodni
   * spłaszczało progresję, która była w planie od początku.
   */
  rpeTygodni?: Partial<Record<Tydzien, number>>;
  /** Slot, z którego TOP SET bierze ćwiczenie i 1RM. Jawnie — nie „wiersz poniżej". */
  slotPositionId: string;
};

export type Plan = {
  nazwa: string;
  /** Nazwa planu nadana w konsoli (06.11.2026), np. „Redukcja zima”. Silnik jej nie liczy. */
  tytul?: string;
  trybAkcesoriow: TrybAkcesoriow;
  czescPlanu: CzescPlanu;
  serieMaksymalne: readonly SeriaMaksymalna[];
  sloty: readonly SlotPlanu[];
  topSety?: readonly TopSet[];
  /**
   * Liczba tygodni roboczych, 4–12 (22.11.2026). Pusto = 6. Progresja idzie
   * blokami po 3 tygodnie — patrz `tygodnie.ts` (tam też klucze T7–T12).
   */
  tygodni?: number;
  /**
   * Jak liczyć serie ćwiczeń jednostronnych. Domyślnie `"jak w arkuszu"` —
   * zmiana rozjeżdża wynik z MasterTemplate i z normami z zakładki Analiza.
   */
  liczenieJednostronnych?: TrybJednostronnych;
  /**
   * Tydzień lżejszy po cyklu (T7): serie i powtórzenia z T6, RPE o 1 niżej,
   * bez TOP SETU. Z periodyzacji trenera — decyzja z 25.09.2026.
   */
  deload?: boolean;
  /** Tydzień maksów na koniec (T8): 1 × 1 @ RPE 10, wszystkie boje jednego dnia. */
  tydzienMaksow?: boolean;
  /** Identyfikatory bojów do maksowania. Puste = domyślne (`domyslneCwiczeniaMaksow`). */
  cwiczeniaMaksow?: readonly string[];
  /**
   * Rozgrzewka na początek dnia — opcjonalna, ta sama w każdym tygodniu
   * (25.09.2026). Silnik jej nie liczy: nie wchodzi do stresu ani objętości.
   */
  rozgrzewki?: readonly Rozgrzewka[];
};

export type Rozgrzewka = {
  dzien: number;
  /** Wiersz po wierszu, jak trener to napisał: „5 min rower", „2 × 10 dead bug". */
  tekst: string;
  /** Link do nagrania — tylko http(s). */
  film?: string;
};

export type SlotWyliczony = {
  positionId: string;
  dzien: number;
  lp: string;
  cwiczenie: Cwiczenie | null;
  /** Serie tak, jak stoją w planie. Przy ćwiczeniu jednostronnym: na stronę. */
  serie: number;
  /** Serie faktycznie wykonane — zależnie od `liczenieJednostronnych`. */
  serieEfektywne: number;
  powtorzenia: number;
  rpe: number;
  procent1RM: number | null;
  oneRM: number;
  mnoznik: number;
  ciezar: WynikCiezaru;
  ciezarNadpisany: boolean;
  /**
   * Skąd ciężar przy „ręcznym ustawieniu", gdy nie wpisał go trener w tym
   * tygodniu: z wyboru klienta albo przeniesiony z wcześniejszego tygodnia.
   */
  ciezarZrodlo?: { tydzien: number; kto: "trener" | "klient" };
  stres: Stres;
  /** Liczone progresją pauzowaną (`PROGRESJA_PAUZY`) — konsola to pokazuje. */
  pauza?: RodzajPauzy;
  /**
   * Dwubój — ciężar z % 1RM (`procent1RM` to wtedy procent z planu), a RPE
   * jest tylko odpowiednikiem dla stresu. Konsola i telefon pokazują procent.
   */
  dwuboj?: true;
  /** Mały ciężar przesunięty po ocenie o krok, którego arkusz nie robi (`widocznaZmiana`). */
  zmianaPoOcenie?: true;
  /** Ciężar podniesiony o skok, bo zaokrąglenie zjadło zaplanowany wzrost (`widocznyPostep`). */
  widocznyPostep?: true;
};

export type TopSetWyliczony = {
  dzien: number;
  /** Ćwiczenie, przed którym TOP SET stoi — w dniu może ich być kilka. */
  positionId: string;
  cwiczenie: Cwiczenie | null;
  /** `null` = w tym tygodniu TOP SETU nie ma. W szablonie tak jest w T1. */
  rpe: number | null;
  /** Przy dwuboju: % 1RM TOP SETU (RPE to wtedy tylko odpowiednik). */
  procent?: number;
  ciezar: WynikCiezaru;
  /** Ciężar policzony od innego ciężaru, który klient zrobił w TOP SECIE wcześniej (12.11.2026). */
  zTopSetuKlienta?: { tydzien: number; kg: number };
};

export type PodsumowanieDnia = {
  dzien: number;
  serie: number;
  powtorzenia: number;
  stresCalkowity: number;
};

export type TydzienWyliczony = {
  tydzien: TydzienCyklu;
  /** Tylko przy tygodniach po cyklu. */
  rodzaj?: "deload" | "maksy";
  sloty: SlotWyliczony[];
  topSety: TopSetWyliczony[];
  dni: PodsumowanieDnia[];
  bilans: BilansTygodnia;
  ocenaStresu: OcenaNormy;
};

export type PlanWyliczony = {
  nazwa: string;
  dniTreningowe: number;
  tygodnie: TydzienWyliczony[];
  /**
   * T7 (deload) i T8 (maksy) — tylko te, które trener włączył. Osobno, bo
   * średnie, normy i porównania cykli liczą się z sześciu tygodni pracy.
   */
  tygodnieDodatkowe: TydzienWyliczony[];
  /** Ocena średniej liczby serii per wzorzec z całego cyklu — jak w Analizie. */
  ocenaObjetosci: Record<string, { srednia: number; ocena: OcenaNormy }>;
};

function parametry(slot: SlotPlanu, tydzien: TydzienCyklu): ParametryTygodnia {
  return slot.tygodnie?.[tydzien] ?? {};
}

/** Liczba dni, w których stoi choć jedno ćwiczenie — baza wszystkich norm (Analiza!B76). */
export function dniTreningowe(plan: Plan): number {
  const dni = new Set<number>();
  for (const s of plan.sloty) if (s.cwiczenieId) dni.add(s.dzien);
  return dni.size;
}

/**
 * Przelicza cały plan: sześć tygodni, wszystkie sloty, ciężary, stres i bilans.
 *
 * Tygodnie liczą się po kolei, bo T2/T3 dziedziczą ciężar z T1, a T5/T6 z T4 —
 * wynik tygodnia bazowego musi być gotowy, zanim policzy się tydzień zależny.
 */
export function przeliczPlan(plan: Plan, katalog: Katalog = katalogDomyslny): PlanWyliczony {
  const dni = dniTreningowe(plan);
  // Tygodnie robocze tego planu (4–12) — deload i maksy idą od ostatniego.
  const robocze = tygodnieRobocze(plan);
  const ostatni = ostatniRoboczy(plan);
  const wyliczone = new Map<Tydzien, TydzienWyliczony>();
  /**
   * Zamierzony ułamek 1RM slotu w tygodniu — przed zaokrągleniem do skoku.
   * Z niego `widocznyPostep` wie, czy plan chciał w tym tygodniu ciężej.
   */
  const zamierzone = new Map<string, number>();

  /**
   * Jeden slot w jednym tygodniu. `wzor` to ten sam slot policzony w T6 —
   * podaje go tylko deload, który nie ma szablonu, a zaczyna od tego, gdzie
   * cykl się skończył.
   */
  const wyliczSlot = (
    slot: SlotPlanu, tydzien: TydzienCyklu, wzor?: SlotWyliczony, wzorT1?: SlotWyliczony,
  ): SlotWyliczony => {
    const p = parametry(slot, tydzien);
    // Deload bierze ćwiczenie z T6 (ostatniego tygodnia): podmiana z T4–T6 trwa do końca cyklu.
    const p6: ParametryTygodnia = wzor ? parametry(slot, ostatni) : {};
    const cwiczenieIdOverride = p.cwiczenieIdOverride ?? p6.cwiczenieIdOverride;
    const cwiczenieId = cwiczenieIdOverride ?? slot.cwiczenieId;
    const cwiczenie = cwiczenieId ? (katalog.poId(cwiczenieId) ?? null) : null;

    if (!cwiczenie) {
      return {
        positionId: slot.positionId,
        dzien: slot.dzien,
        lp: slot.lp,
        cwiczenie: null,
        serie: 0,
        serieEfektywne: 0,
        powtorzenia: 0,
        rpe: 0,
        procent1RM: null,
        oneRM: 0,
        mnoznik: 1,
        ciezar: "",
        ciezarNadpisany: false,
        stres: { calkowity: 0, centralny: 0, obwodowy: 0 },
      } as SlotWyliczony;
    }

    const bojGlowny = bojGlownySlotu(slot, cwiczenie);
    const odczucia = Object.fromEntries(
      robocze.map((t) => [t, parametry(slot, t).feedback]),
    ) as Partial<Record<Tydzien, Feedback | undefined>>;
    const mnoznik = mnoznikNaTydzien(tydzien, odczucia);

    /*
     * Czego trener nie wpisał, to bierze się z szablonu 5.18 — z tych samych
     * liczb, które wpisuje przycisk „progresja 5.18". Dzięki temu kliknięcie
     * przycisku nie zmienia planu, tylko czyni go widocznym.
     *
     * Wcześniej stały tu liczby wzięte znikąd i bój główny bez wpisanych
     * serii szedł do klienta jako `1 × 6`, czyli **jedna seria** — podczas
     * gdy szablon mówi sześć. Na telefonie było to zwykłe polecenie do
     * wykonania i tak też zostało odczytane: „mam robić jedną serię".
     */
    // Część planu rozstrzyga nie tylko o powtórzeniach akcesoriów, ale też
    // o progresji boju: „objętość" to cz.1 trenera, „intensywność" — cz.2.
    // Deload nie ma własnego szablonu: serie i powtórzenia jak w T6, RPE niżej.
    // Pauzowane wyciskanie i przysiad mają własną progresję (02.10.2026) —
    // patrz `PROGRESJA_PAUZY`; ciężar liczy się wtedy jak przy boju, z RPE.
    const pauza = pauzaSlotu(slot, cwiczenie.id, plan.czescPlanu);
    // Dwubój (16.10.2026): progresja w % 1RM, deload 4 × 2 na 70 %.
    const dwuboj = dwubojSlotu(slot, cwiczenie.id);
    // Deload przy masie ciała wraca do powtórzeń z T1 (trener, 10.10.2026:
    // „deload może wracać liczbą powtórzeń do T1”). RPE o 1 niżej nic tu nie
    // ujmuje — ciężaru nie ma — więc ulżyć mogą tylko powtórzenia. Z T1 tego
    // samego ćwiczenia (po podmianie w T4–T6 — z automatu dla T1).
    const powtorzeniaDeloadu = (w: SlotWyliczony) => cwiczenie.progresja !== "masa ciała" ? w.powtorzenia
      : wzorT1?.cwiczenie?.id === cwiczenie.id ? wzorT1.powtorzenia
        : powtorzeniaAkcesorium({ coeff: cwiczenie.coeff, czesc: plan.czescPlanu, tydzien: 1, przezCalyCykl: true,
          przesuniecieTrenera: slot.przesunieciePowtorzen, bezTabeli: !PROGRESJE_Z_TABELI.includes(cwiczenie.progresja) });
    const szablon: ParametryTygodnia = wzor
      ? (dwuboj ? { ...DELOAD_DWUBOJU }
        : { serie: wzor.serie, powtorzenia: powtorzeniaDeloadu(wzor), rpe: rpeDeloadu(wzor.rpe) })
      : parametrySzablonuTygodnia(slot, tydzien, cwiczenie, plan.czescPlanu);

    const serie = p.serie ?? szablon.serie!;
    const efektywne = serieEfektywne(
      serie, cwiczenie.jednostronne, plan.liczenieJednostronnych ?? "jak w arkuszu",
    );
    // Ćwiczenie na czas (27.10.2026): liczba to sekundy, a ocena zmienia je
    // krokiem rosnącym z czasem (5 s → 4 s, 45 s → 40 s) — także wtedy, gdy
    // czas wpisał trener. Patrz `czas.ts`.
    const czas = naCzas(cwiczenie.progresja);
    // Naprzemienne (20.11.2026): ocena przy masie ciała — po jednym na stronę, czyli o 2.
    const naprzemienne = !!cwiczenie.naprzemienne && !czas;
    const korekta = korektaPowtorzen(cwiczenie.progresja, mnoznik) * (naprzemienne ? 2 : 1);
    const powtorzeniaPlanu =
      p.powtorzenia ??
      szablon.powtorzenia ??
      powtorzeniaAkcesorium({
        coeff: cwiczenie.coeff,
        czesc: plan.czescPlanu,
        tydzien,
        korekta: czas ? 0 : korekta,
        czas,
        // Masa ciała: T1–T6 bez restartu w T4 (trener, 10.10.2026).
        przezCalyCykl: cwiczenie.progresja === "masa ciała",
        przesuniecieTrenera: slot.przesunieciePowtorzen,
        bezTabeli: !PROGRESJE_Z_TABELI.includes(cwiczenie.progresja),
      });
    // Deload bierze czas z T6 — już po ocenach.
    const powtorzeniaPoOcenie = czas && !wzor ? czasPoOcenie(powtorzeniaPlanu, korekta) : powtorzeniaPlanu;
    const powtorzenia = naprzemienne
      ? parzystePowtorzenia(powtorzeniaPoOcenie, PROGRESJE_Z_TABELI.includes(cwiczenie.progresja) ? POWT_MAX : Infinity)
      : powtorzeniaPoOcenie;
    // Dwubój: procent z planu albo wpisany przez trenera; RPE tylko jako
    // odpowiednik do stresu — wpisane RPE nic tu nie zmienia.
    const procentDwuboju = dwuboj ? (p.procent ?? szablon.procent!) : undefined;
    const rpe = procentDwuboju !== undefined
      ? rpeDlaProcentu(powtorzenia, procentDwuboju)
      : p.rpe ?? szablon.rpe!;

    const zmienione = cwiczenieIdOverride !== undefined && cwiczenieIdOverride !== slot.cwiczenieId;
    const oneRM = rozwiaz1RM(cwiczenie.id, plan.serieMaksymalne, tydzien);

    const bazowy = tydzienBazowyBloku(tydzien as Tydzien);
    const slotBazowy = bazowy
      ? wyliczone.get(bazowy)?.sloty.find((s) => s.positionId === slot.positionId)
      : undefined;
    // 1RM zmienione serią w środku bloku (17.10.2026): akcesorium „trzymaj
    // z bloku” niesie ciężar z T1/T4 — przeskalowany do 1RM tego tygodnia.
    const ciezarBazowy = typeof slotBazowy?.ciezar === "number" && slotBazowy.oneRM > 0
      && oneRM > 0 && oneRM !== slotBazowy.oneRM && slotBazowy.cwiczenie?.id === cwiczenie.id
      ? mround(slotBazowy.ciezar * oneRM / slotBazowy.oneRM, Math.max(cwiczenie.skokKg, SKOK_MINIMALNY))
      : slotBazowy?.ciezar;

    /*
     * „Ręczne ustawienie": ciężar nie bierze się z 1RM, więc bez wpisu trenera
     * w tym tygodniu był tylko napis — i klient dobierał go co tydzień od
     * nowa. Trener, 26.09.2026: „jak klient dobierze sobie ciężar w T1, to
     * zostaje on do końca planu". Szukamy wstecz od tego tygodnia: wybór
     * klienta albo wpis trenera, pierwszy znaleziony wygrywa; w tym samym
     * tygodniu klient przed trenerem, bo jego ciężar już się odbył. Tylko
     * przy tym samym ćwiczeniu — po podmianie cudze kilogramy nie przechodzą.
     */
    const przeniesiony = cwiczenie.progresja === "ręczne ustawienie"
      ? ciezarRecznyZWczesniej(slot, tydzien, cwiczenie.id, p, wczesniejszeRobocze(tydzien, plan)) : undefined;

    const kontekst = {
      tydzien: tydzien as Tydzien,
      jestBojemGlownym: bojGlowny || pauza !== null || dwuboj,
      trybAkcesoriow: slot.trybCiezaru ?? plan.trybAkcesoriow,
      powtorzenia,
      rpe,
      ...(procentDwuboju !== undefined ? { procent: procentDwuboju } : {}),
      skokKg: cwiczenie.skokKg,
      progresja: cwiczenie.progresja,
      oneRM,
      mnoznik,
      cwiczenieZmienioneWzgledemT1: zmienione,
      oneRMReczny: p.oneRMReczny ?? p6.oneRMReczny,
      ciezarBazowy,
      mnoznikBazowy: slotBazowy?.mnoznik,
    };
    const policzonyZSilnika = obliczCiezar(kontekst);
    const guma = zGuma(cwiczenie);

    /*
     * Widoczny postęp (trener, 18.10.2026): „single arm lat pullover — 6 kg na
     * 10–12 powtórzeń w T1–T3 z RPE 8, ale po zmianie RPE na 9 i powrocie do
     * 10 powtórzeń ciężar nadal zostaje 6, bo zmiana jest za mała — T4 wygląda
     * tak samo jak T1 i jest to cofnięcie progresu”.
     *
     * Gdy powtórzeń jest mniej niż tydzień wcześniej, a plan zakłada większy
     * ułamek 1RM (wyższe RPE, mniej powtórzeń) — a po zaokrągleniu do skoku
     * wychodzi tyle samo albo mniej — ciężar idzie o jeden skok w górę. Po
     * ocenie „za trudne” (mnożnik niższy niż tydzień wcześniej) nic się nie
     * podnosi — klient powiedział, że jest ciężko. Tylko ciężar liczony; wpis
     * trenera i dwubój bez zmian.
     */
    const dziedziczy = !kontekst.jestBojemGlownym && kontekst.trybAkcesoriow === "trzymaj z bloku"
      && bazowy !== null && !zmienione;
    const zamierzonyBazowy = bazowy ? zamierzone.get(`${bazowy}|${slot.positionId}`) : undefined;
    const procentTygodnia = procentDwuboju ?? procent1RM(powtorzenia, rpe);
    const zamierzony = dziedziczy
      ? (zamierzonyBazowy !== undefined ? zamierzonyBazowy * mnoznik / Math.max(slotBazowy?.mnoznik ?? 1, 0.0001) : undefined)
      : (procentTygodnia !== null ? procentTygodnia * mnoznik : undefined);
    if (zamierzony !== undefined && numerRoboczy(tydzien) !== null) zamierzone.set(`${tydzien}|${slot.positionId}`, zamierzony);
    const kluczPoprzedni = poprzedniRoboczy(tydzien);
    const poprzedni = kluczPoprzedni !== null
      ? wyliczone.get(kluczPoprzedni)?.sloty.find((s) => s.positionId === slot.positionId)
      : undefined;
    const zamierzonyPoprzedni = kluczPoprzedni !== null ? zamierzone.get(`${kluczPoprzedni}|${slot.positionId}`) : undefined;
    const skok = Math.max(cwiczenie.skokKg, SKOK_MINIMALNY);
    const podbity = typeof policzonyZSilnika === "number" && !dwuboj && poprzedni?.cwiczenie?.id === cwiczenie.id
      && typeof poprzedni.ciezar === "number" && !poprzedni.ciezarNadpisany && !poprzedni.ciezarZrodlo
      && powtorzenia < poprzedni.powtorzenia && mnoznik >= poprzedni.mnoznik
      && zamierzony !== undefined && zamierzonyPoprzedni !== undefined && zamierzony > zamierzonyPoprzedni
      && policzonyZSilnika <= poprzedni.ciezar;
    const policzony = podbity ? mround((poprzedni!.ciezar as number) + skok, skok) : policzonyZSilnika;
    // Ocena przesunęła mały ciężar o krok, którego arkusz by nie zrobił —
    // eksport wpisze wtedy ciężar wprost (patrz `widocznaZmiana`).
    const zmianaPoOcenie = typeof policzonyZSilnika === "number"
      && policzonyZSilnika !== obliczCiezar({ ...kontekst, bezWidocznejZmiany: true });

    return {
      positionId: slot.positionId,
      dzien: slot.dzien,
      lp: slot.lp,
      cwiczenie,
      serie,
      serieEfektywne: efektywne,
      powtorzenia,
      rpe,
      procent1RM: procentDwuboju ?? procent1RM(powtorzenia, rpe),
      oneRM,
      mnoznik,
      // Guma (17.10.2026): opór dobiera klient — zamiast nazwy progresji „guma”.
      ciezar: guma ? "guma" : p.ciezarOverride ?? przeniesiony?.kg ?? policzony,
      ciezarNadpisany: !guma && p.ciezarOverride !== undefined,
      ...(!guma && p.ciezarOverride === undefined && przeniesiony
        ? { ciezarZrodlo: { tydzien: przeniesiony.tydzien, kto: przeniesiony.kto } } : {}),
      stres: stresSlotu({ coeff: cwiczenie.coeff, serie: efektywne, rpe, powtorzenia }),
      ...(pauza ? { pauza } : {}),
      ...(dwuboj ? { dwuboj: true as const } : {}),
      ...(zmianaPoOcenie && p.ciezarOverride === undefined && !przeniesiony ? { zmianaPoOcenie: true } : {}),
      ...(podbity && p.ciezarOverride === undefined && !przeniesiony && !guma ? { widocznyPostep: true as const } : {}),
    };
  };

  for (const tydzien of robocze) {
    const sloty: SlotWyliczony[] = [];
    // Tydzień szablonu i premia bloku (T7–T12: jak blok II, RPE wyżej).
    const wzorSzablonu = szablonTygodnia(tydzien);

    for (const slot of plan.sloty) sloty.push(wyliczSlot(slot, tydzien));

    const bilans = bilansSlotow(sloty);

    // Kolejność jak w tabeli dnia; dwa wpisy przy tym samym ćwiczeniu to jeden
    // TOP SET (zostaje pierwszy).
    const kolejnosc = new Map(plan.sloty.map((s, i) => [s.positionId, i]));
    const wlaczone = (plan.topSety ?? []).filter((t) => t.wlaczony);
    const topSety: TopSetWyliczony[] = wlaczone
      .filter((t, i) => wlaczone.findIndex((x) => x.slotPositionId === t.slotPositionId) === i)
      .sort((a, b) => (kolejnosc.get(a.slotPositionId) ?? 999) - (kolejnosc.get(b.slotPositionId) ?? 999))
      .map((t) => {
        const zrodlo = sloty.find((s) => s.positionId === t.slotPositionId);
        /*
         * TOP SET stoi tam, gdzie wskazał trener — przy dowolnym ćwiczeniu
         * dnia, nie tylko przy pierwszym i nie tylko przy złożonym.
         *
         * Przez chwilę było inaczej: TOP SET pokazywał się wyłącznie przy
         * ćwiczeniu z coeff 1,0. Reguła miała chronić przed jednym
         * powtórzeniem na maksimum w ćwiczeniu balansowym, ale rozstrzygała
         * nie to, co trzeba — odbierała wybór trenerowi i jednocześnie
         * proponowała TOP SET przy dipach i wykrokach, bo one też mają 1,0.
         * Wiedza o tym, gdzie TOP SET zwykle stoi, siedzi teraz w
         * `top-set.ts` i służy podpowiedzi, a nie blokadzie.
         *
         * Zostaje jedyny warunek, który jest warunkiem obliczenia, nie
         * oceny: musi być ćwiczenie. Pusty slot nie ma czego podnosić.
         * Ciężar liczy `obliczCiezarTopSetu` i sam mówi „—" przy progresji
         * bez kilogramów oraz „— brak 1RM", gdy nie ma z czego liczyć.
         */
        /*
         * RPE na ten tydzień: wpisane ręcznie albo z szablonu. `null` znaczy,
         * że TOP SETU w tym tygodniu nie ma — tak szablon opisuje T1 i tak
         * jest w obu arkuszach trenera.
         */
        // Bój siłowy w hipertrofii niesie RPE TOP SETU części siłowej.
        const slotZrodla = plan.sloty.find((s) => s.positionId === t.slotPositionId);
        const silowy = !!slotZrodla?.bojSilowy && !!zrodlo?.cwiczenie
          && bojGlownySlotu(slotZrodla, zrodlo.cwiczenie);
        // Dwubój (16.10.2026): TOP SET w % 1RM — w bloku intensyfikującym od T4.
        const procentSzablonu = procentTopSetuDwuboju(plan.czescPlanu, wzorSzablonu.tydzien, slotZrodla?.bojSilowy);
        const procent = zrodlo?.dwuboj
          ? t.procentTygodni?.[tydzien]
            ?? (procentSzablonu === null ? null
              : Math.min(100, procentSzablonu + PREMIA_PROCENTU_BLOKU * wzorSzablonu.premiaRpe / PREMIA_RPE_BLOKU))
          : undefined;
        const rpeSzablonu = rpeTopSetu(czescBoju(plan.czescPlanu, silowy), wzorSzablonu.tydzien);
        const rpe = procent !== undefined
          ? (procent === null ? null : rpeDlaProcentu(1, procent))
          : t.rpeTygodni?.[tydzien] ?? (rpeSzablonu === null ? null : zPremiaRpe(rpeSzablonu, wzorSzablonu.premiaRpe));
        const cwiczenie = rpe === null ? null : (zrodlo?.cwiczenie ?? null);
        const zPlanu = cwiczenie
          ? obliczCiezarTopSetu({
              oneRM: zrodlo!.oneRM,
              rpe: rpe!,
              ...(procent != null ? { procent } : {}),
              skokKg: cwiczenie.skokKg,
              progresja: cwiczenie.progresja,
            })
          : "";
        /*
         * Inny ciężar w TOP SECIE liczy kolejne TOP SETY (12.11.2026). Trener:
         * „zrobiłem większy top set, a nie aktualizuje to kolejnych tygodni”.
         * Ostatni ciężar klienta z wcześniejszego tygodnia (to samo ćwiczenie)
         * × stosunek procentów 1RM obu tygodni: 130 kg przy RPE 8 → przy
         * RPE 8,5 o tyle więcej, ile więcej wymaga RPE. Serie robocze bez
         * zmian — decyzja z 02.10.2026 („top set mógłby być za ciężki,
         * a robocze okej”).
         */
        let ciezar: WynikCiezaru = zPlanu;
        let zTopSetuKlienta: TopSetWyliczony["zTopSetuKlienta"];
        if (cwiczenie && typeof zPlanu === "number") {
          const procentTeraz = procent ?? procent1RM(1, rpe!);
          for (const w of procentTeraz ? wczesniejszeRobocze(tydzien, plan) : []) {
            const kg = slotZrodla?.tygodnie?.[w]?.topSetKlienta?.kg;
            const wtedy = wyliczone.get(w)?.topSety.find((x) => x.positionId === t.slotPositionId);
            if (!kg || !wtedy?.cwiczenie || wtedy.cwiczenie.id !== cwiczenie.id || wtedy.rpe === null) continue;
            const procentWtedy = wtedy.procent ?? procent1RM(1, wtedy.rpe);
            if (!procentWtedy) break;
            ciezar = mround(kg * procentTeraz / procentWtedy, Math.max(cwiczenie.skokKg, SKOK_MINIMALNY));
            zTopSetuKlienta = { tydzien: w, kg };
            break;
          }
        }
        return {
          dzien: t.dzien,
          positionId: t.slotPositionId,
          cwiczenie,
          rpe,
          ...(procent != null ? { procent } : {}),
          ciezar,
          ...(zTopSetuKlienta ? { zTopSetuKlienta } : {}),
        } as TopSetWyliczony;
      });

    const podsumowania = podsumujDni(sloty, topSety);

    wyliczone.set(tydzien, {
      tydzien,
      sloty,
      topSety,
      dni: podsumowania,
      bilans,
      ocenaStresu: ocenaNormy(bilans.razem, NORMY.stresTygodniowy, dni),
    });
  }

  const tygodnie = robocze.map((t) => wyliczone.get(t)!);

  // Tygodnie po cyklu. Osobno od sześciu roboczych: średnie, normy objętości
  // i porównania cykli liczą się z pracy, a deload z definicji jej nie ma.
  const tygodnieDodatkowe: TydzienWyliczony[] = [];
  // „T6” = ostatni tydzień roboczy planu (przy 6 tygodniach — T6).
  const t6 = wyliczone.get(ostatni)!;
  const t1 = wyliczone.get(1)!;
  if (plan.deload) {
    const sloty = plan.sloty.map((slot) =>
      wyliczSlot(slot, TYDZIEN_DELOADU, t6.sloty.find((s) => s.positionId === slot.positionId),
        t1.sloty.find((s) => s.positionId === slot.positionId)));
    tygodnieDodatkowe.push({
      tydzien: TYDZIEN_DELOADU,
      rodzaj: "deload",
      sloty,
      topSety: [],   // bez TOP SETU — tak jest w periodyzacji trenera
      dni: podsumujDni(sloty, []),
      bilans: bilansSlotow(sloty),
      ocenaStresu: "—",   // lżej niż norma to cel, nie usterka
    });
  }
  if (plan.tydzienMaksow) {
    const sloty = slotyMaksow(plan, t6, katalog, ostatni);
    tygodnieDodatkowe.push({
      tydzien: TYDZIEN_MAKSOW,
      rodzaj: "maksy",
      sloty,
      topSety: [],
      dni: podsumujDni(sloty, []),
      bilans: bilansSlotow(sloty),
      ocenaStresu: "—",
    });
  }

  const ocenaObjetosci: PlanWyliczony["ocenaObjetosci"] = {};
  for (const part of ["s", "d", "b", "r", "c"] as const) {
    const serie = tygodnie.map((t) => t.bilans.wzorce.find((w) => w.part === part)!.serie);
    const srednia = serie.reduce((a, b) => a + b, 0) / serie.length;
    ocenaObjetosci[part] = {
      srednia: Math.round(srednia * 100) / 100,
      ocena: ocenaNormy(srednia, NORMY.serie[part], dni),
    };
  }

  return { nazwa: plan.nazwa, dniTreningowe: dni, tygodnie, tygodnieDodatkowe, ocenaObjetosci };
}

/**
 * Ręczny ciężar przeniesiony z wcześniejszego tygodnia (albo wybór klienta
 * z tego samego). `undefined`, gdy nikt jeszcze niczego nie wpisał.
 */
function ciezarRecznyZWczesniej(
  slot: SlotPlanu, tydzien: TydzienCyklu, cwiczenieId: string, p: ParametryTygodnia,
  /** Tygodnie robocze przed tym, od najbliższego (`wczesniejszeRobocze`). */
  wczesniej: readonly Tydzien[],
): { kg: number; tydzien: number; kto: "trener" | "klient" } | undefined {
  const tegoCwiczenia = (x: ParametryTygodnia) =>
    x.ciezarKlienta && x.ciezarKlienta.cwiczenieId === cwiczenieId && x.ciezarKlienta.kg > 0
      ? x.ciezarKlienta.kg : undefined;
  const swoj = tegoCwiczenia(p);
  if (swoj !== undefined) return { kg: swoj, tydzien, kto: "klient" };
  for (const w of wczesniej) {
    const pw = parametry(slot, w);
    if ((pw.cwiczenieIdOverride ?? slot.cwiczenieId) !== cwiczenieId) break;
    const klient = tegoCwiczenia(pw);
    if (klient !== undefined) return { kg: klient, tydzien: w, kto: "klient" };
    if (pw.ciezarOverride !== undefined) return { kg: pw.ciezarOverride, tydzien: w, kto: "trener" };
  }
  return undefined;
}

function bilansSlotow(sloty: readonly SlotWyliczony[]): BilansTygodnia {
  const aktywne: SlotObliczony[] = sloty
    .filter((s) => s.cwiczenie !== null)
    .map((s) => ({
      part: s.cwiczenie!.part,
      serie: s.serieEfektywne,
      powtorzenia: s.powtorzenia,
      stres: s.stres,
    }));
  return bilansTygodnia(aktywne);
}

function podsumujDni(
  sloty: readonly SlotWyliczony[], topSety: readonly TopSetWyliczony[],
): PodsumowanieDnia[] {
  const numeryDni = [...new Set(sloty.map((s) => s.dzien))].sort((a, b) => a - b);
  return numeryDni.map((dzien) => {
    const wDniu = sloty.filter((s) => s.dzien === dzien && s.cwiczenie);
    // Każdy TOP SET to jedna seria więcej — w dniu może ich być kilka.
    const topSetyDnia = topSety.filter((t) => t.dzien === dzien && t.cwiczenie).length;
    return {
      dzien,
      serie: wDniu.reduce((a, s) => a + s.serieEfektywne, 0) + topSetyDnia,
      powtorzenia: wDniu.reduce((a, s) => a + s.serieEfektywne * s.powtorzenia, 0),
      stresCalkowity: Math.round(wDniu.reduce((a, s) => a + s.stres.calkowity, 0) * 1e4) / 1e4,
    };
  });
}

/**
 * Tydzień maksów: 1 × 1 @ RPE 10 w wybranych bojach, wszystkie jednego dnia —
 * decyzja trenera z 25.09.2026, jak tydzień 13 w jego periodyzacji.
 *
 * Każdy bój w osobnej grupie (A1, B1, C1…), żeby prowadzenie dawało pełną
 * przerwę po każdej próbie — wspólna litera znaczyłaby superserię. Ciężar
 * to obecne 1RM (jedno powtórzenie na RPE 10 to 100%): punkt odniesienia,
 * nie polecenie. `positionId` zostaje z miejsca, w którym bój stoi w planie,
 * więc wpis klienta ląduje przy tym samym ćwiczeniu co reszta jego historii.
 */
function slotyMaksow(plan: Plan, t6: TydzienWyliczony, katalog: Katalog, ostatni: Tydzien): SlotWyliczony[] {
  const wybrane = plan.cwiczeniaMaksow ?? domyslneCwiczeniaMaksow(t6);
  const sloty: SlotWyliczony[] = [];
  for (const id of wybrane) {
    const zrodlo = t6.sloty.find((s) => s.cwiczenie?.id === id);
    const cwiczenie = zrodlo?.cwiczenie ?? null;
    if (!zrodlo || !cwiczenie || !katalog.poId(id)) continue;
    const slotPlanu = plan.sloty.find((s) => s.positionId === zrodlo.positionId);
    const oneRM = rozwiaz1RM(id, plan.serieMaksymalne)
      || (slotPlanu ? parametry(slotPlanu, ostatni).oneRMReczny ?? 0 : 0);
    sloty.push({
      positionId: zrodlo.positionId,
      dzien: 1,
      lp: `${String.fromCharCode(65 + sloty.length)}1.`,
      cwiczenie,
      serie: 1,
      serieEfektywne: 1,
      powtorzenia: 1,
      rpe: RPE_MAKSOW,
      procent1RM: procent1RM(1, RPE_MAKSOW),
      oneRM,
      mnoznik: 1,
      ciezar: obliczCiezarTopSetu({
        oneRM, rpe: RPE_MAKSOW, skokKg: cwiczenie.skokKg, progresja: cwiczenie.progresja,
      }),
      ciezarNadpisany: false,
      stres: stresSlotu({ coeff: cwiczenie.coeff, serie: 1, rpe: RPE_MAKSOW, powtorzenia: 1 }),
    });
  }
  return sloty;
}

/**
 * Które boje maksować, gdy trener nie wybrał sam: przysiady, wyciskanie
 * leżąc i martwe ciągi z planu — ta sama lista, przy której zwykle stoi
 * TOP SET. Po jednym razie, choćby bój stał w kilku dniach.
 */
export function domyslneCwiczeniaMaksow(t6: TydzienWyliczony): string[] {
  const wynik: string[] = [];
  for (const s of t6.sloty) {
    const c = s.cwiczenie;
    // Dwubój też (16.10.2026) — T8 to jego test 1RM, tak jak przy bojach.
    if (c && (zwyczajowyTopSet(c.nazwa) || DWUBOJ.has(c.id)) && !wynik.includes(c.id)) wynik.push(c.id);
  }
  return wynik;
}

/** Tydzień cyklu po numerze — roboczy (1–6) albo dodatkowy (7 deload, 8 maksy). */
export function tydzienWyliczony(
  wynik: PlanWyliczony, tydzien: number,
): TydzienWyliczony | undefined {
  return wynik.tygodnie.find((t) => t.tydzien === tydzien)
    ?? wynik.tygodnieDodatkowe?.find((t) => t.tydzien === tydzien);
}

/** Numery tygodni, które plan faktycznie ma — w tej kolejności widzi je klient. */
export function tygodniePlanu(plan: Pick<Plan, "deload" | "tydzienMaksow" | "tygodni">): TydzienCyklu[] {
  return [
    ...tygodnieRobocze(plan),
    ...(plan.deload ? [TYDZIEN_DELOADU] : []),
    ...(plan.tydzienMaksow ? [TYDZIEN_MAKSOW] : []),
  ];
}

/**
 * Numer tygodnia na ekranie. Klucze są stałe (7 deload, 8 maksy, T7–T12 to
 * 9–14), żeby włączenie deloadu albo zmiana długości po fakcie nie
 * przenosiły wpisów klienta między tygodniami — ale na ekranie deload stoi
 * zaraz po ostatnim tygodniu roboczym, a bez deloadu maksy też.
 */
export function numerTygodniaNaEkranie(
  plan: Pick<Plan, "deload" | "tydzienMaksow" | "tygodni">, tydzien: number,
): number {
  return numerNaEkranie(plan, tydzien);
}

/** RPE w deloadzie: o 1 niżej niż w T6 (skala planu), nie niżej niż 6 — tam zaczyna się tabela. */
export function rpeDeloadu(rpeT6: number): number {
  return Math.max(RPE_MIN_DELOADU, rpeT6 - OBNIZENIE_RPE_DELOADU);
}

export type PorownanieJednostronnych = {
  /** Ile slotów w planie to ćwiczenia jednostronne. */
  slotowJednostronnych: number;
  wzorce: {
    part: string;
    nazwa: string;
    serieJakWArkuszu: number;
    serieObieStrony: number;
    stresJakWArkuszu: number;
    stresObieStrony: number;
    ocenaJakWArkuszu: OcenaNormy;
    ocenaObieStrony: OcenaNormy;
    ocenaSieZmienia: boolean;
  }[];
  stresRazemJakWArkuszu: number;
  stresRazemObieStrony: number;
};

/**
 * Pokazuje, co zmienia przełączenie liczenia jednostronnych — na poziomie tygodnia 1.
 *
 * Po co: w planie `3 × 10` przy pozycji jednostronnej znaczy na stronę, więc sesja
 * zawiera 6 serii. Arkusz liczy 3, a normy w zakładce Analiza powstały na tym
 * liczeniu. Zanim się je przestawi, warto zobaczyć, ile pozycji wypada z normy.
 */
export function porownajLiczenieJednostronnych(
  plan: Plan,
  katalog: Katalog = katalogDomyslny,
): PorownanieJednostronnych {
  const jakWArkuszu = przeliczPlan({ ...plan, liczenieJednostronnych: "jak w arkuszu" }, katalog);
  const obieStrony = przeliczPlan({ ...plan, liczenieJednostronnych: "obie strony" }, katalog);
  const dni = jakWArkuszu.dniTreningowe;

  const slotowJednostronnych = plan.sloty.filter(
    (s) => s.cwiczenieId && katalog.poId(s.cwiczenieId)?.jednostronne,
  ).length;

  const a = jakWArkuszu.tygodnie[0]!.bilans;
  const b = obieStrony.tygodnie[0]!.bilans;

  const wzorce = a.wzorce.map((wa) => {
    const wb = b.wzorce.find((x) => x.part === wa.part)!;
    const zakres = NORMY.serie[wa.part as keyof typeof NORMY.serie];
    const ocenaA = ocenaNormy(wa.serie, zakres, dni);
    const ocenaB = ocenaNormy(wb.serie, zakres, dni);
    return {
      part: wa.part,
      nazwa: wa.nazwa,
      serieJakWArkuszu: wa.serie,
      serieObieStrony: wb.serie,
      stresJakWArkuszu: wa.calkowity,
      stresObieStrony: wb.calkowity,
      ocenaJakWArkuszu: ocenaA,
      ocenaObieStrony: ocenaB,
      ocenaSieZmienia: ocenaA !== ocenaB,
    };
  });

  return {
    slotowJednostronnych,
    wzorce,
    stresRazemJakWArkuszu: a.razem,
    stresRazemObieStrony: b.razem,
  };
}
