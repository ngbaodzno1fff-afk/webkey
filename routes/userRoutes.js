const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { verifyToken, requireSuperAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

// Danh sách Đại lý / Tài khoản (Chỉ Super Admin)
router.get("/users", verifyToken, requireSuperAdmin, (req, res) => {
  const users = db
    .prepare(`
      SELECT u.id, u.username, u.role, u.credits, u.is_active, u.created_at,
             (SELECT COUNT(*) FROM license_keys k WHERE k.created_by = u.username) AS keys_count
      FROM users u
      ORDER BY u.id ASC
    `)
    .all();

  res.json({
    success: true,
    users,
  });
});

// Tạo tài khoản Đại lý / Cộng tác viên mới
router.post("/users", verifyToken, requireSuperAdmin, (req, res) => {
  const { username, password, credits = 50, role = "reseller" } = req.body || {};
  const cleanUser = String(username || "").trim();

  if (!cleanUser || !password || String(password).length < 4) {
    return res.status(400).json({
      success: false,
      message: "Tên tài khoản và mật khẩu (tối thiểu 4 ký tự) không được để trống!",
    });
  }

  const existing = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(cleanUser);
  if (existing) {
    return res.status(409).json({
      success: false,
      message: "Tên tài khoản Đại lý này đã tồn tại!",
    });
  }

  const hash = bcrypt.hashSync(String(password), 10);
  const validRole = role === "super_admin" ? "super_admin" : "reseller";
  const initialCredits = Math.max(parseInt(credits, 10) || 0, 0);

  db.prepare(`
    INSERT INTO users (username, password_hash, role, credits, is_active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(cleanUser, hash, validRole, initialCredits, new Date().toISOString());

  res.json({
    success: true,
    message: `Đã tạo tài khoản ${cleanUser} (${validRole}) với ${initialCredits} Credit!`,
  });
});

// Cộng / Cập nhật số dư Credit cho Đại lý
router.post("/users/:id/credits", verifyToken, requireSuperAdmin, (req, res) => {
  const { addCredits = 0 } = req.body || {};
  const delta = parseInt(addCredits, 10) || 0;

  const target = db
    .prepare("SELECT id, username, credits FROM users WHERE id = ?")
    .get(req.params.id);

  if (!target) {
    return res.status(404).json({
      success: false,
      message: "Không tìm thấy tài khoản Đại lý!",
    });
  }

  const nextCredits = Math.max(target.credits + delta, 0);
  db.prepare("UPDATE users SET credits = ? WHERE id = ?").run(
    nextCredits,
    target.id
  );

  res.json({
    success: true,
    message: `Đã cập nhật Credit cho ${target.username}: ${nextCredits} Credit!`,
    credits: nextCredits,
  });
});

// Khóa / Mở khóa tài khoản Đại lý
router.post("/users/:id/toggle-active", verifyToken, requireSuperAdmin, (req, res) => {
  const target = db
    .prepare("SELECT id, username, role, is_active FROM users WHERE id = ?")
    .get(req.params.id);

  if (!target) {
    return res.status(404).json({
      success: false,
      message: "Không tìm thấy tài khoản!",
    });
  }

  if (target.username === "admin") {
    return res.status(400).json({
      success: false,
      message: "Không thể khóa tài khoản Super Admin gốc!",
    });
  }

  const nextState = target.is_active ? 0 : 1;
  db.prepare("UPDATE users SET is_active = ? WHERE id = ?").run(
    nextState,
    target.id
  );

  res.json({
    success: true,
    message: nextState
      ? `Đã mở khóa tài khoản Đại lý ${target.username}!`
      : `Đã khóa tài khoản Đại lý ${target.username}!`,
  });
});

module.exports = router;
