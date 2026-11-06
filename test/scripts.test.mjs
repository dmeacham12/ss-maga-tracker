import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction, buildIssue, parseFeed, buildMatcher, cluster, normalizeTitle, parseIssue } from "../scripts/lib.mjs";
import { OWNER_LOGIN } from "../config.js";

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const entries = read("../data/entries.json"), status = read("../data/status.json");

// --- scan side ---
const items = parseFeed(readFileSync(new URL("./fixtures/fake-feed.xml", import.meta.url), "utf8"), "Fixture");
assert.equal(items.length, 5);
const m = buildMatcher(entries);
assert.ok(m("White House deputy chief of staff resigns in surprise exit"));
assert.ok(!m("Local bakery wins award"));
assert.ok(!m("Senator resigns from book club"), "needs a scope term");
assert.ok(m("Harmeet Dhillon resignation what next"), "existing names count as scope");
assert.equal(cluster(items.filter(i => /deputy/i.test(i.title))).length, 1, "same story clusters");
assert.equal(normalizeTitle("Big news - Outlet"), "big news");

// --- candidate issue round trip ---
const issue = buildIssue(cluster([items[0]])[0], entries);
assert.ok(issue.title.length <= 80);
let body = issue.body.replace("name: ", "name: Pat Example").replace("role:", "role: Deputy Chief of Staff").replace("summary:", "summary: Left after one week.");
const base = { label: "jumped", body, sender: OWNER_LOGIN, entries, status, issueUrl: "https://github.com/x/y/issues/1", now: "2026-11-05T20:00:00Z" };

let r = applyAction(base);
assert.equal(r.result, "ok");
assert.equal(r.commit, "update: +1 overboard (Pat Example)");
const pat = r.entries.find(e => e.name === "Pat Example");
assert.equal(pat.status, "confirmed");
assert.equal(pat.id, "example-2026-11-05");
assert.equal(pat.addedBy, "updater");
assert.equal(pat.sources[0].url, "https://example.com/fixture/deputy-resigns");
assert.equal(entries.length, 3, "input not mutated");

// others cannot act
assert.equal(applyAction({ ...base, sender: "someone-else" }).result, "ignored");
// missing fields
r = applyAction({ ...base, body: issue.body });
assert.equal(r.result, "invalid");
assert.match(r.comment, /name/);
assert.equal(r.close, false);
// dismiss closes and changes nothing
r = applyAction({ ...base, label: "dismiss" });
assert.equal(r.close, true); assert.equal(r.commit, null);

// rumor then jumped promotes
const rumorBody = body.replace("kind: Resigned", "kind: Rumored exit");
let rr = applyAction({ ...base, label: "rumor", body: rumorBody });
assert.equal(rr.entries.find(e => e.name === "Pat Example").status, "rumor");
assert.equal(rr.commit, "update: +1 wobbling (Pat Example)");
assert.equal(applyAction({ ...base, body: rumorBody }).result, "invalid", "confirmed needs a real exit kind");
const promoted = applyAction({ ...base, entries: rr.entries });
assert.equal(promoted.entries.filter(e => e.name === "Pat Example").length, 1);
assert.equal(promoted.entries.find(e => e.name === "Pat Example").status, "confirmed");

// existing rumor (Rubio) gets promoted by name
const rub = applyAction({ ...base, body: "```\nname: Marco Rubio\ndate: 2026-11-09\nkind: Resigned\ngroup: Administration\n```" });
assert.equal(rub.entries.find(e => e.name === "Marco Rubio").status, "confirmed");

// --- issue form ---
const form = "### Name\n\nJane Form\n\n### Role\n\nSecretary\n\n### Date\n\n2026-11-08\n\n### Kind\n\nFired\n\n### Group\n\nAdministration\n\n### Status\n\nconfirmed\n\n### Source URL\n\nhttps://example.com/story\n";
assert.equal(parseIssue(form).name, "Jane Form");
const fr = applyAction({ ...base, body: form });
assert.equal(fr.entries.find(e => e.name === "Jane Form").addedBy, "manual");
assert.equal(fr.entries.find(e => e.name === "Jane Form").sources[0].name, "example.com");

// --- end event ---
const ev = applyAction({ ...base, label: "end-event", body: "```\ntype: removal\ndate: 2026-12-01\n```" });
assert.equal(ev.status.endEvent.type, "removal");
assert.equal(applyAction({ ...base, label: "end-event", body: "```\ntype: parade\ndate: 2026-12-01\n```" }).status.endEvent, null);
assert.equal(applyAction({ ...base, label: "end-event", sender: "x", body: "```\ntype: removal\ndate: 2026-12-01\n```" }).result, "ignored");

// malicious markup is data only
const evil = applyAction({ ...base, body: "```\nname: <img src=x onerror=alert(1)>\ndate: 2026-11-05\nkind: Fired\ngroup: Congress\n```" });
assert.equal(evil.result, "ok"); // stored as text; the site only ever uses textContent
console.log("scripts ok");
