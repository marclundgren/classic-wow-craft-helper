// Wowhead TBC data access: item XML parsing, name search, and recursive
// recipe-tree resolution. Plain ESM so both Next.js code and the seed
// script (scripts/seed.mjs) can share it.

const BASE = "https://www.wowhead.com/tbc";

const FETCH_HEADERS = {
  "user-agent":
    "classic-wow-craft-helper/0.1 (personal crafting planner; contact: local dev)",
};

/**
 * Parse a Wowhead `item=<id>&xml` payload into our item shape.
 * Returns null when the payload has no item (bad id).
 *
 * Shape: { id, name, quality, icon, recipe?: { yield, reagents: [{ id, count }] } }
 */
export function parseItemXml(id, xml) {
  const name = xml.match(/<name><!\[CDATA\[([\s\S]*?)\]\]><\/name>/)?.[1];
  if (!name) return null;

  const quality = Number(xml.match(/<quality id="(-?\d+)"/)?.[1] ?? 1);
  const icon =
    xml.match(/<icon[^>]*>([^<]+)<\/icon>/)?.[1] ?? "inv_misc_questionmark";

  const item = { id, name, quality, icon };

  const createdBy = xml.match(/<createdBy>([\s\S]*?)<\/createdBy>/)?.[1];
  if (createdBy) {
    // An item can be created by several spells (e.g. multiple professions);
    // take the first spell that actually lists reagents.
    const spellRe = /<spell ([^>]*)>([\s\S]*?)<\/spell>/g;
    for (const spellMatch of createdBy.matchAll(spellRe)) {
      const [, attrs, body] = spellMatch;
      const spellName = attrs.match(/name="([^"]*)"/)?.[1] ?? "";
      const reagents = [];
      const reagentRe = /<reagent id="(\d+)"[^>]*count="(\d+)"/g;
      for (const m of body.matchAll(reagentRe)) {
        reagents.push({ id: Number(m[1]), count: Number(m[2]) });
      }
      if (reagents.length === 0) continue;

      // minCount is how many the spell produces per craft (0 means 1).
      const minCount = Number(attrs.match(/minCount="(\d+)"/)?.[1] ?? 0);

      // Skip splitting spells (1 input -> many output, e.g. "Fire Sunder"
      // turning a Primal back into Motes); they aren't player crafts and
      // create mote<->primal cycles.
      if (minCount > 1 && reagents.length === 1 && reagents[0].count === 1) {
        continue;
      }

      // "Create Primal X" lists 9 mote reagents, but casting it also
      // consumes the mote you click, so the true cost is 10.
      if (/^Create Primal/.test(spellName) && reagents.length === 1) {
        reagents[0].count += 1;
      }

      item.recipe = { yield: Math.max(1, minCount), reagents };
      break;
    }
  }

  return item;
}

/** Fetch and parse a single item. Returns null if the item doesn't exist. */
export async function fetchItem(id) {
  const res = await fetch(`${BASE}/item=${id}&xml`, { headers: FETCH_HEADERS });
  if (!res.ok) return null;
  return parseItemXml(id, await res.text());
}

/**
 * Search TBC items by name via Wowhead's suggestion endpoint.
 * Returns [{ id, name, icon, quality, crafted }] for item results only.
 */
export async function searchItems(query) {
  const url = `${BASE}/search/suggestions-template?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) return [];
  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .filter((r) => r.type === 3) // type 3 = item
    .map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon ?? "inv_misc_questionmark",
      quality: r.quality ?? 1,
      crafted: /crafted/i.test(r.pinDescription ?? ""),
    }));
}

/**
 * Resolve an item and every reagent reachable from it into a flat map
 * { [id]: item }. `get(id)` supplies items (from cache or network).
 */
export async function resolveItemTree(rootId, get) {
  const collected = {};
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (collected[id] !== undefined) continue;
    const item = await get(id);
    if (!item) continue;
    collected[id] = item;
    for (const reagent of item.recipe?.reagents ?? []) {
      if (collected[reagent.id] === undefined) queue.push(reagent.id);
    }
  }
  return collected;
}
