import { searchItems } from "@/lib/wowhead.mjs";
import type { SearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ results: [] });
  try {
    const results: SearchResult[] = await searchItems(q);
    return Response.json(
      { results },
      { headers: { "cache-control": "public, max-age=3600" } }
    );
  } catch {
    return Response.json({ results: [], error: "search-failed" }, { status: 502 });
  }
}
