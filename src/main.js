import { REFRESH_MINUTES, START_DATE } from "../config.js";
import { buildTimeline, fmtDay, fmtShort, todayIndex, SINK_DAYS } from "./model.js";
import { createScene, JL } from "./scene.js";

const $ = id => document.getElementById(id);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const darkMQ = matchMedia("(prefers-color-scheme: dark)");

const QUIET = 1.1;   // timeline days per second between jumps
const SLOW = 0.34;   // timeline days per second around a jump

const svg = $("scene");
const scene = createScene(svg, { reduce });

let tl = null, status = null, entries = [], END = 1.5;
let t = 0, playing = false, last = 0, visible = true, dragging = false;
let lastCapKey = null, lastToday = "", rawKey = "";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; } };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

// ---------- theme ----------
const THEMES = ["auto", "light", "dark"];
let themeMode = THEMES.includes(store.get("ssmaga:theme")) ? store.get("ssmaga:theme") : "auto";
function applyTheme() {
  if (themeMode === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", themeMode);
  $("theme").textContent = "Theme: " + themeMode;
  scene.setDark(themeMode === "dark" || (themeMode === "auto" && darkMQ.matches));
  if (tl) draw(performance.now() / 1000);
}
$("theme").addEventListener("click", () => {
  themeMode = THEMES[(THEMES.indexOf(themeMode) + 1) % THEMES.length];
  store.set("ssmaga:theme", themeMode);
  applyTheme();
});
darkMQ.addEventListener("change", applyTheme);

// ---------- data ----------
async function load() {
  const bust = "?t=" + Date.now();
  const [e, s] = await Promise.all([
    fetch("data/entries.json" + bust, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("entries"); return r.json(); }),
    fetch("data/status.json" + bust, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("status"); return r.json(); }),
  ]);
  return { entries: e, status: s };
}

function speedAt(x) {
  let dist = Infinity;
  for (const w of scene.windows) {
    const d = x < w[0] ? w[0] - x : x > w[1] ? x - w[1] : 0;
    if (d < dist) dist = d;
    if (dist === 0) break;
  }
  const k = Math.min(1, dist / 0.6);
  return SLOW + (QUIET - SLOW) * k * k * (3 - 2 * k);
}

function apply(next, initial) {
  const key = JSON.stringify(next.entries) + JSON.stringify(next.status.endEvent) + next.status.termEnd;
  status = next.status;
  renderChecked();
  if (key === rawKey) return;
  rawKey = key;
  entries = next.entries;
  const prevIds = new Set((tl ? tl.jumpers : []).map(j => j.e.id));
  tl = buildTimeline(entries, status, START_DATE);
  END = tl.end;
  scene.layout(svg.getBoundingClientRect().width || 1000);
  scene.setData(tl);
  svg.style.aspectRatio = scene.width + " / 520";
  const scrub = $("scrub");
  scrub.max = String(END);
  buildMarks();
  buildLists();
  lastCapKey = null;

  const confirmedIds = tl.jumpers.map(j => j.e.id);
  if (initial) {
    const seenRaw = store.get("ssmaga:seen");
    const seen = seenRaw ? new Set(JSON.parse(seenRaw)) : null;
    const fresh = seen ? tl.jumpers.filter(j => !seen.has(j.e.id)) : [];
    if (reduce) t = END;
    else if (!seen) { t = 0; setTimeout(() => setPlaying(true), 700); }
    else if (fresh.length) { t = Math.max(0, fresh[fresh.length - 1].d - 0.9); setTimeout(() => setPlaying(true), 500); }
    else t = END;
    store.set("ssmaga:seen", JSON.stringify(confirmedIds));
  } else {
    const added = tl.jumpers.filter(j => !prevIds.has(j.e.id));
    if (added.length) {
      store.set("ssmaga:seen", JSON.stringify(confirmedIds));
      if (reduce) t = END;
      else { t = Math.max(0, added[added.length - 1].d - 0.9); setPlaying(true); }
    } else t = Math.min(t, END);
  }
  draw(performance.now() / 1000);
}

