/**
 * Przy których ćwiczeniach seria maksymalna ma sens — i co powiedzieć, gdy nie ma.
 *
 * Z serii maksymalnej wychodzi 1RM, a z 1RM ciężary na sześć tygodni. Ale nie
 * każde ćwiczenie w BAZIE tą drogą chodzi: 25 pozycji ze 165 liczy się inaczej
 * albo wcale.
 *
 * Skąd to się wzięło. Trener wpisał serię maksymalną przy „SLDL balance"
 * i przy „Dead bug izo + OH", a w kolumnie ciężaru zobaczył „ręczne ustawienie"
 * i „masa ciała". Z jego strony wyglądało to jak awaria: wpisałem liczby,
 * aplikacja je zignorowała. Naprawdę wszystko działało zgodnie z arkuszem —
 * tylko nikt nigdzie nie napisał, że przy tych ćwiczeniach nie ma czego liczyć.
 *
 * **Cisza jest tu gorsza niż błąd.** Błąd widać; brak wyjaśnienia wygląda jak
 * zepsuta aplikacja i kosztuje kwadrans szukania winy w sobie.
 */
import type { Progresja } from "./typy.ts";

/**
 * Zdanie po polsku albo `null`, gdy seria maksymalna jest na miejscu.
 *
 * Mówi, **dlaczego** jej nie ma — nie co zrobić. Co zrobić, dopowiada każdy
 * ekran osobno, bo trener i klient mają w tym miejscu różne możliwości:
 * trener wpisze ciężar ręcznie, klient nie ma gdzie.
 */
export function dlaczegoBezSeriiMaksymalnej(progresja: Progresja): string | null {
  switch (progresja) {
    case "masa ciała":
      return "Ćwiczenie na masie ciała — nie ma czego zmierzyć ani dołożyć.";
    case "czas":
      return "Ćwiczenie na czas — liczy się utrzymanie pozycji, nie kilogramy.";
    case "dystans":
      return "Ćwiczenie na dystans — liczy się odległość, nie kilogramy.";
    case "ręczne ustawienie":
      return "Ciężar do tego ćwiczenia ustala się wprost, nie z 1RM.";
    default:
      return null;
  }
}

/** Czy przy tym ćwiczeniu para „ciężar × powtórzenia" da cokolwiek policzyć. */
export function seriaMaksymalnaMaSens(progresja: Progresja): boolean {
  return dlaczegoBezSeriiMaksymalnej(progresja) === null;
}
