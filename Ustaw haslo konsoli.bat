@echo off
rem
rem Ustawienie hasla do konsoli CraftMyPlan - Windows.
rem
rem Konsola bez hasla obsluguje tylko ten komputer: ekrany trenera sa odciete
rem dla wszystkich innych urzadzen w sieci. Haslo to zdejmuje - i jest tez
rem warunkiem postawienia konsoli na serwerze. Wczesniej dalo sie je ustawic
rem wylacznie komenda w terminalu, czyli dla kogos, kto terminala nie otwiera,
rem wcale.
rem
rem Uwaga na to, czego ten plik NIE dotyczy: link dla klienta dziala z telefonu
rem w tej samej sieci takze bez hasla, bo jego kluczem jest token w adresie.
rem
rem Ten plik jest bez polskich ogonkow z tego samego powodu co launcher:
rem okno wiersza polecen potrafi pokazac je jako krzaki.
rem
setlocal
title CraftMyPlan - haslo do konsoli

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
echo   Haslo do konsoli trenera
echo.
echo   Po co:
echo     - zeby otworzyc konsole na tablecie albo drugim komputerze;
echo     - zeby postawic ja na serwerze - bez hasla odmawia;
echo     - zeby nikt z tej samej sieci Wi-Fi na nia nie wszedl.
echo.
echo   Czego NIE zmienia: link dla klienta i tak dziala z telefonu w tej
echo   samej sieci, takze bez hasla. Jesli chcesz tylko go sprawdzic -
echo   zamknij to okno, haslo nie jest do tego potrzebne.
echo.
echo   Co sie zmieni: konsola zacznie prosic o e-mail i haslo przy kazdym
echo   otwarciu, takze na tym komputerze.
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
echo     1. Wroc do okna przegladarki z konsola i odswiez strone - klawisz F5.
echo     2. Zaloguj sie e-mailem i haslem, ktore przed chwila ustawiles.
echo     3. Na tablecie wpisz adres wypisany wyzej i zaloguj sie tak samo.
echo.
echo   Zeby wrocic do trybu bez hasla, uruchom w terminalu:
echo     npm run haslo -- --usun
echo.
pause
exit /b 0
