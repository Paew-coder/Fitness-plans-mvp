"""Pozostałe pozycje partii w zwięzłej postaci do ręcznego przeglądu. Użycie: python3 -I kod/pokaz.py XX [od] [ile]"""
import json, sys, os
# katalog roboczy importu (listy filmów, encje.json, wyniki/) — poza repo
os.chdir(os.environ.get("KATALOG_IMPORTU", "."))
nr = sys.argv[1].zfill(2)
od = int(sys.argv[2]) if len(sys.argv) > 2 else 0
ile = int(sys.argv[3]) if len(sys.argv) > 3 else 10**6
zrobione = set()
if os.path.exists(f"wyniki/partia-{nr}.jsonl"):
    zrobione = {json.loads(l)["t"] for l in open(f"wyniki/partia-{nr}.jsonl") if l.strip()}
KAT = {"Lower push": "LPU", "Lower pull": "LPL", "Upper push horizontal": "UPH", "Upper push vertical": "UPV",
       "Tricep": "TRI", "Upper pull horizontal": "RH", "Upper pull vertical": "RV", "Bicep": "BIC", "Core": "CORE"}
PROG = {"kg": "kg", "masa ciała": "mc", "czas": "cz", "dystans": "dy", "dodatkowy ciężar": "dc", "asysta": "as", "ręczne ustawienie": "ru"}
linie = [l.rstrip("\n").split(" | ") for l in open(f"partie/partia-{nr}.txt") if not l.startswith("#")]
reszta = [l for l in linie if l[0] not in zrobione][od:od + ile]
for l in reszta:
    t, nazwa, zr, typ, filmy, inne, prop = l[0], l[1], l[2], l[3], l[4], l[5], l[6]
    p = [x.strip() for x in prop.split(";")]
    kat, coeff, prog, skok, j, rodz, spr = p[0], p[1], p[2], p[3], p[4], p[5], p[6]
    pew = p[7] if len(p) > 7 else ""
    print(f"{t}|{nazwa}|{zr[0]}|{KAT[kat]} {coeff} {PROG[prog]} {skok} j={j} {spr}" + (" ?" if "weryf" in pew else ""))
print(f"# {len(reszta)} pozycji", file=sys.stderr)
