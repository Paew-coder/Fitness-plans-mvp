"""Mobilność stawów — przypisanie ćwiczeń do kategorii (27.10.2026).

Trener: „dodaj nowe kategorie dla ćwiczeń mobility — każdy staw żeby miał swoją
kategorię i do niej przypasowane ćwiczenia: Spine, Shoulder, Elbow, Wrist, Hip,
Knee, Ankle mobility. Jeżeli ćwiczenie spełnia warunki dla obu kategorii, może
pokazywać się w obu — Front foot elevated split squat to Lower push i Ankle
mobility, Dumbbell flys — Upper push horizontal i Shoulder mobility”.

Dwa rodzaje przypisań, z regułami w `docs/dane/zasady-klasyfikacji.md`:

1. Ćwiczenia mobilizacyjne i rozciągające z bibliotek (rodzaj „mobilność”,
   „rozciąganie”, albo „mob/mobility/stretch/CARs” w nazwie) — staw z nazwy
   jest kategorią **główną** (dotąd stała tu kategoria umowna, „do
   weryfikacji”), kolejne stawy — dodatkowymi. Bez stawu w nazwie — z dawnej
   kategorii: Core → Spine, Lower → Hip, Upper i Tricep → Shoulder, Bicep → Wrist.
2. Ćwiczenia siłowe z dużym zakresem ruchu pod obciążeniem (rozpiętki,
   pullover, pompki z deficytu, FFE split squat, Cossack, ATG, sissy squat…) —
   kategoria główna zostaje, mobilność staje się **dodatkową**.
3. Plyometria (30.10.2026, trener: „kategoria Plyometria, gdzie będą wszystkie
   ćwiczenia plyometryczne typu np. skoki”) — zawsze **dodatkowa**: oznaczone
   w bibliotece jako plyometria, skoki i rzuty piłką z BAZY trenera, kompleksy
   ze skokiem. Kategoria główna zostaje (z niej arkusz i szkielet asystenta).

Wszystkie kategorie dodatkowe liczy ten jeden skrypt — każde uruchomienie
układa je od nowa, więc osobny skrypt dla jednej z nich kasowałby drugą.

Uruchom ponownie po zmianie reguł — wynik zależy tylko od nazw i rodzaju:

    python3 silnik/narzedzia/mobilnosc.py [lista.xlsx]
    python3 silnik/narzedzia/generuj-dane.py

Z argumentem zapisuje też listę do przejrzenia dla trenera (XLSX: ćwiczenie,
kategoria, także w, dawna kategoria, powód).
"""
import json, pathlib, re, sys

KORZEN = pathlib.Path(__file__).resolve().parents[2]
DANE = KORZEN / "docs" / "dane"

SILOWE = ["Lower push", "Lower pull", "Upper push horizontal", "Upper push vertical",
          "Upper pull horizontal", "Upper pull vertical", "Core", "Bicep", "Tricep"]
MOBILNOSC = ["Spine mobility", "Shoulder mobility", "Elbow mobility", "Wrist mobility",
             "Hip mobility", "Knee mobility", "Ankle mobility"]
PLYOMETRIA = "Plyometria"
KOLEJNOSC = {k: i for i, k in enumerate(SILOWE + [PLYOMETRIA] + MOBILNOSC)}

