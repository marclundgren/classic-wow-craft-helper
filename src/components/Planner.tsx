"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Item, ItemDb, Order, SearchResult } from "@/lib/types";
import { computePlan } from "@/lib/materials";

const STORAGE_KEY = "tbc-craft-planner-v1";
const SUGGESTED_IDS = [32478, 24266, 21876]; // goggles, spellstrike hood, mooncloth bag

type Persisted = {
  orders: Order[];
  buyDirect: number[];
  checked: number[];
  extraItems: ItemDb;
};

function iconUrl(icon: string) {
  return `https://wow.zamimg.com/images/wow/icons/medium/${icon}.jpg`;
}

function wowheadUrl(id: number) {
  return `https://www.wowhead.com/tbc/item=${id}`;
}

function ItemIcon({ icon, size = 22 }: { icon: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="wicon"
      src={iconUrl(icon)}
      width={size}
      height={size}
      alt=""
      loading="lazy"
    />
  );
}

function ItemName({ item, id }: { item?: Item; id: number }) {
  if (!item) return <span className="name q0">Unknown item #{id}</span>;
  return (
    <a
      className={`name q${item.quality}`}
      href={wowheadUrl(id)}
      target="_blank"
      rel="noreferrer noopener"
      title="Open on Wowhead"
    >
      {item.name}
    </a>
  );
}

