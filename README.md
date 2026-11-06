# SS MAGA: Abandon Ship tracker

A satirical single-page tracker on GitHub Pages. A ship, the **SS MAGA**, sails a timeline that starts on election night, Nov 3, 2026. Trump-administration officials and Republican officeholders who resign, are fired, or step down jump overboard into life preservers on the date they left. The ship slowly takes on water and goes down at the end of the term, or sooner if an end event fires.

Everything on the page comes from `data/*.json`. There is no build step and no AI: a GitHub Action scans news feeds, opens an issue for each possible departure, and you confirm or dismiss it from your phone.

## Run it locally

```bash
npm run serve   # http://localhost:8080
npm test        # model + script tests, no network needed
```

## Add an entry by hand

Pick whichever is easiest.

1. **From the GitHub app (best on a phone):** New issue, then **Departure**. Fill in the form and submit. Choose `confirmed` to send them overboard or `rumor` to leave them wobbling at the rail. The apply workflow adds the entry, commits, redeploys the site, comments, and closes the issue.
2. **Edit the file:** add an object to [data/entries.json](data/entries.json) and commit:

```json
{
  "id": "lastname-2026-11-05",
  "date": "2026-11-05",
  "name": "Full Name",
  "role": "Title or office",
  "kind": "Resigned",
  "group": "Administration",
  "status": "confirmed",
  "summary": "One sentence in your own words.",
  "sources": [{ "name": "Outlet", "url": "https://..." }],
  "addedBy": "manual",
  "addedAt": "2026-11-05T18:00:00Z"
}
```

`kind` is one of Resigned, Fired, Removed, Stepped down, Retiring, Not seeking re-election, Left the party, Rumored exit. `group` is Administration, Congress, or Party & states. `status` is `confirmed` or `rumor`. Rumors stand at the rail and never jump or count until you confirm them.

Write `summary` yourself. Do not paste headline or article text; the site only shows the outlet name and link.

## How each figure looks

Figures are generic stand-ins. By default each one's look is picked at random from its id. You can set three optional fields on any entry to make a figure fit the person; nothing is ever guessed from a name.

```json
"figure": "woman",   // woman, man, or neutral: picks the outfit and hairstyle pool
"skin": 4,           // 1 (lightest) to 6 (deepest)
"hair": "curly"      // short, long, bald, bun, side, bob, curly, or buzz
```

Open `gallery.html` on the site (for example `https://dmeacham12.github.io/ss-maga-tracker/gallery.html`) to see every option. In a candidate issue, add `figure:`, `skin:` and `hair:` lines to the block. The Departure form has the same three dropdowns, and `random` leaves the choice to the site. Hair color is picked to suit the skin tone.

## The jokes

Everything funny is aimed at the ship and the situation, never at a person. Figures are generic, and which jump style someone gets (swan dive, cannonball, backflip, belly flop, briefcase plunge) and their judges' scores come from a hash of the entry id, so they are pure randomness.

- **Judges' paddles** pop up after each splash, and the closing card shows a final dive scorecard.
- **The ship coping badly:** a duct-tape patch appears per departure, a "Nothing to see here" sign and bucket-bailers show up after two, the band plays on, and the funnels sputter during the final sinking. Gulls leave first and a shark fin circles at the end.
- **Caption quips** come from the kind of exit (see [src/quips.js](src/quips.js)). To write your own for one entry, add `"quip": "Your line."` to it in `data/entries.json`.
- **Denied rumors:** add `"denied": true` to a rumor to pin a "TOTALLY FINE" pennant on it. In a candidate issue block you can add `denied: yes` and `quip: ...` lines.
- **Extras:** tap the ship (or the Honk button) for a honk, tap a floating figure to make them wave. Sound is off until a visitor turns it on.

## How the updater works

