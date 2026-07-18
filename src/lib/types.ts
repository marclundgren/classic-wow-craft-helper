export type Reagent = { id: number; count: number };

export type Item = {
  id: number;
  name: string;
  quality: number; // WoW quality: 0 poor .. 5 legendary
  icon: string; // Wowhead icon slug, e.g. "inv_ingot_adamantite"
  recipe?: {
    yield: number; // how many the craft produces per cast
    reagents: Reagent[];
  };
};

export type ItemDb = Record<string, Item>;

export type SearchResult = {
  id: number;
  name: string;
  icon: string;
  quality: number;
  crafted: boolean;
};

/** An item the user wants to craft, with desired quantity. */
export type Order = { id: number; count: number };
