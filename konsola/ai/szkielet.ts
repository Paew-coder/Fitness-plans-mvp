/**
 * Propozycja szkieletu planu — pierwsze z trzech zadań warstwy AI.
 *
 * Model dostaje cel, staż, liczbę dni, sprzęt i ćwiczenia z poprzedniego cyklu.
 * Oddaje układ dni: jaka kategoria w którym miejscu i które konkretnie ćwiczenie
 * z katalogu. **Nie oddaje ani jednej liczby** — serie, powtórzenia, RPE i ciężary
 * zostają tam, gdzie były: w silniku i w rękach trenera.
 *
 * Wszystko, co wróci, przechodzi przez `zlozPropozycje`: nieistniejące ID
 * wypada, zła kategoria zostaje poprawiona katalogiem, powtórka z poprzedniego
 * cyklu dostaje znacznik. Dopiero tak sprawdzona propozycja trafia na ekran,
 * a do planu — dopiero po kliknięciu trenera.
 */
import type { Kategoria } from "../../silnik/src/typy.ts";
import { Katalog, katalog as katalogDomyslny } from "../../silnik/src/katalog.ts";
import { NORMY, NAZWY_WZORCOW } from "../../silnik/src/stres.ts";
import type { Plan } from "../../silnik/src/plan.ts";
import { LP_SLOTU } from "../uklad-planu.ts";
import { jako, zapytaj, type BlokSystemowy, type Uzycie } from "./klient.ts";
import { INSTRUKCJA_ZDROWOTNA, sygnalZdrowotny, type SygnalZdrowotny } from "./sygnaly.ts";

const KATEGORIE: readonly Kategoria[] = [
  "Lower push", "Lower pull", "Upper push horizontal", "Upper push vertical",
  "Upper pull horizontal", "Upper pull vertical", "Core", "Bicep", "Tricep",
];

/** Ile pozycji da się nazwać w dniu — tyle, ile ma szablon Lp. (A1…E2). */
export const MAX_CWICZEN_W_DNIU = LP_SLOTU.filter((lp) => lp !== "").length;

export const MAX_DNI = 5;

export type WejscieSzkieletu = {
  cel: string;
  staz: string;
  dniWTygodniu: number;
  sprzet: string;
  /**
   * Notatka trenera — wszystko, co nie mieści się w polach wyżej.
   *
   * **Nigdzie się nie zapisuje.** Leci do API przy tym jednym zapytaniu i znika
   * razem z odpowiedzią. Tak długo, jak aplikacja nie przechowuje danych
   * o zdrowiu, tak długo nie musi ich chronić.
   */
  notatka: string;
};

export type KontekstSzkieletu = {
  /** ID ćwiczeń z poprzedniego cyklu — do unikania powtórek. */
  poprzednieCwiczenia: readonly string[];
};

export type CwiczeniePropozycji = {
  lp: string;
  positionId: string;
  cwiczenieId: string;
  nazwa: string;
  kategoria: Kategoria;
  powod: string;
  /** Co warto o tej pozycji wiedzieć: powtórka z cyklu, brak filmu, do weryfikacji. */
  znaczniki: string[];
};

export type DzienPropozycji = {
  dzien: number;
  nazwa: string;
  cwiczenia: CwiczeniePropozycji[];
};

export type Propozycja = {
  dni: DzienPropozycji[];
  uzasadnienie: string;
  /** Co poprawiliśmy albo odrzuciliśmy w odpowiedzi modelu. Widoczne dla trenera. */
  uwagi: string[];
  sygnal: SygnalZdrowotny;
};

/** Surowy kształt odpowiedzi — dokładnie to, co wiąże schemat. */
type SurowaPropozycja = {
  dni: {
    dzien: number;
    nazwa: string;
    cwiczenia: { cwiczenieId: string; nazwa: string; kategoria: Kategoria; powod: string }[];
  }[];
  uzasadnienie: string;
};

