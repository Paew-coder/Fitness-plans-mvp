"""Weryfikacja ćwiczeń z bibliotek filmów (Theory of Motion, Catalyst Athletics).

Dwa kroki:

  python3 silnik/narzedzia/weryfikacja-bibliotek.py arkusz [plik.xlsx]
      Arkusz dla trenera: pozycje „DO WERYFIKACJI” pogrupowane po powodzie,
      pozostałe (pewne) do wglądu, poradniki bez ćwiczenia, pominięte filmy
      i filmy z bibliotek przypięte do ćwiczeń BAZY. Każda pozycja ma link do
      filmu i kolumny decyzji (listy rozwijane).

  python3 silnik/narzedzia/weryfikacja-bibliotek.py zastosuj plik.xlsx [--na-sucho]
      Wpisuje decyzje z wypełnionego arkusza do docs/dane/biblioteka-cwiczen.json
      i docs/dane/filmy-cwiczen.json. Potem: python3 silnik/narzedzia/generuj-dane.py.

  python3 silnik/narzedzia/weryfikacja-bibliotek.py test
      Próba całej pętli na kopiach danych w katalogu tymczasowym (repo bez zmian).

Decyzje (arkusze „Do weryfikacji” i „Pewne”):
  OK    — zatwierdź (z poprawkami, jeśli wpisane w kolumnach „nowa/nowy…”);
  USUŃ  — ukryj w wyborze ćwiczeń (ćwiczenie zostaje w danych, bo mogło już
          trafić do planu — plan dalej się otworzy i wyeksportuje);
  puste — bez zmian; same poprawki bez decyzji też zatwierdzają.
Arkusz „Grupy”: OK przy kodzie powodu zatwierdza wszystkie pozycje, których
WSZYSTKIE kody są tak zatwierdzone, a wiersz nie ma własnej decyzji.
Arkusz „Poradniki bez ćwiczenia”: id ćwiczeń (po przecinku) → film przypięty jako poradnik.
Arkusz „Filmy przy BAZIE”: ODEPNIJ → film zdjęty z ćwiczenia (i nie wraca przy imporcie).
"""
import datetime, json, pathlib, shutil, sys, tempfile

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

DANE = pathlib.Path(__file__).resolve().parents[2] / "docs" / "dane"
PLIK_BIB = DANE / "biblioteka-cwiczen.json"
PLIK_FILMOW = DANE / "filmy-cwiczen.json"
PLIK_BAZY = DANE / "baza-cwiczen.json"

PART = {"Lower push": "s", "Lower pull": "d", "Upper push horizontal": "b", "Upper push vertical": "b",
        "Tricep": "b", "Upper pull horizontal": "r", "Upper pull vertical": "r", "Bicep": "r", "Core": "c"}
COEFF = [1, 0.75, 0.5, 0.25]
PROGRESJE = ["kg", "masa ciała", "czas", "dystans", "dodatkowy ciężar", "asysta", "ręczne ustawienie"]
SKOKI = [0, 1, 2.5, 4, 5]
ZRODLA = {"tom": "Theory of Motion", "catalyst": "Catalyst Athletics"}
KODY = {
    "KOMPLEKS": "kilka ćwiczeń w jednym filmie (kompleks, seria, finisher) — kategoria wg ćwiczenia dominującego",
    "MOBILNOSC": "mobilność, rozciąganie, oddech, rozgrzewka — kategoria wg okolicy ciała, coeff 0,25, ręczne ustawienie",
    "KONDYCJA": "kondycja i koordynacja (agility, sprint, burpee, czołganie) — kategoria umowna",
    "KATEGORIA": "kategoria na granicy (thruster, szrugsy, przedramiona, rzuty piłką…)",
    "COEFF": "coeff niepewny",
    "JEDNOSTRONNE": "nie wiadomo, czy serie liczyć na stronę",
    "PROGRESJA": "nie wiadomo, czym się obciąża",
    "NAZWA": "z nazwy nie wynika, co to za ćwiczenie",
}
KOLUMNY = [  # (nagłówek, szerokość)
    ("ID", 9), ("Nazwa", 34), ("Kody", 14), ("Dlaczego do sprawdzenia / opis", 60), ("Film", 8),
    ("Poradnik", 9), ("Źródło", 15), ("Kategoria", 20), ("part", 5), ("coeff", 6), ("Progresja", 14),
    ("Skok kg", 7), ("Jednostronne", 11), ("Rodzaj", 14), ("Sprzęt", 16),
    ("DECYZJA", 10), ("Nowa kategoria", 20), ("Nowy coeff", 9), ("Nowa progresja", 14), ("Nowy skok", 8),
    ("Jednostronne (nowe)", 11), ("Nowa nazwa", 24), ("Uwaga trenera", 30),
]
PIERWSZA_DECYZJI = 16  # kolumna P
ZOLTY = PatternFill("solid", fgColor="FFF4C2")
SZARY = PatternFill("solid", fgColor="E8E8E8")


