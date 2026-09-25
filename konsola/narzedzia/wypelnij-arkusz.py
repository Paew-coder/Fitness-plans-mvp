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
    # Arkusz nie zna hipertrofii. Serie, RPE i powtorzenia (takze akcesoriow)
    # przychodza wtedy wpisane wprost, wiec przelacznik niczego nie liczy.
    "hipertrofia": "część 1 (objętość)",
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

    # --- TOP SETY ---
    #
    # Przelacznik (kolumna B) jest jeden na caly cykl: stoi w T1, a pozostale
    # tygodnie go lustrza. RPE ma za to kazdy tydzien wlasne i tam wlasnie
    # siedzi rampa 6 -> 6,5 -> 7 -> 7,5 -> 8. Dotad wpisywalismy RPE tylko
    # do T1 — czyli szesc tygodni dostawalo jedna liczbe, a rampa gubila sie
    # w drodze z konsoli do pliku.
    #
    # Pusta wartosc CZYSCI komorke i to jest jej sens: po poprawce 4 arkusza
    # pusty RPE znaczy „w tym tygodniu TOP SETU nie ma" — tak wyglada tydzien
    # pierwszy. Bez tej poprawki wyczyszczony RPE dawalby TOP SET na 0 kg,
    # wiec plik szablonu musi byc juz poprawiony.
    for top in dane["top_sety"]:
        r = wiersz_topsetu(top["dzien"])
        t1.cell(row=r, column=KOL_PRZEL).value = "TOP SET" if top["wlaczony"] else "—"
        for skrot, rpe in (top.get("rpe_tygodni") or {}).items():
            wb[skrot].cell(row=r, column=KOL_RPE).value = rpe

    # --- serie maksymalne klienta ---
    start = wb["START"]
    for seria in dane["serie_maksymalne"]:
        r = wiersz_startu(seria["dzien"], seria["pozycja"])
        start.cell(row=r, column=KOL_START_CIEZAR).value = seria["ciezar"]
        start.cell(row=r, column=KOL_START_POWT).value = seria["powtorzenia"]
        licznik["serie_maksymalne"] += 1

    if dane.get("data_startu"):
        start["C2"] = dane["data_startu"]

    # --- tygodnie po cyklu: deload i maksy ---
    for i, tydzien in enumerate(dane.get("tygodnie_dodatkowe") or []):
        dopisz_tydzien_dodatkowy(wb, tydzien, wb.sheetnames.index("T6") + 1 + i)
        licznik["tygodnie_dodatkowe"] = licznik.get("tygodnie_dodatkowe", 0) + 1

    wb.save(cel)
    return licznik


OPIS_TYGODNIA = {
    "deload": "Deload: serie i powtórzenia jak w T6, RPE o 1 niżej, bez TOP SETU.",
    "maksy": "Maksy: 1 × 1 @ RPE 10, wszystkie boje jednego dnia. "
             "Ciężar to obecne 1RM — punkt odniesienia; wynik wpisz obok.",
}


def dopisz_tydzien_dodatkowy(wb, tydzien: dict, pozycja: int) -> None:
    """
    Zakladka z gotowymi wartosciami. Szablon 5.18 zna szesc tygodni, a ich
    formuly odwoluja sie do siebie nawzajem — kopia T6 liczylaby T6, nie
    deload. Dlatego liczby wpisujemy wprost i mowimy o tym nad tabela.
    """
    from openpyxl.styles import Font

    ws = wb.create_sheet(tydzien["nazwa"], pozycja)
    maksy = tydzien["rodzaj"] == "maksy"
    ws["A1"] = tydzien["nazwa"].upper()
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = OPIS_TYGODNIA.get(tydzien["rodzaj"], "")
    ws["A3"] = "Wartości policzone w CraftMyPlan — w tej zakładce nie ma formuł."
    ws["A3"].font = Font(italic=True, color="777777")

    naglowki = (["Lp.", "Bój", "Serie", "Powt.", "RPE", "1RM teraz (kg)", "Wynik (kg)"]
                if maksy else
                ["Dzień", "Lp.", "Ćwiczenie", "Serie", "Powt.", "RPE", "Ciężar (kg)"])
    for k, tekst in enumerate(naglowki, start=1):
        c = ws.cell(row=5, column=k, value=tekst)
        c.font = Font(bold=True)

    r = 6
    poprzedni_dzien = None
    for w in tydzien["wiersze"]:
        ciezar = w["ciezar"] if isinstance(w["ciezar"], (int, float)) else (w["ciezar"] or None)
        if maksy:
            wartosci = [w["lp"], w["cwiczenie"], w["serie"], w["powtorzenia"], w["rpe"], ciezar, None]
        else:
            # Pusty wiersz miedzy dniami — tak czyta sie to jak plan, nie jak tabela.
            if poprzedni_dzien is not None and w["dzien"] != poprzedni_dzien:
                r += 1
            poprzedni_dzien = w["dzien"]
            dzien = ["I", "II", "III", "IV", "V"][w["dzien"] - 1] if 1 <= w["dzien"] <= 5 else w["dzien"]
            wartosci = [dzien, w["lp"], w["cwiczenie"], w["serie"], w["powtorzenia"], w["rpe"], ciezar]
        for k, v in enumerate(wartosci, start=1):
            ws.cell(row=r, column=k, value=v)
        r += 1

    for kolumna, szerokosc in zip("ABCDEFG", (8, 8, 34, 8, 8, 8, 14) if not maksy
                                  else (8, 34, 8, 8, 8, 16, 14)):
        ws.column_dimensions[kolumna].width = szerokosc


if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    with open(sys.argv[2], encoding="utf-8") as f:
        dane = json.load(f)
    wynik = wypelnij(sys.argv[1], dane, sys.argv[3])
    print(json.dumps(wynik, ensure_ascii=False))
