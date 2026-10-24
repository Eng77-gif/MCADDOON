# 04 — Dữ liệu thật, AI Ban/Pick, mùa giải và giao diện

## 1. Data pack `real-2026`

Nguồn dữ liệu là các file CSV trong `data/packs/real-2026/csv/` (mở được bằng Excel hoặc Google Sheets). Sửa xong chạy:

```bash
npm run import-pack real-2026     # sinh champions.json, leagues.json, teams.json; báo lỗi nếu tham chiếu sai
```

| File | Nội dung |
|---|---|
| `champions.csv` | 100 tướng: vị trí, tier patch 26.21, 12 chỉ số hồ sơ (0–10) |
| `matchups.csv`, `synergies.csv` | Khắc chế (−5..+5) và phối hợp (0..3) |
| `leagues.csv` | CKTG, LCK, LPL, LEC, LCS, LCP, CBLOL (hạng 1), VCS (hạng 2, thăng hạng lên LCP) |
| `teams.csv` | 31 đội: 10 đội LCK, 19 đội dự CKTG 2026, 6 đội VCS |
| `players.csv` | 155 tuyển thủ: `ovr` cùng các cột tuỳ chọn `laning/mechanics/macro/teamfight/mental` và tướng tủ |

- Từ một vài cột, importer tự sinh đủ 17 chỉ số chi tiết và bể tướng. Biến thiên dựa trên tên tuyển thủ nên lần import nào cũng ra cùng kết quả.
- **Chỉ số là ước lượng** của mình dựa trên thành tích, không phải dữ liệu chính thức.
- Cột `verified = N` đánh dấu roster mà các nguồn tin không khớp nhau, gồm: BRO, DRX, DNS, TES, C9, CFO, MVK và toàn bộ VCS. Cần kiểm tra lại với Leaguepedia hoặc Liquipedia.

## 2. AI Ban/Pick và series (`engine/src/draftAI.ts`, `series.ts`)

- **Thứ tự pro:** cấm 6 (B R B R B R) → chọn B1 R1 R2 B2 B3 R3 → cấm 4 (đỏ trước) → chọn R4 B4 B5 R5.
- **Giá trị một pick:** meta + mastery + tướng tủ + khắc chế đường + khắc chế toàn cục + synergy. Nếu là **pick mù**, bị trừ theo mức tướng đó có thể bị khắc chế bởi những tướng đối thủ còn chọn được.
- **Cấm:** AI cấm tướng mà đối thủ sẽ có giá trị cao nhất, thường là tướng tủ của họ.
- **Trình độ ban huấn luyện** (`quality` 0..1) quyết định độ lệch khỏi phương án tối ưu.
- **Fearless Draft** (luật từ 2025): tướng đã dùng trong series bị khoá. Nếu hết tướng đúng vị trí, AI được chọn trái vị trí nhưng bị phạt.
- **Series Bo1/Bo3/Bo5:** đội thua ván trước được chọn bên xanh. Tinh thần ±1 mỗi ván, mệt mỏi +4 mỗi ván.

## 3. Mùa giải (`season.ts`, `career.ts`)

```
Vòng bảng (vòng tròn 2 lượt, Bo3) → Playoffs top 4 (Bo5) → CKTG:
  Play-In 4 đội (hạt giống cuối của LEC, LCS, LCP, CBLOL; Bo5) → 1 đội đi tiếp
  Swiss 16 đội (Bo1; trận quyết định đi tiếp/bị loại đánh Bo3) → 8 đội
  Tứ kết → Bán kết → Chung kết (Bo5)
→ Nghỉ giữa mùa: ban lãnh đạo đánh giá, vô địch VCS lên LCP, đội bét LCP xuống VCS
```

- Suất CKTG lấy theo dữ liệu thật: LCK 4, LPL 4, LEC 3, LCS 3, LCP 3, CBLOL 2.
- Thống kê từng tuyển thủ: K/D/A, KDA, DPM, CSD@15, GD@15 và các tướng đã chơi.
- **HLV:** ban lãnh đạo đặt mục tiêu theo sức mạnh đội. Độ tín nhiệm về 0 thì bị sa thải.
- **Chủ CLB:**
  - Có số dư, quỹ lương theo trình độ (70 ≈ $3.4k/tháng, 90 ≈ $39k/tháng), tài trợ hằng tuần và tiền thưởng.
  - Âm quá $500k thì phá sản.
- Toàn bộ `Career` là JSON thuần, khoảng 370KB mỗi mùa, lưu được vào localStorage hoặc IndexedDB.
- Tốc độ: khoảng 4 giây mô phỏng cho mọi giải của một mùa (Node). Trên web có hiện trạng thái "Đang mô phỏng".

## 4. Giao diện (`app/`)

React + Vite, thiết kế cho điện thoại trước, có giao diện sáng và tối, lưu tự động vào localStorage.

| Màn hình | Nội dung |
|---|---|
| Tạo sự nghiệp | Chọn vai HLV / Chủ CLB → giải → đội |
| Tổng quan | Trận tiếp theo (Vào trận / Mô phỏng nhanh), mục tiêu hoặc tài chính, tin mới |
| Lịch & BXH | Bảng xếp hạng, thành tích Swiss, lịch và kết quả mọi giải |
| Đội hình | 4 nhóm chỉ số, phong độ, tinh thần, top 5 tướng, lương |
| Thống kê | Bảng tuyển thủ theo KDA / DPM / CSD@15, lọc theo giải |
| Trận đấu | Ban/Pick có gợi ý → chọn lối chơi → chỉ đạo từng giai đoạn → bảng chỉ số → ván tiếp theo |

```bash
cd app && npm install
npm run dev            # http://localhost:5173 (mở được từ điện thoại cùng mạng)
npm run build          # bản web tĩnh trong app/dist
npm run build:single   # gói thành 1 file HTML trong app/dist-single
```

## 5. Việc tiếp theo

- Chuyển nhượng và hợp đồng (Chủ CLB), học viện, scouting thần đồng.
- Phát triển tuyển thủ theo tuổi và tiềm năng (cần thêm cột `birth_year` vào CSV).
- Chạy engine trong Web Worker để mô phỏng không chặn giao diện.
- Đóng gói PWA + Capacitor để phát hành trên kho ứng dụng.
