/**
 * Konsola trenera — logika interfejsu.
 *
 * Cała matematyka siedzi na serwerze w `silnik/`. Tutaj tylko wyświetlanie
 * i zbieranie zmian: po każdej edycji plan leci do zapisu, wraca przeliczony
 * i odrysowujemy analizę. Dokładnie tak, jak arkusz przelicza się sam.
 */

const KATEGORIE = [
  "Lower push", "Lower pull", "Upper push horizontal", "Upper push vertical",
  "Upper pull horizontal", "Upper pull vertical", "Core", "Bicep", "Tricep",
];
const RZYMSKIE = ["I", "II", "III", "IV", "V"];

let cwiczenia = [];
let obraz = null;      // { zapisany, klient, wynik, uwagi, gotowy, normy }
let kartoteka = null;  // { klient, historia, plany, waga } — ekran klienta
let tydzien = 1;
let czekaZapis = null;

const $ = (s) => document.querySelector(s);
const el = (tag, klasa, tekst) => {
  const e = document.createElement(tag);
  if (klasa) e.className = klasa;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
};
const liczba = (n, m = 1) => Number(n).toFixed(m).replace(".", ",");

/**
 * Odmiana rzeczownika po liczbie: `[pojedyncza, mnoga, dopełniacz]`.
 * `1 cykl · 3 cykle · 5 cykli` — bez tego wszędzie wychodzi „3 pomiarów".
 */
function odmiana(n, [jeden, kilka, wiele]) {
  const ostatnia = n % 10;
  const dwie = n % 100;
  if (n === 1) return jeden;
  if (ostatnia >= 2 && ostatnia <= 4 && !(dwie >= 12 && dwie <= 14)) return kilka;
  return wiele;
}

async function api(sciezka, opcje = {}) {
  const odp = await fetch(sciezka, {
    headers: { "content-type": "application/json" },
    ...opcje,
    body: opcje.body ? JSON.stringify(opcje.body) : undefined,
  });
  const dane = await odp.json();
  if (!odp.ok) throw new Error(dane.blad ?? "Błąd serwera");
  return dane;
}

// ── kto tu jest ────────────────────────────────────────────────────
// Wylogowanie ma sens tylko wtedy, gdy w ogóle było logowanie. W instalacji
// lokalnej bez hasła przycisk byłby ozdobą, która nic nie robi.
(async () => {
  const ja = await api("/api/ja");
  if (ja.tryb !== "hasło") return;
  const przycisk = $("#wyloguj");
  przycisk.textContent = `Wyloguj (${ja.email ?? ja.nazwa})`;
  przycisk.classList.remove("ukryty");
  przycisk.onclick = async () => {
    await fetch("/api/wylogowanie", { method: "POST" });
    location.reload();
  };
})();

// ── lista klientów ─────────────────────────────────────────────────
// Konsola przez pierwsze fazy pokazywała płaską listę planów i to działało do
// mniej więcej trzydziestu pozycji. Trener myśli ludźmi, nie dokumentami —
// więc na wejściu są klienci, a cykle leżą w kartotece każdego z nich.
async function pokazListe() {
  // Najpierw dane, potem przełączenie ekranu — inaczej przez moment widać
  // poprzednią zawartość listy. Lokalnie to niewidoczne, przez wolne łącze
  // wyglądałoby jak „usunąłem, a dalej jest".
  const [klienci, plany, uwaga] = await Promise.all([
    api("/api/klienci"), api("/api/plany"), api("/api/uwaga"),
  ]);

  $("#ekran-plan").classList.add("ukryty");
  $("#ekran-klient").classList.add("ukryty");
  $("#ekran-lista").classList.remove("ukryty");

  rysujUwage(uwaga);
  rysujPodpowiedziKlientow(klienci);
  rysujWyborPoprzedniego(plany);

  const lista = $("#lista-klientow");
  lista.replaceChildren();
  if (klienci.length === 0) {
    lista.append(el("p", "wskazowka", "Jeszcze nikogo tu nie ma. Utwórz pierwszy plan powyżej."));
    return;
  }

  for (const k of klienci) {
    const wiersz = el("div", "pozycja");
    wiersz.append(el("div", "nazwa", k.nazwa));

    const opisCyklu = !k.cykl ? ""
      : k.cykl.doStartu !== null ? ` · start za ${k.cykl.doStartu} dni`
        : k.cykl.tydzien === null ? ""
          : k.cykl.poCyklu ? " · po cyklu" : ` · T${k.cykl.tydzien}/6`;
    const cykle = `${k.cykli} ${odmiana(k.cykli, ["cykl", "cykle", "cykli"])}`;
    const biezacy = k.najnowszaWersja ? ` · ostatni ${k.najnowszaWersja}.0 (${k.statusNajnowszego})` : "";
    wiersz.append(el("div", "meta", `${cykle}${biezacy}${opisCyklu}`));

    wiersz.append(sygnalAktywnosci(k.realizacja ?? { maDostep: k.maLink, dniOdOstatniej: null }));

    const otworz = el("button", "", "Otwórz");
    otworz.onclick = () => otworzKlienta(k.id);
    wiersz.append(otworz);
    lista.append(wiersz);
  }
}

/** Podpowiedzi w polu „Klient" — żeby drugi cykl trafił do istniejącej osoby. */
function rysujPodpowiedziKlientow(klienci) {
  const lista = $("#klienci-podpowiedzi");
  lista.replaceChildren();
  for (const k of klienci) {
    const o = el("option");
    o.value = k.nazwa;
    lista.append(o);
  }
}

function rysujWyborPoprzedniego(plany) {
  const wybor = $('#form-nowy [name="poprzedniId"]');
  wybor.replaceChildren(el("option", "", "— brak —"));
  wybor.firstChild.value = "";
  for (const p of plany) {
    const opcja = el("option", "", `${p.klient} ${p.wersja}.0`);
    opcja.value = p.id;
    wybor.append(opcja);
  }
}

$("#form-nowy").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const nowy = await api("/api/plany", {
      method: "POST",
      body: {
        klient: f.get("klient"),
        wersja: Number(f.get("wersja")),
        poprzedniId: f.get("poprzedniId") || undefined,
      },
    });
    e.target.reset();
    obraz = nowy;
    tydzien = 1;
    rysujPlan();
  } catch (err) {
    alert(err.message);
  }
};

$("#form-import").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const plik = f.get("plik");
  if (!plik || !plik.size) return alert("Wybierz plik");

  const przycisk = e.target.querySelector("button");
  przycisk.disabled = true;
  przycisk.textContent = "Wczytuję…";
  try {
    const parametry = new URLSearchParams({
      klient: f.get("klient"),
      wersja: String(f.get("wersja")),
    });
    const odp = await fetch(`/api/import?${parametry}`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: await plik.arrayBuffer(),
    });
    const dane = await odp.json();
    if (!odp.ok) throw new Error(dane.blad ?? "Błąd wczytywania");

    e.target.reset();
    obraz = dane;
    tydzien = 1;
    rysujPlan();

    if (dane.nierozpoznane?.length) {
      $("#modal-tytul").textContent = "Wczytane, ale nie wszystko";
      $("#modal-body").replaceChildren();
      $("#modal-body").append(
        el("p", "", `${dane.nierozpoznane.length} ćwiczeń z arkusza nie ma w BAZIE — ` +
          `te sloty są puste i trzeba je dobrać ręcznie:`),
      );
      const lista = el("ul");
      for (const n of dane.nierozpoznane) lista.append(el("li", "", `${n.positionId} — „${n.nazwa}”`));
      $("#modal-body").append(lista,
        el("p", "wskazowka", "Najczęściej to literówka albo ćwiczenie, którego jeszcze nie ma w bazie."));
      $("#modal").classList.remove("ukryty");
    }
  } catch (err) {
    alert(err.message);
  } finally {
    przycisk.disabled = false;
    przycisk.textContent = "Wczytaj";
  }
};

/**
 * Kto dziś wymaga uwagi. Przy kilkunastu klientach arkusz wymagał otwarcia
 * kilkunastu plików, żeby zauważyć, że ktoś zniknął — tu widać to od razu.
 */
function rysujUwage(pozycje) {
  const panel = $("#panel-uwaga");
  const lista = $("#uwaga-lista");
  lista.replaceChildren();
  panel.classList.toggle("ukryty", pozycje.length === 0);
  if (pozycje.length === 0) return;

  const opisPowodu = (p) => ({
    "stanal": `${p.dni} dni bez treningu`,
    "nie zaczal": `plan wysłany ${p.dni} dni temu, klient jeszcze nie zaczął`,
    "bez linku": "wysłany, ale klient nie ma linku",
    "koniec cyklu": p.doKonca <= 0
      ? "cykl kończy się dziś"
      : `cykl kończy się za ${p.doKonca} dni`,
    "po cyklu": `cykl skończył się ${p.dni} dni temu — czas na nową wersję`,
  }[p.rodzaj] ?? p.rodzaj);

  for (const w of pozycje) {
    const wiersz = el("div", "pozycja");
    wiersz.append(el("div", "nazwa", `${w.klient} ${w.wersja}.0`));
    wiersz.append(el("span", "meta powody", w.powody.map(opisPowodu).join(" · ")));
    const otworz = el("button", "", "Otwórz");
    otworz.onclick = () => otworzKlienta(w.klientId);
    wiersz.append(otworz);
    lista.append(wiersz);
  }
}