def wczytaj():
    bib = json.loads(PLIK_BIB.read_text(encoding="utf-8"))
    filmy = json.loads(PLIK_FILMOW.read_text(encoding="utf-8"))
    baza = json.loads(PLIK_BAZY.read_text(encoding="utf-8"))
    return bib, filmy, baza


def zapisz(sciezka: pathlib.Path, dane: dict, klucz: str):
    """Ten sam układ co import (jeden wpis na linię), żeby różnice w git były czytelne."""
    with open(sciezka, "w", encoding="utf-8") as f:
        f.write("{\n")
        for k, v in dane.items():
            if k == klucz:
                continue
            if isinstance(v, list) and v:
                v = "[\n" + ",\n".join("  " + json.dumps(w, ensure_ascii=False) for w in v) + "\n ]"
            else:
                v = json.dumps(v, ensure_ascii=False)
            f.write(f" {json.dumps(k, ensure_ascii=False)}: {v},\n")
        f.write(f" {json.dumps(klucz)}: [\n")
        f.write(",\n".join("  " + json.dumps(w, ensure_ascii=False) for w in dane[klucz]))
        f.write("\n ]\n}\n")
    json.loads(sciezka.read_text(encoding="utf-8"))


def link(kom, url, tekst="▶ film"):
    kom.value = tekst
    kom.hyperlink = url
    kom.font = Font(color="1155CC", underline="single")


def naglowek(ws, kolumny, od_decyzji=None):
    for i, (n, sz) in enumerate(kolumny, 1):
        k = ws.cell(row=1, column=i, value=n)
        k.font = Font(bold=True)
        k.fill = ZOLTY if od_decyzji and i >= od_decyzji else SZARY
        k.alignment = Alignment(wrap_text=True, vertical="top")
        ws.column_dimensions[get_column_letter(i)].width = sz
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(kolumny))}1"


def listy(wb):
    ws = wb.create_sheet("Listy")
    for kol, wartosci in enumerate((list(PART), COEFF, PROGRESJE, SKOKI, ["tak", "nie"], ["OK", "USUŃ"],
                                    ["OK"], ["ODEPNIJ"]), 1):
        for w, v in enumerate(wartosci, 1):
            ws.cell(row=w, column=kol, value=v)
    ws.sheet_state = "hidden"
    zakres = lambda kol, n: f"Listy!${get_column_letter(kol)}$1:${get_column_letter(kol)}${n}"
    return {"kategoria": zakres(1, len(PART)), "coeff": zakres(2, len(COEFF)), "progresja": zakres(3, len(PROGRESJE)),
            "skok": zakres(4, len(SKOKI)), "taknie": zakres(5, 2), "decyzja": zakres(6, 2), "ok": zakres(7, 1),
            "odepnij": zakres(8, 1)}


def walidacja(ws, formula, kolumna, do_wiersza):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True, showErrorMessage=False)
    ws.add_data_validation(dv)
    dv.add(f"{kolumna}2:{kolumna}{max(do_wiersza, 2)}")


