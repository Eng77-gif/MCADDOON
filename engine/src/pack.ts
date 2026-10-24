// Dựng Data Pack từ các file CSV (sửa được bằng Excel/Google Sheets).
// Thuần TypeScript, không đọc file: dùng được cả trong tool Node lẫn trình duyệt (người chơi tự nhập CSV).
import { ROLES, type Champion, type League, type Player, type PlayerAttributes, type Role, type Team, type Tier } from "./types.ts";
import type { ChampionDb } from "./draft.ts";

export interface PackCsv {
  champions: string;
  matchups: string;
  synergies: string;
  leagues: string;
  teams: string;
  players: string;
}

export interface Pack {
  patch: string;
  champions: ChampionDb;
  leagues: League[];
  teams: Team[];
  warnings: string[];
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

/** Hash ổn định theo chuỗi => cùng tên tuyển thủ luôn ra cùng biến thiên chỉ số. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
const jitter = (key: string, amp: number) => Math.round((hash(key) * 2 - 1) * amp);
const clamp = (x: number) => Math.max(1, Math.min(99, x));
const num = (s: string | undefined, fallback: number) => (s ? Number(s) : fallback);

function buildChampions(csv: PackCsv, patch: string): ChampionDb {
  const db: ChampionDb = {};
  for (const r of parseCsv(csv.champions)) {
    const n = (k: string) => Number(r[k]);
    db[r.id] = {
      id: r.id,
      name: r.name,
      roles: r.roles.split(";") as Role[],
      damage_type: r.damage_type as Champion["damage_type"],
      profile: {
        early_power: n("early"), mid_power: n("mid"), late_power: n("late"), engage: n("engage"),
        disengage: n("disengage"), pick_potential: n("pick"), poke: n("poke"), teamfight: n("teamfight"),
        split_push: n("split"), waveclear: n("waveclear"), mobility: n("mobility"), objective_dps: n("objective_dps"),
      },
      patch_stats: { [patch]: { tier: r.tier as Tier } },
      matchups: {},
      synergies: {},
    };
  }
  for (const r of parseCsv(csv.matchups)) db[r.champion].matchups[r.opponent] = Number(r.score);
  for (const r of parseCsv(csv.synergies)) db[r.a].synergies[r.b] = Number(r.score);
  return db;
}

function buildAttributes(key: string, r: Record<string, string>): PlayerAttributes {
  const ovr = Number(r.ovr);
  const g = (col: string) => num(r[col], ovr);
  const v = (group: number, name: string) => clamp(group + jitter(`${key}:${name}`, 3));
  const laning = g("laning"), mech = g("mechanics"), macro = g("macro"), tf = g("teamfight"), mental = g("mental");
  return {
    mechanics: { laning: v(laning, "laning"), cs_efficiency: v(laning, "cs"), mechanical_outplay: v(mech, "outplay"), skillshot_accuracy: v(mech, "skillshot") },
    macro: { map_awareness: v(macro, "map"), vision_control: v(macro, "vision"), objective_control: v(macro, "obj"), rotation: v(macro, "rotation") },
    teamfight: { positioning: v(tf, "pos"), target_selection: v(tf, "target"), engage_timing: v(tf, "engage"), synergy_communication: v(tf, "comm") },
    mental: { composure: v(mental, "composure"), consistency: v(mental, "consistency"), big_match: v(mental, "big"), leadership: v(mental - 5, "lead"), tilt_resistance: v(mental, "tilt") },
  };
}

/** Bể tướng: mọi tướng chơi được ở vị trí đó, mastery theo trình độ ± biến thiên; tướng tủ trong CSV được đẩy lên cao. */
function buildPool(key: string, role: Role, ovr: number, signatures: string[], db: ChampionDb): Player["champion_pool"] {
  const pool = Object.values(db)
    .filter((c) => c.roles.includes(role))
    .map((c) => ({ champion_id: c.id, mastery: clamp(Math.round(52 + (ovr - 70) * 0.9 + jitter(`${key}:${c.id}`, 14))) }));
  for (const [i, id] of signatures.entries()) {
    const entry = pool.find((e) => e.champion_id === id);
    const mastery = clamp(Math.max(ovr + 4 - i, 88 - i * 2));
    if (entry) Object.assign(entry, { mastery, is_signature: true });
    else pool.push({ champion_id: id, mastery, is_signature: true } as Player["champion_pool"][number]);
  }
  return pool.sort((a, b) => b.mastery - a.mastery);
}

export function buildPack(csv: PackCsv, patch: string): Pack {
  const warnings: string[] = [];
  const champions = buildChampions(csv, patch);
  for (const c of Object.values(champions))
    for (const ref of [...Object.keys(c.matchups), ...Object.keys(c.synergies)])
      if (!champions[ref]) warnings.push(`Tướng ${c.id}: tham chiếu tướng không tồn tại ${ref}`);

  const leagues: League[] = parseCsv(csv.leagues).map((r) => ({
    id: r.id, name: r.name, region: r.region, tier: Number(r.tier), ...(r.feeds_into ? { feedsInto: r.feeds_into } : {}),
  }));

  const teams = new Map<string, Team>();
  for (const r of parseCsv(csv.teams)) {
    if (!leagues.some((l) => l.id === r.league)) warnings.push(`Đội ${r.id}: giải ${r.league} không tồn tại`);
    teams.set(r.id, {
      id: r.id, name: r.name, short: r.short, league: r.league, verified: r.verified === "Y",
      ...(r.worlds_seed ? { worldsSeed: r.worlds_seed } : {}),
      roster: {} as Team["roster"],
    });
  }

  for (const r of parseCsv(csv.players)) {
    const team = teams.get(r.team);
    const role = r.role as Role;
    if (!team) { warnings.push(`Tuyển thủ ${r.ign}: đội ${r.team} không tồn tại`); continue; }
    if (!ROLES.includes(role)) { warnings.push(`Tuyển thủ ${r.ign}: vị trí ${r.role} không hợp lệ`); continue; }
    if (team.roster[role]) warnings.push(`Đội ${team.id}: trùng vị trí ${role} (${team.roster[role].ign}, ${r.ign}) — giữ người đầu tiên`);
    const key = `${r.team}:${r.ign}`;
    const signatures = r.signature ? r.signature.split(";").filter(Boolean) : [];
    for (const s of signatures) if (!champions[s]) warnings.push(`Tuyển thủ ${r.ign}: tướng tủ ${s} không có trong champions.csv`);
    team.roster[role] ??= {
      id: `${r.team}_${role}`,
      ign: r.ign,
      role,
      ...(r.nationality ? { nationality: r.nationality } : {}),
      verified: r.verified === "Y",
      attributes: buildAttributes(key, r),
      dynamic_state: { form: 0, morale: 0, fatigue: 20 },
      champion_pool: buildPool(key, role, Number(r.ovr), signatures.filter((s) => champions[s]), champions),
    };
  }

  for (const t of teams.values())
    for (const role of ROLES) if (!t.roster[role]) warnings.push(`Đội ${t.id}: thiếu tuyển thủ vị trí ${role}`);

  return { patch, champions, leagues, teams: [...teams.values()], warnings };
}
