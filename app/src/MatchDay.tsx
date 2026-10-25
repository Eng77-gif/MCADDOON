import { useMemo, useRef, useState } from "react";
import {
  MatchSim, ROLES, TACTIC_KEYS, aiDraftStep, applyDraft, autoPlayGame, bestTactic, createRng, currentStep, describeEvent,
  describePhase, draftForNextGame, gameContext, isAvailable, isDraftDone, isSeriesOver, newSeries, openRoles, recordGame,
  seriesOptionsFor, seriesTeams, suggest,
  type Career, type CoachOrders, type DraftState, type MatchResult, type PhaseReport, type Picks, type Role, type SeriesState, type Tactic,
} from "../../engine/src/index.ts";
import { champName, db } from "./data.ts";
import { Sprite, monsterOf } from "./sprites.tsx";
import { Card, ConfirmButton, ROLE_SHORT, ROLE_VI } from "./ui.tsx";

const TACTIC_VI: Record<Tactic, string> = { TEAMFIGHT: "Giao tranh tổng", SPLIT_1_4: "Đẩy lẻ 1-4", POKE: "Cấu rỉa", PICK_OFF: "Bắt lẻ" };
const AI_QUALITY = 0.8;
const DEFAULT_ORDERS: CoachOrders = { laneFocus: "NONE", objective: "BALANCED", risk: "NORMAL" };

type Step = "DRAFT" | "SETUP" | "PLAY" | "GAME_END";

interface Props {
  career: Career;
  fixtureId: string;
  onDone: (s: SeriesState) => void;
  onCancel: () => void;
}

export function MatchDay({ career: c, fixtureId, onDone, onCancel }: Props) {
  const { comp, fixture } = useMemo(() => {
    for (const comp of c.competitions) {
      const fixture = comp.fixtures.find((f) => f.id === fixtureId);
      if (fixture) return { comp, fixture };
    }
    throw new Error("Không tìm thấy trận");
  }, [c, fixtureId]);
  const userTeamIdx: 0 | 1 = fixture.home === c.teamId ? 0 : 1;

  const [series, setSeries] = useState<SeriesState>(() => newSeries(seriesTeams(c, fixture), seriesOptionsFor(c, comp, fixture)));
  const rng = useRef(createRng(series.options.seed ^ 0x2545f491));
  const [game, setGame] = useState(() => startGame(series));
  const [step, setStep] = useState<Step>("DRAFT");

  function startGame(s: SeriesState) {
    const { draft, blue } = draftForNextGame(s);
    const userSide: 0 | 1 = blue === userTeamIdx ? 0 : 1;
    return { draft: runAiUntilUser(draft, userSide), blue, userSide };
  }

  function runAiUntilUser(d: DraftState, userSide: 0 | 1) {
    let s = d;
    while (!isDraftDone(s) && currentStep(s)!.side !== userSide) s = aiDraftStep(db, s, rng.current, AI_QUALITY);
    return s;
  }

  const names: [string, string] = [game.draft.teams[0].short, game.draft.teams[1].short];

  return (
    <main className="screen">
      <header className="topbar">
        <ConfirmButton className="link" label="← Thoát" confirmLabel="Thoát? (mất series)" onConfirm={onCancel} />
        <div className="grow center">
          <b>{seriesTeams(c, fixture)[0].short} {series.wins[0]} - {series.wins[1]} {seriesTeams(c, fixture)[1].short}</b>
          <small className="muted">{comp.name} · {fixture.label} · Bo{fixture.bestOf} · Ván {series.games.length + (step === "GAME_END" ? 0 : 1)}</small>
        </div>
      </header>

      {step === "DRAFT" && (
        <Draft
          draft={game.draft}
          userSide={game.userSide}
          locked={game.draft.locked.length}
          onPick={(champ, role) => {
            const d = runAiUntilUser(applyDraft(db, game.draft, champ, role), game.userSide);
            setGame({ ...game, draft: d });
            if (isDraftDone(d)) setStep("SETUP");
          }}
          onAuto={() => {
            const next = autoPlayGame(db, series, [AI_QUALITY, AI_QUALITY]);
            setSeries(next);
            setStep("GAME_END");
          }}
        />
      )}

      {step === "SETUP" || step === "PLAY" ? (
        <Live
          key={series.games.length}
          draft={game.draft}
          userSide={game.userSide}
          names={names}
          seed={gameContext(series).seed}
          pressure={series.options.stagePressure}
          patch={series.options.patch}
          onStart={() => setStep("PLAY")}
          onEnd={(result) => {
            setSeries(recordGame(series, game.blue, game.draft, result));
            setStep("GAME_END");
          }}
        />
      ) : null}

      {step === "GAME_END" && (
        <GameEnd
          series={series}
          userTeamIdx={userTeamIdx}
          onNext={() => {
            if (isSeriesOver(series)) return onDone(series);
            setGame(startGame(series));
            setStep("DRAFT");
          }}
        />
      )}
    </main>
  );
}

