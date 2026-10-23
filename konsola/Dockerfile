# Konsola trenera w jednym obrazie.
#
# Zero zależności zewnętrznych po stronie Node — cały kod to `silnik/`
# i `konsola/`. Python jest tu wyłącznie po to, żeby działał eksport
# i import arkuszy `.xlsx` (openpyxl czyta ten format, Node nie).
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-openpyxl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Silnik i konsola idą razem — konsola importuje silnik po ścieżce względnej.
COPY silnik/ ./silnik/
COPY konsola/ ./konsola/
# Szablon 5.18 — z niego powstaje każdy wyeksportowany arkusz. Bez tego
# „Eksportuj arkusz" wywala się dopiero na serwerze, przy pierwszym kliknięciu.
COPY arkusz/MasterTemplate-5-18.xlsx ./arkusz/

# Dane (baza, eksporty, kopie) leżą na woluminie, nie w obrazie.
# Bez tego przebudowa obrazu skasowałaby plany klientów.
RUN rm -rf /app/konsola/dane
VOLUME ["/app/konsola/dane"]

ENV PORT=4173
ENV ZA_HTTPS=1
# Strefa czasu. Samo liczenie dni jej nie potrzebuje — `czas.ts` pyta jawnie
# o Europe/Warsaw — ale daty wypisywane w terminalu (np. `npm run przywroc`)
# i wpisy w logu mają być w tym samym czasie, w którym trener żyje.
ENV TZ=Europe/Warsaw
EXPOSE 4173

WORKDIR /app/konsola

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/zdrowie').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--no-warnings", "serwer.ts"]
