// The animated scene: sky, parallax sea, the SS MAGA liner, figures, splashes, sinking.
// render(t, ...) is a pure function of timeline time t (plus wall-clock `sec` for idle motion),
// so scrubbing, replaying and the "Watch the jump" button all share one code path.

import { sv, makeFigure, pose, hash } from "./figures.js";
import { palette, mix } from "./palette.js";
import { sinkState, SINK_DAYS } from "./model.js";

export const H = 520;
export const HORIZON = 236;
export const WATER = 356;
export const PX = 110;          // world pixels the sea scrolls per timeline day
export const JL = 0.8;          // length of a normal jump sequence, in timeline days
const JLP = 0.42;               // length of the panic jump in the final sequence
const SPL = 0.55;               // splash lifetime in days
const RAIL_X = -203;            // stern rail, ship-local
const DECK_Y = -50;
const RAIL_Y = -64;
// phase boundaries (fractions of the sequence) for the normal jump and the panic jump
const NORMAL = { flight0: 0.6, flight1: 0.88, under: 0.96, pop: 1.12 };
const PANIC = { flight0: 0.18, flight1: 0.6, under: 0.7, pop: 0.88 };

const ease = x => x * x * (3 - 2 * x);
const c01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, k) => a + (b - a) * k;
const backOut = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

const PROMENADE = []; for (let x = -176; x <= 154; x += 22) PROMENADE.push(x);
const FORWARD = [172, 190, 208, 226];
const N_EXTRAS = 7;
const SCORE_DAYS = 1.1;         // how long the judges' paddles stay up after a splash

// Jump styles are picked from a hash of the entry id: pure randomness, nothing about the person.
const STYLES = [
  { name: "swan", word: "SWOOSH... plip", scale: 1 },
  { name: "cannonball", word: "KA-BLOOSH!", scale: 1.45 },
  { name: "backflip", word: "PLOP!", scale: 1 },
  { name: "belly", word: "SMACK!", scale: 1.7 },
  { name: "briefcase", word: "KERPLUNK!", scale: 1.15 },
];
export const STYLE_NAMES = { swan: "swan dive", cannonball: "cannonball", backflip: "backflip", belly: "belly flop", briefcase: "briefcase plunge" };
function flightPose(st, e, sd) {
  switch (st.name) {
    case "swan": return { rot: sd * 175 * ease(e), armsF: 96, armsB: 84, legTuck: 0, lean: 0 };
    case "cannonball": return { rot: sd * 360 * ease(e), armsF: 40, armsB: 36, legTuck: 1.5, lean: 8 };
    case "backflip": return { rot: -sd * 360 * ease(e), armsF: 150 + Math.sin(e * 20) * 10, armsB: 140, legTuck: 0.7, lean: 0 };
    case "belly": return { rot: sd * 90 * ease(Math.min(1, e * 2.2)), armsF: 172, armsB: 160, legTuck: 0, lean: 0 };
    default: return { rot: sd * 358 * ease(e), armsF: 140 + Math.sin(e * 30) * 10, armsB: 120, legTuck: 1, lean: 0, prop: "case" };
  }
}
const FONT = "'Bricolage Grotesque', system-ui, sans-serif";

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

