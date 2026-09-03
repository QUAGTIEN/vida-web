# Mobile UI Rules

## Phạm vi

Áp dụng cho mọi thay đổi hiển thị hoặc tương tác ở viewport không lớn hơn 768px. Mobile là bề mặt sử dụng chính, không phải phiên bản desktop bị thu nhỏ.

## Viewport và reflow

- MUST hỗ trợ chiều rộng 320px mà không mất chức năng.
- MUST kiểm tra tối thiểu ở 320x568, 375x812 và 390x844.
- SHOULD kiểm tra 430px và landscape cho màn hình có form hoặc modal.
- MUST cho phép người dùng pinch zoom; không dùng `user-scalable=no` hoặc giới hạn `maximum-scale` cố định trong HTML. Theo yêu cầu giữ nguyên cỡ chữ khi sửa lỗi tự zoom, `mobile-focus-viewport.js` chỉ tạm giới hạn ở tỷ lệ hiện tại lúc focus ô nhập trên iOS; khôi phục viewport trước pinch/gesture, khi blur, hủy chạm hoặc rời trang. Không dùng workaround này để khóa zoom chủ động, thay đổi font-size hoặc scale giao diện bằng CSS. Cần kiểm thử lại trên iPhone/Safari và bản cài màn hình chính khi thay đổi guard.
- MUST không có cuộn ngang toàn trang.
- Chỉ bảng, timeline hoặc dữ liệu rộng có chủ đích MAY cuộn ngang và phải có dấu hiệu dễ nhận biết.
- MUST không dùng `overflow-x: hidden` để che phần tử tràn do lỗi layout.
- Fixed header, bottom navigation và modal MUST xét `env(safe-area-inset-top)` và `env(safe-area-inset-bottom)`.

## Kích thước và khả năng đọc

- Vùng bấm chính SHOULD tối thiểu 44x44 CSS px.
- Nút icon nhỏ hơn 44px MUST có hit area vô hình đủ lớn và khoảng cách tránh bấm nhầm.
- Input, select và primary button SHOULD cao 44-48px.
- Body text MUST không nhỏ hơn 13px; SHOULD ở 14-16px.
- Supporting label MAY nhỏ hơn nhưng MUST còn đọc rõ ở 320px và không dùng để chứa thông tin thiết yếu.
- Không giảm chữ xuống 8-10px để cố nhét thêm cột hoặc badge.
- Tên học sinh và dữ liệu quan trọng MUST không bị cắt mà không có cách xem đầy đủ.

## Navigation

- Bottom navigation SHOULD có 3-5 mục thường xuyên nhất.
- Mỗi item MUST dùng phần tử semantic như `button` hoặc `a`.
- Item active MUST khác item thường bằng nhiều hơn một tín hiệu hợp lý, ví dụ màu kết hợp indicator hoặc font weight.
- Mọi đường mở màn hình MUST đồng bộ active state và page title.
- Mục trung tính MUST không dùng màu nguy hiểm.
- Nút Back MUST quay lại đúng cấp trong luồng, không mặc định nhảy về trang chủ nếu người dùng đang ở một sub-step xác định.
- Chuyển tab MUST không làm mất draft im lặng.

## Header

- Header SHOULD hiển thị tên màn hình hiện tại thay vì lặp một tên thương hiệu dài.
- Logo hoặc tên viết tắt MAY dùng để nhận diện thương hiệu nếu không chiếm không gian của tiêu đề tác vụ.
- Nút hai bên header MUST cân bằng vùng chiếm chỗ để tiêu đề thực sự nằm giữa.
- Header sticky MUST không che anchor, dropdown hoặc nội dung được scroll vào view.

## Form và bàn phím ảo

- Form đăng nhập và form nhập liệu MUST submit được bằng action key của bàn phím khi phù hợp.
- Label MUST liên kết với control bằng `for`/`id` hoặc wrapping label.
- MUST đặt `autocomplete`, `inputmode` và kiểu input phù hợp khi có lợi.
- Khi bàn phím mở, input đang focus và primary action MUST có thể tiếp cận.
- Bottom navigation SHOULD ẩn hoặc dịch chuyển có chủ đích khi bàn phím che nội dung.
- Dữ liệu đã nhập MUST được giữ khi validation lỗi, request lỗi hoặc chuyển sub-step có thể quay lại.
- Nút submit MUST chống double tap trong khi request đang chạy.

## List, card và bảng

- Danh sách có tên người dùng SHOULD ưu tiên list một cột hoặc grid hai cột; grid ba cột chỉ dùng khi nội dung rất ngắn.
- Một card MUST không chứa quá nhiều icon-only actions sát nhau. Chuyển action phụ vào menu khi cần.
- Thao tác xóa MUST tách khỏi thao tác xem/sửa và có xác nhận.
- Bảng ngang MUST giữ cột nhận diện hoặc cung cấp summary trước bảng nếu việc cuộn làm mất ngữ cảnh.
- Nội dung có thể chọn/copy MUST không bị vô hiệu hóa selection ngoài vùng drag handle.

## Modal, sheet và overlay

- Modal MUST vừa trong visual viewport hoặc có body cuộn độc lập.
- MUST kiểm tra modal khi bàn phím mở và ở landscape.
- Primary action SHOULD nằm cuối thứ tự đọc; destructive action không được đặt mặc định tại vị trí dễ bấm nhầm.
- Overlay MUST ngăn tương tác nền, có tên dialog và quản lý focus hợp lý.
- Escape SHOULD đóng modal trên thiết bị có bàn phím; focus SHOULD trở về control đã mở modal.

## Motion và cảm giác thao tác

- Motion MUST giải thích thay đổi trạng thái, không chỉ trang trí.
- Transition thông thường SHOULD nằm trong khoảng 150-220ms.
- Không animation lại toàn section sau từng thao tác nhỏ.
- MUST tôn trọng `prefers-reduced-motion` cho animation không thiết yếu.
- Touch feedback phải rõ nhưng không làm control dịch chuyển mạnh gây cảm giác layout rung.

## Checklist mobile bắt buộc

- Không có nội dung bị bottom nav hoặc safe area che.
- Không có chữ thiết yếu nhỏ hơn mức đọc thoải mái.
- Không có hai destructive/primary actions quá gần nhau.
- Active navigation đúng ở mọi đường mở màn hình.
- Back hoạt động đúng ở root, sub-step và modal.
- Form dùng được khi bàn phím mở.
- Scroll dọc, scroll ngang có chủ đích và drag không tranh gesture với nhau.
