// Bản đồ mini Summoner's Rift 48x48 pixel: trụ còn đứng hiện màu đội, trụ đã vỡ thành đống đá xám.
import { useEffect, useRef } from "react";

// Trụ đội xanh theo thứ tự bị phá: ngoài (trên, giữa, dưới) → trong → nhà lính → 2 trụ nhà chính
const BLUE_TOWERS: [number, number][] = [
  [4, 12], [19, 28], [35, 43],
  [4, 22], [15, 32], [25, 43],
  [4, 32], [11, 36], [15, 43],
  [7, 38], [9, 40],
];
const RED_TOWERS = BLUE_TOWERS.map(([x, y]) => [47 - x, 47 - y] as [number, number]);

function cssVar(el: Element, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

/** lost[0] = số trụ đội xanh đã mất, lost[1] = đội đỏ */
export function Minimap({ lost, flash }: { lost: [number, number]; flash?: 0 | 1 | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d")!;
    const px = (x: number, y: number, c: string, w = 1, h = 1) => ((g.fillStyle = c), g.fillRect(x, y, w, h));
    const grass = cssVar(cv, "--grass", "#5f8f3e");
    const lane = cssVar(cv, "--lane", "#b08a55");
    const river = cssVar(cv, "--river", "#4f8fc9");
    const blue = cssVar(cv, "--blue", "#2f5bd8");
    const red = cssVar(cv, "--red", "#c8323f");
    const ink = "#140f1f";

    px(0, 0, grass, 48, 48);
    // rừng lấm tấm
    for (let i = 0; i < 90; i++) px((i * 37) % 46 + 1, (i * 53) % 46 + 1, "#00000022");
    // sông (chéo từ trên-trái xuống dưới-phải)
    for (let i = 0; i < 48; i++) px(i - 1, i - 1, river, 3, 3);
    // đường: trên (trái + trên), dưới (dưới + phải), giữa (chéo)
    px(3, 3, lane, 3, 42); px(3, 3, lane, 42, 3);
    px(3, 42, lane, 42, 3); px(42, 3, lane, 3, 42);
    for (let i = 6; i < 42; i++) px(i, 47 - i - 1, lane, 2, 2);
    // nhà chính
    px(2, 40, blue, 6, 6); px(40, 2, red, 6, 6);
    px(4, 42, ink, 2, 2); px(42, 4, ink, 2, 2);
    // hang Baron (trên) / Rồng (dưới)
    px(15, 13, "#7b4fb3", 3, 3); px(30, 32, "#d06a2c", 3, 3);

    const draw = (list: [number, number][], color: string, gone: number) =>
      list.forEach(([x, y], i) => {
        if (i < gone) px(x - 1, y - 1, "#77736b", 2, 2);
        else { px(x - 1, y - 1, ink, 3, 3); px(x, y, color); px(x - 1, y - 1, color, 2, 2); }
      });
    draw(BLUE_TOWERS, blue, lost[0]);
    draw(RED_TOWERS, red, lost[1]);
    if (flash !== null && flash !== undefined) {
      const [x, y] = flash === 0 ? RED_TOWERS[Math.max(0, lost[1] - 1)] : BLUE_TOWERS[Math.max(0, lost[0] - 1)];
      px(x - 3, y - 3, "#fff6", 7, 7);
    }
  }, [lost[0], lost[1], flash]);
  return <canvas ref={ref} className="minimap px" width={48} height={48} aria-label="Bản đồ mini" />;
}
