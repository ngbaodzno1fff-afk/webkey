const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { readDb } = require("../db/database");
const { JWT_SECRET, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 25,
  message: {
    success: false,
    message: "Quá nhiều lần đăng nhập sai! Vui lòng thử lại sau 5 phút.",
  },
});

function signCaptchaAnswer(answer) {
  return crypto
    .createHmac("sha256", JWT_SECRET)
    .update(String(answer).trim())
    .digest("hex");
}

// Tạo mã Captcha Stateless (tương thích 100% Vercel Serverless)
router.get("/captcha", (req, res) => {
  const num1 = Math.floor(Math.random() * 9) + 1;
  const num2 = Math.floor(Math.random() * 9) + 1;
  const answer = String(num1 + num2);
  const captchaId = signCaptchaAnswer(answer);

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

  // Kiểm tra Captcha Stateless HMAC
  if (captchaId) {
    const expectedSig = signCaptchaAnswer(captchaAnswer || "");
    if (captchaId !== expectedSig) {
      return res.status(400).json({
        success: false,
        message: "Mã bảo vệ (Captcha) không chính xác!",
      });
    }
  }

  const state = readDb();
  const cleanUser = String(username).trim().toLowerCase();
  const user = state.users.find((u) => u.username.toLowerCase() === cleanUser);

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
