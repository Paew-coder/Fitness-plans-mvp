#!/usr/bin/env node
/**
 * Odporność API — każdy adres zapytany źle.
 *
 *   npm run sprawdz-odpornosc
 *
 * Kategoria, której przez cały projekt nie ruszałem: **adresy, których nikt
 * normalnie nie wpisuje**. Przeglądy klikane chodzą po tym, co aplikacja
 * generuje sama, więc z definicji nie trafiają w żądanie zniekształcone,
 * obcięte albo wysłane w złej kolejności.
 *
 * Wyszedł z tej kategorii najpoważniejszy błąd całego projektu: zwykłe
 * `GET /klient/` kładło proces konsoli — bez hasła, jednym żądaniem.
 * To narzędzie chodzi po całej powierzchni API i pilnuje trzech rzeczy:
 *
 *   1. serwer **zawsze odpowiada** — brak odpowiedzi znaczy, że go już nie ma;
 *   2. na złe wejście odpowiada **4xx, nie 5xx** — 500 to błąd po naszej
 *      stronie, a nie odmowa;
 *   3. w treści błędu **nie ma śladów wnętrza** — ścieżek na dysku, nazw
 *      plików źródłowych ani zrzutów stosu.
 *
 * Zły odczyt tego, co przyszło z sieci, jest zwykłym błędem. Zły odczyt, po
 * którym konsola znika, jest awarią wszystkich klientów naraz.
 */
import { doliczBledy, podsumuj, sprawdz, zSerwerem, type Srodowisko }
  from "./przegladarka.ts";

const PORT = 4198;
const PLAN = "odpornosc-test-1";

type Proba = {
  opis: string; sciezka: string; metoda?: string; cialo?: string; typ?: string;
  /** Żądanie, które serwer ma **odrzucić**, a nie tylko przeżyć. */
  musiOdmowic?: true;
};

