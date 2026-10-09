import json, os, sys, collections, re
sys.path.insert(0, "kod")
from kanon import kanon
BAZA = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "docs", "dane", "baza-cwiczen.json")))["cwiczenia"]
tom = json.load(open("tom-cwiczenia.json"))
cat = json.load(open("catalyst-cwiczenia.json"))

# ToM: grupy po kluczu kanonicznym
grupy = collections.OrderedDict()
for c in tom:
    k = kanon(c["nazwa"])
    g = grupy.setdefault(k, {"klucz": k, "nazwy": collections.Counter(), "filmy": [], "typ": c["typ"]})
    for f in c["filmy"]:
        g["nazwy"][f["tytul"]] += 1
        g["filmy"].append(f)
    if c["typ"] == "kompleks": g["typ"] = "kompleks"
print("ToM: grup", len(grupy), "(z", len(tom), "nazw)")

baza_k = {kanon(b["nazwa"]): b for b in BAZA}
tom_w_bazie = {k: baza_k[k]["id"] for k in grupy if k in baza_k}
print("ToM = BAZA (dokładny klucz):", len(tom_w_bazie), sorted(baza_k[k]["nazwa"] for k in tom_w_bazie))
cat_k = collections.defaultdict(list)
for c in cat: cat_k[kanon(c["nazwa"])].append(c)
print("Catalyst: kluczy", len(cat_k))
cat_tom = [k for k in cat_k if k in grupy]
cat_baza = [k for k in cat_k if k in baza_k]
print("Catalyst = ToM:", len(cat_tom), "| Catalyst = BAZA:", len(cat_baza))
print("  przykłady C=ToM:", cat_tom[:40])
print("  C=BAZA:", cat_baza)
json.dump({"grupy": [{**g, "nazwy": dict(g["nazwy"])} for g in grupy.values()]}, open("tom-grupy.json", "w"), ensure_ascii=False, indent=1)
