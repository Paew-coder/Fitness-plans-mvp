/**
 * Adresy, pod którymi konsola jest widoczna z innego urządzenia w tej samej
 * sieci.
 *
 * Trener kopiuje link dla klienta z paska przeglądarki, czyli z `localhost` —
 * a na telefonie klienta `localhost` znaczy jego własny telefon. Link nie ma
 * wtedy prawa zadziałać i nic tego nie tłumaczy. Stąd ta lista: pokazujemy
 * adres, który da się przepisać na telefon.
 *
 * Osobny plik, bo potrzebują tego dwa miejsca naraz: serwer (w odpowiedzi
 * `/api/ja`) i narzędzie do ustawiania hasła, które kończy pracę dokładnie
 * w momencie, w którym te adresy zaczynają mieć sens.
 */
import { networkInterfaces } from "node:os";

export function adresyLokalnejSieci(port: number): string[] {
  return Object.values(networkInterfaces())
    .flatMap((lista) => lista ?? [])
    .filter((i) => i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i.address}:${port}`);
}
