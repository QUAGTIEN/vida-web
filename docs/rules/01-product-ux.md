# Product and UX Rules

## Mục tiêu

Thiết kế phải tạo cảm giác đây là công cụ nghiệp vụ đáng tin cậy dành cho giáo viên và quản lý: rõ việc, ít nhiễu, dùng nhanh và không phô diễn kỹ thuật.

## Thứ tự ưu tiên

Khi có xung đột, ưu tiên theo thứ tự:

1. Hiểu đúng và hoàn thành tác vụ.
2. Không gây nhầm lẫn hoặc mất dữ liệu.
3. Khả năng đọc và khả năng thao tác.
4. Tính nhất quán.
5. Tính thẩm mỹ.

## Thiết kế không bị "AI hóa"

- MUST có lý do chức năng cho mỗi màu nhấn, icon, card, badge và animation.
- MUST không thêm gradient, glassmorphism, glow, hiệu ứng 3D hoặc bóng đổ mạnh chỉ để tạo cảm giác hiện đại.
- MUST không bọc mọi nhóm nội dung trong card. Dùng khoảng trắng, divider và heading khi đủ tạo phân cấp.
- MUST không lạm dụng pill, badge nhiều màu, icon trang trí, tiêu đề in hoa hoặc góc bo quá lớn.
- MUST không tạo dashboard với số liệu, biểu đồ hoặc shortcut giả chỉ để lấp đầy không gian.
- MUST không tự redesign toàn màn hình khi yêu cầu chỉ liên quan một lỗi hoặc một component.
- SHOULD ưu tiên bề mặt trắng/trung tính, border rõ và shadow nhẹ.
- SHOULD dùng chữ xanh đậm trên nền sáng, xanh dương cho hành động chính và màu phụ chỉ cho trạng thái có ý nghĩa.
- SHOULD giữ một ngôn ngữ thiết kế xuyên suốt thay vì mỗi section có một phong cách riêng.

## Bộ màu VIDA

- Nền sáng `#F5FAFF`, bề mặt trắng `#FFFFFF`; không dùng nền xám tối hoặc nhiều gradient.
- Màu chủ đạo `#0066D6`, hover `#0052B8`, nền nhấn nhẹ `#EAF4FF`.
- Thanh menu desktop/mobile dùng nền `#E3EFFF`, chữ `#244563`, icon `#557B9F`, viền `#C5DAF3`, hover `#D0E4FF`. Mục đang chọn nền `#0066D6`, chữ/icon trắng; giữ nguyên vị trí, kích thước vùng bấm và luồng điều hướng.
- Đăng xuất dùng nền đỏ `#D92D20`, hover `#B42318` và chữ trắng trên desktop/mobile. Trong trang Nhận xét, nút Chỉnh cấu trúc dùng xám trung tính; ô tìm nhanh dùng nền `#EAF4FF`, ô nhập nội dung chung dùng nền `#E9F6F3`.
- Thẻ chọn cơ sở trong trang Nhận xét chỉ hiển thị tên cơ sở, không có nhãn TDT. Tiêu đề phiếu xuất là `TRUNG TÂM NGOẠI NGỮ VIDA` và không hiển thị logo trong góc phiếu; logo ứng dụng ở menu, màn tải và favicon vẫn giữ nguyên.
- Card nội dung dùng nền trắng; nền trung tính nhẹ `#F8FAFC`/`#F2F5F9` chỉ phân lớp header, nhãn và thao tác phụ. Không tô xanh toàn bộ các bề mặt.
- Ba shortcut Trang chủ căn trái, có kích thước lớn và dùng nền màu tươi toàn thẻ: Hệ thống tím `#A437C3`, QL GV xanh ngọc `#0080A3`, Xuất File cam `#C65305`. Chữ và icon dùng màu trắng dễ đọc; giữ nguyên tên, thứ tự và thao tác của từng shortcut trên desktop lẫn mobile.
- Cột nhãn phiếu đánh giá dùng năm sắc xanh dương đậm dần từ Tháng đến Nhận xét: `#2276C4`, `#1268B8`, `#075AAB`, `#064C94`, `#063E7A`; chữ trắng, nền dữ liệu giữ nguyên. Palette này do `evaluation.css` sở hữu, không thay đổi mẫu xuất file.
- Chữ chính `#16324F`, chữ phụ `#61758A`, viền `#DCEBFA`. Chữ nhỏ trên nền nhấn dùng chữ chính để giữ độ tương phản.
- Dùng token trong `src/css/sections/base.css`; các tên token legacy được giữ làm alias để không đổi contract.
- Logo VIDA giữ nguyên màu xanh lá/đỏ riêng; không lấy hai màu logo làm bộ màu giao diện.
- Giữ màu ngữ nghĩa cho lỗi, cảnh báo và xác nhận thành công. Đổi màu không được thay đổi nội dung, bố cục hoặc chức năng.

