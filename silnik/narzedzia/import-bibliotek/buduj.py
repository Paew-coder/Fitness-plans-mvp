"""Składa bazę: docs/dane/biblioteka-cwiczen.json + docs/dane/filmy-cwiczen.json + raport.json.

Wejście: encje.json (kod/encje.py), wyniki/partia-XX.jsonl (przegląd partii),
osadzanie.jsonl (oEmbed: czy film da się osadzić). Id ćwiczeń (EX-…) i filmów
(WID-…) są stałe między przebiegami: istniejące pliki są czytane i id
dziedziczone po kluczu kanonicznym / parze (ćwiczenie, film).

Decyzje trenera mają pierwszeństwo (wpisuje je silnik/narzedzia/weryfikacja-bibliotek.py):
ćwiczenie z polem „zatwierdzone” zachowuje swoją klasyfikację (także „ukryte”),
filmy przypięte przez trenera („przypisal”: „trener”) zostają, a pary
(ćwiczenie, film) z listy „odpiete” w filmy-cwiczen.json nie wracają.

Użycie: python3 -I kod/buduj.py [--z-propozycji]   (bez wyników partii — tylko do prób)
"""
import json, sys, os, glob, collections, re
# katalog roboczy importu (listy filmów, encje.json, wyniki/) — poza repo
os.chdir(os.environ.get("KATALOG_IMPORTU", "."))
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
DANE = f"{REPO}/docs/dane"
Z_PROPOZYCJI = "--z-propozycji" in sys.argv

PART = {"Lower push": "s", "Lower pull": "d", "Upper push horizontal": "b", "Upper push vertical": "b",
        "Tricep": "b", "Upper pull horizontal": "r", "Upper pull vertical": "r", "Bicep": "r", "Core": "c"}
ZRODLO_FILMU = {"tom": "tom-youtube", "catalyst": "catalyst-youtube"}
ZRODLA = [
    {"id": "tom-youtube", "nazwa": "Theory of Motion Exercise Library", "platforma": "YouTube",
     "kanal": "@theorylibrary", "kanal_id": "UC3f1WJ6Uqr1SBkdUkfTChYQ", "url": "https://www.youtube.com/@theorylibrary",
     "zweryfikowano": "2026-10-09",
     "jak": "lista wszystkich filmów kanału (playlista przesłanych UU3f1WJ6Uqr1SBkdUkfTChYQ); każdy film sprawdzony przez oEmbed YouTube — osadzanie dozwolone, autor = ten kanał"},
    {"id": "catalyst-youtube", "nazwa": "Catalyst Athletics", "platforma": "YouTube",
     "kanal": "@CatalystAthletics", "kanal_id": "UCOe24b2O8eoeHz9fwWuKRVA", "url": "https://www.youtube.com/@CatalystAthletics",
     "playlista": "PLEaPUUsRrMbwMMSS5L2z3eskcz6lHXkj0", "zweryfikowano": "2026-10-09",
     "jak": "playlista „Olympic Weightlifting Exercise Library” (618 filmów); każdy film sprawdzony przez oEmbed YouTube — osadzanie dozwolone, autor = ten kanał"},
]
def zapisz(sciezka, naglowek: dict, klucz: str, wpisy: list):
    """JSON z jednym wpisem na linię — czytelne różnice w git, o połowę mniejszy plik niż wcięcia."""
    with open(sciezka, "w", encoding="utf-8") as f:
        f.write("{\n")
        for k, v in naglowek.items():
            if isinstance(v, list) and v:
                v = "[\n" + ",\n".join("  " + json.dumps(w, ensure_ascii=False) for w in v) + "\n ]"
            else:
                v = json.dumps(v, ensure_ascii=False)
            f.write(f" {json.dumps(k, ensure_ascii=False)}: {v},\n")
        f.write(f" {json.dumps(klucz)}: [\n")
        f.write(",\n".join("  " + json.dumps(w, ensure_ascii=False) for w in wpisy))
        f.write("\n ]\n}\n")
    json.load(open(sciezka, encoding="utf-8"))   # musi się czytać


