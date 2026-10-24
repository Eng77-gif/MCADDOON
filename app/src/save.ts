import type { Career } from "../../engine/src/index.ts";

const KEY = "mcaddoon-career-v1";

export function loadCareer(): Career | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Career) : null;
  } catch {
    return null;
  }
}

export function saveCareer(c: Career): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
    return true;
  } catch {
    return false; // trình duyệt chặn lưu trữ: vẫn chơi được trong phiên hiện tại
  }
}

export function clearCareer() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* bỏ qua */
  }
}
