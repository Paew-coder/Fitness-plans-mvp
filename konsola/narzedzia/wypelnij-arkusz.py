"""
Wypelnia szablon MasterTemplate 5.18 danymi planu i zapisuje jako plik klienta.

Uzycie:
    python3 wypelnij-arkusz.py szablon.xlsx wypelnienie.json wynik.xlsx

Zasada: piszemy WYLACZNIE tam, gdzie wpisuje trener. Formuly zostaja nietkniete —
zwlaszcza kolumna E akcesoriow, ktora liczy powtorzenia automatem. Nadpisujemy ja
tylko wtedy, gdy trener swiadomie ustawil powtorzenia recznie.
"""
import json, shutil, sys

try:
    import openpyxl
except ImportError:
    sys.exit("Brak openpyxl. Zainstaluj: apt-get install -y python3-openpyxl")

SLOTOW_W_DNIU = 12

# Kolumny w T1-T6
KOL_LP, KOL_PRZEL, KOL_CWICZENIE = 1, 2, 3
KOL_SERIE, KOL_POWT, KOL_RPE = 4, 5, 6
# Kolumna odczuc klienta. Import ja czytal od poczatku, a eksport dotad
# pomijal — przez co odeslany arkusz startowal od mnoznika 1 i od T2
# pokazywal inne ciezary niz konsola.
KOL_CIEZAR = 7
KOL_FEEDBACK = 8
KOL_SZKIELET = 10
# 1RM podmienionego cwiczenia — arkusz liczy z niego ciezar w tym tygodniu.
KOL_ONE_RM_RECZNY = 27

# Kolumny w START
KOL_START_CIEZAR, KOL_START_POWT = 3, 4

CZESC_ARKUSZA = {
    "objętość": "część 1 (objętość)",
    "intensywność": "część 2 (intensyfikacja)",
}


def wiersz_topsetu(dzien: int) -> int:
    return 6 + (dzien - 1) * 16


def wiersz_slotu(dzien: int, pozycja: int) -> int:
    return wiersz_topsetu(dzien) + pozycja


def wiersz_startu(dzien: int, pozycja: int) -> int:
    return 6 + (dzien - 1) * 13 + (pozycja - 1)


def wypelnij(szablon: str, dane: dict, cel: str) -> dict:
    shutil.copy(szablon, cel)
    wb = openpyxl.load_workbook(cel, data_only=False)
    licznik = {"sloty": 0, "serie_maksymalne": 0, "tygodnie": 0}

    # --- przelaczniki ---
    analiza = wb["Analiza"]
    analiza["B4"] = dane["ustawienia"]["tryb_akcesoriow"]
    analiza["B5"] = CZESC_ARKUSZA.get(
        dane["ustawienia"]["czesc_planu"], "część 1 (objętość)")

    # --- szkielet planu: T1 trzyma dobor cwiczen, reszta lustrzy ---
    t1 = wb["T1"]
    for slot in dane["sloty"]:
        r = wiersz_slotu(slot["dzien"], slot["pozycja"])
        t1.cell(row=r, column=KOL_LP).value = slot["lp"] or None
        t1.cell(row=r, column=KOL_CWICZENIE).value = slot["nazwa"] or None
        t1.cell(row=r, column=KOL_SZKIELET).value = slot["kategoria_szkieletu"] or None
        if slot["nazwa"]:
            licznik["sloty"] += 1

    # --- parametry tygodnia po tygodniu ---
    for skrot in ("T1", "T2", "T3", "T4", "T5", "T6"):
        ws = wb[skrot]
        for slot in dane["sloty"]:
            if not slot["nazwa"]:
                continue
            pole = slot["tygodnie"].get(skrot)
            if not pole:
                continue
            r = wiersz_slotu(slot["dzien"], slot["pozycja"])
            if pole.get("serie") is not None:
                ws.cell(row=r, column=KOL_SERIE).value = pole["serie"]
            if pole.get("rpe") is not None:
                ws.cell(row=r, column=KOL_RPE).value = pole["rpe"]
            # Powtorzenia piszemy tylko przy boju glownym albo swiadomym nadpisaniu.
            # Inaczej zostawiamy formule, ktora liczy je automatem.
            if pole.get("powtorzenia_reczne") is not None:
                ws.cell(row=r, column=KOL_POWT).value = pole["powtorzenia_reczne"]
            if pole.get("feedback") is not None:
                ws.cell(row=r, column=KOL_FEEDBACK).value = pole["feedback"]
            # Ciezar wpisany recznie zastepuje formule w komorce - tak samo,
            # jak robil to trener, wpisujac liczbe wprost do arkusza. Bez tego
            # klient dostawalby ciezar policzony, a w konsoli stalby inny.
            if pole.get("ciezar_reczny") is not None:
                ws.cell(row=r, column=KOL_CIEZAR).value = pole["ciezar_reczny"]
            # Podmiana cwiczenia w srodku cyklu: w arkuszu to po prostu inna
            # nazwa w kolumnie CWICZENIE tego tygodnia, plus recznie podany 1RM.
            if pole.get("cwiczenie_podmienione"):
                ws.cell(row=r, column=KOL_CWICZENIE).value = pole["cwiczenie_podmienione"]
            if pole.get("one_rm_reczny") is not None:
                ws.cell(row=r, column=KOL_ONE_RM_RECZNY).value = pole["one_rm_reczny"]
            licznik["tygodnie"] += 1

    # --- TOP SETY: przelacznik i RPE ustawia sie w T1, reszta lustrzy ---
    for top in dane["top_sety"]:
        r = wiersz_topsetu(top["dzien"])
        t1.cell(row=r, column=KOL_PRZEL).value = "TOP SET" if top["wlaczony"] else "—"
        if top.get("rpe") is not None:
            t1.cell(row=r, column=KOL_RPE).value = top["rpe"]

    # --- serie maksymalne klienta ---
    start = wb["START"]
    for seria in dane["serie_maksymalne"]:
        r = wiersz_startu(seria["dzien"], seria["pozycja"])
        start.cell(row=r, column=KOL_START_CIEZAR).value = seria["ciezar"]
        start.cell(row=r, column=KOL_START_POWT).value = seria["powtorzenia"]
        licznik["serie_maksymalne"] += 1

    if dane.get("data_startu"):
        start["C2"] = dane["data_startu"]

    wb.save(cel)
    return licznik


if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    with open(sys.argv[2], encoding="utf-8") as f:
        dane = json.load(f)
    wynik = wypelnij(sys.argv[1], dane, sys.argv[3])
    print(json.dumps(wynik, ensure_ascii=False))