// ------------------------------------------------------------------ Ban/Pick
function Draft({ draft, userSide, locked, onPick, onAuto }: {
  draft: DraftState; userSide: 0 | 1; locked: number; onPick: (champ: string, role?: Role) => void; onAuto: () => void;
}) {
  const step = currentStep(draft)!;
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const open = openRoles(draft, userSide);
  const tips = suggest(db, draft, 3);

  const champs = Object.values(db)
    .filter((ch) => (roleFilter === "ALL" || ch.roles.includes(roleFilter)) && ch.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const pick = (id: string) => {
    if (step.type === "BAN") return onPick(id);
    const fits = open.filter((r) => db[id].roles.includes(r));
    if (fits.length === 1) return onPick(id, fits[0]);
    setChosen(id); // nhiều vị trí phù hợp (hoặc chọn trái vị trí): hỏi người chơi
  };

  return (
    <>
      <Card>
        <div className="draft-board">
          {[0, 1].map((side) => (
            <div key={side} className={`draft-side ${side === 0 ? "blue" : "red"}`}>
              <b>{draft.teams[side].short}{side === userSide ? " (bạn)" : ""}</b>
              <div className="bans">{draft.bans[side].map((b) => <span key={b} className="ban">{champName(b)}</span>)}</div>
              {ROLES.map((r) => (
                <div key={r} className="slot">
                  <small>{ROLE_SHORT[r]}</small>
                  {draft.picks[side][r] && <Sprite id={draft.picks[side][r]!} size={32} flip={side === 1} />}
                  {draft.picks[side][r] ? champName(draft.picks[side][r]!) : "—"}
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className={`turn ${step.side === 0 ? "blue" : "red"}`}>
          Lượt của bạn: <b>{step.type === "BAN" ? "CẤM" : "CHỌN"}</b>
          {locked > 0 && <small className="muted"> · Fearless: {locked} tướng đã bị khoá</small>}
        </p>
        <p className="muted small">
          Gợi ý: {tips.map((t) => (
            <button key={t.champion + t.role} className="pill sig" onClick={() => (step.type === "BAN" ? onPick(t.champion) : onPick(t.champion, t.role))}>
              {champName(t.champion)}{t.role ? ` (${ROLE_SHORT[t.role]})` : ""}
            </button>
          ))}
        </p>
      </Card>

      {chosen && (
        <Card title={`${champName(chosen)}: chọn vị trí`}>
          <div className="chips">
            {open.map((r) => (
              <button key={r} className="chip" onClick={() => { setChosen(null); onPick(chosen, r); }}>
                {ROLE_VI[r]} — {draft.teams[userSide].roster[r].ign}{!db[chosen].roles.includes(r) ? " (trái vị trí)" : ""}
              </button>
            ))}
            <button className="chip" onClick={() => setChosen(null)}>Huỷ</button>
          </div>
        </Card>
      )}

      <Card>
        <div className="chips scroll">
          {(["ALL", ...ROLES] as const).map((r) => (
            <button key={r} className={`chip ${roleFilter === r ? "on" : ""}`} onClick={() => setRoleFilter(r)}>{r === "ALL" ? "Tất cả" : ROLE_SHORT[r]}</button>
          ))}
        </div>
        <input className="search" placeholder="Tìm tướng…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="champ-grid">
          {champs.map((ch) => {
            const ok = isAvailable(db, draft, ch.id);
            const mastery = step.type === "PICK"
              ? Math.max(0, ...open.map((r) => draft.teams[userSide].roster[r].champion_pool.find((e) => e.champion_id === ch.id)?.mastery ?? 0))
              : 0;
            return (
              <button key={ch.id} className={`champ tier-${ch.patch_stats[draft.patch]?.tier ?? "B"}`} disabled={!ok} onClick={() => pick(ch.id)}>
                <Sprite id={ch.id} anim="base" size={48} />
                <span>{ch.name}</span>
                <small>{ch.patch_stats[draft.patch]?.tier}{mastery ? ` · ${mastery}` : ""}</small>
              </button>
            );
          })}
        </div>
      </Card>
      <button onClick={onAuto}>Để trợ lý tự Ban/Pick và mô phỏng ván này</button>
    </>
  );
}

// ------------------------------------------------------------------ Thi đấu theo giai đoạn
function aiOrders(prev: PhaseReport | undefined, side: 0 | 1): CoachOrders {
  if (!prev) return { laneFocus: "BOT", objective: "DRAGON", risk: "NORMAL" };
  const lead = side === 0 ? prev.goldDiff : -prev.goldDiff;
  return lead > 1500
    ? { laneFocus: "NONE", objective: "HERALD_BARON", risk: "AGGRESSIVE" }
    : lead < -1500
      ? { laneFocus: "NONE", objective: "DRAGON", risk: "SAFE" }
      : { laneFocus: "NONE", objective: "BALANCED", risk: "NORMAL" };
}

function Live({ draft, userSide, names, seed, pressure, patch, onStart, onEnd }: {
  draft: DraftState; userSide: 0 | 1; names: [string, string]; seed: number; pressure: number; patch: string;
  onStart: () => void; onEnd: (r: MatchResult) => void;
}) {
  const picks = draft.picks as [Picks, Picks];
  const [tactic, setTactic] = useState<Tactic>(() => bestTactic(db, picks[userSide]));
  const [orders, setOrders] = useState<CoachOrders>({ laneFocus: "MID", objective: "DRAGON", risk: "NORMAL" });
  const [sim, setSim] = useState<MatchSim | null>(null);
  const [, force] = useState(0);
  const ai: 0 | 1 = userSide === 0 ? 1 : 0;

  const start = () => {
    const setups = [0, 1].map((side) => ({
      team: draft.teams[side],
      picks: picks[side],
      tactic: side === userSide ? tactic : bestTactic(db, picks[side]),
      orders: side === userSide ? orders : DEFAULT_ORDERS,
    })) as ConstructorParameters<typeof MatchSim>[2];
    setSim(new MatchSim(db, { patch, stagePressure: pressure, seed }, setups));
    onStart();
  };

  const play = () => {
    if (!sim) return;
    const o: [CoachOrders?, CoachOrders?] = [];
    o[userSide] = orders;
    o[ai] = aiOrders(sim.phases.at(-1), ai);
    sim.playPhase(o);
    force((n) => n + 1);
  };

  const phaseName = sim ? ({ EARLY: "Đầu trận", MID: "Giữa trận", LATE: "Cuối trận", END: "" } as const)[sim.phase] : "Đầu trận";
  const last = sim?.phases.at(-1);
  const lead = last ? (userSide === 0 ? last.goldDiff : -last.goldDiff) : 0;

  return (
    <>
      {!sim && (
        <Card title="Lối chơi">
          <div className="chips">
            {(Object.keys(TACTIC_KEYS) as Tactic[]).map((t) => (
              <button key={t} className={`chip ${tactic === t ? "on" : ""}`} onClick={() => setTactic(t)}>
                {TACTIC_VI[t]}{t === bestTactic(db, picks[userSide]) ? " ★" : ""}
              </button>
            ))}
          </div>
          <p className="muted small">★ = hợp với đội hình nhất. Đối thủ: {TACTIC_VI[bestTactic(db, picks[ai])]}.</p>
        </Card>
      )}

      {sim && (
        <Card title="Diễn biến">
          {sim.phases.map((r, i) => (
            <div key={i} className="phase">
              <h3>{describePhase(r, names)}</h3>
              <ul className="log">
                {r.events.filter((e) => e.type !== "KILL").map((e, j) => {
                  const monster = monsterOf(e.type, e.minute);
                  return <li key={j}>{monster && <Sprite id={monster} anim="attack" size={32} />}{describeEvent(e, names)}</li>;
                })}
              </ul>
            </div>
          ))}
          {last && <p className={lead >= 0 ? "good" : "bad"}>Bạn đang {lead >= 0 ? "dẫn" : "thua"} {Math.abs(Math.round(lead)).toLocaleString("vi-VN")} vàng.</p>}
        </Card>
      )}

      {(!sim || !sim.isOver) && (
        <Card title={`Chỉ đạo: ${phaseName}`}>
          <OrderRow label="Camp đường" value={orders.laneFocus} options={[["TOP", "Trên"], ["MID", "Giữa"], ["BOT", "Dưới"], ["NONE", "Farm"]]} onChange={(v) => setOrders({ ...orders, laneFocus: v })} />
          <OrderRow label="Mục tiêu" value={orders.objective} options={[["DRAGON", "Rồng"], ["HERALD_BARON", "Sứ Giả/Baron"], ["BALANCED", "Cân bằng"]]} onChange={(v) => setOrders({ ...orders, objective: v })} />
          <OrderRow label="Lối đánh" value={orders.risk} options={[["SAFE", "An toàn"], ["NORMAL", "Bình thường"], ["AGGRESSIVE", "Mạo hiểm"]]} onChange={(v) => setOrders({ ...orders, risk: v })} />
          <button className="primary" onClick={sim ? play : start}>{sim ? `Đấu ${phaseName.toLowerCase()}` : "Bắt đầu trận"}</button>
        </Card>
      )}

      {sim?.isOver && (
        <Card title={sim.winner === userSide ? "CHIẾN THẮNG!" : "Thất bại"}>
          <BoxScore result={sim.result()} names={names} />
          <button className="primary" onClick={() => onEnd(sim.result())}>Tiếp tục</button>
        </Card>
      )}
    </>
  );
}

function OrderRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="order">
      <span className="muted small">{label}</span>
      <div className="chips">
        {options.map(([v, l]) => <button key={v} className={`chip ${value === v ? "on" : ""}`} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}

function BoxScore({ result, names }: { result: MatchResult; names: [string, string] }) {
  return (
    <>
      {result.sides.map((side, i) => {
        const opp = result.sides[i === 0 ? 1 : 0];
        return (
          <div key={i}>
            <h3>{names[i]} {result.winner === i ? "· THẮNG" : ""} <small className="muted">{side.kills} hạ gục · {side.towers} trụ · {side.dragons} rồng · {side.barons} baron</small></h3>
            <table className="table small">
              <thead><tr><th></th><th>Tướng</th><th>K/D/A</th><th>CS</th><th>DPM</th><th>CSD15</th></tr></thead>
              <tbody>
                {side.lines.map((l, j) => (
                  <tr key={j}>
                    <td>{l.ign}</td>
                    <td>{champName(l.champion)}</td>
                    <td>{l.kills}/{l.deaths}/{l.assists}</td>
                    <td>{l.cs}</td>
                    <td>{Math.round(l.damage / result.duration)}</td>
                    <td>{l.csAt15 - opp.lines[j].csAt15}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="muted small">Thời lượng: {Math.round(result.duration)} phút</p>
    </>
  );
}

function GameEnd({ series, userTeamIdx, onNext }: { series: SeriesState; userTeamIdx: 0 | 1; onNext: () => void }) {
  const g = series.games.at(-1)!;
  const over = isSeriesOver(series);
  const userWonSeries = series.wins[userTeamIdx] > series.wins[userTeamIdx === 0 ? 1 : 0];
  const names: [string, string] = g.blue === 0 ? [series.teams[0].short, series.teams[1].short] : [series.teams[1].short, series.teams[0].short];
  return (
    <Card title={over ? (userWonSeries ? "Thắng series!" : "Thua series") : `Ván ${series.games.length}: ${g.winner === userTeamIdx ? "Thắng" : "Thua"}`}>
      <p className="big center">{series.teams[0].short} {series.wins[0]} - {series.wins[1]} {series.teams[1].short}</p>
      <BoxScore result={g.result} names={names} />
      <button className="primary" onClick={onNext}>{over ? "Về trang chính" : "Ván tiếp theo"}</button>
    </Card>
  );
}
