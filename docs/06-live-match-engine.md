# 06 — Trận đấu thời gian thực trên bản đồ 3 đường (kiểu Teamfight Manager 2)

Code: `engine/src/live/` (`map.ts`, `kits.ts`, `sim.ts`); trình xem: `app/src/LiveViewer.tsx`.
Kiểm tra cân bằng: `npm run live-balance [số trận]`.

## 1. Mô hình

| Thành phần | Mô tả |
|---|---|
| Bản đồ | 200×200 đơn vị, đối xứng tâm. Đội xanh ở góc dưới-trái, đội đỏ ở góc trên-phải. 3 đường, sông chéo, 6 bãi quái, hang Rồng (dưới), hang Baron (trên) |
| Công trình | Mỗi đường 3 trụ (ngoài → trong → nhà lính), 2 trụ nhà chính, nhà chính. Phải phá theo thứ tự |
| Lính | Mỗi 25 giây mô phỏng ra 4 lính mỗi đường (2 cận chiến, 2 đánh xa), mạnh dần theo thời gian |
| Đồng hồ | Bước 0,1 giây; **1 giây mô phỏng = 3 giây đồng hồ trận**. Mỗi lính tính 4 CS |
| Mục tiêu | Rồng (phút 5, mỗi con +4% sức mạnh, Linh Hồn ở con thứ 4), Baron (phút 19, +25% sức mạnh và tăng mạnh sát thương lên trụ trong 3 phút) |
| Kết thúc | Vỡ nhà chính. Nếu tới phút 60 vẫn chưa xong thì tính điểm theo trụ, mạng và vàng |

## 2. Tướng

- **Giữ tên thật.** Bộ chiêu không sao chép kỹ năng gốc mà mô hình hoá theo **7 nhóm**, suy ra từ hồ sơ của tướng:
  - Đỡ đòn, Đấu sĩ, Sát thủ, Pháp sư, Xạ thủ, Hỗ trợ hồi máu, Hỗ trợ khống chế.
- **Mỗi nhóm có:** đánh thường, một chiêu có hồi chiêu và một chiêu cuối, ví dụ lao vào khống chế, phép diện rộng, kết liễu, hồi máu toàn đội.
- **Sức mạnh theo giai đoạn** lấy từ `early/mid/late_power` của tướng.
- **Tướng tủ:** mastery cao được thêm tối đa khoảng 6% sức mạnh.
- **Trên bản đồ:** tuyển thủ hiện bằng avatar pixel của chính họ, viền theo màu phe, kèm tên tướng. Mình không vẽ lại hình tướng của Riot.

## 3. AI tuyển thủ: chỉ số quyết định cách chơi

| Chỉ số | Ảnh hưởng |
|---|---|
| laning, cs_efficiency | Canh đòn cuối để ăn lính |
| mechanical_outplay, positioning | Hiệu suất giao tranh: đòn đánh trúng, chuỗi chiêu, né đòn; xạ thủ/pháp sư giữ khoảng cách khi bị áp sát |
| skillshot_accuracy | Tỉ lệ trúng chiêu định hướng; đối thủ có mechanical_outplay cao né tốt hơn |
| map_awareness, vision_control | Đánh giá giao tranh chính xác hơn (ít "nhiễu") |
| target_selection | Nhắm vào carry/mục tiêu yếu máu thay vì người đứng gần nhất |
| engage_timing | Đỡ đòn/khống chế mở giao tranh đúng lúc |
| rotation | Phản ứng nhanh với lệnh tập trung của đội |
| objective_control | Tranh Rồng/Baron, cướp mục tiêu khi hai đội cùng ở hang |
| composure, tilt_resistance, big_match, consistency | Mức "loạn" khi bị dẫn mạng hoặc đấu trận lớn |
| Phong độ / tinh thần | Nhân vào hiệu suất giao tranh |

**Bộ não đội**, chạy mỗi giây:
- Gọi tập trung đánh Rồng/Baron khi có lợi thế (tính theo số người còn sống, vàng và lối đánh được chọn).
- Đông hơn từ 2 người trở lên thì dồn ngay vào công trình gần nhất.
- Sau giai đoạn đi đường, cả đội dồn vào đường có trụ địch yếu nhất. Đường trên giữ đường biên; nếu chọn lối chơi Đẩy lẻ thì đường trên đẩy lẻ.

**Chỉ đạo của HLV, đổi được ngay trong trận:**
- Đi rừng ưu tiên đường nào.
- Mục tiêu ưu tiên: Rồng / Baron / Cân bằng.
- Lối đánh: An toàn / Bình thường / Mạo hiểm. Lối đánh đổi ngưỡng lao vào giao tranh và ngưỡng máu để về nhà.

## 4. Cân bằng hiện tại

| Kịch bản | Kết quả |
|---|---|
| Trận gương (cùng đội, cùng tướng) | 45–55% (không có lợi thế phe) |
| Đội +10 mọi chỉ số | 62,5% (80 trận, đổi bên luân phiên) |
| GEN vs FURIA | 95% (20 trận) |
| Thời lượng | ~34–39 phút đồng hồ trận |
| Mạng / trận | ~26–38 |
| CS/phút của người đi đường | ~4,4 |

**Hạn chế còn lại:**
- Ăn lính và tốc độ chốt trận vẫn thấp hơn LMHT thật. Muốn sát hơn cần đợt lính dày hơn, nhưng sẽ tốn CPU.
- Độ chênh giữa đội mạnh và yếu nhỏ hơn engine theo giai đoạn: tỉ lệ bất ngờ cao hơn.

**Hiệu năng:** khoảng 1,2–1,4 giây cho một trận chạy không vẽ hình. Vì vậy:
- Trận của người chơi dùng engine thời gian thực.
- Hàng trăm trận AI đấu AI trong mùa giải vẫn dùng engine theo giai đoạn (`match.ts`). Engine này cũng có trong trận đấu, ở lựa chọn "Nhanh theo 3 giai đoạn".