export default function Planner({ initialItems }: { initialItems: ItemDb }) {
  const [db, setDb] = useState<ItemDb>(initialItems);
  const [orders, setOrders] = useState<Order[]>([]);
  const [buyDirect, setBuyDirect] = useState<ReadonlySet<number>>(new Set());
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const hydrated = useRef(false);

  // Restore persisted plan once on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data: Persisted = JSON.parse(stored);
        setDb((d) => ({ ...d, ...data.extraItems }));
        setOrders(data.orders ?? []);
        setBuyDirect(new Set(data.buyDirect ?? []));
        setChecked(new Set(data.checked ?? []));
        setExpanded(new Set((data.orders ?? []).map((o) => o.id)));
      }
    } catch {
      // corrupted storage — start fresh
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const extraItems = Object.fromEntries(
      Object.entries(db).filter(([id]) => !(id in initialItems))
    );
    const data: Persisted = {
      orders,
      buyDirect: [...buyDirect],
      checked: [...checked],
      extraItems,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [db, orders, buyDirect, checked, initialItems]);

  const plan = useMemo(
    () => computePlan(db, orders, buyDirect),
    [db, orders, buyDirect]
  );

  // ----- search state -----
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemote([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!stale) setRemote(data.results ?? []);
      } catch {
        if (!stale) setRemote([]);
      } finally {
        if (!stale) setSearching(false);
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const localHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return Object.values(db)
      .filter((item) => item.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(Boolean(b.recipe)) - Number(Boolean(a.recipe)) ||
          a.name.localeCompare(b.name)
      )
      .slice(0, 8);
  }, [db, query]);

  const remoteHits = useMemo(
    () => remote.filter((r) => !db[r.id]).slice(0, 8),
    [remote, db]
  );

  const addOrder = (id: number) => {
    setOrders((prev) => {
      const existing = prev.find((o) => o.id === id);
      if (existing) {
        return prev.map((o) => (o.id === id ? { ...o, count: o.count + 1 } : o));
      }
      return [...prev, { id, count: 1 }];
    });
    setExpanded((prev) => new Set([...prev, id]));
  };

  const pick = async (hit: { id: number; name: string }) => {
    setOpen(false);
    setQuery("");
    setError(null);
    if (!db[hit.id]) {
      setImporting(hit.name);
      try {
        const res = await fetch(`/api/item/${hit.id}`);
        if (!res.ok) throw new Error("import failed");
        const data = await res.json();
        setDb((d) => ({ ...d, ...data.items }));
      } catch {
        setError(`Couldn't import "${hit.name}" from Wowhead. Try again.`);
        setImporting(null);
        return;
      }
      setImporting(null);
    }
    addOrder(hit.id);
  };

  const setCount = (id: number, count: number) => {
    if (count <= 0) {
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } else {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, count } : o)));
    }
  };

  const toggleBuy = (id: number) => {
    setBuyDirect((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleChecked = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [copied, setCopied] = useState(false);
  const copyList = async () => {
    const lines = plan.raw.map(
      (line) => `${line.count}x ${db[line.id]?.name ?? `item #${line.id}`}`
    );
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  const gathered = plan.raw.filter((line) => checked.has(line.id)).length;
  const suggestions = SUGGESTED_IDS.map((id) => db[id]).filter(Boolean);

  return (
    <div className="layout">
      <div className="stack">
        {/* ---- search + work orders ---- */}
        <section className="panel">
          <div className="panel-head">
            <h2>Work Orders</h2>
            {orders.length > 0 && (
              <button
                className="textbtn danger"
                onClick={() => {
                  setOrders([]);
                  setChecked(new Set());
                }}
              >
                Clear all
              </button>
            )}
          </div>
          <div className="panel-body">
            <div className="searchwrap">
              <input
                type="search"
                placeholder="Search any TBC item — try “Deathblow X11 Goggles”"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter") {
                    const first = localHits[0] ?? remoteHits[0];
                    if (first) pick(first);
                  }
                }}
                aria-label="Search items"
              />
              {open && query.trim().length >= 2 && (
                <div className="search-results">
                  {localHits.length > 0 && (
                    <div className="group-label">In your ledger</div>
                  )}
                  {localHits.map((item) => (
                    <button
                      key={item.id}
                      className="search-hit"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(item);
                      }}
                    >
                      <ItemIcon icon={item.icon} />
                      <span className={`q${item.quality}`}>{item.name}</span>
                      {item.recipe && <span className="hint">crafted</span>}
                    </button>
                  ))}
                  {remoteHits.length > 0 && (
                    <div className="group-label">From Wowhead</div>
                  )}
                  {remoteHits.map((hit) => (
                    <button
                      key={hit.id}
                      className="search-hit"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(hit);
                      }}
                    >
                      <ItemIcon icon={hit.icon} />
                      <span className={`q${hit.quality}`}>{hit.name}</span>
                      {hit.crafted && <span className="hint">crafted</span>}
                    </button>
                  ))}
                  {searching && <div className="search-note">Searching Wowhead…</div>}
                  {!searching && localHits.length === 0 && remoteHits.length === 0 && (
                    <div className="search-note">No items found.</div>
                  )}
                </div>
              )}
            </div>
            {importing && (
              <div className="search-note">Importing “{importing}” and its recipe tree…</div>
            )}
            {error && <div className="search-error">{error}</div>}

            {orders.length === 0 ? (
              <>
                <p className="empty">
                  Nothing planned yet. Search for an item above, or start with a
                  classic:
                </p>
                <div className="suggest-row">
                  {suggestions.map((item) => (
                    <button
                      key={item.id}
                      className="chip"
                      onClick={() => addOrder(item.id)}
                    >
                      <ItemIcon icon={item.icon} size={20} />
                      <span className={`q${item.quality}`}>{item.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div>
                {orders.map((order) => {
                  const item = db[order.id];
                  return (
                    <div className="order-row" key={order.id}>
                      <ItemIcon icon={item?.icon ?? "inv_misc_questionmark"} size={26} />
                      <span className="order-name">
                        <ItemName item={item} id={order.id} />
                      </span>
                      <span className="qty">
                        <button
                          onClick={() => setCount(order.id, order.count - 1)}
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="num">{order.count}</span>
                        <button
                          onClick={() => setCount(order.id, order.count + 1)}
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </span>
                      <button
                        className="remove"
                        onClick={() => setCount(order.id, 0)}
                        aria-label={`Remove ${item?.name ?? "item"}`}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ---- blueprints ---- */}
        {orders.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <h2>Blueprints</h2>
              <span className="meta">
                toggle “buy” on any part you’d rather get from the auction house
              </span>
            </div>
            <div className="panel-body tree">
              {orders.map((order) => {
                const item = db[order.id];
                return (
                  <details key={order.id} open={expanded.has(order.id)}>
                    <summary
                      onClick={(e) => {
                        e.preventDefault();
                        toggleExpanded(order.id);
                      }}
                    >
                      <span className="caret">▶</span>
                      <ItemIcon icon={item?.icon ?? "inv_misc_questionmark"} />
                      <span className="node" style={{ minWidth: 0 }}>
                        <span className="count">{order.count}×</span>
                        <ItemName item={item} id={order.id} />
                      </span>
                    </summary>
                    {item?.recipe && (
                      <TreeChildren
                        db={db}
                        parentId={order.id}
                        multiplier={Math.ceil(order.count / item.recipe.yield)}
                        buyDirect={buyDirect}
                        toggleBuy={toggleBuy}
                        ancestors={new Set([order.id])}
                      />
                    )}
                  </details>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <div className="stack">
        {/* ---- shopping list ---- */}
        <section className="panel">
          <div className="panel-head">
            <h2>Shopping List</h2>
            {plan.raw.length > 0 && (
              <span className="meta">
                {gathered}/{plan.raw.length} gathered
                {" · "}
                <button className="textbtn" onClick={copyList}>
                  {copied ? "Copied!" : "Copy list"}
                </button>
              </span>
            )}
          </div>
          <div className="panel-body">
            {plan.raw.length === 0 ? (
              <p className="empty">
                Raw materials will tally up here once you add a work order.
              </p>
            ) : (
              plan.raw.map((line) => {
                const item = db[line.id];
                const boughtCraftable = Boolean(item?.recipe);
                return (
                  <div
                    className={`shop-row ${checked.has(line.id) ? "done" : ""}`}
                    key={line.id}
                  >
                    <button
                      className="checkbox"
                      onClick={() => toggleChecked(line.id)}
                      aria-label={`Mark ${item?.name ?? "item"} as gathered`}
                    >
                      {checked.has(line.id) ? "✓" : ""}
                    </button>
                    <span className="count">{line.count}×</span>
                    <ItemIcon icon={item?.icon ?? "inv_misc_questionmark"} />
                    <ItemName item={item} id={line.id} />
                    {boughtCraftable && (
                      <>
                        <span className="buy-tag" title="You chose to buy this instead of crafting it">
                          buy
                        </span>
                        <button
                          className="mode-toggle"
                          onClick={() => toggleBuy(line.id)}
                          title="Craft this instead"
                        >
                          craft instead
                        </button>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ---- craft steps ---- */}
        {plan.steps.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <h2>Crafting Steps</h2>
              <span className="meta">in order — start at 1</span>
            </div>
            <div className="panel-body">
              {plan.steps.map((step, i) => {
                const item = db[step.id];
                const recipe = item?.recipe;
                const makes = recipe ? step.crafts * recipe.yield : step.needed;
                return (
                  <div className="step-row" key={step.id}>
                    <span className="step-num">{i + 1}</span>
                    <div className="step-main">
                      <div className="step-title">
                        <span className="count">{step.crafts}×</span>
                        <ItemIcon icon={item?.icon ?? "inv_misc_questionmark"} size={20} />
                        <ItemName item={item} id={step.id} />
                        {makes > step.needed && (
                          <span className="meta">
                            (makes {makes}, need {step.needed})
                          </span>
                        )}
                      </div>
                      <div className="step-reagents">
                        uses{" "}
                        {step.reagents
                          .map(
                            (r) =>
                              `${r.count}× ${db[r.id]?.name ?? `item #${r.id}`}`
                          )
                          .join(", ")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function TreeChildren({
  db,
  parentId,
  multiplier,
  buyDirect,
  toggleBuy,
  ancestors,
}: {
  db: ItemDb;
  parentId: number;
  multiplier: number;
  buyDirect: ReadonlySet<number>;
  toggleBuy: (id: number) => void;
  ancestors: ReadonlySet<number>;
}) {
  const recipe = db[parentId]?.recipe;
  if (!recipe) return null;
  return (
    <ul>
      {recipe.reagents.map((reagent) => {
        const item = db[reagent.id];
        const count = reagent.count * multiplier;
        const bought = buyDirect.has(reagent.id);
        const expandable =
          Boolean(item?.recipe) && !ancestors.has(reagent.id) && !bought;
        return (
          <li key={reagent.id}>
            <span className="node">
              <span className="count">{count}×</span>
              <ItemIcon icon={item?.icon ?? "inv_misc_questionmark"} size={20} />
              <ItemName item={item} id={reagent.id} />
              {item?.recipe && !ancestors.has(reagent.id) && (
                <button
                  className={`mode-toggle ${bought ? "buying" : ""}`}
                  onClick={() => toggleBuy(reagent.id)}
                  title={
                    bought
                      ? "Currently buying — click to craft it from materials"
                      : "Currently crafting — click to buy it as-is instead"
                  }
                >
                  {bought ? "buying" : "crafting"}
                </button>
              )}
            </span>
            {expandable && (
              <TreeChildren
                db={db}
                parentId={reagent.id}
                multiplier={Math.ceil(count / item!.recipe!.yield)}
                buyDirect={buyDirect}
                toggleBuy={toggleBuy}
                ancestors={new Set([...ancestors, reagent.id])}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
