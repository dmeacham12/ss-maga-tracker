# SS MAGA: Abandon Ship tracker

A single-page satirical tracker hosted on GitHub Pages. A ship labeled **SS MAGA** sails a timeline that starts on election night, Nov 3, 2026. Trump-administration officials and Republican officeholders who resign, are fired or removed, or step down jump overboard into life preservers on the date they left. The ship slowly takes on water and sinks completely at the end of the story (see "Sinking rules").

The starting point is `reference/index.html`, an earlier prototype. Keep its behavior and data format. Replace its look, which reads like flat paper cutouts.

## Look and feel

- Make it feel like a polished animated explainer, not clip art. Draw the scene in SVG or canvas with depth: gradient skies, layered parallax water with highlights and foam, a wake behind the ship, soft shadows and reflections, and atmospheric haze toward the horizon.
- The ship is a detailed ocean liner with **SS MAGA** on the hull. As it sinks it should list toward the stern, sit lower in the water, and show water washing over the deck in the final stage.
- People are stylized generic figures with varied clothing colors and builds. They are not likenesses or caricatures of real people. Each has a name tag.
- The jump sequence goes: walk to the rail, hesitate, leap with a tumble, splash with particles and ripples, then pop up inside a red-and-white life preserver that bobs. Figures drift behind as the ship moves on.
- Rumored departures stand at the rail leaning over the side with a "?" on their tag. They never count and never jump until confirmed.
- Sky and lighting shift gradually across the timeline. Night is used in dark mode.
- Use GSAP (pinned version from cdnjs) or hand-rolled requestAnimationFrame. Hold 60fps on a mid-range phone.
- Controls: play/pause, restart, a scrubber with tick marks at each departure, and a "Watch the jump" button per person in the list below the scene.
- Include a running tally (overboard, wobbling, days since Nov 3), a caption line for the latest jump, and a "last checked for news" timestamp.
- Must work well on mobile, respect `prefers-reduced-motion` (show the end state with no motion), support light and dark mode, and keep everything keyboard accessible.

## Data

Content lives in `data/`, not in the page.

`data/entries.json` holds an array of entries:

```json
{
  "id": "dhillon-2026-11-05",
  "date": "2026-11-05",
  "name": "Harmeet Dhillon",
  "role": "Assistant Attorney General, DOJ Civil Rights Division",
  "kind": "Resigned | Fired | Removed | Stepped down | Retiring | Not seeking re-election | Left the party | Rumored exit",
  "group": "Administration | Congress | Party & states",
  "status": "confirmed | rumor",
  "summary": "One sentence in our own words.",
  "sources": [{ "name": "Newsweek", "url": "https://..." }],
  "addedBy": "manual | updater",
  "addedAt": "2026-11-05T18:00:00Z"
}
```

`data/status.json` holds the sinking state and updater metadata:

```json
{
  "termEnd": "2029-01-20",
  "endEvent": null,
  "lastChecked": "2026-11-05T18:00:00Z"
}
```

`endEvent` stays `null` until the ship should fully sink. When it fires, it becomes `{ "type": "...", "date": "...", "sources": [...] }`.

Seed `entries.json` with:

- **Mike Johnson**, 2026-11-04, Stepped down, Congress, confirmed. He won't run for House GOP leader after the midterm losses and stays in Congress. Sources: Axios, NBC News.
- **Harmeet Dhillon**, 2026-11-05, Resigned, Administration, confirmed. Source: Newsweek.
- **Marco Rubio**, 2026-11-05, Rumored exit, Administration, rumor. The Independent reports he is preparing to leave for a 2028 run, and the White House and State Department call it baseless. Source: Mediaite.

## Sinking rules

- Base sinking is proportional to time elapsed from 2026-11-03 to `termEnd`, eased so it is gentle early and dramatic near the end.
- Each confirmed departure adds a small extra list or dip so busy weeks are visible. Cap the total so the ship is never fully under before the end event.
- The ship fully sinks on whichever comes first: `termEnd`, or an `endEvent`.
- Which events count as `endEvent` is set by `END_EVENT_TYPES` in `config.js`. The default is `["house_impeachment", "removal", "resignation"]`.
- Note on that default: the House has already impeached Trump twice (2019 and 2021) without removing him. A new House impeachment is the trigger the owner asked for, and Senate conviction ("removal") is what actually ends a presidency. Keep both as options in config.
- When the ship goes down, play a final sinking sequence. Every remaining figure on deck goes into the water in a life preserver, and the screen shows a closing card with the final tally.