## 5. Việc tiếp theo

- Trang bị cụ thể (thay cho "vàng → chỉ số") và chiến thuật riêng cho từng tuyển thủ.
- Tầm nhìn/mắt, Sứ Giả, nhà lính hồi sinh, lính siêu cấp.
- Sprite tướng hoặc tuyển thủ 4 hướng có hoạt ảnh (PixelLab `rotate` và `animate-with-text`), khi phần chân dung bên phiên kia xong.
- Tối ưu: lưới không gian để dò mục tiêu, chạy mô phỏng trong Web Worker.

## 6. Giao diện kiểu Teamfight Manager 2

**Khung ứng dụng** (`app/src/Hub.tsx`):
- **Menu trái:** Tin tức, Đội hình & Tập luyện, Lịch thi đấu, Xếp hạng, Chuyển nhượng, Tuyển trạch, Thống kê, Ban lãnh đạo / Tài chính.
- **Thanh dưới cùng:** mùa giải và giai đoạn, kèm nút **Tiến hành ▶**. Nút này tự làm việc tiếp theo: vào trận, mô phỏng tiếp, hoặc sang mùa mới.
- **Xếp hạng:**
  - Có tab theo khu vực (LCK… VCS, CKTG).
  - Bảng gồm Trận / Thắng / Bại / Hiệu số ván / Hạ gục / Chết / Hỗ trợ / Ghi chú (Vào Playoffs, Vô địch, Á quân, Bị loại).
  - Playoffs và vòng loại trực tiếp CKTG hiện dạng sơ đồ nhánh; các vòng chưa đấu hiện "Chưa xác định".
  - Vòng Swiss hiện theo nhóm thành tích (3-0, 2-1…).
- **Huy hiệu đội:** hình khiên pixel theo màu áo đội và chữ viết tắt (`art/sprites.ts`). Không dùng logo thật.
- Trên màn hình hẹp, menu chuyển thành thanh cuộn ngang ở trên cùng.

**Màn hình trận** (`app/src/LiveViewer.tsx`):

| Thành phần | Mô tả |
|---|---|
| Địa hình | Ô gạch pixel vẽ bằng code (`art/terrain.ts`): đường lát đá, sông có gợn nước, rừng cây rậm làm tường, cỏ có hoa, hang quái, nền nhà theo màu phe |
| Nhân vật | Chibi 18×20 theo từng tuyển thủ (da, tóc, áo màu đội). Vũ khí theo nhóm tướng: khiên, kiếm, dao găm, trượng, cung, gậy phép, móc xích. Có bước chân và quay hướng |
| Công trình, quái | Trụ pha lê có chân đá; trụ vỡ thành đống đá. Nhà chính, quái rừng, Rồng và Baron đều có sprite riêng |
| Hiệu ứng | Đạn bay, nhát chém, vòng chiêu thường / chiêu cuối theo màu nhóm tướng, vòng hồi máu. Engine chỉ ghi các hiệu ứng này khi bật `recordFx` |
| Camera | Tự động kiểu truyền hình: bám cụm giao tranh ít nhất 4 giây; đổi sang điểm xa thì cắt cảnh thay vì trượt ngang. Kéo để tự di chuyển, nút ＋/－ để phóng to/thu nhỏ, bấm bản đồ mini để nhảy tới |
| Bảng hai bên | Cấp độ, tên tuyển thủ (tướng), thanh máu, đồng hồ hồi sinh |
| Nhật ký | Ý định của tuyển thủ ("Giao tranh, mục tiêu Azir!", "Đi gank đường giữa", "Máu thấp, lùi lại", "Tập trung đánh Rồng"…) và các pha hạ gục |
| Điều khiển | Tạm dừng, tốc độ x1–x16, Xem kết quả ngay, chỉ đạo của HLV ngay trong trận |

## 7. Bản đồ 3D (mặc định)

- **Nguồn model:** Summoner's Rift 3D từ nhánh `ccr-c98a3a35-a9bp5p`, gồm model và `map_data.json`. Chi tiết ở `data/map3d/README.md`.
- **Đồng bộ với engine:** engine (`live/map.ts`) đọc `map_data.json` nên đường đi, 22 trụ, nhà chính, bệ đá, 12 bãi quái và hang Rồng/Baron trùng đúng vị trí trên model.
  - Toạ độ đổi: `x = (mx + 96)·200/192`, `y = (mz + 96)·200/192`.
  - Tên đường phe Đỏ trong file gốc đặt theo đối xứng tâm, engine đổi lại theo đường thật.
- **Vẽ** (`app/src/rift3d.ts`):
  - three.js vẽ model, camera nghiêng 56° nhìn từ phía nam như LMHT.
  - Tuyển thủ, lính, quái và hiệu ứng vẽ trên một lớp 2D phủ lên, chiếu theo camera và đứng đúng cao độ mặt đất. Cao độ lấy từ lưới `Terrain`.
  - Trụ, nhà lính và nhà chính bị phá thì ẩn node 3D tương ứng.
- **Dung lượng:** model nén bằng gltf-transform (meshopt + webp), 35 MB → 4,3 MB (`app/public/map3d/rift.glb`).
- **Chế độ 2D:** nút "3D/2D" trên màn hình trận chuyển về bản đồ pixel. Máy không có WebGL hoặc không tải được model thì game tự dùng 2D.
- **Cân bằng sau khi đổi bản đồ:**
  - 60 trận gương: phe xanh thắng 45%, không lệch phe.
  - Đội +10 mọi chỉ số thắng 81%; GEN thắng FURIA 88% (16 trận).
