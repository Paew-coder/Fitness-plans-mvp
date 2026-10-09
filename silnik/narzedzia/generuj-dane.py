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
       ]
# Biblioteki filmow (09.10.2026): cwiczenia z Theory of Motion i Catalyst
# Athletics, z wlasna klasyfikacja i jednostronnoscia w pliku. Za BAZA trenera.
plik_bib = dane / "biblioteka-cwiczen.json"
bib = json.load(open(plik_bib, encoding="utf-8")) if plik_bib.exists() else {"cwiczenia": []}
lin[1] = "// Zrodlo: docs/dane/baza-cwiczen.json (MasterTemplate 5.17, zakladka BAZA) + docs/dane/biblioteka-cwiczen.json"
lin += [f"/** {b['liczba']} cwiczen z BAZY 5.17 i {len(bib['cwiczenia'])} z bibliotek filmow. */",
        "export const BAZA_CWICZEN: readonly Cwiczenie[] = ["]
for e in b["cwiczenia"] + bib["cwiczenia"]:
    p = [f'id: {json.dumps(e["id"], ensure_ascii=False)}',
         f'nazwa: {json.dumps(e["nazwa"], ensure_ascii=False)}',
         f'kategoria: {json.dumps(e["kategoria"], ensure_ascii=False)}',
         f'part: {json.dumps(e["part"], ensure_ascii=False)}',
         f'coeff: {e["coeff"]}',
         f'skokKg: {e["skok_kg"]}',
         f'progresja: {json.dumps(e["progresja"], ensure_ascii=False)}']
    # Opis ćwiczenia (09.10.2026, test biblioteki OPEX) — pola opcjonalne,
    # na razie tylko przy EX-0011. Film do odtwarzania w aplikacji jest
    # osobno, w filmy-cwiczen.json; `film` to dotychczasowy link z arkusza.
    for klucz, pole in (("nazwa_en", "nazwaEn"), ("nazwa_pl", "nazwaPl"), ("rodzaj", "rodzaj"),
                        ("miesnie_glowne", "miesnieGlowne"), ("miesnie_pomocnicze", "miesniePomocnicze"),
                        ("sprzet", "sprzet")):
        if e.get(klucz): p.append(f'{pole}: {json.dumps(e[klucz], ensure_ascii=False)}')
    if e.get("film"):       p.append(f'film: {json.dumps(e["film"], ensure_ascii=False)}')
    if e.get("uwagi"):      p.append(f'uwagi: {json.dumps(e["uwagi"], ensure_ascii=False)}')
    if e.get("scalone_id"): p.append(f'scaloneId: {json.dumps(e["scalone_id"], ensure_ascii=False)}')
    if e.get("biblioteka"):  p.append(f'biblioteka: {json.dumps(e["biblioteka"])}')
    if e.get("ukryte"):      p.append("ukryte: true")
    if e["id"] in POTWIERDZONE or e.get("jednostronne") == "tak": p.append("jednostronne: true")
    elif e["id"] in KANDYDACI or e.get("jednostronne") == "?":   p.append("jednostronneDoPotwierdzenia: true")
    lin.append("  { " + ", ".join(p) + " },")
lin += ["];", ""]
(out / "cwiczenia.ts").write_text("\n".join(lin), encoding="utf-8")
print("tabele.ts + cwiczenia.ts wygenerowane;", b["liczba"], "cwiczen z BAZY +", len(bib["cwiczenia"]), "z bibliotek")

# ── FILMY CWICZEN ─────────────────────────────────────────────────────
#
# Osobno od BAZY (09.10.2026): cwiczenie wskazuje film po swoim id, a BAZA
# nie wie, skad film jest. Zamiana YouTube na wlasny MP4 = zmiana wpisu tutaj.
f = json.load(open(dane / "filmy-cwiczen.json", encoding="utf-8"))
def ts_obiekt(d, klucze):
    return "{ " + ", ".join(f'{pole}: {json.dumps(d[klucz], ensure_ascii=False)}'
                            for klucz, pole in klucze if d.get(klucz) is not None) + " }"
lin = ["// PLIK GENEROWANY — nie edytuj recznie.",
       "// Zrodlo: docs/dane/filmy-cwiczen.json",
       "// Regeneracja: python3 silnik/narzedzia/generuj-dane.py",
       "",
       'import type { WpisWideo, ZrodloWideo } from "../wideo.ts";',
       "",
       "/** Skad pochodza filmy (kanal, platforma) — wspolne dla wielu wpisow. */",
       "export const ZRODLA_WIDEO: readonly ZrodloWideo[] = ["]
for z in f["zrodla"]:
    lin.append("  " + ts_obiekt(z, (("id", "id"), ("nazwa", "nazwa"), ("platforma", "platforma"),
                                   ("kanal", "kanal"), ("kanal_id", "kanalId"), ("url", "url"))) + ",")
lin += ["];", "", f"/** {len(f['filmy'])} film(y) przypisane do cwiczen. */",
        "export const FILMY_CWICZEN: readonly WpisWideo[] = ["]
for w in f["filmy"]:
    lin.append("  " + ts_obiekt(w, (("id", "id"), ("cwiczenie_id", "cwiczenieId"), ("typ", "typ"),
                                   ("rola", "rola"), ("youtube_id", "youtubeId"), ("plik", "plik"), ("zrodlo", "zrodlo"),
                                   ("tytul", "tytul"), ("url", "url"), ("czas_s", "czasSekund"))) + ",")
lin += ["];", ""]
(out / "filmy.ts").write_text("\n".join(lin), encoding="utf-8")
print("filmy.ts wygenerowane;", len(f["filmy"]), "film(y)")

