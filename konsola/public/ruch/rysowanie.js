/**
 * Nakładka na obraz: szkielet, punkty, kąty, trajektorie, sugestie.
 *
 * Płótno leży dokładnie na filmie (te same proporcje), więc punkty MediaPipe
 * (0–1) mnoży się przez wymiary płótna. Rozdzielczość płótna = rozmiar na
 * ekranie × gęstość pikseli, żeby linie były ostre na iPadzie.
 */
import { pewny } from "./geometria.js";
import { GLOWNE_PUNKTY, INDEKS, LANDMARKI, POLACZENIA, PROG_WIDOCZNOSCI, punktWidoczny, rozwiazywacz } from "./szkielet.js";

/** Kolory stron ciała i trajektorii — te same na nakładce i na wykresie. */
export const KOLORY = {
  L: "#eb6834",        // lewa strona ciała
  P: "#3987e5",        // prawa
  srodek: "#ffffff",
  wybrany: "#ffd84d",
  sugestia: "#ffd84d",
  // Środek ciężkości (23.10.2026) — kolor, którego nie ma szkielet ani trajektorie.
  srodekCiezkosci: "#33d6ff",
  // Punkt sztangi i środek ciężkości układu ciało + sztanga (24.10.2026) —
  // czerwień i limonka: nie myli się z żadnym kolorem wyżej ani z trajektoriami.
  sztanga: "#ff4d5e",
  uklad: "#b4f03a",
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
 * `ukryte` — główne punkty, których trener nie chce widzieć (Set; znika też
 * to, co do nich należy: odcinki, palce, kąt przy stawie, trajektoria — `punktWidoczny`),
 * `wybrany` (id punktu), `katy` (wyniki kątów klatki) + `strona`,
 * `trajektorie` — `[{id, kolor, punkty: [{x,y}|null], biezacy}]` w 0–1,
 * `sugestie` — `[{punkt, x, y}]` w 0–1, z bieżącą pozycją punktu z klatki.
 * `srodek` — środek ciężkości: `{x, y, pewny, podloga, droga: [{x,y}|null], biezacy}`
 * w 0–1 (symbol, pion do podłoża i droga w całym nagraniu).
 * Od 24.10.2026 (badanie z punktem sztangi), wszystko w 0–1:
 * `uklad` — środek ciężkości ciała ze sztangą, jak `srodek` (pion rysuje ten,
 * który ma `podloga`); `sztanga` — koniec gryfu `{x, y, pewny, zrodlo, droga,
 * biezacy, poprawiony}` (niepewny — przerywany, ze znakiem „?”; `poprawiony` —
 * środek gryfu po poprawce perspektywy, mała kropka); `pasmo` — śródstopie
 * `{od, do, podloga}` (pas od linii stóp do góry obrazu); `lupa` — powiększenie
 * przy zaznaczaniu `{zrodlo, szerokosc, wysokosc, x, y}` (`zrodlo` — film);
 * `tlo` — obraz pod wszystkim (klatka filmu przy zaznaczaniu przed analizą).
 */
export function rysujKlatke(ctx, opcje) {
  const { width: w, height: h } = ctx.canvas;
  const dpr = opcje.dpr ?? 1;
  ctx.clearRect(0, 0, w, h);
  // Tło — klatka filmu pod nakładką (zaznaczanie gryfu przed analizą, bez <video> pod spodem).
  if (opcje.tlo) ctx.drawImage(opcje.tlo, 0, 0, w, h);

  const ukryte = opcje.ukryte ?? new Set();
  const widac = (id) => punktWidoczny(id, ukryte);

  if (opcje.pasmo) rysujPasmo(ctx, opcje.pasmo, w, h, dpr);

  // Droga tylko przy punkcie, który widać (trener, 23.10.2026: „wyświetlają
  // się tylko te, które mają swój punkt oznaczony”).
  for (const tr of opcje.trajektorie ?? []) if (widac(tr.id)) rysujTrajektorie(ctx, tr, w, h, dpr);
  if (opcje.srodek?.droga) {
    rysujTrajektorie(ctx, { kolor: KOLORY.srodekCiezkosci, punkty: opcje.srodek.droga, biezacy: opcje.srodek.biezacy }, w, h, dpr);
  }
  if (opcje.uklad?.droga) {
    rysujTrajektorie(ctx, { kolor: KOLORY.uklad, punkty: opcje.uklad.droga, biezacy: opcje.uklad.biezacy }, w, h, dpr);
  }
  if (opcje.sztanga?.droga) {
    rysujTrajektorie(ctx, { kolor: KOLORY.sztanga, punkty: opcje.sztanga.droga, biezacy: opcje.sztanga.biezacy }, w, h, dpr);
  }

  const k = opcje.klatka;
  if (!k?.p) {
    // Bez sylwetki w tej klatce sztanga dalej jest na obrazie (śledzi się osobno).
    rysujNaSzkielecie(ctx, opcje, w, h, dpr);
    return;
  }
  const punkty = k.p.map(([x, y, , v]) => ({ x: x * w, y: y * h, z: 0, v }));
  const p = rozwiazywacz(punkty);

  const linie = opcje.wszystkie ? POLACZENIA : POLACZENIA_CIALA;
  for (const [a, b] of linie) {
    if (widac(LANDMARKI[a].id) && widac(LANDMARKI[b].id)) odcinek(ctx, punkty[a], punkty[b], dpr);
  }
  // Szyja: od środka barków do głowy — w szkielecie MediaPipe jej nie ma.
  // Przy jednej stronie — od jej barku.
  const barkL = widac("left_shoulder");
  const barkP = widac("right_shoulder");
  if (widac("glowa") && (barkL || barkP)) {
    odcinek(ctx, p(barkL && barkP ? "srodek_barkow" : barkL ? "left_shoulder" : "right_shoulder"), p("glowa"), dpr);
  }

  const ids = (opcje.wszystkie
    ? [...LANDMARKI.map((l) => l.id).filter((id) => !GLOWNE_PUNKTY.includes(id)), ...GLOWNE_PUNKTY]
    : GLOWNE_PUNKTY).filter(widac);
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
      if (!pewny(wynik) || !widac(`${przedrostek}_${punkt}`)) continue;
      etykieta(ctx, p(`${przedrostek}_${punkt}`), `${Math.round(wynik.wartosc)}°`, dpr);
    }
  }

  if (opcje.srodek && opcje.srodek.x !== null && opcje.srodek.x !== undefined) rysujSrodek(ctx, opcje.srodek, w, h, dpr);
  rysujNaSzkielecie(ctx, opcje, w, h, dpr);

  for (const s of opcje.sugestie ?? []) rysujSugestie(ctx, p(s.punkt), { x: s.x * w, y: s.y * h }, dpr);
  if (opcje.lupa) rysujLupe(ctx, opcje.lupa, w, h, dpr);
}

