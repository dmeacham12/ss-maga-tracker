// Tiny synthesized sound effects (Web Audio, no files). Off by default and only started after
// the visitor flips the Sound switch, because browsers require a tap before audio can play.

let ctx = null;
let enabled = false;

function audio() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function noise(c, seconds) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export const sound = {
  get enabled() { return enabled; },
  set(on) { enabled = on; if (on) audio(); },

  /** A splash: a burst of filtered noise plus a quick "bloop". big = louder and lower. */
  splash(big = false) {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise(c, 0.5);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(big ? 2200 : 3000, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.45);
    const g = c.createGain();
    g.gain.setValueAtTime(big ? 0.34 : 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
    src.connect(lp).connect(g).connect(c.destination);
    src.start(t);
    const o = c.createOscillator();
    const og = c.createGain();
    o.frequency.setValueAtTime(big ? 260 : 420, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.18);
    og.gain.setValueAtTime(0.18, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(og).connect(c.destination);
    o.start(t);
    o.stop(t + 0.22);
  },

  /** A two-tone ship's horn. */
  horn() {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.06);
    g.gain.setValueAtTime(0.28, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    lp.connect(g).connect(c.destination);
    for (const f of [98, 123.5]) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      o.stop(t + 1);
    }
  },
};
