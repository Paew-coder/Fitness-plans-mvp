/**
 * Własne ćwiczenie — okienko z polami BAZY (17.10.2026).
 *
 * Trener: „dodaj możliwość wpisywania własnej nazwy ćwiczenia podczas
 * tworzenia planu — razem z coeff, part, kategorią itp.”
 *
 * Te same pola, z których silnik liczy plan: kategoria (do szkieletu),
 * wzorzec ruchu (part — do wykresu „Wzorce ruchu”), coeff (stres), progresja
 * i skok (ciężar), jednostronne (powtórzenia na stronę), film. Zapis idzie
 * na serwer — ćwiczenie zostaje w bazie trenera na kolejne plany.
 * Brak pola i zajętą nazwę okienko mówi od razu, bez pytania serwera; serwer
 * sprawdza wszystko jeszcze raz i jego odmowa też trafia pod przycisk.
 *
 * „Tylko w tym planie” (27.10.2026, trener: „wpisuję ćwiczenie do planu,
 * który tworzę, ale nie dodaje się ono do bazy ćwiczeń”) — to samo okienko,
 * ćwiczenie liczy się w planie jak każde inne, ale nie trafia na listę wyboru
 * w innych planach. Odznaczenie przy poprawce przenosi je do bazy.
 */
const el = (tag, klasa, tekst) => {
  const e = document.createElement(tag);
  if (klasa) e.className = klasa;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
};

const PARTY = [
  ["s", "s — przysiad"], ["d", "d — martwy ciąg / zawias"], ["b", "b — wyciskanie"],
  ["r", "r — wiosłowanie / przyciąganie"], ["c", "c — core"],
];
const COEFFY = [
  [1, "1 — główny złożony"], [0.75, "0,75 — pomocniczy złożony"],
  [0.5, "0,5 — semi-izolacja"], [0.25, "0,25 — izolacja"],
];
const PROGRESJE = [
  ["kg", "kg — ciężar z 1RM"], ["dodatkowy ciężar", "dodatkowy ciężar (np. podciąganie z obciążeniem)"],
  ["ręczne ustawienie", "ręczne ustawienie — kilogramy wpisujesz sam"],
  ["masa ciała", "masa ciała — rosną powtórzenia"], ["asysta", "asysta"],
  ["czas", "czas"], ["dystans", "dystans"],
];
const NA_KILOGRAMY = ["kg", "dodatkowy ciężar"];

let otwarte = null;

/**
 * `cwiczenie` — do poprawki (bez niego: nowe). `naZapis(c)` dostaje ćwiczenie
 * w postaci z listy konsoli, już zapisane na serwerze.
 */
