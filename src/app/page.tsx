import items from "@/data/items.json";
import type { ItemDb } from "@/lib/types";
import Planner from "@/components/Planner";

export default function Home() {
  return (
    <div className="site">
      <header className="masthead">
        <h1>Artificer&apos;s Ledger</h1>
        <span className="tagline">
          Burning Crusade crafting planner — pick your crafts, get the full
          shopping list
        </span>
      </header>
      <Planner initialItems={items as ItemDb} />
      <footer className="footer-note">
        Item and recipe data from{" "}
        <a
          href="https://www.wowhead.com/tbc"
          target="_blank"
          rel="noreferrer noopener"
        >
          Wowhead&apos;s TBC database
        </a>
        . Any TBC item can be searched by name; new recipes are imported on
        demand. Your plan is saved in this browser.{" "}
        <a
          href="https://github.com/marclundgren/classic-wow-craft-helper"
          target="_blank"
          rel="noreferrer noopener"
        >
          Source on GitHub
        </a>
        .
      </footer>
    </div>
  );
}
