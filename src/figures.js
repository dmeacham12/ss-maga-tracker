// Stylized generic figures. Not likenesses: appearance is derived from a hash of the entry id,
// never from who the person is.

const NS = "http://www.w3.org/2000/svg";
export function sv(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (arr, h, shift) => arr[((h >>> shift) & 0xffff) % arr.length];

const SKIN = ["#f4d6bb", "#e6b48c", "#c58a62", "#94613f", "#65432c"];
const HAIR = ["#2a2018", "#5d4128", "#b98d4e", "#9a9a9a", "#171717", "#7d351b"];
const CLOTH = ["#33506b", "#5a3c5e", "#2f6a58", "#8a4a3b", "#3c3c4a", "#6b7b91", "#a55868", "#bf9a42", "#3b6ea5", "#76593b"];
const TIES = ["#c8423a", "#2d5f9a", "#e0b43a", "#3f8a6b", "#7a3a8a"];

export function look(id) {
  const h = hash(id);
  return {
    skin: pick(SKIN, h, 0), hair: pick(HAIR, h, 3), cloth: pick(CLOTH, h, 6), tie: pick(TIES, h, 9),
    style: (h >>> 12) % 5, outfit: (h >>> 15) % 4,
    bw: 0.88 + ((h >>> 18) % 28) / 100, bh: 0.93 + ((h >>> 22) % 16) / 100,
    pants: pick(["#26313d", "#3a3f4a", "#2c3a4d", "#4a3b34"], h, 25),
  };
}

/** Build one figure. Feet at (0,0), height about 40 units. Returns refs for posing. */
export function makeFigure(id, parent) {
  const L = look(id);
  const root = sv("g", {}, parent);
  const body = sv("g", {}, root);
  const legs = sv("g", {}, body);
  const legL = sv("rect", { x: -3.6, y: -17, width: 3.4, height: 17, rx: 1.6, fill: L.pants }, legs);
  const legR = sv("rect", { x: 0.2, y: -17, width: 3.4, height: 17, rx: 1.6, fill: L.pants }, legs);
  sv("rect", { x: -4, y: -1.6, width: 4.4, height: 2.6, rx: 1.2, fill: "#171c22" }, legs);
  sv("rect", { x: -0.4, y: -1.6, width: 4.4, height: 2.6, rx: 1.2, fill: "#171c22" }, legs);

  const ringBack = sv("g", {}, root);
  const body2 = body; // body stays above the back arc
  root.appendChild(body);
  const upper = sv("g", {}, body);
  const armB = sv("g", {}, upper); // far arm, drawn behind torso
  sv("rect", { x: -1.6, y: 0, width: 3.2, height: 11, rx: 1.6, fill: L.cloth, opacity: 0.8 }, armB);
  sv("circle", { cx: 0, cy: 11.5, r: 1.9, fill: L.skin }, armB);

  // torso / outfit
  if (L.outfit === 2) { // dress
    sv("path", { d: "M-5.4,-30 L5.4,-30 L7.6,-10 L-7.6,-10 Z", fill: L.cloth }, upper);
  } else if (L.outfit === 1) { // blazer + skirt
    sv("path", { d: "M-5.4,-30 L5.4,-30 L5,-18 L-5,-18 Z", fill: L.cloth }, upper);
    sv("path", { d: "M-5,-18 L5,-18 L6.4,-9 L-6.4,-9 Z", fill: L.pants }, upper);
    sv("path", { d: "M-1.6,-30 L0,-24 L1.6,-30 Z", fill: "#ffffff" }, upper);
  } else { // suit or casual
    sv("path", { d: "M-5.6,-30 Q0,-32 5.6,-30 L5.2,-15 L-5.2,-15 Z", fill: L.cloth }, upper);
    if (L.outfit === 0) {
      sv("path", { d: "M-1.8,-30 L0,-26 L1.8,-30 Z", fill: "#ffffff" }, upper);
      sv("path", { d: "M-0.9,-27 L0.9,-27 L1.3,-19 L0,-17.5 L-1.3,-19 Z", fill: L.tie }, upper);
    } else {
      sv("rect", { x: -5.4, y: -17.5, width: 10.8, height: 2.2, fill: "#00000022" }, upper);
    }
  }
  // head + hair
  sv("rect", { x: -1.6, y: -34, width: 3.2, height: 4, fill: L.skin }, upper);
  sv("circle", { cx: 0, cy: -37, r: 5.6, fill: L.skin }, upper);
  const hs = L.style;
  if (hs === 0) sv("path", { d: "M-5.8,-37 Q-5.8,-44 0,-43.6 Q5.8,-44 5.8,-37 Q2,-40.5 -2,-39.5 Q-4.5,-39 -5.8,-37 Z", fill: L.hair }, upper);
  else if (hs === 1) sv("path", { d: "M-6.2,-35 Q-7,-45 0,-44.4 Q7,-45 6.2,-35 L6.4,-27 Q4,-30 4.4,-37 Q0,-41 -4.4,-37 Q-4,-30 -6.4,-27 Z", fill: L.hair }, upper);
  else if (hs === 3) { sv("circle", { cx: -1, cy: -45, r: 3.4, fill: L.hair }, upper); sv("path", { d: "M-5.8,-37 Q-5.6,-43.6 0,-43.2 Q5.6,-43.6 5.8,-37 Q0,-41.6 -5.8,-37 Z", fill: L.hair }, upper); }
  else if (hs === 4) sv("path", { d: "M-5.8,-37 Q-5,-44.4 1,-43.8 Q6,-43 5.8,-37 Q3,-41 -1,-40.6 Q-4,-40 -5.8,-37 Z", fill: L.hair }, upper);
  // style 2: bald, no hair
  sv("circle", { cx: 2.4, cy: -37, r: 0.7, fill: "#1b1f24" }, upper); // eye (faces +x)

  const armF = sv("g", {}, upper); // near arm, in front
  sv("rect", { x: -1.7, y: 0, width: 3.4, height: 11, rx: 1.7, fill: L.cloth }, armF);
  sv("circle", { cx: 0, cy: 11.6, r: 2, fill: L.skin }, armF);
  const caseEl = sv("g", { display: "none" }, armF);
  sv("rect", { x: -5, y: 11, width: 10, height: 7.5, rx: 1.2, fill: "#7a4a24" }, caseEl);
  sv("rect", { x: -2, y: 9.4, width: 4, height: 2, rx: 0.8, fill: "none", stroke: "#4a2c12", "stroke-width": 0.9 }, caseEl);
  sv("rect", { x: -0.6, y: 13.4, width: 1.2, height: 1.6, fill: "#e6c27a" }, caseEl);
  const bucketEl = sv("path", { d: "M-4.5,11 L4.5,11 L3.4,18 L-3.4,18 Z", fill: "#7d8a96", display: "none" }, armF);

  armB.setAttribute("transform", "translate(0,-28)");
  armF.setAttribute("transform", "translate(0,-28)");
  const sweat = [0, 1].map(() => sv("path", { d: "M0,-3 Q2.2,0 0,1.6 Q-2.2,0 0,-3 Z", fill: "#7fd0ff", display: "none" }, upper));
  const note = sv("text", { "font-size": 9, "font-weight": 800, fill: "#e8b73a", display: "none" }, upper);
  note.textContent = "♪";
  const ringFront = sv("g", {}, root);
  const arc = (g, d) => {
    sv("path", { d, fill: "none", stroke: "#ffffff", "stroke-width": 5.4, "stroke-linecap": "butt" }, g);
    sv("path", { d, fill: "none", stroke: "#e23b36", "stroke-width": 5.4, pathLength: 8, "stroke-dasharray": "1 1" }, g);
    sv("path", { d, fill: "none", stroke: "#0000002e", "stroke-width": 0.8 }, g);
  };
  arc(ringBack, "M-14,-13 A14,5.6 0 0 1 14,-13");
  arc(ringFront, "M-14,-13 A14,5.6 0 0 0 14,-13");
  const ring = { back: ringBack, front: ringFront };
  return { root, body, legs, upper, legL, legR, armB, armF, ring, caseEl, bucketEl, sweat, note, L };
}

/**
 * Pose a figure. s = { x, y, rot, dir, walk, armsB, armsF, lean, legTuck, ring (0..1), swim }
 *  walk: phase in radians (leg swing), armsB/armsF: degrees (0 = hanging, 180 = straight up)
 */
export function pose(f, s) {
  const L = f.L;
  f.root.setAttribute("transform",
    `translate(${s.x.toFixed(1)},${s.y.toFixed(1)}) rotate(${(s.rot || 0).toFixed(1)},0,-17) scale(${((s.dir || 1) * L.bw * (s.k || 1)).toFixed(3)},${(L.bh * (s.k || 1)).toFixed(3)})`);
  const sw = Math.sin(s.walk || 0) * 26;
  const tuck = s.legTuck || 0;
  f.legL.setAttribute("transform", `rotate(${(sw - tuck * 40).toFixed(1)},-1.9,-17)`);
  f.legR.setAttribute("transform", `rotate(${(-sw + tuck * 28).toFixed(1)},1.9,-17)`);
  f.upper.setAttribute("transform", `rotate(${(s.lean || 0).toFixed(1)},0,-16)`);
  f.armF.setAttribute("transform", `translate(0,-28) rotate(${(-(s.armsF || 0) + (s.walk ? -sw * 0.5 : 0)).toFixed(1)})`);
  f.armB.setAttribute("transform", `translate(0,-28) rotate(${(-(s.armsB || 0) + (s.walk ? sw * 0.5 : 0)).toFixed(1)})`);
  f.caseEl.setAttribute("display", s.prop === "case" ? "" : "none");
  f.bucketEl.setAttribute("display", s.prop === "bucket" ? "" : "none");
  const sw0 = s.sweat;
  f.sweat.forEach((d, i) => {
    if (sw0 == null) { d.setAttribute("display", "none"); return; }
    const k = (sw0 + i * 0.5) % 1;
    d.setAttribute("display", "");
    d.setAttribute("opacity", (1 - k).toFixed(2));
    d.setAttribute("transform", `translate(${(i ? -8 : 8.4).toFixed(1)},${(-44 + k * 12).toFixed(1)})`);
  });
  if (s.note > 0.02) {
    f.note.setAttribute("display", "");
    f.note.setAttribute("opacity", s.note.toFixed(2));
    f.note.setAttribute("transform", `translate(4,${(-44 - s.note * 5).toFixed(1)})`);
  } else f.note.setAttribute("display", "none");
  const swim = s.ring || 0;
  f.legs.setAttribute("opacity", swim > 0.5 ? 0 : 1);
  for (const g of [f.ring.back, f.ring.front]) {
    if (swim > 0) {
      g.setAttribute("display", "");
      g.setAttribute("transform", `translate(0,-13) scale(${swim.toFixed(2)}) translate(0,13)`);
    } else g.setAttribute("display", "none");
  }
}
