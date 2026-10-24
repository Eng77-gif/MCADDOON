import { useMemo, useState } from "react";
import {
  ROLES, SCOUT_REGIONS, ageOf, createRng, evaluateOffer, isTransferWindow, overallOf, playerValue,
  potentialRange, releaseFee, scoutProspect, scoutUpgradeCost, signPlayer, upgradeScouting, type Career, type Offer, type Player, type Role,
} from "../../engine/src/index.ts";
import { db } from "./data.ts";
import { Avatar } from "./avatar.tsx";
import { Card, ROLE_SHORT, TeamTag, money } from "./ui.tsx";

/** Form đề nghị hợp đồng: dùng cho mua, ký tự do, ký thần đồng và gia hạn. */
export function OfferForm({ career: c, player, onDone, label = "Gửi đề nghị" }: { career: Career; player: Player; onDone: () => void; label?: string }) {
  const [years, setYears] = useState<Offer["years"]>(2);
  const initial = useMemo(() => evaluateOffer(c, player.id, { salary: 0, years: 2 }).demand, [c, player.id]);
  const [salary, setSalary] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const ev = evaluateOffer(c, player.id, { salary, years });

  const submit = () => {
    try {
      signPlayer(c, db, player.id, { salary, years }, createRng(Date.now() % 1e9));
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="offer">
      <div className="grid2">
        <label className="stat">
          <span className="stat-label">Lương / tháng ($)</span>
          <input id={`salary-${player.id}`} type="number" min={0} step={100} value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
        </label>
        <div className="stat">
          <span className="stat-label">Thời hạn</span>
          <div className="chips">
            {([1, 2, 3] as const).map((y) => <button key={y} className={`chip ${years === y ? "on" : ""}`} onClick={() => setYears(y)}>{y} năm</button>)}
          </div>
        </div>
      </div>
      <p className="small muted">
        {ev.fee > 0 ? <>Phí chuyển nhượng: <b>{money(ev.fee)}</b> · </> : null}
        Tuyển thủ muốn tối thiểu {money(ev.demand)}/tháng
      </p>
      {ev.problems.length > 0 && <ul className="problems">{ev.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {error && <p className="bad">{error}</p>}
      <button className="primary" disabled={!ev.ok} onClick={submit}>{label}</button>
    </div>
  );
}

export function Market({ career: c, onChange }: { career: Career; onChange: () => void }) {
  const [view, setView] = useState<"transfer" | "scout">("transfer");
  return (
    <>
      <div className="chips">
        <button className={`chip ${view === "transfer" ? "on" : ""}`} onClick={() => setView("transfer")}>Chuyển nhượng</button>
        <button className={`chip ${view === "scout" ? "on" : ""}`} onClick={() => setView("scout")}>Tuyển trạch</button>
      </div>
      <Card title="Ngân sách">
        <div className="grid2">
          {c.mode === "COACH" ? (
            <>
              <StatLine label="Ngân sách chuyển nhượng" value={money(c.board.transferBudget)} />
              <StatLine label="Trần quỹ lương / tháng" value={money(c.board.wageBudget)} />
            </>
          ) : (
            <StatLine label="Số dư CLB" value={money(c.finance.balance)} />
          )}
          <StatLine label="Kỳ chuyển nhượng" value={isTransferWindow(c) ? "ĐANG MỞ" : "Đóng (chỉ ký tự do / thần đồng)"} />
        </div>
      </Card>
      {view === "transfer" ? <Transfers career={c} onChange={onChange} /> : <Scouting career={c} onChange={onChange} />}
    </>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function Transfers({ career: c, onChange }: { career: Career; onChange: () => void }) {
  const [role, setRole] = useState<Role | "ALL">("ALL");
  const [source, setSource] = useState<string>("FREE");
  const [open, setOpen] = useState<string | null>(null);
  const leagues = c.leagues.filter((l) => l.tier > 0).map((l) => l.id);

  const rows = useMemo(() => {
    const out: { player: Player; teamId?: string }[] = [];
    if (source === "FREE") for (const p of c.freeAgents) out.push({ player: p });
    else
      for (const t of Object.values(c.teams)) {
        if (t.id === c.teamId || t.league !== source) continue;
        for (const r of ROLES) out.push({ player: t.roster[r], teamId: t.id });
        for (const p of t.bench ?? []) out.push({ player: p, teamId: t.id });
      }
    return out.filter((x) => role === "ALL" || x.player.role === role).sort((a, b) => overallOf(b.player) - overallOf(a.player)).slice(0, 40);
  }, [c, role, source, c.news.length]);

  return (
    <Card title="Thị trường">
      <div className="chips scroll">
        <button className={`chip ${source === "FREE" ? "on" : ""}`} onClick={() => setSource("FREE")}>Tự do</button>
        {leagues.map((l) => <button key={l} className={`chip ${source === l ? "on" : ""}`} onClick={() => setSource(l)}>{l}</button>)}
      </div>
      <div className="chips scroll">
        {(["ALL", ...ROLES] as const).map((r) => <button key={r} className={`chip ${role === r ? "on" : ""}`} onClick={() => setRole(r)}>{r === "ALL" ? "Mọi vị trí" : ROLE_SHORT[r]}</button>)}
      </div>
      <div className="rows">
        {rows.map(({ player: p, teamId }) => {
          const team = teamId ? c.teams[teamId] : undefined;
          return (
            <div key={p.id} className="row-card">
              <div className="line">
                <div className="player-head grow">
                  <Avatar player={p} team={team} size={40} />
                  <div className="grow">
                    {p.ign} <span className="ovr">{Math.round(overallOf(p))}</span>
                    <small className="muted">{ROLE_SHORT[p.role]} · {ageOf(p, c.year)} tuổi{p.nationality ? ` · ${p.nationality}` : ""}{p.contract ? ` · HĐ tới ${p.contract.until}` : ""}</small>
                  </div>
                </div>
                {team ? <TeamTag team={team} /> : <span className="pill">Tự do</span>}
              </div>
              <div className="line small">
                <span className="muted">Giá trị {money(playerValue(p, c.year))}{team ? ` · Phí giải phóng ${money(releaseFee(p, c.year))}` : ""}</span>
                <button className="link" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Đóng" : "Đàm phán"}</button>
              </div>
              {open === p.id && <OfferForm career={c} player={p} onDone={() => { setOpen(null); onChange(); }} />}
            </div>
          );
        })}
        {!rows.length && <p className="muted">Không có tuyển thủ phù hợp.</p>}
      </div>
    </Card>
  );
}

function Scouting({ career: c, onChange }: { career: Career; onChange: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const act = (fn: () => void) => {
    try {
      fn();
      setMsg(null);
      onChange();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const list = [...c.prospects].sort((a, b) => b.knowledge - a.knowledge || b.soloLp - a.soloLp);
  return (
    <Card
      title="Thần đồng Thách Đấu"
      right={<span className="small">Lượt: <b>{c.scouting.points}</b> · Cấp {c.scouting.level}/5</span>}
    >
      <p className="small muted">Mỗi lần theo dõi giúp ước lượng tiềm năng chính xác hơn. Mỗi tuần thi đấu bạn có thêm 1 lượt.</p>
      {c.mode === "OWNER" && c.scouting.level < 5 && (
        <button onClick={() => act(() => upgradeScouting(c))}>Nâng cấp tuyển trạch ({money(scoutUpgradeCost(c.scouting.level))})</button>
      )}
      {msg && <p className="bad">{msg}</p>}
      <div className="rows" style={{ marginTop: 10 }}>
        {list.map((pr) => {
          const p = pr.player;
          const [lo, hi] = potentialRange(p, pr.knowledge);
          return (
            <div key={p.id} className="row-card">
              <div className="line">
                <div className="player-head grow">
                  <Avatar player={p} size={40} />
                  <div className="grow">
                    {p.ign} <span className="ovr">{Math.round(overallOf(p))}</span>
                    <small className="muted">{ROLE_SHORT[p.role]} · {ageOf(p, c.year)} tuổi · {SCOUT_REGIONS[pr.region]} · {pr.soloLp.toLocaleString("en-US")} LP</small>
                  </div>
                </div>
                <span className="pill">{pr.knowledge}% thông tin</span>
              </div>
              <div className="stat">
                <span className="stat-label">Tiềm năng ước lượng: {lo === hi ? lo : `${lo}–${hi}`}</span>
                <span className="range"><i style={{ left: `${((lo - 40) / 60) * 100}%`, width: `${Math.max(2, ((hi - lo) / 60) * 100)}%` }} /></span>
              </div>
              <div className="line">
                <button disabled={c.scouting.points <= 0 || pr.knowledge >= 100} onClick={() => act(() => scoutProspect(c, p.id))}>Theo dõi (−1 lượt)</button>
                <button className="link" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Đóng" : "Ký học viện"}</button>
              </div>
              {open === p.id && <OfferForm career={c} player={p} label="Ký hợp đồng học viện" onDone={() => { setOpen(null); onChange(); }} />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
