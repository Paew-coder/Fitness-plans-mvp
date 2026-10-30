/**
 * Aplikacja klienta po angielsku (27.10.2026).
 *
 * Trener: „dodaj mi opcję przed wysłaniem linku z planem do klienta, żeby
 * oznaczyć dany plan na anglojęzyczny — wtedy, jeżeli to zaznaczę, cały plan
 * z linku ma być przetłumaczony na język angielski”.
 *
 * Tłumaczy gotowy ekran, a nie kod, który go rysuje: każdy tekst, który
 * pojawi się na stronie (także później — obserwator zmian), idzie przez
 * słownik całych zdań, a zdania z liczbami — przez wzory. Polska aplikacja
 * zostaje dokładnie taka, jaka była: bez planu po angielsku ten plik w ogóle
 * się nie wczytuje. Teksty trenera (rozgrzewka, polskie nazwy ćwiczeń)
 * przychodzą z serwera już przetłumaczone (`plan-po-angielsku.ts`).
 *
 * Nowy polski tekst w aplikacji bez wpisu tutaj zostałby po polsku — tego
 * pilnuje przegląd klienta: z `audytuj` przechodzi całą aplikację i zgłasza
 * każdy tekst, którego słownik nie zna (`npm run przeglad-klienta`).
 */

/** Zdania i napisy w całości: polski → angielski. Białe znaki w kluczu zwinięte do jednej spacji. */
const SLOWNIK = new Map([
  // ── strona i paski ──
  ["Trening", "Training"],
  ["Offline — zapiszę, gdy wróci zasięg", "Offline — I'll save when you're back online"],
  ["Jeden wpis nie został zapisany — trener zmienił plan.", "One entry wasn't saved — your coach changed the plan."],
  // ── ekran główny ──
  ["Twój plan treningowy", "Your training plan"],
  ["Postęp cyklu", "Cycle progress"],
  ["Cykl zrobiony — wszystkie treningi za Tobą", "Cycle complete — all workouts done"],
  ["Trener przygotowuje nowy plan", "Your coach is preparing a new plan"],
  ["Poniżej jest ostatni, który dostałeś. Otwórz aplikację ponownie, gdy trener się odezwie.",
    "Below is the last one you received. Open the app again when your coach gets in touch."],
  ["Jak korzystać z aplikacji", "How to use the app"],
  ["Usuń podpowiedź o instrukcji", "Remove the guide tip"],
  ["Usuń", "Remove"],
  ["Pierwszy raz? Minutowy film i instrukcja krok po kroku: jak zrobić trening, wpisać ciężar i ocenić ćwiczenie.",
    "First time? A one-minute video and a step-by-step guide: how to do a workout, log the weight and rate an exercise."],
  ["▶ Obejrzyj instrukcję", "▶ Watch the guide"],
  ["Schowaj", "Hide"],
  ["Skąd wziąć ciężary", "Where your weights come from"],
  ["Usuń kartę „Skąd wziąć ciężary”", "Remove the “Where your weights come from” card"],
  ["Zacznij trening od razu", "Start training right away"],
  ["Ciężar dobierzesz sam, według RPE. Z pierwszej wpisanej serii policzę resztę planu.",
    "You choose the weight yourself, by RPE. I'll calculate the rest of the plan from the first set you log."],
  ["Najpierw serie maksymalne", "Max sets first"],
  ["Jedna seria do odmowy na każde ćwiczenie — osobny trening pomiarowy.",
    "One set to failure for each exercise — a separate testing session."],
  ["Dodaj do ekranu głównego", "Add to home screen"],
  ["Usuń podpowiedź o ekranie głównym", "Remove the home screen tip"],
  ["Tygodnie cyklu", "Weeks of the cycle"],
  ["Więcej", "More"],
  ["Serie maksymalne", "Max sets"],
  ["Twoje maksy — wpisz albo popraw", "Your maxes — enter or correct"],
  ["Oddech i bieg", "Breathing and running"],
  ["Rozpiska od trenera poza siłownią", "Your coach's plan outside the gym"],
  ["Krótki film i instrukcja krok po kroku", "A short video and a step-by-step guide"],
  ["„Dobierz”, RPE i serie maksymalne", "“Choose”, RPE and max sets"],
  ["Gdy przy ćwiczeniu zamiast kilogramów stoi „dobierz”, ciężar ustalasz sam — na jeden z dwóch sposobów:",
    "When an exercise shows “choose” instead of kilograms, you set the weight yourself — in one of two ways:"],
  ["Dobierając ciężar, nie trzymaj się na siłę liczby powtórzeń z planu: wyszło więcej albo mniej przy zapasie z planu (RPE) — wpisz, ile było. Ciężar się dostosuje.",
    "When choosing the weight, don't force the planned number of reps: if you got more or fewer with the planned reserve (RPE), log what you did. The weight will adjust."],
  ["Trening jak aplikacja, bez szukania linku", "Your workouts like an app, no hunting for the link"],
  ["Twój postęp", "Your progress"],
  ["Ciężary i powtórzenia przez wszystkie cykle", "Weights and reps across all cycles"],
  ["Twoje cykle, ciężary i waga.", "Your cycles, weights and bodyweight."],
  ["Praca obok siłowni. Czas jest zadaniem, tempo celem.", "Work alongside the gym. Time is the task, pace is the target."],
  ["Jak trenować", "How to train"],
  ["▶ Prowadź mnie seria po serii", "▶ Guide me set by set"],
  ["Zakończ trening", "Finish workout"],
  ["Ćwiczenia bez oceny zapiszą się jako „OK\".", "Exercises without a rating will be saved as “OK”."],
  ["Jedna seria do odmowy. Wpisz ciężar i ile powtórzeń wyszło.",
    "One set to failure. Enter the weight and how many reps you got."],
  ["W jednym ćwiczeniu nie znam jeszcze Twojego ciężaru. Wybierz, jak go ustalić.",
    "I don't know your weight for one exercise yet. Choose how to set it."],
  // ── tygodnie i dni ──
  ["Dzień maksów", "Max day"],
  ["Wróć do treningu", "Back to the workout"],
  ["Następny trening", "Next workout"],
  ["maksy", "max test"],
  ["Tydzień lżejszy: RPE niżej, bez TOP SETU — odpoczynek przed kolejnym cyklem.",
    "Lighter week: lower RPE, no TOP SET — recovery before the next cycle."],
  ["Jedno powtórzenie na maksa w każdym boju — wszystko jednego dnia.",
    "One max rep in each main lift — all on one day."],
  // ── trening ──
  ["Trening zakończony", "Workout finished"],
  ["Trening zakończony ✓", "Workout finished ✓"],
  ["Rozgrzewka", "Warm-up"],
  ["▶ Wszystkie serie zrobione — zakończ trening", "▶ All sets done — finish the workout"],
  ["Z listy", "From the list"],
  ["Z prowadzeniem", "Guided"],
  ["Ciężar na kolejne tygodnie", "Weight for the coming weeks"],
  ["Wyjątek: „dobierz”", "Exception: “choose”"],
  ["Rwanie i zarzut bez maksa", "Snatch and clean & jerk without a max"],
  ["rób ćwiczenia z tej listy, w swoim tempie, i odhaczaj zrobione przyciskiem „OK” (albo „Za trudne” / „Za łatwe”, jeśli tak było). Ciężaru nie musisz wpisywać. Na koniec wybierz „Zakończ trening”.",
    "do the exercises from this list at your own pace and tick them off with “OK” (or “Too hard” / “Too easy” if that's how it went). You don't have to log the weight. At the end, choose “Finish workout”."],
  ["„▶ Prowadź mnie seria po serii” pokazuje każdą serię osobno, z przerwą. Nie musisz z niego korzystać — do listy wrócisz w każdej chwili.",
    "“▶ Guide me set by set” shows each set separately, with rest. You don't have to use it — you can go back to the list at any time."],
  ["tam ciężar wybierasz sam. Z pierwszej wpisanej serii policzę go na resztę planu.",
    "there you choose the weight yourself. I'll calculate it for the rest of the plan from the first set you log."],
  ["najpierw stopniowo dojdź do najcięższego powtórzenia, które jesteś w stanie zrobić dynamicznie i z zachowaniem dobrej techniki. Wpisz je — na jego podstawie będą policzone ciężary w reszcie planu.",
    "first build up gradually to the heaviest rep you can do explosively and with good technique. Enter it — it will be used to calculate the weights for the rest of the plan."],
  ["Przy rwaniu i zarzucie liczy się tylko ocena.", "For the snatch and clean & jerk, only the rating counts."],
  ["Ciężar", "Weight"],
  ["Seria", "Set"],
  ["Serie", "Sets"],
  ["Powt.", "Reps"],
  ["Czas", "Time"],
  ["przy masie ciała — liczba powtórzeń", "for bodyweight exercises — the number of reps"],
  ["przy ćwiczeniach na czas — czas utrzymania", "for timed exercises — the hold time"],
  ["Powtórzenia", "Reps"],
  ["powt.", "reps"],
  ["na stronę", "per side"],
  ["dobierz", "choose"],
  ["sprawdź maks", "test max"],
  ["1RM teraz", "Current 1RM"],
  ["masa ciała", "bodyweight"],
  ["czas", "time"],
  ["dystans", "distance"],
  ["guma", "band"],
  ["ręczne ustawienie", "set manually"],
  ["na czas", "for time"],
  ["asysta", "assisted"],
  ["na dystans", "for distance"],
  ["— brak 1RM", "— no 1RM"],
  ["— ustaw ręcznie", "— set manually"],
  ["Rozgrzewka rampą", "Warm-up ramp"],
  ["lekko", "light"],
  ["Serii rozgrzewkowych nie wpisujesz — zapis zaczyna się od TOP SETU.",
    "You don't log warm-up sets — logging starts with the TOP SET."],
  ["Serii rozgrzewkowych nie wpisujesz — wpisujesz dopiero serie robocze.",
    "You don't log warm-up sets — only the working sets."],
  ["Za trudne", "Too hard"],
  ["Za łatwe", "Too easy"],
  ["za trudne", "too hard"],
  ["za łatwe", "too easy"],
  ["Jeśli było OK — nic nie klikaj. Ocena idzie do trenera, serii roboczych nie zmienia.",
    "If it was OK — don't tap anything. The rating goes to your coach and doesn't change the working sets."],
  ["Inny ciężar niż w planie?", "Different weight than planned?"],
  ["▶ Tu jesteś", "▶ You are here"],
  ["✓ zrobione", "✓ done"],
  ["▶ Zacznij to ćwiczenie", "▶ Start this exercise"],
  ["Najpierw sprawdź swój maks", "First test your max"],
  ["Stopniowo zwiększaj ciężar, aż dojdziesz do najcięższego powtórzenia, które jesteś w stanie zrobić dynamicznie i z zachowaniem dobrej techniki. Wpisz ten ciężar — na jego podstawie będą policzone ciężary w reszcie planu.",
    "Increase the weight gradually until you reach the heaviest rep you can do explosively and with good technique. Enter that weight — it will be used to calculate the weights for the rest of the plan."],
  ["Stopniowo zwiększaj ciężar, aż dojdziesz do najcięższego powtórzenia, które jesteś w stanie zrobić dynamicznie i z zachowaniem dobrej techniki. Wpisz ten ciężar — powtórzenia: 1.",
    "Increase the weight gradually until you reach the heaviest rep you can do explosively and with good technique. Enter that weight — reps: 1."],
  ["Najpierw sprawdź swój maks — przy seriach tego ćwiczenia. Od niego policzę ciężar TOP SETU.",
    "First test your max — with this exercise's sets. I'll calculate the TOP SET weight from it."],
  ["Twój maks w kilogramach", "Your max in kilograms"],
  ["Zapisz maks", "Save max"],
  ["✓ Wynik zapisany — trener dostanie go do kolejnego cyklu.", "✓ Result saved — your coach will get it for the next cycle."],
  ["Rozgrzej się stopniowo, potem jedno powtórzenie na maksa (RPE 10).",
    "Warm up gradually, then one max rep (RPE 10)."],
  ["Wpisz ciężar, który udało się podnieść.", "Enter the weight you managed to lift."],
  ["✓ Seria zapisana — z niej policzę Twój ciężar.", "✓ Set saved — I'll calculate your weight from it."],
  ["Dopisz powtórzenia do serii — bez nich nie policzę ciężaru.",
    "Add the reps to the set — I can't calculate the weight without them."],
  ["Dopisz ciężar do serii — bez niego nie policzę reszty planu.",
    "Add the weight to the set — I can't calculate the rest of the plan without it."],
  ["Wpisz, co podniosłeś — z tej serii policzę Twoje ciężary na cały plan.",
    "Log what you lifted — I'll calculate your weights for the whole plan from this set."],
  ["Ciężar dobierasz sam — wpisz, z jakim robisz serie. Zostanie na kolejne tygodnie.",
    "You choose the weight yourself — enter the weight you use for your sets. It will carry over to the coming weeks."],
  // RPE
  ["Co to jest RPE?", "What is RPE?"],
  ["Uwaga trenera", "Coach's note"],
  ["RPE mówi, jak ciężka ma być seria. Najprościej liczyć, ile powtórzeń zostaje Ci w zapasie — ile jeszcze zrobiłbyś czysto, gdybyś nie przerwał.",
    "RPE tells you how hard a set should be. The easiest way is to count the reps you have left in reserve — how many more you could do cleanly if you didn't stop."],
  ["nic w zapasie — więcej się nie da", "nothing in reserve — you couldn't do another"],
  ["4 i więcej", "4 or more"],
  ["Połówki leżą pomiędzy: RPE 7,5 to 2–3 w zapasie.", "Halves sit in between: RPE 7.5 means 2–3 in reserve."],
  ["Przykład: „8 powt. · RPE 8” — ciężar, przy którym po ósmym powtórzeniu czujesz, że dwa kolejne jeszcze byś zrobił. Wyszło za lekko? Dołóż w następnej serii i wpisz ją — policzę od nowa.",
    "Example: “8 reps · RPE 8” — a weight where after the eighth rep you feel you could still do two more. Too light? Add weight on the next set and log it — I'll recalculate."],
  // oceny w panelu
  ["Za ciężko albo za lekko?", "Too heavy or too light?"],
  ["Oceniaj technikę i szybkość sztangi, nie zmęczenie.", "Rate technique and bar speed, not fatigue."],
  ["Plan dopiero się rozkręca", "The plan is just getting started"],
  ["Pierwsze tygodnie są celowo lżejsze. Z każdym tygodniem ciężar i wysiłek rosną — aż do ostatniego, najbardziej wymagającego tygodnia.",
    "The first weeks are deliberately lighter. Each week the weight and effort go up — all the way to the last, most demanding week."],
  ["„Za łatwe” podniesie ciężar we wszystkich kolejnych tygodniach. Wtedy najtrudniejszy tydzień może okazać się za ciężki.",
    "“Too easy” raises the weight in all the coming weeks. The hardest week may then turn out too heavy."],
  ["Jeśli zapasu było wyraźnie więcej — śmiało, oznacz. To Twój plan.",
    "If you clearly had more in reserve — go ahead and mark it. It's your plan."],
  ["Oznacz „za łatwe”", "Mark “too easy”"],
  ["Zostaw bez zmiany", "Leave unchanged"],
  // serie przy ćwiczeniu
  ["Wcześniej tutaj:", "Earlier here:"],
  ["✎ edytuj", "✎ edit"],
  ["Wpisz serie ręcznie", "Log sets manually"],
  ["Blade liczby to propozycja z poprzedniej serii — po serii dotknij ✓ albo popraw.",
    "The faded numbers are suggested from the previous set — after the set, tap ✓ or correct them."],
  ["Zrobione tak, jak stoi", "Done as shown"],
  ["✓ Pozostałe serie tak samo", "✓ Remaining sets the same"],
  // prowadzenie
  ["Wszystkie serie za Tobą", "All sets done"],
  ["✓ Ta seria jest już zrobiona — możesz ją poprawić.", "✓ This set is already done — you can correct it."],
  ["↩ Wróć do końca treningu", "↩ Back to the end of the workout"],
  ["↺ Cofnij — ta seria nie była zrobiona", "↺ Undo — this set wasn't done"],
  ["Cofnąć tę serię?", "Undo this set?"],
  ["Cofnij serię", "Undo set"],
  ["Zostaw", "Keep"],
  ["Jedno ciężkie powtórzenie przed pracą — sprawdzian dnia.", "One heavy rep before the work — today's check."],
  ["Dalej", "Next"],
  ["Zrobione", "Done"],
  ["Tego ćwiczenia nie ma już w planie.", "This exercise is no longer in the plan."],
  ["po Twojej ocenie", "after your rating"],
  ["Poprzednie serie:", "Previous sets:"],
  ["Wpisane serie:", "Logged sets:"],
  ["dotknij, by poprawić", "tap to correct"],
  ["Podniosłeś inny ciężar? Wpisz go — następną serię policzę od niego. Kolejne tygodnie zmienia ocena niżej.",
    "Lifted a different weight? Enter it — I'll calculate the next set from it. The rating below changes the coming weeks."],
  ["Podniosłeś inny ciężar? Wpisz go — od tej serii policzę resztę planu. Nie chcesz wpisywać? Wystarczy ocena niżej.",
    "Lifted a different weight? Enter it — I'll calculate the rest of the plan from this set. Don't want to type it? The rating below is enough."],
  ["Zapisz poprawkę", "Save correction"],
  ["Zakończ serię", "Finish set"],
  ["← poprzednia seria", "← previous set"],
  ["Cały dzień na liście", "Whole day as a list"],
  ["PRZERWA", "REST"],
  ["Pomiń przerwę", "Skip rest"],
  ["← wróć do ostatniej serii", "← back to the last set"],
  // serie maksymalne
  ["Jeszcze bez 1RM", "No 1RM yet"],
  ["Wpisz serię maksymalną albo zrób serię na treningu — policzę 1RM z niej.",
    "Enter a max set or do a set in your workout — I'll calculate the 1RM from it."],
  ["Twoje 1RM teraz:", "Your current 1RM:"],
  ["Ustawione przez trenera.", "Set by your coach."],
  ["ciężar", "weight"],
  ["1RM z serii", "1RM from set"],
  ["Zapisz serię", "Save set"],
  ["Usuń serię", "Delete set"],
  ["Usunąć serię maksymalną? Ćwiczenie zostanie bez 1RM, dopóki nie wpiszesz nowej serii albo nie zrobisz serii na treningu.",
    "Delete the max set? The exercise will have no 1RM until you enter a new set or do a set in your workout."],
  ["Niezapisane. „Zapisz” zastąpi 1RM z treningu — usunięcie serii je przywróci.",
    "Not saved. “Save” will replace the 1RM from your workout — deleting the set brings it back."],
  ["Niezapisane — plan zmieni się po „Zapisz”.", "Not saved — the plan will change after “Save”."],
  ["Zapisz", "Save"],
  // powody bez serii maksymalnej (z serwera)
  ["Ćwiczenie na masie ciała — nie ma czego zmierzyć ani dołożyć.", "Bodyweight exercise — nothing to measure or add."],
  ["Ćwiczenie na czas — liczy się utrzymanie pozycji, nie kilogramy.", "Timed exercise — holding the position counts, not kilograms."],
  ["Ćwiczenie na dystans — liczy się odległość, nie kilogramy.", "Distance exercise — the distance counts, not kilograms."],
  ["Ciężar do tego ćwiczenia ustala się wprost, nie z 1RM.", "The weight for this exercise is set directly, not from a 1RM."],
  ["Ćwiczenie z gumą — opór dobiera się gumą, nie kilogramami.", "Band exercise — resistance is chosen with the band, not kilograms."],
  // ekran główny — instalacja i komunikaty
  ["Dodaj tę stronę do ekranu głównego — otworzy się jak aplikacja, na pełnym ekranie i bez szukania linku.",
    "Add this page to your home screen — it will open like an app, full screen, with no hunting for the link."],
  ["W menu przeglądarki (⋮) wybierz „Dodaj do ekranu głównego”. Trening otworzy się jak aplikacja, bez szukania linku.",
    "In the browser menu (⋮) choose “Add to Home screen”. Your workouts will open like an app, with no hunting for the link."],
  ["Trening jest już na ekranie głównym — otwierasz go z ikony, jak aplikację.",
    "Your workouts are already on the home screen — open them from the icon, like an app."],
  ["Trener przygotowuje Twój plan. Ten link zostaje ten sam — otwórz go ponownie, gdy dostaniesz wiadomość.",
    "Your coach is preparing your plan. This link stays the same — open it again when you get a message."],
  ["Link nieaktualny", "Link expired"],
  ["Poproś trenera o nowy.", "Ask your coach for a new one."],
  ["Link nieaktualny. Poproś trenera o nowy.", "Link expired. Ask your coach for a new one."],
  ["Brak połączenia i nic zapisanego", "No connection and nothing saved"],
  ["Otwórz raz z zasięgiem.", "Open it once while online."],
  // odmowy serwera, które telefon pokazuje w pasku
  ["Trener zresetował plan — ten zapis jest sprzed resetu, więc go pominąłem.",
    "Your coach reset the plan — this entry is from before the reset, so I skipped it."],
  ["Ten plan już nie istnieje.", "This plan no longer exists."],
  ["Nie masz jeszcze aktywnego planu.", "You don't have an active plan yet."],
  ["Tego tygodnia nie ma w planie", "This week isn't in the plan"],
  ["Ten dzień nie ma w planie ćwiczeń", "This day has no exercises in the plan"],
  ["Przy tym ćwiczeniu nie ma już TOP SETU", "This exercise no longer has a TOP SET"],
  ["Tego ćwiczenia nie ma w tygodniu maksów", "This exercise isn't in the max week"],
  ["Nie ma takiego ćwiczenia", "No such exercise"],
  ["Nie ma takiego ćwiczenia w bazie", "No such exercise in the database"],
  ["Waga musi być z zakresu 20–400 kg", "Bodyweight must be between 20 and 400 kg"],
  ["Ciężar musi być z zakresu 0–1000 kg", "Weight must be between 0 and 1000 kg"],
  ["Ciężar TOP SETU musi być z zakresu 0–1000 kg.", "TOP SET weight must be between 0 and 1000 kg."],
  ["Ciężar serii maksymalnej musi być z zakresu 0–1000 kg.", "Max set weight must be between 0 and 1000 kg."],
  ["Powtórzenia (albo sekundy) muszą być z zakresu 0–600", "Reps (or seconds) must be between 0 and 600"],
  ["Numer tygodnia musi być z zakresu 1–6", "Week number must be between 1 and 6"],
  ["Dzień musi być z zakresu 1–5, a tydzień 1–6", "Day must be between 1 and 5, and week between 1 and 6"],
  // postęp (ekran schowany)
  ["Przez wszystkie cykle", "Across all cycles"],
  ["Gdy to samo ćwiczenie wróci w kolejnym cyklu, zobaczysz tu, jak zmienił się ciężar.",
    "When the same exercise comes back in the next cycle, you'll see here how the weight changed."],
  ["Szacowany ciężar maksymalny na wejściu w każdy cykl.", "Estimated max weight at the start of each cycle."],
  ["Frekwencja", "Attendance"],
  ["Waga ciała", "Bodyweight"],
  ["np. 78,5", "e.g. 78.5"],
  ["Dzisiejsza waga w kg", "Today's weight in kg"],
  ["Wpisz wagę w kilogramach, np. 78,5.", "Enter your weight in kilograms, e.g. 78.5."],
  ["Wpisz swoją dzisiejszą wagę — najlepiej zmierzoną rano, po przebudzeniu.",
    "Enter today's weight — ideally measured in the morning, right after waking up."],
  ["Ciężary na ćwiczeniach", "Weights on exercises"],
  ["Wpisuj przy ćwiczeniach, ile faktycznie podniosłeś — tutaj zobaczysz, jak to rośnie.",
    "Log what you actually lifted on each exercise — you'll see it grow here."],
  ["Na razie wpisy z jednego tygodnia — zmianę zobaczysz po kolejnym",
    "Entries from one week so far — you'll see the change after the next one"],
  ["Liczą się tygodnie z wpisanym ciężarem i powtórzeniami — sama ocena ich nie ma.",
    "Only weeks with logged weight and reps count — a rating alone doesn't."],
  // bieg
  ["Biegnij czas, nie kilometry — dystans to szacunek. Tempo jest celem, tętno podajemy tylko orientacyjnie. Jeśli na biegu spokojnym nie da się mówić pełnym zdaniem, zwolnij niezależnie od zegarka. Tydzień 4 jest celowo lżejszy.",
    "Run for time, not kilometres — distance is an estimate. Pace is the target; heart rate is only a guide. If you can't speak in full sentences on an easy run, slow down whatever your watch says. Week 4 is deliberately lighter."],
  ["Bieg spokojny", "Easy run"],
  ["Bieg progowy", "Threshold run"],
  ["Długie wybieganie", "Long run"],
  ["Interwały", "Intervals"],
  ["Bieg spokojny z przebieżkami", "Easy run with strides"],
  ["na odcinkach", "on the intervals"],
  ["między przebieżkami 1 min marszu albo truchtu", "between strides, 1 min of walking or jogging"],
  // oddech
  ["Trening oddechowy", "Breathing training"],
  ["Protokół oddechowy prowadzony równolegle do planu siłowego.", "A breathing protocol run alongside your strength plan."],
  ["Praca", "Work"],
  ["Wyciszenie", "Cool-down"],
  ["Bardzo niski", "Very low"],
  ["Niski", "Low"],
  ["Średni", "Medium"],
  ["Dobry", "Good"],
  ["Wysoki", "High"],
  ["Wersja łagodna — ustal indywidualnie", "Gentle version — set individually"],
  ["bez bezdechów", "no breath holds"],
  ["Wynik poniżej 10 s. Zacznij od samego oddechu nosowego w spoczynku; bezdechy dopiero po wzroście TWOT.",
    "Score below 10 s. Start with nasal breathing at rest only; breath holds only after your TWOT improves."],
  ["Dozwolone tylko krótkie zatrzymania w marszu, do 40% TWOT. Jeśli po serii łapiesz oddech ustami — skróć zatrzymanie.",
    "Only short holds while walking, up to 40% of TWOT. If you gasp through your mouth after a set — shorten the hold."],
  ["Bezdechy tylko marszowe, do 50% TWOT. Maksymalne zatrzymania odblokowują się dopiero od TWOT ≥ 25 s.",
    "Breath holds only while walking, up to 50% of TWOT. Maximal holds unlock only from TWOT ≥ 25 s."],
  ["Pełne bezdechy odblokowane. Nigdy w wodzie ani za kierownicą.", "Full breath holds unlocked. Never in water or while driving."],
  ["Pełny zakres. Przerwij przy zawrotach głowy, bólu w klatce, mrowieniu lub narastającym lęku.",
    "Full range. Stop if you feel dizzy, chest pain, tingling or growing anxiety."],
  ["Zaznaczyłeś przeciwwskazanie — nie realizuj tej drabiny samodzielnie. Ustal ćwiczenie indywidualnie.",
    "You've marked a contraindication — don't follow this progression on your own. Set up the exercise individually."],
  ["Bezdech w marszu", "Walking breath hold"],
  ["Przerwa", "Rest"],
  ["Kadencja 4–6", "4–6 cadence"],
  ["siedź prosto, rozluźnij barki i szczękę. Oddychaj cicho nosem i subtelnie zmniejsz objętość oddechu — bez wstrzymywania. Głód powietrza ma być tolerowalny.",
    "sit upright, relax your shoulders and jaw. Breathe quietly through your nose and gently reduce your breathing volume — without holding your breath. The air hunger should be tolerable."],
  ["wydech, zatkaj nos, idź spokojnym krokiem przez zaplanowany czas. Puść nos i wróć do oddechu nosowego. Jeśli po 2–3 oddechach nie wracasz do spokoju, zatrzymanie było za długie.",
    "breathe out, pinch your nose, walk calmly for the planned time. Release your nose and return to nasal breathing. If you don't calm down within 2–3 breaths, the hold was too long."],
  ["minimum 60 s między powtórzeniami.", "at least 60 s between reps."],
  ["wdech na 4, wydech na 6, przez nos, bez napięcia.", "inhale for 4, exhale for 6, through the nose, without strain."],
  ["Przerwij, gdy:", "Stop if:"],
  ["Zawroty głowy, ból w klatce, mrowienie, narastający lęk, oddech tracący płynność.",
    "Dizziness, chest pain, tingling, growing anxiety, breathing losing its rhythm."],
  ["Nigdy w wodzie ani w jej pobliżu.", "Never in or near water."],
  ["Nigdy za kierownicą.", "Never while driving."],
  ["Jak zmierzyć TWOT?", "How to measure TWOT?"],
  ["Kiedy powtórzyć test?", "When to repeat the test?"],
  ["Odpocznij 10 minut. Najlepiej rano, przed kawą i wysiłkiem.", "Rest for 10 minutes. Ideally in the morning, before coffee and exercise."],
  ["Usiądź. Zwykły, niepogłębiony wdech i wydech przez nos.", "Sit down. A normal, not deepened breath in and out through the nose."],
  ["Po wydechu zatkaj nos i uruchom stoper.", "After breathing out, pinch your nose and start a stopwatch."],
  ["Zatrzymaj pomiar przy pierwszej wyraźnej potrzebie wdechu. Nie walcz o wynik.",
    "Stop at the first clear urge to breathe in. Don't fight for a score."],
  ["Puść nos i spokojnie zaczerpnij powietrza nosem. Jeśli musisz nasilić oddychanie, test trwał za długo.",
    "Release your nose and calmly breathe in through it. If you need to breathe harder, the test went on too long."],
  ["Opisuje pośrednio wrażliwość na CO₂ i skłonność do zadyszki.", "It indirectly reflects your CO₂ sensitivity and tendency to get breathless."],
  ["Nie mierzy saturacji, pojemności płuc ani wydolności tlenowej.", "It doesn't measure oxygen saturation, lung capacity or aerobic fitness."],
  ["Powtarzalność wyniku jest umiarkowana — patrz na trend z kilku pomiarów, nie na pojedynczy odczyt.",
    "The score is only moderately repeatable — look at the trend over several measurements, not a single reading."],
  ["Dowody na przełożenie na wyniki sportowe są ograniczone. Traktuj to jako dodatek, nie miernik formy.",
    "Evidence for transfer to sports performance is limited. Treat it as an add-on, not a measure of fitness."],
  ["Mierz TWOT rano w pierwszym dniu tygodnia 1, 3 i 5 oraz na koniec cyklu.",
    "Measure TWOT in the morning on the first day of weeks 1, 3 and 5, and at the end of the cycle."],
  ["Nowy wynik przekaż trenerowi — dawka przeliczy się sama.", "Pass your new score to your coach — the dose will recalculate automatically."],
  ["Dobra odpowiedź to wzrost o 3–5 s na 2 tygodnie.", "A good response is an increase of 3–5 s every 2 weeks."],
  ["Brak zmiany przez 4 tygodnie: wróć do samego oddechu nosowego w ciągu dnia zamiast dokładać bezdechy.",
    "No change for 4 weeks: go back to just nasal breathing during the day instead of adding breath holds."],
  // karta ćwiczenia z filmem
  ["▶ film", "▶ video"],
  ["Zamknij kartę ćwiczenia", "Close exercise card"],
  ["Nagrania", "Recordings"],
  ["Otwórz na YouTube ↗", "Open on YouTube ↗"],
  ["Otwórz u źródła ↗", "Open at source ↗"],
  ["Otwórz film na YouTube ↗", "Open the video on YouTube ↗"],
  ["wybrany przez trenera", "chosen by your coach"],
  ["własne", "own"],
  ["Główne mięśnie", "Main muscles"],
  ["Mięśnie pomocnicze", "Secondary muscles"],
  ["Sprzęt", "Equipment"],
  ["Kategoria", "Category"],
  ["Wzorzec ruchu", "Movement pattern"],
  ["Film wymaga internetu. Trening działa dalej bez niego — wpisane liczby się nie zgubią.",
    "The video needs internet. Your workout keeps working without it — logged numbers won't be lost."],
  ["Nie udało się wczytać filmu.", "Couldn't load the video."],
  ["nie udało się wczytać odtwarzacza YouTube", "the YouTube player couldn't load"],
  ["odtwarzacz YouTube nie odpowiada", "the YouTube player isn't responding"],
  ["nieprawidłowy identyfikator filmu", "invalid video ID"],
  ["przeglądarka nie odtworzy tego filmu", "this browser can't play the video"],
  ["film usunięty albo prywatny", "the video was removed or is private"],
  ["właściciel nie pozwala odtwarzać filmu poza YouTube", "the owner doesn't allow playback outside YouTube"],
  ["YouTube nie dostał adresu strony (Referer)", "YouTube didn't receive the page address (Referer)"],
  // rodzaj, sprzęt i mięśnie z bibliotek
  ["trening siłowy", "strength training"],
  ["kompleks", "complex"],
  ["oddech", "breathing"],
  ["dwubój olimpijski", "Olympic weightlifting"],
  ["kondycja", "conditioning"],
  ["mobilność", "mobility"],
  ["rozciąganie", "stretching"],
  ["plyometria", "plyometrics"],
  ["sztanga", "barbell"],
  ["ławka pozioma", "flat bench"],
  ["hantle", "dumbbells"],
  ["ławka", "bench"],
  ["ściana", "wall"],
  ["talerz", "plate"],
  ["wyciąg", "cable"],
  ["skrzynia", "box"],
  ["roller", "foam roller"],
  ["drążek", "pull-up bar"],
  ["piłka lekarska", "medicine ball"],
  ["lina", "rope"],
  ["kółka", "rings"],
  ["maszyna", "machine"],
  ["piłka gimnastyczna", "exercise ball"],
  ["sanie", "sled"],
  ["kamizelka", "weighted vest"],
  ["gryf łamany", "EZ bar"],
  ["mięsień piersiowy większy", "pectoralis major"],
  ["przednia część mięśnia naramiennego", "anterior deltoid"],
]);

