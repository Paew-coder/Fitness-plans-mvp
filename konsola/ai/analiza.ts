/**
 * Odczytanie analizy słowami — trzecie zadanie warstwy AI.
 *
 * Model nie liczy tu niczego. Dostaje gotowe liczby z silnika — stres tygodniowy,
 * rozkład wzorców, oceny względem norm, realizację i odczucia klienta — i ma
 * powiedzieć, co z nich wynika. Zdanie w rodzaju „obwodowy trzyma 68% przy dwóch
 * tygodniach z rzędu powyżej normy w wyciskaniu" trener przeczyta z tabeli sam,
 * ale przy sześciu tygodniach × pięciu wzorcach × trzech osiach to jest 90 liczb
 * i coś zawsze umknie.
 *
 * Granica jest ostra: **model opisuje, nie przelicza**. Nie wolno mu podać ciężaru,
 * RPE ani liczby serii do wpisania — może powiedzieć „rozważ ścięcie objętości
 * wyciskania w T3", bo to jest wskazanie kierunku, a decyzja i liczba należą
 * do trenera.
 */
import type { PlanWyliczony } from "../../silnik/src/plan.ts";
import { NORMY } from "../../silnik/src/stres.ts";
import { jako, zapytaj, type BlokSystemowy, type Uzycie } from "./klient.ts";

export type WejscieAnalizy = {
  wynik: PlanWyliczony;
  /** Realizacja z konsoli — ile treningów domkniętych i jak klient je ocenił. */
  realizacja: {
    ukonczonych: number;
    zaplanowanych: number;
    dniOdOstatniej: number | null;
    odczucia: { latwe: number; ok: number; trudne: number };
  } | null;
  /** Jednozdaniowe podsumowanie porównania z poprzednim cyklem, jeśli jest. */
  porownanie: string | null;
  /** Uwagi z walidatora — błędy i ostrzeżenia, które trener już widzi na ekranie. */
  uwagi: readonly { poziom: string; opis: string }[];
};

export type Spostrzezenie = {
  tytul: string;
  tresc: string;
  waga: "wysoka" | "średnia" | "niska";
};

export type OdczytAnalizy = {
  spostrzezenia: Spostrzezenie[];
  doSprawdzenia: string[];
  podsumowanie: string;
};

export const SCHEMAT_ANALIZY = {
  type: "object",
  additionalProperties: false,
  required: ["spostrzezenia", "doSprawdzenia", "podsumowanie"],
  properties: {
    spostrzezenia: {
      type: "array",
      description: "Od dwóch do czterech spostrzeżeń, najważniejsze pierwsze.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tytul", "tresc", "waga"],
        properties: {
          tytul: { type: "string", description: "Do sześciu słów." },
          tresc: {
            type: "string",
            description:
              "Dwa do trzech zdań. Powołuj się na konkretne liczby z raportu — "
              + "przepisuj je dokładnie, nigdy nie licz własnych.",
          },
          waga: { type: "string", enum: ["wysoka", "średnia", "niska"] },
        },
      },
    },
    doSprawdzenia: {
      type: "array",
      description:
        "Zero do trzech pytań, na które odpowiada tylko trener — np. „czy T4 miało być "
        + "odciążeniem”. Bez pytań o dane, których nie ma w raporcie.",
      items: { type: "string" },
    },
    podsumowanie: { type: "string", description: "Jedno zdanie o całym cyklu." },
  },
} as const;

const ZASADY = `Jesteś asystentem trenera w aplikacji CraftMyPlan. Piszesz po polsku,
zwięźle, w drugiej osobie, do zawodowego trenera. Bez wstępów i bez zachęt.

CO DOSTAJESZ
Gotowy raport liczbowy z sześciu tygodni cyklu. Liczby policzył silnik aplikacji
i są prawdziwe co do drugiego miejsca po przecinku.

CO ROBISZ
Czytasz ten raport i mówisz, co z niego wynika: co odstaje, co się powtarza,
co ze sobą nie gra. Powołujesz się na konkretne liczby — przepisane z raportu,
nigdy policzone przez Ciebie.

CZEGO NIE ROBISZ NIGDY
1. Nie liczysz. Żadnego dodawania, uśredniania ani przeliczania procentów.
   Jeśli liczby nie ma w raporcie, nie ma jej w odpowiedzi.
2. Nie podajesz ciężarów, RPE, liczby serii ani powtórzeń do wpisania.
   Możesz wskazać kierunek („rozważ mniej objętości w wyciskaniu w T3”),
   ale wartość ustala trener.
3. Nie oceniasz planu jako dobrego ani złego. Mniejsza objętość po przerwie
   jest dokładnie tym, czego trzeba — nie wiesz, co się działo poza aplikacją.
4. Nie diagnozujesz i nie doradzasz w sprawach zdrowia. Sygnał bólu czy kontuzji
   to powód do konsultacji, nie do zmiany planu przez Ciebie.

SŁOWNIK
part: s — przysiad · d — martwy ciąg · b — wyciskanie · r — wiosłowanie · c — core.
Stres liczy się na trzech osiach: całkowitej, centralnej i obwodowej.
Ocena „▼ poniżej / ✓ w normie / ▲ powyżej" jest względem norm przeskalowanych
liczbą dni treningowych.
Tydzień 4 zaczyna nowy blok — w planie bywa lżejszy celowo.

Odpowiadasz wyłącznie w formacie z podanego schematu.`;

