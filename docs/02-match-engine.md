# 02 — Engine mô phỏng trận theo giai đoạn

Code: [`engine/src/match.ts`](../engine/src/match.ts). Chạy thử: `npm run demo [seed]`, kiểm tra cân bằng: `npm run balance [số trận]`.

## 1. Vòng đời một trận

```
new MatchSim(champDb, { patch, stagePressure, seed }, [setupA, setupB])
   │
   ├─ playPhase(orders?)  → EARLY  (0'–15')   đi đường, rừng ghé, 2 Rồng, Sứ Giả, trụ ngoài
   │      ↑ HLV xem báo cáo, đổi chỉ đạo
   ├─ playPhase(orders?)  → MID    (15'–25')  3 lượt giao tranh quanh Rồng / Baron, công trụ, đẩy lẻ
   │      ↑ HLV đổi chỉ đạo
   └─ playPhase(orders?)  → LATE   (25'+)     mỗi 3 phút một lượt cho tới khi vỡ nhà chính (tối đa 60')
result() → bảng chỉ số (K/D/A, CS, DPM, CSD@15, GD@15), sự kiện, báo cáo từng giai đoạn
```

- **Có seed**: cùng seed thì ra cùng trận, dùng được cho replay, test, và để người chơi "xem lại".
- **UI dừng giữa các giai đoạn**: hợp với mobile, mỗi giai đoạn là một màn hình gồm báo cáo và 3 nút chỉ đạo.
- Engine trả về **sự kiện có cấu trúc**; bình luận tiếng Việt nằm riêng trong `format.ts` để sau này dịch sang ngôn ngữ khác.

## 2. Sức mạnh và cách phân thắng thua

**Rating tuyển thủ ở giai đoạn** (`ratings.ts`):

```
skill(EARLY) = 0.5·laning + 0.3·avg(mechanics) + 0.2·cs_efficiency
skill(MID)   = 0.35·avg(macro) + 0.35·avg(teamfight) + 0.3·avg(mechanics)
skill(LATE)  = 0.45·avg(teamfight) + 0.25·avg(macro) + 0.3·composure

rating = skill × condition(form, morale, fatigue, big_match) × (0.8 + 0.003·mastery) × (0.85 + 0.03·champ_phase_power)
```

**Sức mạnh đội** = Σ rating × các hệ số:

| Hệ số | Giá trị |
|---|---|
| Meta + synergy của draft (mastery/khắc chế đã nằm trong rating nên không cộng lại) | +0.4% mỗi điểm chênh |
| Chênh lệch vàng | +1.8% mỗi 1.000 vàng, tối đa ±15% |
| Rồng / Linh Hồn | +1.5% mỗi con, Linh Hồn +6% |
| Baron / Rồng Ngàn Tuổi | +10% / +15% khi buff còn |
| Chỉ đạo rủi ro | SAFE ×0.97, AGGRESSIVE ×1.04 |
| Lối chơi | TEAMFIGHT, PICK_OFF (chỉ giữa trận), POKE (công trụ, mục tiêu), SPLIT_1_4 (×0.97 khi giao tranh nhưng ăn trụ đường biên) |
| Ưu tiên mục tiêu trùng với mục tiêu đang tranh | +8% |

**Phân thắng thua** (giao tranh, mục tiêu):

```
power_noisy = power × (1 + N(0,1) × volatility)     // volatility tăng khi consistency thấp, AGGRESSIVE ×1.5, SAFE ×0.7
P(A thắng) = logistic( 4 · ln(power_A / power_B) )   // mạnh hơn 10% ≈ 60%
```

**Chống "lăn cầu tuyết" quá đà**: đội đang thua vàng mà thắng giao tranh sẽ nhận bounty bằng 12% khoảng cách vàng, tối đa 1.500.

## 3. Chỉ đạo của HLV

| Chỉ đạo | Lựa chọn | Tác dụng |
|---|---|---|
| `laneFocus` (Camp đường) | TOP / MID / BOT / NONE | Đầu trận: rừng góp 35% rating vào đường đó, tăng số kill ở đường. NONE: rừng farm thêm 400 vàng |
| `objective` | DRAGON / HERALD_BARON / BALANCED | +8% khi tranh mục tiêu đó; HERALD_BARON kéo giao tranh giữa trận sang Baron |
| `risk` | SAFE / NORMAL / AGGRESSIVE | Đổi sức mạnh, biên độ ngẫu nhiên và số kill mỗi giao tranh |

## 4. Mục tiêu cân bằng và kết quả hiện tại (2000 trận)

| Kịch bản | Mục tiêu | Hiện tại |
|---|---|---|
| Trận gương | ~50% | 49.1% |
| Mọi chỉ số +3 | 60–70% | 65.3% |
| Mọi chỉ số +8 | 80–90% | 83.8% |
| Thời lượng trung bình | 30–34' | 31–34' |
| Tổng hạ gục mỗi trận | 20–30 | 22–28 |
| Tỷ lệ lội ngược (thua vàng ở phút 15 nhưng thắng) khi hai đội ngang nhau | 30–40% | 39% |

Test tự động (`npm test`) chặn các khoảng này lại để mỗi lần chỉnh số không phá vỡ cân bằng mà không ai biết.

## 5. Việc tiếp theo cho engine

- AI Ban/Pick (ban tướng tủ đối thủ, pick counter ở lượt cuối).
- Mệt mỏi và tâm lý thay đổi trong cả series Bo3/Bo5 (thua ván 1 thì morale giảm).
- Chỉ đạo chi tiết hơn ở cuối trận (ép Baron, đổi mục tiêu, chia 1-3-1).
- Phản ánh chỉ số `vision_control` và `objective_control` vào việc tranh Rồng/Baron.
