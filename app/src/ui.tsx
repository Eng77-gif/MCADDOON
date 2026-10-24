import { useState, type ReactNode } from "react";
import { ROLES, type Role, type Team } from "../../engine/src/index.ts";

export const ROLE_VI: Record<Role, string> = { TOP: "Đường trên", JUNGLE: "Đi rừng", MID: "Đường giữa", ADC: "Xạ thủ", SUPPORT: "Hỗ trợ" };
export const ROLE_SHORT: Record<Role, string> = { TOP: "TOP", JUNGLE: "JGL", MID: "MID", ADC: "ADC", SUPPORT: "SUP" };
export { ROLES };

export function Card({ title, children, right }: { title?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      {(title || right) && (
        <header className="card-head">
          <h2>{title}</h2>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

/** Thanh chỉ số 10 ô kiểu game cũ */
export function Bar({ value, max = 100 }: { value: number; max?: number }) {
  const n = Math.round(Math.max(0, Math.min(1, value / max)) * 10);
  const tone = value >= 85 ? "hi" : value >= 75 ? "mid" : "lo";
  return (
    <span className="bar" aria-label={`${Math.round(value)}/${max}`}>
      {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < n ? `on ${tone}` : ""} />)}
    </span>
  );
}

/** Thẻ tên đội theo màu áo */
export function TeamTag({ team, big }: { team: Team; big?: boolean }) {
  const [bg, fg] = team.colors ?? ["#c27c0e", "#111111"];
  return (
    <span className={`tag ${big ? "big" : ""}`} style={{ ["--tag-bg" as string]: bg, ["--tag-fg" as string]: readable(bg, fg) }}>
      {team.short}
    </span>
  );
}

/** Chọn chữ trắng/đen hoặc màu phụ sao cho đọc được trên nền màu chính */
function readable(bg: string, fg: string) {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  };
  return Math.abs(lum(bg) - lum(fg)) > 0.45 ? fg : lum(bg) > 0.5 ? "#111111" : "#ffffff";
}

/** Nút cần bấm 2 lần để xác nhận (không dùng confirm() vì nhiều webview chặn hộp thoại). */
export function ConfirmButton({ label, confirmLabel, onConfirm, className }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button className={className} onClick={() => (armed ? onConfirm() : setArmed(true))} onBlur={() => setArmed(false)}>
      {armed ? confirmLabel : label}
    </button>
  );
}

export const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