/**
 * Jednym spojrzeniem: czy ten klient ćwiczy.
 * Tego arkusz nie mówił nigdy — trzeba było otworzyć plik i zgadywać.
 */
function sygnalAktywnosci(r) {
  if (!r) return el("span", "");
  if (!r.maDostep) return el("span", "sygnal brak", "bez linku");

  const dni = r.dniOdOstatniej;
  if (dni === null) return el("span", "sygnal czeka", "nie zaczął");

  const opis = dni === 0 ? "dziś" : dni === 1 ? "wczoraj" : `${dni} dni temu`;
  const klasa = dni <= 3 ? "aktywny" : dni <= 10 ? "zwolnil" : "stanal";
  const znak = { aktywny: "●", zwolnil: "●", stanal: "▲" }[klasa];
  const licznik = r.rozpoczetych
    ? `${r.ukonczonych}+${r.rozpoczetych}/${r.zaplanowanych}`
    : `${r.ukonczonych}/${r.zaplanowanych}`;
  const s = el("span", `sygnal ${klasa}`, `${znak} ${licznik} · ${opis}`);
  s.title = klasa === "stanal"
    ? "Ponad 10 dni bez treningu — warto zapytać, co się dzieje"
    : r.rozpoczetych
      ? `Ostatnia aktywność ${opis}; ${r.rozpoczetych} treningów zaczętych bez domknięcia`
      : `Ostatni trening ${opis}`;
  return s;
}

// ── kartoteka klienta ──────────────────────────────────────────────
// Porównanie dwóch sąsiednich cykli mówi, co się zmieniło. Ten ekran odpowiada
// na pytanie szersze i jedyne, które trener naprawdę zadaje przy czwartej
// wersji planu: co się dzieje z tym człowiekiem od roku.
async function otworzKlienta(id) {
  kartoteka = await api(`/api/klienci/${id}`);
  rysujKartoteke();
}

function rysujKartoteke() {
  $("#ekran-lista").classList.add("ukryty");
  $("#ekran-plan").classList.add("ukryty");
  $("#ekran-klient").classList.remove("ukryty");

  const { klient, historia, plany } = kartoteka;
  $("#nazwa-klienta").textContent = klient.nazwa;
  $("#cykli-klienta").textContent = klient.token ? "ma link" : "bez linku";
  $("#cykli-klienta").className = `odznaka ${klient.token ? "wyslany" : "szkic"}`;
  $("#podsumowanie-klienta").textContent = kartoteka.podsumowanie;

  rysujCykle(plany);
  rysujSciezki1RM(historia.cwiczenia);
  rysujHistorieObciazenia(historia.cykle);
  rysujHistorieWzorcow(historia.wzorce);
  rysujHistorieFrekwencji(historia.cykle);
  rysujHistorieWagi(kartoteka.waga);
}

function rysujCykle(plany) {
  const lista = $("#lista-cykli");
  lista.replaceChildren();
  if (plany.length === 0) {
    lista.append(el("p", "wskazowka", "Ten klient nie ma jeszcze żadnego cyklu."));
    return;
  }

  // Najnowszy na górze — tam trener pracuje.
  for (const p of [...plany].reverse()) {
    const wiersz = el("div", "pozycja");
    const nazwa = el("div", "nazwa", `${p.wersja}.0`);
    if (p.id === kartoteka.aktywnyPlanId) {
      const znacznik = el("span", "znacznik-aktywny", "← widzi klient");
      znacznik.title = "Ten plan otwiera się pod linkiem klienta";
      nazwa.append(znacznik);
    }
    const status = el("span", `odznaka ${p.status.replace(/[łą]/g, "l")}`, p.status);

    const opisCyklu = p.cykl.doStartu !== null ? ` · start za ${p.cykl.doStartu} dni`
      : p.cykl.tydzien === null ? ""
        : p.cykl.poCyklu ? " · po cyklu" : ` · T${p.cykl.tydzien}/6`;
    const meta = el("div", "meta", `${p.cwiczen} ćwiczeń${opisCyklu}`);

    wiersz.append(nazwa, status, meta, sygnalAktywnosci(p.realizacja));

    const otworz = el("button", "", "Otwórz");
    otworz.onclick = () => otworzPlan(p.id);
    const kopiuj = el("button", "", "Nowa wersja");
    kopiuj.title = "Kopiuje dobór ćwiczeń jako kolejną wersję i łączy z tym cyklem";
    kopiuj.onclick = async () => {
      try {
        obraz = await api(`/api/plany/${p.id}/kopia`, { method: "POST", body: {} });
        tydzien = 1;
        rysujPlan();
      } catch (err) {
        alert(err.message);
      }
    };
    const usun = el("button", "link", "usuń");
    usun.onclick = async () => {
      if (!confirm(`Usunąć cykl ${p.wersja}.0? Znikną też oceny i wpisy klienta z tego cyklu.`)) return;
      await api(`/api/plany/${p.id}`, { method: "DELETE" });
      otworzKlienta(kartoteka.klient.id);
    };
    wiersz.append(otworz, kopiuj, usun);
    lista.append(wiersz);
  }
}

/** Ciąg wartości ze strzałkami: `100 → 110 → 125`. */
function ciag(wartosci, jednostka = "") {
  return wartosci.map((w) => liczba(w).replace(",0", "")).join(" → ") + (jednostka ? ` ${jednostka}` : "");
}

function zeZnakiemProc(procent) {
  if (procent === null) return "";
  return `${procent > 0 ? "+" : ""}${String(procent).replace(".", ",")}%`;
}

/**
 * Co się dzieje z siłą przez kolejne cykle.
 *
 * Bierzemy 1RM na wejściu w cykl, czyli to, co trener wpisał albo przyjął
 * z serii roboczych. W kolejnych tygodniach ciężar rusza się mnożnikiem
 * adaptacji i przestaje być tą samą miarą.
 */
function rysujSciezki1RM(cwiczeniaHistorii) {
  const kontener = $("#sciezki-1rm");
  kontener.replaceChildren();

  const zTrendem = cwiczeniaHistorii.filter((c) => c.wCyklach >= 2);
  const jednorazowe = cwiczeniaHistorii.filter((c) => c.wCyklach < 2);

  if (zTrendem.length === 0) {
    kontener.append(el("p", "wskazowka",
      jednorazowe.length === 0
        ? "Nie ma jeszcze ani jednego 1RM do pokazania."
        : "Trend pokaże się przy drugim cyklu z tym samym ćwiczeniem."));
  }

  for (const c of zTrendem) {
    const wiersz = el("div", "wiersz-sciezki");
    wiersz.append(el("span", "etykieta-szeroka", c.nazwa));
    wiersz.append(el("span", "tresc mono", ciag(c.punkty.map((p) => p.oneRM), "kg")));
    const klasa = c.zmianaKg > 0 ? "wzrost" : c.zmianaKg < 0 ? "spadek" : "";
    wiersz.append(el("span", `wartosc ${klasa}`, zeZnakiemProc(c.zmianaProc)));
    wiersz.title = `Cykle ${c.punkty.map((p) => `${p.wersja}.0`).join(", ")}`;
    kontener.append(wiersz);
  }

  if (jednorazowe.length > 0) {
    kontener.append(el("p", "wskazowka",
      `Tylko w jednym cyklu: ${jednorazowe.map((c) => c.nazwa).join(", ")}.`));
  }
}

function rysujHistorieObciazenia(cykle) {
  const kontener = $("#historia-obciazenia");
  kontener.replaceChildren();
  if (cykle.length === 0) return;

  for (const c of cykle) {
    const wiersz = el("div", "wiersz-miary");
    wiersz.append(el("span", "etykieta", `${c.wersja}.0`));
    wiersz.append(el("span", "tresc mono", `${liczba(c.stresNaTydzien, 1)} stresu`));
    wiersz.append(el("span", "wartosc", `${liczba(c.serieNaTydzien, 0)} serii`));
    wiersz.title = `${c.dniTreningowe} dni treningowe · ${c.cwiczen} ćwiczeń · `
      + `${liczba(c.powtorzeniaNaTydzien, 0)} powtórzeń na tydzień`;
    kontener.append(wiersz);
  }
  kontener.append(el("p", "wskazowka", "Średnia z sześciu tygodni cyklu."));
}

function rysujHistorieWzorcow(wzorce) {
  const kontener = $("#historia-wzorcow");
  kontener.replaceChildren();

  const ruszone = wzorce.filter((w) => w.punkty.some((p) => p.serie > 0));
  if (ruszone.length === 0) {
    kontener.append(el("p", "wskazowka", "Brak danych o wzorcach."));
    return;
  }
  for (const w of ruszone) {
    const wiersz = el("div", "wiersz-miary");
    wiersz.append(el("span", "etykieta", w.nazwa));
    wiersz.append(el("span", "tresc mono", ciag(w.punkty.map((p) => p.serie))));
    kontener.append(wiersz);
  }
  kontener.append(el("p", "wskazowka", "Serie na tydzień, cykl po cyklu."));
}

function rysujHistorieFrekwencji(cykle) {
  const kontener = $("#historia-frekwencji");
  kontener.replaceChildren();
  if (cykle.length === 0) return;

  for (const c of cykle) {
    const wiersz = el("div", "wiersz-miary");
    wiersz.append(el("span", "etykieta", `${c.wersja}.0`));
    wiersz.append(el("span", "tresc mono", `${c.ukonczonych}/${c.zaplanowanych}`));
    wiersz.append(el("span", "wartosc", c.frekwencja === null ? "—"
      : `${Math.round(c.frekwencja * 100)}%`));
    kontener.append(wiersz);
  }
}

