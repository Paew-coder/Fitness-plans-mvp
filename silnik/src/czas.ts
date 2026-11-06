/**
 * Ćwiczenia na czas — sekundy zamiast powtórzeń (27.10.2026).
 *
 * Trener (przy „Wall drill calf izo hold s/l”): „w ćwiczeniach tego typu
 * powinienem mieć możliwość wpisania konkretnego czasu, a klient — ilości
 * sekund, jakie udało mu się utrzymać. Przyciski za łatwe / za trudne powinny
 * też dostosowywać czas: jeżeli czas utrzymania to np. 5 sekund, »za trudne«
 * zmienia go na 4 sekundy, bo 5 to i tak mało, ale jeżeli było 45 sekund —
 * na 40. Wartość skaluje się z tym, jak duża będzie zmiana”.
 *
 * Przy progresji „czas” liczba w kolumnie powtórzeń to **sekundy** — w planie,
 * na telefonie i we wpisach klienta. Stres liczy się z niej jak dotąd
 * (tabela kończy się na 15, dłuższe utrzymanie liczy się jak 15).
 */
import type { Progresja } from "./typy.ts";

/** Najdłuższe utrzymanie, jakie przyjmujemy — 10 minut. */
export const CZAS_MAKS_S = 600;

/** Kroki „okrągłe” w sekundach — od najmniejszego. */
const KROKI_S = [1, 2, 5, 10, 15, 30, 60] as const;

/** Czy liczba w kolumnie powtórzeń to sekundy. */
export const naCzas = (progresja: Progresja | null | undefined): boolean => progresja === "czas";

/**
 * Krok jednej oceny przy danym czasie: najmniejszy okrągły krok, który ma
 * co najmniej 10 % czasu — 5 s → 1 s, 20 s → 2 s, 45 s → 5 s, 90 s → 10 s.
 */
export function krokCzasu(sekundy: number): number {
  const dziesiec = Math.max(sekundy, 1) * 0.1;
  return KROKI_S.find((k) => k >= dziesiec) ?? KROKI_S.at(-1)!;
}

/**
 * Czas po ocenach: `korekta` kroków w dół (za trudne, ujemna) albo w górę.
 * Każdy krok liczony od czasu po poprzednim — 45 s, dwa razy „za trudne”:
 * 40 s, potem 35 s. Najmniej sekunda, najwyżej `CZAS_MAKS_S`.
 */
export function czasPoOcenie(sekundy: number, korekta: number): number {
  let wynik = sekundy;
  for (let i = 0; i < Math.abs(korekta); i++) {
    wynik += Math.sign(korekta) * krokCzasu(wynik);
  }
  return Math.min(CZAS_MAKS_S, Math.max(1, Math.round(wynik)));
}
