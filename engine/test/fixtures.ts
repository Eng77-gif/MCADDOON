import { readFileSync } from "node:fs";
import type { ChampionDb, Picks, Team, TeamSetup } from "../src/index.ts";

const pack = (f: string) => JSON.parse(readFileSync(new URL(`../../data/packs/demo/${f}`, import.meta.url), "utf8"));

export const db: ChampionDb = pack("champions.json");
export const teams: Team[] = pack("teams.json");
export const PATCH = "26.21";

export const BLUE_PICKS: Picks = { TOP: "KSANTE", JUNGLE: "WUKONG", MID: "AHRI", ADC: "KAISA", SUPPORT: "NAUTILUS" };
export const RED_PICKS: Picks = { TOP: "GNAR", JUNGLE: "LEESIN", MID: "AZIR", ADC: "VARUS", SUPPORT: "KARMA" };

export function setups(over: Partial<TeamSetup>[] = []): [TeamSetup, TeamSetup] {
  const base: [TeamSetup, TeamSetup] = [
    { team: teams[0], picks: BLUE_PICKS, tactic: "PICK_OFF", orders: { laneFocus: "MID", objective: "DRAGON", risk: "NORMAL" } },
    { team: teams[1], picks: RED_PICKS, tactic: "POKE", orders: { laneFocus: "BOT", objective: "HERALD_BARON", risk: "NORMAL" } },
  ];
  return [{ ...base[0], ...over[0] }, { ...base[1], ...over[1] }];
}

/** Bản sao của đội với mọi chỉ số cộng thêm `delta`. */
export function buffTeam(team: Team, delta: number): Team {
  const copy: Team = structuredClone(team);
  for (const p of Object.values(copy.roster))
    for (const group of Object.values(p.attributes) as Record<string, number>[])
      for (const k of Object.keys(group)) group[k] = Math.min(100, group[k] + delta);
  return copy;
}
