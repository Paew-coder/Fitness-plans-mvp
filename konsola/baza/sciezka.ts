/**
 * Gdzie leży plik bazy. Osobny plik, żeby nie było cyklu w imporcie:
 * `polaczenie.ts` robi kopię przed migracją, a `kopie.ts` musi wiedzieć,
 * co kopiować — gdyby jedno importowało drugie w obie strony, kolejność
 * ładowania zaczęłaby mieć znaczenie.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KATALOG = dirname(fileURLToPath(import.meta.url));

/** Ścieżka do pliku bazy. Nadpisywalna, żeby testy nie ruszały prawdziwych danych. */
export const SCIEZKA_BAZY = process.env.BAZA_CRAFTMYPLAN
  ?? join(KATALOG, "..", "dane", "craftmyplan.db");
