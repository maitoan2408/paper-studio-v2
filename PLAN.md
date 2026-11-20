# Paper Studio v2 — Kế hoạch dự án

> File này là nguồn sự thật duy nhất cho kế hoạch. Agent mới: đọc hết file này trước khi làm bất cứ việc gì, rồi làm đúng mốc đang mở. Không tạo file kế hoạch khác.

## 0. Mô tả ngắn (dùng cho GitHub)

**Paper Studio v2** — studio làm phim hoạt hình 2D/2.5D phong cách cắt giấy (paper-cut, multiplane, shadow-box) chạy bằng code. Kịch bản → storyboard → phim MP4 1080p, tất định, mở rộng hoàn toàn bằng dữ liệu (art pack, rig, hành động, phim là file JSON). Không dùng API tạo hình/video.

## 1. Mục tiêu

Một workflow **tái sử dụng được** để làm phim **thực sự đẹp**:

```

kịch bản → storyboard (có revision) → film.json → lấy mẫu từng frame → render Chromium/Three.js → MP4 → audit → người duyệt

```

- Thêm nhân vật, đạo cụ, hành động, cảnh, phim **bằng dữ liệu**, không viết code riêng cho từng phim.

- Cùng input luôn ra cùng video (tất định, tua frame ngẫu nhiên được).

- AI (nếu dùng) chỉ lập kế hoạch và gọi các bộ thực thi đã kiểm tra; không sinh code chạy lúc render.

**Không làm:** 3D đầy đủ, gọi API tạo ảnh/video trả phí, chỉnh tay từng frame, phim dài trước khi workflow ổn.

## 2. Bài học từ repo cũ (đọc kỹ — lý do có repo mới)

Repo cũ: `maitoan2408/ai-animation-studio-research-content`, nhánh `codex/m6-unified-integration-20261118`, commit tham chiếu `006d629`.

| Chuyện đã xảy ra | Nguyên nhân gốc | Quy tắc cho repo mới |

| --- | --- | --- |

| 8 thế hệ kế hoạch chồng nhau (P, Q, U, F, M, G, R…) | Mỗi lần thất bại lại mở tầng kế hoạch mới | Một file kế hoạch (file này). Thất bại thì sửa trong mốc đó |

| Engine chỉ làm được một kiểu cảnh "đứng cầm–đặt đồ vật" | Xây cho một cảnh rồi tổng quát hóa ngược | Ngay mốc hành động đầu tiên phải có **≥2 kiểu hành động, ≥2 nhân vật** |

| Rig có hằng số chỉnh theo 2 nhân vật (hông 258, cổ chân -35/48, độ dài xương) | Rig viết trong code | **Rig là dữ liệu** trong art pack; code không có số đo cơ thể |

| Nhiều vòng sửa code cho lỗi nhìn thấy (khuỷu lộ đường cắt, tay dài, bàn tay xòe) | Lỗi nằm ở **art**, không ở solver | **Art trước, motion sau.** Chủ dự án duyệt art pack trước khi làm chuyển động |

| Lớp vá chồng lớp vá (performance layer, arm projection, arm depth, joint caps) | Sửa triệu chứng | Sửa nguyên nhân; một tính năng = một module có hợp đồng rõ |

| Studio và engine phim là hai nửa rời, Studio không render được | Hai pipeline song song | **Một pipeline**: Studio biên dịch ra `film.json`, engine render nó |

| Test xanh nhưng phim xấu; một lỗi giật tay chỉ bị bắt khi render thật | QA đo khung chữ nhật, test thiếu ràng buộc liên tục | QA đo đúng hình (hình đã xoay/alpha), test liên tục (tốc độ xoay/di chuyển) ngay trong unit test |

| Dàn cảnh phim phải mò bằng script mỗi lần đổi tỷ lệ | Ràng buộc chỉ biết khi chạy | Validator báo **sớm và rõ** (tầm với, chỗ cho tay nghỉ) kèm gợi ý |

| 1,2 GB evidence trong Git | Commit video/log | Không commit media; video lấy từ CI artifact |

## 3. Nguyên tắc bắt buộc

1. **Mọi thứ cụ thể là dữ liệu.** Không `if (character === 'an')`, không điều kiện riêng cho cốc/đèn, không số frame cụ thể trong code. Tìm thấy tên nhân vật/đạo cụ trong `src/` là lỗi.

2. **Tất định.** Hàm lấy mẫu `frame → SceneFrame` thuần; không đồng hồ, không trạng thái tích lũy. Input, art, bake đều có SHA-256.

3. **Dừng khi sai (fail closed).** Dữ liệu sai, không với tới, hash sai, bake cũ → lỗi có mã (`CODE: chi tiết`). Không fallback âm thầm.

4. **Không che lỗi.** Không nới ngưỡng, không xóa/skip test để có màu xanh.

5. **Tính năng phải chạy trên ≥2 nhân vật và ≥2 biến thể** (tay trái/phải, đạo cụ khác, thời lượng khác) trước khi gọi là xong.