function rysujHistorieWagi(waga) {
  const kontener = $("#historia-wagi");
  kontener.replaceChildren();
  if (waga.length === 0) {
    kontener.append(el("p", "wskazowka", "Klient nie wpisał jeszcze żadnego pomiaru."));
    return;
  }

  const zmiana = liczba(waga.at(-1).kg - waga[0].kg, 1);
  kontener.append(el("p", "poziom-modulu",
    `${liczba(waga.at(-1).kg)} kg${waga.length > 1 ? ` (${zmiana > 0 ? "+" : ""}${zmiana} kg)` : ""}`));
  kontener.append(el("p", "wskazowka",
    `${waga.length} ${odmiana(waga.length, ["pomiar", "pomiary", "pomiarów"])} od ${waga[0].data}. `
    + "Historia jest ciągła — nie zeruje się przy nowym cyklu."));
}

$("#wroc-do-klientow").onclick = pokazListe;

$("#nowy-cykl").onclick = async () => {
  const ostatni = kartoteka.plany.at(-1);
  const wersja = (ostatni?.wersja ?? 0) + 1;
  try {
    obraz = ostatni
      ? await api(`/api/plany/${ostatni.id}/kopia`, { method: "POST", body: { wersja } })
      : await api("/api/plany", {
          method: "POST",
          body: { klient: kartoteka.klient.nazwa, wersja: 1 },
        });
    tydzien = 1;
    rysujPlan();
  } catch (err) {
    alert(err.message);
  }
};

$("#zmien-nazwe").onclick = async () => {
  const nazwa = prompt("Nazwa klienta:", kartoteka.klient.nazwa);
  if (!nazwa?.trim() || nazwa === kartoteka.klient.nazwa) return;
  // Identyfikator zostaje — poprawienie literówki nie może rozdzielić historii.
  kartoteka = await api(`/api/klienci/${kartoteka.klient.id}`, {
    method: "PUT", body: { nazwa },
  });
  rysujKartoteke();
};

$("#link-klienta-karta").onclick = () => pokazLinkKlienta(kartoteka.klient.id);

/**
 * Scalenie dwóch kartotek tej samej osoby.
 *
 * Bierze się to z literówki w nazwisku: „Zuzana C" i „Zuzanna C" to dwie
 * kartoteki, a orientuje się to zwykle po cyklu pracy. Usunięcie i wpisanie
 * od nowa znaczyłoby stratę wykonań, wagi i historii — scalenie je zachowuje.
 */
$("#polacz-klienta").onclick = async () => {
  const inni = (await api("/api/klienci")).filter((k) => k.id !== kartoteka.klient.id);
  if (inni.length === 0) return alert("Nie ma z kim łączyć — to jedyny klient.");

  const wybor = el("select");
  for (const k of inni) {
    const o = el("option", "", `${k.nazwa} — ${k.cykli} ${odmiana(k.cykli, ["cykl", "cykle", "cykli"])}`);
    o.value = k.id;
    wybor.append(o);
  }
  const pole = el("label", "", "Przenieś wszystko do ");
  pole.append(wybor);
  const pola = el("div", "pola-modulu");
  pola.append(pole);

  const polacz = el("button", "glowny", "Połącz");
  polacz.onclick = async () => {
    const cel = inni.find((k) => k.id === wybor.value);
    if (!confirm(
      `Wszystkie cykle, wykonania i pomiary wagi klienta „${kartoteka.klient.nazwa}" ` +
      `przejdą do „${cel.nazwa}", a ta kartoteka zniknie. Tego nie da się cofnąć. Na pewno?`)) return;
    polacz.disabled = true;
    try {
      const wynik = await api(`/api/klienci/${kartoteka.klient.id}/polacz`, {
        method: "POST", body: { celId: wybor.value },
      });
      zamknijModal();
      kartoteka = wynik.kartoteka;
      rysujKartoteke();
    } catch (err) {
      alert(err.message);
      polacz.disabled = false;
    }
  };
  const anuluj = el("button", "", "Anuluj");
  anuluj.onclick = zamknijModal;
  const akcje = el("div", "akcje-modala");
  akcje.append(polacz, anuluj);

  pokazModal("Połącz z innym klientem",
    el("p", "", `Kartoteka „${kartoteka.klient.nazwa}" zostanie przeniesiona w całości i zniknie.`),
    pola,
    el("p", "wskazowka",
      "Link dostępowy przechodzi tylko wtedy, gdy klient docelowy jeszcze go nie ma. " +
      "Jeśli ma własny, zostaje jego — a stary adres przestaje działać."),
    akcje);
  $("#modal-zamknij").classList.add("ukryty");
};

$("#usun-klienta").onclick = async () => {
  const k = kartoteka.klient;
  const cykli = kartoteka.plany.length;
  const opis = cykli === 0
    ? "Ten klient nie ma żadnych cykli."
    : `Znikną ${cykli} ${odmiana(cykli, ["cykl", "cykle", "cykli"])} razem z ocenami klienta, `
      + "wpisanymi ciężarami i historią wagi.";
  if (!confirm(`Usunąć klienta „${k.nazwa}"?\n\n${opis}\nTego nie da się cofnąć.`)) return;

  // Kartoteka bez cykli to zwykle ślad po literówce — dlatego usuwanie jest
  // tu w ogóle, a nie tylko przy pojedynczych planach.
  await api(`/api/klienci/${k.id}`, { method: "DELETE" });
  pokazListe();
};

// ── otwieranie i zapis ─────────────────────────────────────────────
async function otworzPlan(id) {
  obraz = await api(`/api/plany/${id}`);
  tydzien = 1;
  rysujPlan();
}

function zapiszPozniej() {
  $("#zapis").textContent = "zapisywanie…";
  clearTimeout(czekaZapis);
  czekaZapis = setTimeout(async () => {
    try {
      obraz = await api(`/api/plany/${obraz.zapisany.id}`, {
        method: "PUT",
        body: {
          plan: obraz.zapisany.plan,
          dataStartu: obraz.zapisany.dataStartu,
          status: obraz.zapisany.status,
        },
      });
      $("#zapis").textContent = "zapisano";
      rysujAnalize();
      rysujDni();
      rysujSerieMax();
    } catch (err) {
      $("#zapis").textContent = `błąd: ${err.message}`;
    }
  }, 350);
}

// Z planu wraca się do kartoteki jego klienta — to jest miejsce, z którego
// się tu przyszło i w którym widać resztę cykli.
$("#wroc").onclick = () => {
  if (obraz?.zapisany.klientId) otworzKlienta(obraz.zapisany.klientId);
  else pokazListe();
};

// ── rysowanie planu ────────────────────────────────────────────────
function rysujPlan() {
  $("#ekran-lista").classList.add("ukryty");
  $("#ekran-klient").classList.add("ukryty");
  $("#ekran-plan").classList.remove("ukryty");

  const z = obraz.zapisany;
  $("#nazwa-planu").textContent = `${z.klient} ${z.wersja}.0`;
  $("#status-planu").textContent = z.status;
  $("#status-planu").className = `odznaka ${z.status.replace(/[łą]/g, "l")}`;
  $("#status-wybor").value = z.status;
  $("#tryb-akcesoriow").value = z.plan.trybAkcesoriow;
  $("#czesc-planu").value = z.plan.czescPlanu;
  $("#data-startu").value = z.dataStartu ?? "";

  $("#kopiuj-tydzien").textContent = `kopiuj T${tydzien}`;

  const taby = $("#taby-tygodni");
  taby.replaceChildren();
  for (const t of [1, 2, 3, 4, 5, 6]) {
    const b = el("button", t === tydzien ? "aktywny" : "", `T${t}`);
    // Bez `type` przycisk jest przyciskiem wysyłki formularza. Poza formularzem
    // nic to nie robi, ale zostawianie tego przypadkowi nie ma sensu.
    b.type = "button";
    b.onclick = () => { tydzien = t; rysujPlan(); };
    taby.append(b);
  }

  // Odczyt asystenta dotyczy konkretnego planu — przy zmianie planu znika,
  // żeby nikt nie czytał spostrzeżeń o cudzym cyklu.
  if (ostatniOdczytAI !== z.id) {
    ostatniOdczytAI = null;
    if (asystent?.dostepna) $("#ai-wynik").replaceChildren();
  }

  rysujDni();
  rysujAnalize();
  rysujRealizacje();
  rysujPropozycje1RM();
  rysujPorownanie();
  rysujModuly();
  rysujSerieMax(true);
}

/**
 * ODDECH i BIEG — dwa kalkulatory towarzyszące planowi siłowemu.
 * Nie dotykają ciężarów ani stresu; liczą się z własnych pól i tyle.
 */
