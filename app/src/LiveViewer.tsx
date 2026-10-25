// Trình xem trận kiểu Teamfight Manager 2: camera bám giao tranh trên bản đồ pixel, bảng tuyển thủ hai bên,
// thanh tỉ số, nhật ký ý định, bản đồ mini, bảng chỉ số và điều khiển tốc độ.
import { useEffect, useRef, useState } from "react";
import {
  INHIBITORS, LIVE, LiveMatch, MAP_SIZE, NEXUS_NODES, describeEvent, type ChampUnit, type CoachOrders, type MatchResult,
} from "../../engine/src/index.ts";
import { PPU, renderTerrain } from "./art/terrain.ts";
import { Rift3D } from "./rift3d.ts";
import { heroSprite, minionSprite, monsterSprite, nexusSprite, teamCrest, towerSprite } from "./art/sprites.ts";
import { champName } from "./data.ts";
import { portraitOf } from "./portraits.ts";

const SPEEDS = [1, 2, 4, 8, 16];
const SIDE = ["#4a7cff", "#ff5b6b"];
const ARCH_FX: Record<string, string> = {
  TANK: "#ffd166", FIGHTER: "#ff9f43", ASSASSIN: "#c56cff", MAGE: "#9b6bff", MARKSMAN: "#ffe066", ENCHANTER: "#4fd18b", CATCHER: "#7fd1ff",
};

let terrainCache: HTMLCanvasElement | null = null;
const urlCache = new WeakMap<HTMLCanvasElement, string>();
const spriteUrl = (cv: HTMLCanvasElement) => {
  let u = urlCache.get(cv);
  if (!u) urlCache.set(cv, (u = cv.toDataURL()));
  return u;
};

interface Props {
  match: LiveMatch;
  names: [string, string];
  colors: [[string, string] | undefined, [string, string] | undefined];
  userSide: 0 | 1;
  orders: CoachOrders;
  onOrders: (o: CoachOrders) => void;
  onEnd: (r: MatchResult) => void;
}

const teamColors = (c: [string, string] | undefined, side: number): [string, string] => c ?? (side === 0 ? ["#2f6fe0", "#111827"] : ["#d8434f", "#111827"]);

