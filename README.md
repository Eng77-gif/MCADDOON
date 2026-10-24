# MCADDOON

Giả lập quản lý đội tuyển LMHT chuyên nghiệp (Web + Mobile). Người chơi có thể chọn vai HLV hoặc Chủ CLB.

## Tài liệu thiết kế

1. [Mô hình dữ liệu và công thức Ban/Pick](docs/01-data-model-and-draft-formula.md)
2. [Engine mô phỏng trận theo giai đoạn](docs/02-match-engine.md)
3. [Kiến trúc kỹ thuật, Data Pack và hai chế độ chơi](docs/03-architecture-and-modes.md)

## Chạy thử

Yêu cầu Node.js ≥ 22.18 (chạy TypeScript trực tiếp, không cần build).

```bash
npm install
npm test            # test engine
npm run typecheck
npm run demo 42     # 1 trận mẫu kèm bình luận và bảng chỉ số (seed 42)
npm run balance     # 2000 trận để kiểm tra cân bằng
```

## Cấu trúc

- `engine/`: lõi mô phỏng viết bằng TypeScript thuần (draft, rating, trận đấu, bình luận)
- `data/packs/`: dữ liệu tướng, đội, tuyển thủ
- `data/sample_*.json`: schema mẫu đầy đủ của Tuyển thủ và Tướng
- `prototype/`: bản Python đầu tiên của công thức Ban/Pick
