# Dữ liệu Liên Minh Huyền Thoại

Chạy `python3 fetch_lol_data.py` để lấy bản mới nhất (hoặc `python3 fetch_lol_data.py 16.21.1 en_US`).
Cần truy cập `ddragon.leagueoflegends.com` và `raw.communitydragon.org`.

- `TRANG_BI.md` — toàn bộ trang bị Summoner's Rift theo nhóm: giá, công thức ghép, chỉ số, nội tại, kích hoạt.
- `TUONG.md` — bảng chỉ số tướng (cấp 1 → cấp 18), nội tại và 4 kỹ năng của từng tướng.
- `img/` — ảnh tải từ Data Dragon (≈22 MB, 1422 file):
  `items/<id>.png` (64 px), `champions/<Id>.png` (ô vuông 120 px), `loading/<Id>.jpg` (ảnh dọc màn hình chờ, hợp làm thẻ tướng),
  `passives/<Id>.png`, `spells/<Id>_<Q|W|E|R>.png`. Đường dẫn nằm ở trường `image` / `loading_image` trong JSON
  (kèm `image_url` gốc).
- `items.json` / `champions.json` — cùng dữ liệu dạng máy đọc cho game.
  - Chỉ số tướng: `[gốc, mỗi cấp]`; tính ở cấp n: `gốc + mỗi_cấp × (n−1) × (0.7025 + 0.0175 × (n−1))`.
    Tốc đánh: `gốc × (1 + mỗi_cấp × (n−1) × (0.7025 + 0.0175 × (n−1)))`.
  - `info`: điểm 0–10 của Riot cho công / thủ / phép / độ khó, dùng tạm làm chỉ số cho game manager.

Nguồn: Riot Data Dragon (văn bản tiếng Việt, chỉ số); SMCK mỗi cấp lấy từ file game qua CommunityDragon
vì Data Dragon đang để 0 cho mọi tướng. Một số nội tại trong Data Dragon chỉ mô tả bằng chữ, không ghi con số.

Ảnh và văn bản thuộc bản quyền Riot Games; dùng được cho dự án fan/phi thương mại theo chính sách "Legal Jibber Jabber" của Riot.

Trong nhánh này chỉ giữ phần trang bị (`items.json`, `TRANG_BI.md`, `img/items/`). Game đọc chúng qua
`engine/tools/import-lol-items.ts` + `item_keys.csv` (mã engine và hiệu ứng mô phỏng cho từng món), xem `docs/06-live-match-engine.md` mục 8.
