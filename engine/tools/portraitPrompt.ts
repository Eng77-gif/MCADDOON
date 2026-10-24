// Mô tả (prompt) để PixelLab vẽ chân dung pixel cho từng tuyển thủ.
// Thuần hàm, không gọi mạng: cùng tuyển thủ luôn ra cùng prompt + seed → vẽ lại vẫn giữ "gương mặt".
import type { Role } from "../src/types.ts";

export interface PortraitSubject { id: string; ign: string; role: Role; teamId: string }

export interface PortraitRequest {
  description: string;
  image_size: { width: number; height: number };
  seed: number;
  no_background: boolean;
  outline: string;
  shading: string;
  detail: string;
  view: string;
  direction: string;
}

/** FNV-1a 32-bit: ổn định giữa các lần chạy và các máy. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const pick = <T>(arr: readonly T[], h: number, salt: number) => arr[((h >>> salt) ^ (h >>> (salt + 7))) % arr.length];

// Mỗi vị trí một chút "chất" riêng để dễ nhận ra trong đội hình
const ROLE_FLAVOR: Record<Role, string> = {
  TOP: "confident stoic expression, broad shoulders",
  JUNGLE: "sharp focused eyes, slight smirk",
  MID: "calm genius look, chin slightly raised",
  ADC: "intense determined gaze",
  SUPPORT: "friendly warm smile",
};

const HAIR = ["short black hair", "messy dark brown hair", "buzz cut", "side-parted black hair", "dyed blonde hair", "wavy brown hair", "short undercut", "long hair tied back", "spiky black hair", "dyed silver hair"];
const EXTRA = ["", "", "", "round glasses", "thin glasses", "light stubble", "small earring", "cap worn backwards"];
const JERSEY = ["black and gold", "red and white", "navy blue and white", "teal and black", "purple and white", "orange and black", "crimson and black", "sky blue and white", "green and black", "white and gold", "pink and black", "dark grey and red"];

/** Màu áo đấu theo đội: cả đội cùng một màu. */
export const jerseyColors = (teamId: string) => JERSEY[hash32(teamId) % JERSEY.length];

/** `custom`: mô tả riêng (ngoại hình thật của tuyển thủ) thay cho tóc/phụ kiện ngẫu nhiên. */
export function portraitRequest(p: PortraitSubject, size = 64, custom?: string): PortraitRequest {
  const h = hash32(p.id);
  const extra = pick(EXTRA, h, 11);
  const description = [
    "pixel art bust portrait of a young esports pro gamer",
    ...(custom ? [custom] : [pick(HAIR, h, 3), extra]),
    ROLE_FLAVOR[p.role],
    `wearing a ${jerseyColors(p.teamId)} team jersey`,
    "gaming headset, facing the viewer, head and shoulders",
  ].filter(Boolean).join(", ");
  return {
    description,
    image_size: { width: size, height: size },
    seed: h % 2_000_000_000,
    no_background: true,
    outline: "single color black outline",
    shading: "medium shading",
    detail: "highly detailed",
    view: "side",
    direction: "south",
  };
}
