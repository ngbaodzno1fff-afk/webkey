const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { loadState } = require("../db/database");
const { JWT_SECRET, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
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

// 1. GET /api/auth/captcha
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

// 2. POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password, captchaId, captchaAnswer } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ tài khoản và mật khẩu!",
      });
    }

    if (captchaId) {
      const expectedSig = signCaptchaAnswer(captchaAnswer || "");
      if (captchaId !== expectedSig) {
        return res.status(400).json({
          success: false,
          message: "Mã bảo vệ (Captcha) không chính xác!",
        });
      }
    }

    const state = await loadState();
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

    const normalizedRole = user.role === "admin" ? "super_admin" : user.role;
    const token = jwt.sign(
      { id: user.id, username: user.username, role: normalizedRole },
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
        role: normalizedRole,
        credits: user.credits,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi đăng nhập: " + err.message,
    });
  }
});

// 3. GET /api/auth/me
router.get("/me", verifyToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

module.exports = router;
