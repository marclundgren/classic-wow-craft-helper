import type { ItemDb, Order } from "./types";

export type MaterialLine = { id: number; count: number };

export type CraftStep = {
  id: number;
  /** Total of this item required across the whole plan. */
  needed: number;
  /** How many times to perform the craft (accounts for recipe yield). */
  crafts: number;
  /** Aggregated reagents consumed across all crafts of this step. */
  reagents: MaterialLine[];
  /** Distance from the ordered items; higher = closer to raw materials. */
  depth: number;
};

export type Plan = {
  /** Aggregated raw materials to gather/buy. */
  raw: MaterialLine[];
  /** Intermediate crafts in suggested order (first entry = craft first). */
  steps: CraftStep[];
};

/**
 * Expand the selected orders into a full shopping plan.
 *
 * Demand is propagated topologically so that an item needed by several
 * parents is aggregated before its craft count is rounded up — otherwise
 * recipes with yield > 1 would overcount reagents.
 *
 * An item counts as raw when it has no known recipe, when the user chose
 * to buy it directly (`buyDirect`), or when expanding it would close a
 * cycle in the data (defensive guard).
 */
export function computePlan(
  db: ItemDb,
  orders: Order[],
  buyDirect: ReadonlySet<number>
): Plan {
  const expands = (id: number): boolean =>
    Boolean(db[id]?.recipe) && !buyDirect.has(id);

  // DFS post-order gives a topological order; edges that would close a
  // cycle are recorded and later treated as demands for raw materials.
  const postOrder: number[] = [];
  const state = new Map<number, "visiting" | "done">();
  const cyclicEdges = new Set<string>();

  const visit = (id: number): void => {
    if (state.has(id)) return;
    state.set(id, "visiting");
    if (expands(id)) {
      for (const reagent of db[id].recipe!.reagents) {
        if (state.get(reagent.id) === "visiting") {
          cyclicEdges.add(`${id}->${reagent.id}`);
        } else {
          visit(reagent.id);
        }
      }
    }
    state.set(id, "done");
    postOrder.push(id);
  };

  const demand = new Map<number, number>();
  const childDemand = new Set<number>(); // items demanded as reagents
  for (const order of orders) {
    if (order.count <= 0) continue;
    visit(order.id);
    demand.set(order.id, (demand.get(order.id) ?? 0) + order.count);
  }

  const raw = new Map<number, number>();
  const depths = new Map<number, number>();
  const steps: CraftStep[] = [];

  // Reverse post-order = parents before children, so each item's total
  // demand is final by the time we reach it.
  for (let i = postOrder.length - 1; i >= 0; i--) {
    const id = postOrder[i];
    const total = demand.get(id) ?? 0;
    if (total === 0) continue;

    if (!expands(id)) {
      raw.set(id, (raw.get(id) ?? 0) + total);
      continue;
    }

    const recipe = db[id].recipe!;
    const crafts = Math.ceil(total / recipe.yield);
    const depth = depths.get(id) ?? 0;

    if (childDemand.has(id)) {
      steps.push({
        id,
        needed: total,
        crafts,
        reagents: recipe.reagents.map((r) => ({ id: r.id, count: r.count * crafts })),
        depth,
      });
    }

    for (const reagent of recipe.reagents) {
      const amount = reagent.count * crafts;
      if (cyclicEdges.has(`${id}->${reagent.id}`)) {
        raw.set(reagent.id, (raw.get(reagent.id) ?? 0) + amount);
      } else {
        demand.set(reagent.id, (demand.get(reagent.id) ?? 0) + amount);
        childDemand.add(reagent.id);
        depths.set(reagent.id, Math.max(depths.get(reagent.id) ?? 0, depth + 1));
      }
    }
  }

  // Deepest first: crafts closest to raw materials happen first.
  steps.sort(
    (a, b) =>
      b.depth - a.depth || (db[a.id]?.name ?? "").localeCompare(db[b.id]?.name ?? "")
  );

  const rawLines = [...raw.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort(
      (a, b) =>
        b.count - a.count || (db[a.id]?.name ?? "").localeCompare(db[b.id]?.name ?? "")
    );

  return { raw: rawLines, steps };
}