export const SCHEMAT_SZKIELETU = {
  type: "object",
  additionalProperties: false,
  required: ["dni", "uzasadnienie"],
  properties: {
    dni: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dzien", "nazwa", "cwiczenia"],
        properties: {
          dzien: { type: "integer", description: "Numer dnia treningowego, od 1." },
          nazwa: {
            type: "string",
            description: "Krótka nazwa dnia, np. „Dolny — przysiad i core”. Maksymalnie 40 znaków.",
          },
          cwiczenia: {
            type: "array",
            description:
              "Pozycje w kolejności wykonania. Pierwsza to bój główny. "
              + `Od 4 do ${MAX_CWICZEN_W_DNIU} pozycji.`,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["cwiczenieId", "nazwa", "kategoria", "powod"],
              properties: {
                cwiczenieId: {
                  type: "string",
                  description: "Dokładne ID z katalogu, w formacie EX-0000. Nie wymyślaj ID.",
                },
                nazwa: { type: "string", description: "Nazwa ćwiczenia dokładnie jak w katalogu." },
                kategoria: { type: "string", enum: [...KATEGORIE] },
                powod: {
                  type: "string",
                  description: "Jedno zdanie: dlaczego akurat to ćwiczenie w tym miejscu.",
                },
              },
            },
          },
        },
      },
    },
    uzasadnienie: {
      type: "string",
      description:
        "Trzy do pięciu zdań o logice całego tygodnia: rozkład wzorców, kolejność dni, "
        + "czego świadomie nie ma i dlaczego.",
    },
  },
} as const;

/** Katalog ćwiczeń w formie, którą model czyta bez zgadywania. */
export function katalogDoPromptu(katalog: Katalog = katalogDomyslny): string {
  const linie = katalog.wszystkie.map((c) => {
    const cechy = [
      c.jednostronne ? "jednostronne" : null,
      c.uwagi?.startsWith("DO WERYFIKACJI") || c.uwagi?.startsWith("UZUPEŁNIĆ") ? "do weryfikacji" : null,
    ].filter(Boolean).join(",");
    return `${c.id}|${c.nazwa}|${c.kategoria}|${c.part}|${c.coeff}|${c.progresja}${cechy ? `|${cechy}` : ""}`;
  });
  return `ID|nazwa|kategoria|part|coeff|progresja|cechy\n${linie.join("\n")}`;
}

const ZASADY = `Jesteś asystentem trenera w aplikacji CraftMyPlan. Pracujesz po polsku.

TWOJA ROLA I JEJ GRANICE
Proponujesz szkielet cyklu: które kategorie ruchu w którym miejscu i jakie konkretnie
ćwiczenia z katalogu. To wszystko. Nie podajesz serii, powtórzeń, RPE ani ciężarów —
liczy je silnik aplikacji, deterministycznie, i nie wolno ich zgadywać. Twoja propozycja
jest propozycją: trener ją przyjmuje albo odrzuca jednym kliknięciem.

JAK ZBUDOWANY JEST DZIEŃ
Pozycje mają numerację, która niesie znaczenie:
  A1  — bój główny. Jedno ćwiczenie złożone, coeff 1, na nim stoi cały dzień.
  B1+B2, C1+C2, D1+D2, E1+E2 — pary. Wspólna litera znaczy superserię:
        te dwa ćwiczenia robi się naprzemiennie, więc nie mogą konkurować
        o ten sam wzorzec ani o ten sam sprzęt. Push z pull, góra z dołem, złożone z core.
Kolejność listy = kolejność wykonania. Pierwsza pozycja to zawsze bój główny.

WZORZEC (part) TO NIE KATEGORIA
Kategoria mówi, jak ruch wygląda. Pole „part" mówi, gdzie ląduje obciążenie,
i tylko ono liczy się do bilansu tygodnia:
  s — przysiad · d — martwy ciąg · b — wyciskanie · r — wiosłowanie · c — core
Równoważysz plan po wzorcach, nie po kategoriach.

NORMY OBJĘTOŚCI (serie na tydzień, na jeden dzień treningowy)
  s 4–7 · d 4–7 · b 8–13 · r 7–11 · c 3–6
Akcesorium to zwykle 3 serie, bój główny 1–6. Nie podajesz serii, ale te liczby
mówią Ci, ile pozycji danego wzorca ma sens w tygodniu.

ZASADY DOBORU
1. Używasz wyłącznie ID z katalogu poniżej. ID spoza katalogu jest błędem.
2. Kategoria musi zgadzać się z katalogiem — nie przepisujesz jej z głowy.
3. Bój główny (A1) to ćwiczenie z coeff 1 albo 0,75, progresja „kg”.
4. Nie powtarzasz tego samego ćwiczenia dwa razy w jednym dniu.
5. Ćwiczenia z poprzedniego cyklu klienta możesz powtórzyć, jeśli to ma sens
   (bój główny często wraca), ale akcesoria warto wymienić — trener to zobaczy.
6. Respektujesz sprzęt. Jeśli klient ma wolne ciężary bez maszyn, nie proponujesz maszyn.
7. Pozycję oznaczoną „do weryfikacji” bierzesz tylko wtedy, gdy nie ma lepszej.

BEZPIECZEŃSTWO
Nie diagnozujesz i nie leczysz. Przy jakimkolwiek sygnale bólu, kontuzji lub leczenia
oznaczasz to w uzasadnieniu i piszesz wprost, że decyzja należy do trenera, a przy
wątpliwości — do lekarza lub fizjoterapeuty. Nie rozstrzygasz, czy ćwiczenie jest
dla kogoś bezpieczne.

Odpowiadasz wyłącznie w formacie z podanego schematu.`;