def arkusz_cwiczen(wb, nazwa, cwiczenia, poradnik, L):
    ws = wb.create_sheet(nazwa)
    naglowek(ws, KOLUMNY, PIERWSZA_DECYZJI)
    for w, c in enumerate(cwiczenia, 2):
        opis = (c.get("uwagi") or "").removeprefix("DO WERYFIKACJI – ")
        if c.get("inne_tytuly"):
            opis = (opis + " · " if opis else "") + "inne tytuły: " + "; ".join(c["inne_tytuly"])
        wartosci = [c["id"], c["nazwa"], " ".join(c.get("weryfikacja") or []), opis, None, None,
                    ZRODLA.get(c.get("biblioteka"), ""), c["kategoria"], c["part"], c["coeff"], c["progresja"],
                    c["skok_kg"], c.get("jednostronne"), c.get("rodzaj"), ", ".join(c.get("sprzet") or [])]
        for k, v in enumerate(wartosci, 1):
            ws.cell(row=w, column=k, value=v)
        link(ws.cell(row=w, column=5), c["film"])
        if c["id"] in poradnik:
            link(ws.cell(row=w, column=6), poradnik[c["id"]], "▶ poradnik")
        for k in range(PIERWSZA_DECYZJI, len(KOLUMNY) + 1):
            ws.cell(row=w, column=k).fill = ZOLTY
        ws.cell(row=w, column=4).alignment = Alignment(wrap_text=True, vertical="top")
    n = len(cwiczenia) + 1
    for kol, f in (("P", "decyzja"), ("Q", "kategoria"), ("R", "coeff"), ("S", "progresja"), ("T", "skok"),
                   ("U", "taknie")):
        walidacja(ws, L[f], kol, n)
    return ws