export function LiveViewer({ match, names, colors, userSide, orders, onOrders, onEnd }: Props) {
  const stage = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const [speed, setSpeed] = useState(2);
  const [paused, setPaused] = useState(false);
  const [auto, setAuto] = useState(true);
  const [zoomStep, setZoomStep] = useState(0);
  const [view3d, setView3d] = useState(true);
  const [loading3d, setLoading3d] = useState(false);
  const gl = useRef<HTMLCanvasElement>(null);
  const [, setFrame] = useState(0);
  const st = useRef({ speed, paused, auto, zoomStep, cam: { x: 100, y: 100 }, drag: null as null | { x: number; y: number }, unitCss: 6, view3d: true, focus: null as null | { x: number; y: number; until: number }, prev: new Map<number, { x: number; flip: boolean; walk: number }>() });
  st.current.speed = speed;
  st.current.paused = paused;
  st.current.auto = auto;
  st.current.zoomStep = zoomStep;
  st.current.view3d = view3d;

  useEffect(() => {
    match.recordFx = true;
    terrainCache ??= renderTerrain();
    const cv = stage.current!;
    const mm = mini.current!;
    const g = cv.getContext("2d")!;
    const mg = mm.getContext("2d")!;
    const s = st.current;
    s.cam = { x: userSide === 0 ? 40 : 160, y: userSide === 0 ? 160 : 40 };
    // Bản đồ 3D: tải model; lỗi WebGL hoặc không tải được thì tự quay về bản đồ pixel 2D
    let rift: Rift3D | null = null;
    try {
      rift = new Rift3D(gl.current!);
      setLoading3d(true);
      rift.load("map3d/rift.glb").then(
        () => setLoading3d(false),
        () => (setLoading3d(false), setView3d(false), (rift = null)),
      );
    } catch {
      setView3d(false);
    }

    let raf = 0;
    let last = performance.now();
    let ui = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!s.paused && !match.isOver) match.advance(dt * s.speed);

      // kích thước canvas theo khung chứa
      const rect = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(rect.width * dpr));
      const H = Math.max(1, Math.round(rect.height * dpr));
      if (cv.width !== W || cv.height !== H) {
        cv.width = W;
        cv.height = H;
        rift?.resize(W, H);
      }
      const use3d = !!(s.view3d && rift?.ready);
      const zoom = Math.max(0.6, Math.min(3, (W / (PPU * 75)) * Math.pow(1.25, s.zoomStep)));

      // camera tự động kiểu truyền hình: giữ một cụm ít nhất 4 giây; cụm mới hấp dẫn hơn hẳn (giao tranh) thì chuyển,
      // điểm mới ở xa thì cắt cảnh ngay thay vì trượt ngang qua vùng trống
      if (s.auto) {
        const alive = match.champs.filter((c) => c.alive);
        const clusterAt = (x: number, y: number) => alive.filter((o) => Math.hypot(o.x - x, o.y - y) < 28);
        const scoreOf = (near: typeof alive) => near.filter((o) => o.state === "FIGHT" || o.state === "GANK").length * 10 + near.length;
        let best = -1;
        let bestPt: { x: number; y: number } | null = null;
        for (const c of alive) {
          const near = clusterAt(c.x, c.y);
          const sc = scoreOf(near);
          if (sc > best) (best = sc), (bestPt = centroid(near));
        }
        const cur = s.focus ? clusterAt(s.focus.x, s.focus.y) : [];
        const curScore = cur.length ? scoreOf(cur) : -1;
        if (bestPt && (!s.focus || !cur.length || match.t > s.focus.until || best >= curScore + 10)) {
          const far = Math.hypot(bestPt.x - s.cam.x, bestPt.y - s.cam.y) > 45;
          s.focus = { ...bestPt, until: match.t + 4 };
          if (far) (s.cam.x = bestPt.x), (s.cam.y = bestPt.y);
        } else if (s.focus && cur.length) {
          const c = centroid(cur)!;
          s.focus.x = c.x;
          s.focus.y = c.y;
        }
        if (s.focus) {
          s.cam.x += (s.focus.x - s.cam.x) * 0.12;
          s.cam.y += (s.focus.y - s.cam.y) * 0.12;
        }
      }

      // Phép chiếu: 3D (camera nghiêng trên model Summoner's Rift) hoặc 2D (bản đồ pixel nhìn từ trên xuống)
      let unit: number; // px màn hình cho 1 đơn vị mô phỏng tại tâm camera
      let P: (x: number, y: number, lift?: number) => { x: number; y: number; k: number; u: number };
      if (use3d) {
        s.cam.x = Math.max(25, Math.min(MAP_SIZE - 25, s.cam.x));
        s.cam.y = Math.max(25, Math.min(MAP_SIZE - 25, s.cam.y));
        rift!.distance = 95 / Math.pow(1.25, s.zoomStep);
        rift!.lookAt(s.cam);
        rift!.render();
        g.clearRect(0, 0, W, H);
        unit = rift!.project(s.cam, 0, W, H).scale * 0.96;
        // sprite cao ~20px nghệ thuật ≈ 6 đơn vị model (to hơn tỉ lệ thật để dễ nhìn)
        P = (x, y, lift = 0) => {
          const r = rift!.project({ x, y }, lift, W, H);
          return { x: r.x, y: r.y, k: r.scale * 0.3, u: r.scale * 0.96 };
        };
      } else {
        unit = PPU * zoom;
        const halfW0 = W / 2 / unit;
        const halfH0 = H / 2 / unit;
        s.cam.x = Math.max(halfW0, Math.min(MAP_SIZE - halfW0, s.cam.x));
        s.cam.y = Math.max(halfH0, Math.min(MAP_SIZE - halfH0, s.cam.y));
        g.imageSmoothingEnabled = false;
        g.fillStyle = "#0b0f1c";
        g.fillRect(0, 0, W, H);
        g.drawImage(terrainCache!, (s.cam.x - halfW0) * PPU, (s.cam.y - halfH0) * PPU, halfW0 * 2 * PPU, halfH0 * 2 * PPU, 0, 0, W, H);
        const k2 = Math.max(1, Math.round(zoom * 1.4 * dpr) / dpr) * dpr; // bội số nguyên để giữ nét pixel
        P = (x, y) => ({ x: (x - s.cam.x) * unit + W / 2, y: (y - s.cam.y) * unit + H / 2, k: k2, u: unit });
      }
      s.unitCss = unit / dpr;
      const halfW = W / 2 / unit;
      const halfH = H / 2 / unit;
      g.imageSmoothingEnabled = false;

      const blit = (img: HTMLCanvasElement, at: { x: number; y: number; k: number }, anchorY = 1) =>
        g.drawImage(img, Math.round(at.x - (img.width * at.k) / 2), Math.round(at.y - img.height * at.k * anchorY), img.width * at.k, img.height * at.k);
      const bar = (x: number, y: number, w: number, ratio: number, color: string) => {
        g.fillStyle = "#0b0f1c";
        g.fillRect(Math.round(x - w / 2) - 1, Math.round(y) - 1, w + 2, 5 * dpr);
        g.fillStyle = color;
        g.fillRect(Math.round(x - w / 2), Math.round(y), Math.max(0, w * ratio), 3 * dpr);
      };

      // công trình: 3D thì ẩn/hiện model trụ, nhà lính, nhà chính; 2D thì vẽ sprite
      for (const u of match.units) {
        if (u.kind === "TOWER") {
          if (use3d) {
            rift!.setVisible(u.node!, u.alive);
            if (u.tier === "INHIB") for (const inh of INHIBITORS) if (inh.side === u.side && inh.lane === u.lane) rift!.setVisible(inh.node, u.alive);
            if (u.alive && u.hp < u.maxHp) {
              const at = P(u.x, u.y, 10);
              bar(at.x, at.y, 60 * at.k, u.hp / u.maxHp, SIDE[u.side]);
            }
            continue;
          }
          const img = towerSprite(u.side as 0 | 1, u.alive, u.tier === "NEXUS");
          const at = P(u.x, u.y + 2);
          blit(img, at);
          if (u.alive && u.hp < u.maxHp) bar(at.x, at.y - img.height * at.k - 6 * dpr, 16 * at.k, u.hp / u.maxHp, SIDE[u.side]);
        } else if (u.kind === "NEXUS") {
          if (use3d) {
            rift!.setVisible(NEXUS_NODES[u.side as 0 | 1], u.alive);
            if (u.alive && u.hp < u.maxHp) {
              const at = P(u.x, u.y, 12);
              bar(at.x, at.y, 90 * at.k, u.hp / u.maxHp, SIDE[u.side]);
            }
            continue;
          }
          const at = P(u.x, u.y + 4);
          blit(nexusSprite(u.side as 0 | 1, u.alive), at);
          if (u.alive && u.hp < u.maxHp) bar(at.x, at.y - 32 * at.k, 26 * at.k, u.hp / u.maxHp, SIDE[u.side]);
        }
      }
      // quái + lính
      for (const u of match.units) {
        if (!u.alive) continue;
        if (u.kind === "CAMP" || u.kind === "DRAGON" || u.kind === "BARON") {
          const img = monsterSprite(u.kind);
          const at = P(u.x, u.y + (use3d ? 0 : 2));
          blit(img, at);
          if (u.hp < u.maxHp) bar(at.x, at.y - img.height * at.k - 5 * dpr, img.width * at.k, u.hp / u.maxHp, "#d8a03a");
        } else if (u.kind === "MINION") {
          blit(minionSprite(u.side as 0 | 1, !!u.ranged, Math.floor(match.t * 4 + u.id) % 2), P(u.x, u.y + (use3d ? 0 : 1)));
        }
      }
      // tướng (vẽ theo y để người đứng trước che người đứng sau)
      const champs = match.champs.filter((c) => c.alive).sort((a, b) => a.y - b.y);
      g.textAlign = "center";
      g.font = `${Math.round(11 * dpr)}px "Be Vietnam Pro", system-ui, sans-serif`;
      for (const c of champs) {
        const p = s.prev.get(c.id) ?? { x: c.x, flip: c.side === 1, walk: 0 };
        const dx = c.x - p.x;
        if (Math.abs(dx) > 0.02) p.flip = dx < 0;
        p.walk += Math.hypot(dx, 0) > 0.01 ? dt * s.speed : 0;
        p.x = c.x;
        s.prev.set(c.id, p);
        const img = heroSprite(c.player.id, teamColors(colors[c.side], c.side), c.arch, Math.floor(p.walk * 4) % 2, p.flip);
        const at = P(c.x, c.y);
        const k = at.k;
        // vòng chân màu phe
        g.fillStyle = SIDE[c.side] + "88";
        g.beginPath();
        g.ellipse(at.x, at.y, 8 * k, 3 * k, 0, 0, Math.PI * 2);
        g.fill();
        blit(img, at);
        const top = at.y - img.height * k;
        bar(at.x, top - 7 * dpr, 20 * k, c.hp / c.maxHp, SIDE[c.side]);
        if (match.t < c.stunUntil) {
          g.fillStyle = "#ffe066";
          g.fillText("✦", at.x, top - 10 * dpr);
        }
        g.lineWidth = 3 * dpr;
        g.strokeStyle = "#0b0f1c";
        g.fillStyle = c.side === userSide ? "#e8f1ff" : "#ffe3e6";
        g.strokeText(c.player.ign, at.x, at.y + 13 * dpr);
        g.fillText(c.player.ign, at.x, at.y + 13 * dpr);
      }
      // hiệu ứng
      for (const f of match.fx) {
        const age = match.t - f.t;
        if (age < 0 || age > 0.6) continue;
        if (f.kind === "shot") {
          if (age > 0.25) continue;
          const q = age / 0.25;
          g.fillStyle = f.side === 2 ? "#ffd166" : f.side === 0 ? "#bcd4ff" : "#ffc2c9";
          const at = P(f.x1 + (f.x2 - f.x1) * q, f.y1 + (f.y2 - f.y1) * q);
          const y = at.y - 8 * at.k;
          g.fillRect(Math.round(at.x - at.k), Math.round(y - at.k), 2 * at.k, 2 * at.k);
        } else if (f.kind === "hit") {
          if (age > 0.15) continue;
          const at = P(f.x2, f.y2);
          g.strokeStyle = "#ffffffcc";
          g.lineWidth = 2 * dpr;
          g.beginPath();
          g.arc(at.x, at.y - 8 * at.k, 6 * at.k, -0.8, 0.8);
          g.stroke();
        } else {
          const at = P(f.x2, f.y2);
          const r = (f.kind === "ult" ? 18 : 9) * at.u * Math.min(1, age / 0.3);
          g.strokeStyle = (f.kind === "heal" ? "#4fd18b" : ARCH_FX[f.arch ?? "MAGE"]) + (age < 0.3 ? "ff" : "88");
          g.lineWidth = (f.kind === "ult" ? 4 : 2) * dpr;
          g.beginPath();
          // 3D: vòng nằm trên mặt đất (bị nén theo góc nghiêng camera)
          g.ellipse(at.x, at.y, r / (f.kind === "ult" ? 1 : 2), (r / (f.kind === "ult" ? 1 : 2)) * (use3d ? 0.6 : 1), 0, 0, Math.PI * 2);
          g.stroke();
        }
      }

      // bản đồ mini
      const M = mm.width;
      mg.imageSmoothingEnabled = false;
      mg.drawImage(terrainCache!, 0, 0, M, M);
      const ms = M / MAP_SIZE;
      for (const u of match.units) {
        if (!u.alive) continue;
        if (u.kind === "TOWER" || u.kind === "NEXUS") (mg.fillStyle = SIDE[u.side]), mg.fillRect(u.x * ms - 2, u.y * ms - 2, 4, 4);
        else if (u.kind === "DRAGON" || u.kind === "BARON") (mg.fillStyle = u.kind === "DRAGON" ? "#f29a4a" : "#b48cff"), mg.fillRect(u.x * ms - 3, u.y * ms - 3, 6, 6);
        else if (u.kind === "MINION") (mg.fillStyle = SIDE[u.side]), mg.fillRect(u.x * ms - 1, u.y * ms - 1, 2, 2);
      }
      for (const c of match.champs) {
        if (!c.alive) continue;
        mg.fillStyle = "#0b0f1c";
        mg.fillRect(c.x * ms - 4, c.y * ms - 4, 8, 8);
        mg.fillStyle = SIDE[c.side];
        mg.fillRect(c.x * ms - 3, c.y * ms - 3, 6, 6);
      }
      mg.strokeStyle = "#ffffffcc";
      mg.lineWidth = 1.5;
      mg.strokeRect((s.cam.x - halfW) * ms, (s.cam.y - halfH) * ms, halfW * 2 * ms, halfH * 2 * ms);

      if (++ui % 8 === 0 || match.isOver) setFrame((f) => f + 1);
      if (!match.isOver) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      rift?.dispose();
    };
  }, [match]);

  // kéo để di chuyển camera
  const onDown = (e: React.PointerEvent) => {
    st.current.drag = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = st.current.drag;
    if (!d) return;
    st.current.cam.x -= (e.clientX - d.x) / st.current.unitCss;
    st.current.cam.y -= (e.clientY - d.y) / st.current.unitCss;
    st.current.drag = { x: e.clientX, y: e.clientY };
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 2) setAuto(false);
  };
  const onUp = () => (st.current.drag = null);
  const onMini = (e: React.MouseEvent) => {
    const r = mini.current!.getBoundingClientRect();
    st.current.cam = { x: ((e.clientX - r.left) / r.width) * MAP_SIZE, y: ((e.clientY - r.top) / r.height) * MAP_SIZE };
    setAuto(false);
  };

  const sb = match.scoreboard();
  const minute = Math.floor(match.displayMinute);
  const sec = Math.floor((match.displayMinute - minute) * 60);
  const killFeed = match.events.filter((e) => e.type !== "TEAMFIGHT" && e.type !== "LANE_REPORT").slice(-3).map((e) => ({ t: e.minute, text: describeEvent(e, names), side: "side" in e ? e.side : 2 }));
  const intents = match.intents.slice(-6).map((i) => ({ t: (i.t * 3) / 60, text: `${i.ign}: ${i.text}`, side: i.side }));
  const log = [...intents, ...killFeed].sort((a, b) => a.t - b.t).slice(-7);

  return (
    <div className="arena">
      <header className="arena-top">
        <TeamHead name={names[0]} colors={colors[0]} you={userSide === 0} />
        <div className="arena-score-mid">
          <span className="stat-chip">Trụ {sb[0].towers}</span>
          <span className="stat-chip">Rồng {sb[0].dragons}</span>
          <span className="gold">{(sb[0].gold / 1000).toFixed(1)}K</span>
          <b className="kills blue">{sb[0].kills}</b>
          <span className="vs">VS</span>
          <b className="kills red">{sb[1].kills}</b>
          <span className="gold">{(sb[1].gold / 1000).toFixed(1)}K</span>
          <span className="stat-chip">Rồng {sb[1].dragons}</span>
          <span className="stat-chip">Trụ {sb[1].towers}</span>
          <span className="clock">{String(minute).padStart(2, "0")}:{String(sec).padStart(2, "0")}</span>
        </div>
        <TeamHead name={names[1]} colors={colors[1]} you={userSide === 1} right />
      </header>

      <div className="arena-body">
        <RosterPanel match={match} side={0} colors={colors[0]} />
        <div className="arena-stage">
          <canvas ref={gl} className="stage-canvas gl" style={{ visibility: view3d && !loading3d ? "visible" : "hidden" }} aria-hidden="true" />
          <canvas ref={stage} className="stage-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} aria-label="Trận đấu" />
          {view3d && loading3d && <div className="loading-3d">Đang tải bản đồ 3D…</div>}
          <div className="stage-controls">
            <button onClick={() => setPaused(!paused)} title={paused ? "Tiếp tục" : "Tạm dừng"}>{paused ? "▶" : "❚❚"}</button>
            {SPEEDS.map((v) => <button key={v} className={speed === v ? "on" : ""} onClick={() => setSpeed(v)}>x{v}</button>)}
            <button onClick={() => setZoomStep(zoomStep + 1)} title="Phóng to">＋</button>
            <button onClick={() => setZoomStep(zoomStep - 1)} title="Thu nhỏ">－</button>
            <button className={view3d ? "on" : ""} onClick={() => setView3d(!view3d)} title="Đổi bản đồ 3D / pixel 2D">{view3d ? "3D" : "2D"}</button>
          </div>
          {sb[0].baronActive || sb[1].baronActive ? <div className="buff-banner">Baron: {sb[0].baronActive ? names[0] : names[1]}</div> : null}
          <ul className="intent-log">
            {log.map((l, i) => <li key={i} className={l.side === 0 ? "blue" : l.side === 1 ? "red" : ""}>{l.text}</li>)}
          </ul>
          <div className="mini-wrap">
            <canvas ref={mini} width={180} height={180} className="mini" onClick={onMini} aria-label="Bản đồ mini" />
            <button className={auto ? "on" : ""} onClick={() => setAuto(!auto)}>Camera tự động</button>
            <button onClick={() => { match.run(); setFrame((f) => f + 1); }}>Xem kết quả ngay</button>
          </div>
        </div>
        <RosterPanel match={match} side={1} colors={colors[1]} />
      </div>

      <ScoreTable match={match} colors={colors} />

      {!match.isOver ? (
        <section className="card coach">
          <header className="card-head"><h2>Chỉ đạo từ ghế huấn luyện</h2></header>
          <div className="coach-grid">
            <OrderChips label="Đi rừng ưu tiên" value={orders.laneFocus} options={[["TOP", "Trên"], ["MID", "Giữa"], ["BOT", "Dưới"], ["NONE", "Farm"]]} onChange={(v) => onOrders({ ...orders, laneFocus: v })} />
            <OrderChips label="Mục tiêu" value={orders.objective} options={[["DRAGON", "Rồng"], ["HERALD_BARON", "Baron"], ["BALANCED", "Cân bằng"]]} onChange={(v) => onOrders({ ...orders, objective: v })} />
            <OrderChips label="Lối đánh" value={orders.risk} options={[["SAFE", "An toàn"], ["NORMAL", "Bình thường"], ["AGGRESSIVE", "Mạo hiểm"]]} onChange={(v) => onOrders({ ...orders, risk: v })} />
          </div>
        </section>
      ) : (
        <button className="primary proceed" onClick={() => onEnd(match.result())}>
          {match.winner === userSide ? "CHIẾN THẮNG — Xem bảng chỉ số" : "Thất bại — Xem bảng chỉ số"}
        </button>
      )}
    </div>
  );
}

