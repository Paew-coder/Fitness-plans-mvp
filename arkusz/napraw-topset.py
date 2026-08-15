"""
Naprawa TOP SET w MasterTemplate 5.17 -> 5.18.

PROBLEM
    Wiersz TOP SET czyta na sztywno pierwszy slot dnia (wiersze 7, 23, 39, 55, 71).
    Gdy w S01 stoi rozgrzewka albo cokolwiek innego niz boj glowny, TOP SET
    pokazuje ciezar tego czegos zamiast boju glownego.

ROZWIAZANIE
    Wiersz TOP SET sam znajduje boj glowny w swoim dniu — po literze "A" w kolumnie Lp.
    Indeks laduje w nowej komorce technicznej K, a reszta formul czyta z niego
    przez INDEX. Ksztalt formul C i G zostaje niezmieniony — zmieniaja sie tylko
    odwolania: wiersz slotu -> wiersz TOP SET.

    Gdy w dniu nie ma zadnego "A", MATCH nie trafia, K = 0, TOP SET zostaje pusty.
    Dzis w takiej sytuacji pokazuje zawartosc pierwszego slotu.

METODA
    Edycja XML wprost w archiwum .xlsx. Zaden inny bajt pliku nie jest ruszany —
    openpyxl przy zapisie zgubilby czesc `xl/metadata` obecna w tym pliku.

UZYCIE
    python3 arkusz/napraw-topset.py MasterTemplate517.xlsx MasterTemplate518.xlsx
"""
import re, shutil, sys, zipfile
from pathlib import Path
from xml.sax.saxutils import escape as _escape


def escape(t: str) -> str:
    """Escape zgodny z konwencja pliku zrodlowego — takze cudzyslowy."""
    return _escape(t, {'"': '&quot;'})

# T1..T6 to sheet3..sheet8 w tym pliku
ARKUSZE = {f"T{i}": f"xl/worksheets/sheet{i + 2}.xml" for i in range(1, 7)}
ARKUSZ_START = "xl/worksheets/sheet1.xml"
WIERSZE_TOPSET = [6, 22, 38, 54, 70]
SLOTOW_W_DNIU = 12

TABELA_PROC = ("IFERROR(INDEX(TABELE!$B$4:$J$18,MATCH(1,TABELE!$A$4:$A$18,0),"
               "MATCH($F{r},TABELE!$B$3:$J$3,0)),0)")
BEZ_CIEZARU = ('OR($Q{r}="masa ciała",$Q{r}="czas",$Q{r}="dystans",'
               '$Q{r}="ręczne ustawienie")')


def formuly(r: int, pierwszy: bool) -> dict[str, str]:
    """Nowe formuly dla wiersza TOP SET `r`. `pierwszy` = arkusz T1."""
    a, b = r + 1, r + SLOTOW_W_DNIU
    proc = TABELA_PROC.format(r=r)
    bez = BEZ_CIEZARU.format(r=r)
    ciezar_z = f'MROUND({{zrodlo}}*{proc}/100,MAX($P{r},0.5))'

    z_rpe = ciezar_z.format(zrodlo=f"$R{r}")
    z_recznego = ciezar_z.format(zrodlo=f"$AA{r}")
    galaz_rpe = f'IF(OR($R{r}="",$R{r}=0),"— brak 1RM",{z_rpe})'
    galaz_reczna = f'IF(OR($AA{r}="",$AA{r}=0),"— ustaw ręcznie",{z_recznego})'

    rdzen = galaz_rpe if pierwszy else (
        f"IF($C{r}='T1'!$C{r},{galaz_rpe},{galaz_reczna})"
    )

    nowe = {
        # Indeks boju glownego w obrebie dnia. 0 = w tym dniu nie ma pozycji "A".
        f"K{r}": f'=IFERROR(MATCH("A*",$A${a}:$A${b},0),0)',
        f"P{r}": f'=IF(N($K{r})=0,"",INDEX($P${a}:$P${b},$K{r}))',
        f"Q{r}": f'=IF(N($K{r})=0,"",INDEX($Q${a}:$Q${b},$K{r}))',
        f"R{r}": f'=IF(N($K{r})=0,"",INDEX($R${a}:$R${b},$K{r}))',
        f"C{r}": (f'=IF($B{r}<>"TOP SET","",IF(N($K{r})=0,"",'
                  f'IF(INDEX($C${a}:$C${b},$K{r})="","",INDEX($C${a}:$C${b},$K{r}))))'),
        f"G{r}": (f'=IF($B{r}<>"TOP SET","",IF($C{r}="","",'
                  f'IF({bez},"—",{rdzen})))'),
    }
    if not pierwszy:
        nowe[f"AA{r}"] = f'=IF(N($K{r})=0,"",INDEX($AA${a}:$AA${b},$K{r}))'
    return nowe