## News updater (no AI, human-confirmed)

The updater uses GitHub Actions only, with no AI or paid API. The owner confirms every entry from their phone.

### 1. Scan

`.github/workflows/scan.yml` runs on a cron every 2 hours (`7 */2 * * *`) and on `workflow_dispatch`.

- `scripts/scan.mjs` pulls a configurable list of politics RSS feeds and news-search RSS queries from `config.js`.
- It matches headlines that contain an exit word (resign, resignation, steps down, stepping down, fired, ousted, removed, retiring, won't seek re-election, impeach, impeachment) and also a scope term (Trump administration, White House, Cabinet, Republican, GOP, R-, RNC, plus names already in `entries.json`).
- It skips anything already in `data/seen.json`, deduped by URL and by normalized title.
- It groups headlines that look like the same story within 24 hours into one candidate.
- It updates `lastChecked` in `data/status.json` every run, committed as `github-actions[bot]`.

### 2. Notify

For each new candidate, open a GitHub issue labeled `candidate` and **assigned to the repo owner**. The owner login comes from `config.js`, and assignment is what triggers the GitHub Mobile push notification.

- Title: the headline, trimmed to 80 characters.
- The body has the headline link, the outlet, the date, and an editable block:

```
name:
role:
date: 2026-11-05
kind: Resigned
group: Administration
summary:
```

Prefill `date`. Guess `name` only when it exactly matches an existing entry. Leave the rest blank.

The issue body ends with short instructions: "Edit the block above, then add the label `jumped` (confirmed), `rumor`, or `dismiss`."

Cap new issues at 5 per run. If more match, add a single overflow issue listing the extra links.

### 3. Apply

`.github/workflows/apply.yml` triggers on `issues: labeled`.

- **`jumped` or `rumor`:** parse the block. If required fields (`name`, `date`, `kind`, `group`) are missing, comment on the issue saying what's missing and stop. Otherwise add or merge the entry in `entries.json` with the issue's link as a source, and set the status to `confirmed` (`jumped`) or `rumor`. If a rumor for the same person exists, `jumped` promotes it. Commit `update: +1 overboard (Name)`, comment with the live site link, and close the issue.
- **`dismiss`:** close the issue with no change. The URL stays in `seen.json` so it never comes back.
- **`end-event`:** parse `type` and `date` from the block, write `endEvent` to `status.json`, commit, and close. Only the owner should use this.

Only act when the label was added by the repo owner (`github.event.sender.login`). Ignore labels added by anyone else.

### 4. Manual add

Include an issue form at `.github/ISSUE_TEMPLATE/departure.yml` with fields for name, role, date, kind, group, status, and source URL. The owner can add someone from the GitHub app at any time. Submitting the form auto-applies the `jumped` or `rumor` label based on the status field, and the apply workflow handles it.

### 5. Site refresh

Pages redeploys on push. The page fetches `data/*.json` with cache-busting and re-checks every 10 minutes, so open tabs pick up new jumps. The newest jump plays automatically when it is new since the visitor's last visit (track this in localStorage).

### Rules

- `summary` is written by the owner in their own words. Never copy headline or article text into the site beyond the outlet name and link.
- Scope covers Trump-administration officials, Republican members of Congress, Republican governors and statewide officials, and RNC or state-party leadership.
- Workflows use the default `GITHUB_TOKEN` with `contents: write` and `issues: write` permissions only. No other secrets are needed.

## Repo layout

```
index.html
assets/        (scene art, sounds if added)
src/           (scene, timeline, ui modules)
data/entries.json
data/status.json
data/seen.json
config.js              (owner login, feeds, keywords, END_EVENT_TYPES)
scripts/scan.mjs
scripts/apply.mjs
.github/workflows/scan.yml
.github/workflows/apply.yml
.github/workflows/pages.yml
.github/ISSUE_TEMPLATE/departure.yml
reference/index.html   (old prototype)
```

## Done when

- The site deploys from `main` to GitHub Pages.
- The seeded entries animate correctly on desktop and mobile.
- A manual scan run with a fake headline fixture opens an assigned issue.
- Labeling that issue `jumped` adds the entry, commits it, and closes the issue.
- The manual issue form works from the GitHub mobile app.
- Reduced motion and dark mode both look right.
- The README explains how to add an entry by hand, how to change `END_EVENT_TYPES` and the feed list, how to pause the scan, and how to turn on GitHub Mobile push for assignments.
