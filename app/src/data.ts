import type { ChampionDb, League, Pack, Team } from "../../engine/src/index.ts";
import champions from "../../data/packs/real-2026/champions.json";
import leagues from "../../data/packs/real-2026/leagues.json";
import teams from "../../data/packs/real-2026/teams.json";

export const pack: Pack & { id: string } = {
  id: "real-2026",
  patch: "26.21",
  champions: champions as unknown as ChampionDb,
  leagues: leagues as League[],
  teams: teams as unknown as Team[],
  warnings: [],
};
export const db = pack.champions;
export const champName = (id: string) => db[id]?.name ?? id;
