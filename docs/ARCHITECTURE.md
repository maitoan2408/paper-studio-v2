# Kiến trúc Paper Studio v2

Tài liệu kỹ thuật cho hợp đồng dữ liệu và renderer. Kế hoạch và mốc nằm duy nhất ở `PLAN.md`; trạng thái ở `docs/STATE.json`.

## Đường ống

```
film.json ──validate──▶ Film ──sampleFrame(film, i)──▶ SceneFrame[i] ──/scene.json──▶ trang Chromium (Three.js)
                                    │                                                     │ window.__hf.seek(i)
                                    └──── so state (RENDER_STATE_MISMATCH) ◀── state đã vẽ + RGBA
                                                                                          │
                                                       ffmpeg (H.264 BT.709) ◀────────────┘
                                                              │
                                     render-manifest.json + film.mp4 ──▶ audit (process + trình duyệt mới)
```

Lệnh: `npm run verify` (typecheck + test + validate), `npm run render -- <film>`, `npm run audit -- <manifest>`, `npm run check:renderer`.
Chromium: biến môi trường `CHROMIUM_PATH` (bắt buộc; thiếu → `ENV_CHROMIUM_MISSING`). ffmpeg/ffprobe: `PATH`, hoặc `FFMPEG_PATH`/`FFPROBE_PATH`.

## Quy ước không gian (dễ sai dấu — có test kiểm ngược)

| Không gian | Gốc | Trục y | Góc dương | Đổi ở đâu |
| --- | --- | --- | --- | --- |
| Art (SVG) | trên-trái asset | xuống | — | `core/space.ts: artToLocal` (trừ pivot, lật y) |
| Thế giới (film, rig) | giữa sàn | **lên** | ngược chiều kim đồng hồ | — |
| Màn hình (SceneFrame, renderer) | trên-trái khung 1920×1080 | **xuống** | theo chiều kim đồng hồ | `scene/sample.ts` (chỗ duy nhất) |

Multiplane: lớp ở `depth` d có hệ số `p = 1/(1+d)`, tính tương đối key camera đầu tiên — frame 0 đúng bố cục dữ liệu; camera dịch/zoom thì lớp xa đổi ít hơn.

## Hợp đồng dữ liệu (zod `.strict()`; field lạ → `*_SCHEMA`)

Lỗi in dạng `CODE: path — detail`. Id: `^[a-z0-9][a-z0-9-]{0,63}$`.

### Art pack — `assets/<pack>/manifest.json` (`src/schema/art-pack.ts`)
Asset: `id, file (.svg tương đối), width, height (= viewBox "0 0 w h"), pivot, anchors, category, sha256`.
Mã: `ART_SCHEMA, ART_DUPLICATE_ID, ART_PATH_UNSAFE, ART_FILE_MISSING, ART_HASH_MISMATCH, ART_SIZE_MISMATCH, ART_ANCHOR_OUT_OF_BOUNDS, ART_SVG_UNSAFE`.
SVG là biên bảo mật: allowlist phần tử; chặn script, foreignObject, `on*`, href/url() ra ngoài, CDATA/DOCTYPE/ENTITY.
Bộ kiểm này **không** kiểm XML hợp lệ — SVG hỏng cấu trúc bị trình duyệt từ chối (`ASSET_DECODE`).

### Rig — `assets/<pack>/rig.json` (`src/schema/rig.ts`)
Kiểu rig (xương `id, parent, attach, limits, z`; `sides: [l, r]`; `contacts`) tách khỏi nhân vật (`skin` + `variants`, `rest` theo góc).
**Độ dài xương không lưu**: suy từ |anchor `attach` − pivot| trên art của xương cha, riêng cho từng nhân vật.
Mã: `RIG_SCHEMA, RIG_UNKNOWN_PARENT, RIG_CYCLE, RIG_ROOT_COUNT, RIG_SIDE_UNPAIRED, RIG_SKIN_INCOMPLETE, RIG_ASSET_MISSING, RIG_ANCHOR_MISSING, RIG_LIMIT_INVALID, RIG_REST_OUT_OF_LIMIT, RIG_DEGENERATE_BONE`.

### Action clip v0 — NHÁP (`src/schema/action.ts`)
`t ∈ [0,1]` (thời lượng do film quyết định); kênh `rotation | rootX | rootY | variant`; `ease` có tên trên mọi key trừ key cuối; `@active` → `l`/`r` (kiểm cả hai); sự kiện `grip/release/contact`; `requires`.
Mã: `ACTION_SCHEMA, ACTION_RIG_MISMATCH, ACTION_KEYS_UNSORTED, ACTION_UNKNOWN_BONE, ACTION_UNKNOWN_VARIANT, ACTION_EVENT_ORDER`. Chưa có: `ACTION_PRECONDITION`, `ACTION_LIMIT_EXCEEDED`.

### Film — `examples/films/<id>.json` (`src/schema/film.ts`)
`output` cố định 1920×1080@24; `packs` ghim version + `manifestSha256`; `stage.layers`, `stage.surfaces {y, x0, x1}`, `props` (`on` → phải nằm trên mặt đỡ), `camera.keys`, `characters`, `timeline`, `physics`.
Mã: `FILM_SCHEMA, FILM_DUP_ID, FILM_PACK_NOT_FOUND, FILM_PACK_HASH, FILM_UNKNOWN_REF, FILM_NOT_ON_SURFACE, FILM_FRAME_RANGE, FILM_TIMELINE_OVERLAP, FILM_FEATURE_NOT_ENABLED`.

