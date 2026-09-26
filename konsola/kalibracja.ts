/**
 * Kalibracja pierwszym treningiem — 1RM z serii roboczej, gdy serii
 * maksymalnej nie było.
 *
 * Klient ma dwie drogi na start cyklu: zrobić serie maksymalne albo od razu
 * zacząć trening i dobierać ciężar według RPE z planu. Druga droga oszczędza
 * cały trening pomiarowy — ale tylko wtedy, gdy wpisana seria sama zamieni
 * się w 1RM. Inaczej klient przerobiłby cały pierwszy tydzień bez jednej
 * policzonej liczby, czekając, aż trener coś kliknie.
 *
 * **Dlaczego zapis, a nie propozycja dla trenera.** Serie robocze w środku
 * cyklu idą do trenera jako propozycja — bo zmieniają 1RM, które już jest,
 * a to jest decyzja trenera. Tu 1RM **nie ma wcale**, a serię maksymalną
 * klient i tak może wpisać z telefonu sam. Kalibracja to ta sama władza,
 * tylko inne wejście. Trener widzi przy wpisie, skąd się wziął, i może go
 * nadpisać w każdej chwili.
 */
import { przeliczPlan, type Plan } from "../silnik/src/plan.ts";
import { oneRMzKalibracji } from "../silnik/src/odczyt-1rm.ts";
import type { SeriaMaksymalna } from "../silnik/src/rpe.ts";

export type SeriaDoKalibracji = {
  positionId: string;
  tydzien: number;
  ciezarWykonany?: number;
  powtorzeniaWykonane?: number;
};

/**
 * Nowa lista serii maksymalnych albo `null`, gdy ta seria niczego nie kalibruje.
 *
 * Kalibruje w dwóch przypadkach:
 *
 * 1. **Ćwiczenie nie ma 1RM** — slot pokazuje „— brak 1RM". Żadnego innego
 *    komunikatu: „— ustaw ręcznie" znaczy, że ciężar ma przyjść od trenera,
 *    a nazwa progresji (masa ciała, czas…) — że kilogramów tu nie ma wcale.
 *
 * 2. **1RM pochodzi z kalibracji w tym samym miejscu i tym samym tygodniu.**
 *    Klient robi kilka serii i pierwsza bywa na próbę — za lekka albo za
 *    ciężka. Każda kolejna seria z tego treningu poprawia kalibrację (ekran
 *    prowadzenia wysyła najcięższą). Kalibracja z innego tygodnia albo
 *    z innego dnia jest już zamknięta: tam dalsze serie idą do propozycji
 *    dla trenera, jak każde inne.
 *
 * Prawdziwa seria maksymalna zawsze wygrywa — wpisana z telefonu czy
 * z konsoli zastępuje wpis kalibracji tego ćwiczenia w całości.
 */
export function skalibruj(
  plan: Plan,
  seria: SeriaDoKalibracji,
  data: string,
): SeriaMaksymalna[] | null {
  const { ciezarWykonany: ciezar, powtorzeniaWykonane: powtorzenia } = seria;
  if (!ciezar || !powtorzenia) return null;

  const wynik = przeliczPlan(plan);
  const slot = wynik.tygodnie[seria.tydzien - 1]?.sloty
    .find((s) => s.positionId === seria.positionId);
  if (!slot?.cwiczenie || !(slot.rpe > 0)) return null;
  const id = slot.cwiczenie.id;

  const wpisy = plan.serieMaksymalne.filter((s) => s.cwiczenieId === id);
  const brak1RM = slot.ciezar === "— brak 1RM";
  const doprecyzowanie = wpisy.length === 1
    && wpisy[0]!.kalibracja?.positionId === seria.positionId
    && wpisy[0]!.kalibracja.tydzien === seria.tydzien;
  if (!brak1RM && !doprecyzowanie) return null;

  const oneRM = oneRMzKalibracji(ciezar, powtorzenia, slot.rpe);
  if (oneRM === null) return null;

  return [
    ...plan.serieMaksymalne.filter((s) => s.cwiczenieId !== id),
    {
      cwiczenieId: id,
      // `1RM × 1` — jedno powtórzenie do odmowy to 100 % 1RM, więc wpis znaczy
      // dokładnie „tyle wynosi 1RM". Ta sama postać, w której trener przyjmuje
      // propozycję; arkusz i silnik czytają ją bez żadnego wyjątku.
      ciezar: oneRM,
      powtorzenia: 1,
      kalibracja: {
        ciezar,
        powtorzenia,
        rpe: slot.rpe,
        tydzien: seria.tydzien,
        dzien: slot.dzien,
        positionId: seria.positionId,
        data,
      },
    },
  ];
}
