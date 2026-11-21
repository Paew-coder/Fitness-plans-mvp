@echo off
rem
rem Uruchomienie konsoli CraftMyPlan jednym kliknieciem - Windows.
rem
rem Ten plik jest celowo bez polskich ogonkow. Okno wiersza polecen potrafi
rem pokazac je jako krzaki, a to jest dokladnie ten moment, w ktorym komunikat
rem musi byc czytelny. Wersja dla Maca (plik .command) ogonki ma.
rem
setlocal
title CraftMyPlan

if "%~1"=="--otworz-przegladarke" goto otworz
if "%PORT%"=="" set PORT=4173

cd /d "%~dp0konsola" 2>nul
if errorlevel 1 (
  echo Nie znalazlem katalogu "konsola" obok tego pliku.
  echo Ten plik ma lezec w glownym katalogu projektu, tam gdzie README.md
  echo.
  pause
  exit /b 1
)

rem -- Node ----------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo Nie ma zainstalowanego Node.js - bez niego aplikacja sie nie uruchomi.
  echo.
  echo   1. Wejdz na https://nodejs.org
  echo   2. Pobierz wersje oznaczona LTS
  echo   3. Zainstaluj jak zwykly program
  echo   4. Kliknij ten plik jeszcze raz
  echo.
  pause
  exit /b 1
)

for /f "tokens=1,2 delims=v." %%a in ('node -v') do (
  set GLOWNA=%%a
  set POBOCZNA=%%b
)
set STARA=
if %GLOWNA% LSS 22 set STARA=tak
if %GLOWNA%==22 if %POBOCZNA% LSS 6 set STARA=tak
if defined STARA (
  echo Masz Node w wersji %GLOWNA%.%POBOCZNA%, a aplikacja potrzebuje 22.6 albo nowszego.
  echo Pobierz nowsza wersje ze strony https://nodejs.org - wersja LTS.
  echo.
  pause
  exit /b 1
)

rem -- Python do arkuszy ---------------------------------------------
rem
rem Konsola dziala bez Pythona - nie dziala tylko eksport i wczytywanie
rem arkuszy, bo format .xlsx czyta wylacznie biblioteka openpyxl. Lepiej
rem powiedziec to teraz niz wtedy, gdy trener ulozy caly plan i kliknie
rem "Eksportuj arkusz". To jest uwaga, nie przeszkoda.
rem
rem Na Windows Python bywa pod trzema nazwami: py, python i python3.
set PYCMD=
for %%p in (py python python3) do (
  if not defined PYCMD (
    %%p -c "import openpyxl" >nul 2>nul && set PYCMD=%%p
  )
)
if not defined PYCMD (
  echo Uwaga: nie znalazlem Pythona z biblioteka openpyxl.
  echo   Konsola bedzie dzialac, ale eksport i wczytywanie arkuszy - nie.
  echo   Pobierz Pythona 3 ze strony python.org, potem w wierszu polecen:
  echo     pip install openpyxl
  echo.
)

rem -- konsola juz chodzi? -------------------------------------------
rem
rem Podwojne klikniecie ikony przy dzialajacej konsoli to najczestsza rzecz,
rem jaka sie temu plikowi przydarza. Uruchamianie wtedy drugiej nie ma sensu:
rem port jest zajety. Zwyczajnie otwieramy przegladarke.
rem
rem Przelacznik -f jest konieczny: bez niego curl uznaje za sukces takze
rem odpowiedz "nie znaleziono", czyli obcy program na tym porcie wygladalby
rem jak nasza konsola.
where curl >nul 2>nul
if errorlevel 1 goto poczatek
curl -sf -o nul "http://localhost:%PORT%/zdrowie" >nul 2>nul
if errorlevel 1 goto poczatek
echo Konsola juz dziala - otwieram http://localhost:%PORT%
start "" http://localhost:%PORT%
exit /b 0

:poczatek
rem -- start ---------------------------------------------------------
echo Uruchamiam konsole CraftMyPlan...
echo.

rem Przegladarka otwiera sie z opoznieniem, w osobnym oknie: serwer musi
rem zdazyc wstac, zanim cokolwiek pokazemy. Inaczej pierwsze, co widzi
rem trener, to komunikat o braku polaczenia.
start "" /min "%~f0" --otworz-przegladarke

node --no-warnings serwer.ts
if errorlevel 1 (
  rem Serwer sam wypisuje powod po polsku - takze wtedy, gdy port jest zajety.
  rem Wczesniej stalo tu zgadywanie, a nad nim slad stosu po angielsku.
  echo.
  echo Konsola nie wystartowala - powod jest wypisany wyzej.
  echo.
  pause
  exit /b 1
)
exit /b 0

:otworz
if "%PORT%"=="" set PORT=4173
ping -n 4 127.0.0.1 >nul
start "" http://localhost:%PORT%
exit /b 0
