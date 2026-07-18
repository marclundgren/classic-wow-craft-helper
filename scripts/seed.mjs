// Seed src/data/items.json with items (and their full reagent trees)
// pulled from Wowhead's TBC database.
//
// Usage:
//   node scripts/seed.mjs "Deathblow X11 Goggles" 32478 "Spellstrike Hood"
//
// Arguments may be item names (resolved via Wowhead search) or numeric ids.
// Results merge into the existing JSON so you can seed incrementally.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchItem, searchItems, resolveItemTree } from "../src/lib/wowhead.mjs";

const DATA_FILE = path.join(import.meta.dirname, "..", "src", "data", "items.json");
const DELAY_MS = 400; // be polite to Wowhead

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadDb() {
  try {
    return JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function idForArg(arg) {
  if (/^\d+$/.test(arg)) return Number(arg);
  const results = await searchItems(arg);
  await sleep(DELAY_MS);
  const exact = results.find((r) => r.name.toLowerCase() === arg.toLowerCase());
  const pick = exact ?? results.find((r) => r.crafted) ?? results[0];
  if (!pick) {
    console.warn(`  !! no item found for "${arg}"`);
    return null;
  }
  console.log(`  "${arg}" -> ${pick.name} (${pick.id})`);
  return pick.id;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/seed.mjs <item name or id> [...]");
  process.exit(1);
}

const db = await loadDb();
let fetched = 0;

const get = async (id) => {
  if (db[id]) return db[id];
  const item = await fetchItem(id);
  await sleep(DELAY_MS);
  fetched += 1;
  if (item) console.log(`  + ${item.name} (${item.id})${item.recipe ? " [crafted]" : ""}`);
  else console.warn(`  !! item ${id} not found`);
  return item;
};

for (const arg of args) {
  console.log(`Resolving: ${arg}`);
  const id = await idForArg(arg);
  if (id == null) continue;
  const tree = await resolveItemTree(id, get);
  Object.assign(db, tree);
}

await mkdir(path.dirname(DATA_FILE), { recursive: true });
await writeFile(DATA_FILE, JSON.stringify(db, null, 1));
console.log(`\nDone. ${fetched} items fetched, ${Object.keys(db).length} items in database.`);
