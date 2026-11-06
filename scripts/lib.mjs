// Shared helpers for scan.mjs and apply.mjs. Pure functions only, so tests can run offline.

import * as C from "../config.js";

// ---------- text helpers ----------
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&#x27;": "'", "&nbsp;": " " };
export function decode(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27);/g, m => ENT[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/<[^>]+>/g, "")
    .trim();
}
const straighten = s => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function clean(s, max) {
  return String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
export function safeUrl(u) {
  try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; }
}
export function hostName(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "Source"; }
}
export function trimTitle(s, n = 80) {
  const t = clean(s, 1000);
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

/** Lowercased headline with the trailing " - Outlet" removed, punctuation stripped. */
export function normalizeTitle(title) {
  let t = straighten(decode(title)).toLowerCase();
  const m = t.match(/^(.*\S)\s+[-|–—]\s+([^-|–—]{2,40})$/);
  if (m) t = m[1];
  return t.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// ---------- RSS / Atom ----------
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}
export function parseFeed(xml, feedName = "") {
  const out = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const it of items) {
    const title = tag(it, "title");
    let link = tag(it, "link");
    if (!link) { const m = it.match(/<link[^>]*href="([^"]+)"/i); if (m) link = decode(m[1]); }
    const date = tag(it, "pubDate") || tag(it, "updated") || tag(it, "published") || tag(it, "dc:date");
    const outlet = tag(it, "source") || feedName;
    const t = Date.parse(date);
    link = safeUrl(link);
    if (title && link) out.push({ title, url: link, outlet: outlet || hostName(link), time: Number.isNaN(t) ? null : t });
  }
  return out;
}

// ---------- matching ----------
export function buildMatcher(entries) {
  const exit = new RegExp(`(?<![a-z])(?:${C.EXIT_WORDS.map(esc).join("|")})(?![a-z])`, "i");
  const scopeTerms = new RegExp(`(?<![A-Za-z])(?:${C.SCOPE_TERMS.map(esc).join("|")})(?![A-Za-z])`, "i");
  const scopeParty = new RegExp(C.SCOPE_REGEX_SOURCE);
  const names = [...new Set(entries.map(e => e.name).filter(Boolean))];
  const nameRe = names.length ? new RegExp(`(?<![A-Za-z])(?:${names.map(esc).join("|")})(?![A-Za-z])`, "i") : null;
  return title => {
    const t = straighten(title);
    if (!exit.test(t)) return false;
    return scopeTerms.test(t) || scopeParty.test(t) || (nameRe ? nameRe.test(t) : false);
  };
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "after", "says", "say", "will", "has", "have", "his", "her", "its", "are", "was", "who", "amid", "over", "new", "report", "reports", "sources", "official", "officials"]);
const words = t => new Set(normalizeTitle(t).split(" ").filter(w => w.length > 2 && !STOP.has(w)));
function similar(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  let i = 0;
  for (const w of A) if (B.has(w)) i++;
  return i / (A.size + B.size - i) >= 0.5;
}

/** Group headlines about the same story (similar title, published within CLUSTER_HOURS). */
export function cluster(items) {
  const groups = [];
  for (const it of items) {
    const g = groups.find(g => similar(g.items[0].title, it.title) &&
      (g.items[0].time == null || it.time == null || Math.abs(g.items[0].time - it.time) <= C.CLUSTER_HOURS * 36e5));
    if (g) g.items.push(it); else groups.push({ items: [it] });
  }
  return groups.map(g => ({ lead: g.items[0], others: g.items.slice(1) }));
}

// ---------- issue text ----------
export const BLOCK_KEYS = ["name", "role", "date", "kind", "group", "summary"];
const isoDate = d => new Date(d).toISOString().slice(0, 10);

export function guessName(title, entries) {
  const t = straighten(title).toLowerCase();
  const hit = entries.find(e => e.name && t.includes(e.name.toLowerCase()));
  return hit ? hit.name : "";
}

