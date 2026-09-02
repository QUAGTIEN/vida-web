# Quality Gates

## Nguyên tắc

Không dùng một checklist máy móc cho mọi thay đổi. Chọn mức kiểm thử theo rủi ro, nhưng MUST ghi lại kiểm tra đã chạy và kết quả thật.

## Phân loại rủi ro

### Thấp

Copy, màu, spacing hoặc style cục bộ không đổi hành vi.

MUST:

- Review diff.
- Kiểm tra viewport liên quan.
- Xác nhận không có lỗi console mới nếu có thể chạy giao diện.

### Trung bình

Thay đổi component, navigation, form, filter, async read hoặc nhiều file UI.

MUST:

- Chạy static checks.
- Kiểm tra luồng chính và trạng thái phụ liên quan.
- Test mobile ở ít nhất 320px và một viewport phổ biến.
- Kiểm tra keyboard/focus nếu có form hoặc modal.

### Cao

Authentication, Firestore write/rules, xóa dữ liệu, migration, cache schema hoặc luồng lưu nhận xét.

MUST:

- Có kế hoạch và acceptance criteria trước khi sửa.
- Kiểm tra success, failure, retry/double submit và backward compatibility.
- Có backup/rollback hoặc giải thích rõ vì sao không áp dụng.
- Không thực thi trên dữ liệu thật nếu chưa được phép.

## Static checks tối thiểu

- Chạy `node --check` cho mọi JavaScript đã thay đổi; với refactor module chung, SHOULD kiểm tra toàn bộ `src/js/**/*.js`.
- Kiểm tra CSS có syntax hợp lệ và không lệch block.
- Kiểm tra HTML không có ID trùng.
- Kiểm tra mọi local asset/import mới tồn tại và tải đúng MIME type.
- Tìm reference cũ khi đổi ID, function name, storage key, class contract hoặc collection/field.
- Review số lượng `!important`, inline style, inline handler và global mới; mặc định không được tăng.

Nếu repository chưa có test runner cho một kiểm tra bắt buộc, MUST thực hiện kiểm tra thủ công tương ứng và ghi rõ giới hạn. Không được bỏ qua im lặng.

## Ma trận mobile tối thiểu

Khi thay đổi UI mobile, kiểm tra:

| Viewport | Mục đích |
| --- | --- |
| 320x568 | Chiều rộng tối thiểu, chữ và vùng bấm |
| 375x812 | Điện thoại phổ biến |
| 390x844 | Thiết bị phổ biến có safe area |
| Landscape phù hợp | Form, modal, keyboard và scroll |

MUST kiểm tra không có:

- Cuộn ngang toàn trang.
- Nội dung bị header/bottom nav che.
- Nút hoặc label bị cắt.
- Dropdown/modal nằm ngoài visual viewport.
- Active navigation sai.
- Draft mất khi Back hoặc chuyển sub-step.

## Luồng nghiệp vụ cốt lõi

### Giáo viên

- Chọn vai trò.
- Chọn cơ sở, khối, lớp và lịch.
- Tìm/thêm học sinh.
- Nhập, lưu tạm, tạo báo cáo và lưu nhận xét.
- Quay lại từng bước mà không mất dữ liệu ngoài ý muốn.
- Xem phiếu và quay lại tìm kiếm.

### Quản lý

- Đăng nhập, gồm submit bằng bàn phím nếu có form.
- Dashboard và active navigation.
- Quản lý cơ sở/giáo viên/danh sách.
- Tìm và xem đánh giá.
- Data center nếu thay đổi có liên quan.
- Đăng xuất và cleanup đúng phạm vi.

Không cần chạy toàn bộ ma trận nếu thay đổi hoàn toàn không liên quan, nhưng MUST chạy các luồng có dependency trực tiếp hoặc dùng chung component.

## Trạng thái bắt buộc theo phạm vi

- Loading.
- Empty.
- Validation error.
- Network/server error.
- Success.
- Disabled/loading button.
- Double click/tap.
- Back/cancel.
- Refresh hoặc restore state nếu feature có persistence.

## Review diff cuối

Trước khi bàn giao, MUST xác nhận:

- Diff chỉ chứa thay đổi trong phạm vi.
- Không ghi đè thay đổi không liên quan của người dùng.
- Không có debug log, mock data hoặc code chết mới.
- Không có selector override tạm thời thiếu giải thích.
- Không có câu tuyên bố kiểm thử vượt quá bằng chứng thực tế.
- Tài liệu/rule được cập nhật nếu thay đổi contract lâu dài của dự án.

## Mẫu bàn giao

- `Kết quả:` điều gì đã hoàn tất.
- `Đã đổi:` các file hoặc khu vực chính.
- `Đã kiểm tra:` lệnh, viewport và luồng đã chạy cùng kết quả.
- `Chưa kiểm tra/Rủi ro:` giới hạn còn lại, nếu có.
