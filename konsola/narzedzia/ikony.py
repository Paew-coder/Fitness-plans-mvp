#!/usr/bin/env python3
"""Ikony aplikacji klienta — sztanga na ciemnym kwadracie.

    python3 narzedzia/ikony.py

Po co osobny skrypt zamiast wrzuconych plikow: ikona ma dac sie odtworzyc
i poprawic. Zapisany PNG bez zrodla to plik, ktorego za pol roku nikt nie
umie zmienic — zostaje albo taki, jaki jest, albo rysowany od zera.

Dlaczego w ogole PNG, skoro manifest przyjmuje SVG: **iOS nie uzywa ikon
z manifestu**. Bierze wylacznie <link rel="apple-touch-icon"> i wylacznie PNG.
Bez tego klient dodajacy aplikacje do ekranu glownego iPhone'a dostaje zrzut
strony zamiast ikony — czyli to, co najbardziej rozni aplikacje od zakladki.

Zero zaleznosci, tak jak reszta projektu: PNG sklada sie tutaj z zlib
i struct, obu z biblioteki standardowej. Caly rysunek to prostokaty
o zaokraglonych rogach, wiec wystarczy jedna funkcja pokrycia piksela.
"""
import struct
import zlib
from pathlib import Path

TLO = (15, 17, 23)          # to samo, co theme_color w manifescie
SZTANGA = (232, 236, 245)   # jasny grif
TALERZ = (79, 124, 255)     # akcent konsoli

KATALOG = Path(__file__).resolve().parent.parent / "public" / "klient"
ROZMIARY = {"ikona-180.png": 180, "ikona-192.png": 192, "ikona-512.png": 512}

# Ile probek na piksel w kazdej osi. Cztery wystarcza, zeby krawedzie
# przestaly byc schodkowe, a nie spowalniaja rysowania w odczuwalny sposob.
PROBEK = 4


def w_zaokraglonym(x, y, lewo, gora, prawo, dol, promien):
    """Czy punkt lezy w prostokacie o zaokraglonych rogach."""
    if not (lewo <= x <= prawo and gora <= y <= dol):
        return False
    # Poza naroznikami wystarczy sam prostokat.
    sx = lewo + promien if x < lewo + promien else (prawo - promien if x > prawo - promien else x)
    sy = gora + promien if y < gora + promien else (dol - promien if y > dol - promien else y)
    if sx == x and sy == y:
        return True
    return (x - sx) ** 2 + (y - sy) ** 2 <= promien ** 2


def ksztalty(px):
    """Sztanga widziana z przodu: grif, po dwa talerze z kazdej strony, zaciski.

    Wszystko liczone w ulamkach boku, wiec ikona wyglada tak samo w kazdym
    rozmiarze. Kolejnosc ma znaczenie: pozniejsze ksztalty kryja wczesniejsze.
    """
    s = float(px)
    srodek = s / 2
    lista = []

    grif = s * 0.055
    lista.append((s * 0.16, srodek - grif / 2, s * 0.84, srodek + grif / 2,
                  grif / 2, SZTANGA))

    # Talerze: wiekszy blizej srodka, mniejszy na zewnatrz — jak na sztandze.
    for odleglosc, wysokosc, szerokosc in [(0.255, 0.42, 0.055), (0.175, 0.28, 0.045)]:
        for x in (s * odleglosc, s * (1 - odleglosc)):
            lista.append((x - s * szerokosc / 2, srodek - s * wysokosc / 2,
                          x + s * szerokosc / 2, srodek + s * wysokosc / 2,
                          s * 0.018, TALERZ))

    # Zaciski na koncach grifu.
    for x in (s * 0.115, s * 0.885):
        lista.append((x - s * 0.014, srodek - s * 0.10,
                      x + s * 0.014, srodek + s * 0.10, s * 0.01, SZTANGA))

    return lista


def narysuj(px):
    """Zwraca wiersze pikseli RGBA."""
    formy = ksztalty(px)
    promien_tla = px * 0.22
    wiersze = []

    for y in range(px):
        wiersz = bytearray()
        for x in range(px):
            # Kolor i przezroczystosc z usrednienia probek — stad gladkie krawedzie.
            r = g = b = a = 0
            for py in range(PROBEK):
                for pxs in range(PROBEK):
                    tx = x + (pxs + 0.5) / PROBEK
                    ty = y + (py + 0.5) / PROBEK
                    if not w_zaokraglonym(tx, ty, 0, 0, px, px, promien_tla):
                        continue
                    kolor = TLO
                    for lewo, gora, prawo, dol, prom, barwa in formy:
                        if w_zaokraglonym(tx, ty, lewo, gora, prawo, dol, prom):
                            kolor = barwa
                    r += kolor[0]
                    g += kolor[1]
                    b += kolor[2]
                    a += 255
            ile = PROBEK * PROBEK
            krycie = a // ile
            if krycie == 0:
                wiersz += bytes(4)
            else:
                # Kolor usredniamy tylko po probkach, ktore w ogole trafily
                # w ikone — inaczej krawedzie ciemnialyby do czerni.
                trafien = a // 255
                wiersz += bytes((r // trafien, g // trafien, b // trafien, krycie))
        wiersze.append(bytes(wiersz))
    return wiersze


def zapisz_png(sciezka, px, wiersze):
    """Minimalny PNG: RGBA, bez filtrow, jeden blok IDAT."""
    surowe = b"".join(b"\x00" + w for w in wiersze)

    def kawalek(typ, dane):
        return (struct.pack(">I", len(dane)) + typ + dane
                + struct.pack(">I", zlib.crc32(typ + dane) & 0xFFFFFFFF))

    plik = (b"\x89PNG\r\n\x1a\n"
            + kawalek(b"IHDR", struct.pack(">IIBBBBB", px, px, 8, 6, 0, 0, 0))
            + kawalek(b"IDAT", zlib.compress(surowe, 9))
            + kawalek(b"IEND", b""))
    sciezka.write_bytes(plik)


if __name__ == "__main__":
    for nazwa, px in ROZMIARY.items():
        cel = KATALOG / nazwa
        zapisz_png(cel, px, narysuj(px))
        print(f"  {nazwa}  {px}x{px}  {max(cel.stat().st_size // 1024, 1)} kB")
