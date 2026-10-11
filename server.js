const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const keyRoutes = require("./routes/keyRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ file tĩnh trong public/
app.use(express.static(path.join(__dirname, "public")));

// Mount API Routes
app.use("/api/auth", authRoutes);
app.use("/api", keyRoutes);
app.use("/api", userRoutes);

// Route vào trang Quản trị Web Admin (/ và /admin)
app.get(["/", "/admin"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Chỉ chạy app.listen khi chạy trực tiếp trên máy hoặc VPS (không phải Vercel Serverless)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log("==========================================================");
    console.log(`🚀 FF SERVER KEY & WEB ADMIN RUNNING ON PORT ${PORT}`);
    console.log(`🔑 Web Admin Panel : http://localhost:${PORT}/admin`);
    console.log(`🔌 API Verify APK  : http://localhost:${PORT}/api/key/verify`);
    console.log("👤 Super Admin     : admin / admin123456");
    console.log("👤 Reseller        : reseller / reseller123");
    console.log("==========================================================");
  });
}

module.exports = app;