/** Wejścia, które psują parsery: puste, obcięte, złego typu, absurdalnie duże. */
function proby(token: string): Proba[] {
  const jsonowe = (sciezka: string, ciala: [string, string][]): Proba[] =>
    ciala.map(([opis, cialo]) => ({ opis: `${sciezka} — ${opis}`, sciezka, metoda: "POST", cialo }));

  const paskudne: [string, string][] = [
    ["puste ciało", ""],
    ["obcięty JSON", '{"klient": "Ala'],
    ["nie JSON", "to nie jest json"],
    ["tablica zamiast obiektu", "[1,2,3]"],
    ["null", "null"],
    ["liczba zamiast tekstu", '{"klient": 42, "wersja": "dużo"}'],
    ["zagnieżdżenie bez dna", `{"a":${"[".repeat(200)}${"]".repeat(200)}}`],
    ["bardzo długa nazwa", `{"klient": "${"A".repeat(50_000)}", "wersja": 1}`],
    ["wersja spoza świata", '{"klient": "Ala", "wersja": 1e308}'],
    ["ujemna wersja", '{"klient": "Ala", "wersja": -5}'],
    ["znaki sterujące w nazwie", '{"klient": "Ala\\u0000\\u0007", "wersja": 1}'],
  ];

  return [
    // ── adresy, które wskazują katalogi albo nic ──────────────────────
    ...["/klient/", "/klient", "/api/", "/api", "/k", "/k/", "/nie-ma-takiego",
        "/api/plany/", "/api/klienci/", "/api/klient/"]
      .map((sciezka) => ({ opis: `GET ${sciezka}`, sciezka })),

    // ── wyjście poza katalog publiczny ────────────────────────────────
    ...["/../serwer.ts", "/../../etc/passwd", "/klient/../../magazyn.ts",
        "/%2e%2e/serwer.ts", "/./././serwer.ts", "/klient/%2f%2e%2e%2fmagazyn.ts"]
      .map((sciezka) => ({ opis: `wyjście ${sciezka}`, sciezka })),

    // ── identyfikatory, których nie ma albo są dziwne ─────────────────
    ...["/api/plany/nie-ma-takiego", "/api/plany/../../etc/passwd",
        "/api/plany/%00", "/api/klienci/nie-ma", `/api/klient/${"x".repeat(500)}`,
        "/api/klient/../plany", "/api/plany/a/b/c/d"]
      .map((sciezka) => ({ opis: `GET ${sciezka}`, sciezka })),

    // ── ciała żądań, które psują parsery ──────────────────────────────
    ...jsonowe("/api/plany", paskudne),
    ...jsonowe(`/api/plany/${PLAN}/1rm`, [
      ["puste ciało", ""],
      ["bez ćwiczenia", '{"oneRM": 100}'],
      ["1RM ujemny", '{"cwiczenieId": "EX-0010", "oneRM": -100}'],
      ["1RM tekstem", '{"cwiczenieId": "EX-0010", "oneRM": "dużo"}'],
      ["ćwiczenie spoza bazy", '{"cwiczenieId": "EX-9999", "oneRM": 100}'],
    ]),
    ...jsonowe(`/api/plany/${PLAN}/tygodnie`, [
      ["tryb nieznany", '{"tryb": "cokolwiek", "zrodlo": 1}'],
      ["tydzień spoza zakresu", '{"tryb": "kopiuj", "zrodlo": 99}'],
      ["tydzień tekstem", '{"tryb": "kopiuj", "zrodlo": "trzy"}'],
    ]),
    ...jsonowe(`/api/plany/${PLAN}/przenies`, [
      ["slot nieznany", '{"positionId": "D9-S99", "kierunek": "gora"}'],
      ["kierunek nieznany", '{"positionId": "D1-S01", "kierunek": "wbok"}'],
    ]),
    ...jsonowe(`/api/klient/${token}/odczucie`, [
      ["puste ciało", ""],
      ["tydzień spoza zakresu", '{"positionId": "D1-S01", "tydzien": 99, "feedback": "OK"}'],
      ["tydzień ujemny", '{"positionId": "D1-S01", "tydzien": -1, "feedback": "OK"}'],
      ["odczucie nieznane", '{"positionId": "D1-S01", "tydzien": 1, "feedback": "świetnie"}'],
      ["ciężar tekstem", '{"positionId": "D1-S01", "tydzien": 1, "ciezarWykonany": "dużo"}'],
      ["ciężar nieskończony", '{"positionId": "D1-S01", "tydzien": 1, "ciezarWykonany": 1e400}'],
    ]),
    ...jsonowe(`/api/klient/${token}/waga`, [
      ["waga tekstem", '{"kg": "ciężko"}'],
      ["waga ujemna", '{"kg": -80}'],
      ["waga absurdalna", '{"kg": 1e12}'],
    ]),
    ...jsonowe(`/api/klient/${token}/serie`, [
      ["ćwiczenie spoza bazy", '{"cwiczenieId": "EX-9999", "ciezar": 100, "powtorzenia": 3}'],
      ["powtórzenia spoza tabeli", '{"cwiczenieId": "EX-0010", "ciezar": 100, "powtorzenia": 999}'],
    ]),

    // ── asystent: propozycja wracająca z przeglądarki ─────────────────
    //
    // `/ai-wstaw` nie pyta modelu o nic — bierze propozycję z ciała żądania
    // i wstawia ją do planu. Czyli jest to zwykła trasa przyjmująca dane
    // z sieci, a nie „coś od AI", i podlega tym samym regułom.
    ...jsonowe(`/api/plany/${PLAN}/ai-wstaw`, [
      ["puste ciało", ""],
      ["bez propozycji", "{}"],
      ["propozycja jako tekst", '{"propozycja": "zrób mi plan"}'],
      ["dni jako tekst", '{"propozycja": {"dni": "poniedziałek"}}'],
      ["dzień bez numeru", '{"propozycja": {"dni": [{"nazwa": "A", "cwiczenia": []}]}}'],
      ["dzień jako liczba w tekście", '{"propozycja": {"dni": [{"dzien": "jeden", "cwiczenia": []}]}}'],
      ["ćwiczenia jako tekst", '{"propozycja": {"dni": [{"dzien": 1, "cwiczenia": "przysiad"}]}}'],
      ["pozycja jako tekst", '{"propozycja": {"dni": [{"dzien": 1, "cwiczenia": ["przysiad"]}]}}'],
      ["tysiąc dni", `{"propozycja": {"dni": ${JSON.stringify(
        Array.from({ length: 1000 }, () => ({ dzien: 1, cwiczenia: [] })))}}}`],
    ]),

    // ── import: to, co nie jest arkuszem ──────────────────────────────
    { opis: "/api/import — pusty plik", sciezka: "/api/import?klient=X&wersja=1",
      metoda: "POST", cialo: "", typ: "application/octet-stream" },
    { opis: "/api/import — śmieci zamiast arkusza", sciezka: "/api/import?klient=X&wersja=1",
      metoda: "POST", cialo: "PK to nie jest arkusz", typ: "application/octet-stream" },
    { opis: "/api/import — bez nazwiska", sciezka: "/api/import?wersja=1",
      metoda: "POST", cialo: "cokolwiek", typ: "application/octet-stream" },

    // ── metody, których adres nie obsługuje ───────────────────────────
    ...([["DELETE", "/api/plany"], ["PUT", "/api/cwiczenia"], ["POST", "/api/uwaga"],
         ["PATCH", `/api/plany/${PLAN}`], ["DELETE", `/api/klient/${token}`]] as const)
      .map(([metoda, sciezka]) => ({ opis: `${metoda} ${sciezka}`, sciezka, metoda })),

    // ── liczby w adresie ──────────────────────────────────────────────
    ...["/api/1rm", "/api/1rm?ciezar=abc&powt=xyz", "/api/1rm?ciezar=1e400&powt=-3",
        "/api/1rm?ciezar=100&powt=0"]
      .map((sciezka) => ({ opis: `GET ${sciezka}`, sciezka })),

    // ── wartości, które serwer ma ODRZUCIĆ, a nie tylko przeżyć ───────
    //
    // Klient nie jest przeciwnikiem, ale jest bez nadzoru: zamiast 100 kg
    // wpisze 1000, a kolejka sprzed dwóch cykli przyniesie numer tygodnia,
    // którego już nie ma. Wszystko to szło wprost do danych trenera i psuło
    // jego liczby — frekwencję, propozycje 1RM, wykres wagi, a przy serii
    // maksymalnej ciężary na całe sześć tygodni.
    ...([
      ["tydzień 99", "/odczucie", '{"positionId":"D1-S01","tydzien":99,"feedback":"OK"}'],
      ["tydzień ujemny", "/odczucie", '{"positionId":"D1-S01","tydzien":-1,"feedback":"OK"}'],
      ["odczucie spoza trzech", "/odczucie", '{"positionId":"D1-S01","tydzien":1,"feedback":"świetnie"}'],
      ["ciężar ujemny", "/odczucie", '{"positionId":"D1-S01","tydzien":1,"ciezarWykonany":-100}'],
      ["ciężar 1e400", "/odczucie", '{"positionId":"D1-S01","tydzien":1,"ciezarWykonany":1e400}'],
      ["powtórzenia 100000", "/odczucie", '{"positionId":"D1-S01","tydzien":1,"powtorzeniaWykonane":100000}'],
      ["waga ujemna", "/waga", '{"kg":-80}'],
      ["waga bilion kg", "/waga", '{"kg":1e12}'],
      ["dzień spoza planu", "/dzien", '{"dzien":99,"tydzien":1}'],
      ["dzień bez ćwiczeń", "/dzien", '{"dzien":4,"tydzien":1}'],
      ["seria milion kg", "/serie", '{"cwiczenieId":"EX-0010","ciezar":1e9,"powtorzenia":3}'],
      ["seria 999 powtórzeń", "/serie", '{"cwiczenieId":"EX-0010","ciezar":100,"powtorzenia":999}'],
      ["seria ćwiczenia spoza bazy", "/serie", '{"cwiczenieId":"EX-9999","ciezar":100,"powtorzenia":3}'],
    ] as const).map(([opis, akcja, cialo]) => ({
      opis: `${akcja} — ${opis}`, sciezka: `/api/klient/${token}${akcja}`,
      metoda: "POST", cialo, musiOdmowic: true as const,
    })),

    // ── plan zapisywany przez trenera ─────────────────────────────────
    //
    // Największe i najbardziej złożone wejście w całym API: idzie wprost do
    // silnika i do bazy. Rozsypanie ciała żądania na zapisany rekord znaczyło,
    // że dało się podmienić cokolwiek — właściciela planu, datę utworzenia,
    // a nawet historię wykonań klienta.
    ...(([
      ["plan jako tekst", '{"plan":"to nie plan","status":"szkic"}'],
      ["plan jako null", '{"plan":null,"status":"szkic"}'],
      ["plan jako tablica", '{"plan":[1,2,3],"status":"szkic"}'],
      ["plan bez slotów", '{"plan":{"serieMaksymalne":[]},"status":"szkic"}'],
      ["sloty jako tekst",
       '{"plan":{"sloty":"nie","serieMaksymalne":[],"trybAkcesoriow":"licz z RPE","czescPlanu":"objętość"},"status":"szkic"}'],
      ["slot jako null",
       '{"plan":{"sloty":[null],"serieMaksymalne":[],"trybAkcesoriow":"licz z RPE","czescPlanu":"objętość"},"status":"szkic"}'],
      ["serie maksymalne jako tekst",
       '{"plan":{"sloty":[],"serieMaksymalne":"nie","trybAkcesoriow":"licz z RPE","czescPlanu":"objętość"},"status":"szkic"}'],
      ["tryb akcesoriów nieznany",
       '{"plan":{"sloty":[],"serieMaksymalne":[],"trybAkcesoriow":"cokolwiek","czescPlanu":"objętość"},"status":"szkic"}'],
      ["status nieznany", '{"status":"cokolwiek"}'],
      ["data startu bez sensu", '{"status":"szkic","dataStartu":"wczoraj"}'],
      ["30 lutego", '{"status":"szkic","dataStartu":"2026-02-30"}'],
    ] as const).map(([opis, cialo]) => ({
      opis: `PUT planu — ${opis}`, sciezka: `/api/plany/${PLAN}`,
      metoda: "PUT", cialo, musiOdmowic: true as const,
    }))),

    // Podmiana pól, których żądanie ruszać nie może. Odpowiedź ma być 200 —
    // tu chodzi o to, że pola zostaną nietknięte, co sprawdzamy na końcu.
    { opis: "PUT planu — próba podmiany właściciela i historii",
      sciezka: `/api/plany/${PLAN}`, metoda: "PUT",
      // Status zostaje „wysłany" — inaczej ta próba sama odebrałaby klientowi
      // plan i następne sprawdzenie mierzyłoby skutek naszego żądania,
      // zamiast tego, o co pytamy.
      cialo: '{"status":"wysłany","trenerId":999,"klientId":"ktos-inny","wykonania":[],"utworzony":"1999-01-01"}' },
  ];
}

