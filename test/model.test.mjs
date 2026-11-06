import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTimeline, sinkState, endEventDay, dayIndex } from "../src/model.js";

const entries = JSON.parse(readFileSync(new URL("../data/entries.json", import.meta.url)));
const status = JSON.parse(readFileSync(new URL("../data/status.json", import.meta.url)));
const START = "2026-11-03";
const now = new Date(2026, 10, 5, 12);

const tl = buildTimeline(entries, status, START, now);
assert.equal(tl.jumpers.length, 2, "rumors never jump");
assert.equal(tl.rumors.length, 1);
assert.equal(dayIndex("2026-11-04", START), 1);
assert.equal(tl.endDay, null, "no end before term end");

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
console.log("model ok");