export function promptSystemowy(katalog: Katalog = katalogDomyslny): BlokSystemowy[] {
  return [
    { type: "text", text: ZASADY },
    {
      type: "text",
      text: `KATALOG ĆWICZEŃ (${katalog.wszystkie.length} pozycji)\n${katalogDoPromptu(katalog)}`,
      // Katalog nie zmienia się między zapytaniami — po pierwszym razie
      // czyta się z cache za dziesiątą część ceny.
      cache_control: { type: "ephemeral" },
    },
  ];
}

/**
 * Brief dla modelu.
 *
 * Nie ma tu nazwiska klienta ani niczego, co go identyfikuje — do dobrania
 * ćwiczeń to niepotrzebne, a raz wysłane dane zostają wysłane. Jest tylko to,
 * co trener sam wpisał w formularzu.
 */
export function wiadomosc(
  wejscie: WejscieSzkieletu,
  kontekst: KontekstSzkieletu,
  katalog: Katalog = katalogDomyslny,
): string {
  const dni = Math.min(Math.max(Math.round(wejscie.dniWTygodniu) || 3, 1), MAX_DNI);
  const czesci: string[] = [
    `Zaproponuj szkielet cyklu na ${dni} ${dni === 1 ? "dzień" : "dni"} treningowe w tygodniu.`,
    "",
    `Cel: ${wejscie.cel.trim() || "nie podano"}`,
    `Staż: ${wejscie.staz.trim() || "nie podano"}`,
    `Sprzęt: ${wejscie.sprzet.trim() || "nie podano — załóż typową siłownię komercyjną"}`,
  ];

  if (wejscie.notatka.trim()) czesci.push(`Notatka trenera: ${wejscie.notatka.trim()}`);

  const poprzednie = kontekst.poprzednieCwiczenia
    .map((id) => katalog.poId(id)?.nazwa)
    .filter(Boolean);
  if (poprzednie.length > 0) {
    czesci.push(
      "",
      `Poprzedni cykl zawierał: ${poprzednie.join(", ")}.`,
      "Bój główny może wrócić; akcesoria raczej wymień.",
    );
  }

  if (sygnalZdrowotny(wejscie.notatka).wykryty) czesci.push("", INSTRUKCJA_ZDROWOTNA);

  return czesci.join("\n");
}

/**
 * Sprawdza odpowiedź modelu i zamienia ją na propozycję, którą da się pokazać.
 *
 * Funkcja czysta — cała weryfikacja daje się przetestować bez sieci, a to jest
 * ta część, na której naprawdę zależy: model może pomylić ID, kategorię albo
 * wpisać dziesięć pozycji tam, gdzie mieści się dziewięć.
 */