// ---------- page chrome ----------
function renderChecked() {
  const c = $("checked");
  if (!status || !status.lastChecked) { c.textContent = "Last checked for news: not yet"; return; }
  const d = new Date(status.lastChecked);
  c.textContent = isNaN(d) ? "Last checked for news: unknown"
    : "Last checked for news: " + d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function buildMarks() {
  const m = $("marks");
  m.replaceChildren();
  for (const j of tl.jumpers) {
    const s = el("span");
    s.style.left = (j.d / END * 100) + "%";
    m.append(s);
  }
  $("end-label").textContent = fmtDay(Math.max(0, END - 0.01), START_DATE);
}

function sourcesRow(e) {
  const row = el("div", "src");
  for (const s of e.sources || []) {
    const u = safeUrl(s.url);
    if (!u) continue;
    const a = el("a", null, s.name || "Source");
    a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer";
    row.append(a);
  }
  return row;
}

function logItem(p, confirmed) {
  const e = p.e;
  const li = el("li");
  li.append(el("div", "d", fmtShort(e.date)));
  const mid = el("div");
  const name = el("div", "n", e.name);
  if (e.group) name.append(el("span", "badge", e.group));
  mid.append(name, el("div", "r", [e.kind, e.role].filter(Boolean).join(". ")));
  if (e.summary) mid.append(el("div", "s", e.summary));
  mid.append(sourcesRow(e));
  li.append(mid);
  const acts = el("div", "acts");
  if (confirmed) {
    const b = el("button", null, "Watch the jump");
    b.type = "button";
    b.setAttribute("aria-label", "Watch the jump: " + e.name);
    b.addEventListener("click", () => watch(p));
    acts.append(b);
  }
  li.append(acts);
  return li;
}

function buildLists() {
  const over = $("log-over"), wob = $("log-wobble");
  over.replaceChildren(); wob.replaceChildren();
  if (!tl.jumpers.length) over.append(el("li", "empty", "Nobody overboard yet."));
  tl.jumpers.slice().reverse().forEach(p => over.append(logItem(p, true)));
  if (!tl.rumors.length) wob.append(el("li", "empty", "Nobody wobbling right now."));
  tl.rumors.forEach(p => wob.append(logItem(p, false)));
}

// ---------- playback ----------
function setPlaying(on) {
  playing = on;
  $("play").textContent = on ? "Pause" : "Play";
  last = 0;
  if (!reduce) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
}
function watch(p) {
  if (reduce) t = Math.min(END, p.tLand + 0.9);
  else { t = Math.max(0, p.d - 0.5); setPlaying(true); }
  draw(performance.now() / 1000);
  svg.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
}
$("play").addEventListener("click", () => {
  if (!playing && t >= END - 0.01) t = 0;
  setPlaying(!playing);
  if (reduce) { t = playing ? t : END; draw(0); }
});
$("restart").addEventListener("click", () => {
  t = 0;
  if (reduce) { t = END; draw(0); return; }
  setPlaying(true);
});
$("replay").addEventListener("click", () => { t = 0; if (reduce) t = END; else setPlaying(true); draw(performance.now() / 1000); });
const scrub = $("scrub");
scrub.addEventListener("input", () => { t = parseFloat(scrub.value); if (playing) setPlaying(false); draw(performance.now() / 1000); });
document.addEventListener("keydown", ev => {
  if (ev.key === " " && ev.target === document.body) { ev.preventDefault(); $("play").click(); }
});
if (reduce) {
  $("play").disabled = true;
  $("play").title = "Motion is turned off in your system settings";
}

// ---------- drawing ----------
function draw(sec) {
  if (!tl) return;
  const info = scene.render(t, reduce ? 0 : sec);
  const dayStr = fmtDay(Math.min(t, END - 0.01), START_DATE);
  if (dayStr !== lastToday) { lastToday = dayStr; $("today").textContent = dayStr; scrub.setAttribute("aria-valuetext", dayStr); }
  $("t-over").textContent = String(info.overN);
  $("t-wobble").textContent = String(tl.rumors.length);
  $("t-days").textContent = String(Math.max(0, todayIndex(START_DATE)));
  $("t-sink").textContent = Math.round(info.sink.level * 100) + "%";
  if (!dragging || true) scrub.value = String(t);

  const fin = info.sink.final;
  const sinking = tl.endDay != null && t >= tl.endDay;
  const gone = sinking && fin >= 1;
  const key = gone ? "gone" : sinking ? "sinking" : info.latest ? info.latest.e.id : "none";
  if (key !== lastCapKey) {
    lastCapKey = key;
    const cap = $("caption");
    cap.replaceChildren();
    if (gone) cap.textContent = "She's gone. Everyone's in the water.";
    else if (sinking) cap.textContent = "The SS MAGA is going down. All hands overboard.";
    else if (info.latest) {
      const e = info.latest.e;
      cap.append(el("strong", null, fmtShort(e.date) + ": " + e.name + " "), document.createTextNode((e.kind || "left").toLowerCase() + ". " + (e.role || "")));
    } else cap.textContent = tl.jumpers.length ? "Election night. Everyone's still aboard." : "Everyone's still aboard.";
  }
  const closing = $("closing");
  if (closing.hidden === gone) {
    closing.hidden = !gone;
    if (gone) {
      const ev = status.endEvent;
      $("closing-title").textContent = "The SS MAGA has sunk";
      $("closing-body").textContent = `Final tally: ${tl.jumpers.length} overboard, ${tl.rumors.length} still wobbling when she went down` + (ev && ev.date ? `, ending ${fmtShort(ev.date)}.` : ".");
    }
  }
}

let raf = 0;
function frame(ts) {
  const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
  last = ts;
  if (playing) {
    t += dt * speedAt(t);
    if (t >= END) { t = END; setPlaying(false); }
  }
  if (visible && !document.hidden) draw(ts / 1000);
  if (!reduce) raf = requestAnimationFrame(frame);
}
new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.01 }).observe(svg);
addEventListener("resize", () => {
  if (!tl) return;
  scene.layout(svg.getBoundingClientRect().width || 1000);
  svg.style.aspectRatio = scene.width + " / 520";
  draw(performance.now() / 1000);
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (tl) { scene.layout(svg.getBoundingClientRect().width || 1000); draw(0); } });

// ---------- boot ----------
applyTheme();
load().then(d => {
  apply(d, true);
  if (!reduce) raf = requestAnimationFrame(frame);
  setInterval(() => load().then(n => apply(n, false)).catch(() => {}), REFRESH_MINUTES * 60 * 1000);
}).catch(() => {
  $("caption").textContent = "Couldn't load the departure data. Try refreshing.";
});
