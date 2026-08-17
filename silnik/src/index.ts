/**
 * Silnik CraftMyPlan — jądro obliczeniowe przeniesione z MasterTemplate 5.17.
 *
 * Wszystko tutaj to funkcje czyste: te same wejścia dają ten sam wynik,
 * bez zapytań do bazy, dat i losowości. To warunek, żeby dało się je
 * przetestować co do grosza przeciwko arkuszowi.
 */

export * from "./typy.ts";
export * from "./pomocnicze.ts";
export * from "./rpe.ts";
export * from "./odczyt-1rm.ts";
export * from "./adaptacja.ts";
export * from "./powtorzenia.ts";
export * from "./ciezar.ts";
export * from "./stres.ts";
export * from "./katalog.ts";
export * from "./porownanie-cykli.ts";
export * from "./oddech.ts";
export * from "./bieg.ts";
export * from "./plan.ts";
export * from "./walidacja.ts";
export { TABELA_RPE, TABELA_STRES_CALKOWITY, TABELA_STRES_CENTRALNY, TABELA_STRES_OBWODOWY } from "./dane/tabele.ts";
export { BAZA_CWICZEN } from "./dane/cwiczenia.ts";
