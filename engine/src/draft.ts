// Port TypeScript của prototype/draft_winrate.py. Công thức: docs/01 §2.
import { ROLES, type Champion, type Picks, type Tactic, type Team, type Tier } from "./types.ts";
import { masteryOf } from "./ratings.ts";

export const DRAFT = {
  tierPoints: { S: 3, A: 1.5, B: 0, C: -1.5, D: -3 } as Record<Tier, number>,
  wMastery: 1.5,
  masteryBaseline: 70,
  signatureBonus: 1,
  wLaneCounter: 1,
  wGlobalCounter: 0.25,
  wSynergy: 0.5,
  wTacticFit: 0.6,
  scale: 15,
  pMin: 0.2,
  pMax: 0.8,
};

export const TACTIC_KEYS: Record<Tactic, (keyof Champion["profile"])[]> = {
  TEAMFIGHT: ["teamfight", "engage"],
  SPLIT_1_4: ["split_push", "waveclear"],
  POKE: ["poke", "disengage"],
  PICK_OFF: ["pick_potential", "mobility"],
};

export type ChampionDb = Record<string, Champion>;

export function matchup(db: ChampionDb, a: string, b: string): number {
  const direct = db[a].matchups[b];
  if (direct !== undefined) return direct;
  return -(db[b].matchups[a] ?? 0);
}

export function synergy(db: ChampionDb, a: string, b: string): number {
  return Math.max(db[a].synergies[b] ?? 0, db[b].synergies[a] ?? 0);
}

export interface DraftBreakdown {
  total: number;
  meta: number;
  mastery: number;
  lane: number;
  global: number;
  synergy: number;
  tacticFit: number;
}

export function draftScore(
  db: ChampionDb, patch: string, team: Team, picks: Picks, enemy: Picks, tactic: Tactic,
): DraftBreakdown {
  const b: DraftBreakdown = { total: 0, meta: 0, mastery: 0, lane: 0, global: 0, synergy: 0, tacticFit: 0 };

  for (const role of ROLES) {
    const champ = picks[role];
    const player = team.roster[role];
    b.meta += DRAFT.tierPoints[db[champ].patch_stats[patch]?.tier ?? "B"];

    const entry = player.champion_pool.find((e) => e.champion_id === champ);
    b.mastery += ((masteryOf(player, champ) - DRAFT.masteryBaseline) / 10) * DRAFT.wMastery;
    if (entry?.is_signature) b.mastery += DRAFT.signatureBonus;

    b.lane += matchup(db, champ, enemy[role]) * DRAFT.wLaneCounter;
    for (const r of ROLES) if (r !== role) b.global += matchup(db, champ, enemy[r]) * DRAFT.wGlobalCounter;
  }

  const ids = ROLES.map((r) => picks[r]);
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) b.synergy += synergy(db, ids[i], ids[j]) * DRAFT.wSynergy;

  const keys = TACTIC_KEYS[tactic];
  const fit = ids.reduce((s, id) => s + keys.reduce((k, key) => k + db[id].profile[key], 0), 0) / (ids.length * keys.length);
  b.tacticFit = (fit - 5) * DRAFT.wTacticFit;

  b.total = b.meta + b.mastery + b.lane + b.global + b.synergy + b.tacticFit;
  return b;
}

export function draftWinProbability(scoreA: number, scoreB: number): number {
  const p = 1 / (1 + Math.exp(-(scoreA - scoreB) / DRAFT.scale));
  return Math.min(DRAFT.pMax, Math.max(DRAFT.pMin, p));
}
