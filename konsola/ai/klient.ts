/**
 * Rozmowa z modelem — jedyne miejsce w całym projekcie, które wychodzi do internetu.
 *
 * Trzy zasady, które trzymają tę warstwę na miejscu:
 *
 * 1. **AI nie liczy liczb.** Ciężary, RPE, stres i normy liczy silnik —
 *    deterministycznie, z 93 testami przeciwko arkuszowi. Model dostaje
 *    zadania, w których nie da się pomylić o kilogram, bo w ogóle nie dotyka
 *    kilogramów: proponuje kategorie i ćwiczenia, opisuje słowami policzone
 *    liczby. Reszta to nie jego rola.
 * 2. **Bez klucza aplikacja działa tak samo.** Brak `ANTHROPIC_API_KEY` nie
 *    jest błędem — to po prostu wyłączona funkcja. Konsola startuje, plany się
 *    liczą, klient ćwiczy. Znika jeden przycisk.
 * 3. **Nic nie dzieje się samo.** Każda odpowiedź modelu jest propozycją,
 *    którą trener przyjmuje albo odrzuca. Tak jak przy 1RM z serii roboczych.
 *
 * Bez SDK i bez `node_modules` — zwykły `fetch` po HTTPS. Projekt nie ma ani
 * jednej zależności i nie zamierza jej mieć dla trzech zapytań HTTP.
 */

/**
 * Model. Wybrany świadomie: dobór ćwiczeń pod cel, staż i sprzęt to zadanie,
 * w którym słabszy model produkuje poprawnie wyglądające bzdury.
 */
export const MODEL = "claude-opus-5";

/** Wersja kontraktu API. Zmiana tej stałej to zmiana formatu odpowiedzi. */
export const WERSJA_API = "2023-06-01";

/**
 * Adres API. Nadpisywalny wyłącznie po to, żeby testy mogły podstawić własny
 * serwer i sprawdzić całą drogę — od zbudowania zapytania po weryfikację
 * odpowiedzi — bez wychodzenia do internetu i bez wydawania pieniędzy.
 *
 * Celowo nie nazywa się `ANTHROPIC_BASE_URL`: tę zmienną ustawiają sobie inne
 * narzędzia i podstawienie jej pod konsolę byłoby niespodzianką.
 */
function adres(): string {
  return process.env.CRAFTMYPLAN_API_URL || "https://api.anthropic.com/v1/messages";
}

/** Cennik `claude-opus-5` w dolarach za milion tokenów — do szacowania kosztu. */
export const CENNIK = { wejscie: 5, wyjscie: 25, odczytZCache: 0.5, zapisDoCache: 6.25 } as const;

/**
 * Ile model ma się nastanowić. `high` tam, gdzie odpowiedź jest projektem
 * (szkielet planu), `medium` tam, gdzie jest opisem gotowych liczb.
 */
export type Wysilek = "low" | "medium" | "high";

/** Błąd, który da się pokazać trenerowi bez tłumaczenia z angielskiego. */
export class BladAI extends Error {
  readonly kod: number;
  constructor(wiadomosc: string, kod = 502) {
    super(wiadomosc);
    this.name = "BladAI";
    this.kod = kod;
  }
}