/** Sztanga i środek układu — nad szkieletem, także w klatce bez sylwetki. */
function rysujNaSzkielecie(ctx, opcje, w, h, dpr) {
  if (opcje.uklad && opcje.uklad.x !== null && opcje.uklad.x !== undefined) {
    rysujSrodek(ctx, opcje.uklad, w, h, dpr, { kolor: KOLORY.uklad, promien: 10 });
  }
  if (opcje.sztanga && opcje.sztanga.x !== null && opcje.sztanga.x !== undefined) rysujSztange(ctx, opcje.sztanga, w, h, dpr);
  if (!opcje.klatka?.p && opcje.lupa) rysujLupe(ctx, opcje.lupa, w, h, dpr);
}

/**
 * Koniec gryfu: pierścień z kropką w środku (jak talerz na gryfie), czerwony.
 * Niepewny — przerywany, blady, ze znakiem „?”; punkt postawiony przez
 * trenera (korekta) — z białą obwódką.
 */
function rysujSztange(ctx, s, w, h, dpr) {
  const x = s.x * w;
  const y = s.y * h;
  const r = 9 * dpr;
  ctx.save();
  ctx.globalAlpha = s.pewny ? 1 : 0.6;
  if (!s.pewny) ctx.setLineDash([3 * dpr, 3 * dpr]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 5.5 * dpr;
  ctx.strokeStyle = "rgba(0,0,0,.55)";
  ctx.stroke();
  ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = KOLORY.sztanga;
  ctx.stroke();
  ctx.setLineDash([]);
  if (s.zrodlo === "korekta") {
    ctx.beginPath();
    ctx.arc(x, y, r + 3.5 * dpr, 0, Math.PI * 2);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, 2.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = KOLORY.sztanga;
  ctx.fill();
  ctx.lineWidth = 1 * dpr;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();
  // Środek gryfu po poprawce perspektywy (27.10.2026): mała kropka i kreska od końca gryfu.
  if (s.poprawiony && Number.isFinite(s.poprawiony.x)) {
    const px = s.poprawiony.x * w;
    const py = s.poprawiony.y * h;
    ctx.save();
    ctx.globalAlpha = s.pewny ? 1 : 0.6;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(px, py);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = KOLORY.sztanga;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(px, py, 4 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = KOLORY.sztanga;
    ctx.fill();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.restore();
  }
  if (!s.pewny) etykieta(ctx, { x: x + 2 * dpr, y: y + 4 * dpr }, "?", dpr);
}

/** Pas śródstopia: od linii stóp do góry obrazu, między `od` a `do` (0–1). */
function rysujPasmo(ctx, pasmo, w, h, dpr) {
  if (![pasmo.od, pasmo.do, pasmo.podloga].every(Number.isFinite)) return;
  const xa = Math.min(pasmo.od, pasmo.do) * w;
  const xb = Math.max(pasmo.od, pasmo.do) * w;
  const dol = pasmo.podloga * h;
  ctx.save();
  ctx.fillStyle = "rgba(180, 240, 58, .13)";
  ctx.fillRect(xa, 0, xb - xa, dol);
  for (const x of [xa, xb]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, dol);
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.stroke();
    ctx.setLineDash([6 * dpr, 5 * dpr]);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = "rgba(220, 255, 160, .9)";
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/**
 * Lupa przy zaznaczaniu gryfu palcem — palec zasłania punkt, a koniec gryfu
 * na telefonie ma kilka pikseli. Powiększenie ×3 w rogu dalej od palca,
 * z krzyżykiem w miejscu punktu.
 */
export function rysujLupe(ctx, lupa, w, h, dpr) {
  const { zrodlo, szerokosc, wysokosc, x, y } = lupa;
  if (!zrodlo || !(szerokosc > 0) || !(wysokosc > 0)) return;
  const r = Math.min(70 * dpr, w / 4, h / 3);
  const powiekszenie = 3;
  const cx = x < 0.5 ? w - r - 8 * dpr : r + 8 * dpr;
  const cy = r + 8 * dpr;
  // Wycinek filmu: promień lupy / powiększenie, w pikselach filmu.
  const skala = szerokosc / w;
  const pol = (r / powiekszenie) * skala;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.clip();
  try {
    ctx.drawImage(zrodlo, x * szerokosc - pol, y * wysokosc - pol, 2 * pol, 2 * pol, cx - r, cy - r, 2 * r, 2 * r);
  } catch { /* film jeszcze bez klatki */ }
  ctx.strokeStyle = KOLORY.sztanga;
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx - 5 * dpr, cy);
  ctx.moveTo(cx + 5 * dpr, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy - 5 * dpr);
  ctx.moveTo(cx, cy + 5 * dpr);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();
}

/**
 * Środek ciężkości: klasyczny symbol (koło w czarno-białe ćwiartki) i pion
 * do linii stóp — widać, nad którą częścią stopy leży. Niepewny — blado,
 * z przerywaną obwódką.
 */
function rysujSrodek(ctx, s, w, h, dpr, { kolor = KOLORY.srodekCiezkosci, promien = 8 } = {}) {
  const x = s.x * w;
  const y = s.y * h;
  ctx.save();
  ctx.globalAlpha = s.pewny ? 1 : 0.5;
  if (s.podloga !== null && s.podloga !== undefined && s.podloga * h > y) {
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    ctx.lineWidth = 4 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, s.podloga * h);
    ctx.stroke();
    ctx.strokeStyle = kolor;
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const r = promien * dpr;
  for (let c = 0; c < 4; c++) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, (c * Math.PI) / 2, ((c + 1) * Math.PI) / 2);
    ctx.closePath();
    ctx.fillStyle = c % 2 ? "#ffffff" : "#000000";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5 * dpr, 0, Math.PI * 2);
  ctx.lineWidth = 2.5 * dpr;
  if (!s.pewny) ctx.setLineDash([3 * dpr, 3 * dpr]);
  ctx.strokeStyle = kolor;
  ctx.stroke();
  ctx.restore();
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
 * `zasieg`. Szuka wśród głównych punktów, a przy `wszystkie` — wśród 33;
 * punktów schowanych (`ukryte`) nie ma na obrazie, więc ich nie łapie.
 */
export function punktPodPalcem(klatka, x, y, w, h, { wszystkie = false, zasieg = 30, ukryte = new Set() } = {}) {
  if (!klatka?.p) return null;
  const punkty = klatka.p.map(([px, py, , v]) => ({ x: px * w, y: py * h, z: 0, v }));
  const p = rozwiazywacz(punkty);
  const ids = (wszystkie ? [...GLOWNE_PUNKTY, ...LANDMARKI.map((l) => l.id)] : GLOWNE_PUNKTY)
    .filter((id) => punktWidoczny(id, ukryte));
  let naj = null;
  for (const id of ids) {
    const q = p(id);
    const d = Math.hypot(q.x - x, q.y - y);
    if (d <= zasieg && (!naj || d < naj.d)) naj = { id, d };
  }
  return naj?.id ?? null;
}
