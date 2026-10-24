# 01 — Mô hình dữ liệu & Công thức Ban/Pick (Prototype)

## 1. Nguyên tắc thiết kế dữ liệu

| Nguyên tắc | Lý do |
|---|---|
| Tách **chỉ số gốc** (`attributes`) khỏi **trạng thái động** (`dynamic_state`) | Chỉ số gốc thay đổi theo mùa (training, tuổi). Form/Morale/Fatigue thay đổi theo tuần/trận. Engine chỉ đọc "chỉ số hiệu dụng" = gốc × hệ số trạng thái. |
| Có lớp **ẩn** (`hidden`) | Tạo chiều sâu cho Scouting: người chơi chỉ thấy *ước lượng* potential, độ chính xác tăng theo trình độ scout. |
| Tướng gắn dữ liệu **theo patch** (`patch_stats`) | Meta thay đổi mà không phải sửa dữ liệu gốc của tướng. |
| `profile` tướng dùng cùng thang 0–10 với các trục chiến thuật | Cho phép chấm điểm đội hình ↔ Lối chơi bằng một phép trung bình đơn giản. |
| Có `schema_version` | Save game sẽ sống qua nhiều bản cập nhật. |

File mẫu: [`data/sample_player.json`](../data/sample_player.json), [`data/sample_champion.json`](../data/sample_champion.json).

### Chỉ số hiệu dụng của tuyển thủ (dùng ở mọi engine)

```
effective(attr) = base(attr)
                × (1 + 0.02·form)              // form ∈ [-10, 10]  → ±20%
                × (1 + 0.01·morale)            // morale ∈ [-10, 10] → ±10%
                × (1 − 0.004·max(0, fatigue−40))
                × pressure_factor              // chỉ áp dụng ở trận lớn
pressure_factor = 1 − (1 − big_match/100) · stage_pressure   // stage_pressure: 0 (vòng bảng) .. 0.3 (CKTG)
```

## 2. Công thức tỷ lệ thắng giai đoạn Ban/Pick

Ý tưởng: mỗi đội có một **Draft Score** (điểm cộng dồn). Chênh lệch điểm đi qua hàm **logistic** để ra xác suất. Logistic được chọn vì: luôn nằm trong (0,1), chênh lệch nhỏ thì tuyến tính, chênh lớn thì bão hoà — giống cách Elo hoạt động.

### 2.1 Điểm cho mỗi vị trí (slot)

```
Slot(p, c) = Meta(c) + Mastery(p, c) + LaneCounter(c, đối thủ cùng đường) + GlobalCounter(c)

Meta(c)          = TierPoints[tier(c, patch)]            // S=+3, A=+1.5, B=0, C=−1.5, D=−3
Mastery(p, c)    = 1.5 · (mastery − 70) / 10  (+1 nếu là tướng tủ)
                   // tướng ngoài bể tướng: mastery = 40 → −4.5 điểm
LaneCounter      = 1.0 · M[c][đối thủ]                     // M ∈ [−5, +5], M[a][b] = −M[b][a]
GlobalCounter    = 0.25 · Σ M[c][e]  với e là 4 tướng địch còn lại
```

### 2.2 Điểm cấp đội

```
Synergy   = 0.5 · Σ syn(a, b)   trên mọi cặp tướng trong đội     // syn ∈ [0, 3]
TacticFit = 0.6 · (avg(profile[các trục của Lối chơi]) − 5)

  TEAMFIGHT → teamfight, engage
  SPLIT_1_4 → split_push, waveclear
  POKE      → poke, disengage
  PICK_OFF  → pick_potential, mobility

DraftScore = Σ Slot + Synergy + TacticFit
```

### 2.3 Ra xác suất

```
P(A thắng | draft) = clamp( 1 / (1 + e^(−(D_A − D_B) / 15)), 0.20, 0.80 )
```

- `SCALE = 15`: chênh 15 điểm ≈ 73% — một draft "thắng rõ".
- `clamp [0.20, 0.80]`: draft **không bao giờ** quyết định trận; phần còn lại thuộc về kỹ năng tuyển thủ và chỉ đạo trong trận.

### 2.4 Cách nối vào Match Engine

Không dùng thẳng `P_draft` làm kết quả trận. Thay vào đó đổi nó thành một **lợi thế** nhân vào sức mạnh từng giai đoạn:

```
draft_edge = P_draft − 0.5                       // ∈ [−0.3, +0.3]
phase_power[A][phase] *= 1 + 0.15·draft_edge·phase_weight(comp, phase)
```

`phase_weight` lấy từ `early_power / mid_power / late_power` của đội hình, nên đội hình mạnh đầu game sẽ có lợi thế draft chủ yếu ở Early.

### 2.5 Ví dụ chạy thử

```
$ python3 prototype/draft_winrate.py
Team A draft score:  29.78  (synergy 2.00, tactic 0.78)
Team B draft score:  13.04  (synergy 0.00, tactic 0.54)
P(A thắng | draft) = 75.3%
Nếu A pick SYLAS (meta S, mastery 85): P = 70.0%
Nếu A pick KARMA (không có trong bể tướng): P = 57.4%
```

Điều này cho thấy thiết kế mong muốn: **tướng tủ có mastery cao > tướng meta S** và **pick ngoài bể tướng bị phạt nặng**, tạo ra lựa chọn chiến thuật thật sự cho người chơi.

### 2.6 Các núm chỉnh (tuning)

Tất cả hằng số nằm ở đầu `prototype/draft_winrate.py`. Bước tiếp theo nên là chạy hàng nghìn draft ngẫu nhiên để kiểm tra phân phối `P_draft` (mục tiêu: đa số trận nằm trong khoảng 40–60%).

### 2.7 Mở rộng sau prototype

- **Thứ tự pick**: pick cuối được thấy đối thủ → AI có lợi thế counter; tướng blind-pick an toàn nên có `blind_safety`.
- **Ban phân tích**: AI ban dựa trên `mastery × presence` của tướng tủ đối thủ.
- **Đa dạng sát thương**: phạt nếu đội hình >80% cùng loại sát thương (AP/AD).