function centroid(list: { x: number; y: number }[]) {
  if (!list.length) return null;
  return { x: list.reduce((s, c) => s + c.x, 0) / list.length, y: list.reduce((s, c) => s + c.y, 0) / list.length };
}

function TeamHead({ name, colors, you, right }: { name: string; colors?: [string, string]; you: boolean; right?: boolean }) {
  return (
    <div className={`team-head ${right ? "right" : ""}`}>
      <img src={teamCrest(name, colors)} alt="" width={28} height={28} className="crest" />
      <b>{name}</b>
      {you && <small className="you">BẠN</small>}
    </div>
  );
}

function RosterPanel({ match, side, colors }: { match: LiveMatch; side: 0 | 1; colors?: [string, string] }) {
  const list = match.champs.filter((c) => c.side === side);
  return (
    <aside className={`roster-panel ${side === 0 ? "left" : "right"}`}>
      {list.map((c) => <RosterRow key={c.id} c={c} t={match.t} colors={teamColors(colors, side)} />)}
    </aside>
  );
}

function RosterRow({ c, t, colors }: { c: ChampUnit; t: number; colors: [string, string] }) {
  const img = portraitOf(c.player.id) ?? spriteUrl(heroSprite(c.player.id, colors, c.arch, 0, c.side === 1));
  const respawn = Math.max(0, Math.ceil(((c.respawnAt - t) * 3)));
  return (
    <div className={`roster-row ${c.alive ? "" : "dead"}`}>
      <img src={img} alt="" width={36} height={36} className="px-img portrait" />
      <div className="grow">
        <div className="roster-name">
          <b>Lv.{c.level}</b> {c.player.ign} <small>({champName(c.champion.id)})</small>
        </div>
        <div className="hp"><i style={{ width: `${c.alive ? (c.hp / c.maxHp) * 100 : 0}%` }} /></div>
      </div>
      {!c.alive && <span className="respawn">{respawn}s</span>}
    </div>
  );
}