# ── 1. Staw z nazwy ćwiczenia mobilizacyjnego ───────────────────────────
#
# Wzorce dla nazw angielskich z bibliotek. Kolejność w nazwie decyduje
# o kategorii głównej, gdy staw jest nazwany wprost („Hip Flexor Stretch With
# Side Bend” → Hip, potem Spine).
STAWY = {
    "Spine mobility": r"t[- ]?spine|thoracic|spinal|\bspine\b|cat/cow|neck|chin tuck|cobra|child'?s pose|thread the needle"
                      r"|segmental|rolling|side bend|lateral flexion|lateral line|lateral opener|coil|open book|puppy"
                      r"|downward dog|\bj curl|jefferson|bridge pose|reach, roll|lateral cat|archer|twist|cross body reach",
    "Shoulder mobility": r"shoulder|\blat stretch|\blat\b|\bpec\b|pec stretch|wall slide|no-wall slide|overhead slides"
                         r"|overhead reach with dowel|dislocat|\bscap|crab stretch|triceps stretch|biceps stretch"
                         r"|single arm lift offs|overhead reach/pull|horizontal reach/pull|straight arm t-spine|overhead squat",
    "Elbow mobility": r"\belbow\b(?!s? (to|leading))|pronat|supinat",
    "Wrist mobility": r"wrist|forearm stretch",
    "Hip mobility": r"\bhip(?! flexed)|90/90|90:90|pigeon|frog|butterfly|adductor|hamstring|spiderman|straddle|figure 4|knee to chest"
                    r"|glute|forward fold|toe touch|squat pry|prying|deep squat|shin box|kickthrough|runner'?s lunge"
                    r"|inchworm|quad stretch|cossack|squat to stand|squat to hip|rock(ing)? to squat|lateral lunge"
                    r"|lateral squat|wide stance rocking|quadruped rocking|rockback|frogger|roll to straddle|rollback"
                    r"|overhead squat|split squat iso|rocking$|rocking:|leg up rocking|1-leg rocking|instep",
    "Knee mobility": r"knee lockout|knee extension|quad stretch|tibial rotation",
    "Ankle mobility": r"ankle|calf|big toe|toe yoga|toes? (up|tucked|untucked)|toe rock|dorsiflex|overhead squat",
}
STAWY_RE = {k: re.compile(v, re.I) for k, v in STAWY.items()}
SLOWO_STAWU = {  # staw nazwany wprost — wygrywa kategorię główną
    "Spine mobility": re.compile(r"t[- ]?spine|thoracic|spin(e|al)|neck", re.I),
    "Shoulder mobility": re.compile(r"shoulder|\blat\b|\bpec\b", re.I),
    "Elbow mobility": re.compile(r"\belbow\b", re.I),
    "Wrist mobility": re.compile(r"wrist|forearm", re.I),
    "Hip mobility": re.compile(r"\bhip(?! flexed)|adductor|hamstring|glute", re.I),
    "Knee mobility": re.compile(r"\bknee\b|\bquad\b", re.I),
    "Ankle mobility": re.compile(r"ankle|calf|\btoes?\b", re.I),
}
REGION = {"Core": "Spine mobility", "Lower push": "Hip mobility", "Lower pull": "Hip mobility",
          "Upper push horizontal": "Shoulder mobility", "Upper push vertical": "Shoulder mobility",
          "Upper pull horizontal": "Shoulder mobility", "Upper pull vertical": "Shoulder mobility",
          "Tricep": "Shoulder mobility", "Bicep": "Wrist mobility"}
# Ruch siłowy z „stretch” w nazwie — rozciągnięcie pod obciążeniem, nie mobilizacja.
SILOWE_ZE_STRETCH = re.compile(r"stretch (row|face pull)|stretch lateral raise|overhead stretch to row", re.I)
MOBILIZACJA_W_NAZWIE = re.compile(r"\bmob\b|mobili[sz]|mobility|stretch|\bCARs?\b", re.I)


# Rotacja tułowia — gdy w nazwie nie ma innego stawu („T-Spine Rotations”,
# „Spiderman Lunge with Rotation”), a nie rotacja w biodrze czy barku.
ROTACJA = re.compile(r"\brotations?\b", re.I)
INNY_STAW = re.compile(r"\bhip|shoulder|tibial|wrist|ankle|elbow|\bIR\b|\bER\b", re.I)


def stawy_z_nazwy(nazwa):
    stawy = [k for k in MOBILNOSC if STAWY_RE[k].search(nazwa)]
    if "Spine mobility" not in stawy and ROTACJA.search(nazwa) and not INNY_STAW.search(nazwa):
        stawy.insert(0, "Spine mobility")
    return stawy


