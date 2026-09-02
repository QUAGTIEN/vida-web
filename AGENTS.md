# Project Agent Instructions

## Mục tiêu sản phẩm

Đây là hệ thống VIDA Student Processing Tracker dành cho giáo viên và quản lý. Mọi thay đổi phải ưu tiên ba mục tiêu theo thứ tự:

1. Hoạt động đúng và không làm mất dữ liệu.
2. Dễ sử dụng trên điện thoại, rõ ràng và nhất quán.
3. Code gọn, dễ review, dễ bảo trì lâu dài.

Giao diện cần chuyên nghiệp nhưng tiết chế. Không áp dụng phong cách thiết kế chỉ vì đang thịnh hành hoặc vì trông giống sản phẩm do AI tạo.

## Từ khóa quy ước

- `MUST`: bắt buộc. Chỉ được ngoại lệ khi người dùng yêu cầu rõ ràng và phải báo lại rủi ro.
- `SHOULD`: mặc định phải làm; có thể ngoại lệ khi có lý do kỹ thuật cụ thể.
- `MAY`: tùy chọn khi mang lại lợi ích đo được.

## Phạm vi và quyền thay đổi

- Với yêu cầu review, giải thích, chẩn đoán hoặc lập kế hoạch: MUST chỉ đọc, kiểm tra và báo cáo. Không tự sửa code.
- Với yêu cầu sửa, xây dựng hoặc triển khai: MAY sửa các file trong phạm vi và MUST chạy kiểm tra không phá hủy phù hợp.
- MUST xin xác nhận trước khi xóa dữ liệu, đổi schema, thay đổi Firestore rules, thực hiện migration hoặc mở rộng đáng kể ngoài yêu cầu.
- MUST giữ nguyên thay đổi sẵn có của người dùng. Không hoàn tác, format lại hoặc chỉnh file không liên quan.
- MUST nói rõ điều gì đã kiểm tra thực tế và điều gì chưa thể kiểm tra. Không suy đoán rồi trình bày như kết quả đã xác nhận.

## Quy trình làm việc bắt buộc

1. Đọc các file liên quan và truy vết luồng hiện tại trước khi chỉnh sửa.
2. Xác định phạm vi nhỏ nhất giải quyết được nguyên nhân gốc.
3. Với thay đổi nhiều file hoặc rủi ro cao, lập kế hoạch ngắn trước khi sửa.
4. Tái sử dụng module, helper, token và component hiện có khi chúng phù hợp.
5. Không kết hợp refactor không liên quan với sửa lỗi hoặc tính năng đang làm.
6. Chạy quality gates tương ứng với rủi ro.
7. Review diff cuối cùng và bàn giao: kết quả, file đã đổi, kiểm thử, giới hạn và rủi ro còn lại.

## Tài liệu phải đọc theo loại công việc

| Loại thay đổi | Tài liệu bắt buộc |
| --- | --- |
| Copy, bố cục, màu sắc, component, redesign | `docs/rules/01-product-ux.md` |
| Bất kỳ giao diện hoặc tương tác mobile nào | `docs/rules/02-mobile-ui.md` |
| HTML, CSS hoặc JavaScript | `docs/rules/03-frontend-code.md` |
| Firebase, auth, Firestore, cache, localStorage hoặc dữ liệu | `docs/rules/04-data-stability.md` |
| Mọi thay đổi trước khi bàn giao | `docs/rules/05-quality-gates.md` |

Chỉ đọc các tài liệu áp dụng cho công việc. Không sao chép các rule chi tiết trở lại file này.

## Ranh giới kiến trúc hiện tại

- `index.html`: cấu trúc semantic và markup tĩnh.
- `src/js/app.js`: lớp điều phối và legacy integration; không tiếp tục đưa feature độc lập mới vào đây nếu có thể tách module.
- `src/js/features/`: logic theo tính năng.
- `src/js/ui/`: hành vi UI dùng chung.
- `src/js/core/`: helper thuần, định dạng và xử lý dữ liệu dùng chung.
- `src/css/sections/`: stylesheet theo trách nhiệm. Một component SHOULD có một nơi sở hữu style chính.
- `firestore.rules`: bảo mật dữ liệu, không phải file rule cho agent.

## Tiêu chuẩn bàn giao

Phản hồi cuối MUST ngắn gọn và có:

- Kết quả đạt được.
- Các file đã thay đổi.
- Kiểm tra đã chạy và kết quả.
- Điều chưa kiểm tra được hoặc rủi ro còn lại.
