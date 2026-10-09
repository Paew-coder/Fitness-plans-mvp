import json, re, collections
e = json.load(open("tom-uploads.json"))["entries"]

POZA = re.compile(r"vlog|story|episode|\bep\.?\s*\d|achieve|kitchen|flash mob|promo|q\+a|program|course|workshop|"
                  r"class experience|perspective|possibility|gong|our year|anniversary|lip dub|challenge|meet\b|"
                  r"pregnan|^our |^why |^what |introducing|females can|female pull ups|hotel workout|travel workout|"
                  r"workout plan|total body workout|strength series for runners|workout progressions|fit tip|"
                  r"sfg level|by women of|explore:|this is |collective|trifest|quest|resolution|fitness journey|"
                  r"fitness industry|fitness elitism|fitness marketing|healthier place|redefining|gym hacks|"
                  r"lose weight|building muscle|gym owners|strategy session|all-in|exxentric|follow my workout|"
                  r"cranberry|embrace|members take|supplement|nutrition|cooking|happy |shake bar|chimney|"
                  r"debunking|ordinary people|how we stay|natural|quality over|food quality|what matters|"
                  r"cutting yourself|injuries suck|camargo|higher reps|food trackers|moms|behind the scenes|"
                  r"putting out so much|meeting yourself|thursday|running, renegades|international women|"
                  r"tarzan|paddy|staff reviews|first time powerlifters|powerlifting meet|young fitness coach|"
                  r"marathon monday|where have we been|squadgoals|gratitude|one thing|sets us apart|vacation|"
                  r"hawaii|starting your|two dumbbell strength workout|advanced kettlebell", re.I)
PORADNIK = re.compile(r"how to|guide|tips?\b|tip to|improve your|stronger|butt wink|like a pro|like a boss|"
                      r"breaking down|six moves|mobility with|train your core", re.I)
KOMPLEKS = re.compile(r"complex|finisher|circuit|superset|ladder|emom|\bseries\b|workout|trio\b|combo|"
                      r"\s\+\s|burnout|flow\b", re.I)

def klucz(t):
    k = t.lower().replace("&", " and ")
    k = re.sub(r"\balt\.?\s", "alternating ", k)
    k = re.sub(r"[^\w/\.\+\- ]", " ", k)
    k = re.sub(r"\s+", " ", k).strip(" .-")
    return k

cwiczenia = collections.OrderedDict(); poradniki = []; pominiete = []
for x in e:
    t = x["title"].strip(); d = x.get("duration") or 0
    film = {"id": x["id"], "tytul": t, "czas": d}
    if POZA.search(t) and not re.search(r"\b(press|squat|row|curl|lunge|plank|deadlift|swing)\b", t, re.I) or d > 300:
        (poradniki if PORADNIK.search(t) and d <= 900 else pominiete).append(film); continue
    if d > 90:
        (poradniki if PORADNIK.search(t) else pominiete).append(film); continue
    k = klucz(t)
    if k not in cwiczenia:
        cwiczenia[k] = {"klucz": k, "tytuly": collections.Counter(), "filmy": [],
                        "typ": "kompleks" if KOMPLEKS.search(t) else "cwiczenie"}
    cwiczenia[k]["tytuly"][t] += 1
    cwiczenia[k]["filmy"].append(film)

wynik = []
for c in cwiczenia.values():
    nazwa = c["tytuly"].most_common(1)[0][0]
    wynik.append({"klucz": c["klucz"], "nazwa": nazwa, "typ": c["typ"], "filmy": c["filmy"]})
json.dump(wynik, open("tom-cwiczenia.json", "w"), ensure_ascii=False, indent=1)
json.dump(poradniki, open("tom-poradniki.json", "w"), ensure_ascii=False, indent=1)
json.dump(pominiete, open("tom-pominiete.json", "w"), ensure_ascii=False, indent=1)
print("ćwiczeń:", len(wynik), "| kompleksów:", sum(1 for c in wynik if c["typ"] == "kompleks"),
      "| filmów w ćwiczeniach:", sum(len(c["filmy"]) for c in wynik),
      "| poradników:", len(poradniki), "| pominiętych:", len(pominiete))
print("--- poradniki:"); [print("  ", p["czas"], p["tytul"]) for p in poradniki]
print("--- pominięte ≤ 90 s:"); [print("  ", p["czas"], p["tytul"]) for p in pominiete if p["czas"] <= 90]