## Phân cấp và bố cục

- Tiêu đề bốn phân hệ dùng chung `20px`, độ đậm `800`, line-height `1.3`, màu xanh than trên cả desktop/mobile; không có gạch ngang dưới tiêu đề. Typography được sở hữu tại `base.css`, không ghi đè riêng ở từng màn.
- Khoảng cách dưới tiêu đề dùng token `--page-heading-gap`; giữ nguyên nhãn, DOM ID và luồng điều hướng.

- Mỗi màn hình MUST có một mục tiêu chính và tối đa một primary action nổi bật tại cùng thời điểm.
- Thứ tự đọc MUST phản ánh thứ tự làm việc thực tế.
- Các thao tác nguy hiểm MUST tách khỏi thao tác thường và dùng nhãn cụ thể.
- Nội dung liên quan MUST được nhóm gần nhau; khoảng cách giữa các nhóm phải lớn hơn khoảng cách bên trong nhóm.
- SHOULD dùng một thang spacing nhất quán dựa trên bội số 4px.
- SHOULD dùng cùng chiều cao, radius và kiểu focus cho các control cùng cấp.
- Không dùng màu đỏ cho navigation, trạng thái active hoặc hành động trung tính.

## Nội dung và tiếng Việt

- Copy MUST ngắn, tự nhiên và mô tả đúng hành động.
- MUST dùng nhất quán một thuật ngữ cho cùng khái niệm. Ví dụ không xen kẽ "Xem đánh giá", "Xem phiếu" và "Tra cứu" nếu cùng một chức năng.
- Nút MUST bắt đầu bằng động từ rõ ràng: `Lưu nhận xét`, `Xem phiếu`, `Thêm học sinh`.
- Thông báo lỗi MUST nêu vấn đề và bước tiếp theo khi có thể.
- Empty state MUST giải thích vì sao chưa có dữ liệu và người dùng có thể làm gì.
- Không dùng câu quảng cáo chung chung như "trải nghiệm tuyệt vời", "quản lý thông minh" hoặc "khám phá ngay".
- Không dùng emoji thay icon hệ thống trong giao diện nghiệp vụ, trừ khi emoji là nội dung người dùng nhập.

## Trạng thái và phản hồi

Mỗi luồng có dữ liệu MUST xác định các trạng thái áp dụng:

- Loading: cho biết đang xử lý gì; ngăn gửi lặp khi cần.
- Empty: không được giống lỗi hoặc màn hình hỏng.
- Error: giữ dữ liệu người dùng đã nhập và đưa ra cách thử lại.
- Success: xác nhận đúng đối tượng và hành động đã hoàn tất.
- Disabled: có lý do dễ hiểu khi người dùng cần biết.
- Unsaved: cảnh báo trước khi rời màn hình nếu có nguy cơ mất dữ liệu.

Không hiển thị success trước khi thao tác bất đồng bộ thực sự hoàn tất.

## Accessibility cơ bản

- Màu sắc MUST không phải tín hiệu duy nhất của trạng thái.
- Icon-only button MUST có accessible name.
- Focus state MUST nhìn thấy được.
- Label MUST liên kết đúng với form control.
- Modal MUST có tên, vai trò dialog phù hợp và cơ chế đóng rõ ràng.
- SHOULD hỗ trợ thao tác bàn phím cho mọi hành động có thể click.

## Tiêu chí chấp nhận UI

Một thay đổi UI chỉ đạt khi reviewer trả lời được:

- Người dùng biết mình đang ở đâu không?
- Hành động chính có rõ không?
- Có thành phần trang trí nào không phục vụ tác vụ không?
- Trạng thái lỗi, trống và đang tải có được xử lý không?
- Thành phần mới có giống cùng một sản phẩm với phần còn lại không?
- Thiết kế có còn rõ ràng khi bỏ hết animation và shadow không?
