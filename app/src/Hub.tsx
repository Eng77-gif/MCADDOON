import { useState } from "react";
import {
  STAGE_NAMES, advance, autoPlaySeries, leagueTable, monthlySalary, nextUserFixture, playerOverall, recordSeries,
  seriesOptionsFor, seriesTeams, startNextSeason, swissRecord, teamWagesPerMonth, type Career, type Competition,
} from "../../engine/src/index.ts";
import { champName, db } from "./data.ts";
import { Bar, Card, ConfirmButton, ROLES, ROLE_VI, Stat, money, signed } from "./ui.tsx";

type Tab = "home" | "table" | "squad" | "stats" | "news";
const TABS: [Tab, string][] = [["home", "Tổng quan"], ["table", "Lịch & BXH"], ["squad", "Đội hình"], ["stats", "Thống kê"], ["news", "Tin tức"]];

interface Props {
  career: Career;
  onChange: () => void;
  onPlay: (fixtureId: string) => void;
  onQuit: () => void;
}

export function Hub(props: Props) {
  const [tab, setTab] = useState<Tab>("home");
  const { career: c } = props;
  const team = c.teams[c.teamId];
  return (
    <main className="screen with-tabs">
      <header className="topbar">
        <span className="badge big">{team.short}</span>
        <div className="grow">
          <b>{team.name}</b>
          <small className="muted">
            {c.mode === "COACH" ? "HLV" : "Chủ CLB"} · {team.league} · Mùa {c.year} · {STAGE_NAMES[c.stage]}
          </small>
        </div>
      </header>
      {tab === "home" && <Home {...props} />}
      {tab === "table" && <Tables career={c} />}
      {tab === "squad" && <Squad career={c} />}
      {tab === "stats" && <Stats career={c} />}
      {tab === "news" && <News career={c} onQuit={props.onQuit} />}
      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}

function Home({ career: c, onChange, onPlay }: Props) {
  const [busy, setBusy] = useState(false);
  const next = nextUserFixture(c);
  const team = c.teams[c.teamId];

  const run = (fn: () => void, after?: () => void) => {
    setBusy(true);
    // nhường một khung hình để hiện "Đang mô phỏng..." trước khi chạy engine
    setTimeout(() => {
      fn();
      setBusy(false);
      onChange();
      after?.();
    }, 30);
  };

  // Trước trận của người chơi: đấu xong các trận AI cùng vòng để bảng xếp hạng luôn khớp
  const enter = () => run(() => advance(c, db), () => onPlay(nextUserFixture(c)!.fixture.id));
  const quickSim = () =>
    run(() => {
      advance(c, db);
      const u = nextUserFixture(c)!;
      recordSeries(c, u.fixture.id, autoPlaySeries(db, seriesTeams(c, u.fixture), seriesOptionsFor(c, u.comp, u.fixture)));
    });

  if (c.gameOver)
    return (
      <Card title="Sự nghiệp kết thúc">
        <p>{c.gameOver === "FIRED" ? "Ban lãnh đạo đã sa thải bạn." : "CLB phá sản."}</p>
        <p className="muted">Vào tab Tin tức để bắt đầu sự nghiệp mới.</p>
      </Card>
    );

  return (
    <>
      <Card title="Trận tiếp theo">
        {busy ? (
          <p className="pulse">Đang mô phỏng các trận khác…</p>
        ) : next ? (
          <>
            <div className="versus">
              <span className="badge big">{c.teams[next.fixture.home].short}</span>
              <span className="muted">vs</span>
              <span className="badge big">{c.teams[next.fixture.away].short}</span>
            </div>
            <p className="center muted">
              {next.comp.name} · {next.fixture.label} · Bo{next.fixture.bestOf}
            </p>
            <div className="actions">
              <button className="primary" onClick={enter}>Vào trận</button>
              <button onClick={quickSim}>Mô phỏng nhanh</button>
            </div>
          </>
        ) : c.stage === "OFFSEASON" ? (
          <>
            <p>Mùa {c.year} đã kết thúc.</p>
            <button className="primary" onClick={() => run(() => startNextSeason(c))}>Sang mùa {c.year + 1}</button>
          </>
        ) : (
          <>
            <p className="muted">Chưa có trận nào của đội bạn ở thời điểm này.</p>
            <button className="primary" onClick={() => run(() => advance(c, db))}>Tiếp tục</button>
          </>
        )}
      </Card>

      <Card title={c.mode === "COACH" ? "Ban lãnh đạo" : "Tài chính CLB"}>
        {c.mode === "COACH" ? (
          <>
            <p>{c.board.text}</p>
            <Stat label="Độ tín nhiệm" value={<Bar value={c.board.confidence} />} />
          </>
        ) : (
          <div className="grid2">
            <Stat label="Số dư" value={money(c.finance.balance)} tone={c.finance.balance < 0 ? "bad" : "good"} />
            <Stat label="Quỹ lương / tháng" value={money(teamWagesPerMonth(team))} />
            <Stat label="Thu tuần trước" value={money(c.finance.lastWeek.income)} />
            <Stat label="Chi lương tuần trước" value={money(c.finance.lastWeek.wages)} />
          </div>
        )}
      </Card>

      <Card title="Tin mới">
        <ul className="news">
          {c.news.slice(0, 5).map((n, i) => <li key={i}>{n.text}</li>)}
        </ul>
      </Card>
    </>
  );
}

function Tables({ career: c }: { career: Career }) {
  const ids = c.competitions.map((x) => x.id);
  const mine = c.competitions.find((x) => x.teams.includes(c.teamId) && !x.ranking) ?? c.competitions.find((x) => x.leagueId === c.teams[c.teamId].league);
  const [sel, setSel] = useState(mine?.id ?? ids[0]);
  const comp = c.competitions.find((x) => x.id === sel) ?? c.competitions[0];
  if (!comp) return <Card>Chưa có giải đấu.</Card>;
  return (
    <>
      <div className="chips scroll">
        {c.competitions.filter((x) => x.fixtures.length).map((x) => (
          <button key={x.id} className={`chip ${x.id === comp.id ? "on" : ""}`} onClick={() => setSel(x.id)}>{x.name}</button>
        ))}
      </div>
      {comp.kind === "LEAGUE" && <LeagueTable career={c} comp={comp} />}
      {comp.kind === "SWISS" && <SwissTable career={c} comp={comp} />}
      <Fixtures career={c} comp={comp} />
    </>
  );
}

function LeagueTable({ career: c, comp }: { career: Career; comp: Competition }) {
  const rows = leagueTable(c, comp.leagueId!);
  return (
    <Card title="Bảng xếp hạng">
      <table className="table">
        <thead><tr><th>#</th><th>Đội</th><th>T-B</th><th>Ván</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.team} className={r.team === c.teamId ? "me" : ""}>
              <td>{i + 1}</td>
              <td>{c.teams[r.team].name}</td>
              <td>{r.wins}-{r.losses}</td>
              <td>{signed(r.gameWins - r.gameLosses)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function SwissTable({ career: c, comp }: { career: Career; comp: Competition }) {
  const rec = [...swissRecord(comp)].sort(([, a], [, b]) => b.w - a.w || a.l - b.l);
  return (
    <Card title="Thành tích Swiss">
      <table className="table">
        <tbody>
          {rec.map(([t, r]) => (
            <tr key={t} className={t === c.teamId ? "me" : ""}>
              <td>{c.teams[t].name}</td>
              <td>{r.w}-{r.l}</td>
              <td className="muted">{r.w === 3 ? "Đi tiếp" : r.l === 3 ? "Bị loại" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Fixtures({ career: c, comp }: { career: Career; comp: Competition }) {
  const rounds = [...new Set(comp.fixtures.map((f) => f.round))].sort((a, b) => b - a);
  return (
    <Card title="Lịch thi đấu">
      {rounds.map((r) => (
        <div key={r} className="round">
          <h3>{comp.fixtures.find((f) => f.round === r)!.label}</h3>
          {comp.fixtures.filter((f) => f.round === r).map((f) => (
            <div key={f.id} className={`fixture ${f.home === c.teamId || f.away === c.teamId ? "me" : ""}`}>
              <span className={f.result?.winner === f.home ? "win" : ""}>{c.teams[f.home].short}</span>
              <b>{f.result ? `${f.result.wins[0]} - ${f.result.wins[1]}` : `Bo${f.bestOf}`}</b>
              <span className={f.result?.winner === f.away ? "win" : ""}>{c.teams[f.away].short}</span>
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
}

function Squad({ career: c }: { career: Career }) {
  const team = c.teams[c.teamId];
  return (
    <>
      {ROLES.map((role) => {
        const p = team.roster[role];
        const a = p.attributes;
        const avg = (o: Record<string, number>) => Math.round(Object.values(o).reduce((x, y) => x + y, 0) / Object.values(o).length);
        return (
          <Card
            key={role}
            title={<>{p.ign} <small className="muted">{ROLE_VI[role]}{p.nationality ? ` · ${p.nationality}` : ""}</small></>}
            right={<span className="ovr">{playerOverall(team, role)}</span>}
          >
            <div className="grid2">
              <Stat label="Kỹ năng" value={<><Bar value={avg(a.mechanics)} /> {avg(a.mechanics)}</>} />
              <Stat label="Tư duy" value={<><Bar value={avg(a.macro)} /> {avg(a.macro)}</>} />
              <Stat label="Giao tranh" value={<><Bar value={avg(a.teamfight)} /> {avg(a.teamfight)}</>} />
              <Stat label="Tâm lý" value={<><Bar value={avg(a.mental)} /> {avg(a.mental)}</>} />
              <Stat label="Phong độ" value={signed(p.dynamic_state.form)} tone={p.dynamic_state.form >= 0 ? "good" : "bad"} />
              <Stat label="Tinh thần" value={signed(p.dynamic_state.morale)} tone={p.dynamic_state.morale >= 0 ? "good" : "bad"} />
            </div>
            <p className="pool">
              {p.champion_pool.slice(0, 5).map((e) => (
                <span key={e.champion_id} className={`pill ${e.is_signature ? "sig" : ""}`}>{champName(e.champion_id)} {e.mastery}</span>
              ))}
            </p>
            {c.mode === "OWNER" && <p className="muted small">Lương: {money(monthlySalary(playerOverall(team, role)))}/tháng</p>}
          </Card>
        );
      })}
    </>
  );
}

function Stats({ career: c }: { career: Career }) {
  const [league, setLeague] = useState(c.teams[c.teamId].league!);
  const [sort, setSort] = useState<"kda" | "dpm" | "csd">("kda");
  const rows = Object.entries(c.stats)
    .map(([id, s]) => {
      const [teamId, role] = [id.slice(0, id.lastIndexOf("_")), id.slice(id.lastIndexOf("_") + 1)];
      const team = c.teams[teamId];
      return {
        id, team, role, ign: team?.roster[role as keyof typeof team.roster]?.ign ?? id, games: s.games,
        kda: (s.kills + s.assists) / Math.max(1, s.deaths),
        dpm: s.damage / Math.max(1, s.minutes),
        csd: s.csd15 / Math.max(1, s.games),
        kdaText: `${(s.kills / s.games).toFixed(1)}/${(s.deaths / s.games).toFixed(1)}/${(s.assists / s.games).toFixed(1)}`,
      };
    })
    .filter((r) => r.team && (league === "ALL" || r.team.league === league) && r.games >= 2)
    .sort((a, b) => b[sort] - a[sort])
    .slice(0, 30);
  const leagues = ["ALL", ...c.leagues.filter((l) => l.tier > 0).map((l) => l.id)];
  return (
    <Card title="Thống kê tuyển thủ (mùa này)">
      <div className="chips scroll">
        {leagues.map((l) => <button key={l} className={`chip ${l === league ? "on" : ""}`} onClick={() => setLeague(l)}>{l === "ALL" ? "Tất cả" : l}</button>)}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Tuyển thủ</th>
            <th>K/D/A</th>
            <th className="sortable" onClick={() => setSort("kda")}>KDA{sort === "kda" ? " ▼" : ""}</th>
            <th className="sortable" onClick={() => setSort("dpm")}>DPM{sort === "dpm" ? " ▼" : ""}</th>
            <th className="sortable" onClick={() => setSort("csd")}>CSD@15{sort === "csd" ? " ▼" : ""}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.team.id === c.teamId ? "me" : ""}>
              <td>{r.ign} <small className="muted">{r.team.short}</small></td>
              <td className="small">{r.kdaText}</td>
              <td>{r.kda.toFixed(1)}</td>
              <td>{Math.round(r.dpm)}</td>
              <td>{signed(Math.round(r.csd))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="muted">Chưa có dữ liệu.</p>}
    </Card>
  );
}

function News({ career: c, onQuit }: { career: Career; onQuit: () => void }) {
  return (
    <>
      <Card title="Tin tức">
        <ul className="news">
          {c.news.slice(0, 80).map((n, i) => <li key={i}><small className="muted">{n.year}</small> {n.text}</li>)}
        </ul>
      </Card>
      <ConfirmButton className="danger" label="Bắt đầu sự nghiệp mới" confirmLabel="Bấm lần nữa để xoá sự nghiệp hiện tại" onConfirm={onQuit} />
    </>
  );
}
