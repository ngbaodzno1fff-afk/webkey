const express = require("express");
const bcrypt = require("bcryptjs");
const { loadState, saveState } = require("../db/database");
const { verifyToken, requireSuperAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

// 11. GET /api/users
router.get("/users", verifyToken, requireSuperAdmin, async (req, res) => {
  const state = await loadState();
  const users = state.users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    credits: u.credits,
    is_active: u.is_active,
    created_at: u.created_at,
    keys_count: state.license_keys.filter((k) => k.created_by === u.username).length,
  }));

  res.json({
    success: true,
    users,
  });
});

// POST /api/users
router.post("/users", verifyToken, requireSuperAdmin, async (req, res) => {
  const { username, password, credits = 50, role = "reseller" } = req.body || {};
  const cleanUser = String(username || "").trim();

  if (!cleanUser || !password || String(password).length < 4) {
    return res.status(400).json({
      success: false,
      message: "Tên tài khoản và mật khẩu (tối thiểu 4 ký tự) không được để trống!",
    });
  }

  const state = await loadState();
  const existing = state.users.find(
    (u) => u.username.toLowerCase() === cleanUser.toLowerCase()
  );
  if (existing) {
    return res.status(409).json({
      success: false,
      message: "Tên tài khoản Đại lý này đã tồn tại!",
    });
  }

  const hash = bcrypt.hashSync(String(password), 10);
  const validRole =
    role === "super_admin" || role === "admin" ? "super_admin" : "reseller";
  const initialCredits = Math.max(parseInt(credits, 10) || 0, 0);

  state.users.push({
    id: Date.now(),
    username: cleanUser,
    password_hash: hash,
    role: validRole,
    credits: initialCredits,
    is_active: 1,
    created_at: new Date().toISOString(),
  });
  await saveState(state);

  res.json({
    success: true,
    message: `Đã tạo tài khoản ${cleanUser} (${validRole}) với ${initialCredits} Credit!`,
  });
});

// POST /api/users/:id/credits
router.post("/users/:id/credits", verifyToken, requireSuperAdmin, async (req, res) => {
  const { addCredits = 0 } = req.body || {};
  const delta = parseInt(addCredits, 10) || 0;

  const state = await loadState();
  const target = state.users.find(
    (u) => String(u.id) === String(req.params.id) || String(u._id) === String(req.params.id)
  );

  if (!target) {
    return res.status(404).json({
      success: false,
      message: "Không tìm thấy tài khoản Đại lý!",
    });
  }

  target.credits = Math.max(target.credits + delta, 0);
  await saveState(state);

  res.json({
    success: true,
    message: `Đã cập nhật Credit cho ${target.username}: ${target.credits} Credit!`,
    credits: target.credits,
  });
});

// POST /api/users/:id/toggle-active
router.post("/users/:id/toggle-active", verifyToken, requireSuperAdmin, async (req, res) => {
  const state = await loadState();
  const target = state.users.find(
    (u) => String(u.id) === String(req.params.id) || String(u._id) === String(req.params.id)
  );

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

  target.is_active = target.is_active ? 0 : 1;
  await saveState(state);

  res.json({
    success: true,
    message: target.is_active
      ? `Đã mở khóa tài khoản Đại lý ${target.username}!`
      : `Đã khóa tài khoản Đại lý ${target.username}!`,
  });
});

module.exports = router;