/** Klucz z otoczenia. `null`, gdy nie ustawiony — to stan dozwolony. */
export function klucz(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

export type StanAI = {
  dostepna: boolean;
  model: string;
  /** Co zrobić, żeby włączyć — pokazywane trenerowi wprost. */
  powod?: string;
};

export function stan(): StanAI {
  if (!klucz()) {
    return {
      dostepna: false,
      model: MODEL,
      powod: "Brak klucza do API. Ustaw zmienną ANTHROPIC_API_KEY i zrestartuj konsolę — "
        + "bez niej wszystko poza asystentem działa normalnie.",
    };
  }
  return { dostepna: true, model: MODEL };
}

export type Uzycie = {
  wejscie: number;
  wyjscie: number;
  zCache: number;
  doCache: number;
  /** Szacunek kosztu zapytania w dolarach. */
  koszt: number;
};

function uzycie(u: Record<string, number | undefined> | undefined): Uzycie {
  const wejscie = u?.input_tokens ?? 0;
  const wyjscie = u?.output_tokens ?? 0;
  const zCache = u?.cache_read_input_tokens ?? 0;
  const doCache = u?.cache_creation_input_tokens ?? 0;
  const koszt =
    (wejscie * CENNIK.wejscie
      + wyjscie * CENNIK.wyjscie
      + zCache * CENNIK.odczytZCache
      + doCache * CENNIK.zapisDoCache) / 1e6;
  return { wejscie, wyjscie, zCache, doCache, koszt: Math.round(koszt * 1e4) / 1e4 };
}

/** Blok promptu systemowego. Osobny typ, bo tylko na bloku da się oznaczyć cache. */
export type BlokSystemowy = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export type Zapytanie = {
  system: readonly BlokSystemowy[];
  wiadomosc: string;
  /**
   * Schemat JSON, do którego odpowiedź ma pasować. Bez niego wraca zwykły tekst.
   * Ograniczenia schematu pilnuje `schemat.ts` — API odrzuca np. `minimum`.
   */
  schemat?: object;
  wysilek?: Wysilek;
  maxTokens?: number;
  /** Ile czekać, zanim uznamy, że nie ma odpowiedzi. */
  timeoutMs?: number;
};

export type Odpowiedz = {
  tekst: string;
  uzycie: Uzycie;
  stopReason: string | null;
};

/**
 * Ciało zapytania — osobno od wysyłki, żeby dało się je sprawdzić testem
 * bez ruszania sieci. Test pilnuje tego, czego z zewnątrz nie widać:
 * że w zapytaniu nie ma nazwiska klienta i nie ma parametrów, które ten model
 * odrzuca (`temperature`, `budget_tokens`, prefill odpowiedzi).
 */
export function cialoZapytania(z: Zapytanie): Record<string, unknown> {
  return {
    model: MODEL,
    max_tokens: z.maxTokens ?? 8000,
    system: z.system,
    messages: [{ role: "user", content: z.wiadomosc }],
    output_config: {
      effort: z.wysilek ?? "medium",
      ...(z.schemat ? { format: { type: "json_schema", schema: z.schemat } } : {}),
    },
  };
}

/** Ile razy ponowić przy błędzie przejściowym i ile odczekać między próbami. */
const PROBY = 3;
const ODCZEKANIE_MS = [1000, 3000];

function przejsciowy(kod: number): boolean {
  return kod === 429 || kod === 408 || kod >= 500;
}

async function odczekaj(ms: number): Promise<void> {
  await new Promise((gotowe) => setTimeout(gotowe, ms));
}

/**
 * Wysyła zapytanie i zwraca sam tekst odpowiedzi.
 *
 * Błędy tłumaczy na komunikaty po polsku, bo trafiają wprost na ekran trenera —
 * „401 unauthorized" nie mówi mu nic, „klucz do API jest nieprawidłowy" mówi wszystko.
 */
export async function zapytaj(z: Zapytanie): Promise<Odpowiedz> {
  const api = klucz();
  if (!api) throw new BladAI(stan().powod!, 503);

  let ostatni: BladAI | null = null;

  for (let proba = 0; proba < PROBY; proba++) {
    let odp: Response;
    try {
      odp = await fetch(adres(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": api,
          "anthropic-version": WERSJA_API,
        },
        body: JSON.stringify(cialoZapytania(z)),
        signal: AbortSignal.timeout(z.timeoutMs ?? 120_000),
      });
    } catch (e) {
      // Brak sieci albo przekroczony czas — obie sytuacje warte ponowienia.
      ostatni = new BladAI(
        e instanceof Error && e.name === "TimeoutError"
          ? "Model nie odpowiedział na czas. Spróbuj jeszcze raz."
          : "Nie udało się połączyć z API. Sprawdź internet i spróbuj ponownie.",
        504,
      );
      if (proba < PROBY - 1) { await odczekaj(ODCZEKANIE_MS[proba] ?? 3000); continue; }
      throw ostatni;
    }

    if (!odp.ok) {
      const tresc = await odp.text();
      ostatni = new BladAI(opisBledu(odp.status, tresc), odp.status);
      if (przejsciowy(odp.status) && proba < PROBY - 1) {
        await odczekaj(ODCZEKANIE_MS[proba] ?? 3000);
        continue;
      }
      throw ostatni;
    }

    const dane = await odp.json() as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
      usage?: Record<string, number>;
    };

    // Odmowa klasyfikatora wraca ze statusem 200 — trzeba ją sprawdzić osobno,
    // zanim ktokolwiek zajrzy do `content`.
    if (dane.stop_reason === "refusal") {
      throw new BladAI(
        "Model odmówił odpowiedzi na to zapytanie. Przeformułuj notatkę i spróbuj ponownie.",
        422,
      );
    }
    if (dane.stop_reason === "max_tokens") {
      throw new BladAI("Odpowiedź się urwała — była za długa. Zawęź zadanie.", 422);
    }

    const tekst = (dane.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    if (!tekst.trim()) throw new BladAI("Model odpowiedział pustką. Spróbuj ponownie.", 502);

    return { tekst, uzycie: uzycie(dane.usage), stopReason: dane.stop_reason ?? null };
  }

  throw ostatni ?? new BladAI("Nie udało się uzyskać odpowiedzi.", 502);
}

function opisBledu(kod: number, tresc: string): string {
  switch (kod) {
    case 400:
      // Jedyny błąd, przy którym warto pokazać szczegół: znaczy, że zapytanie
      // jest źle zbudowane, czyli że to błąd tutaj, a nie u trenera.
      return `API odrzuciło zapytanie (400). ${skrot(tresc)}`;
    case 401:
      return "Klucz do API jest nieprawidłowy. Sprawdź ANTHROPIC_API_KEY.";
    case 403:
      return "Klucz nie ma dostępu do tego modelu.";
    case 404:
      return "Nie ma takiego modelu. Sprawdź nazwę w kliencie AI.";
    case 413:
      return "Zapytanie było za duże.";
    case 429:
      return "Limit zapytań wyczerpany. Odczekaj chwilę i spróbuj ponownie.";
    case 529:
      return "API jest chwilowo przeciążone. Spróbuj za moment.";
    default:
      return kod >= 500
        ? `Awaria po stronie API (${kod}). Spróbuj za moment.`
        : `Nieoczekiwana odpowiedź API (${kod}). ${skrot(tresc)}`;
  }
}

function skrot(tresc: string): string {
  try {
    const j = JSON.parse(tresc) as { error?: { message?: string } };
    if (j.error?.message) return j.error.message.slice(0, 300);
  } catch { /* nie JSON — pokazujemy surowo */ }
  return tresc.slice(0, 300);
}

/**
 * Parsuje odpowiedź, o której wiemy, że jest JSON-em — bo prosiliśmy o schemat.
 * Wyjątek zamieniamy na komunikat, bo urwany JSON to nie jest błąd trenera.
 */
export function jako<T>(odp: Odpowiedz): T {
  try {
    return JSON.parse(odp.tekst) as T;
  } catch {
    throw new BladAI("Odpowiedź modelu nie była poprawnym JSON-em. Spróbuj ponownie.", 502);
  }
}
