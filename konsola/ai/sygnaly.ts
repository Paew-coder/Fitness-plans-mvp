/**
 * Wykrywanie sygnałów zdrowotnych w tekście, który trener wpisuje do asystenta.
 *
 * Dlaczego nie zostawić tego modelowi: bo model może przeoczyć, a to jest
 * dokładnie ta jedna rzecz, której przeoczyć nie wolno. Zasada z `CLAUDE.md`
 * brzmi „sygnał bólu / przeciwwskazania → oznaczenie i propozycja konsultacji,
 * nigdy decyzja". Deterministyczna lista słów robi to zawsze i tak samo,
 * niezależnie od tego, co model uzna za istotne.
 *
 * To jest **flaga, nie diagnoza**. Nie blokuje niczego i niczego nie zapisuje —
 * podnosi widoczny komunikat nad propozycją i przypomina, czyja jest decyzja.
 */

/**
 * Rdzenie słów, po których poznajemy, że w notatce jest zdrowie, a nie trening.
 * Dopasowanie po początku wyrazu, więc „bólu", „bolało", „kontuzji" wpadają,
 * a przypadkowe zbitki wewnątrz innych słów — nie.
 */
export const RDZENIE: readonly string[] = [
  "bol", "bolesn", "piecze", "przeszywa",
  "kontuzj", "uraz", "naciagn", "nadwyrez", "zerwan", "naderwan",
  "zlaman", "skrecen", "zwichn", "przemieszcz",
  "dyskopati", "przepuklin", "kregoslup", "rwa", "kulszow", "korzeniow",
  "zapaln", "zapalen", "obrzek", "opuchli",
  "operacj", "zabieg", "endoprotez", "artroskopi",
  "rehabilitacj", "fizjoterapi", "fizjoterapeut", "ortoped", "lekarz", "lekarsk",
  "przeciwwskaz", "diagnoz", "rezonans", "usg", "rtg",
  "dretwi", "mrowi", "niestabilnos", "blokad", "sztywnos",
  "ciaz", "polog",
];

/** Zamienia tekst na formę do porównania: małe litery, bez polskich znaków. */
function uprosc(tekst: string): string {
  return tekst
    .toLocaleLowerCase("pl")
    .replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e").replace(/ł/g, "l")
    .replace(/ń/g, "n").replace(/ó/g, "o").replace(/ś/g, "s")
    .replace(/ż/g, "z").replace(/ź/g, "z");
}

export type SygnalZdrowotny = {
  wykryty: boolean;
  /** Słowa z tekstu, które wywołały sygnał — żeby trener widział, co go podniosło. */
  slowa: string[];
};

/** Czy w tekście jest coś, co należy do gabinetu, a nie do arkusza planu. */
export function sygnalZdrowotny(tekst: string | null | undefined): SygnalZdrowotny {
  if (!tekst?.trim()) return { wykryty: false, slowa: [] };

  const wyrazy = uprosc(tekst).split(/[^a-z0-9]+/).filter(Boolean);
  const trafione = new Set<string>();

  for (const [i, wyraz] of wyrazy.entries()) {
    if (RDZENIE.some((rdzen) => wyraz.startsWith(rdzen))) {
      // Pokazujemy wyraz razem z sąsiadem, bo samo „ból" nic nie mówi,
      // a „ból barku" mówi trenerowi wszystko, czego potrzebuje.
      trafione.add([wyraz, wyrazy[i + 1]].filter(Boolean).join(" "));
    }
  }

  return { wykryty: trafione.size > 0, slowa: [...trafione] };
}

/** Komunikat pokazywany, gdy sygnał się pojawi. Ten sam tekst w konsoli i w API. */
export const KOMUNIKAT_ZDROWOTNY =
  "W notatce jest sygnał zdrowotny (ból, kontuzja, leczenie). Program go nie ocenia "
  + "i model też nie — propozycja poniżej jest wyłącznie doborem ćwiczeń. Decyzja, "
  + "czy i jak trenować, należy do Ciebie; przy wątpliwości — konsultacja "
  + "z lekarzem albo fizjoterapeutą.";

/**
 * Zdanie doklejane do promptu, gdy sygnał się pojawi.
 *
 * Model dostaje je jako polecenie, ale bezpieczeństwo nie stoi na tym, że je
 * wykona — stoi na tym, że komunikat wyżej pokazuje się niezależnie od modelu.
 */
export const INSTRUKCJA_ZDROWOTNA =
  "UWAGA: w notatce trenera jest sygnał zdrowotny. Nie diagnozuj, nie proponuj "
  + "leczenia i nie rozstrzygaj, czy dana pozycja jest bezpieczna. Dobierz ćwiczenia "
  + "ostrożnie, w uzasadnieniu napisz wprost, czego unikałeś i dlaczego, i zaznacz, "
  + "że decyzja należy do trenera.";