/** Ślady wnętrza, których w odpowiedzi dla klienta być nie może. */
/**
 * Czego trenerowi pokazać nie wolno.
 *
 * Pierwsza wersja szukała wyłącznie ścieżek z dysku i ramek stosu — i przez
 * to przepuściła komunikat „((intermediate value) ?? []).map is not a
 * function". Ścieżki w nim nie było, więc kontrola zapaliła się na zielono,
 * choć na ekranie trenera stało wnętrze silnika JavaScriptu.
 *
 * Kontrola odpowiadała na węższe pytanie, niż mówi jej nazwa: „czy jest tu
 * ścieżka" zamiast „czy to jest zdanie dla człowieka". Druga grupa wzorców
 * łapie komunikaty samego JavaScriptu — żaden polski komunikat konsoli tak
 * nie brzmi, więc fałszywych trafień tu nie ma.
 */
const ZDRADLIWE = [
  /\/home\//, /\bat [A-Za-z]+ \(/, /\.ts:\d+/, /node:internal/,
  /is not a function/, /Cannot read propert/, /intermediate value/,
  /undefined is not/, /\b(TypeError|ReferenceError|SyntaxError|RangeError)\b/,
];

await zSerwerem(PORT, async ({ adres, api }: Srodowisko) => {
  // Plan i klient z linkiem — żeby próby trafiały w istniejące zasoby.
  await api("/api/plany", "POST", { klient: "Odpornosc test", wersja: 1 });
  const { zapisany } = await api(`/api/plany/${PLAN}`);
  zapisany.plan.sloty[0].cwiczenieId = "EX-0010";
  zapisany.plan.serieMaksymalne = [{ cwiczenieId: "EX-0010", ciezar: 120, powtorzenia: 3 }];
  await api(`/api/plany/${PLAN}`, "PUT",
    { plan: zapisany.plan, dataStartu: null, status: "wysłany" });
  const token = (await api(`/api/plany/${PLAN}/link`, "POST")).token;

  const lista = proby(token);
  const adresow = new Set(lista.map((p) => p.sciezka.split("?")[0])).size;
  console.log(`\n  ${lista.length} prób na ${adresow} adresach\n`);

  const martwy: string[] = [];
  const piecsetki: string[] = [];
  const gadatliwe: string[] = [];
  const przepuszczone: string[] = [];

  for (const p of lista) {
    let odp: Response;
    try {
      odp = await fetch(`${adres}${p.sciezka}`, {
        method: p.metoda ?? "GET",
        headers: p.cialo !== undefined ? { "content-type": p.typ ?? "application/json" } : {},
        body: p.cialo === undefined || (p.metoda ?? "GET") === "GET" ? undefined : p.cialo,
      });
    } catch {
      martwy.push(p.opis);
      continue;
    }
    if (odp.status >= 500) piecsetki.push(`${p.opis} → ${odp.status}`);
    if (p.musiOdmowic && odp.status < 400) przepuszczone.push(`${p.opis} → ${odp.status}`);
    const tresc = await odp.text();
    if (ZDRADLIWE.some((w) => w.test(tresc))) {
      gadatliwe.push(`${p.opis} → ${tresc.slice(0, 90)}`);
    }
  }

  sprawdz("serwer odpowiedział na każde żądanie", martwy.length === 0,
    martwy.length ? `bez odpowiedzi: ${martwy.slice(0, 3).join(" · ")}` : `${lista.length} prób`);
  sprawdz("złe wejście to odmowa (4xx), nie awaria (5xx)", piecsetki.length === 0,
    piecsetki.slice(0, 4).join(" · ") || "żadnej piątki");
  sprawdz("komunikaty błędów nie pokazują wnętrza", gadatliwe.length === 0,
    gadatliwe.slice(0, 3).join(" · ") || "czysto");
  // „Nie wywala się" to nie to samo co „waliduje". Wartość spoza świata ma
  // dostać odmowę, a nie wylądować w danych trenera.
  sprawdz("wartości spoza świata są odrzucane, nie zapisywane",
    przepuszczone.length === 0,
    przepuszczone.slice(0, 4).join(" · ")
      || `${lista.filter((p) => p.musiOdmowic).length} prób odrzuconych`);

  // Najważniejsze: po całej serii konsola ma dalej pracować normalnie.
  const poWszystkim = await api("/api/plany");
  sprawdz("po całej serii konsola pracuje normalnie",
    Array.isArray(poWszystkim) && poWszystkim.some((p: any) => p.id === PLAN),
    `${poWszystkim.length ?? 0} planów w bazie`);

  // Odmowa ma znaczyć odmowę: żadna z paskudnych prób nie może zostawić po
  // sobie kartoteki. Nazwisko idzie do identyfikatora planu i do nazwy pliku,
  // więc 50 tysięcy znaków albo znak sterujący to nie jest „dziwny klient",
  // tylko dane, których nie wolno przyjąć.
  const klienci = await api("/api/klienci");
  const dziwni = klienci.filter((k: any) =>
    k.nazwa.length > 120 || /[\u0000-\u001f\u007f]/.test(k.nazwa));
  sprawdz("odrzucone żądania nie zostawiły kartotek",
    dziwni.length === 0 && klienci.length === 1,
    klienci.map((k: any) => `${k.nazwa.slice(0, 20)} (${k.nazwa.length} zn.)`).join(" · "));

  const widok = await api(`/api/klient/${token}`);
  sprawdz("plan klienta nie ucierpiał po serii prób",
    widok.planId === PLAN && widok.tygodnie?.length === 6,
    `${widok.tygodnie?.length ?? 0} tygodni`);

  // Ani jeden ze śmieci nie mógł osiąść w danych: seria maksymalna musi być
  // ta wpisana przez trenera, historia wykonań pusta, waga bez pomiarów.
  const poProbach = (await api(`/api/plany/${PLAN}`)).zapisany;
  sprawdz("żądanie nie podmieniło właściciela ani daty utworzenia",
    poProbach.trenerId === 1 && poProbach.klientId === "odpornosc-test"
    && !poProbach.utworzony.startsWith("1999"),
    `trener ${poProbach.trenerId}, klient ${poProbach.klientId}, `
    + `utworzony ${poProbach.utworzony.slice(0, 10)}`);
  sprawdz("plan nie stracił slotów po serii prób",
    poProbach.plan.sloty.length === 60, `${poProbach.plan.sloty.length} slotów`);

  const seria = poProbach.plan.serieMaksymalne[0];
  sprawdz("dane klienta zostały nietknięte",
    seria?.ciezar === 120 && seria?.powtorzenia === 3
    && (poProbach.wykonania ?? []).length === 0
    && (widok.postep?.waga?.punkty ?? []).length === 0,
    `seria ${seria?.ciezar}×${seria?.powtorzenia}, `
    + `${(poProbach.wykonania ?? []).length} wykonań, `
    + `${(widok.postep?.waga?.punkty ?? []).length} pomiarów wagi`);

  doliczBledy(0);
});

podsumuj("API znosi wszystko, co się w nie rzuca");
