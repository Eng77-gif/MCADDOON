import { useState } from "react";
import {
  STAGE_NAMES, advance, autoPlaySeries, isTransferWindow, leagueTable, nextUserFixture, recordSeries,
  seriesOptionsFor, seriesTeams, startNextSeason, swissRecord, teamWagesPerMonth, type Career, type Competition, type Fixture,
} from "../../engine/src/index.ts";
import { db } from "./data.ts";
import { Bar, Card, ConfirmButton, Stat, money, signed } from "./ui.tsx";
import { Squad } from "./Squad.tsx";
import { Market } from "./Market.tsx";
import { teamCrest } from "./art/sprites.ts";
import { Avatar } from "./avatar.tsx";
import { ItemsPage } from "./items.tsx";

type Page = "news" | "roster" | "schedule" | "rankings" | "transfer" | "scout" | "stats" | "items" | "club";
const NAV: [Page, string, string][] = [
  ["news", "Tin tức", "◆"],
  ["roster", "Đội hình & Tập luyện", "♟"],
  ["schedule", "Lịch thi đấu", "▦"],
  ["rankings", "Xếp hạng", "▲"],
  ["transfer", "Chuyển nhượng", "⇄"],
  ["scout", "Tuyển trạch", "◎"],
  ["stats", "Thống kê", "≡"],
  ["items", "Kho trang bị", "⚔"],
  ["club", "Ban lãnh đạo / Tài chính", "$"],
];

interface Props {
  career: Career;
  onChange: () => void;
  onPlay: (fixtureId: string) => void;
  onQuit: () => void;
}

export function Crest({ career: c, id, size = 22 }: { career: Career; id: string; size?: number }) {
  const t = c.teams[id];
  return <img className="crest" src={teamCrest(t.short, t.colors)} alt="" width={size} height={size} />;
}