const RZYMSKIE = "I|II|III|IV|V";
/** Co zmienia ocena — w zdaniach pod przyciskami oceny. */
const CO_ZMIENIA_OCENA = { "ciężar": "weight", "powtórzenia": "reps", "czas": "time" };
/** „1 workout”, „3 workouts”. */
const liczbaMnoga = (n, jeden, wiele) => `${n} ${Number(n) === 1 ? jeden : wiele}`;
/** „o 5%” → „5%”, „o 2,5 kg” → „2.5 kg”. */
const oIle = (t) => t.replace(/^o /, "");

/**
 * Zdania z liczbami i nazwami — wzór na cały napis. Zamiana to tekst
 * z `$1…` albo funkcja dostająca grupy; `t` tłumaczy wstawione kawałki
 * (nazwę dnia, ocenę, opis serii).
 */
const WZORY = [
  [/^(\d+) wpisów nie zostało zapisanych — trener zmienił plan\.$/, "$1 entries weren't saved — your coach changed the plan."],
  [/^(\d+) do ustalenia$/, "$1 to set"],
  [/^W (\d+) ćwiczeniach nie znam jeszcze Twoich ciężarów\. Wybierz, jak je ustalić\.$/,
    "I don't know your weights for $1 exercises yet. Choose how to set them."],
  [/^Cykl (\d+)$/, "Cycle $1"],
  [/^(\d+) z (\d+) treningów za Tobą$/, "$1 of $2 workouts done"],
  [/^Sześć tygodni, (\d+) treningów(?:, (\d+) zapisanych serii)?\. Trener widzi, że skończyłeś, i przygotuje kolejny cykl — ten sam link pokaże go, gdy będzie gotowy\.$/,
    (_, n, serie) => `Six weeks, ${n} workouts${serie ? `, ${serie} sets logged` : ""}. Your coach can see you've finished `
      + "and will prepare the next cycle — the same link will show it when it's ready."],
  [/^(\d+) cykle$/, "$1 cycles"],
  [/^(\d+) (miesiąc|miesięcy)$/, (_, n) => liczbaMnoga(n, "month", "months")],
  [/^(\d+) z (\d+) treningów$/, "$1 of $2 workouts"],
  [/^(\d+) z (\d+) (treningu|treningów)$/, (_, a, b) => `${a} of ${liczbaMnoga(b, "workout", "workouts")}`],
  [/^(\d+) z (\d+) wyników wpisanych$/, "$1 of $2 results logged"],
  [/^(\d+) z (\d+) ćwiczeń zaczętych$/, "$1 of $2 exercises started"],
  [/^(\d+) (ćwiczenie|ćwiczenia|ćwiczeń)$/, (_, n) => liczbaMnoga(n, "exercise", "exercises")],
  [/^(\d+) (bój|boje|bojów)$/, (_, n) => liczbaMnoga(n, "lift", "lifts")],
  [/^Tydzień (\d+) z (\d+)( · deload| · maksy)?$/, (_, a, b, r) => `Week ${a} of ${b}${r ? ` · ${r === " · maksy" ? "max test" : "deload"}` : ""}`],
  [/^Tydzień (\d+)( · deload| · maksy)?$/, (_, a, r) => `Week ${a}${r ? ` · ${r === " · maksy" ? "max test" : "deload"}` : ""}`],
  [/^z (\d+)$/, "of $1"],
  [new RegExp(`^Dzień (${RZYMSKIE})$`), "Day $1"],
  [new RegExp(`^(Dzień (?:${RZYMSKIE})|Dzień maksów) · tydzień (\\d+)$`), (_, d, n, t) => `${t(d)} · week ${n}`],
  [/^✓ Zapisano: (.+) kg · dziś$/, "✓ Saved: $1 kg · today"],
  [/^(Ciężar|1RM ≈) (.+) kg — bez zmiany$/, (_, co, kg) => `${co === "Ciężar" ? "Weight" : co} ${kg} kg — no change`],
  [/^(Ciężar|1RM ≈) (.+ → .+ kg.*)$/, (_, co, reszta) => `${co === "Ciężar" ? "Weight" : co} ${reszta}`],
  // bieg
  [/^Bieg · tydzień (\d+)( \(lżejszy\))?$/, (_, n, l) => `Running · week ${n}${l ? " (lighter)" : ""}`],
  [/^(\d+) (bieg|biegi|biegów)$/, (_, n) => liczbaMnoga(n, "run", "runs")],
  [/^([\d.,]+) min rozgrzewki — spokojnie$/, "$1 min warm-up — easy"],
  [/^(\d+) × (\d+) min w tempie (interwałowym|progowym)$/,
    (_, a, b, t) => `${a} × ${b} min at ${t === "interwałowym" ? "interval" : "threshold"} pace`],
  [/^po każdym odcinku (\d+) min truchtu$/, "after each interval, $1 min of jogging"],
  [/^([\d.,]+) min schłodzenia — spokojnie$/, "$1 min cool-down — easy"],
  [/^(\d+) min spokojnie(, równym tempem)?$/, (_, n, r) => `${n} min easy${r ? ", at an even pace" : ""}`],
  [/^na koniec (\d+) × (\d+) s przebieżki — szybko, ale luźno, bez sprintu$/,
    "finish with $1 × $2 s strides — fast but relaxed, no sprinting"],
  [/^rozgrzewka, trucht i schłodzenie: (.+) \/km$/, "warm-up, jogging and cool-down: $1 /km"],
  [/^tętno orientacyjnie (\d+)–(\d+)$/, "heart rate approx. $1–$2"],
  // oddech
  [/^(\d+)× w tygodniu · (\d+) min$/, "$1× a week · $2 min"],
  [/^Poziom: (.+?)(?: · Twój wynik TWOT: (.+) s)?$/, (_, p, w, t) => `Level: ${t(p)}${w ? ` · Your TWOT score: ${w} s` : ""}`],
  [/^(\d+) min (ciągłego )?Breathe Light, głód powietrza (.+)\/10$/,
    (_, n, c, g) => `${n} min of ${c ? "continuous " : ""}Breathe Light, air hunger ${g}/10`],
  [/^(\d+) min oddech swobodny nosem, kadencja 4–6$/, "$1 min relaxed nasal breathing, 4–6 cadence"],
  [/^(\d+) min kadencja 4–6 nosem$/, "$1 min 4–6 cadence through the nose"],
  [/^(\d+) × bezdech (\S+)% TWOT( \(≈ \d+ s\))? w (marszu|truchcie)(, przerwa (\d+) s| \+ (\d+) × (maksymalna|maks\.) liczba kroków)?$/,
    (_, n, p, ok, gdzie, ogon, przerwa, ile) => `${n} × breath hold at ${p}% of TWOT${ok ?? ""} while ${gdzie === "marszu" ? "walking" : "jogging"}`
      + (przerwa ? `, ${przerwa} s rest` : ile ? ` + ${ile} × max number of steps` : "")],
  // RPE i dobór
  [/^Weź taki ciężar, żeby (\d+)\. powtórzenie było ostatnim, jakie zrobisz czysto\.$/,
    "Pick a weight where rep $1 is the last one you can do cleanly."],
  [/^Weź taki ciężar, żeby po (\d+)\. powtórzeniu mieć jeszcze (\S+) w zapasie\.$/,
    "Pick a weight where after rep $1 you still have $2 in reserve."],
  [/^(\d) w zapasie$/, "$1 in reserve"],
  [/^✓ Reszta planu liczona od Twojej serii: (.+) kg × (\d+)$/, "✓ Rest of the plan calculated from your set: $1 kg × $2"],
  [/^✓ Policzone z Twojej serii: (.+) kg × (\d+) przy RPE (.+)$/, "✓ Calculated from your set: $1 kg × $2 at RPE $3"],
  [/^✓ Zapisane: (.+) kg\. Ciężary policzę, gdy wróci zasięg\.$/, "✓ Saved: $1 kg. I'll calculate the weights when you're back online."],
  [/^Twoje obecne 1RM to (.+) kg — jeśli idzie lekko, dołóż\.$/, "Your current 1RM is $1 kg — if it moves easily, add weight."],
  // trening
  [/^▶ Wróć do treningu — (.+)$/, (_, o, t) => `▶ Back to the workout — ${t(o)}`],
  [/^zrobiłeś inny ciężar niż w planie\? Wpisz go — od tej serii policzę resztę planu\. Nie chcesz wpisywać\? Wystarczy ocena: „Za trudne” — lżej, „Za łatwe” — ciężej(?: \((.+?)\))?\.(.*)$/,
    (_, co, reszta, t) => "lifted a different weight than planned? Enter it — I'll calculate the rest of the plan from this set. "
      + "Don't want to type it? A rating is enough: “Too hard” — lighter, “Too easy” — heavier"
      + `${co ? ` (${co.split(", ").map(t).join(", ")})` : ""}.${reszta.trim() ? ` ${t(reszta.trim())}` : ""}`],
  [/^(Dalej) (TOP SET|pierwsza seria robocza) — (.+) kg\.$/,
    (_, d, co, kg) => `Then the ${co === "TOP SET" ? "TOP SET" : "first working set"} — ${kg} kg.`],
  [/^Procenty liczysz od ciężaru (TOP SETU|pierwszej serii roboczej), który dobierasz\.( Wpisz go w pole niżej — pokażę rampę w kilogramach\.)?$/,
    (_, co, pole) => `Percentages are of the ${co === "TOP SETU" ? "TOP SET" : "first working set"} weight you choose.`
      + (pole ? " Enter it in the field below — I'll show the ramp in kilograms." : "")],
  [/^lekko × (\S+)$/, "light × $1"],
  [/^TOP SET · (.+)$/, (_, o, t) => `TOP SET · ${t(o)}`],
  [/^1 powtórzenie · (.+)$/, "1 rep · $1"],
  [/^▶ Tu jesteś · seria (\d+) z (\d+)$/, "▶ You are here · set $1 of $2"],
  [/^◐ zaczęte · (\d+) z (\d+) serii$/, "◐ started · $1 of $2 sets"],
  [/^jak w T(\d+)$/, "as in W$1"],
  [/^(\d+) powt\.$/, "$1 reps"],
  [/^Ostatnio \((poprzedni cykl, )?T(\d+)\): (.+)$/,
    (_, cykl, n, serie, t) => `Last time (${cykl ? "previous cycle, " : ""}W${n}): ${t(serie)}`],
  [/^Jeśli jest OK — nic nie klikaj\. Jeśli nie, dopasuję następną serię i (ciężar|powtórzenia|czas) w kolejnych tygodniach\.$/,
    (_, co) => `If it's OK — don't tap anything. If not, I'll adjust the next set and the ${CO_ZMIENIA_OCENA[co]} in the coming weeks.`],
  [/^Ocena z serii (\d+) \(„(.+)”\) zostaje dla kolejnych tygodni\. Kliknij, tylko jeśli ostatnia seria była inna\.$/,
    (_, n, o, t) => `The rating from set ${n} (“${t(o)}”) stays for the coming weeks. Tap only if the last set was different.`],
  [/^Jeśli było OK — nic nie klikaj\. Ocena zmienia (ciężar|powtórzenia|czas) w kolejnych tygodniach\.$/,
    (_, co) => `If it was OK — don't tap anything. The rating changes the ${CO_ZMIENIA_OCENA[co]} in the coming weeks.`],
  [/^Następna seria: (.+) kg( × \d+)? \((lżej|ciężej) (o .+)\)\.$/,
    (_, kg, x, k, o) => `Next set: ${kg} kg${x ?? ""} (${oIle(o)} ${k === "lżej" ? "lighter" : "heavier"}).`],
  [/^Następna seria: (\d+) powt\. \(o 1 (mniej|więcej)\)\.$/,
    (_, n, k) => `Next set: ${n} reps (1 ${k === "mniej" ? "fewer" : "more"}).`],
  // Ćwiczenia na czas (27.10.2026).
  [/^Następna seria: (\d+) s \(o (\d+) s (krócej|dłużej)\)\.$/,
    (_, n, o, k) => `Next set: ${n} s (${o} s ${k === "krócej" ? "shorter" : "longer"}).`],
  [/^O (\d+) s (krócej|dłużej) po Twojej ocenie „(za trudne|za łatwe)”: (\d+) s\.$/,
    (_, o, k, ocena, n, t) => `${o} s ${k === "krócej" ? "shorter" : "longer"} after your “${t(ocena)}” rating: ${n} s.`],
  [/^Blade liczby to propozycja: (\d+) s — o (\d+) s (krócej|dłużej) po Twojej ocenie\. Po serii dotknij ✓ albo popraw\.$/,
    (_, n, o, k) => `The faded numbers are a suggestion: ${n} s — ${o} s ${k === "krócej" ? "shorter" : "longer"} after your rating. `
      + "After the set, tap ✓ or correct them."],
  [/^Seria (\d+): powtórzenia \(albo sekundy\) muszą być z zakresu 0–600$/, "Set $1: reps (or seconds) must be between 0 and 600"],
  [/^Seria (\d+): ciężar musi być z zakresu 0–1000 kg$/, "Set $1: weight must be between 0 and 1000 kg"],
  [/^W tym tygodniu celujemy w RPE (\S+), czyli (\S+) (powtórzenie|powtórzenia|powtórzeń) w zapasie\. Jeśli tyle mniej więcej Ci zostało, ćwiczenie jest dokładnie takie, jakie ma być\.$/,
    (_, rpe, z) => `This week we're aiming for RPE ${rpe}, i.e. ${z} ${z === "1" ? "rep" : "reps"} in reserve. `
      + "If that's roughly what you had left, the exercise is exactly as it should be."],
  [/^Zrobione: (.+)$/, (_, s, t) => `Done: ${t(s)}`],
  [/^([\d\s,.×kg]+) (za trudne|za łatwe|OK)$/, (_, s, o, t) => `${t(s)} ${t(o)}`],
  [/^Blade liczby to propozycja: (.+) kg( × \d+ \(powtórzenia z planu\))? — (lżej|ciężej) (o .+) po Twojej ocenie\. Po serii dotknij ✓ albo popraw\.$/,
    (_, kg, plan, k, o) => `The faded numbers are a suggestion: ${kg} kg${plan ? plan.replace("(powtórzenia z planu)", "(planned reps)") : ""} — `
      + `${oIle(o)} ${k === "lżej" ? "lighter" : "heavier"} after your rating. After the set, tap ✓ or correct them.`],
  [/^Blade liczby to propozycja: (.+) kg × (\d+) — tyle powtórzeń, ile w planie, z ciężarem o tym samym wysiłku co Twoja seria\. Po serii dotknij ✓ albo popraw\.$/,
    "The faded numbers are a suggestion: $1 kg × $2 — the planned reps, with a weight of the same effort as your set. After the set, tap ✓ or correct them."],
  [/^Blade liczby to propozycja: (\d+) powt\. — o 1 (mniej|więcej) po Twojej ocenie\. Po serii dotknij ✓ albo popraw\.$/,
    (_, n, k) => `The faded numbers are a suggestion: ${n} reps — 1 ${k === "mniej" ? "fewer" : "more"} after your rating. After the set, tap ✓ or correct them.`],
  [/^Seria (\d+) zrobiona tak, jak stoi$/, "Set $1 done as shown"],
  [/^Seria (\d+) z (\d+) · zrobione (\d+)$/, "Set $1 of $2 · done $3"],
  [/^(.+) — zrobione (\d+) z (\d+)$/, (_, n, a, b, t) => `${t(n)} — done ${a} of ${b}`],
  [/^↩ Wróć do: (.+)$/, (_, o, t) => `↩ Back to: ${t(o)}`],
  [/^Seria wróci do niezrobionych(?:, a (.+) — znikną)?\.$/,
    (_, co, t) => `The set goes back to not done${co ? `, and ${co.split(" i ").map(t).join(" and ")} will be removed` : ""}.`],
  [/^wpisane (.+)$/, (_, s, t) => `logged ${t(s)}`],
  [/^ciężar (.+) kg$/, "weight $1 kg"],
  [/^ocena „(.+)”$/, (_, o, t) => `rating “${t(o)}”`],
  [/^(.*) · seria (\d+) z (\d+)$/, (_, c, a, b) => `${c} · set ${a} of ${b}`],
  [/^superseria (\S+)$/, "superset $1"],
  [/^w planie (.+)$/, "planned $1"],
  [/^na (\d+) powt\.$/, "for $1 reps"],
  [/^jak w serii (\d+)$/, "as in set $1"],
  [/^Seria (\d+): (.+?) — (na ekranie|popraw)$/, (_, n, s, gdzie, t) => `Set ${n}: ${t(s)} — ${gdzie === "popraw" ? "edit" : "on screen"}`],
  [/^(\d+): (.+)$/, (_, n, s, t) => `${n}: ${t(s)}`],
  [/^(Lżej|Ciężej) (o .+) po Twojej ocenie „(za trudne|za łatwe)”: (.+) kg\.$/,
    (_, k, o, ocena, kg, t) => `${oIle(o)} ${k === "Lżej" ? "lighter" : "heavier"} after your “${t(ocena)}” rating: ${kg} kg.`],
  [/^Na (\d+) powtórzeń z planu: (.+) kg — tyle samo wysiłku co Twoja seria (\d+) \((.+) kg × (\d+)\)\.$/,
    "For the planned $1 reps: $2 kg — the same effort as your set $3 ($4 kg × $5)."],
  [/^O 1 powtórzenie (mniej|więcej) po Twojej ocenie „(za trudne|za łatwe)”: (\d+) powt\.$/,
    (_, k, o, n, t) => `1 rep ${k === "mniej" ? "fewer" : "more"} after your “${t(o)}” rating: ${n} reps.`],
  [/^Dalej: (.+)$/, (_, o, t) => `Next: ${t(o)}`],
  [/^Zapisanych serii: (\d+)\.( Ćwiczenia bez oceny \((\d+)\) zapiszą się jako „OK"\.)?$/,
    (_, n, b, ile) => `Sets logged: ${n}.${b ? ` Exercises without a rating (${ile}) will be saved as “OK”.` : ""}`],
  // serie maksymalne
  [/^Jedna seria do odmowy, przy dobrej technice\. Najwyżej (\d+) powtórzeń — jeśli wychodzi więcej, dołóż kilogramów i spróbuj ponownie\. Seria liczy się dopiero po „Zapisz”\.$/,
    "One set to failure, with good technique. At most $1 reps — if you get more, add weight and try again. The set only counts after “Save”."],
  [/^Policzone z Twojej serii na treningu: (.+) kg × (\d+) przy RPE (.+)\.$/, "Calculated from your workout set: $1 kg × $2 at RPE $3."],
  [/^Z serii maksymalnej: (.+) kg × (\d+)\.( Zastąpiła 1RM z treningu \((.+) kg\) — po usunięciu serii wróci\.)?$/,
    (_, kg, n, z, rm) => `From your max set: ${kg} kg × ${n}.${z ? ` It replaced the 1RM from your workout (${rm} kg) — it comes back if you delete the set.` : ""}`],
  [/^Najwyżej (\d+) powtórzeń — przy większej liczbie dołóż kilogramów\.$/, "At most $1 reps — if you get more, add weight."],
  [/^Najwyżej (\d+) powtórzeń — dołóż kilogramów\.$/, "At most $1 reps — add weight."],
  [/^Usuń serię — wróci 1RM z treningu \((.+) kg\)$/, "Delete set — the 1RM from your workout ($1 kg) comes back"],
  [/^Serię maksymalną liczymy do (\d+) powtórzeń — przy większej liczbie nie ma z czego wyliczyć ciężaru\. Dołóż kilogramów tak, żeby zmieścić się w (\d+)\.$/,
    "Max sets are counted up to $1 reps — above that there's nothing to calculate the weight from. Add weight so you stay within $2."],
  // instalacja i komunikaty
  [/^Dotknij ikony udostępniania (u góry|na dole) \(kwadrat ze strzałką\), potem „Do ekranu początkowego”\. Trening otworzy się jak aplikacja, bez szukania linku\.$/,
    (_, gdzie) => `Tap the share icon ${gdzie === "u góry" ? "at the top" : "at the bottom"} (the square with an arrow), then “Add to Home Screen”. `
      + "Your workouts will open like an app, with no hunting for the link."],
  [/^Cześć (.+)!$/, "Hi $1!"],
  // karta ćwiczenia
  [/^Film: (.+?)(?: \/ (.+))?$/, (_, z, p, t) => `Video: ${t(z)}${p ? ` / ${t(p)}` : ""}`],
  [/^(Pokaz|Poradnik)( \d+)?( · .+)?$/, (_, r, n, czas) => `${r === "Pokaz" ? "Demo" : "Tutorial"}${n ?? ""}${czas ?? ""}`],
  [/^Tego filmu nie da się odtworzyć w aplikacji: (.+)\.$/, (_, p, t) => `This video can't be played in the app: ${t(p)}.`],
  [/^błąd YouTube (\S+)$/, "YouTube error $1"],
];

const POLSKIE_LITERY = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
const POLSKIE_SLOWA = /(^|[\s(„])(i|w|z|na|nie|się|po|od|dla|przy|bez|albo|lub|jak|czy|gdy|że|tak|jest|są|powt\.|tydzień|seria|serii|dzień|trening|dobierz|zapas\w*)(?=$|[\s.,:;!?”)])/;

/** Tekst, który wygląda na polski — tylko taki bez tłumaczenia jest brakiem; nazwy ćwiczeń i liczby nie. */
export const wygladaPoPolsku = (t) => POLSKIE_LITERY.test(t) || POLSKIE_SLOWA.test(t);

/** Przecinek dziesiętny po angielsku: „62,5” → „62.5”. */
const kropki = (t) => t.replace(/(\d),(\d)/g, "$1.$2");

/**
 * Tłumaczenie napisu bez białych znaków na brzegach — albo `null`, gdy
 * słownik go nie zna, a wygląda na polski.
 */
function tlumacz(n) {
  if (SLOWNIK.has(n)) return SLOWNIK.get(n);
  const t = (x) => tlumacz(x) ?? x;
  for (const [wzor, zamiana] of WZORY) {
    const m = wzor.exec(n);
    if (m) return kropki(typeof zamiana === "function" ? zamiana(...m, t) : n.replace(wzor, zamiana));
  }
  // Złożone z kawałków, które słownik zna: „Bezdech w marszu:”, „— rób ćwiczenia…”,
  // „hantle, guma”, „Dzień I · tydzień 2 · …”, kilka zdań jedno po drugim.
  const dwukropek = /^(.+):$/.exec(n);
  if (dwukropek) {
    const r = tlumacz(dwukropek[1]);
    if (r !== null) return `${r}:`;
  }
  const mysnik = /^— (.+)$/.exec(n);
  if (mysnik) {
    const r = tlumacz(mysnik[1]);
    if (r !== null) return `— ${r}`;
  }
  for (const separator of [" · ", ", "]) {
    if (!n.includes(separator)) continue;
    const czesci = n.split(separator).map(tlumacz);
    if (czesci.every((c) => c !== null)) return czesci.join(separator);
  }
  const zdania = n.split(/(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„])/);
  if (zdania.length > 1) {
    const czesci = zdania.map(tlumacz);
    if (czesci.every((c) => c !== null)) return czesci.join(" ");
  }
  return wygladaPoPolsku(n) ? null : kropki(n);
}

