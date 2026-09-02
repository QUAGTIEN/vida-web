# Frontend Code Rules

## Mục tiêu

Code phải dễ định vị, dễ đọc diff và dễ thay đổi mà không tạo thêm lớp vá. Ưu tiên sửa nguyên nhân gốc với phạm vi nhỏ nhất.

## Quyền sở hữu file

- `index.html`: semantic structure và markup tĩnh. Không thêm inline style hoặc inline handler mới.
- `src/js/app.js`: orchestration và legacy bridge. Feature mới SHOULD đặt trong `src/js/features/` hoặc `src/js/ui/`.
- `src/js/features/`: mỗi module sở hữu một capability nghiệp vụ.
- `src/js/ui/`: interaction, feedback và control dùng chung; không chứa Firestore business rules.
- `src/js/core/`: helper thuần, không phụ thuộc DOM hoặc network khi có thể.
- `src/css/sections/base.css`: token và primitive dùng chung.
- Các CSS section khác: style thuộc đúng feature/component; không dùng như nơi chứa override tổng hợp.

## JavaScript

- Mỗi hàm MUST có một trách nhiệm chính và tên phản ánh kết quả hoặc hành động.
- MUST tránh copy/paste logic. Trích helper khi cùng quy tắc nghiệp vụ xuất hiện từ hai nơi trở lên.
- MUST dùng `const` mặc định; chỉ dùng `let` khi có gán lại.
- MUST không tạo global `window.*` mới nếu module import/export hoặc event binding giải quyết được.
- Khi buộc phải thêm legacy global, MUST đặt implementation trong module và expose một wrapper mỏng có comment lý do.
- MUST không chèn business logic dài trong template string, `onclick` hoặc callback DOM lồng sâu.
- MUST tách render, đọc input, validation và persistence khi chúng có thể thay đổi độc lập.
- MUST dùng constants cho collection name, storage key, timeout, breakpoint và trạng thái dùng nhiều nơi.
- MUST escape dữ liệu người dùng trước khi đưa vào `innerHTML`. Ưu tiên `textContent` và DOM API khi markup động không cần thiết.
- MUST xử lý null cho phần tử tùy chọn; phần tử bắt buộc SHOULD fail rõ trong development thay vì âm thầm bỏ qua.

## Async và lỗi

- Async action MUST có đường success, error và cleanup rõ ràng.
- Nút khởi chạy request MUST được khóa hoặc chống gửi lặp khi thao tác không idempotent.
- MUST dùng `finally` để phục hồi loading/disabled state khi phù hợp.
- MUST ngăn response cũ ghi đè state mới đối với search, filter và điều hướng nhanh.
- Không dùng `catch {}` rỗng. Nếu lỗi có thể bỏ qua, comment phải giải thích vì sao an toàn.
- Thông báo cho người dùng MUST không lộ stack trace hoặc thông tin nội bộ.
- Console log production chỉ dùng cho lỗi có ích khi chẩn đoán; không log dữ liệu nhạy cảm.

## DOM và accessibility

- Hành động click MUST dùng `button` hoặc `a`, không dùng `div`/heading giả nút.
- Button trong hoặc có thể nằm trong form MUST khai báo `type` rõ ràng.
- Input/select/textarea MUST có label liên kết hoặc accessible name tương đương.
- Icon-only button MUST có `aria-label`; icon trang trí SHOULD có `aria-hidden="true"`.
- Tab, accordion và dialog MUST cập nhật ARIA state cùng visual state.
- Event listener SHOULD được gắn trong module thay vì thêm inline event handler.

## CSS

- Một component MUST có một stylesheet sở hữu style chính.
- MUST chỉnh rule nguồn thay vì nối thêm một khối override ở cuối file.
- Không thêm `!important` trừ legacy boundary không thể xử lý an toàn trong phạm vi; ngoại lệ MUST có comment giải thích selector đang bị ghi đè và kế hoạch gỡ bỏ.
- Không thêm inline style cho trạng thái có thể biểu diễn bằng class hoặc thuộc tính semantic.
- SHOULD tránh selector ID và selector lồng sâu hơn ba cấp cho code mới.
- MUST dùng token chung cho màu, spacing, radius, shadow và control height khi giá trị mang tính hệ thống.
- Không định nghĩa cùng một responsive behavior ở nhiều `@media` block khác nhau.
- MUST không dùng fixed height cho nội dung có text thay đổi, trừ control một dòng hoặc vùng có overflow được thiết kế rõ.
- SHOULD dùng `min()`, `max()`, `clamp()` và grid/flex linh hoạt thay cho pixel positioning.
- Hover style MUST không phải phản hồi duy nhất; mobile cần active/focus feedback phù hợp.

## HTML và template

- Markup MUST giữ heading hierarchy hợp lý.
- ID MUST duy nhất và ổn định nếu được JavaScript hoặc label tham chiếu.
- Không thêm dependency CDN mới nếu tính năng có thể thực hiện nhỏ gọn bằng nền tảng sẵn có.
- Dependency mới MUST có lý do, phiên bản cố định và đánh giá ảnh hưởng tải trang.
- Nội dung được tạo bằng template string MUST dùng helper escape hiện có cho dữ liệu không tin cậy.

## Dễ review

- Diff MUST chỉ chứa thay đổi phục vụ cùng một mục tiêu.
- Không format, đổi tên hoặc sắp xếp lại code không liên quan.
- Không đổi public function, DOM ID, storage key hoặc CSS contract mà không cập nhật toàn bộ nơi dùng và ghi rõ trong bàn giao.
- Refactor SHOULD tách khỏi thay đổi hành vi khi có thể.
- Comment giải thích `why`, constraint hoặc workaround; không lặp lại điều code đã nói.
- Không để code chết, selector không dùng hoặc TODO không có ngữ cảnh sau khi hoàn tất.

## Quy tắc dành riêng cho legacy source hiện tại

- Không làm `app.js` lớn hơn bằng feature độc lập mới.
- Không tạo thêm lớp "enhancement" hoặc "final fix" chỉ để override CSS cũ.
- Khi chạm vào component có nhiều rule trùng, SHOULD hợp nhất ownership trong phạm vi component nếu rủi ro kiểm thử chấp nhận được.
- Không refactor toàn bộ legacy architecture trong một yêu cầu UI nhỏ.
- Giữ backward compatibility cho các hàm `window.*` đang được inline markup gọi cho đến khi migration markup và listener hoàn tất cùng thay đổi.