export function zlozPropozycje(
  surowa: SurowaPropozycja,
  wejscie: WejscieSzkieletu,
  kontekst: KontekstSzkieletu,
  katalog: Katalog = katalogDomyslny,
): Propozycja {
  const uwagi: string[] = [];
  const poprzednie = new Set(kontekst.poprzednieCwiczenia);
  const oczekiwaneDni = Math.min(Math.max(Math.round(wejscie.dniWTygodniu) || 3, 1), MAX_DNI);

  const surowe = (surowa.dni ?? []).filter((d) => Array.isArray(d?.cwiczenia));
  if (surowe.length > oczekiwaneDni) {
    uwagi.push(`Model zaproponował ${surowe.length} dni zamiast ${oczekiwaneDni} — nadmiar odcięty.`);
  }

  const uzyte = new Map<string, number>();
  const dni: DzienPropozycji[] = [];

  // Numerujemy dni po kolei od 1, nie po tym, co przysłał model — plan ma
  // pięć dni w stałych miejscach i „dzień 4" musi znaczyć czwarty w kolejności.
  for (const surowyDzien of surowe.slice(0, oczekiwaneDni)) {
    const dzien = dni.length + 1;
    const cwiczenia: CwiczeniePropozycji[] = [];
    const wTymDniu = new Set<string>();

    for (const pozycja of surowyDzien.cwiczenia) {
      if (cwiczenia.length >= MAX_CWICZEN_W_DNIU) {
        uwagi.push(
          `Dzień ${dzien}: w planie mieści się ${MAX_CWICZEN_W_DNIU} pozycji, reszta odcięta.`,
        );
        break;
      }

      // Katalog jest źródłem prawdy. Najpierw po ID, potem po nazwie —
      // model czasem podaje poprawne ćwiczenie z literówką w identyfikatorze.
      const cwiczenie = katalog.poId(String(pozycja?.cwiczenieId ?? ""))
        ?? katalog.poNazwie(String(pozycja?.nazwa ?? ""));
      if (!cwiczenie) {
        uwagi.push(
          `Dzień ${dzien}: „${pozycja?.nazwa ?? pozycja?.cwiczenieId ?? "?"}" nie istnieje w katalogu — pominięte.`,
        );
        continue;
      }

      if (wTymDniu.has(cwiczenie.id)) {
        uwagi.push(`Dzień ${dzien}: „${cwiczenie.nazwa}" powtórzone w tym samym dniu — zostawiam jedno.`);
        continue;
      }
      wTymDniu.add(cwiczenie.id);

      if (pozycja.kategoria !== cwiczenie.kategoria) {
        uwagi.push(
          `„${cwiczenie.nazwa}": model podał kategorię ${pozycja.kategoria}, `
          + `w katalogu jest ${cwiczenie.kategoria} — zostaje katalogowa.`,
        );
      }

      const znaczniki: string[] = [];
      if (poprzednie.has(cwiczenie.id)) znaczniki.push("było w poprzednim cyklu");
      if (!cwiczenie.film) znaczniki.push("bez filmu");
      if (cwiczenie.uwagi?.startsWith("DO WERYFIKACJI") || cwiczenie.uwagi?.startsWith("UZUPEŁNIĆ")) {
        znaczniki.push("do weryfikacji w bazie");
      }
      if (cwiczenie.jednostronne) znaczniki.push("jednostronne");

      const pozycjaWDniu = cwiczenia.length;
      cwiczenia.push({
        lp: LP_SLOTU[pozycjaWDniu] ?? "",
        positionId: `D${dzien}-S${String(pozycjaWDniu + 1).padStart(2, "0")}`,
        cwiczenieId: cwiczenie.id,
        nazwa: cwiczenie.nazwa,
        kategoria: cwiczenie.kategoria,
        powod: String(pozycja?.powod ?? "").trim(),
        znaczniki,
      });
      uzyte.set(cwiczenie.id, (uzyte.get(cwiczenie.id) ?? 0) + 1);
    }

    if (cwiczenia.length === 0) {
      uwagi.push(`Dzień ${dzien} wyszedł pusty — pominięty.`);
      continue;
    }

    dni.push({
      dzien,
      nazwa: String(surowyDzien?.nazwa ?? "").trim().slice(0, 60) || `Dzień ${dzien}`,
      cwiczenia,
    });
  }

  if (dni.length < oczekiwaneDni) {
    uwagi.push(`Wyszło ${dni.length} z ${oczekiwaneDni} zamówionych dni.`);
  }

  for (const [id, ile] of uzyte) {
    if (ile >= 3) {
      uwagi.push(`„${katalog.poId(id)?.nazwa ?? id}" wraca ${ile} razy w tygodniu — sprawdź, czy tak ma być.`);
    }
  }

  // Bilans wzorców liczymy sami, z katalogu — po to, żeby trener widział
  // rozkład, zanim cokolwiek wstawi do planu. Model o niego nie jest pytany.
  const braki = brakujaceWzorce(dni, katalog);
  if (braki.length > 0) {
    uwagi.push(`Bez żadnej pozycji: ${braki.join(", ")}. Sprawdź, czy to celowe.`);
  }

  return {
    dni,
    uzasadnienie: String(surowa?.uzasadnienie ?? "").trim(),
    uwagi,
    sygnal: sygnalZdrowotny(wejscie.notatka),
  };
}

/** Wzorce ruchu, których w propozycji nie ma w ogóle. */
function brakujaceWzorce(dni: readonly DzienPropozycji[], katalog: Katalog): string[] {
  const obecne = new Set(
    dni.flatMap((d) => d.cwiczenia.map((c) => katalog.poId(c.cwiczenieId)?.part)),
  );
  return (Object.keys(NORMY.serie) as (keyof typeof NORMY.serie)[])
    .filter((part) => !obecne.has(part))
    .map((part) => NAZWY_WZORCOW[part]);
}

