// Trình xem trận thời gian thực: vẽ bản đồ 3 đường pixel, tuyển thủ (avatar + tên tướng), lính, trụ, Rồng/Baron.
import { useEffect, useRef, useState } from "react";
import { LiveMatch, MAP_SIZE, describeEvent, type CoachOrders, type MatchResult, type Unit } from "../../engine/src/index.ts";
import { pixelAvatar } from "./avatar.tsx";
import { champName } from "./data.ts";
import { Card } from "./ui.tsx";

const SCALE = 3; // px canvas mỗi đơn vị bản đồ
const SPEEDS = [1, 2, 4, 8, 16];

function cssVar(el: Element, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

const imgCache = new Map<string, HTMLImageElement>();
function avatarImage(id: string, colors?: [string, string]) {
  let img = imgCache.get(id);
  if (!img) {
    img = new Image();
    img.src = pixelAvatar(id, colors);
    imgCache.set(id, img);
  }
  return img;
}

/** Vẽ nền bản đồ một lần (cỏ, sông, đường, rừng) */
function drawTerrain(g: CanvasRenderingContext2D, el: Element) {
  const px = (x: number, y: number, c: string, w = 1, h = 1) => ((g.fillStyle = c), g.fillRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE));
  const grass = cssVar(el, "--grass", "#5f8f3e");
  const lane = cssVar(el, "--lane", "#b08a55");
  const river = cssVar(el, "--river", "#4f8fc9");
  px(0, 0, grass, MAP_SIZE, MAP_SIZE);
  for (let i = 0; i < 900; i++) px((i * 37) % MAP_SIZE, (i * 53 + (i >> 3)) % MAP_SIZE, "#0000001a"); // lốm đốm cỏ
  for (let i = -4; i < MAP_SIZE + 4; i += 1) px(i - 5, i - 5, river, 10, 10); // sông chéo
  // đường
  px(16, 18, lane, 8, 164); px(18, 16, lane, 164, 8);
  px(18, 176, lane, 164, 8); px(176, 18, lane, 8, 164);
  for (let i = 22; i < 180; i += 1) px(i - 3, MAP_SIZE - i - 3, lane, 6, 6);
  // nhà hai bên
  px(2, 168, "#2f5bd833", 30, 30); px(168, 2, "#c8323f33", 30, 30);
}

