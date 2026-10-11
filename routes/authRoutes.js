const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const db = require("../db/database");
const { JWT_SECRET, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

// Lưu trữ Captcha tạm thời trong bộ nhớ (tự hết hạn sau 5 phút)
const captchaStore = new Map();

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 phút
  max: 15, // Tối đa 15 lần thử đăng nhập trong 5 phút
  message: {
    success: false,
    message: "Quá nhiều lần đăng nhập sai! Vui lòng thử lại sau 5 phút.",
  },
});

// Tạo mã Captcha chống brute-force
router.get("/captcha", (req, res) => {
  const num1 = Math.floor(Math.random() * 9) + 1;
  const num2 = Math.floor(Math.random() * 9) + 1;
  const captchaId = crypto.randomBytes(8).toString("hex");

  captchaStore.set(captchaId, {
    answer: String(num1 + num2),
    expires: Date.now() + 5 * 60 * 1000,
  });

  // Dọn dẹp captcha hết hạn
  for (const [k, v] of captchaStore.entries()) {
    if (v.expires < Date.now()) captchaStore.delete(k);
  }

  res.json({
    success: true,
    captchaId,
    question: `${num1} + ${num2} = ?`,
  });
});

// Đăng nhập Admin / Reseller
router.post("/login", loginLimiter, (req, res) => {
  const { username, password, captchaId, captchaAnswer } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập đầy đủ tài khoản và mật khẩu!",
    });
  }

  // Kiểm tra Captcha nếu được gửi lên
  if (captchaId) {
    const record = captchaStore.get(captchaId);
    captchaStore.delete(captchaId);
    if (!record || record.expires < Date.now() || String(captchaAnswer).trim() !== record.answer) {
      return res.status(400).json({
        success: false,
        message: "Mã bảo vệ (Captcha) không chính xác!",
      });
    }
  }

  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(String(username).trim());

  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({
      success: false,
      message: "Sai tên đăng nhập hoặc mật khẩu!",
    });
  }

  if (!user.is_active) {
    return res.status(403).json({
      success: false,
      message: "Tài khoản Đại lý của bạn đang tạm khóa!",
    });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  res.json({
    success: true,
    message: "Đăng nhập thành công!",
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      credits: user.credits,
    },
  });
});

// Lấy thông tin tài khoản hiện tại
router.get("/me", verifyToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

module.exports = router;