/**
 * Napis po angielsku z zachowanymi białymi znakami na brzegach („ z 3” → „ of 3”),
 * albo `null`, gdy nie ma tłumaczenia.
 */
export function poAngielsku(tekst) {
  const [, przed, srodek, po] = /^(\s*)([\s\S]*?)(\s*)$/.exec(tekst);
  if (!srodek) return tekst;
  const en = tlumacz(srodek.replace(/\s+/g, " "));
  return en === null ? null : przed + en + po;
}

const ATRYBUTY = ["placeholder", "aria-label", "title"];
/** Napisy, które już są po angielsku (wpisane przez nas) — drugi raz ich nie tłumaczymy. */
const gotowe = new Set();

function przetworz(tekst, zglos, zmien) {
  if (!tekst || gotowe.has(tekst) || !/\p{L}|\d,\d/u.test(tekst)) return;
  const en = poAngielsku(tekst);
  // Audyt: brak tłumaczenia — i osobno napis, który zostaje bez zmian (nazwa
  // ćwiczenia, imię, liczby… albo polskie słowo, którego słownik nie zna).
  if (en === null || en === tekst) zglos?.(tekst.replace(/\s+/g, " ").trim(), en === null ? "brak" : "bez zmian");
  if (en === null) return;
  if (zmien && en !== tekst) {
    gotowe.add(en);
    zmien(en);
  }
}