function rysujModuly() {
  const m = obraz.moduly;

  $("#oddech-twot").value = m.oddech.wejscie.twot ?? "";
  $("#oddech-przeciwwskazania").checked = Boolean(m.oddech.wejscie.przeciwwskazania);

  const wyOddech = $("#oddech-wynik");
  wyOddech.replaceChildren();
  const d = m.oddech.dawka;
  if (!d) {
    wyOddech.append(el("p", "wskazowka",
      "Wpisz wynik testu TWOT — dawka policzy się sama."));
  } else if (d.zatrzymane) {
    wyOddech.append(el("p", "wskazowka ostrzezenie", `⚠ ${d.brama}`));
  } else {
    wyOddech.append(el("p", "poziom-modulu", `${d.poziom} · ${d.czestotliwosc}`));
    for (const [etykieta, tresc] of [
      ["A — rozgrzewka", d.blokA], ["B — praca", d.blokB], ["C — wyciszenie", d.blokC],
    ]) {
      const w = el("div", "wiersz-modulu");
      w.append(el("span", "etykieta", etykieta), el("span", "tresc", tresc));
      wyOddech.append(w);
    }
    wyOddech.append(el("p", "wskazowka", d.brama));
  }

  const b = m.bieg.wejscie;
  $("#bieg-wiek").value = b.wiek ?? "";
  $("#bieg-hrmax").value = b.hrMaxZmierzone ?? "";
  $("#bieg-dystans").value = b.dystansTestowy ?? "";
  $("#bieg-czas").value = b.czasTestowy ?? "";
  $("#bieg-jednostek").value = b.jednostekWTygodniu ?? "";

  const wyBieg = $("#bieg-wynik");
  wyBieg.replaceChildren();
  if (m.bieg.tygodnie.length === 0) {
    wyBieg.append(el("p", "wskazowka",
      "Podaj liczbę jednostek w tygodniu — reszta wyliczy się sama."));
    return;
  }

  if (m.bieg.hrMax) {
    wyBieg.append(el("p", "poziom-modulu",
      `HR max ${m.bieg.hrMax} ud/min${m.bieg.tempoTestowe ? ` · test ${m.bieg.tempoTestowe} min/km` : ""}`));
  }
  for (const t of m.bieg.tempa) {
    const w = el("div", "wiersz-modulu");
    w.append(el("span", "etykieta", t.nazwa), el("span", "tresc mono", `${t.tekst} min/km`));
    wyBieg.append(w);
  }

  const tabela = el("table", "sloty bieg");
  const glowa = el("tr");
  for (const n of ["", "typ", "czas", "dystans", "tempo", "tętno"]) glowa.append(el("th", "", n));
  const glowica = el("thead");
  glowica.append(glowa);
  tabela.append(glowica);
  const cialo = el("tbody");
  // W tabeli krótka nazwa; pełny opis siedzi w tooltipie, bo w wąskiej kolumnie
  // „Bieg ciągły — 20 min w tempie ciągłym + 20 min rozgrzewki" zawija się na pięć linii.
  const krotko = { 1: "spokojny", 2: "spokojny", 3: "ciągły", 4: "długie wybieganie", 5: "interwał" };
  for (const t of m.bieg.tygodnie) {
    for (const [i, j] of t.jednostki.entries()) {
      const w = el("tr", t.tydzien === 4 ? "odciazenie" : "");
      w.append(el("td", "mono", i === 0 ? `T${t.tydzien}` : ""));
      const typ = el("td", "", j.powtorzen
        ? `${krotko[j.nr]} ${j.powtorzen}×4′`
        : krotko[j.nr] ?? j.typ);
      typ.title = j.opis;
      w.append(typ);
      w.append(el("td", "mono", `${j.minutRazem} min`));
      w.append(el("td", "mono", j.dystansKm === null ? "—" : `≈ ${liczba(j.dystansKm)} km`));
      w.append(el("td", "mono", j.tempoTekst ?? "—"));
      w.append(el("td", "mono", j.strefa ? `${j.strefa.odUd}–${j.strefa.doUd}` : "—"));
      cialo.append(w);
    }
  }
  tabela.append(cialo);
  wyBieg.append(tabela);
  wyBieg.append(el("p", "wskazowka",
    "Tydzień 4 jest celowo lżejszy — to odciążenie, nie błąd. Czas jest zadaniem, " +
    "tempo celem, dystans szacunkiem."));
}

async function zapiszModuly() {
  const liczbaLubNull = (id) => {
    const v = $(id).value.trim();
    return v === "" ? null : Number(v);
  };
  obraz = await api(`/api/plany/${obraz.zapisany.id}/moduly`, {
    method: "PUT",
    body: {
      oddech: {
        twot: liczbaLubNull("#oddech-twot"),
        przeciwwskazania: $("#oddech-przeciwwskazania").checked,
      },
      bieg: {
        wiek: liczbaLubNull("#bieg-wiek"),
        hrMaxZmierzone: liczbaLubNull("#bieg-hrmax"),
        dystansTestowy: liczbaLubNull("#bieg-dystans"),
        czasTestowy: liczbaLubNull("#bieg-czas"),
        jednostekWTygodniu: liczbaLubNull("#bieg-jednostek"),
      },
    },
  });
  rysujModuly();
}

for (const id of [
  "#oddech-twot", "#oddech-przeciwwskazania", "#bieg-wiek", "#bieg-hrmax",
  "#bieg-dystans", "#bieg-czas", "#bieg-jednostek",
]) {
  $(id).onchange = zapiszModuly;
}

/**
 * Co się zmieniło wobec poprzedniego cyklu.
 *
 * Arkusz widzi jeden plan naraz — to porównanie wymagało otwarcia dwóch
 * plików obok siebie. Karta pokazuje różnice, ale ich nie ocenia: mniej
 * objętości przy powrocie po kontuzji to dokładnie to, co trzeba.
 */
function rysujPorownanie() {
  const karta = $("#karta-porownanie");
  const kontener = $("#porownanie");
  kontener.replaceChildren();

  const p = obraz.porownanie;
  karta.classList.toggle("ukryty", !p);
  if (!p) return;

  kontener.append(el("p", "wskazowka", `Wobec ${p.nazwaPoprzednia}`));

  const zeZnakiem = (z) => z.procent === null ? "—"
    : `${z.procent > 0 ? "+" : ""}${String(z.procent).replace(".", ",")}%`;
  const klasaZmiany = (z) => z.procent === null || Math.abs(z.procent) < 5 ? ""
    : z.procent > 0 ? "wzrost" : "spadek";

  for (const [etykieta, z] of [
    ["obciążenie", p.obciazenie], ["serie", p.serieRazem], ["powtórzenia", p.powtorzeniaRazem],
  ]) {
    const w = el("div", "wiersz-miary");
    w.append(el("span", "etykieta", etykieta));
    w.append(el("span", "tresc mono", `${liczba(z.poprzednio)} → ${liczba(z.teraz)}`));
    w.append(el("span", `wartosc ${klasaZmiany(z)}`, zeZnakiem(z)));
    kontener.append(w);
  }

  // Wzorce pokazujemy tylko te, które się ruszyły — reszta to szum.
  const ruszone = p.wzorce.filter((w) => Math.abs(w.serie.roznica) >= 0.5);
  if (ruszone.length > 0) {
    kontener.append(el("p", "wskazowka", "wzorce ruchu (serie na tydzień)"));
    for (const w of ruszone) {
      const wiersz = el("div", "wiersz-miary");
      wiersz.append(el("span", "etykieta", w.nazwa));
      wiersz.append(el("span", "tresc mono", `${liczba(w.serie.poprzednio)} → ${liczba(w.serie.teraz)}`));
      wiersz.append(el("span", `wartosc ${klasaZmiany(w.serie)}`, zeZnakiem(w.serie)));
      kontener.append(wiersz);
    }
  }

  // Tylko te 1RM, które faktycznie drgnęły — reszta to wiersze bez treści.
  const zmiany1RM = p.cwiczenia.filter((c) => c.zmianaOneRM && c.zmianaOneRM.roznica !== 0);
  if (zmiany1RM.length > 0) {
    kontener.append(el("p", "wskazowka", "1RM na wejściu w cykl"));
    for (const c of zmiany1RM) {
      const wiersz = el("div", "wiersz-miary");
      wiersz.append(el("span", "etykieta-szeroka", c.nazwa));
      wiersz.append(el("span", `wartosc szeroka ${klasaZmiany(c.zmianaOneRM)}`,
        `${liczba(c.oneRMPoprzednio)} → ${liczba(c.oneRMTeraz)} kg`));
      kontener.append(wiersz);
    }
  }

  const nowe = p.cwiczenia.filter((c) => c.stan === "nowe").map((c) => c.nazwa);
  const usuniete = p.cwiczenia.filter((c) => c.stan === "usunięte").map((c) => c.nazwa);
  kontener.append(el("p", "wskazowka",
    `${p.powtorzonych} z ${p.wszystkichTeraz} ćwiczeń wraca z poprzedniego cyklu.`));
  if (nowe.length) kontener.append(el("p", "wskazowka", `nowe: ${nowe.join(", ")}`));
  if (usuniete.length) kontener.append(el("p", "wskazowka", `wypadły: ${usuniete.join(", ")}`));
}

/**
 * 1RM odczytane z tego, co klient faktycznie podnosił.
 *
 * Arkusz umie tylko jedno: seria maksymalna na starcie cyklu — osobny trening,
 * zmęczenie, i po sześciu tygodniach liczba już nieaktualna. Tutaj ta sama
 * liczba wychodzi z serii roboczych. Ale to propozycja: klikasz albo nie.
 */
