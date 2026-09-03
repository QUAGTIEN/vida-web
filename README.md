# VIDA Student Processing Tracker

Ứng dụng web hỗ trợ giáo viên và quản lý theo dõi học sinh, nhập nhận xét và xuất phiếu đánh giá cho trung tâm VIDA.

## Cấu trúc chính

- `index.html`: giao diện tĩnh của ứng dụng.
- `src/`: JavaScript và CSS phía trình duyệt.
- `functions/`: Firebase Cloud Functions.
- `firestore.rules`: quy tắc truy cập Firestore.
- `firebase.json`: cấu hình Firebase CLI.

## Cấu hình Firebase VIDA

Repository đã kết nối với Firebase project riêng của VIDA (`vida-web-9ec43`). Khi thiết lập một môi trường mới:

1. Tạo Firebase project riêng cho VIDA.
2. Bật Firestore Database và Email/Password Authentication.
3. Cập nhật cấu hình Web App trong `src/js/config/firebase.js` nếu dùng Firebase project khác.
4. Cập nhật project alias trong `.firebaserc` nếu dùng Firebase project khác.
5. Trong thư mục `functions`, chạy `npm ci` để cài dependency.

Không đưa backup dữ liệu học sinh, `node_modules`, file log hoặc cấu hình máy cá nhân lên repository.

## Lưu ý trước khi triển khai thật

`firestore.rules` đang giữ cơ chế tương thích của hệ thống gốc, trong đó giáo viên chưa dùng Firebase Authentication cho một số luồng. Cần rà soát và kiểm thử lại quyền đọc/ghi trước khi đưa dữ liệu học sinh VIDA vào sử dụng chính thức.

## Kiểm tra JavaScript

```powershell
Get-ChildItem src/js -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
npm --prefix functions run check
```