def arkusz(wyjscie: pathlib.Path):
    bib, filmy, baza = wczytaj()
    cw = bib["cwiczenia"]
    poradnik = {}
    for f in filmy["filmy"]:
        if f.get("rola") == "poradnik" and f.get("youtube_id"):
            poradnik.setdefault(f["cwiczenie_id"], f"https://youtu.be/{f['youtube_id']}")
    widoczne = [c for c in cw if not c.get("ukryte")]
    do_wer = [c for c in widoczne if (c.get("uwagi") or "").startswith("DO WERYFIKACJI")]
    pewne = [c for c in widoczne if c not in do_wer]
    kolejnosc = list(KODY)
    do_wer.sort(key=lambda c: (min((kolejnosc.index(k) for k in c["weryfikacja"] if k in KODY), default=99),
                               c["nazwa"].lower()))
    pewne.sort(key=lambda c: (list(PART).index(c["kategoria"]), c["nazwa"].lower()))

    wb = Workbook()
    ws = wb.active
    ws.title = "Jak sprawdzać"
    ws.column_dimensions["A"].width = 120
    dzis = datetime.date.today().isoformat()
    teksty = [
        ("Weryfikacja ćwiczeń z bibliotek filmów — CraftMyPlan", True),
        (f"Stan na {dzis}: {len(cw)} ćwiczeń z bibliotek, w tym {len(do_wer)} do weryfikacji i {len(pewne)} pewnych"
         f"{f', {len(cw) - len(widoczne)} ukrytych' if len(cw) > len(widoczne) else ''}.", False),
        ("", False),
        ("1. „Grupy” — jeśli cała grupa się zgadza (np. wszystkie MOBILNOSC), wpisz OK przy grupie. Zatwierdza to "
         "pozycje, których wszystkie kody są zatwierdzone, a które nie mają własnej decyzji.", False),
        ("2. „Do weryfikacji” — filtruj po kolumnie Kody. Kliknij ▶ film. Żółte kolumny są Twoje:", False),
        ("     DECYZJA: OK = zatwierdź (z poprawkami z kolumn obok, jeśli coś wpisałeś); USUŃ = schowaj z wyboru "
         "ćwiczeń (zostaje w danych, bo mogło już trafić do planu); puste = bez zmian.", False),
        ("     Nowa kategoria / Nowy coeff / Nowa progresja / Nowy skok / Jednostronne (nowe) — tylko gdy zmieniasz; "
         "part liczy się sam z kategorii. Wpisana poprawka też zatwierdza pozycję.", False),
        ("3. „Pewne” — do wglądu; poprawki i USUŃ działają tak samo.", False),
        ("4. „Poradniki bez ćwiczenia” — ogólne poradniki Theory of Motion. Wpisz id ćwiczeń (np. EX-0001, EX-0002), "
         "a film dojdzie do nich jako „Poradnik”.", False),
        ("5. „Filmy przy BAZIE” — filmy z bibliotek przypięte do Twoich ćwiczeń z MasterTemplate. Jeśli film nie "
         "pasuje, wpisz ODEPNIJ.", False),
        ("6. „Pominięte” — filmy kanałów, które nie są ćwiczeniem (nagrania osób, vlogi). Tylko do wglądu.", False),
        ("", False),
        ("Wypełniony plik odeślij — decyzje wpisze skrypt (zastosuj), a potem aplikacja dostaje nową bazę.", False),
        ("Zasady klasyfikacji: docs/dane/zasady-klasyfikacji.md. Kategoria → part: Lower push s, Lower pull d, "
         "Upper push horizontal/vertical i Tricep b, Upper pull horizontal/vertical i Bicep r, Core c.", False),
        ("Jednostronne „tak” = serie liczone na stronę; „?” = do potwierdzenia.", False),
    ]
    for w, (t, b) in enumerate(teksty, 1):
        k = ws.cell(row=w, column=1, value=t)
        k.alignment = Alignment(wrap_text=True)
        if b:
            k.font = Font(bold=True, size=14)

    L = listy(wb)
    wg = wb.create_sheet("Grupy")
    naglowek(wg, [("Kod", 14), ("Co znaczy", 90), ("Pozycji", 9), ("Przykłady", 70), ("DECYZJA dla grupy", 12)], 5)
    for w, (kod, opis) in enumerate(KODY.items(), 2):
        z_kodem = [c for c in do_wer if kod in c["weryfikacja"]]
        for k, v in enumerate([kod, opis, len(z_kodem), "; ".join(c["nazwa"] for c in z_kodem[:4])], 1):
            wg.cell(row=w, column=k, value=v)
        wg.cell(row=w, column=5).fill = ZOLTY
    walidacja(wg, L["ok"], "E", len(KODY) + 1)

    arkusz_cwiczen(wb, "Do weryfikacji", do_wer, poradnik, L)
    arkusz_cwiczen(wb, "Pewne", pewne, poradnik, L)

    wp = wb.create_sheet("Poradniki bez ćwiczenia")
    naglowek(wp, [("Film", 10), ("Tytuł", 70), ("Długość", 9), ("Przypnij do (id ćwiczeń po przecinku)", 40)], 4)
    for w, p in enumerate(bib.get("poradniki_bez_cwiczenia", []), 2):
        link(wp.cell(row=w, column=1), f"https://youtu.be/{p['yt']}", p["yt"])
        wp.cell(row=w, column=2, value=p["tytul"])
        wp.cell(row=w, column=3, value=f"{p['czas_s'] // 60}:{p['czas_s'] % 60:02d}" if p.get("czas_s") else "")
        wp.cell(row=w, column=4).fill = ZOLTY

    wf = wb.create_sheet("Filmy przy BAZIE")
    naglowek(wf, [("ID filmu", 10), ("ID ćwiczenia", 11), ("Ćwiczenie w BAZIE", 34), ("Rola", 12),
                  ("Tytuł filmu", 50), ("Źródło", 18), ("Film", 8), ("DECYZJA", 11)], 8)
    nazwy_bazy = {c["id"]: c["nazwa"] for c in baza["cwiczenia"]}
    przy_bazie = [f for f in filmy["filmy"] if f["cwiczenie_id"] in nazwy_bazy and f.get("youtube_id")
                  and f["zrodlo"] in ("tom-youtube", "catalyst-youtube")]
    for w, f in enumerate(przy_bazie, 2):
        for k, v in enumerate([f["id"], f["cwiczenie_id"], nazwy_bazy[f["cwiczenie_id"]], f.get("rola", "demonstracja"),
                               f.get("tytul"), {"tom-youtube": "Theory of Motion", "catalyst-youtube": "Catalyst"}[f["zrodlo"]]], 1):
            wf.cell(row=w, column=k, value=v)
        link(wf.cell(row=w, column=7), f"https://youtu.be/{f['youtube_id']}")
        wf.cell(row=w, column=8).fill = ZOLTY
    walidacja(wf, L["odepnij"], "H", len(przy_bazie) + 1)

    wm = wb.create_sheet("Pominięte")
    naglowek(wm, [("Nazwa", 40), ("Źródło", 16), ("Dlaczego pominięte", 80), ("Film", 10)])
    for w, p in enumerate(bib.get("pominiete", []), 2):
        for k, v in enumerate([p["nazwa"], ZRODLA.get(p["zrodlo"], p["zrodlo"]), p["powod"]], 1):
            wm.cell(row=w, column=k, value=v)
        if p.get("filmy"):
            link(wm.cell(row=w, column=4), f"https://youtu.be/{p['filmy'][0]}")

    wb.move_sheet("Listy", offset=len(wb.sheetnames))
    wb.save(wyjscie)
    print(f"{wyjscie}: do weryfikacji {len(do_wer)}, pewne {len(pewne)}, "
          f"poradniki bez ćwiczenia {len(bib.get('poradniki_bez_cwiczenia', []))}, filmy przy BAZIE {len(przy_bazie)}, "
          f"pominięte {len(bib.get('pominiete', []))}")


