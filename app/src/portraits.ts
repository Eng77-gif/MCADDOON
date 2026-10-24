// Chân dung pixel do PixelLab vẽ (npm run portraits). Nhúng dạng data URI để bản 1 file HTML vẫn có ảnh.
const files = import.meta.glob<string>("../../data/packs/real-2026/portraits/*.png", { eager: true, query: "?inline", import: "default" });

const byId: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) byId[path.slice(path.lastIndexOf("/") + 1, -4)] = url;

export const portraitOf = (playerId: string): string | undefined => byId[playerId];