6. **Trạng thái trung thực:** `PASS_TECHNICAL`, `ART_REWORK_REQUIRED`, `READY_FOR_USER_REVIEW`, `ACCEPTED` (chỉ chủ dự án đặt), `BLOCKED`, `NOT_RUN`. Test xanh mà phim xấu hơn = FAIL.

7. **Bảo mật.** Không chạy HTML/JS do người dùng/model tạo. Validate ở biên vào và trước render. Không key trong repo/log.

8. **Git.** Nhánh feature + PR nháp; commit nhỏ có giải thích; không force-push, không tự merge, không commit media lớn.

9. **Cách làm việc với chủ dự án:** yêu cầu mơ hồ → hỏi lại và đưa thiết kế ngắn để duyệt **trước** khi code; chia task nhỏ, nêu file sửa và cách kiểm tra; code ít nhất có thể; chỉ nói "xong" sau khi chạy kiểm tra thật; báo cáo sau mỗi bước kèm ảnh/video thật trong chat.

## 4. Kiến trúc

```

src/

  schema/      Hợp đồng dữ liệu + validator (zod): art pack, rig, action, film, storyboard

  rig/         Ráp con rối từ rig data + pose → sprites (thuần)

  motion/      Lấy mẫu action clip theo frame → pose; ghép nhiều clip; IK 2 xương

  physics/     Bake Rapier tất định cho đạo cụ rơi/đặt; xác minh SHA

  scene/       film + frame → SceneFrame (sprites, camera, markers)

  qa/          Kiểm từng frame: tiếp xúc, chân chạm sàn, liên tục, chồng lấn theo hình đã xoay

  render/      Renderer Three.js trong Chromium, server tin cậy, encoder MP4, tự kiểm renderer

  audit/       Audit độc lập sau render (decode toàn bộ, hash, nguồn, QA lại)

  studio/      Kịch bản → storyboard → revision → compile ra film.json; job queue; HTTP/UI

assets/<pack>/  Art pack có version: SVG + manifest.json + rig.json

examples/films/ Phim mẫu (JSON)

docs/           ARCHITECTURE.md, STATE.json (trạng thái)
PLAN.md         Kế hoạch duy nhất (ở thư mục gốc)

```

### Hợp đồng dữ liệu (phác thảo — chốt chi tiết ở M0)

- **Art pack** `assets/<pack>/manifest.json`: mỗi asset có `id, file, width, height, pivot, anchors, category, sha256`.

- **Rig** `assets/<pack>/rig.json`: danh sách xương (`id, parent, asset, joint anchor`), độ dài lấy từ anchor art, giới hạn góc khớp, tư thế nghỉ (góc khớp, không phải tọa độ tuyệt đối), các anchor tiếp xúc (`grip`, `sole`). Nhiều nhân vật dùng chung một kiểu rig khác số đo.

- **Action clip** `assets/<pack>/actions/*.json` hoặc trong phim: kênh khớp theo keyframe (góc/vị trí, easing có tên), sự kiện (`grip`, `release`, `contact`), tiền điều kiện (cần đạo cụ có anchor `grip`, cần tay…). Ví dụ: `idle-breath`, `turn-head`, `wave`, `pick-up`, `place`, `walk-cycle`.

- **Film** `examples/films/<id>.json`: art pack, nhân vật (vị trí, hướng), đạo cụ, nền (lớp parallax), camera keys, timeline các clip theo nhân vật, công thức vật lý cho mỗi lần thả.

- **Storyboard** (Studio): cảnh, lời thoại, hành động mức cao → compiler sinh `film.json`.

## 5. Mang sang từ repo cũ (chỉ phần đã chứng minh, kèm test)

Tham chiếu tại commit `006d629` của repo cũ (`production/` = engine, `src/` = Studio).

| Mang sang | Nguồn | Ghi chú |

| --- | --- | --- |

| Renderer Three.js + readiness/seek protocol | `production/src/render/browser.ts`, `server.ts` | Giữ kiểm hash/decode texture, cảnh báo lỗi trước khi sẵn sàng |

| Encoder + so state trình duyệt với state tính trước | `production/src/render/render-native.ts` | Giữ ffprobe, decode toàn bộ, tua ngẫu nhiên khớp pixel |

| Tự kiểm renderer | `production/src/render/check-renderer.ts` | 6 lỗi texture + tua theo mọi thứ tự |

| Texture cache có hash | `production/src/art/textures.ts`, `pack.ts` | |

| Bake Rapier tất định + xác minh | `production/src/physics/general-drop.ts`, `engines.ts`, `contract.json` | Giữ re-simulate để chống bake giả |

| Audit độc lập | `production/src/qa/audit-films.ts` | Viết lại theo schema mới, giữ các kiểm tra |

| Đo chồng lấn theo hình đã xoay | `orientedCoverage` trong `production/src/scene/geometry.ts` | |

| Quy tắc bàn tay khi thả (nắm → thả lỏng, xoay ≤ 22,5°/frame) | `production/src/motion/hand-release.ts` | Dạng dữ liệu trong action `release` |

