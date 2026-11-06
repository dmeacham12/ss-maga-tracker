import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTimeline, sinkState, endEventDay, dayIndex } from "../src/model.js";

const entries = JSON.parse(readFileSync(new URL("../data/entries.json", import.meta.url)));
const status = JSON.parse(readFileSync(new URL("../data/status.json", import.meta.url)));
const START = "2026-11-03";
const now = new Date(2026, 10, 5, 12);

const tl = buildTimeline(entries, status, START, now);
const confirmedN = entries.filter(e => e.status === "confirmed" && e.date <= "2026-11-05").length;
const rumorN = entries.filter(e => e.status === "rumor").length;
assert.equal(tl.jumpers.length, confirmedN, "rumors never jump");
assert.equal(tl.rumors.length, rumorN);
assert.equal(dayIndex("2026-11-04", START), 1);
assert.equal(tl.endDay, null, "no end before term end");
assert.ok(tl.displayEnd < tl.end && tl.displayEnd <= 2.99 + 1e-9, "date label stops at the latest real day");
const lastJump = Math.max(...tl.jumpers.map(j => j.d));
assert.ok(tl.end >= lastJump + 0.9 + 1e-9, "timeline runs long enough for the last jumper to surface");

let prev = -1;
for (let t = 0; t <= tl.termDays; t += 10) {
  const s = sinkState(t, tl, status, START);
  assert.ok(s.level >= prev - 1e-9 || t < 3, "monotonic after dips settle");
  assert.ok(s.level <= 0.9 + 1e-9, "capped before end");
  prev = s.level;
}
const tlEnd = buildTimeline(entries, { ...status, endEvent: { type: "removal", date: "2026-11-20", sources: [] } }, START, now);
assert.equal(tlEnd.endDay, 17);
assert.equal(sinkState(tlEnd.endDay + 5, tlEnd, status, START).level, 1, "fully sunk after end event");
assert.ok(sinkState(tlEnd.endDay - 0.1, tlEnd, status, START).level < 0.9);
assert.equal(endEventDay(status, START, tl.termDays, tl.termDays), tl.termDays, "term end triggers sink");
import { quipFor } from "../src/quips.js";
assert.ok(quipFor(entries[0]).length > 3, "every kind has a quip");
assert.equal(quipFor({ id: "x", kind: "Fired", quip: "Custom." }), "Custom.");
assert.equal(quipFor(entries[0]), quipFor(entries[0]), "quips are stable");
console.log("model ok");
