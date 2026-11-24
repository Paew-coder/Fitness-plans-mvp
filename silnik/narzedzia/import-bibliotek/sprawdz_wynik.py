"""Sprawdza wyniki/partia-XX.jsonl względem partie/partia-XX.txt. Użycie: python3 -I kod/sprawdz_wynik.py XX"""
import json, sys, os
# katalog roboczy importu (listy filmów, encje.json, wyniki/) — poza repo
os.chdir(os.environ.get("KATALOG_IMPORTU", "."))
nr = sys.argv[1].zfill(2)
oczek = [l.split(" | ")[0] for l in open(f"partie/partia-{nr}.txt") if not l.startswith("#")]
KAT = {"Lower push", "Lower pull", "Upper push horizontal", "Upper push vertical", "Tricep",
       "Upper pull horizontal", "Upper pull vertical", "Bicep", "Core"}
PROG = {"kg", "masa ciała", "czas", "dystans", "dodatkowy ciężar", "asysta", "ręczne ustawienie"}
ROD = {"trening siłowy", "dwubój olimpijski", "plyometria", "mobilność", "rozciąganie", "oddech", "kondycja", "kompleks"}
SPR = {"sztanga", "hantle", "kettlebell", "wyciąg", "guma", "maszyna", "TRX", "piłka lekarska", "piłka gimnastyczna",
       "ławka", "skrzynia", "drążek", "kółka", "landmine", "trap bar", "gryf łamany", "talerz", "slider", "sanie",
       "worek", "roller", "lina", "kamizelka", "ściana"}
POW = {"KOMPLEKS", "MOBILNOSC", "KONDYCJA", "KATEGORIA", "COEFF", "JEDNOSTRONNE", "PROGRESJA", "NAZWA", "NIE_CWICZENIE"}
bledy = []
try:
    linie = [l for l in open(f"wyniki/partia-{nr}.jsonl") if l.strip()]
except FileNotFoundError:
    sys.exit("brak pliku wyników")
if len(linie) != len(oczek):
    bledy.append(f"linii {len(linie)}, oczekiwano {len(oczek)}")
for i, l in enumerate(linie):
    try:
        d = json.loads(l)
    except Exception as e:
        bledy.append(f"linia {i+1}: zły JSON ({e})"); continue
    t = d.get("t")
    if i < len(oczek) and t != oczek[i]: bledy.append(f"linia {i+1}: t={t}, oczekiwano {oczek[i]}")
    if d.get("kategoria") not in KAT: bledy.append(f"{t}: kategoria {d.get('kategoria')!r}")
    if d.get("coeff") not in (1, 0.75, 0.5, 0.25): bledy.append(f"{t}: coeff {d.get('coeff')!r}")
    if d.get("progresja") not in PROG: bledy.append(f"{t}: progresja {d.get('progresja')!r}")
    if d.get("skok_kg") not in (0, 1, 2.5, 4, 5): bledy.append(f"{t}: skok_kg {d.get('skok_kg')!r}")
    if d.get("jednostronne") not in ("tak", "nie", "?"): bledy.append(f"{t}: jednostronne {d.get('jednostronne')!r}")
    if d.get("rodzaj") not in ROD: bledy.append(f"{t}: rodzaj {d.get('rodzaj')!r}")
    if not isinstance(d.get("sprzet"), list) or set(d["sprzet"]) - SPR: bledy.append(f"{t}: sprzet {d.get('sprzet')!r}")
    st = d.get("status")
    if st not in ("pewne", "do weryfikacji", "pominąć"): bledy.append(f"{t}: status {st!r}")
    pw = d.get("powody", [])
    if not isinstance(pw, list) or set(pw) - POW: bledy.append(f"{t}: powody {pw!r}")
    if st == "pewne" and (pw or d.get("powod") or d.get("jednostronne") == "?"):
        bledy.append(f"{t}: pewne, a są powody/opis albo jednostronne '?'")
    if st == "do weryfikacji" and (not pw or not d.get("powod")): bledy.append(f"{t}: do weryfikacji bez kodu albo opisu")
    if d.get("jednostronne") == "?" and "JEDNOSTRONNE" not in pw and st != "pominąć": bledy.append(f"{t}: jednostronne '?' bez kodu JEDNOSTRONNE")
    if d.get("progresja") in ("masa ciała", "czas", "dystans", "ręczne ustawienie") and d.get("skok_kg") != 0:
        bledy.append(f"{t}: progresja {d['progresja']} wymaga skok_kg 0")
print("OK" if not bledy else "BŁĘDY:\n" + "\n".join(bledy[:60]))
