/**
 * Nakładka na obraz: szkielet, punkty, kąty, trajektorie, sugestie.
 *
 * Płótno leży dokładnie na filmie (te same proporcje), więc punkty MediaPipe
 * (0–1) mnoży się przez wymiary płótna. Rozdzielczość płótna = rozmiar na
 * ekranie × gęstość pikseli, żeby linie były ostre na iPadzie.
 */
import { pewny } from "./geometria.js";
import { GLOWNE_PUNKTY, INDEKS, LANDMARKI, POLACZENIA, PROG_WIDOCZNOSCI, rozwiazywacz } from "./szkielet.js";

/** Kolory stron ciała i trajektorii — te same na nakładce i na wykresie. */
export const KOLORY = {
  L: "#eb6834",        // lewa strona ciała
  P: "#3987e5",        // prawa
  srodek: "#ffffff",
  wybrany: "#ffd84d",
  sugestia: "#ffd84d",
};

/** Kolory kolejnych trajektorii (stała kolejność, nie zależy od liczby). */
export const KOLORY_TRAJEKTORII = ["#1baf7a", "#e87ba4", "#9085e9", "#eda100"];

/** Połączenia samego szkieletu ciała — bez oczu, ust i palców dłoni. */
const POLACZENIA_CIALA = POLACZENIA.filter(([a, b]) => a >= 11 && b >= 11
  && ![17, 18, 19, 20, 21, 22].includes(a) && ![17, 18, 19, 20, 21, 22].includes(b));

const KATY_NA_OBRAZIE = [
  { kat: "kolano", punkt: "knee" },
  { kat: "biodro", punkt: "hip" },
  { kat: "skokowy", punkt: "ankle" },
  { kat: "lokiec", punkt: "elbow" },
];

/**
 * Rysuje jedną klatkę.
 *
 * `opcje`: `klatka` (z sesji), `wszystkie` (33 punkty zamiast głównych),
 * `wybrany` (id punktu), `katy` (wyniki kątów klatki) + `strona`,
 * `trajektorie` — `[{id, kolor, punkty: [{x,y}|null], biezacy}]` w 0–1,
 * `sugestie` — `[{punkt, x, y}]` w 0–1, z bieżącą pozycją punktu z klatki.
 */
export function rysujKlatke(ctx, opcje) {
  const { width: w, height: h } = ctx.canvas;
  const dpr = opcje.dpr ?? 1;
  ctx.clearRect(0, 0, w, h);

  for (const tr of opcje.trajektorie ?? []) rysujTrajektorie(ctx, tr, w, h, dpr);

  const k = opcje.klatka;
  if (!k?.p) return;
  const punkty = k.p.map(([x, y, , v]) => ({ x: x * w, y: y * h, z: 0, v }));
  const p = rozwiazywacz(punkty);

  const linie = opcje.wszystkie ? POLACZENIA : POLACZENIA_CIALA;
  for (const [a, b] of linie) odcinek(ctx, punkty[a], punkty[b], dpr);
  // Szyja: od środka barków do głowy — w szkielecie MediaPipe jej nie ma.
  odcinek(ctx, p("srodek_barkow"), p("glowa"), dpr);

  const ids = opcje.wszystkie
    ? [...LANDMARKI.map((l) => l.id).filter((id) => !GLOWNE_PUNKTY.includes(id)), ...GLOWNE_PUNKTY]
    : GLOWNE_PUNKTY;
  for (const id of ids) {
    const glowny = GLOWNE_PUNKTY.includes(id);
    punktNaObrazie(ctx, p(id), kolorPunktu(id), (glowny ? 5.5 : 3.2) * dpr, dpr);
  }

  if (opcje.wybrany && p(opcje.wybrany)) {
    const q = p(opcje.wybrany);
    ctx.beginPath();
    ctx.arc(q.x, q.y, 11 * dpr, 0, Math.PI * 2);
    ctx.lineWidth = 2.5 * dpr;
    ctx.strokeStyle = KOLORY.wybrany;
    ctx.stroke();
  }

  if (opcje.katy && opcje.strona) {
    const przedrostek = opcje.strona === "P" ? "right" : "left";
    for (const { kat, punkt } of KATY_NA_OBRAZIE) {
      const wynik = opcje.katy[`${kat}_${opcje.strona.toLowerCase()}`];
      if (!pewny(wynik)) continue;
      etykieta(ctx, p(`${przedrostek}_${punkt}`), `${Math.round(wynik.wartosc)}°`, dpr);
    }
  }

  for (const s of opcje.sugestie ?? []) rysujSugestie(ctx, p(s.punkt), { x: s.x * w, y: s.y * h }, dpr);
}

export function kolorPunktu(id) {
  const i = INDEKS[id];
  const strona = i === undefined ? null : LANDMARKI[i].strona;
  return strona ? KOLORY[strona] : KOLORY.srodek;
}