ROD = {"siłowe": "trening siłowy", "mobilność/rozciąganie": "mobilność", "kondycja/koordynacja": "kondycja",
       "kompleks": "kompleks", "pominąć": "trening siłowy"}

encje = json.load(open("encje.json"))
nowe = encje["nowe"]

# ── decyzje z przeglądu partii ──────────────────────────────────────
decyzje = {}
for plik in sorted(glob.glob("wyniki/partia-*.jsonl")):
    for l in open(plik):
        if l.strip():
            d = json.loads(l)
            decyzje[d["t"]] = d
brak = [e["t"] for e in nowe if e["t"] not in decyzje]
if brak and not Z_PROPOZYCJI:
    sys.exit(f"brak decyzji dla {len(brak)} pozycji (np. {brak[:5]}) — uruchom z --z-propozycji tylko do prób")
for e in nowe:
    if e["t"] not in decyzje:
        p = e["propozycja"]
        decyzje[e["t"]] = {"t": e["t"], "kategoria": p["kategoria"], "coeff": p["coeff"], "progresja": p["progresja"],
                           "skok_kg": p["skok_kg"], "jednostronne": p["jednostronne"], "rodzaj": ROD[p["rodzaj"]],
                           "sprzet": p["sprzet"], "status": "do weryfikacji" if p["pewnosc"] != "pewne" else "pewne",
                           "powody": ["KATEGORIA"] if p["pewnosc"] != "pewne" else [], "powod": p["powod"], "_z_propozycji": True}

# ── osadzanie ───────────────────────────────────────────────────────
osadzanie = {}
for l in open("osadzanie.jsonl"):
    d = json.loads(l)
    osadzanie[d["id"]] = d
def osadzalny(yt):
    d = osadzanie.get(yt)
    return d is not None and d.get("kod") == 200

# ── id: dziedziczone z poprzedniego przebiegu ───────────────────────
BAZA = json.load(open(f"{DANE}/baza-cwiczen.json"))["cwiczenia"]
plik_bib = f"{DANE}/biblioteka-cwiczen.json"
stary_plik = json.load(open(plik_bib)) if os.path.exists(plik_bib) else {}
stare = stary_plik.get("cwiczenia", [])
id_po_kluczu = {c["klucz"]: c["id"] for c in stare}
zatwierdzone = {c["klucz"]: c for c in stare if c.get("zatwierdzone")}
POLA_TRENERA = ("nazwa", "kategoria", "part", "coeff", "skok_kg", "progresja", "uwagi", "jednostronne",
                "weryfikacja", "zatwierdzone", "ukryte")
nr = max(int(c["id"][3:]) for c in BAZA + stare) + 1

def nowe_id():
    global nr
    i = f"EX-{nr:04d}"; nr += 1
    return i

