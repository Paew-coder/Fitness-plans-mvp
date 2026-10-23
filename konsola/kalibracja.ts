/**
 * 1RM z serii roboczej — kalibracja pierwszym treningiem i zmiana w środku
 * cyklu.
 *
 * Klient ma dwie drogi na start cyklu: zrobić serie maksymalne albo od razu
 * zacząć trening i dobierać ciężar według RPE z planu. Druga droga oszczędza
 * cały trening pomiarowy — ale tylko wtedy, gdy wpisana seria sama zamieni
 * się w 1RM. Inaczej klient przerobiłby cały pierwszy tydzień bez jednej
 * policzonej liczby, czekając, aż trener coś kliknie.
 *
 * Od 17.10.2026 tak samo w środku cyklu. Trener: „jeżeli ktoś wpisze inny
 * ciężar — np. miał zrobić 40 kg × 8, a zrobił 45 kg × 9 — to niech ta seria
 * będzie podstawą do wyliczenia obciążeń do całej reszty planu, a nie tylko
 * do końca tego dnia treningowego”. Dotąd taka seria szła tylko do propozycji
 * 1RM na kolejny cykl.
 *
 * **Dlaczego zapis, a nie propozycja dla trenera.** Serię maksymalną klient
 * i tak może wpisać z telefonu sam — to ta sama władza, tylko inne wejście.
 * Trener widzi przy wpisie, skąd się wziął, i może go nadpisać w każdej chwili.
 */
import { przeliczPlan, type Plan, type SlotWyliczony } from "../silnik/src/plan.ts";
import { oneRMzKalibracji } from "../silnik/src/odczyt-1rm.ts";
import { procent1RM, rozwiaz1RM, type SeriaMaksymalna } from "../silnik/src/rpe.ts";
import { zaokraglij } from "../silnik/src/pomocnicze.ts";

export type SeriaDoKalibracji = {
  positionId: string;
  tydzien: number;
  ciezarWykonany?: number;
  powtorzeniaWykonane?: number;
};

/**
 * Zmiana mniejsza niż 1 % to szum zaokrągleń, nie inna seria. Większa niż
 * 30 % to raczej pomyłka w wpisie (100 zamiast 40) albo inne ćwiczenie niż
 * w planie — taka idzie do propozycji 1RM, o niej decyduje trener.
 */
const ZMIANA_MIN = 0.01;
const ZMIANA_MAX = 0.3;

/**
 * Nowa lista serii maksymalnych albo `null`, gdy ta seria niczego nie zmienia.
 *
 * 1. **Ćwiczenie nie ma 1RM** — slot pokazuje „— brak 1RM". Żadnego innego
 *    komunikatu: „— ustaw ręcznie" znaczy, że ciężar ma przyjść od trenera,
 *    a nazwa progresji (masa ciała, czas…) — że kilogramów tu nie ma wcale.
 *
 * 2. **Inny ciężar niż w planie** (17.10.2026) — 1RM zmienia się tak, żeby
 *    ciężar w planie tego tygodnia był tym, co klient podniósł (przeliczonym
 *    na powtórzenia z planu). Od tego tygodnia do końca planu; minione
 *    tygodnie zostają przy starym 1RM (`wczesniej`). Sam inny wynik powtórzeń
 *    przy ciężarze z planu niczego nie zmienia — od tego jest ocena.
 *
 * 3. **Poprawka z tego samego treningu** — wpis z kalibracji albo zmiany
 *    w tym samym miejscu i tygodniu. Pierwsza seria bywa na próbę; każda
 *    kolejna poprawia wynik (ekran prowadzenia wysyła najcięższą).
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
  // Dwubój (16.10.2026) nie liczy 1RM z serii roboczej — jego RPE to tylko
  // odpowiednik procentu. Bez 1RM klient wpisuje próbę pojedynczego.
  if (slot.dwuboj) return null;
  const id = slot.cwiczenie.id;

  const wpisy = plan.serieMaksymalne.filter((s) => s.cwiczenieId === id);
  const pozostale = plan.serieMaksymalne.filter((s) => s.cwiczenieId !== id);
  const k = wpisy.length === 1 ? wpisy[0]!.kalibracja : undefined;
  const poprawka = k?.positionId === seria.positionId && k.tydzien === seria.tydzien;

  if (poprawka && k.oneRMPrzed !== undefined && k.ciezarPlanu !== undefined) {
    const wpis = zmiana(slot, seria, ciezar, powtorzenia, k.oneRMPrzed, k.ciezarPlanu, data,
      wpisy[0]!.wczesniej, k.pierwotne);
    return wpis ? [...pozostale, wpis] : null;
  }

  if (slot.ciezar === "— brak 1RM" || poprawka) {
    const oneRM = oneRMzKalibracji(ciezar, powtorzenia, slot.rpe);
    if (oneRM === null) return null;
    return [
      ...pozostale,
      {
        cwiczenieId: id,
        // `1RM × 1` — jedno powtórzenie do odmowy to 100 % 1RM, więc wpis znaczy
        // dokładnie „tyle wynosi 1RM". Ta sama postać, w której trener przyjmuje
        // propozycję; arkusz i silnik czytają ją bez żadnego wyjątku.
        ciezar: oneRM,
        powtorzenia: 1,
        kalibracja: {
          ciezar, powtorzenia, rpe: slot.rpe,
          tydzien: seria.tydzien, dzien: slot.dzien, positionId: seria.positionId, data,
        },
      },
    ];
  }

  // ── zmiana w środku cyklu ──────────────────────────────────────────
  // Tylko ciężar liczony z 1RM: bez wpisu trenera na sztywno, bez ciężaru
  // ręcznego niesionego z tygodnia do tygodnia, w cyklu (nie deload, nie maksy).
  if (seria.tydzien > 6 || typeof slot.ciezar !== "number" || ciezar === slot.ciezar) return null;
  if (slot.ciezarNadpisany || slot.ciezarZrodlo) return null;
  // Seria z tygodnia wcześniejszego niż ostatnia zmiana (klient uzupełnia
  // zaległy trening) nie cofa nowszej.
  if (wpisy.some((s) => (s.kalibracja?.tydzien ?? 0) > seria.tydzien && s.kalibracja?.oneRMPrzed)) {
    return null;
  }
  const oneRMPrzed = rozwiaz1RM(id, wpisy, seria.tydzien);
  if (!(oneRMPrzed > 0) || !zalezyOd1RM(plan, slot, seria.tydzien, oneRMPrzed)) return null;

  // Tygodnie przed tą serią — 1RM, które w nich obowiązywało, odcinkami.
  const wczesniej: { doTygodnia: number; oneRM: number }[] = [];
  for (let t = 1; t < seria.tydzien; t++) {
    const w = rozwiaz1RM(id, wpisy, t);
    const ostatni = wczesniej.at(-1);
    if (ostatni && ostatni.oneRM === w) ostatni.doTygodnia = t;
    else wczesniej.push({ doTygodnia: t, oneRM: w });
  }
  // Serie sprzed pierwszej zmiany — do „Resetuj plan”.
  const pierwotne = wpisy.flatMap((s) => s.kalibracja
    ? [...(s.kalibracja.pierwotne ?? [])]
    : [s]);

  const wpis = zmiana(slot, seria, ciezar, powtorzenia, oneRMPrzed, slot.ciezar, data,
    wczesniej, pierwotne);
  return wpis ? [...pozostale, wpis] : null;
}

/**
 * 1RM po zmianie: ciężar, który klient zrobiłby na powtórzenia z planu
 * (przy RPE z planu), do ciężaru z planu — w tej proporcji zmienia się 1RM.
 * 40 kg × 8 w planie, 45 kg × 9 zrobione → 1RM w górę o ok. 17 %.
 */
