// PLIK GENEROWANY — nie edytuj recznie.
// Zrodlo: docs/dane/filmy-cwiczen.json
// Regeneracja: python3 silnik/narzedzia/generuj-dane.py

import type { WpisWideo, ZrodloWideo } from "../wideo.ts";

/** Skad pochodza filmy (kanal, platforma) — wspolne dla wielu wpisow. */
export const ZRODLA_WIDEO: readonly ZrodloWideo[] = [
  { id: "opex-youtube", nazwa: "OPEX Fitness", platforma: "YouTube", kanal: "@OPEXFitness", kanalId: "UCCgDGih2kSp0A6W_0cVYuaQ", url: "https://www.youtube.com/@OPEXFitness" },
];

/** 1 film(y) przypisane do cwiczen z BAZY. */
export const FILMY_CWICZEN: readonly WpisWideo[] = [
  { id: "WID-0001", cwiczenieId: "EX-0011", typ: "youtube", youtubeId: "ejI1Nlsul9k", zrodlo: "opex-youtube", tytul: "Barbell Bench Press - OPEX Exercise Library", url: "https://www.youtube.com/watch?v=ejI1Nlsul9k", czasSekund: 9 },
];
