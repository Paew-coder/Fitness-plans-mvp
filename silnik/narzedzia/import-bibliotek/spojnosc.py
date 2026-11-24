import json, glob, re, collections
naz = {}
for f in glob.glob("partie/partia-*.txt"):
    for l in open(f):
        if not l.startswith("#"):
            p = l.split(" | "); naz[p[0]] = p[1]
d = {}
for f in sorted(glob.glob("wyniki/partia-*.jsonl")):
    for l in open(f):
        x = json.loads(l); x["_p"] = f[-8:-6]; d[x["t"]] = x
SPR = r"^(?:\d(?:\.\d)?\s*)?(?:2DB|2KB|1DB|1KB|DB|KB|BB|Barbell|Dumbbell|Kettlebell|Band/Cable|Cable/Band|Band|Cable|Banded|Goblet|Suitcase|Weighted|Loaded|Angled BB|Angled Barbell|Plate|MB|TRX|Bodyweight|BW)\b\s*"
def rdzen(n):
    k = n
    for _ in range(3):
        k2 = re.sub(SPR, "", k, flags=re.I).strip(" -")
        if k2 == k: break
        k = k2
    return k.lower()
g = collections.defaultdict(list)
for t, x in d.items():
    if x["status"] == "pominąć": continue
    g[rdzen(naz[t])].append(t)
konf = 0
for k, ts in sorted(g.items()):
    if len(ts) < 2: continue
    kat = {d[t]["kategoria"] for t in ts}
    if len(kat) > 1:
        konf += 1
        print(f"[{k}] " + " | ".join(f"{naz[t]} ({d[t]['_p']}): {d[t]['kategoria']} {d[t]['coeff']} {d[t]['status'][:4]}" for t in ts))
print("konfliktów kategorii:", konf)