export function Hub(props: Props) {
  const { career: c, onChange, onPlay } = props;
  const [page, setPage] = useState<Page>("news");
  const [busy, setBusy] = useState(false);
  const team = c.teams[c.teamId];
  const next = nextUserFixture(c);

  const run = (fn: () => void, after?: () => void) => {
    setBusy(true);
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
  const proceed = () => {
    if (c.gameOver) return;
    if (next) return enter();
    if (c.stage === "OFFSEASON") return run(() => startNextSeason(c, db));
    run(() => advance(c, db));
  };
  const proceedLabel = c.gameOver ? "Đã kết thúc" : next ? "Vào trận" : c.stage === "OFFSEASON" ? `Sang mùa ${c.year + 1}` : "Tiến hành";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-team">
          <Crest career={c} id={c.teamId} size={36} />
          <div className="grow">
            <b>{team.name}</b>
            <small className="muted">{c.mode === "COACH" ? "Huấn luyện viên" : "Chủ CLB"} · {team.league}</small>
          </div>
        </div>
        <nav>
          {NAV.map(([id, label, icon]) => (
            <button key={id} className={page === id ? "on" : ""} onClick={() => setPage(id)}>
              <span className="nav-ico">{icon}</span>
              <span className="nav-label">{label}</span>
              {id === "news" && c.news.length > 0 && <span className="badge-num">{Math.min(9, c.news.filter((n) => n.year === c.year).length)}</span>}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        {page === "news" && <NewsPage {...props} next={next} busy={busy} onEnter={enter} onQuick={quickSim} />}
        {page === "roster" && <Squad career={c} onChange={onChange} />}
        {page === "schedule" && <SchedulePage career={c} />}
        {page === "rankings" && <RankingsPage career={c} />}
        {page === "transfer" && <Market career={c} onChange={onChange} view="transfer" />}
        {page === "scout" && <Market career={c} onChange={onChange} view="scout" />}
        {page === "stats" && <StatsPage career={c} />}
        {page === "items" && <ItemsPage />}
        {page === "club" && <ClubPage career={c} onQuit={props.onQuit} />}
      </main>

      <footer className="footer-bar">
        <span className="date-chip">Mùa {c.year} · {STAGE_NAMES[c.stage]}</span>
        {next && !busy && <button onClick={quickSim}>Mô phỏng nhanh</button>}
        <button className="proceed" disabled={busy || !!c.gameOver} onClick={proceed}>
          {busy ? "Đang mô phỏng…" : `${proceedLabel} ▶`}
        </button>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ Tin tức
function NewsPage({ career: c, next, busy, onEnter, onQuick, onQuit }: Props & {
  next: ReturnType<typeof nextUserFixture>; busy: boolean; onEnter: () => void; onQuick: () => void;
}) {
  if (c.gameOver)
    return (
      <Card title="Sự nghiệp kết thúc">
        <p>{c.gameOver === "FIRED" ? "Ban lãnh đạo đã sa thải bạn." : "CLB phá sản."}</p>
        <ConfirmButton className="danger" label="Bắt đầu sự nghiệp mới" confirmLabel="Bấm lần nữa để xác nhận" onConfirm={onQuit} />
      </Card>
    );
  return (
    <div className="page-grid">
      <Card title="Trận tiếp theo">
        {busy ? (
          <p className="pulse">Đang mô phỏng các trận khác…</p>
        ) : next ? (
          <>
            <div className="versus">
              <div className="vs-team"><Crest career={c} id={next.fixture.home} size={56} /><b>{c.teams[next.fixture.home].name}</b></div>
              <span className="vs-word">VS</span>
              <div className="vs-team"><Crest career={c} id={next.fixture.away} size={56} /><b>{c.teams[next.fixture.away].name}</b></div>
            </div>
            <p className="center muted">{next.comp.name} · {next.fixture.label} · Bo{next.fixture.bestOf}</p>
            <div className="actions">
              <button className="primary" onClick={onEnter}>Vào trận</button>
              <button onClick={onQuick}>Mô phỏng nhanh</button>
            </div>
          </>
        ) : c.stage === "OFFSEASON" ? (
          <p>Mùa {c.year} đã kết thúc. {isTransferWindow(c) && "Kỳ chuyển nhượng đang mở: gia hạn hợp đồng, mua bán trước khi sang mùa."}</p>
        ) : (
          <p className="muted">Chưa có trận nào của đội bạn. Bấm "Tiến hành" để mô phỏng tiếp.</p>
        )}
      </Card>
      <Card title="Hộp thư">
        <ul className="news">
          {c.news.slice(0, 40).map((n, i) => <li key={i}><small className="muted">{n.year}</small> {n.text}</li>)}
        </ul>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Ban lãnh đạo / Tài chính
function ClubPage({ career: c, onQuit }: { career: Career; onQuit: () => void }) {
  const team = c.teams[c.teamId];
  return (
    <>
      <Card title={c.mode === "COACH" ? "Ban lãnh đạo" : "Tài chính CLB"}>
        {c.mode === "COACH" && (
          <>
            <p>{c.board.text}</p>
            <Stat label="Độ tín nhiệm" value={<Bar value={c.board.confidence} />} />
          </>
        )}
        <div className="grid2" style={{ marginTop: 10 }}>
          <Stat label="Số dư" value={money(c.finance.balance)} tone={c.finance.balance < 0 ? "bad" : "good"} />
          <Stat label="Quỹ lương / tháng" value={money(teamWagesPerMonth(team))} />
          <Stat label="Thu tuần trước" value={money(c.finance.lastWeek.income)} />
          <Stat label="Chi lương tuần trước" value={money(c.finance.lastWeek.wages)} />
          {c.mode === "COACH" && <Stat label="Ngân sách chuyển nhượng" value={money(c.board.transferBudget)} />}
          {c.mode === "COACH" && <Stat label="Trần quỹ lương" value={money(c.board.wageBudget)} />}
        </div>
      </Card>
      <ConfirmButton className="danger" label="Bắt đầu sự nghiệp mới" confirmLabel="Bấm lần nữa để xoá sự nghiệp hiện tại" onConfirm={onQuit} />
    </>
  );
}

// ------------------------------------------------------------------ Lịch thi đấu
function SchedulePage({ career: c }: { career: Career }) {
  const mine = c.competitions.find((x) => x.teams.includes(c.teamId) && !x.ranking) ?? c.competitions.find((x) => x.leagueId === c.teams[c.teamId].league);
  const [sel, setSel] = useState(mine?.id);
  const comp = c.competitions.find((x) => x.id === sel) ?? c.competitions[0];
  if (!comp) return <Card>Chưa có giải đấu.</Card>;
  const rounds = [...new Set(comp.fixtures.map((f) => f.round))].sort((a, b) => a - b);
  return (
    <>
      <RegionTabs items={c.competitions.filter((x) => x.fixtures.length).map((x) => [x.id, x.name])} value={comp.id} onChange={setSel} />
      <Card title={comp.name}>
        <div className="schedule">
          {rounds.map((r) => (
            <div key={r} className="round">
              <h3>{comp.fixtures.find((f) => f.round === r)!.label}</h3>
              {comp.fixtures.filter((f) => f.round === r).map((f) => <MatchCard key={f.id} career={c} f={f} />)}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function MatchCard({ career: c, f, tbd }: { career: Career; f?: Fixture; tbd?: boolean }) {
  if (!f || tbd)
    return (
      <div className="match-card tbd">
        <div className="mc-row"><span className="grow muted">Chưa xác định</span></div>
        <div className="mc-row"><span className="grow muted">Chưa xác định</span></div>
      </div>
    );
  const row = (id: string, score: number | undefined) => (
    <div className={`mc-row ${f.result?.winner === id ? "win" : f.result ? "lose" : ""} ${id === c.teamId ? "me" : ""}`}>
      <Crest career={c} id={id} size={20} />
      <span className="grow">{c.teams[id].name}</span>
      <b>{score ?? "-"}</b>
    </div>
  );
  return (
    <div className="match-card">
      {row(f.home, f.result?.wins[0])}
      {row(f.away, f.result?.wins[1])}
    </div>
  );
}

// ------------------------------------------------------------------ Xếp hạng
function RegionTabs({ items, value, onChange }: { items: [string, string][]; value?: string; onChange: (id: string) => void }) {
  return (
    <div className="region-tabs">
      {items.map(([id, label]) => <button key={id} className={value === id ? "on" : ""} onClick={() => onChange(id)}>{label}</button>)}
    </div>
  );
}

function RankingsPage({ career: c }: { career: Career }) {
  const regions: [string, string][] = [...c.leagues.filter((l) => l.tier > 0).map((l) => [l.id, l.id] as [string, string]), ["WORLDS", "CKTG"]];
  const [region, setRegion] = useState(c.teams[c.teamId].league!);
  const [view, setView] = useState<"table" | "bracket">("table");
  const worlds = c.competitions.filter((x) => x.kind === "PLAYIN" || x.kind === "SWISS" || x.kind === "KNOCKOUT").filter((x) => x.fixtures.length);
  const league = c.competitions.find((x) => x.kind === "LEAGUE" && x.leagueId === region);
  const playoffs = c.competitions.find((x) => x.kind === "PLAYOFFS" && x.leagueId === region);

  return (
    <>
      <RegionTabs items={regions} value={region} onChange={(r) => { setRegion(r); setView("table"); }} />
      {region === "WORLDS" ? (
        worlds.length ? worlds.map((w) => (
          <Card key={w.id} title={w.name}>
            {w.kind === "SWISS" ? <SwissGrid career={c} comp={w} /> : <Bracket career={c} comp={w} />}
          </Card>
        )) : <Card>CKTG chưa bắt đầu. Các đội giành vé sau Playoffs của từng khu vực.</Card>
      ) : (
        <>
          {playoffs && (
            <div className="chips">
              <button className={`chip ${view === "table" ? "on" : ""}`} onClick={() => setView("table")}>Vòng bảng</button>
              <button className={`chip ${view === "bracket" ? "on" : ""}`} onClick={() => setView("bracket")}>Playoffs</button>
            </div>
          )}
          {view === "bracket" && playoffs ? (
            <Card title={playoffs.name}><Bracket career={c} comp={playoffs} /></Card>
          ) : league ? (
            <LeagueTable career={c} comp={league} playoffs={playoffs} />
          ) : (
            <Card>Giải chưa có lịch.</Card>
          )}
        </>
      )}
    </>
  );
}

function teamKda(c: Career, teamId: string) {
  let k = 0, d = 0, a = 0;
  for (const s of Object.values(c.stats)) if (s.team === teamId) (k += s.kills), (d += s.deaths), (a += s.assists);
  return [k, d, a];
}

function LeagueTable({ career: c, comp, playoffs }: { career: Career; comp: Competition; playoffs?: Competition }) {
  const rows = leagueTable(c, comp.leagueId!);
  const note = (team: string, i: number) => {
    if (playoffs?.ranking) {
      const p = playoffs.ranking.indexOf(team);
      return p === 0 ? "Vô địch" : p === 1 ? "Á quân" : p >= 2 && p < playoffs.teams.length ? "Bán kết" : "Bị loại";
    }
    if (comp.ranking) return i < 4 ? "Vào Playoffs" : "Bị loại";
    return "";
  };
  return (
    <Card title={`${comp.name} — Vòng bảng`}>
      <div className="table-wrap">
        <table className="table rank-table">
          <thead>
            <tr><th>#</th><th>Đội</th><th>Trận</th><th>T</th><th>B</th><th>HS ván</th><th>Hạ gục</th><th>Chết</th><th>Hỗ trợ</th><th>Ghi chú</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const [k, d, a] = teamKda(c, r.team);
              const n = note(r.team, i);
              return (
                <tr key={r.team} className={r.team === c.teamId ? "me" : ""}>
                  <td>{i + 1}</td>
                  <td><span className="team-cell"><Crest career={c} id={r.team} /> {c.teams[r.team].name}</span></td>
                  <td>{r.wins + r.losses}</td>
                  <td>{r.wins}</td>
                  <td>{r.losses}</td>
                  <td>{signed(r.gameWins - r.gameLosses)}</td>
                  <td>{k}</td>
                  <td>{d}</td>
                  <td>{a}</td>
                  <td className={n === "Bị loại" ? "muted" : "note-good"}>{n}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Sơ đồ nhánh: mỗi vòng một cột, các vòng chưa diễn ra hiện ô "Chưa xác định". */
function Bracket({ career: c, comp }: { career: Career; comp: Competition }) {
  const totalRounds = Math.max(1, Math.ceil(Math.log2(comp.teams.length)));
  const labels = (r: number) => {
    const left = comp.teams.length / 2 ** (r - 1);
    return left <= 2 ? "Chung kết" : left <= 4 ? "Bán kết" : left <= 8 ? "Tứ kết" : `Vòng ${r}`;
  };
  return (
    <div className="bracket">
      {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => {
        const games = comp.fixtures.filter((f) => f.round === r);
        const expected = Math.max(1, Math.floor(comp.teams.length / 2 ** r));
        return (
          <div key={r} className="bracket-col">
            <h3>{labels(r)}</h3>
            <div className="bracket-games">
              {Array.from({ length: expected }, (_, i) => <MatchCard key={i} career={c} f={games[i]} tbd={!games[i]} />)}
            </div>
          </div>
        );
      })}
      {comp.ranking && (
        <div className="bracket-col champion">
          <h3>Vô địch</h3>
          <div className="bracket-games">
            <div className="champ-card"><Crest career={c} id={comp.ranking[0]} size={48} /><b>{c.teams[comp.ranking[0]].name}</b></div>
          </div>
        </div>
      )}
    </div>
  );
}

function SwissGrid({ career: c, comp }: { career: Career; comp: Competition }) {
  const rec = [...swissRecord(comp)];
  const buckets = new Map<string, string[]>();
  for (const [t, r] of rec) buckets.set(`${r.w}-${r.l}`, [...(buckets.get(`${r.w}-${r.l}`) ?? []), t]);
  const keys = [...buckets.keys()].sort((a, b) => Number(b[0]) - Number(a[0]) || Number(a[2]) - Number(b[2]));
  return (
    <div className="swiss">
      {keys.map((k) => (
        <div key={k} className={`swiss-col ${k[0] === "3" ? "adv" : k[2] === "3" ? "out" : ""}`}>
          <h3>{k} {k[0] === "3" ? "· Đi tiếp" : k[2] === "3" ? "· Bị loại" : ""}</h3>
          {buckets.get(k)!.map((t) => (
            <div key={t} className={`mc-row ${t === c.teamId ? "me" : ""}`}><Crest career={c} id={t} size={18} /> {c.teams[t].name}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Thống kê
function StatsPage({ career: c }: { career: Career }) {
  const [league, setLeague] = useState(c.teams[c.teamId].league!);
  const [sort, setSort] = useState<"kda" | "dpm" | "csd">("kda");
  const rows = Object.entries(c.stats)
    .map(([id, s]) => {
      const team = c.teams[s.team];
      const player = team && [...Object.values(team.roster), ...(team.bench ?? [])].find((p) => p.id === id);
      return {
        id, team, player, ign: s.ign, games: s.games,
        kda: (s.kills + s.assists) / Math.max(1, s.deaths),
        dpm: s.damage / Math.max(1, s.minutes),
        csd: s.csd15 / Math.max(1, s.games),
        kdaText: `${(s.kills / s.games).toFixed(1)}/${(s.deaths / s.games).toFixed(1)}/${(s.assists / s.games).toFixed(1)}`,
      };
    })
    .filter((r) => r.team && (league === "ALL" || r.team.league === league) && r.games >= 2)
    .sort((a, b) => b[sort] - a[sort])
    .slice(0, 40);
  const leagues: [string, string][] = [["ALL", "Tất cả"], ...c.leagues.filter((l) => l.tier > 0).map((l) => [l.id, l.id] as [string, string])];
  return (
    <>
      <RegionTabs items={leagues} value={league} onChange={setLeague} />
      <Card title="Thống kê tuyển thủ (mùa này)">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Tuyển thủ</th><th>Ván</th><th>K/D/A</th>
                <th className="sortable" onClick={() => setSort("kda")}>KDA{sort === "kda" ? " ▼" : ""}</th>
                <th className="sortable" onClick={() => setSort("dpm")}>DPM{sort === "dpm" ? " ▼" : ""}</th>
                <th className="sortable" onClick={() => setSort("csd")}>CSD@15{sort === "csd" ? " ▼" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={r.team.id === c.teamId ? "me" : ""}>
                  <td>{i + 1}</td>
                  <td><span className="team-cell">{r.player && <Avatar player={r.player} team={r.team} size={24} />}<Crest career={c} id={r.team.id} size={16} /> {r.ign}</span></td>
                  <td>{r.games}</td>
                  <td>{r.kdaText}</td>
                  <td>{r.kda.toFixed(1)}</td>
                  <td>{Math.round(r.dpm)}</td>
                  <td>{signed(Math.round(r.csd))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="muted">Chưa có dữ liệu.</p>}
      </Card>
    </>
  );
}