# Kolumny dokladane do wiersza TOP SET, w kolejnosci wystepowania w arkuszu.
# G jest dzis ostatnia komorka wiersza, wiec dopisanie na koncu zachowuje porzadek.
DOKLADANE = ["K", "P", "Q", "R", "AA"]


def nr_kolumny(litery: str) -> int:
    n = 0
    for z in litery:
        n = n * 26 + (ord(z) - 64)
    return n


def styl_wzorcowy(xml: str, kolumna: str, wiersz_slotu: int) -> str:
    """Indeks stylu z odpowiadajacej komorki pierwszego slotu — zeby formatowanie pasowalo."""
    m = re.search(rf'<c r="{kolumna}{wiersz_slotu}"([^>]*?)/?>', xml)
    if not m:
        return ""
    s = re.search(r'\ss="(\d+)"', m.group(1))
    return f' s="{s.group(1)}"' if s else ""


def podmien_formule(xml: str, adres: str, nowa: str, zmiany: list) -> str:
    """Podmienia tresc <f> w istniejacej komorce i usuwa nieaktualna wartosc <v>."""
    wzorzec = re.compile(rf'(<c r="{adres}"[^>]*>)(.*?)(</c>)', re.S)
    m = wzorzec.search(xml)
    if not m:
        raise SystemExit(f"BLAD: nie znalazlem komorki {adres}")
    srodek = m.group(2)

    stara = re.search(r"<f[^>]*>(.*?)</f>", srodek, re.S)
    if not stara:
        raise SystemExit(f"BLAD: komorka {adres} nie zawiera formuly")
    zmiany.append((adres, stara.group(1), escape(nowa[1:])))

    nowy_srodek = re.sub(r"(<f[^>]*>).*?(</f>)",
                         lambda mm: mm.group(1) + escape(nowa[1:]) + mm.group(2),
                         srodek, count=1, flags=re.S)
    nowy_srodek = re.sub(r"<v>.*?</v>", "", nowy_srodek, flags=re.S)
    return xml[:m.start()] + m.group(1) + nowy_srodek + m.group(3) + xml[m.end():]


def ustaw_komorke(xml: str, wiersz: int, adres: str, formula: str,
                  styl: str, zmiany: list) -> str:
    """
    Wstawia formule do komorki technicznej wiersza TOP SET.

    Arkusz ma juz puste komorki ze stylami (K..Z) — takie wypelniamy w miejscu.
    Brakujace (AA) wstawiamy w poprawnej pozycji, bo kolejnosc kolumn w <row>
    musi rosnac.
    """
    kolumna = re.match(r"[A-Z]+", adres).group(0)
    tresc = f"<f>{escape(formula[1:])}</f>"

    istniejaca = re.search(rf'<c r="{adres}"([^>]*?)(?:/>|>(.*?)</c>)', xml, re.S)
    if istniejaca:
        srodek = istniejaca.group(2) or ""
        if "<f" in srodek or "<v" in srodek:
            raise SystemExit(f"BLAD: komorka {adres} nie jest pusta — przerywam")
        atrybuty = istniejaca.group(1).rstrip("/")
        zmiany.append((adres, "(pusta)", escape(formula[1:])))
        return (xml[:istniejaca.start()]
                + f'<c r="{adres}"{atrybuty}>{tresc}</c>'
                + xml[istniejaca.end():])

    m = re.search(rf'(<row r="{wiersz}"[^>]*>)(.*?)(</row>)', xml, re.S)
    if not m:
        raise SystemExit(f"BLAD: nie znalazlem wiersza {wiersz}")
    nowa = f'<c r="{adres}"{styl}>{tresc}</c>'
    zmiany.append((adres, "(brak komórki)", escape(formula[1:])))

    # Wstaw przed pierwsza komorka o wyzszym numerze kolumny; inaczej na koncu wiersza.
    docelowa = nr_kolumny(kolumna)
    for c in re.finditer(r'<c r="([A-Z]+)\d+"', m.group(2)):
        if nr_kolumny(c.group(1)) > docelowa:
            pozycja = m.start(2) + c.start()
            return xml[:pozycja] + nowa + xml[pozycja:]
    return xml[:m.end(2)] + nowa + xml[m.end(2):]


