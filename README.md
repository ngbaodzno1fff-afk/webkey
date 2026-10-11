# 🔑 FF License Key Server & Web Admin Panel

Hệ thống **Quản lý & Tạo License Key (Web Admin / Key Generator Panel)** kết hợp sẵn giao diện **Client Android APK (Màn hình dọc Đỏ - Đen)**.

---

## 📁 1. Cấu trúc Dự án (`c:\Users\Administrator\Downloads\apkff`)

```text
apkff/
├── server.js                  # Backend Node.js (Express.js) chuẩn Production / Render / Railway
├── server.py                  # Backend Python 3.12 (Chạy ngay trên Windows không cần cài đặt thêm)
├── package.json               # Khai báo thư viện Node.js (express, better-sqlite3, bcryptjs, jsonwebtoken...)
├── render.yaml                # Cấu hình Deploy 1-click miễn phí lên Render.com
├── db/
│   └── database.js            # Khởi tạo SQLite Database & Tài khoản Admin mặc định
├── middleware/
│   └── authMiddleware.js      # Bảo mật JWT Token & Phân quyền Super Admin / Reseller
├── routes/
│   ├── authRoutes.js          # API Đăng nhập, Captcha chống dò mật khẩu, Rate-limiting
│   ├── keyRoutes.js           # API Tạo Key lẻ/hàng loạt, Quản lý Key, Reset HWID, Gia hạn, Khóa & Verify APK
│   └── userRoutes.js          # API Quản lý Đại lý (Reseller) & Cấp hạn mức Credit
├── public/
│   ├── admin.html             # Giao diện Web Admin Dark Mode Gaming (Đen - Đỏ/Cam Neon)
│   ├── admin.css              # Stylesheet hiệu ứng Neon & Glassmorphism
│   └── admin.js               # Xử lý Dashboard, Biểu đồ, Tạo Key, Copy 1 chạm & Xuất file .TXT
├── index.html                 # Giao diện APK Client (Màn 1 Nhập Key -> Màn 2 Thành công)
├── style.css                  # Hiệu ứng nền Đỏ - Đen Gaussian Blur dọc (Portrait 9:16)
├── app.js                     # Logic Client APK kết nối trực tiếp tới POST /api/key/verify
├── avatar.jpg                 # Ảnh Avatar bo góc trên màn hình APK & Admin
└── android/
    ├── MainActivity.java      # Mã nguồn Android WebView + Clipboard Bridge
    └── AndroidManifest.xml    # Cấu hình khóa màn hình dọc (portrait)
```

---

## 👤 2. Tài khoản Mặc định Khi Chạy Lần Đầu

| Cấp độ tài khoản | Tên đăng nhập | Mật khẩu | Quyền hạn |
| :--- | :--- | :--- | :--- |
| **👑 Super Admin** | `admin` | `admin123456` | Toàn quyền hệ thống, tạo key không giới hạn, quản lý mọi key & cấp tài khoản Đại lý |
| **🤝 Đại lý (Reseller)** | `reseller` | `reseller123` | Tạo key theo số dư Credit được cấp, chỉ xem và quản lý các key do chính mình tạo |

---

## 🚀 3. Cách Chạy Thử Trên Máy Tính Cá Nhân (Localhost)

### Cách 1: Chạy ngay bằng Python (Đã cài sẵn trên máy của bạn)
```powershell
python server.py
```

### Cách 2: Chạy bằng Node.js (`express` + `better-sqlite3`)
```powershell
npm install
node server.js
```

Sau khi chạy, mở trình duyệt truy cập:
- **🔑 Trang Web Admin Quản Lý & Tạo Key:** `http://localhost:3000/admin`
- **📱 Giao diện Nhập Key APK (Client Test):** `http://localhost:3000/`
- **🔌 Endpoint API cho APK:** `POST http://localhost:3000/api/key/verify`

---

## 🌐 4. Hướng Dẫn Đưa Website Lên Mạng Miễn Phí (Lấy Domain HTTPS)

### Phương án A: Deploy miễn phí lên Render.com (Khuyên dùng)
1. Đẩy toàn bộ thư mục `apkff` lên một kho chứa (Repository) trên **GitHub**.
2. Đăng nhập vào [https://render.com](https://render.com) -> Bấm **New +** -> Chọn **Web Service**.
3. Kết nối tới Repository GitHub vừa tạo:
   - **Runtime:** `Node` (hoặc `Python 3`)
   - **Build Command:** `npm install` (nếu dùng Python thì để trống)
   - **Start Command:** `node server.js` (hoặc `python server.py`)
4. Bấm **Create Web Service**. Sau 1-2 phút, Render sẽ cấp cho bạn một tên miền có sẵn HTTPS, ví dụ:
   `https://ff-key-server.onrender.com`

### Phương án B: Deploy lên Railway.app
1. Truy cập [https://railway.app](https://railway.app) -> **New Project** -> **Deploy from GitHub repo**.
2. Chọn repo của bạn -> Vào mục **Settings** -> **Networking** -> Bấm **Generate Domain** để nhận domain `https://xxxx.up.railway.app`.

### Phương án C: Chạy trên VPS Ubuntu + Nginx
```bash
sudo apt update && sudo apt install -y nodejs npm nginx
npm install
npm install -g pm2
pm2 start server.js --name ff-key-server
pm2 save && pm2 startup
```

---

## 📱 5. Cách Gắn Domain HTTPS Vào File `app.js` Của APK

Sau khi có domain HTTPS (ví dụ `https://ff-key-server.onrender.com`), bạn mở file `app.js` và sửa dòng `serverApiUrl`:

```javascript
const APP_CONFIG = {
  serverApiUrl: "https://ff-key-server.onrender.com/api/key/verify",
  getKeyUrl: "https://ff-key-server.onrender.com/admin",
  ...
};
```