# ── zastosuj ────────────────────────────────────────────────────────
def liczba(v):
    if v is None or str(v).strip() == "":
        return None
    return float(str(v).replace(",", ".").strip())


def tekst(v):
    return None if v is None or str(v).strip() == "" else str(v).strip()


def zastosuj(plik: pathlib.Path, na_sucho: bool):
    bib, filmy, baza = wczytaj()
    wb = load_workbook(plik)
    po_id = {c["id"]: c for c in bib["cwiczenia"]}
    nazwy = {c["nazwa"].lower(): c["id"] for c in baza["cwiczenia"] + bib["cwiczenia"]}
    wszystkie_id = set(po_id) | {c["id"] for c in baza["cwiczenia"]}
    dzis = datetime.date.today().isoformat()
    bledy, licz = [], {"zatwierdzone": 0, "poprawione": 0, "ukryte": 0, "przypiete": 0, "odpiete": 0}

    grupy = set()
    if "Grupy" in wb.sheetnames:
        for r in wb["Grupy"].iter_rows(min_row=2, values_only=True):
            if r[0] and tekst(r[4]) and tekst(r[4]).upper() == "OK":
                grupy.add(r[0])


    for nazwa_ark in ("Do weryfikacji", "Pewne"):
        if nazwa_ark not in wb.sheetnames:
            continue
        for nr, r in enumerate(wb[nazwa_ark].iter_rows(min_row=2, values_only=True), 2):
            if not r or not r[0]:
                continue
            c = po_id.get(str(r[0]).strip())
            if not c:
                bledy.append(f"{nazwa_ark} w. {nr}: nieznane id {r[0]}")
                continue
            d = (tekst(r[15]) or "").upper().replace("USUN", "USUŃ")
            kat, coeff, prog, skok = tekst(r[16]), liczba(r[17]), tekst(r[18]), liczba(r[19])
            jedn, nowa_nazwa, uwaga = tekst(r[20]), tekst(r[21]), tekst(r[22])
            zmiany = {}
            if kat:
                if kat not in PART: bledy.append(f"{c['id']}: kategoria „{kat}” spoza listy"); continue
                zmiany["kategoria"], zmiany["part"] = kat, PART[kat]
            if coeff is not None:
                if coeff not in COEFF: bledy.append(f"{c['id']}: coeff {coeff} spoza 1/0,75/0,5/0,25"); continue
                zmiany["coeff"] = int(coeff) if coeff == 1 else coeff
            if prog:
                if prog not in PROGRESJE: bledy.append(f"{c['id']}: progresja „{prog}” spoza listy"); continue
                zmiany["progresja"] = prog
            if skok is not None:
                if skok not in SKOKI: bledy.append(f"{c['id']}: skok {skok} spoza 0/1/2,5/4/5"); continue
                zmiany["skok_kg"] = int(skok) if skok == int(skok) else skok
            if jedn:
                if jedn.lower() not in ("tak", "nie"): bledy.append(f"{c['id']}: jednostronne „{jedn}” — tak/nie"); continue
                zmiany["jednostronne"] = jedn.lower()
            if nowa_nazwa and nowa_nazwa != c["nazwa"]:
                inny = nazwy.get(nowa_nazwa.lower())
                if inny and inny != c["id"]: bledy.append(f"{c['id']}: nazwa „{nowa_nazwa}” już jest ({inny})"); continue
                zmiany["nazwa"] = nowa_nazwa
            if d == "USUŃ":
                c["ukryte"] = True
                c["zatwierdzone"] = dzis
                if uwaga: c["uwagi"] = uwaga
                licz["ukryte"] += 1
                continue
            grupowo = not d and not zmiany and c.get("weryfikacja") and set(c["weryfikacja"]) <= grupy
            if d == "OK" or zmiany or grupowo:
                if zmiany.get("jednostronne", c.get("jednostronne")) == "?":
                    bledy.append(f"{c['id']} {c['nazwa']}: jednostronne „?” — wpisz tak/nie w „Jednostronne (nowe)”")
                    continue
                if "nazwa" in zmiany:
                    nazwy.pop(c["nazwa"].lower(), None)
                    nazwy[zmiany["nazwa"].lower()] = c["id"]
                c.update(zmiany)
                c.update({"uwagi": uwaga, "weryfikacja": [], "zatwierdzone": dzis})
                licz["poprawione" if zmiany else "zatwierdzone"] += 1
            elif d:
                bledy.append(f"{c['id']}: decyzja „{d}” — OK albo USUŃ")

    # poradniki ogólne → przypięte do ćwiczeń
    nr_filmu = max(int(f["id"][4:]) for f in filmy["filmy"]) + 1
    if "Poradniki bez ćwiczenia" in wb.sheetnames:
        poradniki = {p["yt"]: p for p in bib.get("poradniki_bez_cwiczenia", [])}
        for r in wb["Poradniki bez ćwiczenia"].iter_rows(min_row=2):
            yt, cel = r[0].value, tekst(r[3].value)
            if not yt or not cel:
                continue
            p = poradniki.get(str(yt))
            if not p:
                continue
            for cid in [x.strip().upper() for x in cel.replace(";", ",").split(",") if x.strip()]:
                if cid not in wszystkie_id:
                    bledy.append(f"poradnik {yt}: nieznane ćwiczenie {cid}"); continue
                if any(f["cwiczenie_id"] == cid and f.get("youtube_id") == yt for f in filmy["filmy"]):
                    continue
                w = {"id": f"WID-{nr_filmu:04d}", "cwiczenie_id": cid, "typ": "youtube", "rola": "poradnik",
                     "youtube_id": yt, "zrodlo": "tom-youtube", "tytul": p["tytul"], "przypisal": "trener"}
                if p.get("czas_s"): w["czas_s"] = p["czas_s"]
                filmy["filmy"].append(w)
                nr_filmu += 1
                licz["przypiete"] += 1
        przypiete = {f.get("youtube_id") for f in filmy["filmy"]}
        bib["poradniki_bez_cwiczenia"] = [p for p in bib.get("poradniki_bez_cwiczenia", []) if p["yt"] not in przypiete]

    # filmy przy BAZIE → odpięte
    if "Filmy przy BAZIE" in wb.sheetnames:
        do_odpiecia = {str(r[0]).strip() for r in wb["Filmy przy BAZIE"].iter_rows(min_row=2, values_only=True)
                       if r[0] and (tekst(r[7]) or "").upper() == "ODEPNIJ"}
        zostaja = []
        for f in filmy["filmy"]:
            if f["id"] in do_odpiecia:
                filmy.setdefault("odpiete", []).append(
                    {"cwiczenie_id": f["cwiczenie_id"], "youtube_id": f["youtube_id"], "data": dzis})
                licz["odpiete"] += 1
            else:
                zostaja.append(f)
        filmy["filmy"] = zostaja

    # pierwszy film demonstracyjny = link „film” przy ćwiczeniu
    for c in bib["cwiczenia"]:
        if not any(f["cwiczenie_id"] == c["id"] for f in filmy["filmy"]):
            bledy.append(f"{c['id']} {c['nazwa']}: nie ma już żadnego filmu")

    print(", ".join(f"{k}: {v}" for k, v in licz.items()))
    if bledy:
        print(f"\n{len(bledy)} do poprawienia w arkuszu (te wiersze pominięte):")
        for b in bledy:
            print("  •", b)
    if na_sucho:
        print("\n(na sucho — nic nie zapisano)")
        return
    zapisz(PLIK_BIB, bib, "cwiczenia")
    zapisz(PLIK_FILMOW, filmy, "filmy")
    print("\nzapisane; teraz: python3 silnik/narzedzia/generuj-dane.py, potem testy (npm test w silnik/ i konsola/)")


