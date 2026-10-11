const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const keyRoutes = require("./routes/keyRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ file tĩnh (Admin Panel & APK Client Preview)
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

// Mount API Routes
app.use("/api/auth", authRoutes);
app.use("/api", keyRoutes);
app.use("/api", userRoutes);

// Route vào trang Quản trị Web Admin (/ và /admin)
app.get(["/", "/admin"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.listen(PORT, () => {
  console.log("==========================================================");
  console.log(`🚀 FF SERVER KEY & WEB ADMIN ĐÃ KHỞI ĐỘNG TẠI PORT ${PORT}`);
  console.log(`🔑 Trang Web Admin Quản Lý Key : http://localhost:${PORT}/admin`);
  console.log(`📱 Giao diện APK Client Test   : http://localhost:${PORT}/`);
  console.log(`🔌 API Verify cho APK          : http://localhost:${PORT}/api/key/verify`);
  console.log(`👤 Tài khoản Super Admin       : admin / admin123456`);
  console.log(`👤 Tài khoản Đại lý (Reseller) : reseller / reseller123`);
  console.log("==========================================================");
});