def napraw_arkusz(xml: str, nazwa: str, zmiany: list) -> str:
    pierwszy = nazwa == "T1"
    for r in WIERSZE_TOPSET:
        nowe = formuly(r, pierwszy)

        for kolumna in DOKLADANE:
            adres = f"{kolumna}{r}"
            if adres not in nowe:
                continue
            styl = styl_wzorcowy(xml, kolumna, r + 1)
            xml = ustaw_komorke(xml, r, adres, nowe[adres], styl, zmiany)

        for kolumna in ("C", "G"):
            xml = podmien_formule(xml, f"{kolumna}{r}", nowe[f"{kolumna}{r}"], zmiany)

        # Podsumowanie dnia liczy TOP SET jako serie — tez czytalo pierwszy slot.
        podsumowanie = r + SLOTOW_W_DNIU + 1
        stary = f",C{r + 1}&lt;&gt;&quot;&quot;),1,0)"
        nowy = f",$C${r}&lt;&gt;&quot;&quot;),1,0)"
        m = re.search(rf'(<c r="D{podsumowanie}"[^>]*>)(.*?)(</c>)', xml, re.S)
        if not m or stary not in m.group(2):
            raise SystemExit(
                f"BLAD: nie znalazlem wzorca TOP SET w podsumowaniu D{podsumowanie} — przerywam")
        srodek = m.group(2).replace(stary, nowy)
        srodek = re.sub(r"<v>.*?</v>", "", srodek, flags=re.S)
        zmiany.append((f"D{podsumowanie}", f"…{stary}", f"…{nowy}"))
        xml = xml[:m.start()] + m.group(1) + srodek + m.group(3) + xml[m.end():]
    return xml


def formula_ciezaru_slotu(r: int, pierwszy: bool) -> str:
    """Wzorzec kolumny G dla zwyklego slotu — odtworzony z sasiednich wierszy."""
    bez = BEZ_CIEZARU.format(r=r)
    z_rpe = f"MROUND($R{r}*$S{r}/100,MAX($P{r},0.5))"
    z_recznego = f"MROUND($AA{r}*$S{r}/100,MAX($P{r},0.5))"
    galaz_rpe = f'IF(OR($R{r}="",$R{r}=0),"— brak 1RM",{z_rpe})'
    galaz_reczna = f'IF(OR($AA{r}="",$AA{r}=0),"— ustaw ręcznie",{z_recznego})'
    rdzen = galaz_rpe if pierwszy else f"IF($C{r}='T1'!$C{r},{galaz_rpe},{galaz_reczna})"
    return f'=IF($C{r}="","",IF({bez},$Q{r},{rdzen}))'


def napraw_brakujace_ciezary(xml: str, nazwa: str, zmiany: list) -> str:
    """
    OSOBNA POPRAWKA — nie dotyczy TOP SETU.

    W T1 brakuje formuly ciezaru w G8 (slot D1-S02) — jedynej sposrod 360 komorek
    kolumny G we wszystkich szesciu tygodniach. Skutek: ten slot nigdy nie pokazuje
    ciezaru, nawet przy poprawnym 1RM.

    Skanujemy wszystkie wiersze slotow i odtwarzamy wzorzec tam, gdzie go brak.
    Do cofniecia niezaleznie od pozostalych poprawek.
    """
    pierwszy = nazwa == "T1"
    for topset in WIERSZE_TOPSET:
        for r in range(topset + 1, topset + 1 + SLOTOW_W_DNIU):
            m = re.search(rf'<c r="G{r}"([^>]*?)(?:/>|>(.*?)</c>)', xml, re.S)
            if m and "<f" in (m.group(2) or ""):
                continue
            xml = ustaw_komorke(xml, r, f"G{r}", formula_ciezaru_slotu(r, pierwszy),
                                styl_wzorcowy(xml, "G", r + 1 if r == topset + 1 else r - 1),
                                zmiany)
    return xml


