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
import { obliczCiezar, obliczCiezarTopSetu, tydzienBazowyBloku } from "./ciezar.ts";
import { korektaPowtorzen, mnoznikNaTydzien } from "./adaptacja.ts";
import { powtorzeniaAkcesorium } from "./powtorzenia.ts";
import { jestBojemGlownym, progresjaSlotu } from "./szablon-boju.ts";
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
import { procent1RM, rozwiaz1RM, type SeriaMaksymalna } from "./rpe.ts";

export const TYGODNIE: readonly Tydzien[] = [1, 2, 3, 4, 5, 6];

/** Tygodnie po cyklu mają stałe numery — patrz `numerTygodniaNaEkranie`. */
export const TYDZIEN_DELOADU = 7;
export const TYDZIEN_MAKSOW = 8;
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
};

export type TopSet = {
  dzien: number;
  wlaczony: boolean;
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
  trybAkcesoriow: TrybAkcesoriow;
  czescPlanu: CzescPlanu;
  serieMaksymalne: readonly SeriaMaksymalna[];
  sloty: readonly SlotPlanu[];
  topSety?: readonly TopSet[];
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
};

export type TopSetWyliczony = {
  dzien: number;
  cwiczenie: Cwiczenie | null;
  /** `null` = w tym tygodniu TOP SETU nie ma. W szablonie tak jest w T1. */
  rpe: number | null;
  ciezar: WynikCiezaru;
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
  const wyliczone = new Map<Tydzien, TydzienWyliczony>();

  /**
   * Jeden slot w jednym tygodniu. `wzor` to ten sam slot policzony w T6 —
   * podaje go tylko deload, który nie ma szablonu, a zaczyna od tego, gdzie
   * cykl się skończył.
   */
  const wyliczSlot = (slot: SlotPlanu, tydzien: TydzienCyklu, wzor?: SlotWyliczony): SlotWyliczony => {
    const p = parametry(slot, tydzien);
    // Deload bierze ćwiczenie z T6: podmiana z T4–T6 trwa do końca cyklu.
    const p6: ParametryTygodnia = wzor ? parametry(slot, 6) : {};
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

    const bojGlowny = jestBojemGlownym(slot.lp, cwiczenie.coeff);
    const odczucia = Object.fromEntries(
      TYGODNIE.map((t) => [t, parametry(slot, t).feedback]),
    ) as Partial<Record<Tydzien, Feedback | undefined>>;
    const mnoznik = mnoznikNaTydzien(tydzien as Tydzien, odczucia);

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
    const szablon = wzor
      ? { serie: wzor.serie, powtorzenia: wzor.powtorzenia, rpe: rpeDeloadu(wzor.rpe) }
      : progresjaSlotu(slot.lp, tydzien as Tydzien, cwiczenie.coeff, plan.czescPlanu);

    const serie = p.serie ?? szablon.serie!;
    const efektywne = serieEfektywne(
      serie, cwiczenie.jednostronne, plan.liczenieJednostronnych ?? "jak w arkuszu",
    );
    const rpe = p.rpe ?? szablon.rpe!;
    const powtorzenia =
      p.powtorzenia ??
      szablon.powtorzenia ??
      powtorzeniaAkcesorium({
        coeff: cwiczenie.coeff,
        czesc: plan.czescPlanu,
        tydzien,
        korekta: korektaPowtorzen(cwiczenie.progresja, mnoznik),
      });

    const zmienione = cwiczenieIdOverride !== undefined && cwiczenieIdOverride !== slot.cwiczenieId;
    const oneRM = rozwiaz1RM(cwiczenie.id, plan.serieMaksymalne);

    const bazowy = tydzienBazowyBloku(tydzien as Tydzien);
    const slotBazowy = bazowy
      ? wyliczone.get(bazowy)?.sloty.find((s) => s.positionId === slot.positionId)
      : undefined;

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
      ? ciezarRecznyZWczesniej(slot, tydzien, cwiczenie.id, p) : undefined;

    const policzony = obliczCiezar({
      tydzien: tydzien as Tydzien,
      jestBojemGlownym: bojGlowny,
      trybAkcesoriow: slot.trybCiezaru ?? plan.trybAkcesoriow,
      powtorzenia,
      rpe,
      skokKg: cwiczenie.skokKg,
      progresja: cwiczenie.progresja,
      oneRM,
      mnoznik,
      cwiczenieZmienioneWzgledemT1: zmienione,
      oneRMReczny: p.oneRMReczny ?? p6.oneRMReczny,
      ciezarBazowy: slotBazowy?.ciezar,
      mnoznikBazowy: slotBazowy?.mnoznik,
    });

    return {
      positionId: slot.positionId,
      dzien: slot.dzien,
      lp: slot.lp,
      cwiczenie,
      serie,
      serieEfektywne: efektywne,
      powtorzenia,
      rpe,
      procent1RM: procent1RM(powtorzenia, rpe),
      oneRM,
      mnoznik,
      ciezar: p.ciezarOverride ?? przeniesiony?.kg ?? policzony,
      ciezarNadpisany: p.ciezarOverride !== undefined,
      ...(p.ciezarOverride === undefined && przeniesiony
        ? { ciezarZrodlo: { tydzien: przeniesiony.tydzien, kto: przeniesiony.kto } } : {}),
      stres: stresSlotu({ coeff: cwiczenie.coeff, serie: efektywne, rpe, powtorzenia }),
    };
  };

  for (const tydzien of TYGODNIE) {
    const sloty: SlotWyliczony[] = [];

    for (const slot of plan.sloty) sloty.push(wyliczSlot(slot, tydzien));

    const bilans = bilansSlotow(sloty);

    const topSety: TopSetWyliczony[] = (plan.topSety ?? [])
      .filter((t) => t.wlaczony)
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
        const rpe = t.rpeTygodni?.[tydzien] ?? rpeTopSetu(plan.czescPlanu, tydzien);
        const cwiczenie = rpe === null ? null : (zrodlo?.cwiczenie ?? null);
        return {
          dzien: t.dzien,
          cwiczenie,
          rpe,
          ciezar: cwiczenie
            ? obliczCiezarTopSetu({
                oneRM: zrodlo!.oneRM,
                rpe: rpe!,
                skokKg: cwiczenie.skokKg,
                progresja: cwiczenie.progresja,
              })
            : "",
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

  const tygodnie = TYGODNIE.map((t) => wyliczone.get(t)!);

  // Tygodnie po cyklu. Osobno od sześciu roboczych: średnie, normy objętości
  // i porównania cykli liczą się z pracy, a deload z definicji jej nie ma.
  const tygodnieDodatkowe: TydzienWyliczony[] = [];
  const t6 = wyliczone.get(6)!;
  if (plan.deload) {
    const sloty = plan.sloty.map((slot) =>
      wyliczSlot(slot, TYDZIEN_DELOADU, t6.sloty.find((s) => s.positionId === slot.positionId)));
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
    const sloty = slotyMaksow(plan, t6, katalog);
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
): { kg: number; tydzien: number; kto: "trener" | "klient" } | undefined {
  const tegoCwiczenia = (x: ParametryTygodnia) =>
    x.ciezarKlienta && x.ciezarKlienta.cwiczenieId === cwiczenieId && x.ciezarKlienta.kg > 0
      ? x.ciezarKlienta.kg : undefined;
  const swoj = tegoCwiczenia(p);
  if (swoj !== undefined) return { kg: swoj, tydzien, kto: "klient" };
  for (let w = tydzien - 1; w >= 1; w--) {
    const pw = parametry(slot, w as TydzienCyklu);
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
    const topSetDnia = topSety.find((t) => t.dzien === dzien && t.cwiczenie);
    return {
      dzien,
      serie: wDniu.reduce((a, s) => a + s.serieEfektywne, 0) + (topSetDnia ? 1 : 0),
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
function slotyMaksow(plan: Plan, t6: TydzienWyliczony, katalog: Katalog): SlotWyliczony[] {
  const wybrane = plan.cwiczeniaMaksow ?? domyslneCwiczeniaMaksow(t6);
  const sloty: SlotWyliczony[] = [];
  for (const id of wybrane) {
    const zrodlo = t6.sloty.find((s) => s.cwiczenie?.id === id);
    const cwiczenie = zrodlo?.cwiczenie ?? null;
    if (!zrodlo || !cwiczenie || !katalog.poId(id)) continue;
    const slotPlanu = plan.sloty.find((s) => s.positionId === zrodlo.positionId);
    const oneRM = rozwiaz1RM(id, plan.serieMaksymalne)
      || (slotPlanu ? parametry(slotPlanu, 6).oneRMReczny ?? 0 : 0);
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
    if (c && zwyczajowyTopSet(c.nazwa) && !wynik.includes(c.id)) wynik.push(c.id);
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
export function tygodniePlanu(plan: Pick<Plan, "deload" | "tydzienMaksow">): TydzienCyklu[] {
  return [
    ...TYGODNIE,
    ...(plan.deload ? [TYDZIEN_DELOADU] : []),
    ...(plan.tydzienMaksow ? [TYDZIEN_MAKSOW] : []),
  ];
}

/**
 * Numer tygodnia na ekranie. Klucze są stałe (7 deload, 8 maksy), żeby
 * włączenie deloadu po fakcie nie przenosiło wpisów klienta między
 * tygodniami — ale bez deloadu maksy są po prostu tygodniem siódmym.
 */
export function numerTygodniaNaEkranie(
  plan: Pick<Plan, "deload" | "tydzienMaksow">, tydzien: number,
): number {
  return tydzien === TYDZIEN_MAKSOW && !plan.deload ? TYDZIEN_DELOADU : tydzien;
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