function rysujPropozycje1RM() {
  const karta = $("#karta-1rm");
  const kontener = $("#propozycje-1rm");
  kontener.replaceChildren();

  const lista = obraz.propozycje1RM ?? [];
  karta.classList.toggle("ukryty", lista.length === 0);
  if (lista.length === 0) return;

  kontener.append(el("p", "wskazowka",
    "Policzone z ciężarów wpisanych przez klienta. Nic nie zmienia się samo."));

  for (const p of lista) {
    const wiersz = el("div", "propozycja");
    const gora = el("div", "propozycja-gora");
    gora.append(el("span", "nazwa", p.nazwa));

    const zmiana = p.zmianaProc === null ? ""
      : ` (${p.zmianaProc > 0 ? "+" : ""}${String(p.zmianaProc).replace(".", ",")}%)`;
    gora.append(el("span", "wartosc",
      `${p.obecne1RM ? `${liczba(p.obecne1RM)} → ` : ""}${liczba(p.oneRM)} kg${zmiana}`));
    wiersz.append(gora);

    // Propozycja z poprzedniego cyklu musi być podpisana. Bez tego trener nie
    // wie, czy patrzy na to, co klient podniósł w tym tygodniu, czy sześć
    // tygodni temu — a to zupełnie inna informacja.
    if (p.zPoprzedniegoCyklu) {
      wiersz.append(el("p", "wskazowka",
        `Z cyklu ${p.zPoprzedniegoCyklu}.0 — ten dopiero się zaczyna.`));
    }

    const bezZera = (n) => liczba(n).replace(",0", "");
    const zrodlo = p.estymaty
      .map((e) => `${bezZera(e.seria.ciezar)}×${e.seria.powtorzenia} @RPE ${bezZera(e.rpeEfektywne)}`)
      .join(" · ");
    wiersz.append(el("p", "wskazowka", zrodlo));

    if (p.ocena.zaufanie === "niskie") {
      wiersz.append(el("p", "wskazowka ostrzezenie", `⚠ ${p.ocena.powod}`));
    }

    const przyjmij = el("button", "", "Przyjmij");
    przyjmij.onclick = async () => {
      obraz = await api(`/api/plany/${obraz.zapisany.id}/1rm`, {
        method: "POST",
        body: { cwiczenieId: p.cwiczenieId, oneRM: p.oneRM },
      });
      rysujPlan();
    };
    wiersz.append(przyjmij);
    kontener.append(wiersz);
  }
}

function rysujRealizacje() {
  const kontener = $("#realizacja");
  kontener.replaceChildren();
  const r = obraz.realizacja;

  if (!r.maDostep) {
    kontener.append(el("p", "wskazowka",
      "Klient nie ma jeszcze linku. Kliknij „Link dla klienta” u góry."));
    return;
  }
  if (r.ukonczonych + r.rozpoczetych === 0) {
    kontener.append(el("p", "wskazowka", "Link wygenerowany, ale klient jeszcze nie ruszył."));
    return;
  }

  const opisCzasu = r.dniOdOstatniej === 0 ? "dziś"
    : r.dniOdOstatniej === 1 ? "wczoraj" : `${r.dniOdOstatniej} dni temu`;
  kontener.append(el("p", "wskazowka",
    `${r.ukonczonych} z ${r.zaplanowanych} treningów domkniętych · ostatnia aktywność ${opisCzasu}`));

  for (const t of r.tygodnie) {
    const wiersz = el("div", "wiersz-miary");
    wiersz.append(el("span", "etykieta", `T${t.tydzien}`));
    const kropki = el("span", "pasek");
    for (let i = 0; i < t.zDnia; i++) {
      const stan = i < t.ukonczonych ? "zrobiona"
        : i < t.ukonczonych + t.rozpoczetych ? "zaczeta" : "";
      const k = el("span", `kropka ${stan}`, "●");
      k.title = stan === "zrobiona" ? "trening domknięty"
        : stan === "zaczeta" ? "klient oceniał ćwiczenia, ale nie kliknął „Zakończ trening”"
        : "brak śladu";
      kropki.append(k);
    }
    wiersz.append(kropki);
    const podpis = t.rozpoczetych
      ? `${t.ukonczonych}+${t.rozpoczetych}/${t.zDnia}`
      : `${t.ukonczonych}/${t.zDnia}`;
    wiersz.append(el("span", "wartosc", podpis));
    kontener.append(wiersz);
  }

  if (r.rozpoczetych) {
    kontener.append(el("p", "wskazowka",
      `${r.rozpoczetych} × trening zaczęty, ale nie domknięty — oceny i tak liczą się do adaptacji.`));
  }

  const o = r.odczucia;
  if (o.latwe + o.ok + o.trudne > 0) {
    kontener.append(el("p", "wskazowka",
      `odczucia: ${o.trudne} × za trudne · ${o.ok} × OK · ${o.latwe} × za łatwe`));
  }
}

$("#tryb-akcesoriow").onchange = (e) => {
  obraz.zapisany.plan.trybAkcesoriow = e.target.value;
  zapiszPozniej();
};
$("#czesc-planu").onchange = (e) => {
  obraz.zapisany.plan.czescPlanu = e.target.value;
  zapiszPozniej();
};
$("#data-startu").onchange = (e) => {
  obraz.zapisany.dataStartu = e.target.value || null;
  zapiszPozniej();
};

function slotPlanu(positionId) {
  return obraz.zapisany.plan.sloty.find((s) => s.positionId === positionId);
}
function slotWyliczony(positionId) {
  return obraz.wynik.tygodnie[tydzien - 1].sloty.find((s) => s.positionId === positionId);
}

function rysujDni() {
  const kontener = $("#dni");
  kontener.replaceChildren();
  const wyliczonyTydzien = obraz.wynik.tygodnie[tydzien - 1];

  for (let dzien = 1; dzien <= 5; dzien++) {
    const sloty = obraz.zapisany.plan.sloty.filter((s) => s.dzien === dzien);
    const maCwiczenia = sloty.some((s) => s.cwiczenieId);
    const podsumowanie = wyliczonyTydzien.dni.find((d) => d.dzien === dzien);

    const blok = el("section", "dzien");
    const naglowek = el("div", "dzien-naglowek");
    naglowek.append(el("span", "tytul", `Dzień ${RZYMSKIE[dzien - 1]}`));
    if (maCwiczenia && podsumowanie) {
      naglowek.append(el("span", "suma",
        `${podsumowanie.serie} serii · ${podsumowanie.powtorzenia} powt. · stres ${liczba(podsumowanie.stresCalkowity)}`));
    }
    blok.append(naglowek);

    // TOP SET
    const top = (obraz.zapisany.plan.topSety ?? []).find((t) => t.dzien === dzien);
    if (top && maCwiczenia) {
      const wyliczony = wyliczonyTydzien.topSety.find((t) => t.dzien === dzien);
      const pasek = el("div", "topset");
      const przelacznik = el("input");
      przelacznik.type = "checkbox";
      przelacznik.checked = top.wlaczony;
      przelacznik.onchange = () => { top.wlaczony = przelacznik.checked; zapiszPozniej(); };
      const rpe = el("input");
      rpe.type = "number"; rpe.step = "0.5"; rpe.min = "5"; rpe.max = "10";
      rpe.value = top.rpe; rpe.style.width = "4rem";
      rpe.onchange = () => { top.rpe = Number(rpe.value); zapiszPozniej(); };
      pasek.append(przelacznik, el("span", "etykieta", "TOP SET"),
        el("span", "", wyliczony?.cwiczenie?.nazwa ?? "—"),
        el("span", "", "RPE"), rpe,
        el("span", "wynik", typeof wyliczony?.ciezar === "number"
          ? `${liczba(wyliczony.ciezar)} kg` : (wyliczony?.ciezar || "—")));
      blok.append(pasek);
    }

    const tabela = el("table", "sloty");
    const glowa = el("thead");
    const wierszNaglowka = el("tr");
    for (const [tekst, klasa] of [["Lp.", "lp"], ["Ćwiczenie", ""], ["Szkielet", ""],
      ["Serie", ""], ["Powt.", ""], ["RPE", ""], ["Ciężar", ""], ["stres t/c/p", ""]]) {
      wierszNaglowka.append(el("th", klasa, tekst));
    }
    glowa.append(wierszNaglowka);
    tabela.append(glowa);

    const cialo = el("tbody");
    for (const slot of sloty) {
      const pusty = !slot.cwiczenieId;
      // Puste sloty po ostatnim wypełnionym chowamy — zapas ma nie zaśmiecać widoku.
      const indeks = sloty.indexOf(slot);
      const ostatniWypelniony = sloty.map((s) => !!s.cwiczenieId).lastIndexOf(true);
      if (pusty && indeks > ostatniWypelniony + 1) continue;

      cialo.append(rysujSlot(slot, pusty));
    }
    tabela.append(cialo);
    blok.append(tabela);
    kontener.append(blok);
  }
}

