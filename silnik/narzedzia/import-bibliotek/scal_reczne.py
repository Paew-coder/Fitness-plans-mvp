"""Ręczny przegląd (reczne/XX.txt, skrót) → dopisanie do wyniki/partia-XX.jsonl po wynikach podagenta.
Linia: t|kat|coeff|prog|skok|jedn|rodzaj|status|kody|powód|sprzęt (sprzęt pusty = z propozycji reguł)."""
import json, sys, os
# katalog roboczy importu (listy filmów, encje.json, wyniki/) — poza repo
os.chdir(os.environ.get("KATALOG_IMPORTU", "."))
nr = sys.argv[1].zfill(2)
KAT = {"LPU": "Lower push", "LPL": "Lower pull", "UPH": "Upper push horizontal", "UPV": "Upper push vertical",
       "TRI": "Tricep", "RH": "Upper pull horizontal", "RV": "Upper pull vertical", "BIC": "Bicep", "CORE": "Core"}
PROG = {"kg": "kg", "mc": "masa ciała", "cz": "czas", "dy": "dystans", "dc": "dodatkowy ciężar", "as": "asysta", "ru": "ręczne ustawienie"}
ROD = {"s": "trening siłowy", "o": "dwubój olimpijski", "p": "plyometria", "m": "mobilność", "r": "rozciąganie",
       "od": "oddech", "k": "kondycja", "x": "kompleks"}
ST = {"p": "pewne", "w": "do weryfikacji", "x": "pominąć"}
partia = [l.rstrip("\n").split(" | ") for l in open(f"partie/partia-{nr}.txt") if not l.startswith("#")]
sprzet_prop = {l[0]: [s for s in l[6].split(";")[6].strip().split(",") if s and s != "-"] for l in partia}
plik = f"wyniki/partia-{nr}.jsonl"
istniejace = [l for l in open(plik)] if os.path.exists(plik) else []
zrobione = [json.loads(l)["t"] for l in istniejace if l.strip()]
reszta = [l[0] for l in partia if l[0] not in set(zrobione)]
nowe = []
for l in open(f"reczne/{nr}.txt"):
    if not l.strip() or l.startswith("#"): continue
    p = l.rstrip("\n").split("|")
    p += [""] * (11 - len(p))
    t, kat, coeff, prog, skok, j, rod, st, kody, powod, spr = p[:11]
    nowe.append({"t": t, "kategoria": KAT[kat], "coeff": float(coeff) if "." in coeff else int(coeff),
                 "progresja": PROG[prog], "skok_kg": float(skok) if "." in skok else int(skok), "jednostronne": j,
                 "rodzaj": ROD[rod], "sprzet": [s for s in spr.split(",") if s] if spr else sprzet_prop[t],
                 "status": ST[st], "powody": [k for k in kody.split(",") if k], "powod": powod})
ts = [d["t"] for d in nowe]
assert ts == reszta, f"kolejność/komplet: ręcznych {len(ts)}, brakuje {len(reszta)}; pierwsza różnica: " + \
    str(next(((a, b) for a, b in zip(ts, reszta) if a != b), None))
with open(plik, "a") as f:
    if istniejace and not istniejace[-1].endswith("\n"): f.write("\n")
    for d in nowe: f.write(json.dumps(d, ensure_ascii=False) + "\n")
print(f"partia {nr}: dopisane {len(nowe)} (było {len(zrobione)})")