export function LiveViewer({ match, names, colors, userSide, orders, onOrders, onEnd }: {
  match: LiveMatch;
  names: [string, string];
  colors: [[string, string] | undefined, [string, string] | undefined];
  userSide: 0 | 1;
  orders: CoachOrders;
  onOrders: (o: CoachOrders) => void;
  onEnd: (r: MatchResult) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const terrain = useRef<HTMLCanvasElement | null>(null);
  const [speed, setSpeed] = useState(4);
  const [paused, setPaused] = useState(false);
  const [, setFrame] = useState(0);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  speedRef.current = speed;
  pausedRef.current = paused;

  useEffect(() => {
    const cv = canvas.current!;
    const g = cv.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    const bg = document.createElement("canvas");
    bg.width = bg.height = MAP_SIZE * SCALE;
    drawTerrain(bg.getContext("2d")!, cv);
    terrain.current = bg;

    let raf = 0;
    let last = performance.now();
    let uiTick = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && !match.isOver) match.advance(dt * speedRef.current);
      draw(g, cv);
      if (++uiTick % 6 === 0 || match.isOver) setFrame((f) => f + 1);
      if (!match.isOver) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [match]);

  function draw(g: CanvasRenderingContext2D, el: Element) {
    g.drawImage(terrain.current!, 0, 0);
    const blue = cssVar(el, "--blue", "#2f5bd8");
    const red = cssVar(el, "--red", "#c8323f");
    const ink = "#140f1f";
    const sideColor = (s: number) => (s === 0 ? blue : s === 1 ? red : "#d8a03a");
    const rect = (u: { x: number; y: number }, size: number, color: string) => {
      const x = Math.round((u.x - size / 2) * SCALE);
      const y = Math.round((u.y - size / 2) * SCALE);
      g.fillStyle = ink;
      g.fillRect(x - 2, y - 2, size * SCALE + 4, size * SCALE + 4);
      g.fillStyle = color;
      g.fillRect(x, y, size * SCALE, size * SCALE);
    };
    const hpBar = (u: Unit, w: number, yOff: number) => {
      const x = Math.round((u.x - w / 2) * SCALE);
      const y = Math.round((u.y - yOff) * SCALE);
      g.fillStyle = ink;
      g.fillRect(x - 1, y - 1, w * SCALE + 2, 5);
      g.fillStyle = sideColor(u.side);
      g.fillRect(x, y, Math.max(0, (u.hp / u.maxHp) * w * SCALE), 3);
    };

    for (const u of match.units) {
      if (u.kind === "TOWER" || u.kind === "NEXUS") {
        const size = u.kind === "NEXUS" ? 9 : 5;
        if (!u.alive) {
          rect(u, size - 1, "#77736b");
          continue;
        }
        rect(u, size, sideColor(u.side));
        g.fillStyle = "#fff8";
        g.fillRect(Math.round((u.x - 1) * SCALE), Math.round((u.y - 1) * SCALE), 2 * SCALE, 2 * SCALE);
        hpBar(u, size + 2, size / 2 + 3);
      }
    }
    for (const u of match.units) {
      if (!u.alive) continue;
      if (u.kind === "CAMP") rect(u, 3, "#8a6a3d");
      else if (u.kind === "DRAGON") (rect(u, 7, "#d06a2c"), hpBar(u, 9, 6));
      else if (u.kind === "BARON") (rect(u, 9, "#7b4fb3"), hpBar(u, 11, 7));
      else if (u.kind === "MINION") {
        g.fillStyle = sideColor(u.side);
        g.fillRect(Math.round((u.x - 1) * SCALE), Math.round((u.y - 1) * SCALE), 2 * SCALE, 2 * SCALE);
      }
    }
    g.font = `${4 * SCALE}px VT323, monospace`;
    g.textAlign = "center";
    for (const c of match.champs) {
      if (!c.alive) continue;
      const size = 9;
      const x = Math.round((c.x - size / 2) * SCALE);
      const y = Math.round((c.y - size / 2) * SCALE);
      g.fillStyle = sideColor(c.side);
      g.fillRect(x - 3, y - 3, size * SCALE + 6, size * SCALE + 6);
      const img = avatarImage(c.player.id, colors[c.side]);
      if (img.complete) g.drawImage(img, x, y, size * SCALE, size * SCALE);
      if (match.t < c.stunUntil) {
        g.fillStyle = "#ffe066";
        g.fillRect(x, y - 6, size * SCALE, 3);
      }
      hpBar(c, size, size / 2 + 3);
      g.fillStyle = "#fff";
      g.strokeStyle = ink;
      g.lineWidth = 3;
      const label = champName(c.champion.id);
      g.strokeText(label, c.x * SCALE, (c.y + size / 2 + 4) * SCALE);
      g.fillText(label, c.x * SCALE, (c.y + size / 2 + 4) * SCALE);
    }
  }

  const sb = match.scoreboard();
  const minute = Math.floor(match.displayMinute);
  const sec = Math.floor((match.displayMinute - minute) * 60);
  const feed = match.events.filter((e) => e.type !== "TEAMFIGHT").slice(-5).reverse();
  const share = sb[0].gold / Math.max(1, sb[0].gold + sb[1].gold);

  return (
    <>
      <Card>
        <div className="broadcast">
          <div className="side blue">
            <b>{names[0]}{userSide === 0 ? " (bạn)" : ""}</b>
            <span className="k">{sb[0].kills}</span>
            <small className="muted">{(sb[0].gold / 1000).toFixed(1)}k · Trụ {sb[0].towers} · Rồng {sb[0].dragons}{sb[0].baronActive ? " · BARON" : ""}</small>
          </div>
          <span className="pixel-num">{String(minute).padStart(2, "0")}:{String(sec).padStart(2, "0")}</span>
          <div className="side red">
            <b>{names[1]}{userSide === 1 ? " (bạn)" : ""}</b>
            <span className="k">{sb[1].kills}</span>
            <small className="muted">{(sb[1].gold / 1000).toFixed(1)}k · Trụ {sb[1].towers} · Rồng {sb[1].dragons}{sb[1].baronActive ? " · BARON" : ""}</small>
          </div>
        </div>
        <div className="goldbar" aria-label="Tương quan vàng"><i style={{ width: `calc(${share * 100}% - 4px)` }} /></div>
        <canvas ref={canvas} className="rift px" width={MAP_SIZE * SCALE} height={MAP_SIZE * SCALE} aria-label="Bản đồ trận đấu" />
        <div className="chips">
          <button className="chip" onClick={() => setPaused(!paused)}>{paused ? "▶ Tiếp" : "❚❚ Dừng"}</button>
          {SPEEDS.map((s) => <button key={s} className={`chip ${speed === s ? "on" : ""}`} onClick={() => setSpeed(s)}>x{s}</button>)}
          <button className="chip" onClick={() => { match.run(); setFrame((f) => f + 1); }}>Tua tới cuối</button>
        </div>
        <ul className="log" style={{ marginTop: 8 }}>
          {feed.map((e, i) => <li key={i}>{describeEvent(e, names)}</li>)}
        </ul>
      </Card>

      {!match.isOver && (
        <Card title="Chỉ đạo từ ghế huấn luyện">
          <OrderChips label="Đi rừng ưu tiên" value={orders.laneFocus} options={[["TOP", "Trên"], ["MID", "Giữa"], ["BOT", "Dưới"], ["NONE", "Farm"]]} onChange={(v) => onOrders({ ...orders, laneFocus: v })} />
          <OrderChips label="Mục tiêu" value={orders.objective} options={[["DRAGON", "Rồng"], ["HERALD_BARON", "Baron"], ["BALANCED", "Cân bằng"]]} onChange={(v) => onOrders({ ...orders, objective: v })} />
          <OrderChips label="Lối đánh" value={orders.risk} options={[["SAFE", "An toàn"], ["NORMAL", "Bình thường"], ["AGGRESSIVE", "Mạo hiểm"]]} onChange={(v) => onOrders({ ...orders, risk: v })} />
          <p className="small muted">Tuyển thủ tự chơi theo chỉ số của họ. Bạn chỉ đổi định hướng chung của đội.</p>
        </Card>
      )}

      {match.isOver && (
        <button className="primary" onClick={() => onEnd(match.result())}>
          {match.winner === userSide ? "CHIẾN THẮNG! Xem bảng chỉ số" : "Thất bại. Xem bảng chỉ số"}
        </button>
      )}
    </>
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