function rysujSlot(slot, pusty) {
  const wyliczony = slotWyliczony(slot.positionId);
  const litera = (slot.lp || "").charAt(0);
  const wiersz = el("tr", `${"BDbd".includes(litera) ? "grupa-b" : ""} ${pusty ? "pusty" : ""}`);

  const komorkaLp = el("td", "lp");
  komorkaLp.append(el("span", "", slot.lp || "—"));
  if (!pusty) {
    const strzalki = el("span", "strzalki");
    for (const [kierunek, znak, tytul] of [
      ["gora", "▲", "wyżej"], ["dol", "▼", "niżej"],
    ]) {
      const b = el("button", "mikro", znak);
      b.title = `Przenieś ${tytul}`;
      b.onclick = async () => {
        obraz = await api(`/api/plany/${obraz.zapisany.id}/przenies`, {
          method: "POST",
          body: { positionId: slot.positionId, kierunek },
        });
        rysujDni();
        rysujAnalize();
      };
      strzalki.append(b);
    }
    komorkaLp.append(strzalki);
  }
  wiersz.append(komorkaLp);

  // ── ćwiczenie: wybór z listy, nigdy wpisywanie ──
  const komorkaCwiczenia = el("td", "cwiczenie");
  const wybor = el("select");
  const pustaOpcja = el("option", "", "— wybierz —");
  pustaOpcja.value = "";
  wybor.append(pustaOpcja);
  const dostepne = slot.kategoriaSzkieletu
    ? cwiczenia.filter((c) => c.kategoria === slot.kategoriaSzkieletu)
    : cwiczenia;
  for (const c of dostepne) {
    const o = el("option", "", c.nazwa + (c.jednostronne ? "  ↔" : ""));
    o.value = c.id;
    wybor.append(o);
  }
  // Ćwiczenie spoza filtra zostaje widoczne, żeby zmiana szkieletu go nie gubiła.
  if (slot.cwiczenieId && !dostepne.some((c) => c.id === slot.cwiczenieId)) {
    const c = cwiczenia.find((x) => x.id === slot.cwiczenieId);
    if (c) {
      const o = el("option", "", `${c.nazwa} (spoza szkieletu)`);
      o.value = c.id;
      wybor.append(o);
    }
  }
  wybor.value = slot.cwiczenieId ?? "";
  wybor.onchange = () => {
    slot.cwiczenieId = wybor.value || null;
    zapiszPozniej();
  };
  komorkaCwiczenia.append(wybor);
  wiersz.append(komorkaCwiczenia);

  // ── kategoria szkieletu ──
  const komorkaSzkieletu = el("td", "szkielet");
  const wyborSzkieletu = el("select");
  const bezKategorii = el("option", "", "— pełna baza —");
  bezKategorii.value = "";
  wyborSzkieletu.append(bezKategorii);
  for (const k of KATEGORIE) {
    const o = el("option", "", k);
    o.value = k;
    wyborSzkieletu.append(o);
  }
  wyborSzkieletu.value = slot.kategoriaSzkieletu ?? "";
  wyborSzkieletu.onchange = () => {
    slot.kategoriaSzkieletu = wyborSzkieletu.value || null;
    zapiszPozniej();
  };
  komorkaSzkieletu.append(wyborSzkieletu);
  wiersz.append(komorkaSzkieletu);

  if (pusty) {
    wiersz.append(el("td", ""), el("td", ""), el("td", ""), el("td", ""), el("td", ""));
    return wiersz;
  }

  slot.tygodnie ??= {};
  slot.tygodnie[tydzien] ??= {};
  const parametry = slot.tygodnie[tydzien];
  const poleLiczbowe = (wartosc, przypisz, krok = "1", zastepczy = "") => {
    const komorka = el("td", "liczba");
    const input = el("input");
    input.type = "number"; input.step = krok; input.min = "0";
    input.value = wartosc ?? "";
    input.placeholder = zastepczy;
    input.onchange = () => {
      przypisz(input.value === "" ? undefined : Number(input.value));
      zapiszPozniej();
    };
    komorka.append(input);
    return komorka;
  };

  wiersz.append(poleLiczbowe(parametry.serie, (v) => { parametry.serie = v; }, "1", "3"));
  // Puste pole = licz automatem; podpowiedź pokazuje, co z tego wychodzi.
  wiersz.append(poleLiczbowe(
    parametry.powtorzenia,
    (v) => { parametry.powtorzenia = v; },
    "1",
    String(wyliczony?.powtorzenia ?? ""),
  ));
  wiersz.append(poleLiczbowe(parametry.rpe, (v) => { parametry.rpe = v; }, "0.5", "8"));

  const ciezar = wyliczony?.ciezar;
  const komorkaCiezaru = el("td", typeof ciezar === "number" ? "ciezar" : "ciezar brak",
    typeof ciezar === "number" ? `${liczba(ciezar)} kg` : String(ciezar ?? "—"));
  if (wyliczony?.cwiczenie?.jednostronne && typeof ciezar === "number") {
    komorkaCiezaru.append(el("span", "znacznik-jedn", "  ↔ na stronę"));
  }
  wiersz.append(komorkaCiezaru);

  const s = wyliczony?.stres;
  wiersz.append(el("td", "stres", s
    ? `${liczba(s.calkowity, 2)} / ${liczba(s.centralny, 2)} / ${liczba(s.obwodowy, 2)}`
    : ""));

  return wiersz;
}

// ── panel boczny ───────────────────────────────────────────────────
function rysujAnalize() {
  // uwagi
  const kontener = $("#uwagi");
  kontener.replaceChildren();
  const bledy = obraz.uwagi.filter((u) => u.poziom === "blad");
  const ostrzezenia = obraz.uwagi.filter((u) => u.poziom === "ostrzezenie");

  if (bledy.length === 0 && ostrzezenia.length === 0) {
    kontener.append(el("p", "wskazowka", "✓ Plan można wysłać klientowi."));
  }
  for (const u of [...bledy, ...ostrzezenia]) {
    const wpis = el("div", `uwaga-wpis ${u.poziom}`);
    wpis.append(el("div", "opis", `${u.poziom === "blad" ? "✗" : "⚠"} ${u.opis} (${u.pozycje.length})`));
    const lista = el("ul");
    for (const p of u.pozycje.slice(0, 5)) lista.append(el("li", "", p));
    if (u.pozycje.length > 5) lista.append(el("li", "", `… i ${u.pozycje.length - 5} więcej`));
    wpis.append(lista);
    kontener.append(wpis);
  }

  // obciążenie tydzień po tygodniu
  const obciazenie = $("#obciazenie");
  obciazenie.replaceChildren();
  const maks = Math.max(...obraz.wynik.tygodnie.map((t) => t.bilans.razem), 0.001);
  const dni = obraz.wynik.dniTreningowe;
  if (dni > 0) {
    const [min, max] = obraz.normy.stresTygodniowy;
    obciazenie.append(el("p", "wskazowka", `norma ${min * dni}–${max * dni} na tydzień`));
  }
  for (const t of obraz.wynik.tygodnie) {
    obciazenie.append(wierszMiary(`T${t.tydzien}`, t.bilans.razem, maks, t.ocenaStresu));
  }

  // wzorce ruchu
  const wzorce = $("#wzorce");
  wzorce.replaceChildren();
  const bilans = obraz.wynik.tygodnie[tydzien - 1].bilans;
  const maksWzorca = Math.max(...bilans.wzorce.map((w) => w.calkowity), 0.001);
  const SKROT_WZORCA = { s: "przysiad", d: "m. ciąg", b: "wycisk.", r: "wiosł.", c: "core" };
  for (const w of bilans.wzorce) {
    const ocena = obraz.wynik.ocenaObjetosci[w.part];
    wzorce.append(wierszMiary(SKROT_WZORCA[w.part] ?? w.part, w.calkowity, maksWzorca, ocena?.ocena ?? ""));
  }
  if (bilans.razem > 0) {
    const proc = (x) => Math.round((x / bilans.razem) * 100);
    wzorce.append(el("p", "wskazowka",
      `dolne/górne ${proc(bilans.dolne)}%/${proc(bilans.gorne)}% · ` +
      `centr./obw. ${Math.round(bilans.centralny / (bilans.centralny + bilans.obwodowy) * 100) || 0}%/` +
      `${Math.round(bilans.obwodowy / (bilans.centralny + bilans.obwodowy) * 100) || 0}%`));
  }
  const ile = obraz.jednostronne?.slotowJednostronnych ?? 0;
  if (ile > 0) {
    const rzeczownik = ile === 1 ? "ćwiczenie jednostronne" : "ćwiczenia jednostronne";
    const slowo = ile === 1 ? rzeczownik : (ile < 5 ? rzeczownik : "ćwiczeń jednostronnych");
    wzorce.append(el("p", "wskazowka",
      `↔ ${ile} ${slowo} — licząc obie strony stres to ` +
      `${liczba(obraz.jednostronne.stresRazemObieStrony)} zamiast ` +
      `${liczba(obraz.jednostronne.stresRazemJakWArkuszu)}`));
  }
}

function wierszMiary(etykieta, wartosc, maks, ocena) {
  const wiersz = el("div", "wiersz-miary");
  const pelne = Math.round((wartosc / maks) * 10);
  wiersz.append(
    el("span", "etykieta", etykieta),
    el("span", "pasek", "█".repeat(pelne) + "░".repeat(Math.max(0, 10 - pelne))),
    el("span", "wartosc", liczba(wartosc)),
  );
  const klasa = ocena.includes("poniżej") ? "pod" : ocena.includes("powyżej") ? "nad" : "ok";
  wiersz.append(el("span", `ocena ${klasa}`, ocena));
  return wiersz;
}

// Panel serii maksymalnych zależy od tego, jakie ćwiczenia są w planie — więc
// musi się odświeżać po każdej zmianie doboru, nie tylko przy otwarciu planu.
// Przebudowa całości zabrałaby jednak fokus temu, kto właśnie wpisuje ciężar,
// dlatego przy niezmienionym zestawie ćwiczeń odświeża się samo 1RM.
let podpisSerieMax = null;