function ScoreTable({ match, colors }: { match: LiveMatch; colors: Props["colors"] }) {
  const sides = [0, 1].map((s) => match.champs.filter((c) => c.side === s));
  return (
    <div className="score-table">
      {sides.map((list, s) => (
        <table key={s} className={`table small ${s === 0 ? "blue" : "red"}`}>
          <thead><tr><th></th><th>Tuyển thủ</th><th>Tướng</th><th>K/D/A</th><th>CS</th><th>Vàng</th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td><img src={portraitOf(c.player.id) ?? spriteUrl(heroSprite(c.player.id, teamColors(colors[s], s), c.arch, 0, false))} alt="" width={24} height={24} className="px-img portrait" /></td>
                <td>{c.player.ign}</td>
                <td>{champName(c.champion.id)}</td>
                <td>{c.line.kills}/{c.line.deaths}/{c.line.assists}</td>
                <td>{c.line.cs}</td>
                <td>{(c.line.gold / 1000).toFixed(1)}K</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      {match.t < LIVE.laningEnd && <p className="small muted">Giai đoạn đi đường: tuyển thủ ưu tiên farm, chỉ giao tranh khi có cơ hội.</p>}
    </div>
  );
}

function OrderChips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="order">
      <span className="muted small">{label}</span>
      <div className="chips">
        {options.map(([v, l]) => <button key={v} className={`chip ${value === v ? "on" : ""}`} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}