export function createScene(svg, opts = {}) {
  const reduce = !!opts.reduce;
  let W = 1000, S = 1, shipX = 600, dark = false, phaseKey = -1, lastPhase = 0;
  let tl = null, people = [], all = [], windows = [], landings = [];
  let bailing = false, lastPatches = -1, lastSign = null, lastSput = null, smokeCol = "#d5dde3", honkAt = null;
  let pal = palette(0, false);

  // ---------- defs ----------
  const defs = sv("defs", {}, svg);
  const stops = (g, list) => list.map(([o, c, a]) => sv("stop", { offset: o, "stop-color": c, "stop-opacity": a == null ? 1 : a }, g));
  const lgrad = (id, x1, y1, x2, y2, list) => stops(sv("linearGradient", { id, x1, y1, x2, y2 }, defs), list);
  const rgrad = (id, list) => stops(sv("radialGradient", { id }, defs), list);
  const skyStops = lgrad("g-sky", 0, 0, 0, 1, [[0, "#000"], [0.55, "#000"], [1, "#000"]]);
  const seaStops = lgrad("g-sea", 0, 0, 0, 1, [[0, "#000"], [0.3, "#000"], [1, "#000"]]);
  const hazeStops = lgrad("g-haze", 0, 0, 0, 1, [[0, "#fff", 0], [0.5, "#fff", 0.9], [1, "#fff", 0]]);
  const cloudStops = lgrad("g-cloud", 0, 0, 0, 1, [[0, "#fff"], [1, "#ccc"]]);
  const glowStops = rgrad("g-glow", [[0, "#fff", 0.9], [0.35, "#fff", 0.25], [1, "#fff", 0]]);
  const hullStops = lgrad("g-hull", 0, 0, 0, 1, [[0, "#2a3b57"], [1, "#0d1522"]]);
  const supStops = lgrad("g-sup", 0, 0, 0, 1, [[0, "#ffffff"], [1, "#d3dbe3"]]);
  const funStops = lgrad("g-fun", 0, 0, 1, 0, [[0, "#b8322d"], [0.5, "#e2493f"], [1, "#9c2824"]]);
  lgrad("g-wake", 1, 0, 0, 0, [[0, "#fff", 0.55], [1, "#fff", 0]]);
  rgrad("g-shadow", [[0, "#000", 0.38], [1, "#000", 0]]);
  lgrad("g-refl", 0, 0, 0, 1, [[0, "#fff", 0.5], [1, "#fff", 0]]);
  rgrad("g-vig", [[0.55, "#000", 0], [1, "#000", 0.32]]);
  const mask = sv("mask", { id: "m-refl", maskUnits: "userSpaceOnUse", x: -2000, y: WATER, width: 6000, height: 160 }, defs);
  sv("rect", { x: -2000, y: WATER, width: 6000, height: 160, fill: "url(#g-refl)" }, mask);
  const HULL = "M-210,-50 L190,-50 Q224,-52 240,-74 L215,4 Q207,20 186,20 L-176,20 Q-204,20 -212,-6 Z";
  sv("path", { d: HULL }, sv("clipPath", { id: "c-hull" }, defs));

  // ---------- sky ----------
  const skyRect = sv("rect", { x: 0, y: 0, width: 1000, height: HORIZON + 3, fill: "url(#g-sky)" }, svg);
  const starG = sv("g", {}, svg);
  const rs = rng(77);
  const stars = [];
  for (let i = 0; i < 70; i++) {
    stars.push({ el: sv("circle", { cx: 0, cy: rs() * (HORIZON - 40), r: 0.5 + rs() * 1.1, fill: "#eaf2ff", opacity: 0 }, starG), nx: rs(), ph: rs() * 6, base: 0.4 + rs() * 0.6, tw: i < 14 });
  }
  const glow = sv("circle", { r: 200, fill: "url(#g-glow)" }, svg);
  const sunG = sv("g", {}, svg);
  const sunDisc = sv("circle", { r: 30 }, sunG);
  const moonG = sv("g", {}, svg);
  const moonDisc = sv("circle", { r: 24 }, moonG);
  [[-7, -5, 4.5], [8, 6, 3.2], [-3, 10, 2.6], [9, -9, 2.2]].forEach(c => sv("circle", { cx: c[0], cy: c[1], r: c[2], fill: "#0b1626", opacity: 0.14 }, moonG));

  const clouds = [];
  const mkCloud = (far, i) => {
    const g = sv("g", { opacity: far ? 0.55 : 0.85 }, svg);
    [[0, 0, 62, 13], [-30, -9, 34, 14], [14, -15, 38, 19], [42, -6, 28, 12], [-52, -2, 22, 9]].forEach(c =>
      sv("ellipse", { cx: c[0], cy: c[1], rx: c[2], ry: c[3], fill: "url(#g-cloud)" }, g));
    clouds.push({ g, far, x: i * 330 + (far ? 120 : 20), y: far ? 54 + (i % 3) * 22 : 96 + (i % 2) * 36, sc: far ? 0.62 : 1 });
  };
  for (let i = 0; i < 5; i++) mkCloud(true, i);
  for (let i = 0; i < 4; i++) mkCloud(false, i);
  const gulls = [];
  for (let i = 0; i < 4; i++) gulls.push(sv("path", { fill: "none", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg));

  const coast = sv("path", {}, svg);
  const seaRect = sv("rect", { x: 0, y: HORIZON, width: 1000, height: H - HORIZON, fill: "url(#g-sea)" }, svg);
  const glitter = [];
  const rg = rng(5);
  const glitterG = sv("g", {}, svg);
  for (let i = 0; i < 18; i++) {
    const y = HORIZON + 5 + Math.pow(i / 18, 1.4) * 120;
    glitter.push({ el: sv("rect", { height: 1.6 + i * 0.12, rx: 1, opacity: 0 }, glitterG), y, w: 8 + i * 4, off: (rg() - 0.5) * 2, ph: rg() * 6 });
  }

  // ---------- waves ----------
  const waves = [];
  function mkWave(y0, amp, P, speed, fillKey, crest) {
    const fill = sv("path", {}, svg);
    const stroke = crest ? sv("path", { fill: "none", "stroke-width": crest, "stroke-linecap": "round" }, svg) : null;
    const stroke2 = crest ? sv("path", { fill: "none", "stroke-width": crest * 0.8, "stroke-dasharray": `${P * 0.18} ${P * 0.32}` }, svg) : null;
    const w = { y0, amp, P, speed, fillKey, fill, stroke, stroke2 };
    waves.push(w);
    return w;
  }
  function wavePath(w, close) {
    const n = Math.ceil((W + 3 * w.P) / (w.P / 2));
    let d = `M${-w.P},${w.y0} q${w.P / 4},${-w.amp} ${w.P / 2},0`;
    for (let i = 1; i < n; i++) d += " t" + w.P / 2 + ",0";
    if (close) d += ` L${-w.P + n * (w.P / 2)},${H + 4} L${-w.P},${H + 4} Z`;
    return d;
  }
  mkWave(HORIZON + 14, 1.6, 44, 0.05, "far", 0.8);
  mkWave(HORIZON + 38, 2.6, 78, 0.12, "farB", 1);
  const hazeRect = sv("rect", { x: 0, y: HORIZON - 46, width: 1000, height: 84, fill: "url(#g-haze)" }, svg);
  mkWave(WATER - 10, 5, 150, 0.55, "mid", 1.4);

  // ---------- ship ----------
  const shadow = sv("ellipse", { rx: 250, ry: 14, fill: "url(#g-shadow)" }, svg);
  const reflOuter = sv("g", { mask: "url(#m-refl)", opacity: 0.5 }, svg);
  const reflUse = sv("use", { href: "#ship-art" }, sv("g", { transform: `translate(0,${WATER}) scale(1,-0.55) translate(0,${-WATER})` }, reflOuter));
  const wakeBand = sv("path", { fill: "url(#g-wake)" }, svg);
  const wakeFoam = [];
  for (let i = 0; i < 28; i++) wakeFoam.push(sv("ellipse", {}, svg));
  const shipG = sv("g", {}, svg);
  const shipArt = sv("g", { id: "ship-art" }, shipG);
  const winEls = [];
  const patchEls = [];
  (function drawShip() {
    const a = shipArt;
    sv("path", { d: HULL, fill: "url(#g-hull)" }, a);
    const hc = sv("g", { "clip-path": "url(#c-hull)" }, a);
    sv("rect", { x: -230, y: -6, width: 480, height: 40, fill: "#b6322d" }, hc);
    sv("rect", { x: -230, y: -8, width: 480, height: 2.4, fill: "#ffffff", opacity: 0.85 }, hc);
    sv("rect", { x: -230, y: -40, width: 480, height: 1.6, fill: "#ffffff", opacity: 0.6 }, hc);
    sv("rect", { x: -230, y: -50, width: 480, height: 4, fill: "#000", opacity: 0.2 }, hc);
    for (let x = -172; x <= 192; x += 19) winEls.push(sv("circle", { cx: x, cy: -17, r: 2.7 }, hc));
    // duct-tape patches: one more appears for every departure
    const pr = rng(31);
    for (let i = 0; i < 12; i++) {
      const px = i % 2 === 0 ? -190 + pr() * 120 : 118 + pr() * 80, py = -43 + pr() * 28;
      const g = sv("g", { display: "none", transform: `translate(${px.toFixed(1)},${py.toFixed(1)}) rotate(${(pr() * 50 - 25).toFixed(0)})` }, hc);
      sv("rect", { x: -9, y: -5, width: 18, height: 10, rx: 1.2, fill: "#8d939c" }, g);
      sv("path", { d: "M-9,-5 L9,5 M9,-5 L-9,5", stroke: "#4e545d", "stroke-width": 1.2 }, g);
      sv("rect", { x: -9, y: -5, width: 18, height: 10, rx: 1.2, fill: "none", stroke: "#c3c8cf", "stroke-width": 0.8, "stroke-dasharray": "3 2" }, g);
      patchEls.push(g);
    }
    const nm = sv("text", { x: 22, y: -22, "text-anchor": "middle", fill: "#ffffff", "font-size": 24, "font-weight": 800, "letter-spacing": 5, "font-family": FONT }, a);
    nm.textContent = "SS MAGA";
    sv("rect", { x: -210, y: -53, width: 450, height: 3.2, fill: "#d9c79c" }, a);
    const tier = (x, y, w, h, rowY) => {
      sv("rect", { x, y, width: w, height: h, rx: 3, fill: "url(#g-sup)" }, a);
      sv("rect", { x, y: y + h - 3, width: w, height: 3, fill: "#9aa7b4", opacity: 0.55 }, a);
      for (let wx = x + 7; wx < x + w - 8; wx += 13) winEls.push(sv("rect", { x: wx, y: rowY, width: 7.5, height: 8, rx: 1.6 }, a));
    };
    tier(-138, -86, 290, 34, -77);
    tier(-112, -116, 238, 30, -107);
    sv("rect", { x: -34, y: -138, width: 132, height: 22, rx: 3, fill: "url(#g-sup)" }, a);
    winEls.push(sv("rect", { x: -26, y: -131, width: 116, height: 9, rx: 2 }, a));
    for (const bx of [-96, -62, 74, 108]) {
      sv("path", { d: `M${bx},-117 q13,-7 26,0 l-3,5 h-20 z`, fill: "#e0793a" }, a);
      sv("rect", { x: bx + 3, y: -117, width: 20, height: 1.6, fill: "#fff" }, a);
    }
    for (const fx of [-72, -20, 32]) {
      sv("path", { d: `M${fx},-116 L${fx + 28},-116 L${fx + 23},-170 L${fx - 6},-170 Z`, fill: "url(#g-fun)" }, a);
      sv("path", { d: `M${fx - 6.4},-170 L${fx + 23},-170 L${fx + 23.5},-163 L${fx - 7},-163 Z`, fill: "#16191e" }, a);
      sv("path", { d: `M${fx + 0.4},-149 L${fx + 25.4},-149 L${fx + 24.8},-143 L${fx - 0.2},-143 Z`, fill: "#fff", opacity: 0.9 }, a);
    }
    sv("line", { x1: 186, y1: -50, x2: 186, y2: -150, stroke: "#1b222c", "stroke-width": 2.4 }, a);
    sv("line", { x1: 186, y1: -150, x2: 120, y2: -118, stroke: "#222a35", "stroke-width": 0.8 }, a);
    sv("line", { x1: 186, y1: -150, x2: 232, y2: -62, stroke: "#222a35", "stroke-width": 0.8 }, a);
    sv("path", { d: "M186,-150 l24,4 l-24,6 z", fill: "#f1c84b" }, a);
    sv("line", { x1: -208, y1: -50, x2: -208, y2: -100, stroke: "#1b222c", "stroke-width": 2 }, a);
    sv("path", { d: "M-208,-100 l-26,4 l26,6 z", fill: "#d9473f" }, a);
    sv("circle", { cx: 186, cy: -152, r: 2.4, fill: "#ff4b3e" }, a);
  })();
  const figLayer = sv("g", {}, svg);
  const railG = sv("g", {}, svg);
  for (let x = -208; x <= 232; x += 11) sv("line", { x1: x, y1: DECK_Y, x2: x, y2: RAIL_Y, stroke: "#f4f6f8", "stroke-width": 1.2, opacity: 0.95 }, railG);
  sv("line", { x1: -208, y1: RAIL_Y, x2: 236, y2: RAIL_Y, stroke: "#f4f6f8", "stroke-width": 2 }, railG);
  sv("line", { x1: -208, y1: -57, x2: 236, y2: -57, stroke: "#f4f6f8", "stroke-width": 1.1, opacity: 0.8 }, railG);
  const signG = sv("g", { display: "none" }, railG);
  sv("line", { x1: 92, y1: DECK_Y, x2: 92, y2: -76, stroke: "#5b3d22", "stroke-width": 2.2 }, signG);
  sv("rect", { x: 54, y: -102, width: 76, height: 27, rx: 2.5, fill: "#ecd9a6", stroke: "#5b3d22", "stroke-width": 1.6 }, signG);
  [["NOTHING TO", -91], ["SEE HERE", -80]].forEach(([txt, y]) => {
    const t = sv("text", { x: 92, y, "text-anchor": "middle", "font-size": 9.2, "font-weight": 800, fill: "#5a3b1e", "font-family": FONT }, signG);
    t.textContent = txt;
  });
  // the band plays on, on the roof of the lower deck
  const bandG = sv("g", {}, railG);
  [[-132, "#c8423a"], [-124, "#2d5f9a"], [-116, "#e0b43a"]].forEach(([bx, col], i) => {
    const g = sv("g", { transform: `translate(${bx},-86)` }, bandG);
    sv("rect", { x: -2.6, y: -9, width: 5.2, height: 9, rx: 1.4, fill: "#1f2a3d" }, g);
    sv("rect", { x: -2.6, y: -5.6, width: 5.2, height: 1.1, fill: col }, g);
    sv("circle", { cx: 0, cy: -12, r: 2.7, fill: "#f0cfae" }, g);
    sv("path", { d: "M-2.8,-13.6 h5.6 v-2 h-5.6 z", fill: col }, g);
    if (i === 0) sv("path", { d: "M2,-8 l7,-3 l0,5 z", fill: "#e6b93d" }, g);
    else if (i === 1) sv("ellipse", { cx: 5, cy: -7, rx: 3, ry: 2, fill: "#a8683a" }, g);
    else sv("rect", { x: 1.8, y: -6, width: 6, height: 4, rx: 1, fill: "#d9d9d9" }, g);
  });
  const notes = [0, 1, 2].map(() => { const t = sv("text", { "font-size": 11, "font-weight": 800, "text-anchor": "middle", fill: "#f3c744" }, railG); t.textContent = "\u266a"; return t; });
  const surge = sv("path", { opacity: 0 }, svg);
  const smoke = [];
  for (let i = 0; i < 14; i++) smoke.push(sv("circle", {}, svg));
  const bowSpray = [];
  for (let i = 0; i < 6; i++) bowSpray.push(sv("ellipse", {}, svg));
  const steam = [];
  for (let i = 0; i < 6; i++) steam.push(sv("circle", { fill: "#ffffff", opacity: 0 }, svg));

  mkWave(WATER + 5, 5, 130, 1.0, "front", 1.6);
  const figFront = sv("g", {}, svg);
  const fxLayer = sv("g", {}, svg);
  const wreck = [0, 1, 2].map(() => sv("ellipse", { fill: "none", "stroke-width": 2, opacity: 0 }, fxLayer));
  const shark = sv("g", { opacity: 0 }, fxLayer);
  sv("path", { d: "M-10,0 Q-2,-4 3,-20 Q7,-8 11,0 Z", fill: "#8497a6" }, shark);
  sv("path", { d: "M-10,0 Q-2,-4 3,-20", fill: "none", stroke: "#d3dee6", "stroke-width": 1.2 }, shark);
  const sharkWake = sv("ellipse", { cx: 0, cy: 1.5, rx: 18, ry: 3, fill: "none", "stroke-width": 1.4 }, shark);
  const wordAttrs = { "text-anchor": "middle", "font-weight": 800, "font-family": FONT, stroke: "#0b1b2a", "stroke-width": 4, "paint-order": "stroke", "stroke-linejoin": "round", fill: "#ffd25e" };
  const honkWord = sv("text", { ...wordAttrs, "font-size": 22, opacity: 0 }, fxLayer);
  honkWord.textContent = "HOOONK!";
  const cards = [];
  for (let i = 0; i < 4; i++) {
    const g = sv("g", { display: "none" }, fxLayer);
    const paddles = [0, 1, 2].map(() => {
      const pg = sv("g", {}, g);
      sv("line", { x1: 0, y1: 0, x2: 0, y2: 14, stroke: "#7a6f60", "stroke-width": 2 }, pg);
      sv("rect", { x: -11, y: -24, width: 22, height: 26, rx: 3.5, fill: "#fffdf4", stroke: "#1b2733", "stroke-width": 1.8 }, pg);
      const t = sv("text", { x: 0, y: -6, "text-anchor": "middle", "font-size": 13, "font-weight": 800, "font-family": FONT, fill: "#1b2733" }, pg);
      return { pg, t };
    });
    cards.push({ g, paddles });
  }
  const splashes = [];
  for (let i = 0; i < 5; i++) {
    const g = sv("g", { display: "none" }, fxLayer);
    const col = sv("path", {}, g);
    const rip = [0, 1, 2].map(() => sv("ellipse", { fill: "none" }, g));
    const drops = []; for (let j = 0; j < 12; j++) drops.push(sv("circle", {}, g));
    const word = sv("text", { ...wordAttrs, "font-size": 17 }, g);
    splashes.push({ g, col, rip, drops, word, wordText: "" });
  }
  mkWave(WATER + 64, 8, 210, 1.35, "front2", 1.8);
  mkWave(WATER + 124, 11, 300, 1.8, "front3", 2);
  const tagLayer = sv("g", {}, svg);
  const vig = sv("rect", { x: 0, y: 0, width: 1000, height: H, fill: "url(#g-vig)", "pointer-events": "none" }, svg);

  // ---------- palette ----------
  function applyPalette(p) {
    pal = p;
    const set = (els, cols) => els.forEach((e, i) => e.setAttribute("stop-color", cols[i]));
    set(skyStops, [p.skyTop, p.skyMid, p.skyHorizon]);
    set(seaStops, [mix(p.seaFar, p.haze, 0.35), p.seaMid, p.seaDeep]);
    hazeStops.forEach(e => e.setAttribute("stop-color", p.haze));
    set(cloudStops, [p.cloudTop, p.cloudBot]);
    glowStops.forEach(e => e.setAttribute("stop-color", p.glow));
    set(supStops, [mix("#ffffff", p.skyHorizon, 0.28 + p.dark * 0.1), mix("#d3dbe3", p.seaDeep, 0.2 + p.dark * 0.5)]);
    set(hullStops, [mix("#2a3b57", p.skyHorizon, 0.12), mix("#0d1522", p.seaDeep, 0.3)]);
    set(funStops, [mix("#b8322d", p.seaDeep, p.dark * 0.45), mix("#e2493f", p.glow, 0.12 - p.dark * 0.1), mix("#9c2824", p.seaDeep, p.dark * 0.5)]);
    sunDisc.setAttribute("fill", p.sun);
    moonDisc.setAttribute("fill", p.sun);
    coast.setAttribute("fill", mix(p.seaFar, p.skyHorizon, 0.2));
    coast.setAttribute("opacity", 0.75);
    const fillFor = { far: mix(p.seaFar, p.seaMid, 0.25), farB: mix(p.seaFar, p.seaMid, 0.55), mid: p.seaMid, front: p.seaFront, front2: mix(p.seaFront, p.seaDeep, 0.55), front3: p.seaDeep };
    for (const w of waves) {
      w.fill.setAttribute("fill", fillFor[w.fillKey]);
      if (w.stroke) { w.stroke.setAttribute("stroke", p.crest); w.stroke.setAttribute("opacity", 0.55); w.stroke2.setAttribute("stroke", p.foam); w.stroke2.setAttribute("opacity", 0.4); }
    }
    const winCol = mix("#a8c9dc", "#ffd98a", p.dark), winOp = 0.55 + p.dark * 0.45;
    winEls.forEach(w => { w.setAttribute("fill", winCol); w.setAttribute("opacity", winOp); });
    smokeCol = mix("#d5dde3", p.seaDeep, p.dark * 0.7);
    smoke.forEach(s => s.setAttribute("fill", smokeCol));
    lastSput = null;
    gulls.forEach(g => g.setAttribute("stroke", dark ? "#d5deea" : "#34445a"));
    sharkWake.setAttribute("stroke", p.foam);
    wreck.forEach(w => w.setAttribute("stroke", p.foam));
    splashes.forEach(sp => { sp.col.setAttribute("fill", p.foam); sp.drops.forEach(d => d.setAttribute("fill", p.foam)); sp.rip.forEach(r => r.setAttribute("stroke", p.foam)); });
    wakeFoam.forEach(f => f.setAttribute("fill", p.foam));
    bowSpray.forEach(f => f.setAttribute("fill", p.foam));
    surge.setAttribute("fill", mix(p.foam, p.seaFront, 0.25));
    glitter.forEach(g => g.el.setAttribute("fill", p.glow));
    vig.setAttribute("opacity", dark ? 1 : 0.55);
  }

  function coastPath() {
    const T = 700;
    let d = `M${-T},${HORIZON + 2}`;
    for (let x = -T; x <= W + T; x += 14) {
      const k = x / T * 2 * Math.PI;
      const a = Math.sin(k) + Math.sin(k * 3 + 1.3) * 0.55 + Math.sin(k * 7 + 0.4) * 0.22;
      d += ` L${x},${HORIZON + 2 - Math.max(0, a - 0.55) * 20}`;
    }
    return d + ` L${W + T},${HORIZON + 2} Z`;
  }

  // ---------- layout ----------
  function layout(cw) {
    const narrow = cw < 560;
    W = narrow ? 620 : 1000;
    S = narrow ? 0.7 : 1;
    shipX = W * (narrow ? 0.64 : 0.6);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    for (const e of [skyRect, seaRect, hazeRect, vig]) e.setAttribute("width", W);
    for (const w of waves) {
      w.fill.setAttribute("d", wavePath(w, true));
      if (w.stroke) { w.stroke.setAttribute("d", wavePath(w, false)); w.stroke2.setAttribute("d", wavePath(w, false)); }
    }
    coast.setAttribute("d", coastPath());
    stars.forEach(s => s.el.setAttribute("cx", s.nx * W));
    remeasureTags();
    applyPalette(palette(lastPhase, dark));
  }

  // ---------- people ----------
  // Name tags only appear once someone is in the water, with punctuation stripped from the name
  // (apostrophes and hyphens inside a name are kept so names are not mangled).
  const tagLabel = name => String(name).replace(/[^\p{L}\p{N}\s'’-]/gu, "").replace(/\s+/g, " ").trim();
  function makeTag(label, denied) {
    const g = sv("g", { opacity: 0 }, tagLayer);
    const rect = sv("rect", { rx: 7, height: 21, style: "fill:var(--tag,#14212b);fill-opacity:.92" }, g);
    const txt = sv("text", { y: 14.5, x: 9, "font-size": 12.5, "font-weight": 600, "font-family": FONT, style: "fill:var(--tagtext,#fff)" }, g);
    txt.textContent = tagLabel(label);
    let fine = null;
    if (denied) { // the official line on a rumor: everything is fine (shown on the deck, without a name)
      fine = sv("g", { opacity: 0 }, tagLayer);
      sv("rect", { width: 78, height: 14, rx: 2.5, fill: "#ffd25e", stroke: "#5a3b1e", "stroke-width": 1 }, fine);
      const ft = sv("text", { x: 39, y: 10.4, "text-anchor": "middle", "font-size": 8.6, "font-weight": 800, "font-family": FONT, fill: "#5a3b1e" }, fine);
      ft.textContent = "TOTALLY FINE";
    }
    return { g, rect, txt, fine, w: 80 };
  }
  function remeasureTags() {
    for (const p of people) {
      let w = 0;
      try { w = p.tag.txt.getComputedTextLength(); } catch (e) { /* not rendered yet */ }
      if (!w) w = tagLabel(p.e.name).length * 7;
      p.tag.w = w + 18;
      p.tag.rect.setAttribute("width", p.tag.w);
    }
  }

  function setData(timeline) {
    tl = timeline;
    figLayer.replaceChildren(); figFront.replaceChildren(); tagLayer.replaceChildren();
    people = tl.people;
    let ji = 0, ri = 0;
    people.forEach((p, i) => {
      p.rumor = p.e.status === "rumor";
      p.h = hash(p.e.id);
      p.fig = makeFigure(p.e.id, figLayer, p.e);
      p.tag = makeTag(p.e.name, p.rumor && p.e.denied);
      p.row = i % 3;
      if (p.rumor) { p.slot = FORWARD[ri % FORWARD.length] - Math.floor(ri / FORWARD.length) * 9; ri++; }
      else { p.slot = PROMENADE[ji % PROMENADE.length]; ji++; }
      p.landLx = RAIL_X - 28 - (p.h % 40);
    });
    const extras = [];
    for (let i = 0; i < N_EXTRAS; i++) {
      const id = "extra-" + i;
      extras.push({ e: { id, name: "" }, extra: true, h: hash(id), fig: makeFigure(id, figLayer), slot: PROMENADE[(2 * i + 1) % PROMENADE.length] + 11, row: 0 });
    }
    all = people.concat(extras);
    const endDay = tl.endDay;
    all.forEach((p, i) => {
      p.idx = i;
      p.style = STYLES[(p.h >>> 6) % STYLES.length];
      p.scores = [0, 1, 2].map(j => Math.round((4.5 + (((p.h >>> (9 + j * 5)) & 31) / 31) * 5) * 2) / 2);
      p.bailer = !!p.extra && i >= people.length && i < people.length + 2;
      p.fig.root.style.cursor = "pointer";
      p.fig.root.addEventListener("click", () => { p.waveUntil = performance.now() / 1000 + 2.4; });
      const confirmed = !p.rumor && !p.extra;
      p.panic = endDay != null && (!confirmed || p.d > endDay - 0.05);
      if (p.panic) {
        p.tJ = endDay + ((p.h >>> 4) % 100) / 100 * 0.45 + 0.05;
        p.jl = JLP;
        p.side = (p.h & 1) ? 1 : -1;
        p.landDx = (28 + (p.h >>> 8) % 60) * p.side;
        p.landY = WATER + 22 + ((p.h >>> 12) % 34);
        p.tLand = p.tJ + PANIC.flight1 * JLP;
      } else if (confirmed) {
        p.tJ = p.d; p.jl = JL; p.landY = WATER - 3;
        p.tLand = p.d + NORMAL.flight1 * JL;
      } else { p.tJ = Infinity; p.tLand = Infinity; }
    });
    landings = all.filter(p => Number.isFinite(p.tLand)).map(p => ({ t: p.tLand, big: p.style.scale > 1.3 }));
    windows = all.filter(p => Number.isFinite(p.tJ) && !p.extra).map(p => [p.tJ - 0.12, p.tJ + p.jl * 1.2]);
    if (endDay != null) windows.push([endDay - 0.1, endDay + SINK_DAYS + 0.4]);
    remeasureTags();
    phaseKey = -1;
  }

  // ---------- per-frame ----------
  let ang = 0, off = 0, sc = 1;
  function pt(lx, ly) {
    const a = -ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const py = ly + 20;
    return [shipX + sc * (lx * ca - py * sa), WATER + off + sc * (lx * sa + py * ca - 20)];
  }

  function stateFor(p, t, sec, world) {
    const idle = reduce ? 0 : Math.sin(sec * 1.3 + p.idx * 1.7);
    const deckAt = (lx, extra) => {
      const [x, y] = pt(lx, DECK_Y);
      return Object.assign({ x, y, rot: -ang, k: sc, state: "deck", dir: 1 }, extra);
    };
    const standing = flip => deckAt(p.slot, { dir: flip ? -1 : 1, armsF: 4 + idle * 3, armsB: 4 - idle * 3, lean: idle * 1.2 });

    if (p.extra) {
      if (!p.panic || t < p.tJ) {
        if (p.bailer && bailing) return deckAt(p.slot, { dir: -1, lean: 16, armsF: 50 + (reduce ? 0 : Math.sin(sec * 5 + p.idx) * 45), armsB: 20, prop: "bucket" });
        return standing(p.h & 2);
      }
    } else if (p.rumor) {
      if (!p.panic || t < p.tJ) {
        const lean = 26 + (reduce ? 0 : Math.sin(sec * 0.9 + p.idx) * 4);
        const sweat = reduce ? 0.3 : (sec * 0.9 + p.idx * 0.37) % 1;
        const note = reduce ? 0 : Math.max(0, Math.sin(sec * 1.1 + p.idx * 2.1));
        return deckAt(p.slot, { lean, armsF: 62 + idle * 4, armsB: 52, dir: 1, state: "lean", sweat, note });
      }
    } else if (!p.panic) {
      const u = (t - p.d) / JL;
      if (u < 0) return standing(p.h & 4);
      if (u < 0.34) return deckAt(lerp(p.slot, RAIL_X, u / 0.34), { dir: -1, walk: u * 70, armsF: 0, armsB: 0, lean: 3, state: "walk" });
      if (u < 0.52) {
        const h = (u - 0.34) / 0.18;
        return deckAt(RAIL_X, { dir: -1, lean: -7 + 22 * ease(h) + Math.sin(h * 20) * 4, armsF: 38 + Math.sin(h * 15) * 26, armsB: 24 + Math.cos(h * 15) * 20, state: "hesitate" });
      }
      if (u < 0.6) {
        const c = ease((u - 0.52) / 0.08);
        const [x, y0] = pt(RAIL_X, DECK_Y), [, y1] = pt(RAIL_X, RAIL_Y);
        return { x, y: lerp(y0, y1, c), rot: -ang, k: sc, dir: -1, lean: 26, armsF: 70, armsB: 60, legTuck: 0.2 * c, state: "climb" };
      }
    }

    // ---- leap and water phases (normal jumpers and the final panic share this) ----
    const ph = p.panic ? PANIC : NORMAL;
    const startLx = p.panic ? p.slot : RAIL_X;
    const u = (t - p.tJ) / p.jl;
    if (u < 0) return standing(p.h & 4);
    if (p.panic && u < ph.flight0) {
      const c = ease(u / ph.flight0);
      const [x, y0] = pt(startLx, DECK_Y), [, y1] = pt(startLx, RAIL_Y);
      return { x, y: lerp(y0, y1, c), rot: -ang, k: sc, dir: p.side, lean: 20, armsF: 100, armsB: 90, state: "climb" };
    }
    let wxLand, landY, sideDir;
    if (p.panic) { wxLand = p.tLand * PX + shipX + sc * (p.slot + p.landDx); landY = p.landY; sideDir = p.side; }
    else { wxLand = p.tLand * PX + shipX + sc * p.landLx; landY = p.landY; sideDir = -1; }
    p.wxLand = wxLand;
    const tx = wxLand - world;
    const floatY = landY + 9;
    const i = p.idx;
    if (u < ph.flight1) {
      const e = (u - ph.flight0) / (ph.flight1 - ph.flight0);
      const [sx, sy] = pt(startLx, RAIL_Y);
      const arc = 44 + (p.h % 16);
      const fp = flightPose(p.style, e, sideDir);
      return {
        x: lerp(sx, tx, e), y: lerp(sy, landY, e) - arc * 4 * e * (1 - e), rot: fp.rot, k: sc, dir: sideDir,
        armsF: fp.armsF, armsB: fp.armsB, legTuck: fp.legTuck, lean: fp.lean, prop: fp.prop, state: "flight",
      };
    }
    if (u < ph.under) {
      const c = (u - ph.flight1) / (ph.under - ph.flight1);
      return { x: tx, y: landY + 30 * ease(c), rot: flightPose(p.style, 1, sideDir).rot, k: sc, dir: sideDir, armsF: 150, armsB: 140, legTuck: 0.4, fade: 1 - c, state: "under" };
    }
    const fl = reduce ? 0 : Math.sin(sec * 2 + i) * 2.4;
    if (u < ph.pop) {
      const c = (u - ph.under) / (ph.pop - ph.under);
      return { x: tx, y: lerp(landY + 28, floatY, backOut(c)) + fl * c, rot: 0, k: sc, dir: -1, ring: c01(c * 1.5), armsF: lerp(150, 28, c), armsB: lerp(140, 22, c), lean: 0, fade: c01(c * 4), state: "pop" };
    }
    const wave = reduce ? 0 : Math.sin(sec * 1.7 + i * 2);
    const waving = !reduce && p.waveUntil && sec < p.waveUntil;
    return { x: tx, y: floatY + fl, rot: wave * 3, k: sc, dir: -1, ring: 1, armsF: waving ? 165 + Math.sin(sec * 16) * 18 : 28 + wave * 9, armsB: 22 - wave * 7, lean: wave * 2.5, state: "float" };
  }

  function render(t, sec) {
    sc = S;
    const sk = sinkState(t, tl);
    const fin = sk.final;
    ang = sk.list + (reduce ? 0 : Math.sin(sec * 1.05) * 0.9);
    off = (reduce ? 0 : Math.sin(sec * 1.4) * 1.8) + sk.level * 46 * sc + ease(c01((fin - 0.3) / 0.7)) * 330 * sc;
    const world = t * PX;
    let landedN = 0;
    for (const p of people) if (!p.rumor && t >= p.tLand) landedN++;
    bailing = landedN >= 2 || sk.wash > 0.1;
    const honkK = honkAt == null ? 2 : (sec - honkAt) / 0.9;
    if (honkK >= 0 && honkK < 1) off -= Math.sin(honkK * 12) * (1 - honkK) * 3 * sc;

    // lighting across the timeline
    const phase = c01(t / Math.max(tl.end, 1));
    const key = Math.round(phase * 200) + (dark ? 1000 : 0);
    if (key !== phaseKey) { phaseKey = key; lastPhase = phase; applyPalette(palette(phase, dark)); }

    const sunX = W * lerp(0.2, 0.7, phase), sunY = lerp(86, HORIZON - 26, Math.pow(phase, 1.3));
    const moonX = W * lerp(0.82, 0.3, phase), moonY = lerp(70, 112, phase);
    const cx = dark ? moonX : sunX, cy = dark ? moonY : sunY;
    sunG.setAttribute("transform", `translate(${sunX.toFixed(1)},${sunY.toFixed(1)})`); sunG.setAttribute("display", dark ? "none" : "");
    moonG.setAttribute("transform", `translate(${moonX.toFixed(1)},${moonY.toFixed(1)})`); moonG.setAttribute("display", dark ? "" : "none");
    glow.setAttribute("cx", cx.toFixed(1)); glow.setAttribute("cy", cy.toFixed(1)); glow.setAttribute("opacity", dark ? 0.45 : 0.75);
    const starA = dark ? 1 : c01((phase - 0.72) / 0.28) * 0.7;
    for (const s of stars) s.el.setAttribute("opacity", (starA * s.base * (s.tw && !reduce ? 0.65 + 0.35 * Math.sin(sec * 2 + s.ph) : 1)).toFixed(2));

    for (const c of clouds) {
      const span = W + 360, sp = c.far ? 0.07 : 0.2;
      const x = (((c.x - world * sp - (reduce ? 0 : sec * (c.far ? 1 : 2.5))) % span) + span) % span - 180;
      c.g.setAttribute("transform", `translate(${x.toFixed(1)},${c.y}) scale(${c.sc})`);
    }
    coast.setAttribute("transform", `translate(${(-((world * 0.03) % 700)).toFixed(1)},0)`);

    const gl = dark ? 0.5 : c01(0.35 + phase * 0.6);
    for (const g of glitter) {
      const tw = reduce ? 0.7 : 0.5 + 0.5 * Math.sin(sec * 3 + g.ph + g.y * 0.2);
      g.el.setAttribute("x", (cx + g.off * g.w * 1.6 - g.w / 2).toFixed(1)); g.el.setAttribute("y", g.y); g.el.setAttribute("width", g.w);
      g.el.setAttribute("opacity", (gl * tw * 0.55).toFixed(2));
    }

    for (const w of waves) {
      const drift = reduce ? 0 : sec * (4 + w.speed * 14);
      const o = -(((world * w.speed + drift) % w.P) + w.P) % w.P;
      const bobY = reduce ? 0 : Math.sin(sec * 0.9 + w.speed * 3) * w.amp * 0.25;
      w.fill.setAttribute("transform", `translate(${o.toFixed(1)},${bobY.toFixed(2)})`);
      if (w.stroke) {
        w.stroke.setAttribute("transform", `translate(${o.toFixed(1)},${bobY.toFixed(2)})`);
        w.stroke2.setAttribute("transform", `translate(${(o - w.P * 0.22).toFixed(1)},${(bobY - w.amp * 0.15).toFixed(2)})`);
      }
    }

    const tr = `translate(${shipX.toFixed(1)},${(WATER + off).toFixed(1)}) scale(${sc}) rotate(${(-ang).toFixed(2)},0,-20)`;
    shipG.setAttribute("transform", tr);
    railG.setAttribute("transform", tr);
    reflUse.setAttribute("transform", tr);
    const alive = 1 - c01(fin * 1.4);
    reflOuter.setAttribute("opacity", (0.5 * alive).toFixed(2));
    shadow.setAttribute("cx", shipX); shadow.setAttribute("cy", WATER + 6); shadow.setAttribute("rx", 235 * sc);
    shadow.setAttribute("opacity", alive.toFixed(2));

    const sternX = shipX - 205 * sc, wakeA = 1 - c01(fin * 1.6);
    wakeBand.setAttribute("d", `M${sternX},${WATER - 2} L${sternX - 280 * sc},${WATER - 14} L${sternX - 330 * sc},${WATER + 20} L${sternX},${WATER + 8} Z`);
    wakeBand.setAttribute("opacity", (0.45 * wakeA).toFixed(2));
    for (let i = 0; i < wakeFoam.length; i++) {
      const ph = reduce ? i / wakeFoam.length : ((sec * 0.28 + i / wakeFoam.length) % 1);
      const r = (5 + ph * 17) * sc, el = wakeFoam[i];
      el.setAttribute("cx", (sternX - 6 - ph * 300 * sc).toFixed(1));
      el.setAttribute("cy", (WATER + 3 + (i % 4) * 3.2 + ph * (i % 2 ? 5 : -3)).toFixed(1));
      el.setAttribute("rx", r.toFixed(1)); el.setAttribute("ry", (r * 0.2).toFixed(1));
      el.setAttribute("opacity", ((1 - ph) * 0.5 * wakeA).toFixed(2));
    }
    const bowX = shipX + 228 * sc;
    for (let i = 0; i < bowSpray.length; i++) {
      const ph = reduce ? i / bowSpray.length : ((sec * 0.7 + i / bowSpray.length) % 1), el = bowSpray[i];
      el.setAttribute("cx", (bowX + ph * 20 * sc).toFixed(1));
      el.setAttribute("cy", (WATER + 4 - Math.sin(ph * Math.PI) * 9 * sc).toFixed(1));
      el.setAttribute("rx", ((3 + ph * 7) * sc).toFixed(1)); el.setAttribute("ry", ((2 + ph * 2) * sc).toFixed(1));
      el.setAttribute("opacity", ((1 - ph) * 0.65 * wakeA).toFixed(2));
    }
    for (let i = 0; i < smoke.length; i++) {
      const ph = reduce ? i / smoke.length : ((sec * 0.22 + i / smoke.length) % 1);
      const [sx, sy] = pt(-58 + (i % 3) * 52, -170), el = smoke[i];
      el.setAttribute("cx", (sx - ph * 90 * sc).toFixed(1));
      el.setAttribute("cy", (sy - ph * 34 * sc - (reduce ? 0 : Math.sin(sec + i) * 2)).toFixed(1));
      el.setAttribute("r", ((4 + ph * 14) * sc).toFixed(1));
      const cough = fin > 0 && fin < 1 ? 0.25 + 0.75 * Math.max(0, Math.sin(sec * 9 + i * 1.3)) : 1;
      el.setAttribute("opacity", ((1 - ph) * 0.42 * cough * (1 - c01(fin * 1.1))).toFixed(2));
    }

    // water washing over the deck
    if (sk.wash > 0.01) {
      const n = 22, amp = sk.wash * 9 + ease(fin) * 10;
      let d = "";
      for (let i = 0; i <= n; i++) {
        const lx = -210 + (450 / n) * i;
        const ly = DECK_Y - 3 - amp * (0.5 + 0.5 * Math.sin(lx * 0.07 + (reduce ? 0 : sec * 2.6))) - sk.wash * 4;
        const [x, y] = pt(lx, ly);
        d += (i ? " L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
      }
      const [x1, y1] = pt(240, DECK_Y + 6), [x0, y0] = pt(-210, DECK_Y + 6);
      surge.setAttribute("d", d + ` L${x1.toFixed(1)},${y1.toFixed(1)} L${x0.toFixed(1)},${y0.toFixed(1)} Z`);
      surge.setAttribute("opacity", (0.55 * sk.wash).toFixed(2));
    } else surge.setAttribute("opacity", 0);

    // gags: patches, sign, band, gulls, shark, honk
    if (landedN !== lastPatches) { lastPatches = landedN; patchEls.forEach((g, i) => g.setAttribute("display", i < landedN ? "" : "none")); }
    const showSign = landedN >= 2 || fin > 0;
    if (showSign !== lastSign) { lastSign = showSign; signG.setAttribute("display", showSign ? "" : "none"); }
    notes.forEach((n, i) => {
      const ph = reduce ? 0.3 + i * 0.2 : (sec * 0.6 + i / 3) % 1;
      n.setAttribute("transform", `translate(${(-122 + Math.sin(ph * 7 + i) * 5 + ph * 8).toFixed(1)},${(-108 - ph * 34).toFixed(1)})`);
      n.setAttribute("opacity", ((1 - ph) * 0.95).toFixed(2));
    });
    const leaveT = tl.endDay != null ? tl.endDay - 0.25 : Infinity;
    gulls.forEach((g, k) => {
      const away = t > leaveT ? t - leaveT : 0;
      const a = reduce ? k * 1.57 : sec * 0.32 + k * 1.57;
      const f = reduce ? 0.3 : Math.sin(sec * (6 + k) + k);
      g.setAttribute("d", `M-7,${(2 + f * 3).toFixed(1)} Q-3.5,${(-3 - f * 3).toFixed(1)} 0,0 Q3.5,${(-3 - f * 3).toFixed(1)} 7,${(2 + f * 3).toFixed(1)}`);
      g.setAttribute("transform", `translate(${(shipX + Math.sin(a) * (190 + k * 45) * sc + away * PX * 3.2).toFixed(1)},${(70 + k * 26 + Math.cos(a * 1.3) * 12 - away * 40).toFixed(1)}) scale(${(0.9 + k * 0.12).toFixed(2)})`);
      g.setAttribute("opacity", c01(1 - away / 1.2).toFixed(2));
    });
    const sharkA = c01((fin - 0.25) / 0.2);
    shark.setAttribute("opacity", sharkA.toFixed(2));
    if (sharkA > 0) {
      const ph = reduce ? 0.7 : sec * 0.42;
      shark.setAttribute("transform", `translate(${(shipX - 150 * sc + Math.sin(ph) * 190 * sc).toFixed(1)},${(WATER + 34).toFixed(1)}) scale(${(Math.cos(ph) >= 0 ? sc * 1.6 : -sc * 1.6).toFixed(2)},${(sc * 1.6).toFixed(2)})`);
      sharkWake.setAttribute("rx", (16 + (reduce ? 0 : Math.sin(sec * 3) * 3)).toFixed(1));
    }
    const sputter = fin > 0 && fin < 1;
    if (sputter !== lastSput) { lastSput = sputter; smoke.forEach(sm => sm.setAttribute("fill", sputter ? "#2d3238" : smokeCol)); }
    for (let i = 0; i < steam.length; i++) {
      const k = c01((honkK - Math.floor(i / 3) * 0.15) / 0.7);
      const [sx, sy] = pt(-64 + (i % 3) * 52, -172);
      const el = steam[i];
      el.setAttribute("cx", (sx - k * 18 * sc).toFixed(1)); el.setAttribute("cy", (sy - k * 50 * sc).toFixed(1));
      el.setAttribute("r", ((4 + k * 16) * sc).toFixed(1));
      el.setAttribute("opacity", honkK >= 0 && honkK < 1.2 && k > 0 ? ((1 - k) * 0.9).toFixed(2) : 0);
    }
    if (honkK >= 0 && honkK < 1) {
      const [hx, hy] = pt(-10, -200);
      honkWord.setAttribute("transform", `translate(${hx.toFixed(1)},${(hy - honkK * 18).toFixed(1)}) rotate(-4) scale(${backOut(c01(honkK * 4)).toFixed(2)})`);
      honkWord.setAttribute("opacity", (honkK < 0.75 ? 1 : 1 - (honkK - 0.75) / 0.25).toFixed(2));
    } else honkWord.setAttribute("opacity", 0);

    // figures, tags, splashes
    let overN = 0, latest = null, splashN = 0, cardN = 0;
    for (const p of all) {
      const s = stateFor(p, t, sec, world);
      const onScreen = s.x > -90 && s.x < W + 90;
      const front = p.panic && s.state !== "deck" && s.state !== "lean" && s.state !== "climb";
      const par = front ? figFront : figLayer;
      if (p.fig.root.parentNode !== par) par.appendChild(p.fig.root);
      if (!onScreen) p.fig.root.setAttribute("display", "none");
      else {
        p.fig.root.setAttribute("display", "");
        pose(p.fig, s);
        p.fig.root.setAttribute("opacity", s.fade == null ? 1 : s.fade.toFixed(2));
      }
      if (!p.rumor && !p.extra) {
        if (s.state === "float" || s.state === "pop") overN++;
        if (t >= p.tLand && (!latest || p.tLand >= latest.tLand)) latest = p;
        if (!p.panic && t >= p.tLand + 0.12 && t < p.tLand + 0.12 + SCORE_DAYS && cardN < cards.length && onScreen) {
          drawCard(cards[cardN++], (t - p.tLand - 0.12) / SCORE_DAYS, p.wxLand - world, p.landY - 72, p.scores);
        }
      }
      if (Number.isFinite(p.tLand) && t >= p.tLand && t < p.tLand + SPL && splashN < splashes.length && onScreen) {
        drawSplash(splashes[splashN++], (t - p.tLand) / SPL, p.wxLand - world, p.landY + 6, p.h, p.style);
      }
      if (p.tag) {
        const show = onScreen && (s.state === "float" || s.state === "pop");
        if (show) {
          const top = s.y - 58 - p.row * 17;
          const tx = Math.max(4, Math.min(W - p.tag.w - 4, s.x - p.tag.w / 2));
          p.tag.g.setAttribute("transform", `translate(${tx.toFixed(1)},${top.toFixed(1)})`);
          p.tag.g.setAttribute("opacity", s.state === "pop" ? 0.7 : 1);
        } else p.tag.g.setAttribute("opacity", 0);
        if (p.tag.fine) {
          if (onScreen && s.state === "lean") {
            p.tag.fine.setAttribute("transform", `translate(${(s.x - 39).toFixed(1)},${(s.y - 62 * sc).toFixed(1)}) rotate(-2)`);
            p.tag.fine.setAttribute("opacity", 1);
          } else p.tag.fine.setAttribute("opacity", 0);
        }
      }
    }
    for (let i = splashN; i < splashes.length; i++) splashes[i].g.setAttribute("display", "none");
    for (let i = cardN; i < cards.length; i++) cards[i].g.setAttribute("display", "none");

    if (fin > 0.8) {
      const k = c01((fin - 0.8) / 0.2);
      wreck.forEach((w, j) => {
        const kk = c01(k * 1.2 - j * 0.18);
        w.setAttribute("cx", shipX + 10); w.setAttribute("cy", WATER + 8);
        w.setAttribute("rx", ((20 + kk * 190) * sc).toFixed(1)); w.setAttribute("ry", ((4 + kk * 34) * sc).toFixed(1));
        w.setAttribute("opacity", ((1 - kk) * 0.7).toFixed(2));
      });
    } else wreck.forEach(w => w.setAttribute("opacity", 0));

    return { overN, latest, sink: sk };
  }

  function drawCard(cd, s, x, y, scores) {
    cd.g.setAttribute("display", "");
    cd.g.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    const out = c01((s - 0.8) / 0.2);
    cd.paddles.forEach((pd, j) => {
      const k = c01((s - j * 0.07) / 0.14);
      pd.pg.setAttribute("transform", `translate(${(j - 1) * 28},${(-out * 12 + (1 - backOut(k)) * 20).toFixed(1)}) rotate(${(j - 1) * 6}) scale(${k > 0 ? 1 : 0})`);
      pd.pg.setAttribute("opacity", (c01(k * 3) * (1 - out)).toFixed(2));
      const txt = scores[j].toFixed(1);
      if (pd.t.textContent !== txt) pd.t.textContent = txt;
    });
  }

  function drawSplash(sp, s, x, y, h, style) {
    const k = style.scale;
    sp.g.setAttribute("display", "");
    sp.g.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${k})`);
    if (sp.wordText !== style.word) { sp.wordText = style.word; sp.word.textContent = style.word; }
    const wk = c01((s - 0.04) / 0.16);
    sp.word.setAttribute("transform", `translate(0,${((-92 - s * 10) / k).toFixed(1)}) rotate(-5) scale(${(backOut(wk) / k).toFixed(2)})`);
    sp.word.setAttribute("opacity", (c01(wk * 3) * (1 - c01((s - 0.5) / 0.35))).toFixed(2));
    const rise = c01(s / 0.28);
    const colH = Math.sin(rise * Math.PI) * 30 * (1 - c01((s - 0.2) / 0.3));
    sp.col.setAttribute("d", colH > 1 ? `M-9,2 Q-4,${(-colH * 0.7).toFixed(1)} 0,${(-colH).toFixed(1)} Q4,${(-colH * 0.7).toFixed(1)} 9,2 Z` : "");
    sp.col.setAttribute("opacity", (0.85 * (1 - s)).toFixed(2));
    sp.rip.forEach((r, j) => {
      const k = c01(s * 1.25 - j * 0.16), rx = 6 + k * (34 + j * 16);
      r.setAttribute("rx", rx.toFixed(1)); r.setAttribute("ry", (rx * 0.27).toFixed(1)); r.setAttribute("cy", 2);
      r.setAttribute("stroke-width", (2.4 * (1 - k) + 0.3).toFixed(2)); r.setAttribute("opacity", ((1 - k) * 0.85).toFixed(2));
    });
    sp.drops.forEach((d, j) => {
      const a = (j / sp.drops.length - 0.5) * 2.4 + (((h >>> j) & 3) - 1.5) * 0.06;
      const v = 52 + ((h >>> (j + 2)) & 15) * 3.2;
      const tt = c01(s / 0.85) * 0.9;
      d.setAttribute("cx", (Math.sin(a) * v * tt * 1.15).toFixed(1));
      d.setAttribute("cy", (-Math.cos(a) * v * tt * 1.4 + 120 * tt * tt).toFixed(1));
      d.setAttribute("r", (2.6 * (1 - s * 0.7)).toFixed(2));
      d.setAttribute("opacity", s < 0.85 ? (1 - s).toFixed(2) : 0);
    });
  }

  function setDark(v) { if (dark !== v) { dark = v; phaseKey = -1; } }

  return {
    layout, setData, render, setDark,
    honk(sec) { honkAt = reduce ? null : sec; },
    get width() { return W; }, get windows() { return windows; }, get landings() { return landings; }, get ship() { return shipG; },
  };
}
