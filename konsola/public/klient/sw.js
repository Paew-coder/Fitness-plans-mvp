/**
 * Service worker — żeby aplikacja otworzyła się bez zasięgu.
 *
 * Trzymamy tylko szkielet (HTML, CSS, JS). Dane planu idą przez localStorage
 * w app.js, bo muszą przetrwać także wtedy, gdy przeglądarka wyczyści cache.
 */
const CACHE = "trening-v15";
// `index.html` musi być w tej liście: bez niego pierwsza wizyta zapisuje tylko
// arkusz stylów i skrypt, a sama strona trafia do cache dopiero przy drugim
// wejściu — czyli offline działał od trzeciej wizyty, nie od pierwszej.
const SZKIELET = [
  "/klient/index.html", "/klient/style.css", "/klient/app.js", "/klient/manifest.json",
  "/klient/ikona-180.png", "/klient/ikona-192.png", "/klient/ikona-512.png",
];

/**
 * Worker jest zarejestrowany z zakresu `/`, bo klient otwiera `/k/<token>`.
 * Szeroki zakres znaczy jednak, że przez ten kod przechodzą też adresy konsoli
 * trenera — a tych nie wolno serwować z cache aplikacji klienta.
 */
function nasze(sciezka) {
  return sciezka.startsWith("/k/") || sciezka.startsWith("/klient/");
}

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SZKIELET)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((klucze) => Promise.all(klucze.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // Zapytania o dane zawsze z sieci — app.js sam radzi sobie z brakiem odpowiedzi.
  if (url.pathname.startsWith("/api/")) return;

  // Wszystko poza aplikacją klienta zostawiamy przeglądarce.
  if (!nasze(url.pathname)) return;

  // Adres /k/<token> to zawsze ta sama strona.
  const zapytanie = url.pathname.startsWith("/k/") ? "/klient/index.html" : e.request;

  e.respondWith(odpowiedz(e, zapytanie));
});

/**
 * Z cache od razu, ale z odświeżeniem w tle.
 *
 * Wcześniej było samo „z cache, a jak nie ma, to z sieci" — czyli plik raz
 * zapisany zostawał u klienta **na zawsze**. Nowa wersja aplikacji docierała
 * do niego wyłącznie wtedy, gdy ktoś pamiętał podbić `CACHE` w tym pliku.
 * Do tej pory pamiętałem, ale to jest zabezpieczenie oparte na pamięci:
 * jedno przeoczenie i wszyscy klienci zostają ze starym kodem, bez żadnego
 * objawu po stronie trenera.
 *
 * Kolejność jest celowa. Najpierw cache, bo aplikacja ma się otworzyć na
 * siłowni w piwnicy, gdzie zasięgu nie ma — czekanie na sieć znaczyłoby biały
 * ekran. Odświeżenie leci obok i wchodzi w życie przy następnym otwarciu.
 * „Sieć najpierw" dałaby świeższy kod kosztem tego, po co ten worker istnieje.
 */
async function odpowiedz(e, zapytanie) {
  const magazyn = await caches.open(CACHE);
  const zCache = await magazyn.match(zapytanie);

  const zSieci = fetch(e.request)
    .then((odp) => {
      if (odp.ok) magazyn.put(zapytanie, odp.clone());
      return odp;
    })
    .catch(() => null);

  if (zCache) {
    e.waitUntil(zSieci);   // odświeżenie kończy się nawet po oddaniu odpowiedzi
    return zCache;
  }
  return (await zSieci) ?? (await magazyn.match("/klient/index.html"))
    ?? Response.error();
}