function zmiana(
  slot: SlotWyliczony, seria: SeriaDoKalibracji, ciezar: number, powtorzenia: number,
  oneRMPrzed: number, ciezarPlanu: number, data: string,
  wczesniej: readonly { doTygodnia: number; oneRM: number }[] | undefined,
  pierwotne: readonly SeriaMaksymalna[] | undefined,
): SeriaMaksymalna | null {
  const naPlan = procent1RM(slot.powtorzenia, slot.rpe);
  const zrobione = procent1RM(powtorzenia, slot.rpe);
  if (!naPlan || !zrobione || !(ciezarPlanu > 0)) return null;
  const proporcja = (ciezar * naPlan / zrobione) / ciezarPlanu;
  if (Math.abs(proporcja - 1) > ZMIANA_MAX) return null;
  const oneRM = Math.abs(proporcja - 1) < ZMIANA_MIN ? oneRMPrzed : zaokraglij(oneRMPrzed * proporcja, 1);
  return {
    cwiczenieId: slot.cwiczenie!.id,
    ciezar: oneRM,
    powtorzenia: 1,
    kalibracja: {
      ciezar, powtorzenia, rpe: slot.rpe,
      tydzien: seria.tydzien, dzien: slot.dzien, positionId: seria.positionId, data,
      oneRMPrzed, ciezarPlanu,
      ...(pierwotne?.length ? { pierwotne } : {}),
    },
    ...(wczesniej?.length ? { wczesniej } : {}),
  };
}

/**
 * Czy ciężar w tym miejscu w ogóle bierze się z 1RM ćwiczenia. Nie zawsze:
 * podmienione w środku bloku liczy z 1RM wpisanego przez trenera przy
 * podmianie. Najprościej sprawdzić wprost — przy dwa razy większym 1RM
 * ciężar musi się zmienić.
 */
function zalezyOd1RM(plan: Plan, slot: SlotWyliczony, tydzien: number, oneRM: number): boolean {
  const id = slot.cwiczenie!.id;
  const proba = przeliczPlan({
    ...plan,
    serieMaksymalne: [
      ...plan.serieMaksymalne.filter((s) => s.cwiczenieId !== id),
      { cwiczenieId: id, ciezar: oneRM * 2, powtorzenia: 1 },
    ],
  });
  const poProbie = proba.tygodnie[tydzien - 1]?.sloty.find((s) => s.positionId === slot.positionId);
  return typeof poProbie?.ciezar === "number" && poProbie.ciezar !== slot.ciezar;
}
