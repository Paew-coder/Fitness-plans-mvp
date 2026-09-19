#!/usr/bin/env node
/**
 * Skala — czy konsola nadąża przy pełnej książce klientów.
 *
 *   npm run sprawdz-skale
 *
 * Wszystkie pozostałe kontrole chodzą po jednym albo dwóch planach. Tymczasem
 * kilka miejsc w konsoli **przelicza plany w pętli**: lista klientów, panel
 * „wymaga uwagi" i lista cykli. Każde z nich woła silnik raz na plan, więc
 * koszt rośnie razem z książką — a to jest ten rodzaj rzeczy, którego nie widać
 * przy dwóch klientach na testach i widać dopiero po roku pracy.
 *
 * Czterdziestu klientów po sześć cykli to pełna książka jednego trenera —
 * 240 planów, każdy po czternaście pozycji na sześć tygodni.
 *
 * Progi są **hojne**. Nie chodzi o milisekundy, tylko o wychwycenie zmiany
 * rzędu wielkości: zapytania w pętli, przeliczania całego cyklu tam, gdzie
 * potrzebna jest jedna liczba, wczytywania wszystkich planów po to, żeby
 * pokazać ich nazwy.
 */
import { doliczBledy, podsumuj, sprawdz, zSerwerem, type Srodowisko }
  from "./przegladarka.ts";

const PORT = 4200;
const KLIENTOW = 40;
const CYKLI = 6;

/** Ile najdłużej może trwać odpowiedź, zanim uznamy to za zmianę rzędu wielkości. */
const PROGI = {
  "/api/klienci": 1500,
  "/api/uwaga": 1500,
  "/api/plany": 1500,
  kartoteka: 800,
  plan: 800,
} as const;

const dniTemu = (ile: number) =>
  new Date(Date.now() - ile * 86_400_000).toISOString().slice(0, 10);

async function zasiej({ api }: Srodowisko): Promise<void> {
  const cwiczenia = await api("/api/cwiczenia");
  const wgKategorii = new Map<string, string[]>();
  for (const c of cwiczenia) {
    wgKategorii.set(c.kategoria, [...(wgKategorii.get(c.kategoria) ?? []), c.id]);
  }
  const uklad = ["Lower push", "Upper pull horizontal", "Core", "Bicep", "Tricep",
    "Upper push horizontal", "Lower pull", "Upper pull vertical", "Core",
    "Upper push vertical", "Lower push", "Upper pull horizontal", "Bicep", "Core"];

  for (let k = 0; k < KLIENTOW; k++) {
    const nazwa = `Klient ${String(k + 1).padStart(2, "0")}`;
    let poprzedni = "";
    for (let c = 0; c < CYKLI; c++) {
      const o = c === 0
        ? await api("/api/plany", "POST", { klient: nazwa, wersja: 1 })
        : await api(`/api/plany/${poprzedni}/kopia`, "POST", { wersja: c + 1 });
      const plan = o.zapisany.plan;

      if (c === 0) {
        // Każdy klient dostaje inny zestaw — inaczej mierzylibyśmy pracę
        // z jednym planem powielonym czterdzieści razy.
        const wybrane = uklad.map((kat, i) => {
          const lista = wgKategorii.get(kat)!;
          return lista[(k + i) % lista.length]!;
        });
        wybrane.forEach((id, i) => { plan.sloty[i].cwiczenieId = id; });
        plan.serieMaksymalne = [...new Set(wybrane)].map((id, i) => ({
          cwiczenieId: id, ciezar: 60 + 3 * i, powtorzenia: 3 + (i % 5),
        }));
      }

      // Rozrzut dat startu, żeby panel uwagi miał realny materiał: większość
      // w trakcie cyklu, kilku pod koniec, paru zaległych.
      const dni = [3, 7, 10, 14, 18, 21, 25, 28, 31, 35, 38, 41, 44, 50][(k * 3 + c) % 14]!;
      await api(`/api/plany/${o.zapisany.id}`, "PUT", {
        plan, dataStartu: dniTemu(dni), status: "wysłany",
      });
      await api(`/api/plany/${o.zapisany.id}/tygodnie`, "POST", { tryb: "progresja", zrodlo: 1 });
      poprzedni = o.zapisany.id;
    }
    await api(`/api/plany/${poprzedni}/link`, "POST");
  }
}

/** Mediana z kilku pomiarów — jeden bywa przypadkowy. */
async function zmierz(adres: string, sciezka: string, ile = 5): Promise<number> {
  const czasy: number[] = [];
  for (let i = 0; i < ile; i++) {
    const start = performance.now();
    await (await fetch(`${adres}${sciezka}`)).json();
    czasy.push(performance.now() - start);
  }
  return czasy.sort((a, b) => a - b)[Math.floor(czasy.length / 2)]!;
}

await zSerwerem(PORT, async (srodowisko) => {
  const { adres, api } = srodowisko;
  console.log(`\n  Zasiewam ${KLIENTOW} klientów po ${CYKLI} cykli — ${KLIENTOW * CYKLI} planów…\n`);
  const start = performance.now();
  await zasiej(srodowisko);
  console.log(`  gotowe w ${Math.round((performance.now() - start) / 1000)} s\n`);

  const klienci = await api("/api/klienci");
  sprawdz("wszyscy klienci są w bazie", klienci.length === KLIENTOW, `${klienci.length}`);
  sprawdz("każdy ma komplet cykli",
    klienci.every((k: any) => k.cykli === CYKLI),
    `min ${Math.min(...klienci.map((k: any) => k.cykli))}`);

  for (const [sciezka, prog] of [
    ["/api/klienci", PROGI["/api/klienci"]],
    ["/api/uwaga", PROGI["/api/uwaga"]],
    ["/api/plany", PROGI["/api/plany"]],
    ["/api/klienci/klient-01", PROGI.kartoteka],
    [`/api/plany/klient-01-${CYKLI}`, PROGI.plan],
  ] as [string, number][]) {
    const ms = await zmierz(adres, sciezka);
    sprawdz(`${sciezka} odpowiada w rozsądnym czasie`, ms < prog,
      `${Math.round(ms)} ms (próg ${prog})`);
  }

  /**
   * Panel „wymaga uwagi" ma milczeć o tych, o których nie ma co mówić.
   * Przy pełnej książce i realnym rozrzucie dat wywołuje kilkunastu — gdyby
   * wołał wszystkich, byłby tym samym co panel wyłączony.
   */
  const uwaga = await api("/api/uwaga");
  sprawdz("panel uwagi wybiera, a nie woła wszystkich",
    uwaga.length > 0 && uwaga.length < KLIENTOW / 2,
    `${uwaga.length} z ${KLIENTOW} klientów`);

  const kolejnosc = uwaga.map((w: any) => w.powody[0].rodzaj);
  // Ta sama kolejność, co w serwerze: najpierw ci, którzy zniknęli.
  // Powód spoza listy ląduje na końcu, a nie przed wszystkimi.
  const KOLEJNOSC = ["stanal", "nie zaczal", "bez linku", "po cyklu", "koniec cyklu"];
  const waga = (r: string) => {
    const i = KOLEJNOSC.indexOf(r);
    return i === -1 ? KOLEJNOSC.length : i;
  };
  sprawdz("pilniejsze powody stoją wyżej",
    kolejnosc.every((r: string, i: number) =>
      i === 0 || waga(kolejnosc[i - 1]!) <= waga(r)),
    [...new Set(kolejnosc)].join(" → "));

  doliczBledy(0);
});

podsumuj("konsola nadąża przy pełnej książce klientów");