def test():
    """Arkusz → decyzje → zastosuj, na kopiach plików; sprawdza skutki każdej decyzji."""
    global PLIK_BIB, PLIK_FILMOW, PLIK_BAZY
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        for p in (PLIK_BIB, PLIK_FILMOW, PLIK_BAZY):
            shutil.copy(p, tmp / p.name)
        PLIK_BIB, PLIK_FILMOW, PLIK_BAZY = (tmp / p.name for p in (PLIK_BIB, PLIK_FILMOW, PLIK_BAZY))
        arkusz(tmp / "a.xlsx")
        wb = load_workbook(tmp / "a.xlsx")
        g = wb["Grupy"]
        for w in range(2, g.max_row + 1):
            if g.cell(w, 1).value == "MOBILNOSC": g.cell(w, 5).value = "OK"
        d = wb["Do weryfikacji"]
        wiersze = {d.cell(w, 1).value: w for w in range(2, d.max_row + 1)}
        tylko_kompleks = next(i for i, w in wiersze.items()
                              if d.cell(w, 3).value == "KOMPLEKS" and d.cell(w, 13).value != "?")
        z_pytajnikiem = next(i for i, w in wiersze.items() if d.cell(w, 13).value == "?" and i != tylko_kompleks)
        poprawiany = next(i for i in wiersze if i not in (tylko_kompleks, z_pytajnikiem))
        ukrywany = next(i for i in wiersze if i not in (tylko_kompleks, z_pytajnikiem, poprawiany))
        d.cell(wiersze[tylko_kompleks], 16).value = "OK"
        d.cell(wiersze[z_pytajnikiem], 16).value = "OK"
        w = wiersze[poprawiany]
        d.cell(w, 17).value, d.cell(w, 18).value, d.cell(w, 21).value = "Core", "0,5", "nie"
        d.cell(wiersze[ukrywany], 16).value = "usuń"
        cel_poradnika = "EX-0011"
        wb["Poradniki bez ćwiczenia"].cell(2, 4).value = f"{cel_poradnika}, EX-9999"
        yt_poradnika = wb["Poradniki bez ćwiczenia"].cell(2, 1).value
        f = wb["Filmy przy BAZIE"]
        f.cell(2, 8).value = "ODEPNIJ"
        odpiety = f.cell(2, 1).value
        wb.save(tmp / "a.xlsx")
        zastosuj(tmp / "a.xlsx", False)

        bib = {c["id"]: c for c in json.loads(PLIK_BIB.read_text(encoding="utf-8"))["cwiczenia"]}
        filmy = json.loads(PLIK_FILMOW.read_text(encoding="utf-8"))
        assert bib[tylko_kompleks]["zatwierdzone"] and bib[tylko_kompleks]["uwagi"] is None
        assert not bib[z_pytajnikiem].get("zatwierdzone"), "„?” bez rozstrzygnięcia nie może przejść"
        c = bib[poprawiany]
        assert (c["kategoria"], c["part"], c["coeff"], c["jednostronne"]) == ("Core", "c", 0.5, "nie"), c
        assert bib[ukrywany]["ukryte"] is True
        mob = [c for c in bib.values() if c.get("weryfikacja") == ["MOBILNOSC"]]
        assert not mob, f"grupa MOBILNOSC nie zatwierdzona: {len(mob)}"
        assert any(w["cwiczenie_id"] == cel_poradnika and w["youtube_id"] == yt_poradnika
                   and w["rola"] == "poradnik" and w["przypisal"] == "trener" for w in filmy["filmy"])
        assert not any(w["id"] == odpiety for w in filmy["filmy"]) and filmy["odpiete"]
        print("\n✓ test weryfikacji: grupa, OK, poprawka, „?”, USUŃ, poradnik, odpięcie — repo bez zmian")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["arkusz"]:
        arkusz(pathlib.Path(a[1] if len(a) > 1 else "weryfikacja-bibliotek.xlsx"))
    elif a[:1] == ["zastosuj"] and len(a) > 1:
        zastosuj(pathlib.Path(a[1]), "--na-sucho" in a)
    elif a[:1] == ["test"]:
        test()
    else:
        sys.exit(__doc__)
