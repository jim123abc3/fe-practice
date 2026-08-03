export type Category = "card" | "watch";

export interface Item {
  id: string;
  name: string;
  player: string;
  year: number;
  setName: string;
  grade: number;
  priceCents: number;
  category: Category;
  imageUrl: string;
  updatedAt: string;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYERS = [
  "Derek Jeter",
  "Michael Jordan",
  "LeBron James",
  "Shohei Ohtani",
  "Tom Brady",
  "Kobe Bryant",
  "Wayne Gretzky",
  "Lionel Messi",
  "Victor Wembanyama",
  "Ronald Acuña Jr.",
  "Charizard",
  "Pikachu",
];
const SETS = [
  "Topps Chrome",
  "Panini Prizm",
  "Upper Deck",
  "Bowman Draft",
  "Donruss Optic",
  "Select",
  "Downtown",
  "Japanese Pokemon",
];

export const ALL_ITEMS: Item[] = (() => {
  const rnd = mulberry32(42);
  return Array.from({ length: 5000 }, (_, i) => {
    const player = PLAYERS[Math.floor(rnd() * PLAYERS.length)];
    const setName = SETS[Math.floor(rnd() * SETS.length)];
    const year = 1986 + Math.floor(rnd() * 39);
    const grade = Math.round((7 + rnd() * 3) * 2) / 2;
    return {
      id: `item_${String(i).padStart(5, "0")}`,
      name: `${year} ${setName} ${player} #${Math.floor(rnd() * 400)}`,
      player,
      year,
      setName,
      grade,
      priceCents: Math.floor(500 + rnd() * 800_000),
      category: rnd() > 0.85 ? "watch" : "card",
      imageUrl: `https://picsum.photos/seed/${i}/220/300`,
      updatedAt: new Date(Date.now() - Math.floor(rnd() * 9e8)).toISOString(),
    };
  });
})();
