# 05 — Chuyển nhượng, tuyển trạch, phát triển tuyển thủ, pixel art và PixelLab

## 1. Hợp đồng và chuyển nhượng (`engine/src/market.ts`, `economy.ts`)

Mỗi tuyển thủ có thêm `birthYear`, `potential` (ẩn) và `contract { salary, until }`.
- **Năm sinh:** lấy từ cột `birth_year` trong CSV. Mình đã điền năm sinh cho khoảng 50 tuyển thủ nổi tiếng; những người còn lại được ước lượng.
- **Tiềm năng:** lấy từ cột `potential` nếu có. Nếu không, tiềm năng được ước lượng theo tuổi và chỉ số hiện tại.

| Khái niệm | Công thức / luật |
|---|---|
| Giá trị | `15k × 1.16^(ovr−60) × hệ số tuổi × (1 + 4% mỗi điểm còn có thể phát triển)` → 70 ≈ $66k, 90 ≈ $1.3M |
| Phí giải phóng | Giá trị × (1 + 25% mỗi năm hợp đồng còn lại); hết hạn thì miễn phí |
| Lương đòi hỏi | Lương thị trường. Cộng tối đa 40% nếu sang đội yếu hơn, +15% nếu về giải hạng 2, +10% nếu tuyển thủ từ 27 tuổi chỉ được ký 1 năm |
| Kỳ chuyển nhượng | Chỉ mua được tuyển thủ còn hợp đồng trong "Nghỉ giữa mùa". Tuyển thủ tự do và thần đồng ký được bất cứ lúc nào |
| HLV | Bị giới hạn bởi ngân sách chuyển nhượng và trần quỹ lương do ban lãnh đạo cấp mỗi mùa |
| Chủ CLB | Trả bằng số dư; có thể nâng cấp bộ phận tuyển trạch |
| Dự bị | Tối đa 3 người. Có thể đưa lên đá chính hoặc giải phóng (trợ cấp 3 tháng lương) |
| Sang mùa mới | Hợp đồng hết hạn thì tuyển thủ rời đội. AI gia hạn hoặc thả người, rồi ký tuyển thủ tự do để vá vị trí yếu |

## 2. Tuyển trạch (`scouting.ts`)

- **Thần đồng:** mỗi mùa xuất hiện 8 thần đồng hư cấu 16–18 tuổi từ 7 khu vực, có điểm LP rank Thách Đấu.
  - Tiềm năng phần lớn ở mức 72–85.
  - Khoảng 20% đạt 85–91, khoảng 4% là "quái vật" 91–97.
- **Ước lượng tiềm năng:**
  - Lúc chưa có thông tin, khoảng ước lượng rộng ±15.
  - Mỗi lần theo dõi tăng `15 + 7 × cấp tuyển trạch` % thông tin.
  - Khoảng luôn chứa giá trị thật và cố định theo id, nên không nhảy số giữa các lần xem.
- **Lượt tuyển trạch:** cộng 1 lượt sau mỗi tuần thi đấu, tối đa 6 lượt.
- Thần đồng đủ 19 tuổi mà chưa ai ký thì thành tuyển thủ tự do.

## 3. Phát triển (`development.ts`)

- **Tập luyện hằng tuần** theo giáo án: Kỹ năng / Tư duy / Giao tranh / Tâm lý / Cân bằng.
  - Tốc độ tỉ lệ với khoảng còn có thể phát triển; trẻ dưới 22 tuổi tiến bộ nhanh hơn.
- **Cuối mùa, theo tuổi:**

  | Tuổi | Thay đổi |
  |---|---|
  | ≤19 | Lấy 45% khoảng còn lại tới tiềm năng |
  | 20–21 | 32% |
  | 22–23 | 20% |
  | 24–25 | 8% |
  | 26–27 | Bắt đầu đi xuống |
  | 28–29 | Giảm nhanh hơn |
  | 30+ | Giảm mạnh nhất |

  - Kỹ năng cá nhân giảm nhanh gấp 1,5 lần; tâm lý vẫn tăng theo tuổi.
- **Giải nghệ:** từ 30 tuổi, khả năng giải nghệ tăng khi trình độ đi xuống.
- **Kiểm chứng:** mô phỏng 4 mùa liên tiếp, chỉ số trung bình LCK giữ ở 84–85, không bị lạm phát.

## 4. Pixel art

- **Font:** VT323 cho chữ (hỗ trợ tiếng Việt), Press Start 2P cho logo, số và tên đội.
- **Khung:** viền pixel cứng, đổ bóng khối; nút có hiệu ứng nhấn xuống.
- **Thanh chỉ số:** 10 ô vuông.
- **Màu đội:** thẻ tên đội theo màu áo, lấy từ cột `colors` trong `teams.csv`.
- **Avatar 16×16:** vẽ theo id tuyển thủ, gồm màu áo đội, kiểu tóc, màu da, kính và tai nghe gaming (`app/src/avatar.tsx`).
- **Màn hình trận:**
  - Bảng tỉ số kiểu truyền hình và thanh tương quan vàng.
  - Bản đồ mini Summoner's Rift 48×48: trụ còn đứng mang màu đội, trụ đã vỡ thành đá xám (`Minimap.tsx`).
- **Ban/Pick:** ô tướng có ký hiệu màu theo loại sát thương (AD / AP / hỗn hợp).

## 5. PixelLab (`engine/tools/pixellab/`)

Chân dung pixel art 64×64 cho từng tuyển thủ được tạo bằng [PixelLab](https://www.pixellab.ai) qua API v1 `generate-image-pixflux`.
- Định dạng request lấy theo SDK chính thức `@pixellab-code/pixellab` 1.0.2.
- Client tự viết, không phụ thuộc thư viện nào.

```bash
export PIXELLAB_SECRET=...                       # API key trong tài khoản PixelLab
npm run portraits -- --dry-run                   # xem mô tả + số lượng, không tốn tiền
npm run portraits -- --team T1,GEN --limit 10    # tạo thử 10 ảnh
npm run portraits                                # tạo cho mọi tuyển thủ chưa có ảnh
```

- **Đầu ra:**
  - Ảnh được lưu ở `app/public/portraits/<playerId>.png`.
  - `manifest.json` được cập nhật sau mỗi ảnh, nên dừng giữa chừng vẫn giữ kết quả.
  - Ảnh đã có sẽ được bỏ qua, trừ khi dùng `--force`.
- **Lỗi tạm thời:** khi API báo gọi quá nhanh hoặc lỗi máy chủ, công cụ tự thử lại tối đa 4 lần, thời gian chờ tăng dần.
- **Hiển thị trong game:** game tự đọc manifest. Tuyển thủ nào có ảnh PixelLab thì dùng ảnh đó, ai chưa có thì dùng avatar 16×16 tự vẽ.
- **Mô tả gửi đi:**
  - Không chứa tên thật và không mô tả ngoại hình người thật.
  - Nhân vật là avatar cách điệu theo màu áo đội.
  - Seed cố định theo id tuyển thủ, nên mỗi lần chạy lại ra cùng một nhân vật.
- **Kiểm thử:** `engine/test/pixellab.test.ts` dùng fetch giả lập.

**Lưu ý môi trường cloud:**
- Mạng mặc định chặn `api.pixellab.ai`. Muốn chạy ở đây, cần thêm host này vào *Allowed domains* trong cài đặt Network access của environment, và đặt `PIXELLAB_SECRET` làm secret của environment.
- Cách khác là chạy lệnh trên máy cá nhân.
