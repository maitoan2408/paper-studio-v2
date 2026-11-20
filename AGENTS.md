# AGENTS.md — Paper Studio v2

## Nguồn sự thật

- **Chỉ có một kế hoạch: [`PLAN.md`](PLAN.md).** Đọc hết trước khi đề xuất, sửa hoặc chạy bất cứ việc gì. Không tạo kế hoạch/roadmap mới; mọi thay đổi kế hoạch phải cập nhật `PLAN.md`.
- **Trạng thái thực thi:** `docs/STATE.json`, được tạo ở M0. Nếu file chưa tồn tại, dự án **chưa khởi động M0**; không suy đoán hoặc tự khai báo mốc đã hoàn thành.
- Làm đúng **mốc đang mở**; không chuyển sang mốc kế tiếp khi chủ dự án chưa đặt trạng thái `ACCEPTED`.

## Quy tắc bắt buộc

1. **Dữ liệu, không hardcode:** nhân vật, rig/số đo cơ thể, đạo cụ, hành động, bối cảnh, phim và biến thể phải được định nghĩa trong dữ liệu. `src/` không chứa điều kiện/tên cụ thể cho từng nhân vật, đạo cụ hay phim.
2. **Tái sử dụng được:** trước khi gọi một tính năng là hoàn thành, chứng minh chạy trên **ít nhất 2 nhân vật và 2 biến thể**. Không tối ưu riêng một cảnh để rồi coi đó là giải pháp tổng quát.
3. **Tất định và toàn vẹn:** lấy mẫu `frame → SceneFrame` là hàm thuần; input/art/bake dùng SHA-256. Không dựa vào đồng hồ hay state tích lũy.
4. **Fail closed:** dữ liệu sai, vượt tầm với, hash sai hoặc bake lỗi phải dừng và xuất mã lỗi rõ ràng (`CODE: chi tiết`); không fallback im lặng.
5. **QA trung thực:** không nới ngưỡng, xóa hay skip test để qua kiểm tra. **Test xanh nhưng video xấu hơn = FAIL.**
6. **Art trước motion:** chủ dự án phải duyệt art/model sheet trước khi phát triển chuyển động. Chủ dự án duyệt cả video thật; không xem `PASS_TECHNICAL` là `ACCEPTED`.
7. **An toàn:** không chạy HTML/JS không tin cậy do user/model cung cấp; validate đầu vào và trước render; không commit hoặc ghi log secrets.
8. **Thay đổi tối thiểu:** sửa nguyên nhân gốc, module có hợp đồng rõ; tránh lớp vá, hardcode và kiểm thử không liên quan.

## Quy trình làm việc

1. Kiểm tra `git status -sb` và `git rev-parse HEAD`; đọc **toàn bộ** `PLAN.md` và `docs/STATE.json` nếu đã có.
2. Chỉ làm task nhỏ thuộc mốc đang mở. Với yêu cầu mơ hồ: **hỏi lại và gửi thiết kế ngắn để duyệt trước khi viết code**. Nêu rõ file định sửa và tiêu chí kiểm tra.
3. Khi được duyệt triển khai: viết test thất bại trước; sửa ít nhất có thể; chạy các kiểm tra liên quan.
4. Với thay đổi ảnh/chuyển động/render: **render và kiểm tra ảnh/video thật** cho đủ nhân vật/biến thể; audit và regression trên cùng HEAD.
5. Báo cáo trung thực: HEAD, thay đổi, lệnh/test **đã chạy thật**, kết quả, minh chứng ảnh/video thật trong chat, lỗi còn lại và trạng thái. Không nói “xong” khi chưa kiểm tra thật.
6. Dùng các trạng thái đúng trong `PLAN.md`: `NOT_RUN`, `BLOCKED`, `PASS_TECHNICAL`, `ART_REWORK_REQUIRED`, `READY_FOR_USER_REVIEW`, `ACCEPTED`. **Chỉ chủ dự án được đặt `ACCEPTED`.**

## Quy tắc Git

- Phát triển trên **feature branch**, mở **draft PR**; commit nhỏ, rõ ràng.
- **Không force-push, không tự merge, không commit media lớn.** Video/minh chứng lớn dùng CI artifacts.
- Cập nhật `PLAN.md` và `docs/STATE.json` (khi đã được tạo) thay vì thêm tài liệu quản lý giai đoạn mới.

## Điểm bắt đầu

Repo mới chỉ chứa hướng dẫn và kế hoạch, **chưa triển khai M0**. Việc đầu tiên của agent là đọc mục M0 trong `PLAN.md`, sau đó **trình thiết kế ngắn** cho schema art pack, rig, action, film và các task nhỏ kèm cách kiểm tra để chủ dự án duyệt **trước khi code**.

Repo cũ `maitoan2408/ai-animation-studio-research-content`, nhánh `codex/m6-unified-integration-20261118`, commit `006d629` chỉ dùng làm **tham chiếu có chọn lọc** theo mục 5 của `PLAN.md`; không di chuyển nguyên trạng hoặc tạo thêm lớp vá.