def mobilizacyjne(c):
    if c.get("rodzaj") in ("mobilność", "rozciąganie"):
        return True
    return bool(MOBILIZACJA_W_NAZWIE.search(c["nazwa"])) and not SILOWE_ZE_STRETCH.search(c["nazwa"])


def dawna_kategoria(c):
    """Kategoria sprzed mobilności — przy ponownym uruchomieniu zapisana w polu."""
    return c.get("kategoria_umowna") or c["kategoria"]


def przypisz_mobilizacyjne(c):
    nazwa = c["nazwa"]
    dawna = dawna_kategoria(c)
    stawy = stawy_z_nazwy(nazwa)
    if not stawy:
        return REGION.get(dawna, "Spine mobility"), [], f"bez stawu w nazwie — z dawnej kategorii {dawna}"
    nazwane = sorted((m.start(), k) for k in stawy if (m := SLOWO_STAWU[k].search(nazwa)))
    if nazwane:
        glowna, powod = nazwane[0][1], "staw nazwany wprost"
    elif REGION.get(dawna) in stawy:
        glowna, powod = REGION[dawna], f"wzorzec ruchu w nazwie, staw zgodny z dawną kategorią {dawna}"
    else:
        glowna, powod = stawy[0], "wzorzec ruchu w nazwie"
    return glowna, [k for k in stawy if k != glowna], powod


# ── 2. Ćwiczenia siłowe z dużym zakresem ruchu ─────────────────────────
#
# Kategoria główna zostaje (ciężar, arkusz), mobilność dochodzi jako dodatkowa.
# Bez kompleksów, plyometrii, dwuboju i kondycji. RDL, good morning i wykroki
# boczne celowo poza listą — zalałyby Hip mobility; do decyzji trenera.
POMIN_RODZAJ = {"kompleks", "plyometria", "dwubój olimpijski", "kondycja", "oddech"}
DUZY_ZAKRES = [
    (r"\bfl(y|ye|yes|ies)\b", ["Shoulder mobility"], "rozpiętki — rozciągnięcie mięśnia piersiowego pod obciążeniem",
     r"reverse|\brev\b|rear delt|\by flye|rainbow|floor|partial|lateral raise|row to"),
    (r"pull[- ]?over", ["Shoulder mobility"], "pullover — zgięcie barku w pełnym zakresie", r"hollow|dead ?bug|deadbug"),
    (r"deficit.*push[- ]?up|push[- ]?up.*deficit", ["Shoulder mobility"], "pompki z deficytu — głębszy zakres w barku", None),
    (r"stretch (row|face pull)|stretch lateral raise|overhead stretch to row", ["Shoulder mobility"],
     "ruch z pozycji rozciągnięcia (stretch) w barku", None),
    (r"\b(active|dead|passive) hang\b", ["Shoulder mobility"], "zwis — zgięcie barku i odciążenie", None),
    (r"overhead squat", ["Shoulder mobility", "Ankle mobility"], "przysiad nad głową — bark i staw skokowy", r"snatch"),
    (r"front[- ]?foot[- ]?elevated|\bFFE\b", ["Ankle mobility"], "przednia stopa wyżej — zgięcie grzbietowe stopy", None),
    (r"knees? over toes", ["Ankle mobility"], "kolana za palce — zgięcie grzbietowe stopy", None),
    (r"\bATG\b", ["Knee mobility", "Ankle mobility"], "ATG — pełne zgięcie kolana i stawu skokowego", None),
    (r"sissy", ["Knee mobility"], "sissy squat — pełne zgięcie kolana", None),
    (r"reverse nordic", ["Knee mobility"], "reverse nordic — zgięcie kolana z rozciągnięciem czworogłowego", None),
    (r"cossack", ["Hip mobility", "Ankle mobility"], "cossack — przywodziciele i staw skokowy", r"heels? elevated|on toes"),
    (r"cossack.*(heels? elevated|on toes)|(heels? elevated|on toes).*cossack", ["Hip mobility"],
     "cossack z piętami wyżej — przywodziciele", None),
    (r"pistol", ["Ankle mobility"], "pistol — zgięcie grzbietowe stopy", r"heel elevated"),
    (r"deep squat", ["Hip mobility", "Ankle mobility"], "głęboki przysiad — biodro i staw skokowy", r"calf raise|jump"),
    (r"deep squat calf raise", ["Ankle mobility"], "wspięcia w głębokim przysiadzie — staw skokowy", None),
    (r"jefferson", ["Spine mobility"], "Jefferson curl — zgięcie kręgosłupa pod obciążeniem", None),
    (r"t[- ]?spine flexion", ["Spine mobility"], "zgięcie odcinka piersiowego", None),
    (r"hip airplane", ["Hip mobility"], "hip airplane — rotacja w biodrze", None),
    (r"90/90 band hip|90/90 band adduction", ["Hip mobility"], "pozycja 90/90 — rotacja w biodrze", None),
    (r"pronation|supination|wrist rotation", ["Elbow mobility", "Wrist mobility"], "pronacja i supinacja przedramienia",
     r"grip|curl|row|press|raise|pulldown|flye"),
    (r"wrist (radial|ulnar) deviation|wrist press ups", ["Wrist mobility"], "nadgarstek w pełnym zakresie", None),
    (r"deep elbow bend", ["Elbow mobility"], "pełne zgięcie łokcia pod obciążeniem", None),
]
DUZY_ZAKRES_RE = [(re.compile(w, re.I), k, p, re.compile(b, re.I) if b else None) for w, k, p, b in DUZY_ZAKRES]


