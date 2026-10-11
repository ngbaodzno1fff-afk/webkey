const jwt = require("jsonwebtoken");
const { readDb } = require("../db/database");

const JWT_SECRET = process.env.JWT_SECRET || "FF_SERVER_KEY_SUPER_SECRET_2026";

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn!",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const state = readDb();
    const user = state.users.find((u) => u.id === decoded.id);

    if (!user || !user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa hoặc không tồn tại!",
      });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      credits: user.credits,
      is_active: user.is_active,
    };
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Token xác thực không hợp lệ!",
    });
  }
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== "super_admin") {
    return res.status(403).json({
      success: false,
      message: "Chỉ Super Admin mới có quyền thực hiện thao tác này!",
    });
  }
  next();
}

module.exports = {
  JWT_SECRET,
  verifyToken,
  requireSuperAdmin,
};
