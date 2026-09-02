# Data and Stability Rules

## Mục tiêu

Bảo vệ nhận xét, hồ sơ học sinh, cấu hình hệ thống và phiên làm việc. Độ ổn định và khả năng phục hồi quan trọng hơn tối ưu nhỏ hoặc refactor đẹp mắt.

## Thao tác có rủi ro cao

MUST có xác nhận rõ của người dùng trước khi:

- Xóa collection, document hàng loạt hoặc dữ liệu không thể khôi phục.
- Thay đổi `firestore.rules` theo hướng mở rộng quyền truy cập.
- Đổi tên collection hoặc field đang dùng.
- Chạy migration hoặc cleanup trên dữ liệu thật.
- Xóa, đổi schema hoặc invalidate toàn bộ local cache/draft.

Trước thao tác đã được phép, MUST xác định chính xác phạm vi, backup/rollback và tiêu chí thành công.

## Firestore và authentication

- Client-side role hoặc việc ẩn UI MUST không được xem là lớp bảo mật.
- Quyền đọc/ghi quan trọng MUST được enforce trong Firestore rules hoặc trusted backend.
- MUST giữ nguyên authentication state trong lúc request hợp lệ đang chạy, trừ khi người dùng đăng xuất hoặc session hết hạn.
- MUST không log token, mật khẩu, email đầy đủ hoặc dữ liệu nhạy cảm của học sinh.
- Firestore write liên quan nhiều document SHOULD dùng batch hoặc transaction khi cần tính nguyên tử.
- MUST tránh query hoặc write trong vòng lặp khi có thể batch, cache hoặc fetch một lần.
- Query mới MUST xem xét index, giới hạn kết quả và chi phí đọc.

## Schema và tương thích ngược

- Dữ liệu cũ MUST tiếp tục đọc được sau deployment mới, hoặc phải có migration rõ ràng.
- Field mới SHOULD có default khi document cũ chưa chứa field đó.
- Không đổi ý nghĩa của field cũ mà giữ nguyên tên.
- Reader SHOULD khoan dung với dữ liệu cũ; writer SHOULD ghi schema hiện hành.
- Migration MUST có version, khả năng chạy lại an toàn và log số bản ghi thành công/thất bại.
- Không xóa fallback đọc dữ liệu cũ trước khi xác nhận migration hoàn tất.

## localStorage, sessionStorage và draft

- Storage key dùng lâu dài MUST được định nghĩa tập trung.
- Payload có cấu trúc SHOULD có schema version và timestamp.
- Parse storage MUST được bọc lỗi; dữ liệu hỏng chỉ được xóa đúng key bị lỗi.
- Không gọi `localStorage.clear()` hoặc `sessionStorage.clear()` nếu chỉ cần xóa key của ứng dụng hoặc phiên hiện tại.
- Logout MUST không xóa dữ liệu khác domain không thuộc ứng dụng.
- Draft của giáo viên MUST được giữ qua lỗi mạng, refresh hợp lệ và validation failure khi nghiệp vụ cho phép.
- Khi thay schema cache, MUST có migration hoặc invalidation có mục tiêu, không xóa toàn bộ theo mặc định.

## Network và concurrency

- UI MUST thể hiện request đang chạy và chống gửi trùng cho thao tác ghi.
- Search/filter request SHOULD có debounce và cơ chế bỏ qua response cũ.
- Request quan trọng MUST có timeout hoặc fallback phù hợp; không để loading vô hạn.
- Retry chỉ áp dụng cho lỗi tạm thời và thao tác idempotent, với số lần giới hạn.
- Không tự retry thao tác xóa hoặc ghi có thể tạo bản ghi trùng.
- Realtime listener MUST được unsubscribe khi đổi scope, logout hoặc component không còn dùng.
- MUST tránh tạo nhiều listener trùng cho cùng dữ liệu.

## Validation và lỗi

- Validate tại UI để phản hồi nhanh và tại security/backend boundary để bảo vệ dữ liệu.
- MUST trim và chuẩn hóa input phù hợp trước khi so sánh trùng.
- Không dựa vào placeholder như giá trị hoặc label.
- Khi ghi thất bại, UI MUST giữ input và cung cấp cách thử lại.
- Success chỉ hiển thị sau khi write được xác nhận.
- Partial failure MUST nêu rõ phần nào thành công, phần nào chưa.

## Xóa và khôi phục

- Destructive action MUST nêu rõ đối tượng bị ảnh hưởng.
- SHOULD ưu tiên soft delete hoặc lưu lịch sử khi chi phí hợp lý và dữ liệu quan trọng.
- Bulk delete MUST có preview/count trước khi xác nhận.
- Cleanup job MUST có dry-run trước khi thực thi thật.
- Sau khi xóa, MUST cập nhật UI và cache theo kết quả server, không chỉ xóa khỏi DOM.

## Definition of done cho thay đổi dữ liệu

- Đã kiểm tra đường dữ liệu cũ và mới.
- Đã kiểm tra lỗi mạng và double submit.
- Đã xác nhận không tăng quyền ngoài ý muốn.
- Đã xác nhận logout/cache cleanup chỉ tác động đúng key.
- Đã ghi rõ migration, rollback hoặc lý do không cần migration.
