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

# ── ODDECH ────────────────────────────────────────────────────────────
o = json.load(open(dane / "oddech-progi.json", encoding="utf-8"))
lin = ["// PLIK GENEROWANY — nie edytuj recznie.",
       "// Zrodlo: docs/dane/oddech-progi.json (MasterTemplate 5.17, TABELE!A66:I70)",
       "// Regeneracja: python3 silnik/narzedzia/generuj-dane.py",
       "",
       'import type { ProgTWOT } from "../oddech.ts";',
       "",
       "/** Piec progow TWOT -> dawka oddechowa. */",
       "export const PROGI_TWOT: readonly ProgTWOT[] = ["]
for p in o["poziomy"]:
    lin.append("  {")
    lin.append(f'    od: {p["twot_od"]}, do: {p["twot_do"]}, procentTWOT: {p["procent_twot"]},')
    lin.append(f'    poziom: {json.dumps(p["poziom"], ensure_ascii=False)},')
    lin.append(f'    czestotliwosc: {json.dumps(p["czestotliwosc"], ensure_ascii=False)},')
    lin.append(f'    blokA: {json.dumps(p["blok_a"], ensure_ascii=False)},')
    lin.append(f'    blokB: {json.dumps(p["blok_b"], ensure_ascii=False)},')
    lin.append(f'    blokC: {json.dumps(p["blok_c"], ensure_ascii=False)},')
    lin.append(f'    brama: {json.dumps(p["brama"], ensure_ascii=False)},')
    lin.append("  },")
lin += ["];", ""]
(out / "oddech.ts").write_text("\n".join(lin), encoding="utf-8")

# ── BIEG ──────────────────────────────────────────────────────────────
g = json.load(open(dane / "bieg-parametry.json", encoding="utf-8"))
lin = ["// PLIK GENEROWANY — nie edytuj recznie.",
       "// Zrodlo: docs/dane/bieg-parametry.json (MasterTemplate 5.17, zakladka BIEG)",
       "// Regeneracja: python3 silnik/narzedzia/generuj-dane.py",
       "",
       'import type { StrefaTetna, TempoBiegowe, WzorJednostki } from "../bieg.ts";',
       "",
       "/** Piec stref tetna jako ulamek HR max (BIEG!B18:B22). */",
       "export const STREFY_TETNA: readonly StrefaTetna[] = ["]
for s in g["strefy"]:
    lin.append(f'  {{ nazwa: {json.dumps(s["nazwa"], ensure_ascii=False)}, od: {s["od"]}, do: {s["do"]} }},')
lin += ["];", "",
        "/** Cztery tempa jako offset w min/km od tempa testowego (BIEG!B25:B28). */",
        "export const TEMPA: readonly TempoBiegowe[] = ["]
for t_ in g["tempa"]:
    lin.append(f'  {{ klucz: {json.dumps(t_["klucz"], ensure_ascii=False)}, '
               f'nazwa: {json.dumps(t_["nazwa"], ensure_ascii=False)}, '
               f'offset: {t_["offset_min_km"]} }},')
lin += ["];", "",
        "/** Piec typow jednostek (BIEG!B32:O36 i kolejne bloki tygodni). */",
        "export const WZORY_JEDNOSTEK: readonly WzorJednostki[] = ["]
for j in g["jednostki"]:
    lin.append(f'  {{ nr: {j["nr"]}, typ: {json.dumps(j["typ"], ensure_ascii=False)}, '
               f'bazaMin: {j["bazaMin"]}, tempo: {json.dumps(j["tempo"], ensure_ascii=False)}, '
               f'strefa: {j["strefa"]}, etykieta: {json.dumps(j["etykieta"], ensure_ascii=False)}, '
               f'dodatkoweMin: {j["dodatkoweMin"]} }},')
lin += ["];", "",
        "/** Mnoznik objetosci na tydzien; T4 celowo lzejszy. */",
        f'export const MNOZNIK_TYGODNIA: readonly number[] = {json.dumps(g["mnoznik_tygodnia"])};',
        "",
        "/** Skalowanie objetosci liczba jednostek w tygodniu (CHOOSE w arkuszu). */",
        f'export const MNOZNIK_LICZBY_JEDNOSTEK: readonly number[] = {json.dumps(g["mnoznik_liczby_jednostek"])};',
        ""]
