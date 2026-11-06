// Scan politics RSS feeds for exit headlines and open assigned GitHub issues for new candidates.
//   node scripts/scan.mjs                      normal run (needs GITHUB_TOKEN, GITHUB_REPOSITORY)
//   node scripts/scan.mjs --fixture f.xml      read headlines from a local RSS file instead of the network
//   node scripts/scan.mjs --dry                print what would be opened, touch nothing
// Fixture runs never write seen.json or status.json, so they are safe to repeat.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as C from "../config.js";
import { parseFeed, buildMatcher, normalizeTitle, cluster, buildIssue, buildOverflow } from "./lib.mjs";

const root = new URL("../", import.meta.url);
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const dry = flag("--dry");
const fixture = opt("--fixture");

const readJson = async p => JSON.parse(await readFile(new URL(p, root), "utf8"));
const writeJson = (p, v) => writeFile(new URL(p, root), JSON.stringify(v, null, 2) + "\n");

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "ss-maga-tracker-scan/1.0 (+github actions)" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function collect() {
  if (fixture) {
    const xml = await readFile(fixture, "utf8");
    return parseFeed(xml, "Fixture News");
  }
  const urls = [...C.FEEDS, ...C.SEARCH_QUERIES.map(q => C.SEARCH_URL + encodeURIComponent(q))];
  const results = await Promise.allSettled(urls.map(async u => parseFeed(await fetchText(u))));
  const items = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else console.warn("feed failed:", urls[i], String(r.reason).slice(0, 120));
  });
  return items;
}

const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY || C.REPO;
async function gh(path, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 422) throw new Error(`GitHub ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res;
}
const LABELS = [["candidate", "fbca04", "Possible departure found by the scan"], ["jumped", "d73a4a", "Confirm as overboard"], ["rumor", "e99695", "Add as a rumor"], ["dismiss", "cfd3d7", "Not relevant"], ["end-event", "5319e7", "Sink the ship (owner only)"], ["overflow", "ededed", "Extra scan links"]];
async function ensureLabels() {
  for (const [name, color, description] of LABELS) await gh("/labels", { name, color, description }); // 422 = already exists
}
async function openIssue({ title, body }, labels) {
  const res = await gh("/issues", { title, body, labels, assignees: [C.OWNER_LOGIN] });
  if (!res.ok) throw new Error("issue rejected: " + (await res.text()).slice(0, 200));
}

const entries = await readJson("data/entries.json");
const status = await readJson("data/status.json");
const seen = await readJson("data/seen.json");
const seenUrls = new Set(seen.urls), seenTitles = new Set(seen.titles);

const matches = buildMatcher(entries);
const startMs = Date.parse(C.START_DATE);
const batchTitles = new Set();
const fresh = [];
for (const it of await collect()) {
  if (it.time != null && it.time < startMs) continue;
  if (!matches(it.title)) continue;
  const nt = normalizeTitle(it.title);
  if (seenUrls.has(it.url) || seenTitles.has(nt) || batchTitles.has(nt)) continue;
  batchTitles.add(nt);
  fresh.push(it);
}
const cands = cluster(fresh);
const open = cands.slice(0, C.MAX_ISSUES_PER_RUN), extra = cands.slice(C.MAX_ISSUES_PER_RUN);
console.log(`${fresh.length} new matching headline(s) -> ${cands.length} candidate(s); opening ${open.length}${extra.length ? `, ${extra.length} in overflow` : ""}`);

const issues = open.map(c => ({ cand: c, ...buildIssue(c, entries) }));
const overflow = extra.length ? buildOverflow(extra) : null;

if (dry) {
  for (const i of issues) console.log(`\n=== ISSUE: ${i.title}\n${i.body}`);
  if (overflow) console.log(`\n=== OVERFLOW: ${overflow.title}\n${overflow.body}`);
} else {
  if (!token) { console.error("GITHUB_TOKEN is required (or use --dry)."); process.exit(1); }
  await ensureLabels();
  const done = [];
  for (const i of issues) {
    try { await openIssue(i, ["candidate"]); done.push(i.cand); console.log("opened:", i.title); }
    catch (e) { console.error("failed to open issue:", String(e).slice(0, 160)); }
  }
  let overflowDone = [];
  if (overflow) {
    try { await openIssue(overflow, ["candidate", "overflow"]); overflowDone = extra; } catch (e) { console.error("overflow failed:", String(e).slice(0, 160)); }
  }
  if (!fixture) {
    for (const c of [...done, ...overflowDone]) for (const it of [c.lead, ...c.others]) { seenUrls.add(it.url); seenTitles.add(normalizeTitle(it.title)); }
    seen.urls = [...seenUrls].slice(-5000);
    seen.titles = [...seenTitles].slice(-5000);
    status.lastChecked = new Date().toISOString();
    await writeJson("data/seen.json", seen);
    await writeJson("data/status.json", status);
  }
}
if (dry || fixture) process.exitCode = 0;
