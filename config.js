// Shared by the site (browser) and the scripts (Node). Keep it plain ES module data.

export const OWNER_LOGIN = "dmeacham12";
export const REPO = "dmeacham12/ss-maga-tracker";
export const SITE_URL = "https://dmeacham12.github.io/ss-maga-tracker/";

export const START_DATE = "2026-11-03";

// Events that fully sink the ship. Allowed values: house_impeachment, removal, resignation.
// The House already impeached Trump twice (2019, 2021) without removal, so "removal"
// (Senate conviction) is what actually ends a presidency. Edit this list to taste.
export const END_EVENT_TYPES = ["house_impeachment", "removal", "resignation"];

export const REFRESH_MINUTES = 10;

export const KINDS = [
  "Resigned", "Fired", "Removed", "Stepped down", "Retiring",
  "Not seeking re-election", "Left the party", "Rumored exit",
];
export const GROUPS = ["Administration", "Congress", "Party & states"];

// ---- News scanner ----
export const FEEDS = [
  "https://feeds.npr.org/1014/rss.xml",
  "https://rss.politico.com/politics-news.xml",
  "https://thehill.com/homenews/feed/",
  "https://www.axios.com/feeds/feed.rss",
  "https://feeds.washingtonpost.com/rss/politics",
  "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
];
// Google News search RSS. {q} queries are URL-encoded by the scanner.
export const SEARCH_QUERIES = [
  "Trump administration resigns",
  "Republican steps down",
  "Cabinet secretary fired OR ousted",
  "GOP congressman retiring OR \"won't seek re-election\"",
  "House impeachment Trump",
];
export const SEARCH_URL = "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=";

export const EXIT_WORDS = [
  "resign", "resigns", "resigned", "resignation", "steps down", "stepping down", "stepped down",
  "fired", "ousted", "removed", "retiring", "retires", "won't seek re-election",
  "will not seek re-election", "impeach", "impeachment",
];
export const SCOPE_TERMS = [
  "Trump administration", "White House", "Cabinet", "Republican", "GOP", "RNC",
];
// Matches party-state tags such as "R-La." or "(R-Texas)". Word-bounded to avoid noise.
export const SCOPE_REGEX_SOURCE = "\(R-[A-Za-z.]+\)";

export const MAX_ISSUES_PER_RUN = 5;
export const CLUSTER_HOURS = 24;