def przypisz_silowe(c):
    if c.get("rodzaj") in POMIN_RODZAJ:
        return [], None
    kategorie, powody = [], []
    for wzor, kat, powod, bez in DUZY_ZAKRES_RE:
        if wzor.search(c["nazwa"]) and not (bez and bez.search(c["nazwa"])):
            for k in kat:
                if k not in kategorie:
                    kategorie.append(k)
            powody.append(powod)
    return kategorie, "; ".join(powody) or None


# ── 3. Plyometria ───────────────────────────────────────────────────────
#
# Biblioteki mają rodzaj „plyometria” (skoki, podskoki, pogo, rzuty piłką,
# pompki z klaśnięciem). BAZA trenera rodzaju nie ma — tam po nazwie: skok,
# podskok, plyo, rzut i slam piłką. Kompleks ze skokiem też (RDL to squat jump,
# forward hop to box jump). Kondycja (burpees, pajacyki, skipy, slamy liną)
# i dwubój („no jump”, jump to split) — nie: to nie trening plyometryczny.
SKOK = re.compile(r"jump|\bhops?\b|hopping|\bbounds?\b|bounding|pogo|plyo|depth drop|\bclap"
                  r"|(med(icine)? ?ball|\bMB\b).*\b(slam|throw|toss)", re.I)
BEZ_SKOKU = re.compile(r"no jump|jumping jack", re.I)
SKOK_W_RODZAJU = {None, "trening siłowy", "kompleks"}


def plyometryczne(c):
    """Powód przypisania do Plyometrii albo None."""
    if c.get("rodzaj") == "plyometria":
        return "w bibliotece oznaczone jako plyometria"
    if c.get("rodzaj") in SKOK_W_RODZAJU and SKOK.search(c["nazwa"]) and not BEZ_SKOKU.search(c["nazwa"]):
        return "kompleks ze skokiem" if c.get("rodzaj") == "kompleks" else "skok albo rzut w nazwie"
    return None


def ulozone(lista):
    return sorted(set(lista), key=KOLEJNOSC.__getitem__)


def z_kategoriami(c, kategoria, dodatkowe):
    """Ten sam słownik z kategorią i dodatkowymi tuż po niej (czytelny plik)."""
    wynik = {}
    for k, v in c.items():
        if k == "kategorie_dodatkowe":
            continue
        wynik[k] = kategoria if k == "kategoria" else v
        if k == "kategoria" and dodatkowe:
            wynik["kategorie_dodatkowe"] = dodatkowe
    return wynik


