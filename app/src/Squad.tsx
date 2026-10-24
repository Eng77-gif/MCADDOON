import { useState } from "react";
import {
  TRAINING_VI, ageOf, overallOf, potentialRange, releasePlayer, setStarter, teamWagesPerMonth, type Career, type Player, type TrainingFocus,
} from "../../engine/src/index.ts";
import { champName } from "./data.ts";
import { Avatar } from "./avatar.tsx";
import { OfferForm } from "./Market.tsx";
import { Bar, Card, ConfirmButton, ROLES, ROLE_VI, Stat, money, signed } from "./ui.tsx";

const avg = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0) / Object.values(o).length;

export function Squad({ career: c, onChange }: { career: Career; onChange: () => void }) {
  const team = c.teams[c.teamId];
  const [renew, setRenew] = useState<string | null>(null);
  const wages = teamWagesPerMonth(team);

  return (
    <>
      <Card title="Giáo án tập luyện">
        <div className="chips">
          {(Object.keys(TRAINING_VI) as TrainingFocus[]).map((f) => (
            <button key={f} className={`chip ${c.training.focus === f ? "on" : ""}`} onClick={() => { c.training.focus = f; onChange(); }}>{TRAINING_VI[f]}</button>
          ))}
        </div>
        <p className="small muted">Áp dụng sau mỗi tuần thi đấu. Tuyển thủ trẻ, còn xa tiềm năng tiến bộ nhanh nhất.</p>
        <div className="grid2">
          <Stat label="Quỹ lương / tháng" value={money(wages)} tone={c.mode === "COACH" && wages > c.board.wageBudget ? "bad" : undefined} />
          {c.mode === "COACH" && <Stat label="Trần quỹ lương" value={money(c.board.wageBudget)} />}
        </div>
      </Card>

      {ROLES.map((role) => (
        <PlayerCard key={role} career={c} player={team.roster[role]} starter renewOpen={renew === team.roster[role].id} onRenew={setRenew} onChange={onChange} />
      ))}

      <Card title={`Dự bị / Học viện (${team.bench?.length ?? 0}/3)`}>
        {!team.bench?.length && <p className="muted">Chưa có ai. Ký tự do hoặc thần đồng ở tab Thị trường.</p>}
        <div className="rows">
          {(team.bench ?? []).map((p) => (
            <div key={p.id} className="row-card">
              <PlayerHead career={c} player={p} />
              <div className="line">
                <button onClick={() => { setStarter(c, p.id); onChange(); }}>Đá chính ({ROLE_VI[p.role]})</button>
                <button className="link" onClick={() => setRenew(renew === p.id ? null : p.id)}>Gia hạn</button>
                <ConfirmButton className="link" label="Giải phóng" confirmLabel={`Chắc chắn? Trợ cấp ${money((p.contract?.salary ?? 0) * 3)}`} onConfirm={() => { releasePlayer(c, p.id); onChange(); }} />
              </div>
              {renew === p.id && <OfferForm career={c} player={p} label="Gia hạn" onDone={() => { setRenew(null); onChange(); }} />}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function PlayerHead({ career: c, player: p }: { career: Career; player: Player }) {
  const team = c.teams[c.teamId];
  const expiring = (p.contract?.until ?? c.year) <= c.year;
  return (
    <div className="player-head">
      <Avatar player={p} team={team} size={56} />
      <div className="grow">
        {p.ign} <span className="ovr">{Math.round(overallOf(p))}</span>
        <small className="muted">
          {ROLE_VI[p.role]} · {ageOf(p, c.year)} tuổi{p.nationality ? ` · ${p.nationality}` : ""}
        </small>
        <small className={expiring ? "warn" : "muted"}>
          {money(p.contract?.salary ?? 0)}/tháng · HĐ tới {p.contract?.until ?? "—"}{expiring ? " · HẾT HẠN CUỐI MÙA" : ""}
        </small>
      </div>
    </div>
  );
}

function PlayerCard({ career: c, player: p, renewOpen, onRenew, onChange }: {
  career: Career; player: Player; starter?: boolean; renewOpen: boolean; onRenew: (id: string | null) => void; onChange: () => void;
}) {
  const a = p.attributes;
  // HLV/CLB biết rõ tuyển thủ của mình hơn: khoảng tiềm năng hẹp
  const [lo, hi] = potentialRange(p, 80);
  return (
    <Card>
      <PlayerHead career={c} player={p} />
      <div className="grid2" style={{ marginTop: 8 }}>
        <Stat label="Kỹ năng" value={<><Bar value={avg(a.mechanics)} /> {Math.round(avg(a.mechanics))}</>} />
        <Stat label="Tư duy" value={<><Bar value={avg(a.macro)} /> {Math.round(avg(a.macro))}</>} />
        <Stat label="Giao tranh" value={<><Bar value={avg(a.teamfight)} /> {Math.round(avg(a.teamfight))}</>} />
        <Stat label="Tâm lý" value={<><Bar value={avg(a.mental)} /> {Math.round(avg(a.mental))}</>} />
        <Stat label="Phong độ" value={signed(p.dynamic_state.form)} tone={p.dynamic_state.form >= 0 ? "good" : "bad"} />
        <Stat label="Tinh thần" value={signed(p.dynamic_state.morale)} tone={p.dynamic_state.morale >= 0 ? "good" : "bad"} />
        <Stat label="Tiềm năng" value={lo === hi ? `${lo}` : `${lo}–${hi}`} />
      </div>
      <p className="pool">
        {p.champion_pool.slice(0, 5).map((e) => (
          <span key={e.champion_id} className={`pill ${e.is_signature ? "sig" : ""}`}>{champName(e.champion_id)} {e.mastery}</span>
        ))}
      </p>
      <button className="link" onClick={() => onRenew(renewOpen ? null : p.id)}>{renewOpen ? "Đóng" : "Gia hạn hợp đồng"}</button>
      {renewOpen && <OfferForm career={c} player={p} label="Gia hạn" onDone={() => { onRenew(null); onChange(); }} />}
    </Card>
  );
}
