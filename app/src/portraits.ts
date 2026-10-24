// Chân dung pixel do PixelLab vẽ (npm run portraits). Bản build thường tách thành file ảnh; bản 1 file HTML (build:single) nhúng hết vào.
const files = import.meta.glob<string>("../../data/packs/real-2026/portraits/*.png", { eager: true, query: "?inline", import: "default" });

const byId: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) byId[path.slice(path.lastIndexOf("/") + 1, -4)] = url;

export const portraitOf = (playerId: string): string | undefined => byId[playerId];
