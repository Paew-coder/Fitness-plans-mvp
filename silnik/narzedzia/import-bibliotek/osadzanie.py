"""Sprawdza osadzanie (oEmbed) wszystkich filmów; wyniki dopisuje do osadzanie.jsonl (wznawialne)."""
import json, time, urllib.request, urllib.error, os, sys
pliki = ["tom-uploads.json", "catalyst-biblioteka.json"]
ids = []
for p in pliki:
    for x in json.load(open(p))["entries"]:
        if x: ids.append(x["id"])
gotowe = set()
if os.path.exists("osadzanie.jsonl"):
    for l in open("osadzanie.jsonl"):
        gotowe.add(json.loads(l)["id"])
with open("osadzanie.jsonl", "a") as out:
    for i, v in enumerate(ids):
        if v in gotowe: continue
        u = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={v}&format=json"
        wynik = {"id": v}
        for proba in range(4):
            try:
                with urllib.request.urlopen(u, timeout=20) as r:
                    j = json.load(r)
                    wynik.update(kod=200, autor=j.get("author_name"), autor_url=j.get("author_url"), tytul=j.get("title"))
                break
            except urllib.error.HTTPError as e:
                wynik.update(kod=e.code)
                if e.code in (401, 403, 404): break
                time.sleep(5 * (proba + 1))
            except Exception as e:
                wynik.update(kod=-1, blad=str(e)[:80]); time.sleep(5 * (proba + 1))
        out.write(json.dumps(wynik, ensure_ascii=False) + "\n"); out.flush()
        time.sleep(0.35)
print("koniec", len(ids))