export function buildIssue(cand, entries) {
  const { lead, others } = cand;
  const date = lead.time ? isoDate(lead.time) : isoDate(Date.now());
  const lines = [
    `**Headline:** [${lead.title.replace(/[\[\]]/g, "")}](${lead.url})`,
    `**Outlet:** ${lead.outlet}  ·  **Published:** ${date}`,
  ];
  if (others.length) {
    lines.push("", "**Same story, other outlets:**");
    for (const o of others.slice(0, 6)) lines.push(`- [${o.outlet}: ${o.title.replace(/[\[\]]/g, "")}](${o.url})`);
  }
  lines.push(
    "", "```",
    `name: ${guessName(lead.title, entries)}`,
    "role:",
    `date: ${date}`,
    "kind: Resigned",
    "group: Administration",
    "summary:",
    "figure:",
    "skin:",
    "hair:",
    "```", "",
    `<!-- candidate-source: ${lead.outlet.replace(/-->/g, "")} | ${lead.url} -->`,
    "",
    "Edit the block above, then add the label `jumped` (confirmed), `rumor`, or `dismiss`.",
    `Valid kinds: ${C.KINDS.join(", ")}. Groups: ${C.GROUPS.join(", ")}.`,
    `Optional look for the figure (see gallery.html): figure ${C.FIGURES.join("/")}, skin 1-${C.SKIN_TONE_COUNT}, hair ${C.HAIR_STYLES.join("/")}.`,
  );
  return { title: trimTitle(lead.title), body: lines.join("\n") };
}

export function buildOverflow(extra) {
  return {
    title: `${extra.length} more candidate headline${extra.length === 1 ? "" : "s"} this run`,
    body: ["The scan found more than the per-run cap. These were not opened as separate issues:", "",
      ...extra.map(c => `- [${c.lead.outlet}: ${c.lead.title.replace(/[\[\]]/g, "")}](${c.lead.url})`),
      "", "Add one by hand with the **Departure** issue form if any are real."].join("\n"),
  };
}

// ---------- parsing an issue (candidate block or issue form) ----------
const FORM_FIELDS = { "name": "name", "role": "role", "date": "date", "kind": "kind", "group": "group", "status": "status", "source url": "sourceUrl", "source name": "sourceName", "summary": "summary", "type": "type", "denied": "denied", "quip": "quip", "figure": "figure", "skin tone": "skin", "hair": "hair" };