# ── ODDECH ────────────────────────────────────────────────────────────
o = json.load(open(dane / "oddech-progi.json", encoding="utf-8"))
lin = ["// PLIK GENEROWANY — nie edytuj recznie.",
       "// Zrodlo: docs/dane/oddech-progi.json (MasterTemplate 5.17, TABELE!A66:I70)",
       "// Regeneracja: python3 silnik/narzedzia/generuj-dane.py",
       "",
       'import type { ObjasnieniaOddechu, ProgTWOT } from "../oddech.ts";',
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
# Instrukcje trenera z zakladki ODDECH (A17:A44) — technika blokow, pomiar TWOT,
# retest, kiedy przerwac. Klient widzi je przy dawce (27.09.2026).
ins = o["instrukcje"]
lin += ["/** Instrukcje z zakladki ODDECH (A2, A17:A44) — dla klienta, przy dawce. */",
        "export const OBJASNIENIA_ODDECHU: ObjasnieniaOddechu = " + json.dumps({
            "wstep": ins["wstep"], "technika": ins["technika"], "pomiar": ins["pomiar"],
            "coMowi": ins["co_mowi"], "retest": ins["retest"], "przerwij": ins["przerwij"],
        }, ensure_ascii=False, indent=2) + ";", ""]
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
        "/** Piec typow jednostek — staly zestaw trenera (27.09.2026); wzory minut z BIEG!B32:O61. */",
        "export const WZORY_JEDNOSTEK: readonly WzorJednostki[] = ["]
for j in g["jednostki"]:
    extra = "".join(f', {k}: {j[k]}' for k in ("odcinekMin", "przerwaMin", "przebiezki") if k in j)
    lin.append(f'  {{ nr: {j["nr"]}, klucz: {json.dumps(j["klucz"])}, typ: {json.dumps(j["typ"], ensure_ascii=False)}, '
               f'bazaMin: {j["bazaMin"]}, tempo: {json.dumps(j["tempo"], ensure_ascii=False)}, '
               f'strefa: {j["strefa"]}, etykieta: {json.dumps(j["etykieta"], ensure_ascii=False)}, '
               f'dodatkoweMin: {j["dodatkoweMin"]}{extra} }},')
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
# Uklad dni, kategorie i TOP SET z 14 szablonow aplikacji trenera w Base44 —
# pod nazwami, ktore trener widzi tam na ekranie („Klasyczny – 3 dni"),
# pogrupowane w rodziny. Bez cwiczen: do 26.09.2026 cztery szablony niosly
# dobor z zapisanych planow w Base44, ktorego trener nie rozpoznal („nie wiem,
# skad akurat takie cwiczenia"). Cwiczenia wybiera trener.
sz = json.load(open(dane / "szablony-base44.json", encoding="utf-8"))
rz = json.load(open(dane / "rodziny-szablonow-base44.json", encoding="utf-8"))
po_id = {s["id"]: s for s in sz["szablony"]}
KATEGORIE = {k.lower(): k for k in (
    "Lower push", "Lower pull", "Upper push horizontal", "Upper push vertical",
    "Upper pull horizontal", "Upper pull vertical", "Core", "Bicep", "Tricep")}

def czesc_szablonu(tid):
    return "hipertrofia" if tid.startswith("hyper") else "objętość"

lin = ["// PLIK GENEROWANY — nie edytuj recznie.",
       "// Zrodlo: docs/dane/szablony-base44.json + rodziny-szablonow-base44.json (Base44)",
       "// Regeneracja: python3 silnik/narzedzia/generuj-dane.py",
       "",
       'import type { SzablonPlanu } from "../szablony-planow.ts";',
       "",
       f"/** {len(sz['szablony'])} szablonow z aplikacji trenera w Base44, w kolejnosci z jej ekranu. */",
       "export const SZABLONY_BASE44: readonly SzablonPlanu[] = ["]
wypisane = []
# Kontynuacji „(cz. 2)" na liscie nie ma (trener, 27.09.2026): to ten sam
# uklad co czesc 1, a druga czesc ustawia przelacznik „Czesc planu".
for r in rz["rodziny"]:
    if r["klucz"].endswith("_v2"): continue
    rodzina = r["nazwa"]
    for w in r["warianty"]:
        tid = w["id"]
        s = po_id.get(tid)
        if not s: continue
        dni = []
        for d in s["dni"]:
            sloty = []
            for x in d["sloty"]:
                kat = KATEGORIE[x["kategoria"].lower()]
                prog = s["progresja"].get(f'{d["id"]}_{x["lp"]}', [])
                p = [f'lp: "{x["lp"]}."', f'kategoria: {json.dumps(kat, ensure_ascii=False)}']
                if any(len(t) > 1 for t in prog): p.append("topSet: true")
                sloty.append("{ " + ", ".join(p) + " }")
            dni.append("[\n      " + ",\n      ".join(sloty) + ",\n    ]")
        lin.append("  {")
        lin.append(f'    id: {json.dumps(tid)}, nazwa: {json.dumps(rz["nazwy"][tid], ensure_ascii=False)},')
        lin.append(f'    rodzina: {json.dumps(rodzina, ensure_ascii=False)},')
        lin.append(f'    opis: {json.dumps(r["opis"] + " " + s["opis"], ensure_ascii=False)},')
        lin.append(f'    czesc: {json.dumps(czesc_szablonu(tid), ensure_ascii=False)},')
        lin.append("    dni: [\n    " + ",\n    ".join(dni) + ",\n    ],")
        lin.append("  },")
        wypisane.append(tid)
assert sorted(wypisane) == sorted(t for t in po_id if not t.endswith("_v2")), "szablon bez nazwy z Base44"
lin += ["];", ""]
(out / "szablony.ts").write_text("\n".join(lin), encoding="utf-8")
print("szablony.ts wygenerowane;", len(wypisane), "szablonow")
