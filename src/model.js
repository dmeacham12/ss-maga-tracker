// Pure timeline + sinking model. No DOM access, so Node tests can import it.

const DAY = 864e5;

export function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export const dayIndex = (s, start) => Math.round((parseDate(s) - parseDate(start)) / DAY);

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDay(n, start) {
  const d = new Date(parseDate(start).getTime() + Math.floor(n) * DAY);
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
export function fmtShort(s) {
  const d = parseDate(s);
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function todayIndex(start, now = new Date()) {
  const local = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((local - parseDate(start)) / DAY);
}

/**
 * Build the timeline from entries.
 * Confirmed entries become jumpers placed at day + 0.2 + k*0.24 (k = nth that day).
 * Rumors are rail-leaners and never jump.
 */
export function buildTimeline(entries, status, start, now = new Date()) {
  const sorted = entries.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const jumpers = [];
  const rumors = [];
  const perDay = {};
  for (const e of sorted) {
    if (e.status === "rumor") { rumors.push({ e }); continue; }
    const di = dayIndex(e.date, start);
    const k = (perDay[di] = (perDay[di] || 0) + 1) - 1;
    jumpers.push({ e, d: di + 0.2 + k * 0.24, k });
  }
  const today = todayIndex(start, now);
  const termDays = Math.max(1, dayIndex(status.termEnd, start));
  const endDay = endEventDay(status, start, termDays, today);

  // A jump needs about 0.9 days to splash and pop up in its preserver, and the judges' scores
  // stay up for another day, so the timeline must run past the last jump by that much.
  const JUMP_TAIL = 2.0;
  let end = Math.max(today + 0.99, ...jumpers.map(j => j.d + JUMP_TAIL), 1.5);
  if (endDay != null) end = Math.max(end, endDay + SINK_DAYS + 0.6);

  const people = jumpers.concat(rumors);
  people.forEach((p, i) => { p.index = i; });
  // The clock label never runs past the latest real date: the extra timeline after the last
  // jump exists only so the splash can finish, not to show a future day.
  const lastReal = Math.max(today, endDay ?? 0, ...jumpers.map(j => Math.floor(j.d)), 0);
  const displayEnd = Math.min(end - 0.01, lastReal + 0.99);
  return { jumpers, rumors, people, end, displayEnd, today, termDays, endDay };
}

export const SINK_DAYS = 1.4; // length of the final sinking sequence, in timeline days

/** Day on which the final sinking begins, or null if it has not been reached/triggered. */
export function endEventDay(status, start, termDays, today) {
  const ev = status.endEvent;
  const evDay = ev && ev.date ? dayIndex(ev.date, start) : null;
  const termDay = termDays;
  // whichever comes first; term end only matters once it has actually arrived (today >= termDay)
  const candidates = [];
  if (evDay != null) candidates.push(evDay);
  if (today >= termDay) candidates.push(termDay);
  return candidates.length ? Math.min(...candidates) : null;
}

const smooth = x => x * x * (3 - 2 * x);

/**
 * Sinking state at timeline day t.
 *  level 0..1 : 0 = floating normally, 1 = fully under
 *  list       : degrees of stern-down pitch (+ = stern low), applied by the scene
 *  heel       : degrees of side roll
 *  wash       : 0..1 how much water is washing the deck
 *  final      : 0..1 progress of the closing sinking sequence
 */
export function sinkState(t, tl, status, start) {
  const BASE_MAX = 0.62;       // base sinking never exceeds this fraction before the end
  const DIP_EACH = 0.012;      // each departure adds this much, tapering off
  const DIP_CAP = 0.2;         // total contribution from departures
  const CAP = 0.9;             // ship never fully under before the end event

  const p = Math.min(1, Math.max(0, t / tl.termDays));
  const base = BASE_MAX * Math.pow(p, 2.6);                // gentle early, dramatic late

  let dips = 0;
  for (const j of tl.jumpers) {
    if (t >= j.d) {
      const settle = Math.min(1, (t - j.d) / 0.6);         // dip eases in over ~0.6 day
      dips += DIP_EACH * smooth(settle);
    }
  }
  dips = Math.min(DIP_CAP, dips);

  let level = Math.min(CAP, base + dips);
  let final = 0;
  if (tl.endDay != null && t >= tl.endDay) {
    final = Math.min(1, (t - tl.endDay) / SINK_DAYS);
    level = level + (1 - level) * smooth(final);
  }
  return {
    level,
    final,
    list: 1.5 + level * 20 + final * 25,
    heel: level * 6,
    wash: Math.min(1, Math.max(0, (level - 0.55) / 0.35)),
  };
}

/** The most recent confirmed jumper whose leap has landed at day t. */
export function latestJumper(t, tl, jumpTime = 0.45) {
  let latest = null;
  for (const j of tl.jumpers) if (t >= j.d + jumpTime * 0.5) latest = j;
  return latest;
}

/** Sky/lighting phase 0..1 across the timeline (0 = clear day, 1 = deep dusk/night-ish). */
export function lightingPhase(t, tl) {
  return smooth(Math.min(1, Math.max(0, t / Math.max(tl.end, 1))));
}
