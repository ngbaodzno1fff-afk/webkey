const jwt = require("jsonwebtoken");
const db = require("../db/database");

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
    const user = db
      .prepare("SELECT id, username, role, credits, is_active FROM users WHERE id = ?")
      .get(decoded.id);

    if (!user || !user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa hoặc không tồn tại!",
      });
    }

    req.user = user;
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