# kolejność: ToM, potem Catalyst; w źródle alfabetycznie
nowe.sort(key=lambda e: (e["zrodlo"] != "tom", e["nazwa"].lower()))
cwiczenia, pominiete, bez_osadzania = [], [], []
filmy_cw = collections.OrderedDict()   # id ćwiczenia → filmy
# Pozycje z przeglądu, które okazały się tym samym ćwiczeniem co w BAZIE trenera
# (np. „BB Conventional Deadlift” = EX-0053 Deadlift) — filmy idą do BAZY.
SCAL = dict(l.split() for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "scal.txt")) if l.strip()) if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "scal.txt")) else {}
scalone = []
for e in nowe:
    d = decyzje[e["t"]]
    if e["t"] in SCAL:
        encje["baza"].setdefault(SCAL[e["t"]], []).extend(e["filmy"])
        scalone.append({"nazwa": e["nazwa"], "do": SCAL[e["t"]]})
        continue
    filmy = [f for f in e["filmy"] if osadzalny(f["yt"])]
    bez_osadzania += [{"yt": f["yt"], "tytul": f["tytul"], "kod": osadzanie.get(f["yt"], {}).get("kod")}
                      for f in e["filmy"] if not osadzalny(f["yt"])]
    if d["status"] == "pominąć" or not filmy:
        pominiete.append({"nazwa": e["nazwa"], "zrodlo": e["zrodlo"], "powod": d.get("powod") or "brak filmu do osadzenia",
                          "filmy": [f["yt"] for f in e["filmy"]]})
        continue
    i = id_po_kluczu.get(e["klucz"]) or nowe_id()
    weryf = d["status"] == "do weryfikacji"
    pierwszy = next((f for f in filmy if f["rola"] == "demonstracja"), filmy[0])
    c = {
        "id": i, "nazwa": e["nazwa"], "kategoria": d["kategoria"], "part": PART[d["kategoria"]],
        "coeff": d["coeff"], "skok_kg": d["skok_kg"], "progresja": d["progresja"],
        "film": f"https://youtu.be/{pierwszy['yt']}",
        "uwagi": f"DO WERYFIKACJI – {d['powod']}" if weryf else None,
        "biblioteka": e["zrodlo"], "jednostronne": d["jednostronne"], "rodzaj": d["rodzaj"], "sprzet": d["sprzet"],
        "weryfikacja": d.get("powody", []) if weryf else [],
        "klucz": e["klucz"],
    }
    inne = [w for w in e["warianty"] if w != e["nazwa"]]
    if inne: c["inne_tytuly"] = inne
    if d.get("uwaga_nazwa"): c["uwaga_nazwa"] = d["uwaga_nazwa"]
    if d.get("_z_propozycji"): c["_z_propozycji"] = True
    if e["klucz"] in zatwierdzone:
        for k in POLA_TRENERA:
            if k in zatwierdzone[e["klucz"]]: c[k] = zatwierdzone[e["klucz"]][k]
    cwiczenia.append(c)
    filmy_cw[i] = filmy
cwiczenia.sort(key=lambda c: c["id"])

# filmy przy ćwiczeniach z BAZY trenera
for bid, filmy in encje["baza"].items():
    ok = [f for f in filmy if osadzalny(f["yt"])]
    bez_osadzania += [{"yt": f["yt"], "tytul": f["tytul"], "kod": osadzanie.get(f["yt"], {}).get("kod")}
                      for f in filmy if not osadzalny(f["yt"])]
    filmy_cw.setdefault(bid, [])
    filmy_cw[bid] = ok + filmy_cw[bid]

# ── nazwy unikalne (bez wielkości liter), także względem BAZY ──────
n = collections.Counter(c["nazwa"].lower() for c in BAZA + cwiczenia)
assert not [k for k, v in n.items() if v > 1], [k for k, v in n.items() if v > 1]

# ── filmy-cwiczen.json: wpisy spoza bibliotek zostają, id WID stałe ─
f_stare = json.load(open(f"{DANE}/filmy-cwiczen.json"))
odpiete = f_stare.get("odpiete", [])
pary_odpiete = {(o["cwiczenie_id"], o["youtube_id"]) for o in odpiete}
wlasne = [w for w in f_stare["filmy"] if w["zrodlo"] not in ZRODLO_FILMU.values() or w.get("przypisal") == "trener"]
wid_po_parze = {(w["cwiczenie_id"], w.get("youtube_id")): w["id"] for w in f_stare["filmy"]}
wnr = max(int(w["id"][4:]) for w in f_stare["filmy"]) + 1
wpisy = list(wlasne)
for cid in sorted(filmy_cw):
    widziane = {w.get("youtube_id") for w in wpisy if w["cwiczenie_id"] == cid}
    for f in filmy_cw[cid]:
        if f["yt"] in widziane or (cid, f["yt"]) in pary_odpiete: continue
        widziane.add(f["yt"])
        wid = wid_po_parze.get((cid, f["yt"]))
        if not wid:
            wid = f"WID-{wnr:04d}"; wnr += 1
        w = {"id": wid, "cwiczenie_id": cid, "typ": "youtube", "rola": f["rola"], "youtube_id": f["yt"],
             "zrodlo": ZRODLO_FILMU[f["zrodlo"]], "tytul": f["tytul"]}
        if f.get("czas"): w["czas_s"] = int(f["czas"])
        wpisy.append(w)
