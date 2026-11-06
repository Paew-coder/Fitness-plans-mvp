"""Lista ćwiczeń do bazy: BAZA 5.17 + grupy ToM + Catalyst, z filmami i propozycją reguł.

Wynik: encje.json — {"baza": {id: [filmy]}, "nowe": [encja]}.
Film: {"yt": id, "zrodlo": "tom"|"catalyst", "rola": "demonstracja"|"poradnik", "tytul", "czas"}.
"""
import json, os, sys, collections, re
sys.path.insert(0, "kod")
from kanon import kanon
from mapa_baza import MAPA
from mapa_cat_tom import CAT_TOM
from mapa_poradniki import PORADNIKI_TOM
from reguly import klasyfikuj

BAZA = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "docs", "dane", "baza-cwiczen.json")))["cwiczenia"]
grupy = collections.OrderedDict((g["klucz"], g) for g in json.load(open("tom-grupy.json"))["grupy"])
cat = json.load(open("catalyst-cwiczenia.json"))
poradniki = {p["id"]: p for p in json.load(open("tom-poradniki.json"))}

def film_tom(f, rola="demonstracja"):
    return {"yt": f["id"], "zrodlo": "tom", "rola": rola, "tytul": f["tytul"], "czas": f.get("czas")}
def film_cat(c):
    return {"yt": c["id"], "zrodlo": "catalyst", "rola": "poradnik", "tytul": c["tytul"], "czas": c.get("czas")}

def nazwa_grupy(g):
    # najczęstszy wariant tytułu; przy remisie pierwszy
    n = max(g["nazwy"].items(), key=lambda kv: kv[1])[0]
    n = re.sub(r"\s+", " ", n).strip().rstrip(".").strip()
    # YouTube nie przyjmuje „/” w tytułach, więc kanał pisze „Band:Cable”, „w:”
    n = re.sub(r"\b(Band|Cable):(Cable|Band)\b", r"\1/\2", n)
    n = re.sub(r"\bw: ", "w/ ", n)
    return n

tom_baza = collections.defaultdict(list)   # grupa ToM → ćwiczenia BAZY (EX-0105 i EX-0140 mają ten sam film)
for bid, (tytuly, _) in MAPA.items():
    for t in tytuly:
        tom_baza[kanon(t)].append(bid)
cat_baza = {n: bid for bid, (_, cc) in MAPA.items() for n in cc}

baza_filmy = collections.defaultdict(list)
nowe = collections.OrderedDict()   # klucz → encja

for k, g in grupy.items():
    filmy = [film_tom(f) for f in g["filmy"]]
    if k in tom_baza:
        for bid in tom_baza[k]: baza_filmy[bid] += [dict(f) for f in filmy]
        continue
    nowe[k] = {"t": None, "klucz": k, "zrodlo": "tom", "nazwa": nazwa_grupy(g), "warianty": sorted(g["nazwy"]),
               "typ": g["typ"], "filmy": filmy}

cel_cat = {}
for c in cat:
    n = c["nazwa"]
    if n in cat_baza:
        baza_filmy[cat_baza[n]].append(film_cat(c)); cel_cat[n] = cat_baza[n]; continue
    k = kanon(CAT_TOM[n]) if n in CAT_TOM else kanon(n)
    if k in tom_baza:
        for bid in tom_baza[k]: baza_filmy[bid].append(film_cat(c))
        cel_cat[n] = tom_baza[k][0]; continue
    if k in nowe:
        nowe[k]["filmy"].append(film_cat(c)); nowe[k].setdefault("catalyst", []).append(n); cel_cat[n] = k; continue
    kk = "cat:" + kanon(n)
    assert kk not in nowe, n
    nowe[kk] = {"t": None, "klucz": kk, "zrodlo": "catalyst", "nazwa": n, "warianty": [n], "typ": "cwiczenie",
                "filmy": [film_cat(c)], "catalyst_grupy": c["grupy"]}
    cel_cat[n] = kk

# Poradniki ToM
for yt, cel in PORADNIKI_TOM.items():
    f = film_tom(poradniki[yt], "poradnik")
    if cel.startswith("EX-"):
        baza_filmy[cel].append(f)
    elif cel.startswith("tom:"):
        k = kanon(cel[4:])
        if k in tom_baza: baza_filmy[tom_baza[k][0]].append(f)
        else: nowe[k]["filmy"].append(f)
    else:
        k = cel_cat[cel[4:]]
        (baza_filmy[k] if k.startswith("EX-") else nowe[k]["filmy"]).append(f)

# Propozycja reguł + tymczasowe numery
for i, e in enumerate(nowe.values(), 1):
    e["t"] = f"N{i:04d}"
    e["propozycja"] = klasyfikuj(e["nazwa"])

# Unikalność nazw (bez wielkości liter) — także względem BAZY
uzyte = collections.Counter(b["nazwa"].lower() for b in BAZA)
for e in nowe.values():
    uzyte[e["nazwa"].lower()] += 1
duble = [n for n, c in uzyte.items() if c > 1]
print("duble nazw:", duble)

json.dump({"baza": baza_filmy, "nowe": list(nowe.values())}, open("encje.json", "w"), ensure_ascii=False, indent=1)
st = collections.Counter(e["zrodlo"] for e in nowe.values())
print("BAZA z filmami:", len(baza_filmy), "| nowe:", len(nowe), dict(st))
print("filmów razem:", sum(len(v) for v in baza_filmy.values()) + sum(len(e["filmy"]) for e in nowe.values()))
pw = collections.Counter(e["propozycja"]["pewnosc"] for e in nowe.values()); print("pewność reguł:", dict(pw))
print("rodzaj:", collections.Counter(e["propozycja"]["rodzaj"] for e in nowe.values()))
print("kategoria:", collections.Counter(e["propozycja"]["kategoria"] for e in nowe.values()))
