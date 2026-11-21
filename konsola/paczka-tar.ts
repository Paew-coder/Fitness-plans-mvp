/**
 * Czytanie archiwum `.tar` — tyle, ile potrzeba do rozpakowania paczki z GitHuba.
 *
 * Dlaczego własne, a nie biblioteka: cały projekt nie ma ani jednej zewnętrznej
 * zależności i to jest jego cecha, nie przypadek — trener rozpakowuje paczkę
 * i klika plik, bez `npm install`, bez internetu i bez pytania, czy któraś
 * z czterystu bibliotek nie przestała być bezpieczna. Node rozpakuje gzip sam
 * (`node:zlib`), a tar to format na tyle prosty, że mieści się poniżej.
 *
 * Format: ciąg bloków po 512 bajtów. Każdy plik to nagłówek plus jego treść
 * dopchana zerami do pełnych bloków. Koniec archiwum to dwa puste bloki.
 *
 * Obsługujemy dokładnie to, co wysyła GitHub: zwykłe pliki, katalogi
 * i nagłówki `pax` (typ „x" i „g"), w których siedzą długie nazwy. Wszystko
 * inne — dowiązania, urządzenia — pomijamy świadomie: w paczce z kodem nie
 * mają prawa się pojawić, a cicha obsługa czegoś, czego się nie rozumie, jest
 * gorsza niż jawne pominięcie.
 */
const BLOK = 512;

export type WpisTar = { nazwa: string; tresc: Buffer; katalog: boolean };

/** Napis zakończony zerem — tak tar trzyma nazwy i liczby. */
function napis(b: Buffer, od: number, ile: number): string {
  const kawalek = b.subarray(od, od + ile);
  const koniec = kawalek.indexOf(0);
  return kawalek.subarray(0, koniec === -1 ? kawalek.length : koniec).toString("utf-8").trim();
}

/** Rozmiar zapisany ósemkowo. Puste pole znaczy zero, nie NaN. */
function osemkowo(b: Buffer, od: number, ile: number): number {
  const tekst = napis(b, od, ile).replace(/[^0-7]/g, "");
  return tekst === "" ? 0 : parseInt(tekst, 8);
}

/**
 * Nazwa z nagłówka `pax`. Wpisy mają postać „<długość> <klucz>=<wartość>\n”,
 * a interesuje nas wyłącznie `path` — przez niego GitHub podaje nazwy dłuższe
 * niż sto znaków, czyli w tym projekcie praktycznie wszystkie.
 */
function sciezkaZPax(tresc: Buffer): string | null {
  const tekst = tresc.toString("utf-8");
  const trafienie = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(tekst);
  return trafienie ? trafienie[1]! : null;
}

export function czytajTar(dane: Buffer): WpisTar[] {
  const wpisy: WpisTar[] = [];
  let paxNazwa: string | null = null;

  for (let poz = 0; poz + BLOK <= dane.length; ) {
    const naglowek = dane.subarray(poz, poz + BLOK);
    // Dwa puste bloki kończą archiwum; pierwszy wystarczy, żeby przestać czytać.
    if (naglowek.every((bajt) => bajt === 0)) break;

    const rozmiar = osemkowo(naglowek, 124, 12);
    const typ = String.fromCharCode(naglowek[156]!);
    const prefiks = napis(naglowek, 345, 155);
    const wlasna = napis(naglowek, 0, 100);
    const nazwa = paxNazwa ?? (prefiks ? `${prefiks}/${wlasna}` : wlasna);

    const poczatek = poz + BLOK;
    const tresc = dane.subarray(poczatek, poczatek + rozmiar);
    poz = poczatek + Math.ceil(rozmiar / BLOK) * BLOK;

    if (typ === "x" || typ === "g") {
      // Nagłówek pax opisuje **następny** wpis (typ „g" — całe archiwum).
      const zPax = sciezkaZPax(tresc);
      if (typ === "x" && zPax) paxNazwa = zPax;
      continue;
    }
    paxNazwa = null;

    if (typ === "5") wpisy.push({ nazwa, tresc: Buffer.alloc(0), katalog: true });
    else if (typ === "0" || typ === "\0") wpisy.push({ nazwa, tresc: Buffer.from(tresc), katalog: false });
  }
  return wpisy;
}

/**
 * Zdejmuje pierwszy człon ścieżki — paczka z GitHuba pakuje wszystko w katalog
 * `<repo>-<gałąź>`, a nam chodzi o to, co jest w środku.
 *
 * Odrzuca przy okazji ścieżki, które próbują wyjść poza katalog docelowy
 * („..” i ścieżki bezwzględne). Archiwum jest z sieci; że pochodzi z GitHuba,
 * wie ten kto pisał adres, a nie ten kto rozpakowuje.
 */
export function bezPierwszegoKatalogu(nazwa: string): string | null {
  const czesci = nazwa.split("/").slice(1).filter((c) => c !== "" && c !== ".");
  if (czesci.length === 0) return null;
  if (czesci.some((c) => c === "..")) return null;
  if (nazwa.startsWith("/")) return null;
  return czesci.join("/");
}
