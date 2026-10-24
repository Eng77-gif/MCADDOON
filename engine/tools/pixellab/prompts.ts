// Mô tả gửi PixelLab cho chân dung tuyển thủ. Cố ý KHÔNG đưa tên thật hay mô tả ngoại hình người thật:
// nhân vật là avatar cách điệu theo màu áo đội, ổn định theo id (cùng tuyển thủ => cùng kiểu tóc, cùng seed).
import type { Player, Team } from "../../src/index.ts";
import type { PixfluxParams } from "./client.ts";

const HAIR = ["short black hair", "messy dark brown hair", "spiky black hair", "silver dyed hair", "short blond hair", "long black hair tied back", "bleached white hair", "dark hair with a beanie"];
const EXTRA = ["", "round glasses", "", "small earring", "", "focused eyes", "confident smile", ""];

const NAMED: [string, [number, number, number]][] = [
  ["black", [20, 20, 20]], ["white", [240, 240, 240]], ["red", [210, 30, 45]], ["orange", [245, 110, 20]],
  ["gold", [200, 160, 30]], ["yellow", [245, 205, 30]], ["green", [40, 170, 90]], ["teal", [20, 160, 155]],
  ["light blue", [60, 170, 225]], ["blue", [40, 80, 220]], ["navy", [15, 35, 70]], ["purple", [120, 60, 200]],
  ["grey", [110, 115, 125]],
];

/** Hex => tên màu gần nhất (mô hình hiểu tên màu tốt hơn mã hex). */
export function colorName(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best = NAMED[0];
  let dist = Infinity;
  for (const c of NAMED) {
    const d = c[1].reduce((s, v, i) => s + (v - rgb[i]) ** 2, 0);
    if (d < dist) (dist = d), (best = c);
  }
  return best[0];
}

export function stableSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 1_000_000;
}

export function portraitParams(player: Player, team: Team | undefined): PixfluxParams {
  const seed = stableSeed(player.id);
  const [c1, c2] = team?.colors ?? ["#666666", "#222222"];
  const hair = HAIR[seed % HAIR.length];
  const extra = EXTRA[(seed >> 3) % EXTRA.length];
  return {
    description: [
      "pixel art upper body portrait of a young esports pro gamer",
      hair,
      extra,
      `wearing a ${colorName(c1)} and ${colorName(c2)} team jersey`,
      "black gaming headset with microphone",
      "facing the viewer, determined expression, game character avatar",
    ].filter(Boolean).join(", "),
    negativeDescription: "text, logo, letters, watermark, blurry, full body, background scenery",
    width: 64,
    height: 64,
    outline: "single color black outline",
    shading: "medium shading",
    detail: "medium detail",
    view: "side",
    direction: "south",
    noBackground: true,
    seed,
  };
}
