/**
 * WoW money helpers. Everything is stored in copper — the game's base unit —
 * so totals never accumulate floating-point drift.
 *
 * 1 gold = 100 silver = 10,000 copper.
 */

export const COPPER_PER_SILVER = 100;
export const COPPER_PER_GOLD = 10_000;

export type MoneyParts = { gold: number; silver: number; copper: number };

/**
 * Parse a price the way a player would type it.
 *
 * Accepts suffixed money ("12g50s", "12g 50s 30c", "75s") and bare numbers,
 * which are read as gold so "40" and "2.5" mean 40g and 2g 50s.
 * Returns null for anything unparseable, including the empty string.
 */
export function parseMoney(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/[\s,]/g, "");
  if (text === "") return null;

  if (/^\d*\.?\d+$/.test(text)) {
    const gold = Number(text);
    return Number.isFinite(gold) ? Math.round(gold * COPPER_PER_GOLD) : null;
  }

  const match = text.match(
    /^(?:(\d*\.?\d+)g)?(?:(\d*\.?\d+)s)?(?:(\d*\.?\d+)c)?$/
  );
  if (!match) return null;
  const [, g, s, c] = match;
  if (g === undefined && s === undefined && c === undefined) return null;

  const copper =
    Number(g ?? 0) * COPPER_PER_GOLD +
    Number(s ?? 0) * COPPER_PER_SILVER +
    Number(c ?? 0);
  return Number.isFinite(copper) ? Math.round(copper) : null;
}

/** Split a copper amount into its gold / silver / copper components. */
export function splitMoney(copper: number): MoneyParts {
  const total = Math.max(0, Math.round(copper));
  return {
    gold: Math.floor(total / COPPER_PER_GOLD),
    silver: Math.floor((total % COPPER_PER_GOLD) / COPPER_PER_SILVER),
    copper: total % COPPER_PER_SILVER,
  };
}

/** Render copper as "12g 50s 30c", dropping empty leading denominations. */
export function formatMoney(copper: number): string {
  const { gold, silver, copper: c } = splitMoney(copper);
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold.toLocaleString("en-US")}g`);
  if (silver > 0) parts.push(`${silver}s`);
  if (c > 0 || parts.length === 0) parts.push(`${c}c`);
  return parts.join(" ");
}
