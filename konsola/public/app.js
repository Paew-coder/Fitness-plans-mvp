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
let obraz = null;      // { zapisany, wynik, uwagi, gotowy, normy }
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

// ── lista planów ───────────────────────────────────────────────────
async function pokazListe() {
  $("#ekran-plan").classList.add("ukryty");
  $("#ekran-lista").classList.remove("ukryty");

  const [plany, uwaga] = await Promise.all([api("/api/plany"), api("/api/uwaga")]);
  rysujUwage(uwaga);

  const lista = $("#lista-planow");
  lista.replaceChildren();

  const wybor = $('#form-nowy [name="poprzedniId"]');
  wybor.replaceChildren(el("option", "", "— brak —"));
  wybor.firstChild.value = "";

  if (plany.length === 0) {
    lista.append(el("p", "wskazowka", "Jeszcze nic tu nie ma. Utwórz pierwszy plan powyżej."));
    return;
  }

  for (const p of plany) {
    const wiersz = el("div", "pozycja");
    const nazwa = el("div", "nazwa", `${p.klient} ${p.wersja}.0`);
    const status = el("span", `odznaka ${p.status.replace(/[łą]/g, "l")}`, p.status);
    const opisCyklu = p.cykl.doStartu !== null ? ` · start za ${p.cykl.doStartu} dni`
      : p.cykl.tydzien === null ? ""
        : p.cykl.poCyklu ? " · po cyklu"
          : ` · T${p.cykl.tydzien}/6`;
    const meta = el("div", "meta", `${p.cwiczen} ćwiczeń${opisCyklu}`);
    if (p.cykl.doKonca !== null) {
      meta.title = p.cykl.poCyklu
        ? `Cykl skończył się ${-p.cykl.doKonca} dni temu`
        : `Do końca cyklu ${p.cykl.doKonca} dni`;
    }
    wiersz.append(sygnalAktywnosci(p.realizacja));
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
      if (!confirm(`Usunąć plan ${p.klient} ${p.wersja}.0?`)) return;
      await api(`/api/plany/${p.id}`, { method: "DELETE" });
      pokazListe();
    };
    wiersz.append(otworz, kopiuj, usun);
    wiersz.prepend(nazwa, status, meta);
    lista.append(wiersz);

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
    otworz.onclick = () => otworzPlan(w.id);
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
    } catch (err) {
      $("#zapis").textContent = `błąd: ${err.message}`;
    }
  }, 350);
}

$("#wroc").onclick = pokazListe;

// ── rysowanie planu ────────────────────────────────────────────────
function rysujPlan() {
  $("#ekran-lista").classList.add("ukryty");
  $("#ekran-plan").classList.remove("ukryty");

  const z = obraz.zapisany;
  $("#nazwa-planu").textContent = `${z.klient} ${z.wersja}.0`;
  $("#status-planu").textContent = z.status;
  $("#status-planu").className = `odznaka ${z.status.replace(/[łą]/g, "l")}`;
  $("#tryb-akcesoriow").value = z.plan.trybAkcesoriow;
  $("#czesc-planu").value = z.plan.czescPlanu;
  $("#data-startu").value = z.dataStartu ?? "";

  const taby = $("#taby-tygodni");
  taby.replaceChildren();
  for (const t of [1, 2, 3, 4, 5, 6]) {
    const b = el("button", t === tydzien ? "aktywny" : "", `T${t}`);
    b.onclick = () => { tydzien = t; rysujPlan(); };
    taby.append(b);
  }

  rysujDni();
  rysujAnalize();
  rysujRealizacje();
  rysujPropozycje1RM();
  rysujModuly();
  rysujSerieMax();
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

function rysujSerieMax() {
  const kontener = $("#serie-max");
  kontener.replaceChildren();

  const uzyte = [...new Set(obraz.zapisany.plan.sloty
    .map((s) => s.cwiczenieId).filter(Boolean))];
  if (uzyte.length === 0) {
    kontener.append(el("p", "wskazowka", "Najpierw dobierz ćwiczenia."));
    return;
  }

  for (const id of uzyte) {
    const c = cwiczenia.find((x) => x.id === id);
    if (!c) continue;
    const istniejaca = obraz.zapisany.plan.serieMaksymalne.find((s) => s.cwiczenieId === id);

    const wiersz = el("div", "serie-max-wiersz");
    wiersz.append(el("div", "nazwa", c.nazwa));

    const zmien = (pole) => (e) => {
      const wartosc = e.target.value === "" ? null : Number(e.target.value);
      let wpis = obraz.zapisany.plan.serieMaksymalne.find((s) => s.cwiczenieId === id);
      if (!wpis) {
        wpis = { cwiczenieId: id, ciezar: 0, powtorzenia: 0 };
        obraz.zapisany.plan.serieMaksymalne.push(wpis);
      }
      wpis[pole] = wartosc ?? 0;
      if (!wpis.ciezar || !wpis.powtorzenia) {
        obraz.zapisany.plan.serieMaksymalne =
          obraz.zapisany.plan.serieMaksymalne.filter((s) => s !== wpis);
      }
      zapiszPozniej();
    };

    for (const [pole, wartosc, tytul] of [
      ["ciezar", istniejaca?.ciezar, "kg"], ["powtorzenia", istniejaca?.powtorzenia, "powt."],
    ]) {
      const input = el("input");
      input.type = "number"; input.min = "0"; input.placeholder = tytul;
      input.title = tytul;
      input.value = wartosc || "";
      input.onchange = zmien(pole);
      wiersz.append(input);
    }

    const wyliczony = obraz.wynik.tygodnie[0].sloty.find((s) => s.cwiczenie?.id === id);
    wiersz.append(el("div", "rm", wyliczony?.oneRM ? `${liczba(wyliczony.oneRM)}` : "—"));
    kontener.append(wiersz);
  }
}

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
$("#link-klienta").onclick = async () => {
  try {
    const { sciezka } = await api(`/api/plany/${obraz.zapisany.id}/link`, { method: "POST", body: {} });
    const adres = `${location.origin}${sciezka}`;

    $("#modal-tytul").textContent = "Link dla klienta";
    $("#modal-body").replaceChildren();
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
    uniewaznij.style.marginLeft = ".5rem";
    uniewaznij.onclick = async () => {
      if (!confirm("Stary link przestanie działać. Na pewno?")) return;
      await api(`/api/plany/${obraz.zapisany.id}/link`, { method: "DELETE" });
      $("#modal").classList.add("ukryty");
    };

    $("#modal-body").append(
      el("p", "", "Wyślij klientowi. Otworzy się na telefonie, działa też bez zasięgu."),
      pole,
      el("p", "wskazowka",
        "Kto ma link, ten widzi plan — bez hasła. Przy kilkunastu klientach to " +
        "proporcjonalne. Gdyby link wyciekł, unieważnij go i wygeneruj nowy."),
      kopiuj, uniewaznij,
    );
    $("#modal").classList.remove("ukryty");
  } catch (err) {
    alert(err.message);
  }
};

$("#modal-zamknij").onclick = () => $("#modal").classList.add("ukryty");

// ── start ──────────────────────────────────────────────────────────
(async () => {
  cwiczenia = await api("/api/cwiczenia");
  cwiczenia.sort((a, b) => a.nazwa.localeCompare(b.nazwa, "pl"));
  await pokazListe();
})();
