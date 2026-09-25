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

/** Tabela RPE kończy się na piętnastu powtórzeniach — tyle, co POWT_MAX w silniku. */
const MAKS_POWTORZEN_SERII = 15;

/**
 * Dlaczego przy tym ćwiczeniu nie ma serii maksymalnej. Te same zdania, co
 * `dlaczegoBezSeriiMaksymalnej` w silniku — przeglądarka nie importuje modułów
 * silnika, więc jedno powtórzenie jest tu ceną za brak zaplecza budującego.
 */
const POWODY_BEZ_SERII = {
  "masa ciała": "Ćwiczenie na masie ciała — nie ma czego zmierzyć ani dołożyć.",
  "czas": "Ćwiczenie na czas — liczy się utrzymanie pozycji, nie kilogramy.",
  "dystans": "Ćwiczenie na dystans — liczy się odległość, nie kilogramy.",
  "ręczne ustawienie": "Ciężar do tego ćwiczenia ustala się wprost, nie z 1RM.",
};
/**
 * Tygodnie po cyklu — te same stałe co w silniku (`plan.ts`). Klucze są
 * stałe: 7 to deload, 8 to maksy; bez deloadu maksy są na ekranie siódme.
 */
const TYDZIEN_DELOADU = 7;
const TYDZIEN_MAKSOW = 8;
const tygodniePlanu = (plan) => [1, 2, 3, 4, 5, 6,
  ...(plan.deload ? [TYDZIEN_DELOADU] : []), ...(plan.tydzienMaksow ? [TYDZIEN_MAKSOW] : [])];
const numerTygodnia = (plan, t) => (t === TYDZIEN_MAKSOW && !plan.deload ? TYDZIEN_DELOADU : t);
const etykietaTygodnia = (plan, t) => t === TYDZIEN_DELOADU ? "T7 deload"
  : t === TYDZIEN_MAKSOW ? `T${numerTygodnia(plan, t)} maksy` : `T${t}`;
/** Tydzień z wyniku — roboczy albo dodatkowy. `undefined`, gdy serwer jeszcze nie przeliczył. */
const wyliczonyTydzienNr = (t) => obraz.wynik.tygodnie.find((x) => x.tydzien === t)
  ?? (obraz.wynik.tygodnieDodatkowe ?? []).find((x) => x.tydzien === t);
/** Co zrobić po najbliższym udanym zapisie — np. przerysować zakładki tygodni. */
let poZapisie = null;

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
  if (!odp.ok) {
    const blad = new Error(dane.blad ?? "Błąd serwera");
    // Konflikt zapisu niesie ze sobą świeży plan — wołający ma czym pogodzić
    // swoją wersję z tą, którą zdążył zapisać ktoś inny.
    if (dane.aktualny) blad.aktualny = dane.aktualny;
    throw blad;
  }
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
          : k.cykl.poCyklu ? " · po cyklu" : ` · T${k.cykl.tydzien}/${k.cykl.tygodni ?? 6}`;
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
    // Najpilniejszy powód na tej liście: klient nie ma już czego trenować.
    "zrobiony": `przerobił cały cykl (${p.ukonczonych} treningów) — czas na nowy`,
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
  // Słowami, nie „2+1/12": objaśnienie tego zapisu stało tylko w dymku po
  // najechaniu myszą, a na iPadzie dymków nie ma.
  // „·", nie „+": plus czytał się jak dodawanie (2 + 1 = 3 treningi?),
  // a zaczęty trening nie jest domkniętym.
  const zaczete = r.rozpoczetych
    ? ` · ${r.rozpoczetych} ${odmiana(r.rozpoczetych, ["zaczęty", "zaczęte", "zaczętych"])}`
    : "";
  const rada = klasa === "stanal" ? " — zapytaj, co się dzieje" : "";
  const s = el("span", `sygnal ${klasa}`,
    `${znak} treningi: ${r.ukonczonych} z ${r.zaplanowanych}${zaczete} · ${opis}${rada}`);
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

  // Co robią przyciski przy cyklu — dotąd tylko w dymku „Nowej wersji".
  lista.append(el("p", "wskazowka",
    "„Otwórz” — edycja tego cyklu. „Nowa wersja” — kolejny cykl z tym samym "
    + "doborem ćwiczeń, połączony z tym."));

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
        : p.cykl.poCyklu ? " · po cyklu" : ` · T${p.cykl.tydzien}/${p.cykl.tygodni ?? 6}`;
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

/**
 * Co należy do klienta, a nie do trenera.
 *
 * Oceny treningu i serie maksymalne wpisane z telefonu trafiają do tego samego
 * planu, który trener ma otwarty na ekranie. Gdy oba zapisy się miną, wygrywa
 * ten późniejszy — i kopia trenera, sprzed oceny, kasowała to, co klient
 * właśnie wpisał. Ciężary wracały do poprzednich, bez śladu na ekranie.
 *
 * Serwer odrzuca teraz zapis oparty na nieaktualnej wersji i oddaje świeży
 * plan. Tutaj przenosimy z niego to, co należy do klienta, na to, co trener
 * ma przed sobą — i zapisujemy jeszcze raz. Bez pytania go o cokolwiek, bo
 * nie ma tu żadnej sprzeczności do rozstrzygnięcia: każda strona zmieniała
 * co innego.
 */
function przejmijOdKlienta(mojPlan, swiezyPlan) {
  const swiezeSloty = new Map(swiezyPlan.sloty.map((s) => [s.positionId, s]));
  for (const slot of mojPlan.sloty) {
    const swiezy = swiezeSloty.get(slot.positionId);
    if (!swiezy) continue;
    for (const t of ["1", "2", "3", "4", "5", "6"]) {
      const ocena = swiezy.tygodnie?.[t]?.feedback;
      if (ocena === undefined) continue;
      slot.tygodnie ??= {};
      slot.tygodnie[t] ??= {};
      slot.tygodnie[t].feedback = ocena;
    }
  }
  mojPlan.serieMaksymalne = swiezyPlan.serieMaksymalne;
  return mojPlan;
}