1. **Scan** ([scan.yml](.github/workflows/scan.yml)) runs every 2 hours. [scripts/scan.mjs](scripts/scan.mjs) reads the feeds in `config.js`, keeps headlines with an exit word and a scope term, skips anything already in `data/seen.json`, groups headlines about the same story, and opens up to 5 issues per run (plus one overflow issue). Each issue is labeled `candidate` and **assigned to you**. It also updates `lastChecked` in `data/status.json`.
2. **Decide.** Open the issue, edit the `name / role / date / kind / group / summary` block, then add a label:
   - `jumped`: confirmed, adds them overboard.
   - `rumor`: adds or keeps them at the rail. A later `jumped` promotes the rumor.
   - `dismiss`: closes the issue. The URL stays in `seen.json` so it never returns.
   - `end-event`: add `type:` and `date:` lines to the block first (for example `type: removal`). Sets the end event in `data/status.json`.
3. **Apply** ([apply.yml](.github/workflows/apply.yml)) only acts on labels added by the repo owner. If a required field is missing it comments with what to fix and removes the label so you can add it again.
4. **Deploy** ([pages.yml](.github/workflows/pages.yml)). The page also re-fetches the data every 10 minutes, so open tabs pick up new jumps. A returning visitor sees the newest jump play automatically.

### Test the scan without waiting

Actions tab, **scan**, **Run workflow**, and set `fixture` to `test/fixtures/fake-feed.xml`. It opens real assigned issues from a fake feed and does not touch `seen.json`. Then label one `jumped` to see the full loop. Locally, `node scripts/scan.mjs --fixture test/fixtures/fake-feed.xml --dry` prints the issues instead.

## Change the settings

Everything lives in [config.js](config.js).

- **`END_EVENT_TYPES`** decides which events sink the ship. Default: `["house_impeachment", "removal", "resignation"]`. The House has already impeached Trump twice (2019, 2021) without removal, so a new House impeachment is the trigger you asked for, while Senate conviction (`removal`) is what actually ends a presidency. Remove entries you do not want, for example `["removal", "resignation"]`.
- **`FEEDS`** are direct RSS URLs. **`SEARCH_QUERIES`** are Google News search terms. Add or delete lines freely.
- **`EXIT_WORDS`** and **`SCOPE_TERMS`** control which headlines match. A headline needs one of each (or the name of someone already in `entries.json`).
- **`OWNER_LOGIN`** is the account that gets assigned and the only one whose labels count.

The ship sinks fully on `termEnd` in `data/status.json` (default 2029-01-20) or on the end event, whichever comes first.

## Pause the scan

Set a repository variable named `SCAN_PAUSED` to `true` (Settings, Secrets and variables, Actions, Variables, from the web). Set it back to anything else to resume. You can also disable the **scan** workflow in the Actions tab. Manual entries keep working while the scan is paused.

## Get a push notification on your phone

1. Install **GitHub Mobile** and sign in.
2. In the app: Profile, Settings, Notifications, and turn on push notifications.
3. On github.com: Settings, Notifications, and make sure **Participating, @mentions and custom** is enabled for the Mobile push option.
4. Each candidate issue is assigned to you, which is what triggers the push. Tap it, edit the block, add a label.

## One-time repo setup

- Settings, Pages, **Source: GitHub Actions**.
- Settings, Actions, General, **Workflow permissions: Read and write**.
- Optional: create the labels `jumped`, `rumor`, `dismiss`, and `end-event`. The scan creates them on its first run.

The workflows use only the default `GITHUB_TOKEN`; no other secrets are needed. The Pages workflow additionally needs the `pages: write` and `id-token: write` permissions that GitHub requires for Actions-based deploys. Pushes made by `GITHUB_TOKEN` do not trigger other workflows, so scan and apply call the Pages workflow directly after they commit.

## Repo layout

```
index.html, gallery.html
assets/        favicon
src/           model.js (timeline + sinking), scene.js (art + animation), figures.js, palette.js, quips.js, sound.js, main.js, style.css
data/          entries.json, status.json, seen.json
config.js      owner login, feeds, keywords, END_EVENT_TYPES
scripts/       scan.mjs, apply.mjs, lib.mjs, serve.mjs
test/          model and script tests, fake-feed fixture
.github/       workflows (scan, apply, pages) and the Departure issue form
reference/     the old prototype
```

## Notes

Satire built from public reporting. Figures are generic stand-ins generated from a hash of the entry id, never likenesses. Dates mark when an exit was announced or reported, and every entry links to its source.
