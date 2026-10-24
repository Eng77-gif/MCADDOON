# MCADDOON

Giả lập quản lý đội tuyển LMHT chuyên nghiệp (Web + Mobile). Người chơi có thể chọn vai HLV hoặc Chủ CLB.

## Tài liệu thiết kế

1. [Mô hình dữ liệu và công thức Ban/Pick](docs/01-data-model-and-draft-formula.md)
2. [Engine mô phỏng trận theo giai đoạn](docs/02-match-engine.md)
3. [Kiến trúc kỹ thuật, Data Pack và hai chế độ chơi](docs/03-architecture-and-modes.md)
4. [Dữ liệu thật, AI Ban/Pick, mùa giải và giao diện](docs/04-data-draft-season-ui.md)

## Chạy thử

Yêu cầu Node.js ≥ 22.18 (chạy TypeScript trực tiếp, không cần build).

```bash
npm install
npm test            # test engine
npm run typecheck
npm run demo 42     # 1 trận mẫu kèm bình luận và bảng chỉ số (seed 42)
npm run balance     # 2000 trận để kiểm tra cân bằng
npm run import-pack real-2026   # dựng lại dữ liệu từ CSV

cd app && npm install && npm run dev   # chơi trên trình duyệt (web/mobile)
```

## Chân dung tuyển thủ (PixelLab)

Ảnh pixel của tuyển thủ được vẽ bằng [PixelLab](https://www.pixellab.ai) và lưu ở `data/packs/real-2026/portraits/<playerId>.png`; app tự nhúng ảnh nào có sẵn, chưa có thì hiện chữ cái đầu.

```bash
export PIXELLAB_API_KEY=key1,key2         # lấy ở https://www.pixellab.ai/account; key hết credit tự chuyển sang key sau
npm run portraits -- --dry-run              # xem prompt, không tốn credit
npm run portraits -- --team GEN,T1          # vẽ ảnh còn thiếu của vài đội (bỏ --team để vẽ cả 155 người)
npm run portraits -- --player GEN_MID --force   # vẽ lại 1 người
```

**Giống người thật nhất:** ảnh Leaguepedia của các đội dự Worlds 2026 nằm ở nhánh `ccr-08f2c8ab-y9pv45`; chép sang bằng `python3 engine/tools/import-photos.py <thư mục players>` (xem đầu file). Hoặc tự đặt ảnh chụp tuyển thủ (crop vuông, thấy mặt + vai, PNG/JPEG ≤ 2048px) vào `data/packs/real-2026/portraits/photos/<playerId>.jpg` rồi chạy lại với `--force`; script sẽ dùng *image-to-pixelart* của PixelLab để chuyển ảnh thật sang pixel. Ảnh gốc không được commit.

Không có ảnh thì vẽ từ chữ: prompt + seed cố định theo tuyển thủ, có quốc tịch, cả đội cùng màu áo. Thêm mô tả ngoại hình vào `data/packs/real-2026/portraits/prompts.json`, ví dụ `{ "GEN_MID": "short black hair, round glasses" }`.

`.mcp.json` cũng khai báo MCP server của PixelLab (dùng cùng biến `PIXELLAB_API_KEY`) để Claude Code vẽ/chỉnh nhân vật trực tiếp trong phiên làm việc.

## Cấu trúc

- `engine/`: lõi mô phỏng viết bằng TypeScript thuần (draft, AI Ban/Pick, trận đấu, series, mùa giải, sự nghiệp)
- `app/`: giao diện React + Vite
- `data/packs/real-2026/`: dữ liệu thật (CSV → JSON); `data/packs/demo/`: dữ liệu demo cho test
- `data/sample_*.json`: schema mẫu đầy đủ của Tuyển thủ và Tướng
- `prototype/`: bản Python đầu tiên của công thức Ban/Pick

## Tướng dạng pixel có animation (PixelLab)

`npm run champ-sprites -- --champ AHRI,JINX` vẽ cho mỗi tướng: sprite gốc 64x64 nhìn ngang, animation đứng thở (`idle`) và tấn công (`attack`), tốn khoảng 3 lượt vẽ mỗi tướng. Ảnh nằm ở `data/packs/real-2026/sprites/<CHAMP>/`, ngoại hình mô tả trong `sprites/champions.json`. App hiện sprite ở màn Ban/Pick: lưới chọn tướng dùng ảnh tĩnh, ô đã chọn dùng animation, đội đỏ được lật quay sang trái. Tướng chưa có sprite thì chỉ hiện tên.