| Studio: store revision bất biến, job queue, export/import, HTTP an toàn | `src/store.ts`, `src/application.ts`, `src/domain.ts`, `src/server.ts` | Renderer nối qua `RenderFunction` |

| Art `lantern-v2` (khớp tròn, tay 85%, `hand-half`) | `production/assets/lantern-v2/` | Chỉ làm điểm xuất phát cho art pack mới |

**Không mang sang:** `performance-layer`, `arm-projection`, `arm-depth`, `joint-caps`, thuật toán tìm tư thế nghỉ, `cutoutStance`, mọi script/tài liệu theo giai đoạn cũ.

## 6. Các mốc

Mỗi mốc: code + test + **render thật** + ảnh/video trong chat + chủ dự án duyệt. Không sang mốc sau khi chưa `ACCEPTED`.

### M0 — Khung repo

- Cấu trúc thư mục, TypeScript strict, zod, CI (`verify` + `render`), lệnh `npm run render/audit/check:renderer`.

- Mang sang renderer, texture, check-renderer kèm test; render một cảnh tĩnh từ art pack mẫu.

- Chốt schema art pack, rig, action, film (tài liệu + validator + test âm tính).

- **Đạt khi:** CI xanh; render ra MP4 1080p24 một cảnh tĩnh; check-renderer PASS.

### M1 — Art pack + rig dữ liệu (art trước motion)

- Art pack chuẩn cho **2 nhân vật khác tỷ lệ** (ví dụ một người thấp đậm, một người cao gầy): khớp tròn chồng mép, nhiều hình bàn tay (nắm, thả lỏng, mở, chỉ), đầu 3 hướng, thân 3 hướng.

- `rig.json`: xương, giới hạn khớp, tư thế nghỉ theo góc. Rig không có số đo trong code.

- Model sheet + sheet tư thế cực hạn render tự động.

- **Đạt khi:** chủ dự án duyệt model sheet; test: nhân vật thứ 3 chỉ bằng dữ liệu đứng đúng sàn, không lỗi IK.

### M2 — Hành động là dữ liệu

- Clip: `idle-breath`, `turn-head`, `wave`, `walk-cycle` (bàn chân khóa sàn), `pick-up`/`place` (cầm, thả).

- Ghép clip theo timeline, chuyển tiếp mượt; kiểm liên tục trong unit test (tốc độ xoay/di chuyển tối đa).

- **Đạt khi:** 3 phim mẫu khác nhau (≥2 nhân vật, ≥4 hành động khác nhau, cả 2 tay), render + audit PASS, chủ dự án duyệt video 1× và 0.5×.

### M3 — Vật lý đạo cụ

- Mang Rapier bake sang; thả/đặt đạo cụ lên mặt đỡ; validator báo sớm khi dàn cảnh không với tới hoặc không chừa chỗ cho tay.

- **Đạt khi:** 2 đạo cụ khác hình, 2 tay, 2 thời điểm thả; bake giả bị phát hiện; video duyệt.

### M4 — Studio nối engine

- Studio compile storyboard → `film.json`; job render dùng engine; giọng đọc nháp; revision/export.

- **Đạt khi:** từ kịch bản mới trong UI ra được video 20–30 giây, ≥3 cảnh, sửa một cảnh → revision mới → video mới; test UI thật.

### M5 — Director (AI có giới hạn)

- Lập đồ thị việc từ kịch bản, chỉ dùng hành động/nhân vật có trong dữ liệu; người duyệt trước khi chạy.

- **Đạt khi:** 2 kịch bản mới ra video; hành động không hỗ trợ bị từ chối rõ ràng.

### M6 — Nhiều phim + chất lượng

- ≥6 phim thực sự khác nhau chỉ khác dữ liệu; regression đầy đủ; chủ dự án duyệt tất cả.

## 7. Vòng làm việc của agent

1. `git status -sb && git rev-parse HEAD`; đọc `docs/STATE.json` và mốc đang mở trong file này.

2. Xác định việc nhỏ tiếp theo; yêu cầu mơ hồ thì hỏi và đưa thiết kế ngắn trước.

3. Viết test thất bại trước, rồi sửa; chạy test liên quan.

4. Render thật, audit, **xem ảnh/video thật** cho mọi nhân vật trước khi nói đã cải thiện.

5. Chạy toàn bộ kiểm tra trên cùng HEAD; commit; push; cập nhật `docs/STATE.json`.

6. Báo cáo: HEAD, thay đổi, kết quả test thật, ảnh/video trong chat, lỗi còn lại, trạng thái.

## 8. Câu lệnh mở đầu cho chat mới

> Đọc `PLAN.md` trong repo này (kế hoạch duy nhất). Repo cũ `maitoan2408/ai-animation-studio-research-content` (nhánh `codex/m6-unified-integration-20261118`, commit `006d629`) chỉ dùng để tham khảo và mang sang các phần liệt kê ở mục 5. Bắt đầu mốc M0: đưa tôi thiết kế ngắn của các schema (art pack, rig, action, film) và danh sách task nhỏ kèm cách kiểm tra để tôi duyệt trước khi viết code.