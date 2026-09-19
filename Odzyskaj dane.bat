@echo off
rem
rem Odzyskanie klientow z poprzedniej paczki - Windows.
rem
rem Cala robota siedzi w narzedziu node'owym obok; ten plik tylko je odpala,
rem raz po liste i drugi raz po wybranej pozycji.
rem
setlocal
title CraftMyPlan - odzyskiwanie danych

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

chcp 65001 >nul 2>nul

node --no-warnings narzedzia/znajdz-dane.ts
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)

echo.
set NUMER=
set /p NUMER=  Numer bazy do przeniesienia (Enter = rezygnacja): 
if "%NUMER%"=="" (
  echo   Nic nie zmieniono.
  echo.
  pause
  exit /b 0
)

node --no-warnings narzedzia/znajdz-dane.ts --wykonaj %NUMER%
if errorlevel 1 (
  echo.
  echo Nic nie zostalo zmienione - powod jest wypisany wyzej.
  echo.
  pause
  exit /b 1
)

echo   Uruchom teraz "Uruchom CraftMyPlan" - klienci maja byc na liscie.
echo.
pause
exit /b 0
