@echo off
rem
rem Pobranie najnowszej wersji programu - Windows.
rem
rem Cala robota siedzi w narzedziu node'owym obok; ten plik tylko je odpala.
rem To celowe: logike da sie sprawdzic testami, ktore chodza wszedzie, a tego
rem pliku nie da sie uruchomic nigdzie poza Windowsem.
rem
setlocal
title CraftMyPlan - aktualizacja

cd /d "%~dp0konsola" 2>nul
if errorlevel 1 (
  echo Nie znalazlem katalogu "konsola" obok tego pliku.
  echo Ten plik ma lezec w glownym katalogu projektu, tam gdzie README.md
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
echo   Aktualizacja CraftMyPlan
echo.
echo   Co sie stanie:
echo     - pobiore najnowsza wersje programu z GitHuba,
echo     - podmienie pliki programu w tym katalogu,
echo     - zrobie wczesniej kopie bazy.
echo.
echo   Czego NIE ruszam: katalogu konsola\dane, czyli Twoich klientow,
echo   planow, ocen i wagi. Aktualizacja ich nie dotyka.
echo.
echo   Konsola musi byc zamknieta - jesli czarne okno CraftMyPlan jest
echo   otwarte, zamknij je teraz.
echo.
echo   Zeby zrezygnowac, zamknij to okno krzyzykiem.
echo.
pause

chcp 65001 >nul 2>nul

node --no-warnings narzedzia/aktualizuj.ts --wykonaj
if errorlevel 1 (
  echo.
  echo Nic nie zostalo zmienione - powod jest wypisany wyzej.
  echo.
  pause
  exit /b 1
)

echo   Uruchom teraz "Uruchom CraftMyPlan", zeby wystartowac nowa wersje.
echo.
pause
exit /b 0
