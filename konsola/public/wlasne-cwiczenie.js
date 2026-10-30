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
 *
 * Ćwiczenie z BAZY albo z biblioteki (27.10.2026, ekran „Baza ćwiczeń”;
 * trener: „żebym mógł edytować każde ćwiczenie z bazy”) — to samo okienko.
 * Zapis idzie jako poprawka (`PUT /api/cwiczenia/…`), pliki BAZY zostają;
 * „Przywróć oryginał” ją zdejmuje. Przy ćwiczeniu „do weryfikacji” —
 * „Sprawdzone”. Przy każdym istniejącym: w ilu planach stoi (zmiana obejmie
 * je wszystkie, także wysłane klientom).
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
/**
 * Progresje w trzech grupach (27.10.2026, trener: „uporządkuj metody
 * progresji — nie mam opcji do wybrania przy ćwiczeniu, które chcę zrobić
 * z gumą”). Guma to nie osobna progresja silnika, tylko progresja bez
 * kilogramów z „guma” — dlatego wartość „guma|masa ciała”: przed kreską guma,
 * po kresce to, co silnik liczy. Przy każdej pozycji zdanie, co się dzieje
 * w planie i na telefonie klienta.
 */
const GRUPY_PROGRESJI = [
  ["Kilogramy", [
    ["kg", "kg — ciężar liczony z 1RM",
      "Ciężar z 1RM klienta i RPE, rośnie z tygodnia na tydzień o skok."],
    ["dodatkowy ciężar", "dodatkowy ciężar — np. podciąganie z obciążeniem",
      "Kilogramy dokładane do masy ciała (pas, kamizelka) — liczone z 1RM jak przy kg."],
    ["ręczne ustawienie", "ręczne — kilogramy wpisujesz sam",
      "Silnik nie liczy ciężaru — wpisujesz go przy ćwiczeniu w planie."],
  ]],
  ["Guma — opór dobiera klient", [
    ["guma|masa ciała", "guma — rosną powtórzenia",
      "W kolumnie ciężaru „guma”: klient sam dobiera gumę, a po ocenie zmieniają się powtórzenia."],
    ["guma|asysta", "guma jako pomoc — np. podciąganie z gumą",
      "Guma pomaga w ruchu — klient dobiera ją sam, z czasem coraz słabszą."],
    ["guma|czas", "guma na czas — np. izometria z gumą",
      "Klient dobiera gumę, a liczy się czas utrzymania pozycji."],
    ["guma|ręczne ustawienie", "guma — powtórzenia ustalasz sam",
      "Klient dobiera gumę; powtórzenia zostają takie, jakie ustawisz w planie."],
  ]],
  ["Bez obciążenia", [
    ["masa ciała", "masa ciała — rosną powtórzenia",
      "Bez kilogramów — po ocenie klienta zmieniają się powtórzenia."],
    ["asysta", "asysta — np. maszyna do podciągania",
      "Kilogramy pomocy maszyny — liczone z 1RM jak ciężar."],
    ["czas", "czas — np. deska", "Liczy się czas utrzymania pozycji, nie kilogramy."],
    ["dystans", "dystans — np. sanie, marsz", "Liczy się odległość, nie kilogramy."],
  ]],
];
/** Kategoria plyometrii (30.10.2026) — `KATEGORIA_PLYOMETRII` w `silnik/src/typy.ts`. */
const PLYOMETRIA = "Plyometria";
const NA_KILOGRAMY = ["kg", "dodatkowy ciężar"];
const GUMA = "guma|";
/** Wartość listy z ćwiczenia: guma przed progresją, jeśli ćwiczenie jest z gumą. */
const wartoscProgresji = (c) => c ? `${c.guma ? GUMA : ""}${c.progresja}` : "kg";
/** Opis progresji z ćwiczenia — „guma (masa ciała)” albo sama nazwa. */
export const opisProgresji = (c) => c.guma ? `guma (${c.progresja})` : c.progresja;

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
  // Ćwiczenie z plików (BAZA, biblioteki) — poprawka zamiast własnego.
  const zBazy = !!cwiczenie && !cwiczenie.wlasne;
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
  // Bez planu (ekran „Baza ćwiczeń”) i przy ćwiczeniu z plików pola nie ma — nie ma do czego go przypiąć.
  if (zBazy || pDoPlanu.disabled) doPlanu.classList.add("ukryty");
  pola.append(doPlanu);

  // Skąd ćwiczenie, co było w plikach, „do weryfikacji” (ćwiczenia z BAZY i bibliotek).
  const ZRODLA = { tom: "biblioteki Theory of Motion", catalyst: "biblioteki Catalyst Athletics" };
  const doWeryfikacji = zBazy && /^(DO WERYFIKACJI|UZUPEŁNIĆ)/.test(cwiczenie.oryginal?.uwagi ?? cwiczenie.uwagi ?? "");
  let pSprawdzone = null;
  if (zBazy) {
    const info = el("div", "formularz-info");
    info.append(el("p", "formularz-podpowiedz",
      `Z ${ZRODLA[cwiczenie.biblioteka] ?? "Twojej bazy (arkusz)"} · ${cwiczenie.id}. Zmiana zapisuje się w konsoli — pliki bazy zostają, `
      + "a „Przywróć oryginał” ją cofa."));
    if (cwiczenie.poprawione && cwiczenie.oryginal) {
      const o = cwiczenie.oryginal;
      info.append(el("p", "formularz-podpowiedz formularz-oryginal",
        `W plikach bazy: ${o.nazwa} · ${o.kategoria}${o.kategorieDodatkowe?.length ? ` + ${o.kategorieDodatkowe.join(", ")}` : ""} · part ${o.part} · coeff ${String(o.coeff).replace(".", ",")} · ${opisProgresji(o)}`
        + `${NA_KILOGRAMY.includes(o.progresja) ? ` (skok ${String(o.skokKg).replace(".", ",")} kg)` : ""}${o.jednostronne ? " · jednostronne" : ""}`));
    }
    if (doWeryfikacji) {
      const uwagi = cwiczenie.oryginal?.uwagi ?? cwiczenie.uwagi;
      info.append(el("p", "formularz-podpowiedz", `Uwagi: ${uwagi}`));
      const sprawdzone = el("label", "formularz-wiersz formularz-ptaszek");
      pSprawdzone = el("input");
      pSprawdzone.type = "checkbox";
      pSprawdzone.name = "zweryfikowane";
      pSprawdzone.checked = !/^(DO WERYFIKACJI|UZUPEŁNIĆ)/.test(cwiczenie.uwagi ?? "");
      sprawdzone.append(pSprawdzone, el("span", "", "Sprawdzone — zdejmij „do weryfikacji”"));
      info.append(sprawdzone);
    }
    pola.append(info);
  }
  const opiszDoPlanu = () => {
    tytul.textContent = zBazy
      ? `Popraw ćwiczenie z ${cwiczenie.biblioteka ? "biblioteki" : "bazy"}`
      : cwiczenie
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

  const pKategoria = wybor([], cwiczenie?.kategoria ?? kategoria, "— wybierz —");
  pKategoria.name = "kategoria";
  // Grupy: siła z BAZY, plyometria (30.10.2026) i mobilność stawów (27.10.2026).
  const mobilnosc = (k) => k.endsWith(" mobility");
  for (const [etykieta, lista] of [["Siła", kategorie.filter((k) => !mobilnosc(k) && k !== PLYOMETRIA)],
    ["Plyometria", kategorie.filter((k) => k === PLYOMETRIA)],
    ["Mobilność stawów", kategorie.filter(mobilnosc)]]) {
    if (lista.length === 0) continue;
    const grupa = el("optgroup");
    grupa.label = etykieta;
    for (const k of lista) { const o = el("option", "", k); o.value = k; grupa.append(o); }
    pKategoria.append(grupa);
  }
  pKategoria.value = cwiczenie?.kategoria ?? kategoria ?? "";
  wiersz("Kategoria", pKategoria, "Do szkieletu planu i listy w wierszu.");

  /*
   * Także w kategoriach (27.10.2026). Trener: „jeżeli ćwiczenie spełnia
   * warunki dla obu kategorii, może pokazywać się w obu — Front foot elevated
   * split squat to Lower push i Ankle mobility”. Ćwiczenie stoi w kategorii
   * głównej, a te zaznaczone dokłada do list; ciężar i arkusz liczą się
   * z głównej. Główna nie ma pola — jest wybrana wyżej.
   */
  const takze = el("div", "formularz-wiersz formularz-takze");
  takze.append(el("span", "formularz-etykieta", "Także w kategoriach"));
  const polaTakze = el("div", "formularz-takze-pola");
  const dodatkowe = new Set(cwiczenie?.kategorieDodatkowe ?? []);
  for (const k of kategorie.filter((x) => x === PLYOMETRIA || mobilnosc(x))) {
    const l = el("label", "formularz-ptaszek");
    const p = el("input");
    p.type = "checkbox";
    p.name = "kategorieDodatkowe";
    p.value = k;
    p.checked = dodatkowe.has(k);
    l.append(p, el("span", "", k.replace(" mobility", "")));
    polaTakze.append(l);
  }
  takze.append(polaTakze, el("span", "formularz-podpowiedz",
    "Ćwiczenie pokaże się też na tych listach (np. box jump — Plyometria, rozpiętki — Shoulder)."));
  pola.append(takze);
  const pokazTakze = () => {
    for (const p of polaTakze.querySelectorAll("input")) {
      p.closest("label").classList.toggle("ukryty", p.value === pKategoria.value);
    }
  };
  pKategoria.addEventListener("change", pokazTakze);
  pokazTakze();

  const pPart = wybor(PARTY, cwiczenie?.part ?? "", "— wybierz —");
  pPart.name = "part";
  wiersz("Wzorzec ruchu (part)", pPart, "Do kontroli „Wzorce ruchu”.");

  const pCoeff = wybor(COEFFY, cwiczenie?.coeff ?? "", "— wybierz —");
  pCoeff.name = "coeff";
  wiersz("Coeff", pCoeff, "Ile stresu liczy się z jednej serii.");

  const pProgresja = el("select");
  pProgresja.name = "progresja";
  for (const [nazwaGrupy, opcje] of GRUPY_PROGRESJI) {
    const grupa = el("optgroup");
    grupa.label = nazwaGrupy;
    for (const [v, t] of opcje) { const o = el("option", "", t); o.value = v; grupa.append(o); }
    pProgresja.append(grupa);
  }
  const wybrana = wartoscProgresji(cwiczenie);
  if (![...pProgresja.options].some((o) => o.value === wybrana)) {
    // Guma przy progresji, której lista nie ma (np. na dystans) — zostaje, jak była.
    const o = el("option", "", wybrana.replace(GUMA, "guma — "));
    o.value = wybrana;
    pProgresja.querySelector("optgroup:nth-of-type(2)").append(o);
  }
  pProgresja.value = wybrana;
  const wierszProgresji = wiersz("Progresja", pProgresja, " ");
  const opisWybranej = wierszProgresji.querySelector(".formularz-podpowiedz");
  const progresja = () => pProgresja.value.replace(GUMA, "");
  const zGuma = () => pProgresja.value.startsWith(GUMA);

  const pSkok = el("input");
  pSkok.name = "skokKg";
  pSkok.type = "number";
  pSkok.step = "0.5";
  pSkok.min = "0";
  pSkok.max = "20";
  pSkok.value = cwiczenie && NA_KILOGRAMY.includes(cwiczenie.progresja) ? String(cwiczenie.skokKg) : "2.5";
  const wierszSkoku = wiersz("Skok (kg)", pSkok, "Najmniejszy przyrost ciężaru: 2,5 przy sztandze, 1 przy hantlach…");
  const opisy = new Map(GRUPY_PROGRESJI.flatMap(([, opcje]) => opcje.map(([v, , opis]) => [v, opis])));
  const pokazSkok = () => {
    wierszSkoku.classList.toggle("ukryty", !NA_KILOGRAMY.includes(progresja()));
    opisWybranej.textContent = opisy.get(pProgresja.value) ?? "Klient dobiera gumę.";
  };
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
  wiersz("Film (opcjonalnie)", pFilm, cwiczenie?.filmow > 0
    ? "Ma filmy z biblioteki — w aplikacji grają one; link przyda się, gdy filmów z biblioteki nie ma."
    : "Link z YouTube gra w aplikacji klienta.");

  const komunikat = el("p", "formularz-blad");
  komunikat.setAttribute("role", "alert");
  const dol = el("div", "formularz-dol");
  const anuluj = el("button", "", "Anuluj");
  anuluj.type = "button";
  anuluj.onclick = () => zamknijFormularz();
  const zapisz = el("button", "glowny", cwiczenie ? "Zapisz zmiany" : planId ? "Dodaj do planu" : "Dodaj do bazy");
  zapisz.type = "submit";
  dol.append(anuluj, zapisz);
  if (zBazy && cwiczenie.poprawione) {
    // „Przywróć oryginał” — poprawka znika, ćwiczenie znów takie, jak w plikach bazy.
    const przywroc = el("button", "link formularz-przywroc", "Przywróć oryginał");
    przywroc.type = "button";
    przywroc.onclick = async () => {
      przywroc.disabled = true;
      try {
        const c = await api(`/api/cwiczenia/${encodeURIComponent(cwiczenie.id)}/poprawka`, { method: "DELETE" });
        zamknijFormularz();
        naZapis(c);
      } catch (blad) {
        komunikat.textContent = blad.message;
        przywroc.disabled = false;
      }
    };
    dol.prepend(przywroc);
  }
  if (cwiczenie) {
    // W ilu planach stoi — zanim trener zapisze zmianę coeff czy progresji.
    const uzycie = el("span", "formularz-podpowiedz formularz-uzycie", "Zmiana obejmie każdy plan z tym ćwiczeniem.");
    dol.prepend(uzycie);
    api(`/api/cwiczenia/${encodeURIComponent(cwiczenie.id)}/uzycie`).then((u) => {
      uzycie.textContent = u.planow === 0 ? "Nie ma go w żadnym planie."
        : `Jest w ${u.planow} ${u.planow === 1 ? "planie" : "planach"}`
          + `${u.wyslanych ? ` (${u.wyslanych} ${u.wyslanych === 1 ? "wysłany" : "wysłanych"} klientom)` : ""}`
          + " — zmiana obejmie każdy z nich.";
    }).catch(() => { /* zostaje ogólne zdanie */ });
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
      kategorieDodatkowe: [...polaTakze.querySelectorAll("input:checked")].map((p) => p.value)
        .filter((k) => k !== pKategoria.value),
      progresja: progresja(),
      skokKg: NA_KILOGRAMY.includes(progresja()) ? Number(pSkok.value) : 0,
      guma: zGuma(),
      jednostronne: pJedn.checked,
      film: pFilm.value.trim(),
      jednorazowe: pDoPlanu.checked,
      // Poprawka ćwiczenia tylko do planu zostaje przy jego planie; nowe — przy tym, który się tworzy.
      ...(pDoPlanu.checked ? { planId: cwiczenie?.jednorazowe ? cwiczenie.planId : planId } : {}),
    };
    zapisz.disabled = true;
    try {
      const c = zBazy
        ? await api(`/api/cwiczenia/${encodeURIComponent(cwiczenie.id)}`, { method: "PUT",
          body: { ...dane, jednorazowe: false, zweryfikowane: pSprawdzone?.checked === true } })
        : cwiczenie
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
