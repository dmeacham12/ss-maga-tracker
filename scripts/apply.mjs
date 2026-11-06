// Apply an owner-labeled issue to the data files. Called by apply.yml.
// Inputs come from environment variables (never interpolated into a shell):
//   LABEL, ISSUE_BODY, ISSUE_URL, SENDER
// Writes data/*.json when there is something to commit, and writes a small result file the
// workflow reads: RESULT_FILE (default: apply-result.json) = { result, comment, commit, close }.

import { readFile, writeFile } from "node:fs/promises";
import { applyAction, parseIssue } from "./lib.mjs";

const root = new URL("../", import.meta.url);
const readJson = async p => JSON.parse(await readFile(new URL(p, root), "utf8"));
const writeJson = (p, v) => writeFile(new URL(p, root), JSON.stringify(v, null, 2) + "\n");

// Issue-form submissions arrive without a label: derive it from the form's Status field.
let label = process.env.LABEL;
if (label === "auto") label = parseIssue(process.env.ISSUE_BODY).status === "rumor" ? "rumor" : "jumped";

const out = await applyAction({
  label,
  body: process.env.ISSUE_BODY,
  issueUrl: process.env.ISSUE_URL,
  sender: process.env.SENDER,
  entries: await readJson("data/entries.json"),
  status: await readJson("data/status.json"),
});

if (out.commit) {
  await writeJson("data/entries.json", out.entries);
  await writeJson("data/status.json", out.status);
}
const resultFile = process.env.RESULT_FILE || "apply-result.json";
await writeFile(resultFile, JSON.stringify({ result: out.result, comment: out.comment, commit: out.commit, close: out.close }));
console.log(out.result, out.commit || "(no change)");
