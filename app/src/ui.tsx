import { useState, type ReactNode } from "react";
import { ROLES, type Role } from "../../engine/src/index.ts";

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

export function Bar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tone = value >= 85 ? "hi" : value >= 75 ? "mid" : "lo";
  return (
    <span className="bar">
      <span className={`bar-fill ${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

export const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Nút cần bấm 2 lần để xác nhận (không dùng confirm() vì nhiều webview chặn hộp thoại). */
export function ConfirmButton({ label, confirmLabel, onConfirm, className }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button className={className} onClick={() => (armed ? onConfirm() : setArmed(true))} onBlur={() => setArmed(false)}>
      {armed ? confirmLabel : label}
    </button>
  );
}
