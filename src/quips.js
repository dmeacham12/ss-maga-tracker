// Deadpan one-liners shown under the caption. They are about the ship and the *kind* of exit,
// never about a specific person. An entry can override its line with an optional "quip" field.

import { hash } from "./figures.js";

const POOLS = {
  "Resigned": ["Spending more time with the family.", "Pursuing other opportunities, preferably dry ones.", "Left a strongly worded nothing behind."],
  "Fired": ["Pink slip, delivered by seagull.", "Escorted to the lifeboats by security.", "Received the news by airmail."],
  "Removed": ["Gently but firmly relocated to the lifeboats.", "Moved along, with paperwork."],
  "Stepped down": ["Took the stairs. All of them.", "Down one step, into the water."],
  "Retiring": ["Trading the deck for a deck chair.", "Cashing in the shuffleboard fund."],
  "Not seeking re-election": ["Declined the return voyage.", "Not booking the round trip."],
  "Left the party": ["Left the party early. Cake was fine.", "Found a different party, on a different ship."],
  "Rumored exit": ["Seen eyeing the lifeboats. Allegedly."],
};
const FALLBACK = ["Splash."];

export function quipFor(e) {
  if (e.quip) return String(e.quip).slice(0, 140);
  const pool = POOLS[e.kind] || FALLBACK;
  return pool[hash(e.id) % pool.length];
}