export function parseIssue(body) {
  const text = String(body || "").replace(/\r\n/g, "\n");
  const f = {};
  if (/^### /m.test(text)) { // issue form: "### Label\n\nvalue"
    for (const sec of text.split(/^### /m).slice(1)) {
      const nl = sec.indexOf("\n");
      const key = FORM_FIELDS[sec.slice(0, nl < 0 ? undefined : nl).trim().toLowerCase()];
      const val = nl < 0 ? "" : sec.slice(nl + 1).trim();
      if (key && val && val !== "_No response_") f[key] = clean(val, 400);
    }
    f.fromForm = true;
  } else {
    const fence = text.match(/```[a-z]*\n([\s\S]*?)```/);
    const src = fence ? fence[1] : text;
    for (const line of src.split("\n")) {
      const m = line.match(/^\s*(name|role|date|kind|group|summary|type|status|denied|quip|figure|skin|hair)\s*:\s*(.*)$/i);
      if (m && m[2].trim()) f[m[1].toLowerCase()] = clean(m[2], 400);
    }
    const s = text.match(/<!--\s*candidate-source:\s*(.*?)\s*\|\s*(\S+)\s*-->/);
    if (s) { f.sourceName = clean(s[1], 60); f.sourceUrl = s[2]; f.candidate = true; }
  }
  return f;
}

const ci = (list, v) => list.find(x => x.toLowerCase() === String(v || "").toLowerCase());
const slug = s => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Apply one owner action.
 * ctx: { label, body, issueUrl, sender, entries, status, now }
 * Returns { result: "ok" | "invalid" | "ignored", entries, status, comment, commit, close }
 */
export function applyAction(ctx) {
  const { label, body, sender, now = new Date().toISOString() } = ctx;
  const entries = ctx.entries.map(e => ({ ...e, sources: [...(e.sources || [])] }));
  const status = { ...ctx.status };
  const nothing = (result, comment, close = false) => ({ result, entries: ctx.entries, status: ctx.status, comment, commit: null, close });

  if (sender !== C.OWNER_LOGIN) return nothing("ignored", null);
  if (label === "dismiss") return nothing("ok", "Dismissed. This link will not come back.", true);

  const f = parseIssue(body);
  const date = f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date) && !Number.isNaN(Date.parse(f.date)) ? f.date : null;
  const sourceUrl = f.sourceUrl ? safeUrl(f.sourceUrl) : null;
  const source = sourceUrl ? { name: f.sourceName || hostName(sourceUrl), url: sourceUrl } : null;

  if (label === "end-event") {
    const type = (f.type || "").toLowerCase();
    const problems = [];
    if (!type) problems.push("`type` (one of: house_impeachment, removal, resignation)");
    if (!date) problems.push("`date` (YYYY-MM-DD)");
    if (problems.length) return nothing("invalid", `Can't set the end event. Missing or invalid: ${problems.join(", ")}. Add \`type:\` and \`date:\` lines to the block, then re-add the label.`);
    if (!C.END_EVENT_TYPES.includes(type)) return nothing("invalid", `\`${type}\` is not in END_EVENT_TYPES (${C.END_EVENT_TYPES.join(", ")}) in config.js, so the ship stays afloat.`, true);
    status.endEvent = { type, date, sources: source ? [source] : [] };
    return { result: "ok", entries: ctx.entries, status, comment: `End event recorded: ${type} on ${date}. The ship goes down on the next deploy.`, commit: `update: end event (${type}, ${date})`, close: true };
  }

  if (label !== "jumped" && label !== "rumor") return nothing("ignored", null);
  const wantStatus = label === "jumped" ? "confirmed" : "rumor";
  const name = clean(f.name, 80), kind = ci(C.KINDS, f.kind), group = ci(C.GROUPS, f.group);
  const problems = [];
  if (!name) problems.push("`name`");
  if (!date) problems.push("`date` (YYYY-MM-DD)");
  if (!kind) problems.push(`\`kind\` (one of: ${C.KINDS.join(", ")})`);
  if (!group) problems.push(`\`group\` (one of: ${C.GROUPS.join(", ")})`);
  if (kind === "Rumored exit" && wantStatus === "confirmed") problems.push("`kind` must be an actual exit, not \"Rumored exit\", for a confirmed entry");
  if (problems.length) return nothing("invalid", `Can't add this yet. Missing or invalid: ${problems.join(", ")}. Edit the block, then add the label again.`);

  const sources = [];
  if (source) sources.push(source);
  if (ctx.issueUrl && !source && f.fromForm) { /* form without a source URL: nothing to add */ }
  // optional figure appearance; anything invalid or "random" is simply ignored
  const looks = {};
  const fig = ci(C.FIGURES, f.figure), hair = ci(C.HAIR_STYLES, f.hair), tone = Number(f.skin);
  if (fig) looks.figure = fig;
  if (Number.isInteger(tone) && tone >= 1 && tone <= C.SKIN_TONE_COUNT) looks.skin = tone;
  if (hair) looks.hair = hair;
  const existing = entries.find(e => e.name.toLowerCase() === name.toLowerCase());
  let entry, verb;
  if (existing) {
    entry = existing;
    Object.assign(entry, looks);
    for (const s of sources) if (!entry.sources.some(x => x.url === s.url)) entry.sources.push(s);
    if (wantStatus === "confirmed" && entry.status !== "confirmed") {
      Object.assign(entry, { status: "confirmed", date, kind });
      if (f.role) entry.role = clean(f.role, 160);
      if (f.summary) entry.summary = clean(f.summary, 300);
      verb = "promoted";
    } else if (wantStatus === "confirmed") verb = "source-added";
    else verb = "source-added";
  } else {
    const base = `${slug(name.split(" ").slice(-1)[0] || name)}-${date}`;
    let id = base, n = 2;
    while (entries.some(e => e.id === id)) id = `${base}-${n++}`;
    entry = { id, date, name, role: clean(f.role, 160), kind, group, status: wantStatus, summary: clean(f.summary, 300), sources, addedBy: f.candidate ? "updater" : "manual", addedAt: now };
    if (wantStatus === "rumor" && /^(y|true|1)/i.test(f.denied || "")) entry.denied = true;
    if (f.quip) entry.quip = clean(f.quip, 140);
    Object.assign(entry, looks);
    entries.push(entry);
    verb = "added";
  }
  const commit = wantStatus === "confirmed" && verb !== "source-added"
    ? `update: +1 overboard (${entry.name})`
    : verb === "added" ? `update: +1 wobbling (${entry.name})` : `update: new source for ${entry.name}`;
  return { result: "ok", entries, status, comment: `${verb === "promoted" ? "Promoted" : verb === "added" ? "Added" : "Updated"} **${entry.name}** (${entry.status}). Live shortly at ${C.SITE_URL}`, commit, close: true };
}
