import { useMemo, useState } from "react";
import { createCareer, teamStrength, type Career, type CareerMode } from "../../engine/src/index.ts";
import { pack } from "./data.ts";
import { Card } from "./ui.tsx";

export function NewCareer({ onStart }: { onStart: (c: Career) => void }) {
  const [mode, setMode] = useState<CareerMode>("COACH");
  const leagues = pack.leagues.filter((l) => l.tier > 0);
  const [league, setLeague] = useState("VCS");
  const teams = useMemo(
    () => pack.teams.filter((t) => t.league === league).sort((a, b) => teamStrength(b) - teamStrength(a)),
    [league],
  );

  return (
    <main className="screen">
      <header className="hero">
        <h1>MCADDOON</h1>
        <p>Giả lập quản lý đội tuyển LMHT</p>
      </header>

      <Card title="1. Chọn vai trò">
        <div className="seg">
          <button className={mode === "COACH" ? "on" : ""} onClick={() => setMode("COACH")}>
            <b>Huấn luyện viên</b>
            <small>Ban/Pick, chiến thuật, chỉ đạo trận. Ban lãnh đạo đặt mục tiêu và có thể sa thải bạn.</small>
          </button>
          <button className={mode === "OWNER" ? "on" : ""} onClick={() => setMode("OWNER")}>
            <b>Chủ CLB</b>
            <small>Toàn quyền và tự lo tài chính: lương, nhà tài trợ, tiền thưởng. Không bị sa thải, nhưng có thể phá sản.</small>
          </button>
        </div>
      </Card>

      <Card title="2. Chọn giải đấu">
        <div className="chips">
          {leagues.map((l) => (
            <button key={l.id} className={`chip ${league === l.id ? "on" : ""}`} onClick={() => setLeague(l.id)}>
              {l.id}
              {l.tier === 2 && <small> hạng 2</small>}
            </button>
          ))}
        </div>
        <p className="muted">{leagues.find((l) => l.id === league)?.name}</p>
      </Card>

      <Card title="3. Chọn đội">
        <ul className="list">
          {teams.map((t) => (
            <li key={t.id}>
              <button
                className="row-btn"
                onClick={() => onStart(createCareer(pack, mode, t.id, Math.floor(Math.random() * 1e9)))}
              >
                <span className="badge">{t.short}</span>
                <span className="grow">
                  {t.name}
                  {!t.verified && <small className="warn"> · roster chưa xác minh</small>}
                </span>
                <span className="muted">{teamStrength(t).toFixed(1)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <p className="muted small">Chỉ số tuyển thủ là ước lượng, có thể sửa trong data/packs/real-2026/csv.</p>
    </main>
  );
}