def napraw_start(xml: str, zmiany: list) -> str:
    """
    OSOBNA POPRAWKA — nie dotyczy TOP SETU.

    W START brakuje formuly w B7 (slot D1-S02). Pozostale 59 komorek kolumny B
    maja lustro z T1, ta jedna jest pusta. Skutek: dla slotu D1-S02 nazwa
    cwiczenia nigdy nie trafia na START, wiec 1RM sie nie rozwiazuje, a seria
    maksymalna wpisana przez klienta jest po cichu ignorowana — ciezar pokazuje
    "— brak 1RM" mimo poprawnie wypelnionego wejscia.

    Przywracamy wzorzec z sasiednich wierszy: START!B{r} -> 'T1'!$C{r+1}.
    Do cofniecia niezaleznie od poprawki TOP SETU.
    """
    formula = "=IF('T1'!$C8=\"\",\"\",'T1'!$C8)"
    m = re.search(r'<c r="B7"([^>]*?)(?:/>|>(.*?)</c>)', xml, re.S)
    if not m:
        raise SystemExit("BLAD: nie znalazlem komorki START!B7")
    srodek = m.group(2) or ""
    if "<f" in srodek or "<v" in srodek:
        print("  UWAGA: START!B7 nie jest pusta — pomijam te poprawke")
        return xml
    atrybuty = m.group(1).rstrip("/")
    zmiany.append(("START!B7", "(brak formuły)", escape(formula[1:])))
    return (xml[:m.start()]
            + f'<c r="B7"{atrybuty}><f>{escape(formula[1:])}</f></c>'
            + xml[m.end():])


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    zrodlo, cel = Path(sys.argv[1]), Path(sys.argv[2])
    if not zrodlo.exists():
        sys.exit(f"Nie ma pliku: {zrodlo}")

    shutil.copy(zrodlo, cel)
    with zipfile.ZipFile(zrodlo) as z:
        czesci = {n: z.read(n) for n in z.namelist()}
        kolejnosc = z.namelist()

    wszystkie: dict[str, list] = {}
    zmiany_ciezarow: list = []
    for nazwa, sciezka in ARKUSZE.items():
        zmiany: list = []
        xml = czesci[sciezka].decode("utf-8")
        xml = napraw_arkusz(xml, nazwa, zmiany)
        if "--bez-ciezarow" not in sys.argv:
            xml = napraw_brakujace_ciezary(xml, nazwa, zmiany_ciezarow)
        czesci[sciezka] = xml.encode("utf-8")
        wszystkie[nazwa] = zmiany

    zmiany_startu: list = []
    if "--bez-startu" not in sys.argv:
        xml = czesci[ARKUSZ_START].decode("utf-8")
        czesci[ARKUSZ_START] = napraw_start(xml, zmiany_startu).encode("utf-8")

    with zipfile.ZipFile(cel, "w", zipfile.ZIP_DEFLATED) as z:
        for n in kolejnosc:
            z.writestr(n, czesci[n])

    razem = sum(len(v) for v in wszystkie.values())
    print(f"{zrodlo.name} -> {cel.name}\n")
    print("=" * 70)
    print("POPRAWKA 1 — TOP SET czyta boj glowny zamiast pierwszego slotu")
    print("=" * 70)
    print(f"Zmienionych komorek: {razem} "
          f"({', '.join(f'{k}: {len(v)}' for k, v in wszystkie.items())})\n")
    print("Przyklad z T1, dzien I (pozostale dni i arkusze analogicznie):\n")
    for adres, stara, nowa in wszystkie["T1"][:8]:
        print(f"  {adres}")
        print(f"    bylo: {stara[:150]}")
        print(f"    jest: {nowa[:150]}\n")

    print("=" * 70)
    print("POPRAWKA 2 — brakujaca formula w START!B7  (OSOBNA, do osobnej decyzji)")
    print("=" * 70)
    if zmiany_startu:
        for adres, stara, nowa in zmiany_startu:
            print(f"  {adres}")
            print(f"    bylo: {stara}")
            print(f"    jest: {nowa}")
        print("\n  Bez tej poprawki slot D1-S02 nigdy nie dostaje 1RM — seria maksymalna")
        print("  wpisana przez klienta jest ignorowana, a ciezar pokazuje '— brak 1RM'.")
        print("  Aby ja pominac, uruchom skrypt z flaga --bez-startu.")
    else:
        print("  pominieta")

    print()
    print("=" * 70)
    print("POPRAWKA 3 — brakujaca formula ciezaru w slocie  (OSOBNA, do osobnej decyzji)")
    print("=" * 70)
    if zmiany_ciezarow:
        for adres, stara, nowa in zmiany_ciezarow:
            print(f"  {adres}")
            print(f"    bylo: {stara}")
            print(f"    jest: {nowa[:150]}")
        print("\n  Jedyna taka komorka sposrod 360 w kolumnie G we wszystkich tygodniach.")
        print("  Bez niej slot nigdy nie pokazuje ciezaru, nawet przy poprawnym 1RM.")
        print("  Aby ja pominac, uruchom skrypt z flaga --bez-ciezarow.")
    else:
        print("  brak brakow albo pominieta")


if __name__ == "__main__":
    main()
