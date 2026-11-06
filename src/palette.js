// Sky / sea / light palettes. Light mode drifts from clear day to a sunset across the timeline;
// dark mode stays night and just deepens, with the moon crossing the sky.

const KEYS = ["skyTop", "skyMid", "skyHorizon", "haze", "sun", "seaFar", "seaMid", "seaDeep", "seaFront", "foam", "crest", "cloudTop", "cloudBot", "glow"];

const DAY = {
  skyTop: "#4a9be0", skyMid: "#8cc8ee", skyHorizon: "#d6eef7", haze: "#e4f3f8", sun: "#fff3c4",
  seaFar: "#7fbbd6", seaMid: "#2f86b4", seaDeep: "#12527c", seaFront: "#1b6a96", foam: "#f2fbff", crest: "#bfe6f5",
  cloudTop: "#ffffff", cloudBot: "#cfe3ee", glow: "#fff7d6",
};
const GOLD = {
  skyTop: "#3f78c0", skyMid: "#9fb4d4", skyHorizon: "#ffd7a1", haze: "#ffe3bd", sun: "#ffe08a",
  seaFar: "#d9a982", seaMid: "#3a739d", seaDeep: "#143f66", seaFront: "#215b86", foam: "#fff3e0", crest: "#ffd9a8",
  cloudTop: "#fff0d8", cloudBot: "#e3a77f", glow: "#ffd48a",
};
const DUSK = {
  skyTop: "#232f68", skyMid: "#8a4f86", skyHorizon: "#f58a62", haze: "#f6a283", sun: "#ff9a58",
  seaFar: "#b8607a", seaMid: "#3d3f78", seaDeep: "#14194a", seaFront: "#25306a", foam: "#ffe3d6", crest: "#ff9d7a",
  cloudTop: "#ffb08a", cloudBot: "#6d3d78", glow: "#ff8c4d",
};
const NIGHT_A = {
  skyTop: "#030816", skyMid: "#0b1a38", skyHorizon: "#1d3b5e", haze: "#244566", sun: "#f3f1d8",
  seaFar: "#17324f", seaMid: "#0c2a47", seaDeep: "#041424", seaFront: "#0a2a47", foam: "#a9cde0", crest: "#6e9ec0",
  cloudTop: "#34506e", cloudBot: "#16263c", glow: "#c9d8ee",
};
const NIGHT_B = {
  skyTop: "#01040c", skyMid: "#060f24", skyHorizon: "#142a47", haze: "#1a3556", sun: "#e6e8d4",
  seaFar: "#10263d", seaMid: "#071d33", seaDeep: "#020c18", seaFront: "#071f37", foam: "#8db4c9", crest: "#5882a2",
  cloudTop: "#22384f", cloudBot: "#0d1a2b", glow: "#b6c4dc",
};

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => "#" + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
export function mix(a, b, k) {
  const A = hex(a), B = hex(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * k));
}
function mixPal(a, b, k) {
  const o = {};
  for (const key of KEYS) o[key] = mix(a[key], b[key], k);
  return o;
}

/** phase 0..1 across the timeline. Returns palette plus `dark` 0..1 (how night-like). */
export function palette(phase, dark) {
  const p = Math.min(1, Math.max(0, phase));
  if (dark) {
    const pal = mixPal(NIGHT_A, NIGHT_B, p);
    pal.dark = 1;
    return pal;
  }
  const pal = p < 0.5 ? mixPal(DAY, GOLD, p / 0.5) : mixPal(GOLD, DUSK, (p - 0.5) / 0.5);
  pal.dark = Math.max(0, (p - 0.7) / 0.3) * 0.45;
  return pal;
}
