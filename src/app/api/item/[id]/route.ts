import staticData from "@/data/items.json";
import { fetchItem, resolveItemTree } from "@/lib/wowhead.mjs";
import type { Item, ItemDb } from "@/lib/types";

export const dynamic = "force-dynamic";

const staticDb = staticData as ItemDb;

// Per-instance cache of items fetched live from Wowhead.
const liveCache = new Map<number, Item>();

async function getItem(id: number): Promise<Item | null> {
  const known = staticDb[id] ?? liveCache.get(id);
  if (known) return known;
  const item: Item | null = await fetchItem(id);
  if (item) liveCache.set(id, item);
  return item;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rootId = Number(id);
  if (!Number.isInteger(rootId) || rootId <= 0) {
    return Response.json({ error: "bad-id" }, { status: 400 });
  }
  try {
    const items = (await resolveItemTree(rootId, getItem)) as ItemDb;
    if (!items[rootId]) {
      return Response.json({ error: "not-found" }, { status: 404 });
    }
    return Response.json({ items });
  } catch {
    return Response.json({ error: "resolve-failed" }, { status: 502 });
  }
}
