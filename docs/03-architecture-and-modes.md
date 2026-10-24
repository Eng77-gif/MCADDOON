# 03 — Kiến trúc kỹ thuật, Data Pack và hai chế độ chơi

## 1. Tech stack (Web + Mobile)

| Lớp | Lựa chọn | Lý do |
|---|---|---|
| Ngôn ngữ | **TypeScript** cho toàn bộ dự án | Một ngôn ngữ chạy trên web, mobile và Node (test, cân bằng hàng loạt) |
| Engine | `engine/`: TypeScript thuần, không phụ thuộc DOM | Chạy trong **Web Worker** để mô phỏng cả mùa giải không làm giật UI; test bằng `node --test` |
| UI | React + Vite | Game quản lý chủ yếu là bảng, danh sách, form: thế mạnh của web. Không cần Unity |
| State | Zustand | Nhẹ, dễ chuyển trạng thái save game |
| Lưu game | IndexedDB (Dexie), local-first | Chơi offline, không tốn chi phí server. Có thể thêm cloud save sau |
| Mobile | **PWA trước**, sau đó đóng gói **Capacitor** lên App Store / Google Play | Một codebase. Thiết kế UI từ khổ 360px trở lên |
| Backend (sau này) | Supabase hoặc tương tự | Chỉ cần khi có cloud save, bảng xếp hạng online, cập nhật data pack |

`app/` (React + Vite) import trực tiếp `engine/src`. Xem docs/04.

```
MCADDOON/
├─ engine/          lõi mô phỏng (TS thuần) + test + script cân bằng
├─ data/packs/      dữ liệu tướng, đội, tuyển thủ, giải đấu (JSON)
├─ app/             React + Vite (PWA + Capacitor ở bước sau)
└─ docs/
```

## 2. Data Pack: tên thật nằm trong dữ liệu, không nằm trong code

Mọi tên tướng, giải đấu, đội và tuyển thủ đều nằm trong `data/packs/<id>/`. Engine chỉ đọc ID và chỉ số.

```
data/packs/demo/
├─ pack.json        { id, name, patch, files }
├─ champions.json   30 tướng thật, chỉ số theo patch 26.21
└─ teams.json       2 đội demo
```

Pack `demo` hiện dùng **tướng thật** và **đội/tuyển thủ tạm thời**. Pack dữ liệu thật (LCK, LPL, LEC, LCS, VCS, CKTG với tuyển thủ thật) sẽ là một pack riêng, ví dụ `data/packs/real-2026/`.

**Lưu ý pháp lý khi dùng tên thật.** Riot có chính sách cho dự án fan ("Legal Jibber Jabber"), cho phép dùng tài sản LMHT trong dự án **miễn phí** kèm một số điều kiện. Tên tuyển thủ, logo đội và logo giải lại thuộc quyền của chính tuyển thủ, CLB và ban tổ chức giải, chính sách của Riot không bao phủ hết. Vì vậy:

1. Đọc bản chính sách hiện hành của Riot trước khi phát hành công khai.
2. Không thu tiền (quảng cáo, mua trong game) trước khi hỏi ý kiến luật sư.
3. Nhờ kiến trúc Data Pack, nếu bị yêu cầu gỡ thì chỉ cần thay pack, không phải sửa code. Football Manager và PES từng xử lý tên không có bản quyền theo cách này.

## 3. Hai chế độ: HLV và Chủ CLB

Hai chế độ dùng **cùng một engine**, chỉ khác người chơi điều khiển lớp nào.

```ts
interface Career {
  mode: "COACH" | "OWNER";
  teamId: string;
  season: number;
  // OWNER: người chơi đặt; COACH: ban lãnh đạo (AI) đặt và đánh giá
  budget: { wages: number; transfers: number; facilities: number };
  boardObjectives: Objective[];      // chỉ COACH: "vào playoffs", "top 2"...
  headCoach?: StaffId;               // chỉ OWNER: HLV trưởng có thể là AI được thuê
}
```

| Tính năng | HLV | Chủ CLB |
|---|---|---|
| Ban/Pick, chiến thuật, chỉ đạo trong trận | ✅ | ✅ tự làm, hoặc giao cho HLV AI thuê về |
| Lịch tập luyện, phát triển tuyển thủ | ✅ | ✅ / giao cho staff |
| Chiêu mộ, đàm phán hợp đồng | Đề xuất, ban lãnh đạo duyệt trong ngân sách | ✅ toàn quyền |
| Quỹ lương | Bị giới hạn bởi ngân sách được cấp | ✅ tự đặt |
| Tài chính: nhà tài trợ, merch, gaming house, học viện | ❌ | ✅ |
| Thuê/sa thải HLV, staff | ❌ | ✅ |
| Có thể bị sa thải | ✅ nếu không đạt mục tiêu | ❌, nhưng có thể phá sản |

Gợi ý triển khai: làm chế độ **HLV trước** vì đó là phần lõi. Chế độ Chủ CLB thêm lớp tài chính lên trên. Khi người chơi là Chủ CLB và giao trận cho HLV AI, engine dùng chỉ số của HLV đó để tự chọn draft và chỉ đạo.