(out / "bieg.ts").write_text("\n".join(lin), encoding="utf-8")
print("oddech.ts + bieg.ts wygenerowane")

# ── SZABLONY PLANOW Z BASE44 ──────────────────────────────────────────
#
# Uklad dni i kategorie z 14 szablonow aplikacji trenera w Base44, a przy
# czterech — dobor cwiczen z jego zapisanych planow. Nazwy z Base44 mapujemy
# na BAZE przez `mapowanie_nazw`; trzy bez odpowiednika (Close-Grip Bench
# Press, Machine Shoulder Press, Plank) zostaja pustym slotem z kategoria —
# nic nie zgadujemy za trenera.
sz = json.load(open(dane / "szablony-base44.json", encoding="utf-8"))
sk = json.load(open(dane / "szkielety-base44.json", encoding="utf-8"))
po_nazwie = {e["nazwa"]: e["id"] for e in b["cwiczenia"]}
mapa = {**sk["mapowanie_nazw"]["zgodne"], **sk["mapowanie_nazw"]["do_potwierdzenia"]}
zapisane = {s["template_id"]: s["dni"] for s in sk["szkielety"]}
KATEGORIE = {k.lower(): k for k in (
    "Lower push", "Lower pull", "Upper push horizontal", "Upper push vertical",
    "Upper pull horizontal", "Upper pull vertical", "Core", "Bicep", "Tricep")}

def czesc_szablonu(tid):
    if tid.startswith("hyper"): return "hipertrofia"
    if tid.endswith("_v2"):     return "intensywność"
    return "objętość"

lin = ["// PLIK GENEROWANY — nie edytuj recznie.",
       "// Zrodlo: docs/dane/szablony-base44.json + szkielety-base44.json (Base44, 21.09.2026)",
       "// Regeneracja: python3 silnik/narzedzia/generuj-dane.py",
       "",
       'import type { SzablonPlanu } from "../szablony-planow.ts";',
       "",
       f"/** {len(sz['szablony'])} szablonow z aplikacji trenera w Base44. */",
       "export const SZABLONY_BASE44: readonly SzablonPlanu[] = ["]
brakujace = set()
for s in sz["szablony"]:
    tid = s["id"]
    dni = []
    for d in s["dni"]:
        wybor = zapisane.get(tid, {}).get(d["id"], {})
        sloty = []
        for x in d["sloty"]:
            kat = KATEGORIE[x["kategoria"].lower()]
            prog = s["progresja"].get(f'{d["id"]}_{x["lp"]}', [])
            top = any(len(t) > 1 for t in prog)
            nazwa_b44 = wybor.get(x["lp"], {}).get("cwiczenie")
            cid = po_nazwie.get(mapa.get(nazwa_b44)) if nazwa_b44 else None
            if nazwa_b44 and not cid: brakujace.add(nazwa_b44)
            p = [f'lp: "{x["lp"]}."', f'kategoria: {json.dumps(kat, ensure_ascii=False)}']
            if top: p.append("topSet: true")
            if cid: p.append(f'cwiczenieId: "{cid}"')
            if nazwa_b44 and not cid: p.append(f'bezOdpowiednika: {json.dumps(nazwa_b44, ensure_ascii=False)}')
            sloty.append("{ " + ", ".join(p) + " }")
        dni.append("[\n      " + ",\n      ".join(sloty) + ",\n    ]")
    lin.append("  {")
    lin.append(f'    id: {json.dumps(tid)}, nazwa: {json.dumps(s["nazwa"], ensure_ascii=False)},')
    lin.append(f'    opis: {json.dumps(s["opis"], ensure_ascii=False)},')
    lin.append(f'    czesc: {json.dumps(czesc_szablonu(tid), ensure_ascii=False)}, zCwiczeniami: {"true" if tid in zapisane else "false"},')
    lin.append("    dni: [\n    " + ",\n    ".join(dni) + ",\n    ],")
    lin.append("  },")
lin += ["];", ""]
(out / "szablony.ts").write_text("\n".join(lin), encoding="utf-8")
print("szablony.ts wygenerowane;", len(sz["szablony"]), "szablonow; bez odpowiednika:", sorted(brakujace))