function odcinek(ctx, a, b, dpr) {
  if (!a || !b) return;
  const pewne = a.v >= PROG_WIDOCZNOSCI && b.v >= PROG_WIDOCZNOSCI;
  ctx.save();
  ctx.lineCap = "round";
  // Ciemna obwódka pod białą linią — szkielet widać i na jasnej ścianie.
  ctx.strokeStyle = "rgba(0,0,0,.45)";
  ctx.lineWidth = 5 * dpr;
  ctx.globalAlpha = pewne ? 1 : 0.5;
  if (!pewne) ctx.setLineDash([6 * dpr, 6 * dpr]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.lineWidth = 2.5 * dpr;
  ctx.stroke();
  ctx.restore();
}

function punktNaObrazie(ctx, q, kolor, r, dpr) {
  if (!q) return;
  ctx.save();
  ctx.globalAlpha = q.v >= PROG_WIDOCZNOSCI ? 1 : 0.45;
  ctx.beginPath();
  ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
  ctx.fillStyle = kolor;
  ctx.fill();
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeStyle = "rgba(0,0,0,.6)";
  ctx.stroke();
  ctx.restore();
}

function etykieta(ctx, q, tekst, dpr) {
  if (!q) return;
  ctx.save();
  ctx.font = `600 ${13 * dpr}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  const szer = ctx.measureText(tekst).width + 10 * dpr;
  const x = q.x + 10 * dpr;
  const y = q.y - 22 * dpr;
  ctx.fillStyle = "rgba(15,17,23,.82)";
  ctx.beginPath();
  ctx.roundRect(x, y, szer, 19 * dpr, 4 * dpr);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(tekst, x + 5 * dpr, y + 10 * dpr);
  ctx.restore();
}

function rysujTrajektorie(ctx, tr, w, h, dpr) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = tr.kolor;
  // Cała droga blado, przebyta do bieżącej klatki — pełnym kolorem.
  for (const [od, doIndeksu, alfa] of [[0, tr.punkty.length - 1, 0.35], [0, tr.biezacy, 1]]) {
    ctx.globalAlpha = alfa;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    let wLinii = false;
    for (let i = od; i <= doIndeksu; i++) {
      const q = tr.punkty[i];
      if (!q) { wLinii = false; continue; }
      if (wLinii) ctx.lineTo(q.x * w, q.y * h);
      else { ctx.moveTo(q.x * w, q.y * h); wLinii = true; }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function rysujSugestie(ctx, obecny, sugerowany, dpr) {
  if (!obecny) return;
  ctx.save();
  // Przerywana strzałka ● → ○.
  const dx = sugerowany.x - obecny.x;
  const dy = sugerowany.y - obecny.y;
  const d = Math.hypot(dx, dy);
  ctx.strokeStyle = KOLORY.sugestia;
  ctx.lineWidth = 2 * dpr;
  if (d > 16 * dpr) {
    const ux = dx / d;
    const uy = dy / d;
    const kx = sugerowany.x - ux * 10 * dpr;
    const ky = sugerowany.y - uy * 10 * dpr;
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(obecny.x + ux * 7 * dpr, obecny.y + uy * 7 * dpr);
    ctx.lineTo(kx, ky);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(kx, ky);
    ctx.lineTo(kx - ux * 8 * dpr - uy * 5 * dpr, ky - uy * 8 * dpr + ux * 5 * dpr);
    ctx.moveTo(kx, ky);
    ctx.lineTo(kx - ux * 8 * dpr + uy * 5 * dpr, ky - uy * 8 * dpr - ux * 5 * dpr);
    ctx.stroke();
  }
  // ○ sugerowana pozycja — pusty krąg z ciemną obwódką.
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(sugerowany.x, sugerowany.y, 9 * dpr, 0, Math.PI * 2);
  ctx.lineWidth = 5 * dpr;
  ctx.strokeStyle = "rgba(0,0,0,.5)";
  ctx.stroke();
  ctx.lineWidth = 2.5 * dpr;
  ctx.strokeStyle = KOLORY.sugestia;
  ctx.stroke();
  // ● obecna pozycja — pełna kropka w tym samym kolorze.
  ctx.beginPath();
  ctx.arc(obecny.x, obecny.y, 6 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = KOLORY.sugestia;
  ctx.fill();
  ctx.restore();
}

/**
 * Punkt najbliżej miejsca dotknięcia (w pikselach płótna), w promieniu
 * `zasieg`. Szuka wśród głównych punktów, a przy `wszystkie` — wśród 33.
 */
export function punktPodPalcem(klatka, x, y, w, h, { wszystkie = false, zasieg = 30 } = {}) {
  if (!klatka?.p) return null;
  const punkty = klatka.p.map(([px, py, , v]) => ({ x: px * w, y: py * h, z: 0, v }));
  const p = rozwiazywacz(punkty);
  const ids = wszystkie ? [...GLOWNE_PUNKTY, ...LANDMARKI.map((l) => l.id)] : GLOWNE_PUNKTY;
  let naj = null;
  for (const id of ids) {
    const q = p(id);
    const d = Math.hypot(q.x - x, q.y - y);
    if (d <= zasieg && (!naj || d < naj.d)) naj = { id, d };
  }
  return naj?.id ?? null;
}
