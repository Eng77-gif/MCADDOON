// Chuyển sự kiện engine thành câu bình luận tiếng Việt. UI có thể thay bằng bộ dịch khác.
import type { MatchEvent, MatchResult, PhaseReport } from "./match.ts";

const AROUND: Record<string, string> = { BARON: "Baron", DRAGON: "Rồng", ELDER: "Rồng Ngàn Tuổi", SKIRMISH: "giữa bản đồ" };
const PHASE: Record<string, string> = { EARLY: "Đầu trận", MID: "Giữa trận", LATE: "Cuối trận" };

export function describeEvent(e: MatchEvent, names: [string, string]): string {
  const t = `[${String(Math.floor(e.minute)).padStart(2, "0")}']`;
  switch (e.type) {
    case "FIRST_BLOOD":
      return `${t} CHẾT ĐẦU TIÊN! ${e.killer} (${names[e.side]}) hạ ${e.victim} ở đường ${e.lane}.`;
    case "KILL":
      return `${t} ${e.killer} hạ gục ${e.victim}.`;
    case "LANE_REPORT":
      return `${t} Đường ${e.lane}: ${names[e.winner]} ${e.edge > 0.1 ? "áp đảo" : e.edge > 0.04 ? "nhỉnh hơn" : "cân bằng, hơi nhỉnh"}.`;
    case "DRAGON":
      return `${t} ${names[e.side]} hạ Rồng.`;
    case "SOUL":
      return `${t} ${names[e.side]} nhận Linh Hồn Rồng!`;
    case "HERALD":
      return `${t} ${names[e.side]} lấy Sứ Giả Khe Nứt.`;
    case "BARON":
      return `${t} ${names[e.side]} hạ BARON NASHOR!`;
    case "ELDER":
      return `${t} ${names[e.side]} giành RỒNG NGÀN TUỔI!`;
    case "TOWER": {
      const why = { LANE: "nhờ ưu thế đi đường", FIGHT: "sau giao tranh", SPLIT: "nhờ đẩy lẻ", HERALD: "bằng Sứ Giả" }[e.reason];
      return `${t} ${names[e.side]} phá ${e.count} công trình ${why}.`;
    }
    case "TEAMFIGHT":
      return `${t} Giao tranh quanh ${AROUND[e.around]}: ${names[e.winner]} thắng ${e.kills[e.winner]}-${e.kills[e.winner === 0 ? 1 : 0]} (khả năng thắng trước giao tranh ${(e.pWin * 100).toFixed(0)}%).`;
    case "NEXUS":
      return `${t} ${names[e.side]} PHÁ NHÀ CHÍNH! CHIẾN THẮNG!`;
  }
}

export function describePhase(r: PhaseReport, names: [string, string]): string {
  const lead = r.goldDiff >= 0 ? names[0] : names[1];
  return `== ${PHASE[r.phase]} (${r.fromMinute}'-${r.toMinute}') | Hạ gục ${r.kills[0]}-${r.kills[1]} | ${lead} dẫn ${Math.abs(Math.round(r.goldDiff)).toLocaleString("vi-VN")} vàng ==`;
}

export function boxScore(res: MatchResult): string {
  const rows: string[] = [];
  res.sides.forEach((side, i) => {
    const opp = res.sides[i === 0 ? 1 : 0];
    rows.push(`${side.name}${res.winner === i ? " (THẮNG)" : ""} — ${side.kills} hạ gục, ${side.towers} trụ, ${side.dragons} rồng, ${side.barons} baron`);
    rows.push("  Vị trí   Tuyển thủ    Tướng       K/D/A     KDA   CS   DPM  CSD@15 GD@15");
    side.lines.forEach((l, j) => {
      const o = opp.lines[j];
      const kda = ((l.kills + l.assists) / Math.max(1, l.deaths)).toFixed(1);
      const dpm = Math.round(l.damage / res.duration);
      rows.push(
        `  ${l.role.padEnd(8)} ${l.ign.padEnd(12)} ${l.champion.padEnd(10)} ${`${l.kills}/${l.deaths}/${l.assists}`.padEnd(9)} ${kda.padStart(4)} ${String(l.cs).padStart(4)} ${String(dpm).padStart(5)} ${String(l.csAt15 - o.csAt15).padStart(6)} ${String(l.goldAt15 - o.goldAt15).padStart(5)}`,
      );
    });
  });
  return rows.join("\n");
}
