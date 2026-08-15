"""Generuje moduly TS z docs/dane/*.json. Uruchom po kazdej zmianie danych zrodlowych."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parents[2]
dane = root / "docs" / "dane"
out  = root / "silnik" / "src" / "dane"

t = json.load(open(dane / "tabele-przeliczeniowe.json", encoding="utf-8"))

def siatka(d, klucze_zewn, klucze_wewn):
    w = []
    for k in klucze_zewn:
        wiersz = ", ".join(f"{kk}: {d[k][kk]}" for kk in klucze_wewn if kk in d[k])
        w.append(f"  {k}: {{ {wiersz} }},")
    return "\n".join(w)

powt  = [str(i) for i in range(1, 16)]
rpe_k = ["6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10"]
rpe_s = ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10"]

naglowek = "// PLIK GENEROWANY — nie edytuj recznie.\n// Zrodlo: docs/dane/tabele-przeliczeniowe.json (MasterTemplate 5.17, zakladka TABELE)\n// Regeneracja: python3 silnik/narzedzia/generuj-dane.py\n\n"

ts = naglowek
ts += "/** RPE -> %1RM. Klucz zewnetrzny = powtorzenia 1-15, wewnetrzny = RPE 6-10 co 0,5. */\n"
ts += "export const TABELA_RPE: Record<number, Record<number, number>> = {\n"
ts += siatka(t["rpe_1rm"], powt, rpe_k) + "\n};\n\n"
for nazwa, klucz, opis in (
    ("TABELA_STRES_CALKOWITY", "stres_calkowity", "Stres calkowity (t)"),
    ("TABELA_STRES_CENTRALNY", "stres_centralny", "Stres centralny (c)"),
    ("TABELA_STRES_OBWODOWY",  "stres_obwodowy",  "Stres obwodowy (p)"),
):
    ts += f"/** {opis} na serie przy coeff = 1. Klucz zewnetrzny = RPE 5-10, wewnetrzny = powtorzenia 1-15. */\n"
    ts += f"export const {nazwa}: Record<number, Record<number, number>> = {{\n"
    ts += siatka(t[klucz], rpe_s, powt) + "\n};\n\n"
(out / "tabele.ts").write_text(ts, encoding="utf-8")

b = json.load(open(dane / "baza-cwiczen.json", encoding="utf-8"))
jedn = json.load(open(dane / "jednostronne.json", encoding="utf-8"))
POTWIERDZONE = {e["id"] for e in jedn["potwierdzone"]}
KANDYDACI = {e["id"] for e in jedn["kandydaci"]}
lin = ["// PLIK GENEROWANY — nie edytuj recznie.",
       "// Zrodlo: docs/dane/baza-cwiczen.json (MasterTemplate 5.17, zakladka BAZA)",
       "// Regeneracja: python3 silnik/narzedzia/generuj-dane.py",
       "",
       'import type { Cwiczenie } from "../typy.ts";',
       "",
       f"/** {b['liczba']} cwiczen z BAZY 5.17. */",
       "export const BAZA_CWICZEN: readonly Cwiczenie[] = ["]
for e in b["cwiczenia"]:
    p = [f'id: {json.dumps(e["id"], ensure_ascii=False)}',
         f'nazwa: {json.dumps(e["nazwa"], ensure_ascii=False)}',
         f'kategoria: {json.dumps(e["kategoria"], ensure_ascii=False)}',
         f'part: {json.dumps(e["part"], ensure_ascii=False)}',
         f'coeff: {e["coeff"]}',
         f'skokKg: {e["skok_kg"]}',
         f'progresja: {json.dumps(e["progresja"], ensure_ascii=False)}']
    if e.get("film"):       p.append(f'film: {json.dumps(e["film"], ensure_ascii=False)}')
    if e.get("uwagi"):      p.append(f'uwagi: {json.dumps(e["uwagi"], ensure_ascii=False)}')
    if e.get("scalone_id"): p.append(f'scaloneId: {json.dumps(e["scalone_id"], ensure_ascii=False)}')
    if e["id"] in POTWIERDZONE: p.append("jednostronne: true")
    elif e["id"] in KANDYDACI:  p.append("jednostronneDoPotwierdzenia: true")
    lin.append("  { " + ", ".join(p) + " },")
lin += ["];", ""]
(out / "cwiczenia.ts").write_text("\n".join(lin), encoding="utf-8")
print("tabele.ts + cwiczenia.ts wygenerowane;", b["liczba"], "cwiczen")