function rysujSerieMax(pelne = false) {
  const kontener = $("#serie-max");

  const uzyte = [...new Set(obraz.zapisany.plan.sloty
    .map((s) => s.cwiczenieId).filter(Boolean))];
  const podpis = `${obraz.zapisany.id}|${uzyte.join(",")}`;
  if (!pelne && podpis === podpisSerieMax) {
    odswiezObliczone1RM(kontener);
    return;
  }
  podpisSerieMax = podpis;
  kontener.replaceChildren();

  if (uzyte.length === 0) {
    kontener.append(el("p", "wskazowka", "Najpierw dobierz ćwiczenia."));
    return;
  }

  for (const id of uzyte) {
    const c = cwiczenia.find((x) => x.id === id);
    if (!c) continue;
    const istniejaca = obraz.zapisany.plan.serieMaksymalne.find((s) => s.cwiczenieId === id);

    const wiersz = el("div", "serie-max-wiersz");
    wiersz.dataset.cwiczenie = id;
    wiersz.append(el("div", "nazwa", c.nazwa));

    // Seria maksymalna ma sens tylko w komplecie: sam ciężar bez powtórzeń
    // niczego nie liczy. Dlatego stan czyta się z obu pól wiersza naraz —
    // gdyby każde pole zapisywało się osobno, pierwsze kasowałoby drugie.
    const zmien = () => {
      const [wCiezar, wPowt] = [...wiersz.querySelectorAll("input")]
        .map((i) => (i.value === "" ? 0 : Number(i.value)));
      const pozostale = obraz.zapisany.plan.serieMaksymalne
        .filter((s) => s.cwiczenieId !== id);
      obraz.zapisany.plan.serieMaksymalne = wCiezar > 0 && wPowt > 0
        ? [...pozostale, { cwiczenieId: id, ciezar: wCiezar, powtorzenia: wPowt }]
        : pozostale;
      zapiszPozniej();
    };

    for (const [wartosc, tytul] of [
      [istniejaca?.ciezar, "kg"], [istniejaca?.powtorzenia, "powt."],
    ]) {
      const input = el("input");
      input.type = "number"; input.min = "0"; input.placeholder = tytul;
      input.title = tytul;
      input.value = wartosc || "";
      input.onchange = zmien;
      wiersz.append(input);
    }

    wiersz.append(el("div", "rm", tekst1RM(id)));
    kontener.append(wiersz);
  }
}

function tekst1RM(cwiczenieId) {
  const wyliczony = obraz.wynik.tygodnie[0].sloty
    .find((s) => s.cwiczenie?.id === cwiczenieId);
  return wyliczony?.oneRM ? `${liczba(wyliczony.oneRM)}` : "—";
}

function odswiezObliczone1RM(kontener) {
  for (const wiersz of kontener.querySelectorAll(".serie-max-wiersz")) {
    wiersz.querySelector(".rm").textContent = tekst1RM(wiersz.dataset.cwiczenie);
  }
}

// ── asystent AI ────────────────────────────────────────────────────
// Trzy zasady widać wprost w tym kodzie: asystent nie podaje żadnej liczby
// treningowej, nic nie zapisuje się bez kliknięcia, a bez klucza do API
// konsola działa dokładnie tak samo — tylko przyciski są nieaktywne.
let asystent = null;
let ostatniOdczytAI = null;   // id planu, którego dotyczy to, co wisi na ekranie

function pokazModal(tytul, ...dzieci) {
  $("#modal-tytul").textContent = tytul;
  $("#modal-body").replaceChildren(...dzieci);
  $("#modal-zamknij").classList.remove("ukryty");
  $("#modal").classList.remove("ukryty");
}

function zamknijModal() {
  $("#modal").classList.add("ukryty");
}

async function wczytajStanAsystenta() {
  try {
    asystent = await api("/api/ai/stan");
  } catch {
    asystent = { dostepna: false, powod: "Nie udało się sprawdzić stanu asystenta." };
  }
  $("#ai-szkielet").disabled = !asystent.dostepna;
  $("#ai-analiza").disabled = !asystent.dostepna;
  if (!asystent.dostepna) {
    $("#ai-wynik").replaceChildren(el("p", "wskazowka", asystent.powod));
  }
}

/** Koszt zapytania — żeby nie było niespodzianek na rachunku. */
function kosztem(uzycie) {
  const centy = Math.round(uzycie.koszt * 100);
  return el("p", "wskazowka", centy < 1
    ? "Koszt zapytania: poniżej centa."
    : `Koszt zapytania: ok. ${centy} ${centy === 1 ? "cent" : "centów"}.`);
}

function poleTekstowe(etykieta, nazwa, wartosc = "", podpowiedz = "") {
  const l = el("label", "", `${etykieta} `);
  const i = el("input");
  i.name = nazwa;
  i.value = wartosc;
  i.placeholder = podpowiedz;
  i.autocomplete = "off";
  l.append(i);
  return l;
}

$("#ai-szkielet").onclick = () => {
  const dniWPlanie = new Set(
    obraz.zapisany.plan.sloty.filter((s) => s.cwiczenieId).map((s) => s.dzien),
  ).size;

  const form = el("form", "pola-modulu");
  form.append(
    poleTekstowe("Cel", "cel", "", "np. siła w przysiadzie, powrót do formy"),
    poleTekstowe("Staż", "staz", "", "np. rok regularnie"),
    poleTekstowe("Sprzęt", "sprzet", "", "np. sztanga, hantle, wyciąg"),
  );

  const dni = el("label", "", "Dni w tygodniu ");
  const dniPole = el("input");
  Object.assign(dniPole, { name: "dniWTygodniu", type: "number", min: 1, max: 5, value: dniWPlanie || 3 });
  dni.append(dniPole);
  form.append(dni);

  const notatka = el("label", "", "Notatka ");
  const obszar = el("textarea");
  obszar.name = "notatka";
  obszar.rows = 3;
  obszar.placeholder = "Wszystko, co jeszcze warto wiedzieć.";
  notatka.append(obszar);
  form.append(notatka);

  // Przycisk musi stać wewnątrz formularza — poza nim `type="submit"` nic nie robi.
  const wyslij = el("button", "glowny", "Zaproponuj");
  wyslij.type = "submit";
  form.append(wyslij);

  form.onsubmit = async (e) => {
    e.preventDefault();
    wyslij.disabled = true;
    wyslij.textContent = "Myślę…";
    try {
      const f = new FormData(form);
      const odp = await api(`/api/plany/${obraz.zapisany.id}/ai-szkielet`, {
        method: "POST",
        body: {
          cel: f.get("cel"), staz: f.get("staz"), sprzet: f.get("sprzet"),
          notatka: f.get("notatka"), dniWTygodniu: Number(f.get("dniWTygodniu")),
        },
      });
      pokazPropozycje(odp);
    } catch (err) {
      alert(err.message);
      wyslij.disabled = false;
      wyslij.textContent = "Zaproponuj";
    }
  };

  pokazModal("Propozycja szkieletu",
    el("p", "wskazowka",
      "Asystent dobiera kategorie i ćwiczenia. Serii, powtórzeń, RPE i ciężarów " +
      "nie dotyka — te liczy silnik, a ustawiasz Ty."),
    form,
    el("p", "wskazowka",
      "Notatka nigdzie się nie zapisuje: leci do modelu przy tym jednym zapytaniu " +
      "i znika razem z odpowiedzią."),
  );
};

function pokazPropozycje({ propozycja, uzycie, nadpisze, komunikatZdrowotny }) {
  const tresc = el("div", "propozycja-szkieletu");

  if (komunikatZdrowotny) {
    tresc.append(el("p", "wskazowka ostrzezenie", `⚠ ${komunikatZdrowotny}`));
  }
  if (propozycja.uzasadnienie) tresc.append(el("p", "", propozycja.uzasadnienie));

  for (const dzien of propozycja.dni) {
    tresc.append(el("h4", "", `Dzień ${RZYMSKIE[dzien.dzien - 1]} — ${dzien.nazwa}`));
    const tabela = el("table", "sloty");
    const cialo = el("tbody");
    for (const c of dzien.cwiczenia) {
      const w = el("tr");
      w.append(el("td", "mono", c.lp));
      const nazwa = el("td");
      nazwa.append(el("div", "nazwa", c.nazwa));
      nazwa.append(el("div", "wskazowka", c.powod));
      if (c.znaczniki.length) nazwa.append(el("div", "wskazowka ostrzezenie", c.znaczniki.join(" · ")));
      w.append(nazwa);
      w.append(el("td", "wskazowka", c.kategoria));
      cialo.append(w);
    }
    tabela.append(cialo);
    tresc.append(tabela);
  }

  if (propozycja.uwagi.length) {
    tresc.append(el("p", "wskazowka", "Co poprawiliśmy w odpowiedzi modelu:"));
    const lista = el("ul", "lista-uwag");
    for (const u of propozycja.uwagi) lista.append(el("li", "wskazowka", u));
    tresc.append(lista);
  }

  const wstaw = el("button", "glowny", nadpisze > 0
    ? `Wstaw do planu (nadpisze ${nadpisze})`
    : "Wstaw do planu");
  wstaw.onclick = async () => {
    if (nadpisze > 0 && !confirm(
      `W tych dniach stoi już ${nadpisze} ćwiczeń razem z seriami i RPE. ` +
      "Wstawienie propozycji je zastąpi. Na pewno?")) return;
    wstaw.disabled = true;
    try {
      obraz = await api(`/api/plany/${obraz.zapisany.id}/ai-wstaw`, {
        method: "POST",
        body: { propozycja },
      });
      zamknijModal();
      rysujPlan();
    } catch (err) {
      alert(err.message);
      wstaw.disabled = false;
    }
  };

  const odrzuc = el("button", "", "Odrzuć");
  odrzuc.onclick = zamknijModal;

  const akcje = el("div", "akcje-modala");
  akcje.append(wstaw, odrzuc);

  pokazModal("Propozycja szkieletu", tresc, kosztem(uzycie), akcje);
  // „Odrzuć" mówi to samo co „Zamknij", a wyraźniej: propozycja nigdzie
  // nie została zapisana. Dwa przyciski o tym samym znaczeniu to jeden za dużo.
  $("#modal-zamknij").classList.add("ukryty");
}