export function promptSystemowy(): BlokSystemowy[] {
  return [{ type: "text", text: ZASADY }];
}

const liczba = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/**
 * Raport liczbowy — wszystko, co model dostaje, i nic ponad to.
 *
 * Nie ma tu nazwiska klienta ani nazwy planu: do przeczytania rozkładu obciążeń
 * są niepotrzebne, a wysyłanie ich na zewnątrz byłoby kosztem bez korzyści.
 */
export function raportLiczbowy(wejscie: WejscieAnalizy): string {
  const { wynik } = wejscie;
  const linie: string[] = [];

  linie.push(`Dni treningowych w tygodniu: ${wynik.dniTreningowe}`);
  linie.push(
    `Normy na jeden dzień treningowy — stres tygodniowy ${NORMY.stresTygodniowy.join("–")}; `
    + `serie: ${Object.entries(NORMY.serie).map(([p, z]) => `${p} ${z.join("–")}`).join(", ")}`,
  );

  linie.push("", "STRES TYGODNIOWY (całkowity · centralny · obwodowy · ocena)");
  for (const t of wynik.tygodnie) {
    linie.push(
      `T${t.tydzien}: ${liczba(t.bilans.razem)} · ${liczba(t.bilans.centralny)} · `
      + `${liczba(t.bilans.obwodowy)} · ${t.ocenaStresu} | `
      + `dolne ${liczba(t.bilans.dolne)}, górne ${liczba(t.bilans.gorne)}, core ${liczba(t.bilans.core)} | `
      + `${t.bilans.serieRazem} serii, ${t.bilans.powtorzeniaRazem} powt.`,
    );
  }

  linie.push("", "SERIE PER WZORZEC (T1…T6, potem średnia cyklu i jej ocena)");
  for (const [part, ocena] of Object.entries(wynik.ocenaObjetosci)) {
    const poTygodniach = wynik.tygodnie
      .map((t) => t.bilans.wzorce.find((w) => w.part === part)?.serie ?? 0)
      .join(", ");
    const nazwa = wynik.tygodnie[0]?.bilans.wzorce.find((w) => w.part === part)?.nazwa ?? part;
    linie.push(`${part} (${nazwa}): ${poTygodniach} → średnio ${liczba(ocena.srednia)} · ${ocena.ocena}`);
  }

  linie.push("", "UDZIAŁ WZORCÓW W T1");
  for (const w of wynik.tygodnie[0]?.bilans.wzorce ?? []) {
    linie.push(`${w.part} (${w.nazwa}): ${liczba(w.udzial * 100)}% stresu całkowitego`);
  }

  if (wejscie.realizacja) {
    const r = wejscie.realizacja;
    const razem = r.odczucia.latwe + r.odczucia.ok + r.odczucia.trudne;
    linie.push(
      "",
      "REALIZACJA",
      `Treningi domknięte: ${r.ukonczonych} z ${r.zaplanowanych}.`,
      r.dniOdOstatniej === null
        ? "Klient nie odhaczył jeszcze nic."
        : `Ostatnia aktywność ${r.dniOdOstatniej} dni temu.`,
      razem === 0
        ? "Brak ocen ćwiczeń."
        : `Oceny ćwiczeń: ${r.odczucia.latwe} „za łatwe", ${r.odczucia.ok} „OK", `
          + `${r.odczucia.trudne} „za trudne" (razem ${razem}).`,
    );
  }

  if (wejscie.porownanie) linie.push("", "WOBEC POPRZEDNIEGO CYKLU", wejscie.porownanie);

  const istotne = wejscie.uwagi.filter((u) => u.poziom !== "info");
  if (istotne.length > 0) {
    linie.push("", "KONTROLA PLANU (to trener już widzi na ekranie)");
    for (const u of istotne) linie.push(`- [${u.poziom}] ${u.opis}`);
  }

  return linie.join("\n");
}

export type WynikAnalizy = { odczyt: OdczytAnalizy; uzycie: Uzycie };

/** Pyta model o odczytanie analizy. Zwraca spostrzeżenia, nie zmiany w planie. */
export async function odczytajAnalize(wejscie: WejscieAnalizy): Promise<WynikAnalizy> {
  const odp = await zapytaj({
    system: promptSystemowy(),
    wiadomosc:
      "Przeczytaj ten raport i powiedz, co w nim widzisz.\n\n"
      + raportLiczbowy(wejscie),
    schemat: SCHEMAT_ANALIZY,
    // Tu nie ma nic do zaprojektowania — liczby są gotowe, chodzi o ich odczytanie.
    wysilek: "medium",
    maxTokens: 4000,
  });
  return { odczyt: uporzadkuj(jako<OdczytAnalizy>(odp)), uzycie: odp.uzycie };
}

/** Porządkuje odpowiedź: najważniejsze pierwsze, bez pustych wpisów. */
export function uporzadkuj(odczyt: OdczytAnalizy): OdczytAnalizy {
  const waga = { wysoka: 0, "średnia": 1, niska: 2 } as const;
  return {
    spostrzezenia: (odczyt.spostrzezenia ?? [])
      .filter((s) => s?.tytul?.trim() && s?.tresc?.trim())
      .sort((a, b) => (waga[a.waga] ?? 3) - (waga[b.waga] ?? 3)),
    doSprawdzenia: (odczyt.doSprawdzenia ?? []).filter((p) => p?.trim()),
    podsumowanie: String(odczyt.podsumowanie ?? "").trim(),
  };
}
