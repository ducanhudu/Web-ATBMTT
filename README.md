# ATTT Focus

Website ôn tập trắc nghiệm An toàn và Bảo mật thông tin, xây dựng bằng React,
TypeScript và Vite.

## Chạy dự án

```powershell
npm install
npm run dev
```

Mở địa chỉ Vite hiển thị trong terminal, mặc định là
`http://localhost:5173`.

## Build production

```powershell
npm run lint
npm run build
npm run preview
```

## Nhập lại dữ liệu Word

Mặc định script đọc file:

`C:\Users\DucAnh\Downloads\Ôn tập trắc nghiệm_1_1.docx`

```powershell
npm run import:docx
```

Có thể truyền đường dẫn khác:

```powershell
powershell -ExecutionPolicy Bypass -File tools\import-docx.ps1 `
  -InputPath "D:\duong-dan\bo-cau-hoi.docx"
```

Kết quả:

- `src/data/questions.json`: câu hỏi hợp lệ dùng trong website.
- `src/data/import-report.json`: câu bị bỏ qua, câu trùng và thống kê chủ đề.

Trình nhập chỉ nhận câu có đúng bốn lựa chọn và duy nhất một đáp án được đánh
dấu bằng in đậm hoặc gạch chân.
