/**
 * Wykres kątów w czasie (SVG): jedna oś w stopniach, linie 2 px, pasy
 * powtórzeń, kursor bieżącej klatki. Najechanie pokazuje wartości w danej
 * chwili; kliknięcie (albo przeciągnięcie palcem) przewija film do tej klatki.
 *
 * Kolory serii to zmienne CSS `--seria-1…4` (osobno dobrane dla trybu
 * jasnego i ciemnego) — kolor należy do kąta, nie do jego pozycji na liście.
 */
const NS = "http://www.w3.org/2000/svg";
const MARGINES = { lewy: 40, prawy: 58, gora: 18, dol: 26 };
const WYSOKOSC = 230;

const el = (nazwa, atrybuty = {}, rodzic) => {
  const e = document.createElementNS(NS, nazwa);
  for (const [k, v] of Object.entries(atrybuty)) e.setAttribute(k, String(v));
  rodzic?.append(e);
  return e;
};

const liczba = (n) => String(Math.round(n));

/**
 * `dane`: `{ czasy: ms[], serie: [{id, nazwa, kolor, wartosci}], powtorzenia,
 * biezaca, naWybor(i) }`. Zwraca `{ ustawBiezaca(i), odswiez(dane) }`.
 */
export function wykresKatow(kontener, dane) {
  let stan = dane;
  const svg = el("svg", { class: "wykres-svg", role: "img" });
  const podpowiedz = document.createElement("div");
  podpowiedz.className = "wykres-podpowiedz ukryty";
  kontener.replaceChildren(svg, podpowiedz);

  let skalaX = () => 0;
  let indeksZX = () => 0;
  let kursor = null;
  let celownik = null;

  function rysuj() {
    const szer = Math.max(320, kontener.clientWidth);
    svg.setAttribute("viewBox", `0 0 ${szer} ${WYSOKOSC}`);
    svg.setAttribute("width", String(szer));
    svg.setAttribute("height", String(WYSOKOSC));
    svg.replaceChildren();
    const { czasy, serie, powtorzenia = [] } = stan;
    svg.setAttribute("aria-label", `Wykres kątów w czasie: ${serie.map((s) => s.nazwa).join(", ")}`);
    if (czasy.length < 2) return;

    const wszystkie = serie.flatMap((s) => s.wartosci.filter((v) => v !== null));
    const min = Math.min(0, ...wszystkie);
    const max = Math.max(30, ...wszystkie);
    const yMin = Math.floor(min / 30) * 30;
    const yMax = Math.ceil(max / 30) * 30;
    const t0 = czasy[0];
    const t1 = czasy[czasy.length - 1];
    const x0 = MARGINES.lewy;
    const x1 = szer - MARGINES.prawy;
    const y0 = WYSOKOSC - MARGINES.dol;
    const y1 = MARGINES.gora;
    skalaX = (t) => x0 + ((t - t0) / (t1 - t0 || 1)) * (x1 - x0);
    const skalaY = (v) => y0 - ((v - yMin) / (yMax - yMin || 1)) * (y0 - y1);
    indeksZX = (x) => {
      const t = t0 + ((x - x0) / (x1 - x0)) * (t1 - t0);
      let naj = 0;
      for (let i = 1; i < czasy.length; i++) if (Math.abs(czasy[i] - t) < Math.abs(czasy[naj] - t)) naj = i;
      return naj;
    };

    // Pasy powtórzeń pod wszystkim.
    powtorzenia.forEach((p, n) => {
      const xa = skalaX(czasy[p.poczatek]);
      const xb = skalaX(czasy[p.koniec]);
      el("rect", { x: xa, y: y1, width: Math.max(1, xb - xa), height: y0 - y1, class: "wykres-powtorzenie" }, svg);
      const opis = el("text", { x: (xa + xb) / 2, y: y1 - 5, class: "wykres-opis", "text-anchor": "middle" }, svg);
      opis.textContent = `#${n + 1}`;
    });

    // Siatka co 30° i oś czasu co sekundę (albo rzadziej przy długich filmach).
    for (let v = yMin; v <= yMax; v += 30) {
      el("line", { x1: x0, x2: x1, y1: skalaY(v), y2: skalaY(v), class: v === 0 ? "wykres-zero" : "wykres-siatka" }, svg);
      const opis = el("text", { x: x0 - 6, y: skalaY(v) + 4, class: "wykres-opis", "text-anchor": "end" }, svg);
      opis.textContent = `${v}°`;
    }
    const krok = Math.max(1, Math.ceil((t1 - t0) / 1000 / 10));
    for (let s = Math.ceil(t0 / 1000); s * 1000 <= t1; s += krok) {
      const opis = el("text", { x: skalaX(s * 1000), y: WYSOKOSC - 8, class: "wykres-opis", "text-anchor": "middle" }, svg);
      opis.textContent = `${s} s`;
    }

    // Linie serii; przerwy tam, gdzie kąt był niepewny.
    const konce = [];
    for (const s of serie) {
      let d = "";
      let wLinii = false;
      s.wartosci.forEach((v, i) => {
        if (v === null) { wLinii = false; return; }
        d += `${wLinii ? "L" : "M"}${skalaX(czasy[i]).toFixed(1)},${skalaY(v).toFixed(1)}`;
        wLinii = true;
      });
      el("path", { d, class: "wykres-linia", style: `stroke: ${s.kolor}` }, svg);
      const ostatni = s.wartosci.findLastIndex((v) => v !== null);
      if (ostatni >= 0) konce.push({ s, y: skalaY(s.wartosci[ostatni]) });
    }
    // Podpisy przy końcach linii, rozsunięte, żeby na siebie nie wchodziły.
    konce.sort((a, b) => a.y - b.y);
    for (let i = 1; i < konce.length; i++) konce[i].y = Math.max(konce[i].y, konce[i - 1].y + 13);
    for (const { s, y } of konce) {
      const opis = el("text", { x: x1 + 6, y: y + 4, class: "wykres-podpis" }, svg);
      opis.textContent = s.krotko ?? s.nazwa;
    }

    celownik = el("line", { y1: y1, y2: y0, class: "wykres-celownik ukryty" }, svg);
    kursor = el("line", { y1: y1 - 2, y2: y0, class: "wykres-kursor" }, svg);
    ustawBiezaca(stan.biezaca ?? 0);
  }

  function ustawBiezaca(i) {
    stan.biezaca = i;
    if (!kursor || stan.czasy.length < 2) return;
    const x = skalaX(stan.czasy[i]);
    kursor.setAttribute("x1", String(x));
    kursor.setAttribute("x2", String(x));
  }

  function pokazPodpowiedz(zdarzenie) {
    const ramka = svg.getBoundingClientRect();
    const x = ((zdarzenie.clientX - ramka.left) / ramka.width) * svg.viewBox.baseVal.width;
    const i = indeksZX(x);
    const xi = skalaX(stan.czasy[i]);
    celownik.setAttribute("x1", String(xi));
    celownik.setAttribute("x2", String(xi));
    celownik.classList.remove("ukryty");
    podpowiedz.replaceChildren();
    const naglowek = document.createElement("div");
    naglowek.className = "wykres-podpowiedz-czas";
    naglowek.textContent = `${(stan.czasy[i] / 1000).toFixed(2).replace(".", ",")} s · klatka ${i + 1}`;
    podpowiedz.append(naglowek);
    for (const s of stan.serie) {
      const wiersz = document.createElement("div");
      const znak = document.createElement("span");
      znak.className = "znak-serii";
      znak.style.background = s.kolor;
      const v = s.wartosci[i];
      wiersz.append(znak, `${s.nazwa}: ${v === null ? "—" : `${liczba(v)}°`}`);
      podpowiedz.append(wiersz);
    }
    podpowiedz.classList.remove("ukryty");
    const lewo = (xi / svg.viewBox.baseVal.width) * ramka.width;
    podpowiedz.style.left = `${Math.min(lewo + 12, ramka.width - podpowiedz.offsetWidth - 4)}px`;
    return i;
  }

  let ciagnie = false;
  svg.addEventListener("pointermove", (e) => {
    const i = pokazPodpowiedz(e);
    if (ciagnie) stan.naWybor?.(i);
  });
  svg.addEventListener("pointerdown", (e) => {
    ciagnie = true;
    svg.setPointerCapture(e.pointerId);
    stan.naWybor?.(pokazPodpowiedz(e));
  });
  const pusc = () => { ciagnie = false; };
  svg.addEventListener("pointerup", pusc);
  svg.addEventListener("pointercancel", pusc);
  svg.addEventListener("pointerleave", () => {
    if (ciagnie) return;
    podpowiedz.classList.add("ukryty");
    celownik?.classList.add("ukryty");
  });

  const obserwator = new ResizeObserver(() => rysuj());
  obserwator.observe(kontener);
  rysuj();

  return {
    ustawBiezaca,
    odswiez(nowe) {
      stan = { ...stan, ...nowe };
      rysuj();
    },
  };
}