export function otworzFormularzCwiczenia({
  api, cwiczenia = [], kategorie, kategoria = "", nazwa = "", cwiczenie = null, naZapis,
  jednorazowe = false, planId = null,
}) {
  zamknijFormularz();
  const tlo = el("div", "wyszukiwarka-tlo");
  const okno = el("form", "wyszukiwarka formularz-cwiczenia");
  okno.setAttribute("role", "dialog");
  okno.setAttribute("aria-modal", "true");
  okno.setAttribute("aria-label", cwiczenie ? "Popraw własne ćwiczenie" : "Własne ćwiczenie");
  okno.noValidate = true;

  const gora = el("div", "wyszukiwarka-gora");
  const tytul = el("h3", "");
  gora.append(tytul);
  const x = el("button", "wyszukiwarka-x", "✕");
  x.type = "button";
  x.setAttribute("aria-label", "Zamknij");
  x.onclick = () => zamknijFormularz();
  gora.append(x);

  const pola = el("div", "formularz-pola");
  const wiersz = (etykieta, pole, podpowiedz) => {
    const w = el("label", "formularz-wiersz");
    w.append(el("span", "formularz-etykieta", etykieta), pole);
    if (podpowiedz) w.append(el("span", "formularz-podpowiedz", podpowiedz));
    pola.append(w);
    return w;
  };
  const wybor = (opcje, wartosc, pusta) => {
    const s = el("select");
    if (pusta) { const o = el("option", "", pusta); o.value = ""; s.append(o); }
    for (const [v, t] of opcje) { const o = el("option", "", t); o.value = String(v); s.append(o); }
    s.value = wartosc == null ? "" : String(wartosc);
    return s;
  };

  // Tylko do tego planu — na górze, bo od tego zależy, gdzie ćwiczenie zostanie.
  const doPlanu = el("label", "formularz-wiersz formularz-ptaszek formularz-tylko-plan");
  const pDoPlanu = el("input");
  pDoPlanu.type = "checkbox";
  pDoPlanu.name = "jednorazowe";
  pDoPlanu.checked = cwiczenie ? cwiczenie.jednorazowe === true : jednorazowe;
  pDoPlanu.disabled = !planId && !cwiczenie?.planId;
  doPlanu.append(pDoPlanu, el("span", "", "Tylko w tym planie — nie dodawaj do bazy ćwiczeń"));
  const opisDoPlanu = el("span", "formularz-podpowiedz");
  doPlanu.append(opisDoPlanu);
  pola.append(doPlanu);
  const opiszDoPlanu = () => {
    tytul.textContent = cwiczenie
      ? (pDoPlanu.checked ? "Popraw ćwiczenie tylko do tego planu" : "Popraw własne ćwiczenie")
      : (pDoPlanu.checked ? "Ćwiczenie tylko do tego planu" : "Własne ćwiczenie do bazy");
    opisDoPlanu.textContent = pDoPlanu.checked
      ? "Liczy się w tym planie jak każde inne (ciężar, telefon klienta, eksport), ale nie pojawi się na liście wyboru w innych planach."
      : cwiczenie?.jednorazowe
        ? "Odznaczone — ćwiczenie przejdzie do Twojej bazy i będzie na liście w każdym planie."
        : "Zostaje w Twojej bazie ćwiczeń — na liście wyboru w każdym planie.";
    okno.setAttribute("aria-label", tytul.textContent);
  };
  pDoPlanu.addEventListener("change", opiszDoPlanu);

  const pNazwa = el("input");
  pNazwa.name = "nazwa";
  pNazwa.maxLength = 80;
  pNazwa.autocomplete = "off";
  pNazwa.placeholder = "np. Pallof press z pauzą";
  pNazwa.value = cwiczenie?.nazwa ?? nazwa;
  wiersz("Nazwa", pNazwa);

  const pKategoria = wybor(kategorie.map((k) => [k, k]), cwiczenie?.kategoria ?? kategoria, "— wybierz —");
  pKategoria.name = "kategoria";
  wiersz("Kategoria", pKategoria, "Do szkieletu planu i listy w wierszu.");

  const pPart = wybor(PARTY, cwiczenie?.part ?? "", "— wybierz —");
  pPart.name = "part";
  wiersz("Wzorzec ruchu (part)", pPart, "Do kontroli „Wzorce ruchu”.");

  const pCoeff = wybor(COEFFY, cwiczenie?.coeff ?? "", "— wybierz —");
  pCoeff.name = "coeff";
  wiersz("Coeff", pCoeff, "Ile stresu liczy się z jednej serii.");

  const pProgresja = wybor(PROGRESJE, cwiczenie?.progresja ?? "kg");
  pProgresja.name = "progresja";
  wiersz("Progresja", pProgresja);

  const pSkok = el("input");
  pSkok.name = "skokKg";
  pSkok.type = "number";
  pSkok.step = "0.5";
  pSkok.min = "0";
  pSkok.max = "20";
  pSkok.value = cwiczenie && NA_KILOGRAMY.includes(cwiczenie.progresja) ? String(cwiczenie.skokKg) : "2.5";
  const wierszSkoku = wiersz("Skok (kg)", pSkok, "Najmniejszy przyrost ciężaru: 2,5 przy sztandze, 1 przy hantlach…");
  const pokazSkok = () => wierszSkoku.classList.toggle("ukryty", !NA_KILOGRAMY.includes(pProgresja.value));
  pProgresja.addEventListener("change", pokazSkok);
  pokazSkok();

  const jedn = el("label", "formularz-wiersz formularz-ptaszek");
  const pJedn = el("input");
  pJedn.type = "checkbox";
  pJedn.name = "jednostronne";
  pJedn.checked = cwiczenie?.jednostronne === true;
  jedn.append(pJedn, el("span", "", "Jednostronne — powtórzenia na stronę (↔)"));
  pola.append(jedn);

  const pFilm = el("input");
  pFilm.name = "film";
  pFilm.type = "url";
  pFilm.placeholder = "https://youtu.be/…";
  pFilm.value = cwiczenie?.film ?? "";
  wiersz("Film (opcjonalnie)", pFilm, "Link z YouTube gra w aplikacji klienta.");

  const komunikat = el("p", "formularz-blad");
  komunikat.setAttribute("role", "alert");
  const dol = el("div", "formularz-dol");
  const anuluj = el("button", "", "Anuluj");
  anuluj.type = "button";
  anuluj.onclick = () => zamknijFormularz();
  const zapisz = el("button", "glowny", cwiczenie ? "Zapisz zmiany" : "Dodaj do planu");
  zapisz.type = "submit";
  dol.append(anuluj, zapisz);
  if (cwiczenie) {
    dol.prepend(el("span", "formularz-podpowiedz",
      "Zmiana obejmie każdy plan z tym ćwiczeniem."));
  }

  opiszDoPlanu();
  okno.append(gora, pola, komunikat, dol);
  tlo.append(okno);
  document.body.append(tlo);
  document.body.classList.add("wyszukiwarka-otwarta");

  okno.onsubmit = async (e) => {
    e.preventDefault();
    komunikat.textContent = "";
    const male = (t) => t.trim().replace(/\s+/g, " ").toLocaleLowerCase("pl");
    // Ta sama nazwa co ćwiczenie tylko do innego planu — o tym decyduje serwer
    // (te same ustawienia = to samo ćwiczenie; inne — odmowa z powodem).
    const zajeta = cwiczenia.find((c) => c.id !== cwiczenie?.id && male(c.nazwa) === male(pNazwa.value)
      && !(c.jednorazowe && pDoPlanu.checked));
    const brak = male(pNazwa.value).length < 2 ? "Wpisz nazwę."
      : zajeta ? `Ćwiczenie „${zajeta.nazwa}” już jest w bazie — wybierz je z listy albo zmień nazwę.`
      : !pKategoria.value ? "Wybierz kategorię."
      : !pPart.value ? "Wybierz wzorzec ruchu (part)."
      : !pCoeff.value ? "Wybierz coeff."
      : null;
    if (brak) {
      komunikat.textContent = brak;
      return;
    }
    const dane = {
      nazwa: pNazwa.value,
      kategoria: pKategoria.value,
      part: pPart.value,
      coeff: pCoeff.value === "" ? null : Number(pCoeff.value),
      progresja: pProgresja.value,
      skokKg: NA_KILOGRAMY.includes(pProgresja.value) ? Number(pSkok.value) : 0,
      jednostronne: pJedn.checked,
      film: pFilm.value.trim(),
      jednorazowe: pDoPlanu.checked,
      // Poprawka ćwiczenia tylko do planu zostaje przy jego planie; nowe — przy tym, który się tworzy.
      ...(pDoPlanu.checked ? { planId: cwiczenie?.jednorazowe ? cwiczenie.planId : planId } : {}),
    };
    zapisz.disabled = true;
    try {
      const c = cwiczenie
        ? await api(`/api/cwiczenia-wlasne/${encodeURIComponent(cwiczenie.id)}`, { method: "PUT", body: dane })
        : await api("/api/cwiczenia-wlasne", { method: "POST", body: dane });
      zamknijFormularz();
      naZapis(c);
    } catch (blad) {
      komunikat.textContent = blad.message;
      zapisz.disabled = false;
    }
  };
  const naKlawisz = (e) => { if (e.key === "Escape") zamknijFormularz(); };
  document.addEventListener("keydown", naKlawisz);
  tlo.addEventListener("click", (e) => { if (e.target === tlo) zamknijFormularz(); });

  otwarte = { tlo, naKlawisz, poprzedniFokus: document.activeElement };
  pNazwa.focus();
}

export function zamknijFormularz() {
  if (!otwarte) return;
  const { tlo, naKlawisz, poprzedniFokus } = otwarte;
  otwarte = null;
  document.removeEventListener("keydown", naKlawisz);
  tlo.remove();
  document.body.classList.remove("wyszukiwarka-otwarta");
  if (poprzedniFokus?.isConnected) poprzedniFokus.focus({ preventScroll: true });
}