def przetworz(c, lista):
    if c.get("ukryte"):
        return c
    plyo = plyometryczne(c)
    if c.get("biblioteka") and mobilizacyjne(c):
        dawna = dawna_kategoria(c)
        glowna, dodatkowe, powod = przypisz_mobilizacyjne(c)
        dodatkowe = ulozone(dodatkowe + ([PLYOMETRIA] if plyo else []))
        nowe = z_kategoriami(c, glowna, dodatkowe)
        if dawna in SILOWE:
            nowe["kategoria_umowna"] = dawna
        lista.append((c, glowna, dodatkowe, dawna, f"mobilizacja — {powod}" + (f"; plyometria — {plyo}" if plyo else "")))
        return nowe
    dodatkowe, powod = przypisz_silowe(c)
    powody = ([f"duży zakres ruchu — {powod}"] if dodatkowe else []) + ([f"plyometria — {plyo}"] if plyo else [])
    dodatkowe = ulozone(dodatkowe + ([PLYOMETRIA] if plyo else []))
    if not dodatkowe:
        return z_kategoriami(c, c["kategoria"], [])
    lista.append((c, c["kategoria"], dodatkowe, c["kategoria"], "; ".join(powody)))
    return z_kategoriami(c, c["kategoria"], dodatkowe)


def baza_trenera(lista):
    """BAZA trenera (wcięcie 1): tylko dodatkowe — kategorie z arkusza 5.17 zostają."""
    plik = DANE / "baza-cwiczen.json"
    d = json.load(open(plik, encoding="utf-8"))
    d["cwiczenia"] = [przetworz(c, lista) for c in d["cwiczenia"]]
    plik.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def biblioteki(lista):
    """Biblioteki: ćwiczenie w linii — podmieniamy linie, reszta pliku bez zmian."""
    plik = DANE / "biblioteka-cwiczen.json"
    linie = plik.read_text(encoding="utf-8").split("\n")
    for i, linia in enumerate(linie):
        tresc = linia.strip()
        if not tresc.startswith('{"id": "EX-'):
            continue
        przecinek = tresc.endswith(",")
        c = json.loads(tresc.rstrip(","))
        assert json.dumps(c, ensure_ascii=False) == tresc.rstrip(","), c["id"]
        linie[i] = linia[: len(linia) - len(linia.lstrip())] + json.dumps(przetworz(c, lista), ensure_ascii=False) \
            + ("," if przecinek else "")
    plik.write_text("\n".join(linie), encoding="utf-8")


def zapisz_liste(lista, sciezka):
    from openpyxl import Workbook
    from openpyxl.styles import Font
    wb = Workbook()
    ws = wb.active
    ws.title = "Kategorie dodatkowe"
    ws.append(["ID", "Ćwiczenie", "Źródło", "Kategoria", "Także w", "Dawna kategoria", "Dlaczego", "Uwagi"])
    for komorka in ws[1]:
        komorka.font = Font(bold=True)
    zrodla = {"tom": "Theory of Motion", "catalyst": "Catalyst Athletics", None: "Twoja baza (arkusz)"}
    for c, glowna, dodatkowe, dawna, powod in sorted(lista, key=lambda x: (KOLEJNOSC[x[1]], x[0]["nazwa"].lower())):
        ws.append([c["id"], c["nazwa"], zrodla[c.get("biblioteka")], glowna, ", ".join(dodatkowe),
                   dawna if dawna != glowna else "", powod, c.get("uwagi") or ""])
    for kolumna, szer in zip("ABCDEFGH", (9, 52, 20, 20, 30, 20, 60, 60)):
        ws.column_dimensions[kolumna].width = szer
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    wb.save(sciezka)


if __name__ == "__main__":
    lista = []
    baza_trenera(lista)
    biblioteki(lista)
    for k in MOBILNOSC + [PLYOMETRIA]:
        glowne = sum(1 for x in lista if x[1] == k)
        takze = sum(1 for x in lista if k in x[2])
        print(f"{k:18} główna: {glowne:4}   także: {takze:4}")
    if len(sys.argv) > 1:
        zapisz_liste(lista, sys.argv[1])
        print("lista:", sys.argv[1])
