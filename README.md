# MCADDOON

Giả lập quản lý đội tuyển LMHT chuyên nghiệp (Web + Mobile). Người chơi có thể chọn vai HLV hoặc Chủ CLB.

## Tài liệu thiết kế

1. [Mô hình dữ liệu và công thức Ban/Pick](docs/01-data-model-and-draft-formula.md)
2. [Engine mô phỏng trận theo giai đoạn](docs/02-match-engine.md)
3. [Kiến trúc kỹ thuật, Data Pack và hai chế độ chơi](docs/03-architecture-and-modes.md)
4. [Dữ liệu thật, AI Ban/Pick, mùa giải và giao diện](docs/04-data-draft-season-ui.md)
5. [Chuyển nhượng, tuyển trạch, phát triển, pixel art và PixelLab](docs/05-market-dev-pixel-art.md)

## Chạy thử

Yêu cầu Node.js ≥ 22.18 (chạy TypeScript trực tiếp, không cần build).

```bash
npm install
npm test            # test engine
npm run typecheck
npm run demo 42     # 1 trận mẫu kèm bình luận và bảng chỉ số (seed 42)
npm run balance     # 2000 trận để kiểm tra cân bằng
npm run import-pack real-2026   # dựng lại dữ liệu từ CSV
PIXELLAB_SECRET=... npm run portraits -- --team T1   # chân dung pixel art bằng PixelLab

cd app && npm install && npm run dev   # chơi trên trình duyệt (web/mobile)
```

## Cấu trúc

- `engine/`: lõi mô phỏng viết bằng TypeScript thuần (draft, AI Ban/Pick, trận đấu, series, mùa giải, sự nghiệp)
- `app/`: giao diện React + Vite
- `data/packs/real-2026/`: dữ liệu thật (CSV → JSON); `data/packs/demo/`: dữ liệu demo cho test
- `data/sample_*.json`: schema mẫu đầy đủ của Tuyển thủ và Tướng
- `prototype/`: bản Python đầu tiên của công thức Ban/Pick
