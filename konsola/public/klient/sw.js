/**
 * Service worker — żeby aplikacja otworzyła się bez zasięgu.
 *
 * Trzymamy tylko szkielet (HTML, CSS, JS). Dane planu idą przez localStorage
 * w app.js, bo muszą przetrwać także wtedy, gdy przeglądarka wyczyści cache.
 */
const CACHE = "trening-v8";
// `index.html` musi być w tej liście: bez niego pierwsza wizyta zapisuje tylko
// arkusz stylów i skrypt, a sama strona trafia do cache dopiero przy drugim
// wejściu — czyli offline działał od trzeciej wizyty, nie od pierwszej.
const SZKIELET = [
  "/klient/index.html", "/klient/style.css", "/klient/app.js", "/klient/manifest.json",
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

  e.respondWith(
    caches.match(zapytanie).then((zCache) =>
      zCache ?? fetch(e.request).then((odp) => {
        if (odp.ok) {
          const kopia = odp.clone();
          caches.open(CACHE).then((c) => c.put(zapytanie, kopia));
        }
        return odp;
      }).catch(() => caches.match("/klient/index.html")),
    ),
  );
});