wpisy.sort(key=lambda w: w["id"])

opis_f = ("Filmy instruktażowe do ćwiczeń — osobno od BAZY. Wpis wskazuje ćwiczenie po jego id (EX-…); BAZA nie wie, "
          "skąd jest film. Zmiana źródła (YouTube → własny plik MP4) to zmiana typu w jednym wpisie, bez ruszania BAZY "
          "i planów. Typy: youtube (youtube_id), plik (url do MP4/WebM). Rola: demonstracja (krótki pokaz, domyślna) albo "
          "poradnik (omówienie techniki); ćwiczenie może mieć kilka filmów. Źródła: OPEX Fitness (test na EX-0011), "
          "Theory of Motion Exercise Library i Catalyst Athletics (import bibliotek 09.10.2026, tylko osadzanie "
          "odtwarzaczem YouTube — filmów nie pobieramy). „przypisal”: „trener” = film przypięty przez trenera w arkuszu "
          "weryfikacji; „odpiete” = pary (ćwiczenie, film), które trener odpiął — kolejny import ich nie przywraca.")
zrodla = [z for z in f_stare["zrodla"] if z["id"] not in ZRODLO_FILMU.values()] + ZRODLA
zapisz(f"{DANE}/filmy-cwiczen.json", {"opis": opis_f, "zrodla": zrodla, "odpiete": odpiete}, "filmy", wpisy)

opis_b = ("Ćwiczenia z bibliotek filmów Theory of Motion Exercise Library i Catalyst Athletics (Olympic Weightlifting "
          "Exercise Library), import 09.10.2026. Osobno od BAZY trenera (baza-cwiczen.json): te same pola co BAZA plus "
          "biblioteka, jednostronne (tak/nie/?), rodzaj, sprzet, weryfikacja (kody powodów) i klucz (stały klucz "
          "kanoniczny nazwy — po nim kolejny import zachowuje id). Klasyfikacja według docs/dane/zasady-klasyfikacji.md; "
          "„DO WERYFIKACJI” w uwagach = decyzja trenera potrzebna (generator takich nie losuje; ćwiczeń z bibliotek "
          "generator nie losuje w ogóle — tylko ręczny wybór w konsoli). Filmy: filmy-cwiczen.json. „zatwierdzone” = "
          "data decyzji trenera (silnik/narzedzia/weryfikacja-bibliotek.py), „ukryte” = trener usunął je z wyboru "
          "(zostaje, bo mogło już trafić do planu); pominiete — filmy kanałów, które nie są ćwiczeniem; scalone_z_baza "
          "— to samo co ćwiczenie BAZY (filmy przy nim); poradniki_bez_cwiczenia — ogólne poradniki Theory of Motion "
          "(trener może je przypiąć w arkuszu weryfikacji).")
# poradniki Theory of Motion bez jednego ćwiczenia (ogólne: mobilność, styl życia, kilka ruchów naraz)
przypisane = {w.get("youtube_id") for w in wpisy}
poradniki_bez = [{"yt": p["id"], "tytul": p["tytul"], "czas_s": p.get("czas")}
                 for p in json.load(open("tom-poradniki.json")) if p["id"] not in przypisane]
zapisz(plik_bib, {"opis": opis_b, "liczba": len(cwiczenia),
                  "pominiete": pominiete, "scalone_z_baza": scalone,
                  "poradniki_bez_cwiczenia": poradniki_bez}, "cwiczenia", cwiczenia)

json.dump({"pominiete": pominiete, "bez_osadzania": bez_osadzania, "scalone": scalone}, open("raport.json", "w"), ensure_ascii=False, indent=1)
st = collections.Counter("do weryfikacji" if c["uwagi"] else "pewne" for c in cwiczenia)
print(f"ćwiczeń z bibliotek: {len(cwiczenia)} ({dict(st)}), pominiętych: {len(pominiete)}, filmów: {len(wpisy)}, "
      f"bez osadzania: {len(bez_osadzania)}, z propozycji reguł: {sum(1 for c in cwiczenia if c.get('_z_propozycji'))}")