$("#ai-analiza").onclick = async () => {
  const przycisk = $("#ai-analiza");
  const kontener = $("#ai-wynik");
  przycisk.disabled = true;
  przycisk.textContent = "Czytam…";
  kontener.replaceChildren(el("p", "wskazowka", "Czytam analizę…"));
  try {
    const { odczyt, uzycie } = await api(`/api/plany/${obraz.zapisany.id}/ai-analiza`, {
      method: "POST", body: {},
    });
    kontener.replaceChildren();
    if (odczyt.podsumowanie) kontener.append(el("p", "podsumowanie-ai", odczyt.podsumowanie));
    for (const s of odczyt.spostrzezenia) {
      const blok = el("div", `spostrzezenie waga-${s.waga.replace("ś", "s")}`);
      blok.append(el("div", "nazwa", s.tytul), el("p", "", s.tresc));
      kontener.append(blok);
    }
    if (odczyt.doSprawdzenia.length) {
      kontener.append(el("p", "wskazowka", "Do rozstrzygnięcia przez Ciebie:"));
      const lista = el("ul", "lista-uwag");
      for (const p of odczyt.doSprawdzenia) lista.append(el("li", "wskazowka", p));
      kontener.append(lista);
    }
    kontener.append(kosztem(uzycie));
    ostatniOdczytAI = obraz.zapisany.id;
  } catch (err) {
    kontener.replaceChildren(el("p", "wskazowka ostrzezenie", err.message));
  } finally {
    przycisk.disabled = false;
    przycisk.textContent = "Odczytaj analizę";
  }
};

/**
 * Wypełnianie sześciu tygodni naraz.
 *
 * To jedyne miejsce, w którym konsola była gorsza od arkusza: szablon 5.18
 * przychodzi z wypełnionymi parametrami na cały cykl, a konsola kazała wpisać
 * je od zera — przy planie na trzy dni po piętnaście pozycji to około
 * dziewięćdziesięciu pól.
 *
 * Wartości lądują w polach **widocznie**, jako zwykłe liczby do poprawienia.
 * Żadnej ukrytej domyślności: ta sama zasada, po której eksport wpisuje do
 * arkusza liczby policzone, a nie puste komórki.
 */
async function wypelnijTygodnie(tryb) {
  const opis = tryb === "progresja"
    ? "Progresja z szablonu 5.18 nadpisze serie, powtórzenia i RPE we wszystkich sześciu tygodniach."
    : `Parametry z tygodnia ${tydzien} nadpiszą pozostałe pięć tygodni.`;
  if (!confirm(`${opis}\n\nOceny klienta i ręcznie ustawione ciężary zostają. Na pewno?`)) return;

  try {
    obraz = await api(`/api/plany/${obraz.zapisany.id}/tygodnie`, {
      method: "POST",
      body: { tryb, zrodlo: tydzien },
    });
    rysujPlan();
  } catch (err) {
    alert(err.message);
  }
}

$("#progresja-szablonu").onclick = () => wypelnijTygodnie("progresja");
$("#kopiuj-tydzien").onclick = () => wypelnijTygodnie("kopiuj");

/**
 * Status planu — jedyne miejsce, w którym się go zmienia.
 *
 * To nie jest ozdoba: klient widzi pod swoim linkiem **tylko plan oznaczony
 * jako wysłany**. Szkic zostaje u trenera, więc dopóki nie przestawisz tego
 * pola, klient widzi komunikat, że plan jest w przygotowaniu.
 */
$("#status-wybor").onchange = async (e) => {
  const nowy = e.target.value;
  const poprzedni = obraz.zapisany.status;

  // Kontrola planu nie blokuje wysyłki — to decyzja trenera. Ale musi paść
  // wprost, bo klient zobaczy plan dokładnie takim, jaki jest.
  if (nowy === "wysłany" && !obraz.gotowy) {
    const uwagi = obraz.uwagi.filter((u) => u.poziom === "blad").map((u) => u.opis);
    const potwierdzone = confirm(
      `Kontrola planu zgłasza błędy:\n\n${uwagi.join("\n")}\n\n` +
      "Klient zobaczy plan takim, jaki jest. Wysłać mimo to?");
    if (!potwierdzone) {
      e.target.value = poprzedni;
      return;
    }
  }

  try {
    obraz = await api(`/api/plany/${obraz.zapisany.id}`, { method: "PUT", body: { status: nowy } });
    rysujPlan();
  } catch (err) {
    alert(err.message);
    e.target.value = poprzedni;
    return;
  }

  // Wysłany plan bez linku to plan, którego nikt nie zobaczy — pokazujemy
  // link od razu, zamiast czekać, aż trener sam się zorientuje.
  if (nowy === "wysłany" && !obraz.klient?.token) {
    pokazLinkKlienta(obraz.zapisany.klientId);
  }
};

// ── eksport ────────────────────────────────────────────────────────
$("#eksportuj").onclick = async () => {
  const przycisk = $("#eksportuj");
  przycisk.disabled = true;
  przycisk.textContent = "Eksportuję…";
  try {
    const { plik } = await api(`/api/plany/${obraz.zapisany.id}/eksport`, { method: "POST" });
    $("#modal-tytul").textContent = "Arkusz gotowy";
    $("#modal-body").replaceChildren();
    $("#modal-body").append(
      el("p", "", "Plik zapisany na dysku:"),
      el("code", "", plik),
      el("p", "wskazowka",
        obraz.gotowy
          ? "Plan przeszedł kontrolę — można wysyłać."
          : "Uwaga: plan ma otwarte błędy. Sprawdź panel „Kontrola planu” przed wysyłką."),
    );
    $("#modal").classList.remove("ukryty");
  } catch (err) {
    alert(err.message);
  } finally {
    przycisk.disabled = false;
    przycisk.textContent = "Eksportuj arkusz";
  }
};
/**
 * Link dla klienta. Jeden na klienta i na stałe — nie na plan.
 *
 * Wcześniej token wisiał przy planie, więc każdy nowy cykl znaczył nowy adres
 * do wysłania, a stary link zamrażał klienta na poprzednim planie. Teraz ten
 * sam adres pokazuje po prostu aktualny cykl.
 */
async function pokazLinkKlienta(klientId) {
  try {
    const { sciezka, widocznyPlan } = await api(`/api/klienci/${klientId}/link`, {
      method: "POST", body: {},
    });
    const adres = `${location.origin}${sciezka}`;

    const pole = el("code", "", adres);
    const kopiuj = el("button", "glowny", "Kopiuj link");
    kopiuj.onclick = async () => {
      try {
        await navigator.clipboard.writeText(adres);
        kopiuj.textContent = "Skopiowane ✓";
      } catch {
        kopiuj.textContent = "Zaznacz i skopiuj ręcznie";
      }
    };
    const uniewaznij = el("button", "", "Unieważnij link");
    uniewaznij.onclick = async () => {
      if (!confirm("Stary link przestanie działać u klienta. Na pewno?")) return;
      await api(`/api/klienci/${klientId}/link`, { method: "DELETE" });
      zamknijModal();
      if (kartoteka?.klient.id === klientId) otworzKlienta(klientId);
    };
    const akcje = el("div", "akcje-modala");
    akcje.append(kopiuj, uniewaznij);

    const tresc = [
      el("p", "", "Wyślij klientowi. Otworzy się na telefonie, działa też bez zasięgu."),
      pole,
    ];
    // Szkic nie pokazuje się klientowi — lepiej powiedzieć to teraz niż
    // pozwolić wysłać link do pustej strony.
    tresc.push(widocznyPlan
      ? el("p", "wskazowka",
          "Ten sam link działa przez kolejne cykle: gdy oznaczysz nowy plan jako " +
          "wysłany, klient zobaczy go bez wymiany adresu.")
      : el("p", "wskazowka ostrzezenie",
          "⚠ Klient nie ma jeszcze aktywnego planu — zobaczy komunikat, że czekasz " +
          "z przygotowaniem. Szkic nie jest widoczny; oznacz plan jako „wysłany”."));
    tresc.push(el("p", "wskazowka",
      "Kto ma link, ten widzi plan — bez hasła. Przy kilkunastu klientach to " +
      "proporcjonalne. Gdyby link wyciekł, unieważnij go i wygeneruj nowy."));

    pokazModal("Link dla klienta", ...tresc, akcje);
  } catch (err) {
    alert(err.message);
  }
}

$("#link-klienta").onclick = () => pokazLinkKlienta(obraz.zapisany.klientId);

$("#modal-zamknij").onclick = () => $("#modal").classList.add("ukryty");

// ── start ──────────────────────────────────────────────────────────
(async () => {
  cwiczenia = await api("/api/cwiczenia");
  cwiczenia.sort((a, b) => a.nazwa.localeCompare(b.nazwa, "pl"));
  await wczytajStanAsystenta();
  await pokazListe();
})();