export type WynikSzkieletu = { propozycja: Propozycja; uzycie: Uzycie };

/** Pyta model o szkielet i oddaje sprawdzoną propozycję. */
export async function zaproponujSzkielet(
  wejscie: WejscieSzkieletu,
  kontekst: KontekstSzkieletu,
  katalog: Katalog = katalogDomyslny,
): Promise<WynikSzkieletu> {
  const odp = await zapytaj({
    system: promptSystemowy(katalog),
    wiadomosc: wiadomosc(wejscie, kontekst, katalog),
    schemat: SCHEMAT_SZKIELETU,
    // Dobór ćwiczeń pod cel, sprzęt i rozkład wzorców to projektowanie,
    // nie przepisywanie — tu warto, żeby model się nastanowił.
    wysilek: "high",
    maxTokens: 8000,
  });
  return {
    propozycja: zlozPropozycje(jako<SurowaPropozycja>(odp), wejscie, kontekst, katalog),
    uzycie: odp.uzycie,
  };
}

/**
 * Sprawdza propozycję, która wróciła z przeglądarki, zanim wejdzie do planu.
 *
 * Trener najpierw ogląda propozycję, potem klika „Wstaw" — a między jednym
 * a drugim ta struktura jest po stronie przeglądarki. Puszczamy ją przez tę samą
 * weryfikację co odpowiedź modelu: ID muszą istnieć w katalogu, kategorie
 * pochodzą z katalogu, liczba pozycji mieści się w dniu.
 */
export function przeliczPropozycje(
  propozycja: Propozycja,
  kontekst: KontekstSzkieletu,
  katalog: Katalog = katalogDomyslny,
): Propozycja {
  const surowa: SurowaPropozycja = {
    dni: (propozycja?.dni ?? []).map((d) => ({
      dzien: d.dzien,
      nazwa: d.nazwa,
      cwiczenia: (d.cwiczenia ?? []).map((c) => ({
        cwiczenieId: c.cwiczenieId,
        nazwa: c.nazwa,
        kategoria: c.kategoria,
        powod: c.powod,
      })),
    })),
    uzasadnienie: propozycja?.uzasadnienie ?? "",
  };
  const wejscie: WejscieSzkieletu = {
    cel: "", staz: "", sprzet: "", notatka: "",
    dniWTygodniu: surowa.dni.length || 1,
  };
  return zlozPropozycje(surowa, wejscie, kontekst, katalog);
}

/** Ile ćwiczeń zniknie z planu, jeśli propozycja zostanie wstawiona. */
export function iluNadpisze(plan: Plan, propozycja: Propozycja): number {
  const dni = new Set(propozycja.dni.map((d) => d.dzien));
  return plan.sloty.filter((s) => dni.has(s.dzien) && s.cwiczenieId).length;
}

/**
 * Wstawia propozycję do planu. Zwraca nowy plan — oryginał zostaje nietknięty.
 *
 * Dzień wymieniamy w całości, razem z parametrami tygodni: serie i RPE należały
 * do poprzednich ćwiczeń, a przeniesione na nowe byłyby cudzymi liczbami pod
 * cudzą nazwą. Dni spoza propozycji nie są ruszane.
 *
 * Czego ta funkcja nie robi: nie ustawia serii, powtórzeń, RPE ani ciężarów.
 * Plan wychodzi z domyślnymi wartościami silnika, dokładnie jak po ręcznym
 * wybraniu ćwiczeń z listy.
 */
export function zastosujPropozycje(plan: Plan, propozycja: Propozycja): Plan {
  const nowy = structuredClone(plan) as Plan;
  const sloty = [...nowy.sloty];

  for (const dzien of propozycja.dni) {
    const wDniu = sloty.filter((s) => s.dzien === dzien.dzien);
    for (const [i, slot] of wDniu.entries()) {
      const pozycja = dzien.cwiczenia[i];
      slot.cwiczenieId = pozycja?.cwiczenieId ?? null;
      slot.kategoriaSzkieletu = pozycja?.kategoria ?? null;
      slot.tygodnie = {};
    }
    if (wDniu.length < dzien.cwiczenia.length) {
      // Nie powinno się zdarzyć — propozycja jest przycięta do MAX_CWICZEN_W_DNIU
      // wcześniej. Zostaje jako asekuracja, gdyby szablon planu się zmienił.
      throw new Error(`Dzień ${dzien.dzien} ma ${wDniu.length} slotów, a propozycja ${dzien.cwiczenia.length}`);
    }
  }

  return { ...nowy, sloty };
}
