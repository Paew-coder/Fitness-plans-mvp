@echo off
rem
rem Wpuszczenie telefonu do konsoli CraftMyPlan - Windows.
rem
rem Konsola bez hasla przyjmuje polaczenia tylko z tego komputera. To jest
rem celowe: inaczej kazdy w tej samej sieci Wi-Fi ogladalby plany klientow.
rem Zeby wejsc na nia z telefonu, trzeba najpierw ustawic haslo - i po to
rem jest ten plik. Wczesniej dalo sie to zrobic wylacznie z terminala, czyli
rem dla kogos, kto terminala nie otwiera, wcale.
rem
rem Ten plik jest bez polskich ogonkow z tego samego powodu co launcher:
rem okno wiersza polecen potrafi pokazac je jako krzaki.
rem
setlocal
title CraftMyPlan - dostep z telefonu

cd /d "%~dp0konsola" 2>nul
if errorlevel 1 (
  echo Nie znalazlem katalogu "konsola" obok tego pliku.
  echo Ten plik ma lezec w glownym katalogu projektu, tam gdzie README.md
  echo.
  echo Jesli wlasnie klikasz go w podgladzie pliku ZIP - najpierw rozpakuj
  echo caly ZIP: prawy przycisk na nim, "Wyodrebnij wszystkie".
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Nie ma zainstalowanego Node.js - bez niego nic tu nie zadziala.
  echo Wejdz na https://nodejs.org i zainstaluj wersje LTS.
  echo.
  pause
  exit /b 1
)

echo.
echo   Dostep z telefonu - ustawienie hasla
echo.
echo   Co sie zmieni:
echo     - konsola zacznie prosic o e-mail i haslo przy kazdym otwarciu,
echo       takze na tym komputerze;
echo     - w zamian wpusci telefon i tablet z tej samej sieci Wi-Fi;
echo     - link dla klienta zacznie pokazywac adres, ktory da sie wyslac.
echo.
echo   Haslo musi miec co najmniej 10 znakow i bedzie widoczne
echo   podczas wpisywania. Zapisz je sobie - nie da sie go odczytac pozniej.
echo.
echo   Zeby zrezygnowac, zamknij to okno krzyzykiem.
echo.
pause

rem Strona kodowa na UTF-8: narzedzie ponizej pisze po polsku z ogonkami.
chcp 65001 >nul 2>nul

node --no-warnings narzedzia/haslo.ts
if errorlevel 1 (
  echo.
  echo Nic nie zostalo zmienione - powod jest wypisany wyzej.
  echo.
  pause
  exit /b 1
)

echo   Co teraz:
echo     1. Wroc do okna przegladarki z konsola i odswiez strone (F5).
echo     2. Zaloguj sie e-mailem i haslem, ktore przed chwila ustawiles.
echo     3. Otworz plan, kliknij "Link dla klienta" - pod linkiem beda
echo        teraz adresy do wpisania na telefonie.
echo.
echo   Zeby wrocic do trybu bez hasla, uruchom w terminalu:
echo     npm run haslo -- --usun
echo.
pause
exit /b 0
