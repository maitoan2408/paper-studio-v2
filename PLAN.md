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
   Ba mức tất định (chủ dự án chốt sau M0):
   1. **Hash SceneFrame** (dữ liệu frame) phải giống hệt trên **mọi máy** — bắt buộc; kiểm bằng test golden trong `npm test` (CI chạy trên máy khác).
   2. **Pixel giống hệt từng byte** trong cùng môi trường render đã cố định phiên bản (Chromium, ffmpeg, three). **CI là môi trường chuẩn** cho video chính thức.
   3. **Khác máy:** chỉ yêu cầu PSNR ≥ ngưỡng trong `config/audit.json`.

3. **Dừng khi sai (fail closed).** Dữ liệu sai, không với tới, hash sai, bake cũ → lỗi có mã (`CODE: chi tiết`). Không fallback âm thầm.

4. **Không che lỗi.** Không nới ngưỡng, không xóa/skip test để có màu xanh.

5. **Tính năng phải chạy trên ≥2 nhân vật và ≥2 biến thể** (tay trái/phải, đạo cụ khác, thời lượng khác) trước khi gọi là xong.

6. **Trạng thái trung thực:** `PASS_TECHNICAL`, `ART_REWORK_REQUIRED`, `READY_FOR_USER_REVIEW`, `ACCEPTED` (chỉ chủ dự án đặt), `BLOCKED`, `NOT_RUN`. Test xanh mà phim xấu hơn = FAIL.

7. **Bảo mật.** Không chạy HTML/JS do người dùng/model tạo. Validate ở biên vào và trước render. Không key trong repo/log.

8. **Git.** Nhánh feature + PR nháp; commit nhỏ có giải thích; không force-push, không tự merge, không commit media lớn.

9. **Cách làm việc với chủ dự án:** yêu cầu mơ hồ → hỏi lại và đưa thiết kế ngắn để duyệt **trước** khi code; chia task nhỏ, nêu file sửa và cách kiểm tra; code ít nhất có thể; chỉ nói "xong" sau khi chạy kiểm tra thật; báo cáo sau mỗi bước kèm ảnh/video thật trong chat.

10. **Nghiệm thu hai lớp.** Validator và test chặn lỗi kỹ thuật (ngưỡng an toàn là dữ liệu trong rig, vd. `maxDegPerFrame` theo xương). Chất lượng chuyển động và hình ảnh do chủ dự án duyệt trên video thật (1× và 0.5×). Không dùng một ngưỡng số thay cho đánh giá hình ảnh; không nới ngưỡng an toàn để qua kiểm tra. Chạy được trên dữ liệu mới **không** đồng nghĩa với đạt nếu hình ảnh còn lỗi.

## 4. Kiến trúc