function zapiszPozniej() {
  $("#zapis").textContent = "zapisywanie…";
  clearTimeout(czekaZapis);
  czekaZapis = setTimeout(async () => {
    const wyslij = () => api(`/api/plany/${obraz.zapisany.id}`, {
      method: "PUT",
      body: {
        plan: obraz.zapisany.plan,
        dataStartu: obraz.zapisany.dataStartu,
        status: obraz.zapisany.status,
        zmieniony: obraz.zapisany.zmieniony,
      },
    });

    try {
      try {
        obraz = await wyslij();
      } catch (err) {
        if (!err.aktualny) throw err;
        // Ktoś nas ubiegł — godzimy obie wersje i próbujemy raz jeszcze.
        obraz.zapisany.plan = przejmijOdKlienta(obraz.zapisany.plan, err.aktualny.zapisany.plan);
        obraz.zapisany.zmieniony = err.aktualny.zapisany.zmieniony;
        obraz = await wyslij();
      }
      $("#zapis").textContent = "zapisano";
      rysujAnalize();
      rysujDni();
      rysujSerieMax();
      if (poZapisie) { const f = poZapisie; poZapisie = null; f(); }
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
  pokazKoniecCyklu();


  rysujTaby();

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
 * Zakładki tygodni i przełączniki tygodni po cyklu.
 *
 * Deload i maksy to decyzja trenera przy konkretnym planie (25.09.2026):
 * deload „jak T6, RPE niżej, bez TOP SETU" (o 1 w skali planu — „spójne
 * z resztą planu"), maksy 1 × 1 @ RPE 10,
 * wszystkie boje jednego dnia, najpierw deload — jak w jego periodyzacji.
 */
function rysujTaby() {
  const plan = obraz.zapisany.plan;
  if (!tygodniePlanu(plan).includes(tydzien)) tydzien = 6;
  const taby = $("#taby-tygodni");
  taby.replaceChildren();
  for (const t of tygodniePlanu(plan)) {
    const b = el("button", `${t === tydzien ? "aktywny" : ""} ${t > 6 ? "po-cyklu" : ""}`,
      etykietaTygodnia(plan, t));
    // Bez `type` przycisk jest przyciskiem wysyłki formularza. Poza formularzem
    // nic to nie robi, ale zostawianie tego przypadkowi nie ma sensu.
    b.type = "button";
    b.onclick = () => { tydzien = t; rysujPlan(); };
    taby.append(b);
  }
  for (const [id, pole, nazwa] of [
    ["#przelacz-deload", "deload", "deload"], ["#przelacz-maksy", "tydzienMaksow", "maksy"],
  ]) {
    const b = $(id);
    b.classList.toggle("aktywny", !!plan[pole]);
    b.textContent = plan[pole] ? `✓ ${nazwa}` : `+ ${nazwa}`;
  }
}

/**
 * Włącza albo wyłącza tydzień po cyklu. Wyłączenie tygodnia, w którym klient
 * już coś wpisał, ukryłoby jego wpisy — więc wtedy pytamy.
 */
function przelaczTydzienPoCyklu(pole, numer) {
  const plan = obraz.zapisany.plan;
  if (plan[pole]) {
    const wpisy = (obraz.zapisany.wykonania ?? []).filter((w) => w.tydzien === numer).length;
    if (wpisy > 0 && !confirm(`Klient ma już ${wpisy} ${wpisy === 1 ? "wpis" : "wpisów"} `
      + "w tym tygodniu. Po wyłączeniu zostaną w bazie, ale nie będzie ich widać. Wyłączyć?")) {
      return;
    }
    plan[pole] = false;
  } else {
    plan[pole] = true;
    tydzien = numer;   // od razu pokaż, co doszło
  }
  rysujTaby();
  pokazKoniecCyklu();
  poZapisie = () => rysujPlan();
  zapiszPozniej();
}
$("#przelacz-deload").onclick = () => przelaczTydzienPoCyklu("deload", TYDZIEN_DELOADU);
$("#przelacz-maksy").onclick = () => przelaczTydzienPoCyklu("tydzienMaksow", TYDZIEN_MAKSOW);

/**
 * ODDECH i BIEG — dwa kalkulatory towarzyszące planowi siłowemu.
 * Nie dotykają ciężarów ani stresu; liczą się z własnych pól i tyle.
 */
function rysujModuly() {
  const m = obraz.moduly;

  $("#oddech-twot").value = m.oddech.wejscie.twot ?? "";
  $("#oddech-przeciwwskazania").checked = Boolean(m.oddech.wejscie.przeciwwskazania);

  // Pole „któreś z przeciwwskazań" jest twardym zatrzymaniem modułu, a przez
  // pierwsze wersje stało samo — trener musiał z pamięci wiedzieć, co się
  // liczy. Lista przychodzi z silnika, tego samego, który potem zatrzymuje
  // dawkę, więc nie ma jak się rozjechać.
  const lista = $("#oddech-lista");
  if (lista.children.length === 0) {
    lista.replaceChildren(
      ...(m.oddech.przeciwwskazaniaLista ?? []).map((p) => el("li", "", p)));
  }

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
      // Bez wieku i bez zmierzonego HR max tętna nie da się policzyć.
      // Pytamy o liczbę, a nie o sam obiekt strefy — ta bywa i pełna,
      // i pusta, i z pustymi wartościami w środku.
      w.append(el("td", "mono",
        j.strefa?.odUd != null ? `${j.strefa.odUd}–${j.strefa.doUd}` : "—"));
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
    wiersz.append(el("span", "etykieta", t.rodzaj
      ? etykietaTygodnia(obraz.zapisany.plan, t.tydzien) : `T${t.tydzien}`));
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
    // Zgłoszone z iPada: „0 z 2 + 1 zaczęty" łamało się na trzy linijki
    // w wąskiej kolumnie, a „+" czytał się jak dodawanie. Teraz w jednej
    // linii: ile domkniętych z ilu, a obok — ile zaczętych bez domknięcia.
    const podpis = t.rozpoczetych
      ? `${t.ukonczonych} z ${t.zDnia} · ${t.rozpoczetych} ${odmiana(t.rozpoczetych, ["zaczęty", "zaczęte", "zaczętych"])}`
      : `${t.ukonczonych} z ${t.zDnia}`;
    wiersz.append(el("span", "wartosc wartosc-realizacji", podpis));
    kontener.append(wiersz);
  }

  // Legenda kropek — dotąd w dymku każdej z nich, czyli na iPadzie nigdzie.
  const legenda = el("p", "wskazowka legenda-kropek");
  legenda.append(
    el("span", "kropka zrobiona", "●"), document.createTextNode(" domknięty  "),
    el("span", "kropka zaczeta", "●"), document.createTextNode(" zaczęty, bez „Zakończ trening”  "),
    el("span", "kropka", "●"), document.createTextNode(" jeszcze nie"),
  );
  kontener.append(legenda);

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
  pokazKoniecCyklu();
  zapiszPozniej();
};

/**
 * Data końca cyklu pod polem „Start" — liczona z liczby tygodni planu, bo
 * z deloadem i maksami cykl ma siedem albo osiem tygodni, nie sześć.
 * Pusta data startu to częsta rzecz, a bez niej „wymaga uwagi" nie zgłosi
 * końca cyklu — stąd zdanie, które do jej wpisania zachęca.
 */
const DNI_TYGODNIA = ["nd", "pn", "wt", "śr", "cz", "pt", "sb"];
function pokazKoniecCyklu() {
  const pole = $("#koniec-cyklu");
  const start = obraz.zapisany.dataStartu;
  const tygodni = tygodniePlanu(obraz.zapisany.plan).length;
  if (!start) {
    pole.textContent = `wpisz datę — zobaczysz koniec cyklu (${tygodni} tyg.)`;
    return;
  }
  // Południe UTC, żeby strefa czasowa nie przesunęła dnia.
  const dzien = (przesuniecie) => {
    const d = new Date(`${start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + przesuniecie);
    return `${DNI_TYGODNIA[d.getUTCDay()]} ${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  pole.textContent = `koniec: ${dzien(tygodni * 7 - 1)} · ${tygodni} tyg. · T4 od ${dzien(21)}`;
}

function slotPlanu(positionId) {
  return obraz.zapisany.plan.sloty.find((s) => s.positionId === positionId);
}
function slotWyliczony(positionId) {
  return wyliczonyTydzienNr(tydzien)?.sloty.find((s) => s.positionId === positionId);
}

/**
 * Legenda znaków w tabeli planu — widoczna, a nie w dymkach.
 *
 * Znaczenie przycisków » T R i znaczników TS, RPE, ●, ↔, +5% stało dotąd
 * wyłącznie w dymkach po najechaniu myszą. Na iPadzie najechania nie ma, więc
 * nie było go wcale — a trener pracuje na zmianę na laptopie i na iPadzie
 * i na obu ma czytać ten sam plan tak samo. Zwinięcie legendy zostaje
 * zapamiętane: kto ją zna, nie musi jej oglądać przy każdym planie.
 */
const KLUCZ_LEGENDY = "legenda-planu-zwinieta";
function legendaPlanu() {
  const d = el("details", "legenda");
  let zwinieta = false;
  try { zwinieta = localStorage.getItem(KLUCZ_LEGENDY) === "1"; } catch { /* bez pamięci */ }
  d.open = !zwinieta;
  d.append(el("summary", "", "Legenda znaków w tabeli"));
  const lista = el("div", "legenda-lista");
  for (const [znak, opis] of [
    ["▲ ▼", "przenieś ćwiczenie"],
    ["»", "skopiuj parametry tego tygodnia na pozostałe"],
    ["T", "dodaj lub zdejmij TOP SET"],
    ["R", "licz ciężar akcesorium z RPE"],
    ["TS", "przy numerze: ćwiczenie ma TOP SET"],
    ["RPE", "przy numerze: ciężar liczony z RPE"],
    ["●", "ciężar wpisany na sztywno — wyczyść pole, żeby wrócić do liczonego"],
    ["↔", "ciężar na stronę"],
    ["+5%", "korekta z ocen klienta"],
  ]) {
    const poz = el("span", "legenda-pozycja");
    poz.append(el("b", "", znak), document.createTextNode(` ${opis}`));
    lista.append(poz);
  }
  d.append(lista);
  d.append(el("p", "legenda-dopisek",
    "Puste pole ciężaru liczy się samo — z 1RM, RPE i ocen klienta."));
  d.ontoggle = () => {
    try { localStorage.setItem(KLUCZ_LEGENDY, d.open ? "0" : "1"); } catch { /* bez pamięci */ }
  };
  return d;
}

function rysujDni() {
  const kontener = $("#dni");
  kontener.replaceChildren();
  const wyliczonyTydzien = wyliczonyTydzienNr(tydzien);
  // Tydzień właśnie włączony — wynik z serwera dojdzie za chwilę.
  if (!wyliczonyTydzien) {
    kontener.append(el("p", "wskazowka", "Przeliczam…"));
    return;
  }
  if (tydzien === TYDZIEN_MAKSOW) {
    rysujTydzienMaksow(kontener, wyliczonyTydzien);
    return;
  }
  kontener.append(legendaPlanu());
  if (tydzien === TYDZIEN_DELOADU) {
    kontener.append(el("p", "wskazowka opis-po-cyklu",
      "Deload: serie i powtórzenia jak w T6, RPE o 1 niżej, bez TOP SETU. "
      + "Ciężar liczy się z tabeli; każdą liczbę możesz poprawić ręcznie."));
  }

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

    /*
     * TOP SET — pasek nad tabelą, jak wiersz TOP SET w arkuszu.
     *
     * Pokazuje się tylko wtedy, gdy trener TOP SET faktycznie dodał. Dawniej
     * wisiał w każdym dniu z wyłączoną kratką, a ćwiczenie brał na sztywno
     * z pierwszego wiersza. Teraz ćwiczenie wskazuje trener przyciskiem „T"
     * przy dowolnym wierszu, a tutaj zostaje to, czym pasek ma być: nazwa,
     * RPE i ciężar.
     */
    const top = (obraz.zapisany.plan.topSety ?? []).find((t) => t.dzien === dzien);
    // W deloadzie TOP SETU nie ma — pasek z polem RPE sugerowałby, że jest.
    if (top?.wlaczony && maCwiczenia && tydzien <= 6) {
      const wyliczony = wyliczonyTydzien.topSety.find((t) => t.dzien === dzien);
      // Nazwa wprost z planu, nie z wyniku — po kliknięciu „T" ma być widać
      // od razu, a wynik z serwera dojdzie chwilę później razem z ciężarem.
      const zrodlo = slotPlanu(top.slotPositionId);
      const nazwa = cwiczenia.find((c) => c.id === zrodlo?.cwiczenieId)?.nazwa
        ?? wyliczony?.cwiczenie?.nazwa ?? "—";
      const pasek = el("div", "topset");
      /*
       * RPE należy do TYGODNIA, nie do całego cyklu.
       *
       * W arkuszach trenera RPE TOP SETU rośnie o pół stopnia na tydzień —
       * 6 → 6,5 → 7 → 7,5 → 8 w cz.1, o stopień wyżej w cz.2 — a w T1 TOP SETU
       * nie ma wcale. Pole działa więc jak pozostałe pola planu: puste znaczy
       * „liczba z szablonu" i pokazuje ją jako podpowiedź, wpisana wygrywa,
       * wyczyszczenie wraca do szablonu. Dotyczy tygodnia, który stoi na
       * ekranie — tak samo jak serie i powtórzenia niżej.
       */
      const rpe = el("input");
      rpe.type = "number"; rpe.step = "0.5"; rpe.min = "5"; rpe.max = "10";
      rpe.style.width = "4rem";
      rpe.placeholder = wyliczony?.rpe != null ? String(wyliczony.rpe) : "—";
      rpe.value = top.rpeTygodni?.[tydzien] ?? "";
      rpe.title = wyliczony?.rpe == null
        ? `W T${tydzien} szablon nie przewiduje TOP SETU. Wpisz RPE, jeśli mimo to ma tu być.`
        : `RPE w T${tydzien}. Puste = z szablonu (${wyliczony.rpe}).`;
      rpe.onchange = () => {
        top.rpeTygodni = top.rpeTygodni ?? {};
        if (rpe.value === "") delete top.rpeTygodni[tydzien];
        else top.rpeTygodni[tydzien] = Number(rpe.value);
        zapiszPozniej();
        rysujDni();
      };
      const usun = el("button", "mikro", "✕");
      usun.title = "Usuń TOP SET z tego dnia";
      usun.onclick = () => { top.wlaczony = false; zapiszPozniej(); rysujDni(); };
      pasek.append(el("span", "etykieta", "TOP SET"),
        el("span", "", nazwa),
        el("span", "", "RPE"), rpe,
        el("span", "wynik", typeof wyliczony?.ciezar === "number"
          ? `${liczba(wyliczony.ciezar)} kg`
          : (wyliczony?.rpe == null ? `w T${tydzien} bez TOP SETU` : (wyliczony?.ciezar || "—"))),
        usun);
      if (wyliczony?.rpe == null) pasek.classList.add("bez-top-setu");
      blok.append(pasek);
    }

    const tabela = el("table", "sloty");
    const glowa = el("thead");
    const wierszNaglowka = el("tr");
    // Klasy nagłówków muszą zgadzać się z komórkami niżej — po nich telefon
    // chowa całe kolumny, których się tam nie czyta.
    for (const [tekst, klasa] of [["Lp.", "lp"], ["Ćwiczenie", ""], ["Szkielet", "szkielet"],
      ["Serie", ""], ["Powt.", ""], ["RPE", "rpe"], ["Ciężar", ""], ["stres t/c/p", "stres"]]) {
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

/**
 * Tydzień maksów — jeden dzień, 1 × 1 @ RPE 10 w zaznaczonych bojach.
 *
 * Domyślnie zaznaczone są przysiady, wyciskanie leżąc i martwe ciągi z planu
 * (lista od TOP SETU). Trener może odznaczyć albo dołożyć każde ćwiczenie na
 * kilogramy. Wynik klienta wchodzi do nowej wersji planu jako seria
 * maksymalna — dlatego stoi tu obok obecnego 1RM.
 */
function rysujTydzienMaksow(kontener, t8) {
  const plan = obraz.zapisany.plan;
  const blok = el("section", "dzien maksy");
  const naglowek = el("div", "dzien-naglowek");
  naglowek.append(el("span", "tytul", "Dzień maksów"),
    el("span", "suma", "1 × 1 @ RPE 10 · wszystkie boje jednego dnia"));
  blok.append(naglowek);
  blok.append(el("p", "wskazowka opis-po-cyklu",
    "Zaznacz boje do sprawdzenia. Klient robi rozgrzewkę i jedno powtórzenie na maksa. "
    + "Wynik wejdzie do nowej wersji planu jako seria maksymalna."));

  const wybrane = t8.sloty.map((s) => s.cwiczenie.id);
  // Kandydaci: ćwiczenia z T6 (po podmianach), po razie, tylko na kilogramy.
  const kandydaci = [];
  for (const s of wyliczonyTydzienNr(6).sloty) {
    const c = s.cwiczenie;
    if (!c || c.progresja in POWODY_BEZ_SERII || kandydaci.some((k) => k.id === c.id)) continue;
    kandydaci.push({ id: c.id, nazwa: c.nazwa, oneRM: s.oneRM, positionId: s.positionId });
  }
  if (kandydaci.length === 0) {
    blok.append(el("p", "wskazowka", "W planie nie ma ćwiczeń na kilogramy do zmaksowania."));
  }

  const tabela = el("table", "sloty maksy");
  const glowa = el("tr");
  for (const [tekst, klasa] of [["", ""], ["Bój", ""], ["1RM teraz", ""], ["Wynik klienta", ""]]) {
    glowa.append(el("th", klasa, tekst));
  }
  tabela.append(el("thead"));
  tabela.firstChild.append(glowa);
  const cialo = el("tbody");
  for (const k of kandydaci) {
    const wiersz = el("tr", wybrane.includes(k.id) ? "wybrany" : "");
    const pole = el("input");
    pole.type = "checkbox";
    pole.checked = wybrane.includes(k.id);
    pole.setAttribute("aria-label", `Maksuj: ${k.nazwa}`);
    pole.onchange = () => {
      // Kolejność prób jak w planie — zwykle przysiad, wyciskanie, martwy.
      plan.cwiczeniaMaksow = kandydaci
        .filter((x) => (x.id === k.id ? pole.checked : wybrane.includes(x.id)))
        .map((x) => x.id);
      zapiszPozniej();
    };
    const zaznacz = el("td", "");
    zaznacz.append(pole);
    const wSlot = t8.sloty.find((s) => s.cwiczenie.id === k.id);
    const oneRM = typeof wSlot?.ciezar === "number" ? wSlot.ciezar : k.oneRM;
    const wynik = (obraz.zapisany.wykonania ?? []).find((w) => w.tydzien === TYDZIEN_MAKSOW
      && w.cwiczenieId === k.id && w.ciezarWykonany);
    wiersz.append(zaznacz, el("td", "cwiczenie", k.nazwa),
      el("td", "ciezar", oneRM ? `${liczba(oneRM)} kg` : "brak 1RM"),
      el("td", "", wynik
        ? `${liczba(wynik.ciezarWykonany)} kg × ${wynik.powtorzeniaWykonane ?? "—"}` : "—"));
    cialo.append(wiersz);
  }
  tabela.append(cialo);
  blok.append(tabela);
  kontener.append(blok);
}

/**
 * Bój główny: pozycja A i ćwiczenie złożone (coeff 1,0). Ta sama reguła,
 * co w silniku — tylko po to, żeby nie pokazywać przycisków, które przy boju
 * i tak nic nie robią.
 */
function bojGlowny(slot) {
  const c = cwiczenia.find((x) => x.id === slot.cwiczenieId);
  return (slot.lp || "").trim().toUpperCase().startsWith("A") && c?.coeff === 1;
}

/** TOP SET dnia, do którego należy ten slot — albo `undefined`. */
function topSetDnia(dzien) {
  return (obraz.zapisany.plan.topSety ?? []).find((t) => t.dzien === dzien);
}

/** Czy TOP SET stoi właśnie przy tym ćwiczeniu. */
function jestTopSetem(slot) {
  const top = topSetDnia(slot.dzien);
  return !!top && top.wlaczony && top.slotPositionId === slot.positionId;
}

/**
 * Czy przy tym ćwiczeniu TOP SET jest zwyczajowy — wiedza trenera z BAZY,
 * przysłana razem z katalogiem. Służy podpowiedzi w dymku i niczemu więcej:
 * dodać TOP SET można wszędzie.
 */
function zwyczajowyTopSet(slot) {
  return !!cwiczenia.find((c) => c.id === slot.cwiczenieId)?.zwyczajowyTopSet;
}

/**
 * Dodaje TOP SET przy tym ćwiczeniu, przenosi go tutaj albo usuwa —
 * zależnie od tego, gdzie stoi teraz.
 */
function przelaczTopSet(slot) {
  const plan = obraz.zapisany.plan;
  if (!Array.isArray(plan.topSety)) plan.topSety = [];
  let top = topSetDnia(slot.dzien);
  if (!top) {
    // Plan z importu arkusza nie musi mieć wpisu na ten dzień.
    top = { dzien: slot.dzien, wlaczony: false, rpe: 7, slotPositionId: slot.positionId };
    plan.topSety.push(top);
  }
  const juzTutaj = top.wlaczony && top.slotPositionId === slot.positionId;
  top.wlaczony = !juzTutaj;
  top.slotPositionId = slot.positionId;
  zapiszPozniej();
  rysujDni();
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
    /*
     * Rozniesienie parametrów TEGO ćwiczenia na pozostałe tygodnie.
     *
     * Wcześniej stał na to przycisk u góry ekranu, ale obejmował cały plan —
     * czyli robił sześć identycznych tygodni i kasował progresję. Trener nazwał
     * to wprost: „jedno ćwiczenie może i miałoby sens, ale na pewno nie cały
     * plan". Kopiowanie zostało więc tam, gdzie ma sens, i nigdzie indziej.
     */
    // Po cyklu (deload) », T i R nic nie znaczą: kopiowałyby deload na
    // tygodnie pracy, a TOP SETU i trybu ciężaru deload nie ma.
    const poCyklu = tydzien > 6;
    const rozniesc = el("button", "mikro", "»");
    rozniesc.title = `Skopiuj parametry tego ćwiczenia z T${tydzien} na pozostałe tygodnie`;
    rozniesc.onclick = () => wypelnijTygodnie("kopiuj", slot.positionId);
    if (!poCyklu) strzalki.append(rozniesc);

    /*
     * TOP SET przy tym ćwiczeniu.
     *
     * Dotąd TOP SET siedział na sztywno przy pierwszym wierszu dnia i tylko
     * tam. Trener powiedział wprost, czego potrzebuje: „możliwość kliknięcia
     * obojętnie którego ćwiczenia i dodania top setu". Więc przycisk stoi
     * w każdym wypełnionym wierszu i przełącza: nie ma → jest tutaj,
     * jest tutaj → nie ma.
     *
     * W dniu jest jeden TOP SET, jak w arkuszu — kliknięcie w innym wierszu
     * przenosi go, zamiast dokładać drugi.
     */
    const dodajTop = el("button", `mikro ${jestTopSetem(slot) ? "wlaczony" : ""}`, "T");
    dodajTop.title = jestTopSetem(slot)
      ? "Usuń TOP SET z tego ćwiczenia"
      : (zwyczajowyTopSet(slot)
          ? "Dodaj TOP SET — przy tym ćwiczeniu jest zwyczajowy"
          : "Dodaj TOP SET do tego ćwiczenia");
    dodajTop.onclick = () => przelaczTopSet(slot);
    if (!poCyklu) strzalki.append(dodajTop);

    /*
     * Tryb liczenia ciężaru dla TEGO ćwiczenia.
     *
     * Przełącznik przy planie zmieniał wszystkie akcesoria naraz i przez to
     * był bezużyteczny — trener powiedział wprost: „licz z RPE wydaje mi się
     * że nie jest przydatny bo zmienia wszystkie akcesoria naraz". Przy
     * wierszu ma sens: jednemu ćwiczeniu ciężar schodzi razem z rosnącymi
     * powtórzeniami, reszta trzyma sztangę z bloku.
     *
     * Bój główny i tak zawsze liczy z RPE, więc przy nim tego nie pokazujemy.
     */
    if (!bojGlowny(slot) && !poCyklu) {
      const przelaczTryb = el("button", `mikro ${slot.trybCiezaru === "licz z RPE" ? "wlaczony" : ""}`, "R");
      przelaczTryb.title = slot.trybCiezaru === "licz z RPE"
        ? "Wróć do trybu z planu (ciężar trzymany z bloku)"
        : "Licz ciężar z RPE co tydzień — sztanga schodzi, gdy przybywa powtórzeń";
      przelaczTryb.onclick = () => {
        if (slot.trybCiezaru === "licz z RPE") delete slot.trybCiezaru;
        else slot.trybCiezaru = "licz z RPE";
        zapiszPozniej();
        rysujDni();
      };
      strzalki.append(przelaczTryb);
    }
    komorkaLp.append(strzalki);
  }
  if (jestTopSetem(slot)) {
    // Sam przycisk „T" nie mówi, że TOP SET tu stoi — dopiero ramka po
    // włączeniu, i to drobna. Znacznik przy Lp. mówi to wprost.
    const znacznik = el("span", "znacznik-topset", "TS");
    znacznik.title = "To ćwiczenie ma TOP SET";
    komorkaLp.append(znacznik);
  }
  if (slot.trybCiezaru === "licz z RPE") {
    const znacznik = el("span", "znacznik-tryb", "RPE");
    znacznik.title = "Ciężar liczony z RPE co tydzień, nie trzymany z bloku";
    komorkaLp.append(znacznik);
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
    const poprzednie = slot.cwiczenieId;
    slot.cwiczenieId = wybor.value || null;
    zapytajOPodmiane(slot, poprzednie);
    zapiszPozniej();
    /*
     * Przerysowanie od razu, nie po powrocie z serwera.
     *
     * Wybranie ćwiczenia zmienia układ tabeli: wiersz przestaje być pusty
     * i dostaje pola parametrów, a pod nim ma się pojawić następny wolny.
     * Dotąd działo się to dopiero po zapisie — 350 ms zwłoki plus droga do
     * serwera i z powrotem. Na laptopie w tej samej sieci nie było tego widać;
     * na iPadzie, przez internet, trener zdążył uznać, że nic się nie stało,
     * i szukał wiersza przełączając tygodnie tam i z powrotem.
     *
     * Liczby (ciężar, stres) dojdą chwilę później, razem z odpowiedzią —
     * ale wiersz, o który chodzi, jest natychmiast.
     */
    rysujDni();
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

  // Puste pole = licz automatem; szara podpowiedź pokazuje, co z tego wychodzi.
  // Musi to być liczba **policzona**, nie wpisana tu na sztywno: wcześniej
  // przy seriach stało „3", a bój główny liczył się z sześciu — trener widział
  // w podpowiedzi jedno, klient na telefonie dostawał drugie.
  wiersz.append(poleLiczbowe(
    parametry.serie,
    (v) => { parametry.serie = v; },
    "1",
    String(wyliczony?.serie ?? ""),
  ));
  wiersz.append(poleLiczbowe(
    parametry.powtorzenia,
    (v) => { parametry.powtorzenia = v; },
    "1",
    String(wyliczony?.powtorzenia ?? ""),
  ));
  const komorkaRpe = poleLiczbowe(
    parametry.rpe, (v) => { parametry.rpe = v; }, "0.5", String(wyliczony?.rpe ?? ""));
  komorkaRpe.classList.add("rpe");
  wiersz.append(komorkaRpe);

  const komorkaC = komorkaCiezaru(parametry, wyliczony);
  const zrobione = zrobioneWTygodniu(slot);
  if (zrobione) komorkaC.append(zrobione);
  wiersz.append(komorkaC);

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
  // Po cyklu bez oceny normą: lżej niż norma to cel deloadu, a maksy to
  // kilka pojedynczych powtórzeń.
  for (const t of obraz.wynik.tygodnieDodatkowe ?? []) {
    obciazenie.append(wierszMiary(etykietaTygodnia(obraz.zapisany.plan, t.tydzien),
      t.bilans.razem, maks, ""));
  }

  // wzorce ruchu
  const wzorce = $("#wzorce");
  wzorce.replaceChildren();
  const biezacy = wyliczonyTydzienNr(tydzien) ?? obraz.wynik.tygodnie[5];
  const bilans = biezacy.bilans;
  const maksWzorca = Math.max(...bilans.wzorce.map((w) => w.calkowity), 0.001);
  const SKROT_WZORCA = { s: "przysiad", d: "m. ciąg", b: "wycisk.", r: "wiosł.", c: "core" };
  for (const w of bilans.wzorce) {
    const ocena = obraz.wynik.ocenaObjetosci[w.part];
    wzorce.append(wierszMiary(SKROT_WZORCA[w.part] ?? w.part, w.calkowity, maksWzorca,
      biezacy.rodzaj ? "" : ocena?.ocena ?? ""));
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

/**
 * Ciężar w tabeli planu — pole, nie napis.
 *
 * Silnik od początku umie przyjąć ciężar wpisany ręcznie (`ciezarOverride`):
 * progresja go zachowuje, kopia na nowy cykl czyści, testy tego pilnują.
 * Brakowało jedynego, co widzi trener — miejsca, w którym da się go wpisać.
 * W arkuszu było to zwykłe wpisanie liczby do komórki z formułą.
 *
 * Zasada jest ta sama co przy powtórzeniach, więc nie trzeba jej tłumaczyć:
 * **puste pole znaczy „licz automatem"**, a podpowiedź pokazuje, co z tego
 * wychodzi. Wpisana liczba wygrywa i jest podpisana kropką — bo ciężar, który
 * nie reaguje na 1RM ani na oceny klienta, musi się różnić od reszty.
 *
 * Przy ćwiczeniach bez ciężaru (masa ciała, czas, dystans) zostaje sam napis:
 * kilogramy nie mają się tam do czego odnieść.
 */
/**
 * Serie w jednej linijce: „80 · 90 · 85 · 80 kg × 6", a przy różnych
 * powtórzeniach „80×6 · 90×6 · 85×5". Ten sam zapis co w telefonie klienta.
 */
function opisSerii(serie) {
  const kg = (n) => liczba(n).replace(",0", "");
  const pusta = (x) => !x || (!x.ciezar && !x.powtorzenia);
  const wszystkie = [...(serie ?? [])];
  while (wszystkie.length > 0 && pusta(wszystkie.at(-1))) wszystkie.pop();
  const jedna = (x) => (x.ciezar && x.powtorzenia ? `${kg(x.ciezar)}×${x.powtorzenia}`
    : x.ciezar ? `${kg(x.ciezar)} kg` : `${x.powtorzenia} powt.`);
  // Dziura w środku zostaje jako „—": „— · 10×10" to niewpisana pierwsza
  // seria, a nie trening z jedną serią.
  if (wszystkie.some(pusta)) return wszystkie.map((x) => (pusta(x) ? "—" : jedna(x))).join(" · ");
  const s = wszystkie;
  if (s.length === 0) return "";
  if (s.every((x) => !x.ciezar)) return `${s.map((x) => x.powtorzenia).join(" · ")} powt.`;
  const powt = s[0].powtorzenia;
  if (powt && s.every((x) => x.ciezar && x.powtorzenia === powt)) {
    return `${s.map((x) => kg(x.ciezar)).join(" · ")} kg × ${powt}`;
  }
  return s.map((x) => (x.ciezar && x.powtorzenia ? `${kg(x.ciezar)}×${x.powtorzenia}`
    : x.ciezar ? `${kg(x.ciezar)} kg` : `${x.powtorzenia} powt.`)).join(" · ");
}

/**
 * Co klient zrobił przy tym ćwiczeniu w oglądanym tygodniu — wszystkie serie,
 * pod ciężarem z planu.
 *
 * Do 23.09 trener nie widział tego w tabeli wcale, a baza trzymała tylko
 * najcięższą serię. Przy planie na 80 kg „90 · 85 · 80" mówi coś innego niż
 * samo „90": klient przestrzelił i opadł z sił. Wpisy sprzed tej zmiany znają
 * tylko najcięższą parę i tak się pokazują — jako jedna seria.
 */
function zrobioneWTygodniu(slot) {
  const w = (obraz.zapisany.wykonania ?? []).find((x) => x.positionId === slot.positionId
    && x.tydzien === tydzien && (!x.cwiczenieId || x.cwiczenieId === slot.cwiczenieId));
  if (!w) return null;
  const serie = w.serie ?? (w.ciezarWykonany || w.powtorzeniaWykonane
    ? [{ ciezar: w.ciezarWykonany ?? null, powtorzenia: w.powtorzeniaWykonane ?? null }]
    : []);
  const opis = opisSerii(serie);
  if (!opis) return null;
  const e = el("div", "zrobione", `zrobione: ${opis}`);
  e.title = "Serie wpisane przez klienta w tym tygodniu. Do propozycji 1RM idzie najcięższa.";
  return e;
}

function komorkaCiezaru(parametry, wyliczony) {
  const ciezar = wyliczony?.ciezar;
  const progresja = wyliczony?.cwiczenie?.progresja;
  /*
   * „Ręczne ustawienie" to jedyna progresja bez ciężaru, przy której ciężar
   * jednak jest — tylko nie bierze się z 1RM, bo tak stoi w BAZIE.
   *
   * Dotąd wpadała do tego samego worka, co masa ciała i czas: komórka
   * pokazywała napis i nie dawała pola. Czyli aplikacja pisała „ustaw
   * ręcznie" i nie dawała gdzie. Zgłoszone z używania przy „SLDL balance":
   * trener wpisał serię maksymalną, zobaczył napis zamiast kilogramów
   * i nie miał jak tego poprawić.
   */
  const recznie = progresja === "ręczne ustawienie";
  const bezCiezaru = typeof ciezar === "string" && !ciezar.startsWith("—") && !recznie;
  const komorka = el("td", typeof ciezar === "number" ? "ciezar" : "ciezar brak");

  if (bezCiezaru) {
    const napis = el("span", "", String(ciezar));
    napis.title = "To ćwiczenie nie chodzi na kilogramy — seria maksymalna "
      + "nic tu nie policzy.";
    komorka.append(napis);
    return komorka;
  }

  const input = el("input");
  input.type = "number"; input.step = "0.5"; input.min = "0";
  input.className = "pole-ciezaru";
  input.value = parametry.ciezarOverride ?? "";
  // Komunikat („— brak 1RM") stał jako podpowiedź w polu na trzy cyfry
  // i ucinał się do „— bra". Teraz stoi pod polem, w całości.
  const komunikat = typeof ciezar === "string" && ciezar.startsWith("—") ? ciezar.slice(2) : null;
  input.placeholder = recznie
    ? "ręcznie"
    : (typeof ciezar === "number" ? liczba(ciezar) : komunikat ? "kg" : String(ciezar ?? "—"));
  input.title = parametry.ciezarOverride !== undefined
    ? "Ciężar wpisany ręcznie. Wyczyść pole, żeby wrócić do liczonego."
    : (recznie
      ? "To ćwiczenie nie liczy ciężaru z 1RM — wpisz kilogramy tutaj. "
        + "Seria maksymalna nic przy nim nie zmieni."
      : "Puste = liczony z 1RM, RPE i ocen klienta. Wpisz, żeby ustalić na sztywno.");
  input.onchange = () => {
    if (input.value === "") delete parametry.ciezarOverride;
    else parametry.ciezarOverride = Number(input.value);
    zapiszPozniej();
  };
  komorka.append(input);
  if (komunikat && parametry.ciezarOverride === undefined) {
    komorka.append(el("div", "komunikat-ciezaru", komunikat));
  }

  if (parametry.ciezarOverride !== undefined) {
    komorka.classList.add("reczny");
    komorka.append(el("span", "znacznik-reczny", "●"));
  }
  if (wyliczony?.cwiczenie?.jednostronne && typeof wyliczony?.ciezar === "number") {
    komorka.append(el("span", "znacznik-jedn", "↔"));
  }
  komorka.append(...znacznikOcen(wyliczony));
  return komorka;
}

/**
 * Ile oceny klienta przesuwają ciężar w tym tygodniu.
 *
 * Bez tego ocena potrafi wyglądać na zignorowaną. Zgłoszone z użycia: klient
 * ocenił Barbell SLDL jako „za trudne", a ciężar w T2 został ten sam. I słusznie
 * — korekta to 5%, a ciężar zaokrągla się do skoku z BAZY, który przy sztandze
 * wynosi 2,5 kg. Poniżej 25 kg pięć procent nie sięga połowy skoku, więc liczba
 * nie ma jak drgnąć. To jest zachowanie arkusza (MROUND), nie awaria — ale
 * dopóki nigdzie nie stało, że korekta w ogóle zadziałała, wyglądało na jedno
 * i drugie tak samo.
 */
function znacznikOcen(wyliczony) {
  const mnoznik = wyliczony?.mnoznik;
  if (typeof mnoznik !== "number" || mnoznik === 1) return [];

  const procent = Math.round((mnoznik - 1) * 100);
  if (procent === 0) return [];
  const skok = Math.max(wyliczony?.cwiczenie?.skokKg ?? 0, 0.5);

  const znacznik = el("span",
    `znacznik-ocena ${procent > 0 ? "wyzej" : "nizej"}`,
    `${procent > 0 ? "+" : "−"}${Math.abs(procent)}%`);
  znacznik.title =
    `Oceny klienta z wcześniejszych tygodni przesuwają ciężar o ${procent > 0 ? "+" : "−"}`
    + `${Math.abs(procent)}%. Wynik zaokrągla się do skoku ${liczba(skok)} kg z BAZY, `
    + `więc przy małych ciężarach liczba może zostać ta sama.`;
  return [znacznik];
}

/**
 * Podmiana ćwiczenia w slocie, który klient już ocenił.
 *
 * Mnożnik adaptacji liczy się z odczuć **slotu**, nie ćwiczenia — tak jak
 * w arkuszu. Po podmianie oceny zostają i działają dalej: dwa razy „za łatwe"
 * przy przysiadzie podniosą o 10% ciężar ćwiczenia, którego klient nawet nie
 * robił. W arkuszu było tak samo, tylko trener miał ten wiersz przed oczami.
 *
 * Nie decydujemy za trenera — bywa, że podmiana jest kosmetyczna (ten sam
 * ruch na innym sprzęcie) i oceny mają pełne prawo zostać. Pytamy w chwili,
 * w której to się dzieje, bo później nie widać już, że coś się wydarzyło.
 *
 * Czyścimy wyłącznie oceny **w planie**. Zapis w historii wykonań zostaje:
 * klient naprawdę zrobił ten trening i naprawdę tak go ocenił.
 */
function zapytajOPodmiane(slot, poprzednieCwiczenie) {
  if (!poprzednieCwiczenie || poprzednieCwiczenie === slot.cwiczenieId) return;

  const nazwa = (id) => cwiczenia.find((c) => c.id === id)?.nazwa ?? id;
  const nowe = slot.cwiczenieId;

  // Tygodnie, w których ten slot ma już ślad treningu: ocenę albo zapisane
  // wykonanie. To jest historia, a nie plan — i nie wolno jej przepisać.
  const zrobione = new Set(
    Object.entries(slot.tygodnie ?? {})
      .filter(([, p]) => p?.feedback !== undefined)
      .map(([t]) => Number(t)),
  );
  for (const w of obraz.zapisany.wykonania ?? []) {
    if (w.positionId === slot.positionId) zrobione.add(Number(w.tydzien));
  }
  const ostatniZrobiony = zrobione.size ? Math.max(...zrobione) : 0;

  // Nic się jeszcze nie odbyło — podmiana dotyczy całego cyklu i nie ma o co pytać.
  if (ostatniZrobiony === 0) return;

  const odTygodnia = Math.min(ostatniZrobiony + 1, 6);
  const przerobione = [...zrobione].sort((a, b) => a - b).map((t) => `T${t}`).join(", ");

  /**
   * Podmiana od wybranego tygodnia — mechanika z arkusza (`cwiczenieIdOverride`).
   *
   * Silnik przy podmienionym ćwiczeniu **nie sięga po jego serię maksymalną**,
   * tylko po 1RM wpisany ręcznie — dokładnie tak jak arkusz w kolumnie AA.
   * Gdybyśmy to obeszli, konsola pokazywałaby liczbę tam, gdzie arkusz pokazuje
   * „ustaw ręcznie", i oba przestałyby się zgadzać. Zamiast tego przepisujemy
   * tu serię maksymalną nowego ćwiczenia na ten ręczny 1RM, jeśli w planie jest.
   */
  const odTegoTygodnia = async () => {
    slot.cwiczenieId = poprzednieCwiczenie;
    // 1RM liczymy wprost z serii maksymalnej nowego ćwiczenia. Szukanie go
    // wśród slotów planu nic nie daje — tego ćwiczenia jeszcze tam nie ma.
    const seria = obraz.zapisany.plan.serieMaksymalne.find((x) => x.cwiczenieId === nowe);
    const oneRM = seria
      ? (await api(`/api/1rm?ciezar=${seria.ciezar}&powt=${seria.powtorzenia}`)).oneRM
      : null;

    for (let t = odTygodnia; t <= 6; t++) {
      slot.tygodnie ??= {};
      slot.tygodnie[t] ??= {};
      slot.tygodnie[t].cwiczenieIdOverride = nowe;
      if (oneRM) slot.tygodnie[t].oneRMReczny = oneRM;
    }
    zamknijModal();
    zapiszPozniej();
  };

  const odPoczatku = () => {
    for (const t of Object.keys(slot.tygodnie ?? {})) delete slot.tygodnie[t].feedback;
    zamknijModal();
    zapiszPozniej();
  };

  const przycisk = (klasa, tekst, akcja) => {
    const b = el("button", klasa, tekst);
    b.onclick = akcja;
    return b;
  };
  const akcje = el("div", "akcje-modala");
  akcje.append(
    przycisk("glowny", `Od T${odTygodnia}`, odTegoTygodnia),
    przycisk("", "Od początku cyklu", odPoczatku),
  );

  const maSerie = obraz.zapisany.plan.serieMaksymalne.some((x) => x.cwiczenieId === nowe);

  pokazModal("Ten slot ma już przerobione treningi",
    el("p", "", `W ${slot.lp} był „${nazwa(poprzednieCwiczenie)}" i klient przerobił `
      + `go w ${przerobione}. Od którego tygodnia ma być „${nazwa(nowe)}"?`),
    el("p", "wskazowka",
      `Od T${odTygodnia} — przerobione tygodnie zostają takie, jakie były. `
      + "Tak robi to arkusz i tak wygląda prawda: klient zrobił tamto ćwiczenie, "
      + "nie to nowe."),
    el("p", "wskazowka ostrzezenie",
      "Od początku cyklu — przepisze też tygodnie, które się odbyły. Ekran postępu "
      + "klienta pokaże wtedy, że podniósł te ciężary w nowym ćwiczeniu, choć go "
      + "nie robił. Wybieraj to tylko przy prostowaniu pomyłki."),
    el("p", "wskazowka", maSerie
      ? "Seria maksymalna nowego ćwiczenia jest w planie — użyję jej jako 1RM "
        + "dla podmienionych tygodni."
      : "Nowe ćwiczenie nie ma jeszcze serii maksymalnej. Do czasu jej wpisania "
        + "podmienione tygodnie pokażą „— ustaw ręcznie”."),
    akcje);
  $("#modal-zamknij").classList.add("ukryty");
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

    /*
     * Ćwiczenia, przy których seria maksymalna nic nie policzy.
     *
     * Zgłoszone z używania: wpisana seria przy „SLDL balance" i „Dead bug
     * izo + OH" nie dawała ciężaru, a nigdzie nie było napisane dlaczego.
     * Wygląda to jak awaria, a jest zgodne z BAZĄ — więc wiersz mówi to
     * wprost i dopowiada, co zrobić zamiast.
     */
    const bezSerii = POWODY_BEZ_SERII[c.progresja];
    if (bezSerii) {
      const powod = el("div", "powod-bez-serii", bezSerii
        + (c.progresja === "ręczne ustawienie"
          ? " Wpisz kilogramy wprost w kolumnie Ciężar."
          : ""));
      wiersz.append(powod);
      wiersz.classList.add("bez-serii");
      kontener.append(wiersz);
      continue;
    }

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
      // Tabela RPE kończy się na piętnastu powtórzeniach. Powyżej nie ma
      // z czego policzyć 1RM, więc lepiej zatrzymać to przy polu.
      if (tytul === "powt.") {
        input.max = String(MAKS_POWTORZEN_SERII);
        input.title = `Seria maksymalna do ${MAKS_POWTORZEN_SERII} powtórzeń — `
          + "przy większej liczbie dołóż kilogramów.";
      }
      input.value = wartosc || "";
      input.onchange = zmien;
      wiersz.append(input);
    }

    wiersz.append(el("div", "rm", tekst1RM(id)));

    /*
     * 1RM, którego nikt nie zmierzył serią do odmowy: klient zaczął cykl od
     * razu i dobrał ciężar według RPE, a z pierwszej serii policzył się plan.
     * W polach stoi „1RM × 1" — prawda dla silnika i dla arkusza, ale bez tego
     * zdania wyglądałoby jak seria, której nie było. Nadpisanie pól zamienia
     * wpis w zwykłą serię maksymalną i zdanie znika.
     */
    const k = istniejaca?.kalibracja;
    if (k) {
      const bezZera = (n) => liczba(n).replace(",0", "");
      wiersz.append(el("div", "kalibracja-zrodlo",
        `z serii roboczej klienta: ${bezZera(k.ciezar)} kg × ${k.powtorzenia} `
        + `przy RPE ${bezZera(k.rpe)} · T${k.tydzien}, dzień ${RZYMSKIE[k.dzien - 1] ?? k.dzien}`));
    }
    // Wynik z tygodnia maksów poprzedniego cyklu — wszedł sam, bez przyjmowania.
    if (istniejaca?.zTygodniaMaksow != null && !k) {
      wiersz.append(el("div", "kalibracja-zrodlo",
        `z tygodnia maksów w cyklu ${istniejaca.zTygodniaMaksow}.0`));
    }
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
async function wypelnijTygodnie(tryb, positionId) {
  const opis = tryb === "progresja"
    ? "Progresja z szablonu 5.18 nadpisze serie, powtórzenia i RPE we wszystkich sześciu tygodniach."
    : `Parametry tego ćwiczenia z tygodnia ${tydzien} nadpiszą pozostałe pięć tygodni.`;
  if (!confirm(`${opis}\n\nOceny klienta i ręcznie ustawione ciężary zostają. Na pewno?`)) return;

  try {
    obraz = await api(`/api/plany/${obraz.zapisany.id}/tygodnie`, {
      method: "POST",
      body: { tryb, zrodlo: tydzien, positionId },
    });
    rysujPlan();
  } catch (err) {
    alert(err.message);
  }
}

$("#progresja-szablonu").onclick = () => wypelnijTygodnie("progresja");

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

    /**
     * Adres z paska przeglądarki bywa nie do wysłania.
     *
     * Trener kopiuje to, co widzi — czyli `localhost`. A na telefonie klienta
     * `localhost` znaczy jego własny telefon: link nie ma prawa zadziałać i nic
     * tego nie tłumaczy. Klient dostaje „nie można nawiązać połączenia",
     * trener nie wie dlaczego, i na tym kończy się pierwszy cykl.
     */
    const lokalny = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(location.origin);
    if (lokalny) {
      const ja = await api("/api/ja");
      if (ja.adresyWSieci?.length) {
        tresc.push(el("p", "wskazowka ostrzezenie",
          "⚠ Ten adres działa tylko na tym komputerze — „localhost” na telefonie "
          + "klienta znaczy jego telefon. Wyślij mu ten:"));
        for (const adres of ja.adresyWSieci) {
          tresc.push(el("code", "", `${adres}${sciezka}`));
        }
        tresc.push(el("p", "wskazowka",
          "Działa z telefonu w tej samej sieci Wi-Fi — także bez hasła do "
          + "konsoli, bo kluczem do planu jest sam link. Ten komputer musi być "
          + "włączony, a konsola uruchomiona. Żeby klient miał dostęp zawsze "
          + "i skądkolwiek — postaw konsolę na serwerze (instrukcja "
          + "WDROZENIE.md)."));
      } else {
        tresc.push(el("p", "wskazowka ostrzezenie",
          "⚠ Ten adres działa tylko na tym komputerze — „localhost” na telefonie "
          + "klienta znaczy jego telefon, więc link nie zadziała."));
        tresc.push(el("p", "wskazowka",
          "Nie widzę tego komputera w żadnej sieci — sprawdź Wi-Fi. Żeby klient "
          + "miał dostęp zawsze i skądkolwiek, postaw konsolę na serwerze: "
          + "instrukcja w pliku WDROZENIE.md."));
      }
    }
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
