import type { Uwaga } from "./typy.ts";
import { Katalog, katalog as katalogDomyslny } from "./katalog.ts";
import { konfliktSeriiMaksymalnych } from "./rpe.ts";
import { POWT_MAX } from "./rpe.ts";
import type { Plan, PlanWyliczony } from "./plan.ts";

/**
 * Port 11 kontroli danych z zakładki Analiza, plus jedna, której arkusz mieć nie może:
 * powtórka ćwiczenia z poprzedniego cyklu klienta.
 *
 * Błąd blokuje wysyłkę planu. Ostrzeżenie wymaga świadomego potwierdzenia.
 */
export function sprawdzPlan(
  plan: Plan,
  wynik: PlanWyliczony,
  opcje: { katalog?: Katalog; cwiczeniaZPoprzedniegoCyklu?: readonly string[] } = {},
): Uwaga[] {
  const katalog = opcje.katalog ?? katalogDomyslny;
  const uwagi: Uwaga[] = [];
  const dodaj = (kod: string, poziom: Uwaga["poziom"], opis: string, pozycje: string[]) => {
    if (pozycje.length > 0 || poziom === "info") uwagi.push({ kod, poziom, opis, pozycje });
  };

  const t1 = wynik.tygodnie[0];
  const zCwiczeniem = t1.sloty.filter((s) => s.cwiczenie);

  dodaj("SLOTY_Z_CWICZENIEM", "info", "Sloty z ćwiczeniem", [String(zCwiczeniem.length)]);
  dodaj("SERIE_MAX_UZUPELNIONE", "info", "Serie maksymalne uzupełnione", [
    String(plan.serieMaksymalne.length),
  ]);
  dodaj("DNI_TRENINGOWE", "info", "Dni treningowe w planie", [String(wynik.dniTreningowe)]);

  // Arkusz nie potrzebował tej kontroli: plik z planem zawsze miał treść, bo
  // powstawał przez wypełnianie. W aplikacji pusty plan da się utworzyć jednym
  // kliknięciem i — odkąd „wysłany" znaczy „widoczny dla klienta" — dałoby się
  // go wysłać. Klient zobaczyłby pusty ekran.
  dodaj(
    "PLAN_PUSTY",
    "blad",
    "Plan nie ma ani jednego ćwiczenia",
    zCwiczeniem.length === 0 ? ["cały plan"] : [],
  );

  dodaj(
    "SLOT_PUSTY_MIMO_SZKIELETU",
    "blad",
    "Slot ma wpisaną kategorię, ale nie ma ćwiczenia",
    plan.sloty.filter((s) => s.kategoriaSzkieletu && !s.cwiczenieId).map((s) => s.positionId),
  );

  dodaj(
    "NIEZGODNY_ZE_SZKIELETEM",
    "ostrzezenie",
    "Kategoria ćwiczenia nie zgadza się ze szkieletem",
    plan.sloty
      .filter((s) => {
        if (!s.cwiczenieId || !s.kategoriaSzkieletu) return false;
        return katalog.poId(s.cwiczenieId)?.kategoria !== s.kategoriaSzkieletu;
      })
      .map((s) => s.positionId),
  );

  dodaj(
    "BEZ_FILMU",
    "ostrzezenie",
    "Ćwiczenie bez nagrania",
    zCwiczeniem.filter((s) => !s.cwiczenie!.film).map((s) => `${s.positionId} ${s.cwiczenie!.nazwa}`),
  );

  dodaj(
    "DO_WERYFIKACJI",
    "ostrzezenie",
    "Pozycja BAZY oznaczona DO WERYFIKACJI",
    zCwiczeniem
      .filter((s) => s.cwiczenie!.uwagi?.startsWith("DO WERYFIKACJI"))
      .map((s) => `${s.positionId} ${s.cwiczenie!.nazwa}`),
  );

  dodaj(
    "BRAK_1RM",
    "blad",
    "Brak serii maksymalnej — nie da się policzyć ciężaru",
    t1.sloty.filter((s) => s.ciezar === "— brak 1RM").map((s) => `${s.positionId} ${s.cwiczenie?.nazwa ?? ""}`),
  );

  dodaj(
    "USTAW_RECZNIE",
    "blad",
    "Podmienione ćwiczenie bez 1RM w T2–T6",
    wynik.tygodnie
      .slice(1)
      .flatMap((t) =>
        t.sloty
          .filter((s) => s.ciezar === "— ustaw ręcznie")
          .map((s) => `T${t.tydzien} ${s.positionId}`),
      ),
  );

  dodaj(
    "POWT_POZA_TABELA",
    "blad",
    `Powtórzenia poza tabelą (>${POWT_MAX})`,
    wynik.tygodnie.flatMap((t) =>
      t.sloty
        .filter((s) => s.cwiczenie && s.powtorzenia > POWT_MAX)
        .map((s) => `T${t.tydzien} ${s.positionId}`),
    ),
  );

  dodaj(
    "KONFLIKT_SERII_MAX",
    "ostrzezenie",
    "Dwie serie maksymalne dają różny 1RM dla tego samego ćwiczenia",
    konfliktSeriiMaksymalnych(plan.serieMaksymalne),
  );

  const poprzednie = new Set(opcje.cwiczeniaZPoprzedniegoCyklu ?? []);
  dodaj(
    "POWTORKA_Z_POPRZEDNIEGO",
    "ostrzezenie",
    "Ćwiczenie było już w poprzednim cyklu tego klienta",
    zCwiczeniem
      .filter((s) => poprzednie.has(s.cwiczenie!.id))
      .map((s) => `${s.positionId} ${s.cwiczenie!.nazwa}`),
  );

  return uwagi;
}

/** Czy plan da się wysłać klientowi — brak otwartych błędów. */
export function planGotowyDoWyslania(uwagi: readonly Uwaga[]): boolean {
  return !uwagi.some((u) => u.poziom === "blad");
}