/** Imię klienta (`translate="no"`), skrypty i style zostają, jak są. */
const nieTlumacz = (e) => !e || ["SCRIPT", "STYLE"].includes(e.nodeName) || Boolean(e.closest?.('[translate="no"]'));

function przejdz(wezel, zglos, zmieniaj) {
  if (wezel.nodeType === Node.TEXT_NODE) {
    if (nieTlumacz(wezel.parentElement)) return;
    przetworz(wezel.data, zglos, zmieniaj && ((en) => { wezel.data = en; }));
    return;
  }
  if (wezel.nodeType !== Node.ELEMENT_NODE || nieTlumacz(wezel)) return;
  for (const a of ATRYBUTY) {
    if (wezel.hasAttribute(a)) przetworz(wezel.getAttribute(a), zglos, zmieniaj && ((en) => wezel.setAttribute(a, en)));
  }
  for (const dziecko of wezel.childNodes) przejdz(dziecko, zglos, zmieniaj);
}

/** Obserwator: wszystko, co aplikacja dorysuje albo zmieni, przechodzi przez słownik. */
function obserwuj(zglos, zmieniaj) {
  const korzen = document.documentElement;
  przejdz(korzen, zglos, zmieniaj);
  new MutationObserver((zmiany) => {
    for (const z of zmiany) {
      if (z.type === "childList") for (const w of z.addedNodes) przejdz(w, zglos, zmieniaj);
      else if (z.type === "characterData") przejdz(z.target, zglos, zmieniaj);
      else if (z.type === "attributes" && !nieTlumacz(z.target)) {
        przetworz(z.target.getAttribute(z.attributeName), zglos,
          zmieniaj && ((en) => z.target.setAttribute(z.attributeName, en)));
      }
    }
  }).observe(korzen, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRYBUTY });
}

let wlaczony = false;

/** Cała aplikacja po angielsku — od tej chwili do zamknięcia strony. */
export function wlaczAngielski() {
  if (wlaczony) return;
  wlaczony = true;
  document.documentElement.lang = "en";
  obserwuj(null, true);
  // Systemowe okienko (usunięcie serii maksymalnej) też po angielsku.
  const potwierdz = window.confirm.bind(window);
  window.confirm = (tekst) => potwierdz(poAngielsku(String(tekst)) ?? tekst);
}

/**
 * Audyt dla przeglądu klienta: nic nie zmienia na ekranie, tylko zgłasza
 * każdy polski tekst, którego słownik nie zna. Przegląd przechodzi całą
 * polską aplikację — co się pojawi, sprawdzi się tutaj.
 */
export function audytuj(zglos) {
  obserwuj(zglos, false);
}