```
src/
  schema/   Hợp đồng dữ liệu + validator (zod): art pack, rig, action, film, storyboard
  rig/      Ráp con rối từ rig data + pose → sprites (thuần)
  motion/   Lấy mẫu action clip theo frame → pose; ghép nhiều clip; IK 2 xương; đi bộ / quay tại chỗ;
            đạo cụ cầm/đặt/trao; bộ giải điểm tương tác (M2)
  physics/  Bake Rapier tất định cho đạo cụ rơi/đặt; xác minh SHA. Là một TRẠNG THÁI của đạo cụ trong
            pipeline tương tác (nằm yên → cầm → thả → mô phỏng → nằm yên), không phải hệ thống song song (M3)
  scene/    film + frame → SceneFrame (sprites, camera, markers)
  qa/       Kiểm từng frame: tiếp xúc, chân chạm sàn, liên tục, chồng lấn theo hình đã xoay
  render/   Renderer Three.js trong Chromium, server tin cậy, encoder MP4 (+ track audio có SHA từ M4),
            tự kiểm renderer
  audit/    Audit độc lập sau render (decode toàn bộ, hash, nguồn, QA lại; audio từ M4)
  studio/   Kịch bản → storyboard → revision → compile ra film.json; job queue; HTTP/UI.
            Gồm capability catalog + compiler dàn cảnh + audio (M4); Script Interpreter + Director Core (M5).
            Ranh giới: Script Interpreter (luật hôm nay; có thể AI sau này) chỉ xuất StoryIntent — dữ liệu có
            schema, validate, SHA, lưu thành revision → Director Core tất định → storyboard → compiler → film.json.
            Không phần nào sinh code chạy lúc render; phần không tất định (nếu có AI) dừng trước revision.

assets/<pack>/   Art pack có version: SVG + manifest.json + rig.json (+ actions/*.json)
examples/films/  Phim mẫu (JSON)
config/          Ngưỡng audit (dữ liệu)
docs/            ARCHITECTURE.md, STATE.json (trạng thái)
PLAN.md          Kế hoạch duy nhất (ở thư mục gốc)
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

**Ghi chú (chủ dự án duyệt D1, 2026-11-21):** chưa có quyền đọc repo cũ. Renderer, check-renderer và audit **đã viết mới** ở M0. Vật lý (M3) và store/queue của Studio (M4) cũng **viết mới** theo hợp đồng của repo này. Nếu sau này có quyền, đối chiếu để bổ sung kiểm tra còn thiếu — không mang sang nguyên trạng.

**Không mang sang:** `performance-layer`, `arm-projection`, `arm-depth`, `joint-caps`, thuật toán tìm tư thế nghỉ, `cutoutStance`, mọi script/tài liệu theo giai đoạn cũ.

## 6. Các mốc

Mỗi mốc: code + test + **render thật** + ảnh/video trong chat + chủ dự án duyệt. Không sang mốc sau khi chưa `ACCEPTED`.

**Lượt chạy nghiệm thu (bắt buộc trước khi xin nghiệm thu mỗi mốc):** verify, check:renderer, render + audit **toàn bộ phim mẫu** trên CI, tại đúng commit bàn giao (code + dữ liệu). Ghi commit và link CI vào `docs/STATE.json`. Nghiệm thu kỹ thuật (lượt chạy này) và nghiệm thu thị giác (chủ dự án xem video) là hai bước riêng (nguyên tắc 10).

**Thứ tự thực hiện** (chủ dự án quyết định sau Demo slice, 2026-11-20): M0 → Demo slice → **M2** → M1 → M3 → M4 → M5 → M6. Art mới (M1) làm sau M2; trong M2 tiếp tục dùng art tạm của demo.

### M0 — Khung repo

- Cấu trúc thư mục, TypeScript strict, zod, CI (`verify` + `render`), lệnh `npm run render/audit/check:renderer`.

- Mang sang renderer, texture, check-renderer kèm test; render một cảnh tĩnh từ art pack mẫu.

- Chốt schema art pack, rig, action, film (tài liệu + validator + test âm tính).

- **Đạt khi:** CI xanh; render ra MP4 1080p24 một cảnh tĩnh; check-renderer PASS.

### Demo slice — workflow xuyên suốt (ngay sau M0, trước M1)

Mục đích: cho chủ dự án thấy sớm nhất toàn bộ đường đi **dữ liệu → MP4**. Chất lượng hình và phong cách **chưa** là mục tiêu; sẽ tinh chỉnh ở các mốc sau.

- 2 nhân vật đơn giản (art thô, khớp tròn), cùng một kiểu rig nhưng khác số đo; rig là dữ liệu (`rig.json`).
- 3 action clip dữ liệu (schema action v0): `idle-breath`, `wave` (một nhân vật vẫy tay trái, nhân vật kia tay phải), `turn-head` (đổi variant đầu + xoay).
- Ráp con rối thuần (`src/rig`: góc khớp → sprite, FK) và lấy mẫu clip theo frame (`src/motion`). Chưa làm: IK, đi bộ, cầm/thả, vật lý, Studio.
- 1 phim mẫu 8–10 giây, 2 nhân vật, nền nhiều lớp, camera di chuyển nhẹ.
- Render MP4 thật + audit; gửi chủ dự án bản 1× và 0.5×.
- Giữ nguyên §3 (dữ liệu, tất định, fail closed, có test). **Ngoại lệ ghi rõ:** art của demo là art tạm, không qua bước "art trước motion"; không dùng nó làm art pack của M1.
- **Đạt khi:** CI xanh; MP4 1080p24 dài 8–10 giây; audit PASS; chủ dự án đã xem video. Sau đó chủ dự án chọn phần làm kỹ tiếp theo (art, hành động, vật lý, Studio…); thứ tự M1–M6 có thể đổi theo quyết định đó và được cập nhật ngay trong file này.

### M1 — Art pack + rig dữ liệu (art trước motion; ưu tiên chất lượng hình ảnh)

Làm sau khi M2 `ACCEPTED`.

- **M1a — Art (chủ dự án duyệt TRƯỚC khi hoàn thiện motion trên art mới):** 2 nhân vật khác tỷ lệ (vd. thấp đậm, cao gầy); khớp tròn chồng mép, không lộ đường cắt ở mọi góc trong giới hạn khớp; đầu và thân 3 hướng (thẳng, 3/4, nghiêng); bàn tay 4 dạng (nắm, thả lỏng, mở, chỉ); anchor bê đồ/tương tác do art quyết định; bóng đổ gộp cho cả nhân vật (renderer). Model sheet + sheet tư thế cực hạn render tự động.
- **M1b — Rig:** `rig.json` (xương, giới hạn khớp, tư thế nghỉ theo góc, không số đo trong code); xương cúi người (eo/hông) và chuỗi IK cho phép cúi khi với thấp nếu E0 (M2) chứng minh cần; đổi hướng/variant thân theo hướng nhìn và hành động bằng dữ liệu.
- **M1c — Regression:** chạy lại TOÀN BỘ hành động M2 (đi bộ, quay tại chỗ, cầm, đặt, trao, vẫy, thở, quay đầu) trên art mới với ≥2 nhân vật khác tỷ lệ + nhân vật thứ 3 chỉ bằng dữ liệu. Không sửa engine riêng cho nhân vật nào.
- **Đạt khi:**
  - Kỹ thuật: lượt chạy nghiệm thu PASS; test: nhân vật thứ 3 chỉ bằng dữ liệu đứng đúng sàn, không lỗi IK.
  - Thị giác (chủ dự án duyệt model sheet và video thật 1×/0.5×): khớp nối không lộ, tỷ lệ cơ thể, che khuất đúng, tư thế cầm/bê đồ tự nhiên (không vắt tay qua thân), đặt đồ ở khoảng cách tự nhiên, chuyển động tự nhiên.
  - Các lỗi chuyển từ M2 (tay vắt qua thân, đặt đồ sát chân, chưa có bóng nhân vật, thân nhìn thẳng khi đi ngang) được giải quyết hoặc chủ dự án chấp nhận rõ ràng.
  - Chạy được trên nhân vật mới KHÔNG đủ nếu hình ảnh còn lỗi.

### M2 — Hành động là dữ liệu

Phạm vi chủ dự án duyệt (2026-11-20, lựa chọn B — vẫn dùng art tạm của demo, chưa làm art mới):

- Đi bộ: bàn chân khóa sàn, không trượt; hướng nhìn theo hướng đi, kể cả khi đổi hướng (lật như tờ giấy).
- Cầm và đặt đồ vật lên bàn/sàn (chưa có vật lý rơi); 2 nhân vật trao đồ cho nhau. Khi cả hai cùng nắm, đồ đi theo tay nắm gần nhất (người nhận) — quy tắc rõ ràng, tất định.
- Chỉnh từ buổi duyệt demo: camera gần hơn; `wave` gập khuỷu/cổ tay; `turn-head` bớt nhảy hình (bóp ngang `squashX`); `idle-breath` rõ hơn.
- Chân art tạm cắt thành đùi/ống chân/bàn chân; IK 2 xương; ngưỡng xoay thống nhất: mỗi xương có `maxDegPerFrame` trong `rig.json`.
- Giới hạn chấp nhận cho vòng này: thân nhìn thẳng khi đi ngang.

- **Đạt khi:** phim chính 15–20 giây đủ các hành động trên + 1 phim ngắn 8–10 giây dàn cảnh khác hẳn (đổi vai, tay kia, đạo cụ kia, đi chiều ngược lại) + test biến thể (≥2 nhân vật, cả 2 tay, 2 đạo cụ, 2 quãng/chiều đi); cả 2 phim render + audit PASS trên CI; chủ dự án duyệt video 1× và 0.5×. Mục tiêu "nhiều phim mẫu khác nhau" chuyển sang M6.

**Vòng đóng M2** (chủ dự án duyệt 2026-11-21; dùng art tạm; thứ tự E0 → E1 → E4 → E2 → E3 → E5):

- **E0 — Kiểm chứng nguyên nhân trước khi chuyển lỗi sang M1:** (Q1) tay vắt qua thân khi bê đồ — quét có hệ thống điểm bê trong khung art thân × hai chiều gập khuỷu, đo có nghiệm nào không vắt qua thân, giữ đồ trên sàn, trong giới hạn khớp không; (Q2) đặt đồ sát chân — đo tầm với xuống thấp nhất của rig hiện tại so với độ cao cần cho khoảng cách đặt tự nhiên. Có nghiệm → sửa trong M2; không có → ghi nguyên nhân bằng số liệu và chuyển sang M1.
- **E1 — Bộ giải điểm tương tác tổng quát** (không công thức riêng cho cảnh nào): điểm tương tác khai báo bằng neo (anchor thân/contact nhân vật, anchor đạo cụ, có trọng số) + ràng buộc. Bộ giải phải kiểm: mọi chuỗi tay tham gia với tới được; **tính khả thi IK đầy đủ** (nghiệm tồn tại, trong **giới hạn khớp**, đúng **hướng gập** của rig); khoảng hở của đồ cầm tay với mặt đỡ. Điểm được xác định **tại frame tiếp xúc** (frame sự kiện grip/release/contact), dựa trên tư thế nhân vật ở chính frame đó (đã tính đi bộ/quay), không mặc định lấy đầu clip; sau đó giữ cố định trong thế giới. Không khả thi → `IK_UNREACHABLE`/`ACTION_LIMIT_EXCEEDED` kèm frame, khoảng thiếu và gợi ý dời nhân vật.
- **E2 — Timing nâng/đặt đồ tự nhiên:** chỉnh dữ liệu clip (thời lượng, ease); nghiệm thu bằng ảnh từng giai đoạn + video 1×/0.5×, không thay bằng ngưỡng tốc độ.
- **E3 — Thông báo thiếu thời lượng:** `WALK_TOO_SHORT` và lỗi vượt tốc độ do quá ngắn phải nêu số frame tối thiểu (tính từ `gait` và ngưỡng xương).
- **E4 — Quay người tại chỗ** là hành động tổng quát: mục locomotion `turn` (`face: left|right` hoặc tương đối `face: {character}|{prop}`, tính tại frame bắt đầu), dùng chung cơ chế lật với `walk`, bàn chân giữ khóa sàn, không chồng `walk` cùng nhân vật.
- **E5 — Render lại** 2 phim (quay tại chỗ thay cho bước đi chỉ để quay; điểm gặp qua bộ giải E1), lượt chạy nghiệm thu, gửi video.
- **Đạt khi (bổ sung cho tiêu chí trên):** bài kiểm tổng quát hoá E1 — **dời vị trí, đổi scale nhân vật, đổi đạo cụ** mà phim vẫn hợp lệ không sửa tọa độ; điểm tương tác đúng tại frame tiếp xúc khi nhân vật đang di chuyển; quay tại chỗ có test trên 2 nhân vật, cả hai cách chỉ hướng; kết luận E0 có số liệu; lượt chạy nghiệm thu PASS; chủ dự án duyệt video.

### M3 — Vật lý đạo cụ

- Một pipeline tương tác thống nhất: vật lý là một trạng thái mới của đạo cụ trong `src/motion/props.ts` (nằm yên → cầm → thả → mô phỏng → nằm yên). Không hệ thống song song.
- Tại frame thả: vị trí, vận tốc và góc liên tục với tay. Va chạm với mặt đỡ và đạo cụ khác. Bake Rapier tất định có SHA; audit mô phỏng lại để phát hiện bake giả/cũ.
- Validator báo sớm khi không có chỗ rơi, rơi trúng nhân vật, hoặc dàn cảnh không với tới/không chừa chỗ cho tay.
- **Đạt khi:** ≥2 đạo cụ khác hình, 2 tay, 2 thời điểm thả, 2 kiểu tiếp đất (bàn, sàn); kiểm liên tục tại frame thả; bake giả bị phát hiện; hash bake trùng giữa CI và máy tại chỗ; lượt chạy nghiệm thu PASS; chủ dự án duyệt video.

### M4 — Studio nối engine

- **Capability catalog** (dữ liệu): mỗi hành động mô tả nó cần gì — tay, đạo cụ + anchor, tầm với, thời lượng tối thiểu/mặc định, có cần đối diện người khác.
- **Compiler dàn cảnh:** storyboard → `film.json`; tự xác định vị trí nhân vật, điểm tương tác (bộ giải E1), thời lượng (từ catalog), camera và bố cục cơ bản sao cho thỏa validator. Người dùng chỉ ghi đè khi muốn, không phải nhập mọi tọa độ.
- **Audio (bắt buộc):** nhập file âm thanh có SHA, đồng bộ theo beat; MP4 có track audio; audit kiểm thời lượng, đồng bộ, hash. **TTS cục bộ (tùy chọn):** chạy ở bước chuẩn bị, không gọi dịch vụ ngoài, sinh WAV có hash; không chạy lúc render.
- Revision bất biến, job queue, export/import, UI tối thiểu; render bằng đúng engine hiện có.
- **Đạt khi:** từ kịch bản mới trong UI ra video 20–30 giây, ≥3 cảnh, không nhập tọa độ thủ công; audio đồng bộ; sửa một cảnh → revision mới → video mới; test UI thật; lượt chạy nghiệm thu PASS; chủ dự án duyệt video.

### M5 — Director (không phụ thuộc API ngoài)

- **Ranh giới bắt buộc:** `Script Interpreter` → **StoryIntent** (schema có version: nhân vật, cảnh, beat, ý định hành động/tương tác, lời thoại, ràng buộc; validate, SHA, lưu thành revision) → `Director Core` (tất định, dựa trên luật + capability catalog) → storyboard → compiler M4 → pipeline đã kiểm thử.
- M5 triển khai Script Interpreter **dựa trên luật** cho kịch bản tiếng Việt có cú pháp có cấu trúc. Kiến trúc **giữ chỗ** cho một Interpreter khác (vd. AI chuyển ngôn ngữ tự nhiên → StoryIntent) chỉ bằng cách thay nguồn StoryIntent: đầu ra của nó vẫn phải qua cùng schema/validator, và mọi phần không tất định dừng trước revision. M5 không bắt buộc LLM hay API; không phụ thuộc API tạo ảnh/video hoặc API LLM bên ngoài.
- Chỉ dùng hành động có trong catalog; không sinh code chạy lúc render. Hành động không hỗ trợ bị từ chối với mã lỗi rõ và gợi ý hành động thay thế có trong catalog.
- **Đạt khi:** 2 kịch bản mới ra video; ca từ chối rõ ràng; cùng kịch bản → cùng StoryIntent → cùng storyboard (tất định); test hợp đồng StoryIntent (Interpreter thay thế được mà không đổi Director Core); lượt chạy nghiệm thu PASS; chủ dự án duyệt video.

### M6 — Nhiều phim + chất lượng

- ≥6 phim khác nhau thực sự về tình huống, hành động, tương tác và bố cục; chỉ khác dữ liệu, không sửa engine riêng cho từng phim; regression đầy đủ.
- CI: PR thường chỉ render phim bị ảnh hưởng; render toàn bộ theo lịch; **lượt chạy nghiệm thu** đầy đủ trên commit bàn giao.
- **Đạt khi:** chủ dự án duyệt cả 6 phim theo checklist thị giác cố định (bóng, khớp, tiếp xúc, che khuất, nhịp, bố cục, tự nhiên của chuyển động) + lượt chạy nghiệm thu PASS.

## 7. Vòng làm việc của agent

1. `git status -sb && git rev-parse HEAD`; đọc `docs/STATE.json` và mốc đang mở trong file này.

2. Xác định việc nhỏ tiếp theo; yêu cầu mơ hồ thì hỏi và đưa thiết kế ngắn trước.

3. Viết test thất bại trước, rồi sửa; chạy test liên quan.

4. Render thật, audit, **xem ảnh/video thật** cho mọi nhân vật trước khi nói đã cải thiện.

5. Chạy toàn bộ kiểm tra trên cùng HEAD; commit; push; cập nhật `docs/STATE.json`.

6. Báo cáo: HEAD, thay đổi, kết quả test thật, ảnh/video trong chat, lỗi còn lại, trạng thái.

## 8. Câu lệnh mở đầu cho chat mới

> Đọc toàn bộ `PLAN.md` (kế hoạch duy nhất) và `docs/STATE.json`. Kiểm tra `git status -sb` và `git rev-parse HEAD` trên nhánh làm việc. **Tiếp tục từ mốc đang mở** (`openMilestone` trong `docs/STATE.json`) và các task còn `NOT_RUN`/`BLOCKED` trong `checks`/`notes` của mốc đó — **không bắt đầu lại M0** và không làm lại mốc đã `ACCEPTED`. Nếu task kế tiếp đã được chủ dự án duyệt (ghi trong PLAN/STATE) thì triển khai; nếu còn mơ hồ thì gửi thiết kế ngắn để duyệt trước khi viết code. Repo cũ `maitoan2408/ai-animation-studio-research-content` (nhánh `codex/m6-unified-integration-20261118`, commit `006d629`) chỉ dùng để tham khảo nếu có quyền (xem §5).
