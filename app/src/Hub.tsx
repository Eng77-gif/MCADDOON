import { useState } from "react";
import {
  STAGE_NAMES, advance, autoPlaySeries, isTransferWindow, leagueTable, nextUserFixture, recordSeries,
  seriesOptionsFor, seriesTeams, startNextSeason, swissRecord, teamWagesPerMonth, type Career, type Competition,
} from "../../engine/src/index.ts";
import { db } from "./data.ts";
import { Bar, Card, ConfirmButton, Stat, TeamTag, money, signed } from "./ui.tsx";
import { Squad } from "./Squad.tsx";
import { Market } from "./Market.tsx";

type Tab = "home" | "table" | "squad" | "market" | "stats";
const TABS: [Tab, string][] = [["home", "Tổng quan"], ["table", "Lịch&BXH"], ["squad", "Đội hình"], ["market", "Thị trường"], ["stats", "Thống kê"]];

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
        <TeamTag team={team} big />
        <div className="grow">
          <b>{team.name}</b>
          <small className="muted">
            {c.mode === "COACH" ? "HLV" : "Chủ CLB"} · {team.league} · Mùa {c.year} · {STAGE_NAMES[c.stage]}
          </small>
        </div>
      </header>
      {tab === "home" && <Home {...props} />}
      {tab === "table" && <Tables career={c} />}
      {tab === "squad" && <Squad career={c} onChange={props.onChange} />}
      {tab === "market" && <Market career={c} onChange={props.onChange} />}
      {tab === "stats" && <Stats career={c} />}
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

function Home({ career: c, onChange, onPlay, onQuit }: Props) {
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
        <ConfirmButton className="danger" label="Bắt đầu sự nghiệp mới" confirmLabel="Bấm lần nữa để xác nhận" onConfirm={onQuit} />
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
              <TeamTag team={c.teams[next.fixture.home]} big />
              <span className="big">VS</span>
              <TeamTag team={c.teams[next.fixture.away]} big />
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
            <p>Mùa {c.year} đã kết thúc. {isTransferWindow(c) && "Kỳ chuyển nhượng đang mở: gia hạn hợp đồng, mua bán ở tab Thị trường trước khi sang mùa."}</p>
            <button className="primary" onClick={() => run(() => startNextSeason(c, db))}>Sang mùa {c.year + 1}</button>
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

      <Card title="Tin tức">
        <ul className="news">
          {c.news.slice(0, 40).map((n, i) => <li key={i}>{n.text}</li>)}
        </ul>
      </Card>
      <ConfirmButton className="danger" label="Bắt đầu sự nghiệp mới" confirmLabel="Bấm lần nữa để xoá sự nghiệp hiện tại" onConfirm={onQuit} />
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

function Stats({ career: c }: { career: Career }) {
  const [league, setLeague] = useState(c.teams[c.teamId].league!);
  const [sort, setSort] = useState<"kda" | "dpm" | "csd">("kda");
  const rows = Object.entries(c.stats)
    .map(([id, s]) => {
      const team = c.teams[s.team];
      return {
        id, team, ign: s.ign, games: s.games,
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