### Storyboard v0 — NHÁP (`src/schema/storyboard.ts`)
Revision bất biến (`revision`, `parentSha256`), `cast`, `scenes[].beats[]`. Mã: `STORYBOARD_SCHEMA, STORYBOARD_REVISION, STORYBOARD_UNKNOWN_ROLE`.

## Renderer (viết mới — chưa đối chiếu repo cũ)

- **Server** (`render/server.ts`): chỉ `127.0.0.1`, chỉ GET/HEAD, allowlist trong bộ nhớ (hash lúc đăng ký), CSP `default-src 'none'`. Trình duyệt chặn mọi request ngoài origin (`RENDER_BLOCKED_REQUEST`).
- **Trang** (`render/page/main.ts`): code của repo, Node bóc type khi phục vụ; chỉ import `three`. Dữ liệu từ `/scene.json`.
- **Sẵn sàng**: `window.studio.ready = true` và `window.__hf` chỉ xuất hiện sau khi mọi texture tải xong, khớp SHA-256, decode, upload GPU, warm-up shader. Lỗi: `window.studio.error = "ASSET_HTTP|ASSET_HASH|ASSET_DECODE|ASSET_TIMEOUT: …"`, không bao giờ sẵn sàng.
- **Tua**: `window.__hf.seek(i)` dựng lại cảnh từ SceneFrame `i` (không trạng thái giữa các frame), trả về state đọc từ Object3D + RGBA.
- **Tất định**: SwiftShader (WebGL bằng CPU), không antialias, x264 1 luồng + bitexact. Hash pixel chỉ so được trên **cùng bản Chromium** (ghi trong manifest).
- **Render** (`render/render.ts`): so state từng frame; ffprobe + decode toàn bộ; chụp lại frame thứ tự xáo trộn trong cùng phiên và phiên mới (`RENDER_NONDETERMINISTIC`).
- **check:renderer**: 6 ca texture + tua mọi thứ tự + phiên mới.
- **Audit** (`audit/audit.ts`): xem đầu file; ngưỡng ở `config/audit.json`.

## Chuyển động (M2)

Trạng thái nhân vật ở một frame (`src/motion/character.ts`) = clip theo timeline (lớp cộng dồn, blend) → đi bộ → khóa bàn chân bằng IK → kênh `reach` (IK tay). Mọi thứ là hàm thuần theo frame.

- **Ngưỡng xoay thống nhất:** `rig.json` → mỗi xương có `maxDegPerFrame` (vd. bàn tay 22.5, khớp khác 12). Validator lấy mẫu mọi frame (kể cả góc do IK tạo) → `ACTION_SPEED_EXCEEDED`. Giới hạn khớp → `ACTION_LIMIT_EXCEEDED`.
- **IK 2 xương** (`src/motion/ik.ts`): luật cos, độ dài từ anchor art, `bend` ±1 trong rig; bàn chân giữ `endWorldAngle`. Trộn FK↔IK tuyến tính trên góc chuẩn hoá (−180, 180]. Không với tới → `IK_UNREACHABLE` (kèm số px, frame, clip).
- **Đi bộ** (`film.walks`, `src/motion/walk.ts`): n bước chẵn từ `gait.strideRatio`·chiều dài chân; bàn chân di chuyển trong `swingRatio` đầu mỗi bước (inOutSine, nhấc sin²), còn lại hai chân cùng trụ → chân trụ không trượt. Bàn chân luôn khóa sàn; độ cao hông = min theo chân của độ cao còn với tới `reachRatio`·L.
- **Hướng nhìn:** = hướng của lần đi gần nhất (trước đó: `facing`). Đổi hướng → `turnFrames` frame lật như tờ giấy: `fx = hướng cũ·cos(π·inOutSine(u))`; sprite x/scaleX × fx, góc đổi dấu theo dấu fx.
- **Đạo cụ** (`src/motion/props.ts`): phát lại `grip`/`release` (frame = start + round(t·(dur−1))). Đồ đi theo **tay nắm gần nhất**; khi trao đồ cả hai cùng nắm → theo **người nhận**. Không ai nắm → nằm ở `bind.place`. Đồ đang cầm vẽ trong lượt của người cầm, ngay trước sprite bàn tay; chiếu ở depth của người cầm.
- **Kênh `reach`:** đích `{point}` (bind.points), `{role, anchor}` (đồ đang nằm yên, hoặc chỗ cũ nếu chính tay này đang cầm), `{role, anchor, at:'place'}`, `{bone, anchor}` (bám thân — dùng được khi đang lật).
- Mã lỗi: `PROP_FLOATING`, `PROP_DISCONTINUITY` (≤ 0.5 px tại frame cầm/thả), `PROP_BELOW_SURFACE` (pivot đạo cụ = đáy), `PROP_THROUGH_SURFACE` (nhấc lên trước khi tâm rời chỗ nằm; tới chỗ đặt từ phía trên), `PROP_TARGET_HELD`, `HAND_BUSY`, `WALK_TOO_SHORT`, `RIG_IK_INVALID`.
