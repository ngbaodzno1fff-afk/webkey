const express = require("express");
const crypto = require("crypto");
const db = require("../db/database");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

// Bảng quy đổi thời hạn và chi phí Credit cho Đại lý (Reseller)
const DURATION_OPTIONS = {
  "2h": { hours: 2, label: "2 Giờ (Test)", creditCost: 1 },
  "12h": { hours: 12, label: "12 Giờ (Test)", creditCost: 2 },
  "1d": { hours: 24, label: "1 Ngày", creditCost: 5 },
  "7d": { hours: 24 * 7, label: "7 Ngày", creditCost: 20 },
  "30d": { hours: 24 * 30, label: "30 Ngày", creditCost: 60 },
  "90d": { hours: 24 * 90, label: "90 Ngày", creditCost: 150 },
  "999d": { hours: 24 * 999, label: "Vĩnh viễn (999 Ngày)", creditCost: 500 },
};

/**
 * Định dạng ngày giờ kiểu Việt Nam: DD-MM-YYYY h:mm:ss SA/CH
 * Khớp chuẩn màn hình mẫu: "12-10-2026 2:37:17 CH"
 */
function formatVNDateTime(isoStr) {
  if (!isoStr) return "Chưa kích hoạt";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;

  const pad = (n) => String(n).padStart(2, "0");
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();

  const hours24 = d.getHours();
  const period = hours24 >= 12 ? "CH" : "SA";
  const hours12 = hours24 % 12 || 12;
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());

  return `${day}-${month}-${year} ${hours12}:${mins}:${secs} ${period}`;
}

/**
 * Tự động cập nhật trạng thái các Key đã quá hạn sang 'expired'
 */
function syncExpiredKeys() {
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE license_keys
    SET status = 'expired'
    WHERE status = 'active' AND expires_at != '' AND expires_at < ?
  `).run(nowIso);
}

/**
 * Sinh chuỗi Key ngẫu nhiên theo Prefix: VD NGBAO-8F4K-92MA-X7Q1
 */
function generateRandomKeyCode(rawPrefix) {
  let cleanPrefix = String(rawPrefix || "NGBAO-")
    .toUpperCase()
    .replace(/[^A-Z0-9-_]/g, "");
  if (!cleanPrefix) cleanPrefix = "NGBAO-";
  if (!cleanPrefix.endsWith("-")) cleanPrefix += "-";

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segment = (len = 4) => {
    let out = "";
    const bytes = crypto.randomBytes(len);
    for (let i = 0; i < len; i++) {
      out += chars[bytes[i] % chars.length];
    }
    return out;
  };

  return `${cleanPrefix}${segment(4)}-${segment(4)}-${segment(4)}`;
}

// ============================================================================
// 1. ENDPOINT PUBLIC CHO CLIENT APK: POST /api/key/verify
// ============================================================================
router.post("/key/verify", (req, res) => {
  syncExpiredKeys();

  const { key, deviceName, hwid, osVersion } = req.body || {};
  const cleanKey = String(key || "").trim().toUpperCase();

  if (!cleanKey) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập mã License Key!",
    });
  }

  const record = db
    .prepare("SELECT * FROM license_keys WHERE UPPER(key_code) = ?")
    .get(cleanKey);

  if (!record) {
    return res.status(404).json({
      success: false,
      message: "Key không tồn tại trên hệ thống Server!",
    });
  }

  if (record.status === "banned") {
    return res.status(403).json({
      success: false,
      message: "Key này đã bị Admin khóa (Banned)!",
    });
  }

  if (record.status === "expired") {
    return res.status(403).json({
      success: false,
      message: `Key đã hết hạn vào ${formatVNDateTime(record.expires_at)}!`,
    });
  }

  const clientDevice = String(deviceName || "iPhone 12 Pro").trim();
  const clientHwid = String(hwid || clientDevice).trim();
  const clientOs = String(osVersion || "26.6.1").trim();
  const now = new Date();

  let expiresIso = record.expires_at;

  // Nếu Key chưa kích hoạt (available) -> Kích hoạt lần đầu & khoá HWID
  if (record.status === "available") {
    const expDate = new Date(now.getTime() + record.duration_hours * 3600 * 1000);
    expiresIso = expDate.toISOString();

    db.prepare(`
      UPDATE license_keys
      SET status = 'active',
          hwid = ?,
          device_name = ?,
          os_version = ?,
          activated_at = ?,
          expires_at = ?
      WHERE id = ?
    `).run(clientHwid, clientDevice, clientOs, now.toISOString(), expiresIso, record.id);

    // Ghi log kích hoạt phục vụ Biểu đồ Dashboard
    const todayStr = now.toISOString().slice(0, 10);
    db.prepare(`
      INSERT INTO activation_logs (key_code, device_name, hwid, activated_date, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(record.key_code, clientDevice, clientHwid, todayStr, now.toISOString());
  } else if (record.status === "active") {
    // Nếu Key đã gắn với HWID trước đó, kiểm tra trùng khớp HWID
    if (record.hwid && record.hwid !== clientHwid) {
      return res.status(403).json({
        success: false,
        message: `Key đã được gắn cố định với thiết bị (${record.device_name})! Liên hệ Admin để Reset HWID.`,
      });
    }
    // Nếu vừa được Reset HWID (hwid rỗng), gắn lại thiết bị mới
    if (!record.hwid) {
      db.prepare(`
        UPDATE license_keys
        SET hwid = ?, device_name = ?, os_version = ?
        WHERE id = ?
      `).run(clientHwid, clientDevice, clientOs, record.id);
    }
  }

  const finalDevice = record.device_name || clientDevice;
  const finalOs = record.os_version || clientOs;
  const shortGreetingName = finalDevice.toLowerCase().includes("iphone")
    ? "iPhone"
    : finalDevice.split(" ")[0] || "User";

  return res.json({
    success: true,
    message: "Kích hoạt thành công!",
    data: {
      greeting: `Hi ${shortGreetingName}`,
      expireAt: formatVNDateTime(expiresIso),
      deviceName: finalDevice,
      osVersion: finalOs,
      apiServer: "6.1.0",
    },
  });
});

// ============================================================================
// 2. THỐNG KÊ DASHBOARD OVERVIEW: GET /api/stats
// ============================================================================
router.get("/stats", verifyToken, (req, res) => {
  syncExpiredKeys();

  const isSuper = req.user.role === "super_admin";
  const filterSql = isSuper ? "" : "WHERE created_by = ?";
  const params = isSuper ? [] : [req.user.username];

  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM license_keys ${filterSql}`)
    .get(...params).count;

  const active = db
    .prepare(
      `SELECT COUNT(*) AS count FROM license_keys ${
        isSuper ? "WHERE" : "WHERE created_by = ? AND"
      } status = 'active'`
    )
    .get(...params).count;

  const available = db
    .prepare(
      `SELECT COUNT(*) AS count FROM license_keys ${
        isSuper ? "WHERE" : "WHERE created_by = ? AND"
      } status = 'available'`
    )
    .get(...params).count;

  const expiredOrBanned = db
    .prepare(
      `SELECT COUNT(*) AS count FROM license_keys ${
        isSuper ? "WHERE" : "WHERE created_by = ? AND"
      } status IN ('expired', 'banned')`
    )
    .get(...params).count;

  // Biểu đồ kích hoạt 7 ngày gần nhất
  const chartDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}`;

    const countRow = db
      .prepare("SELECT COUNT(*) AS count FROM activation_logs WHERE activated_date = ?")
      .get(dateStr);

    chartDays.push({
      date: dateStr,
      label,
      count: countRow ? countRow.count : 0,
    });
  }

  res.json({
    success: true,
    stats: {
      total,
      active,
      available,
      expiredOrBanned,
      credits: req.user.credits,
    },
    chart: chartDays,
  });
});

// ============================================================================
// 3. DANH SÁCH & BỘ LỌC KEY: GET /api/keys
// ============================================================================
router.get("/keys", verifyToken, (req, res) => {
  syncExpiredKeys();

  const { status = "all", search = "" } = req.query;
  const conditions = [];
  const params = [];

  if (req.user.role !== "super_admin") {
    conditions.push("created_by = ?");
    params.push(req.user.username);
  }

  if (status && status !== "all") {
    conditions.push("status = ?");
    params.push(status);
  }

  if (search && String(search).trim()) {
    const q = `%${String(search).trim()}%`;
    conditions.push("(key_code LIKE ? OR note LIKE ? OR device_name LIKE ? OR hwid LIKE ?)");
    params.push(q, q, q, q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM license_keys ${whereClause} ORDER BY id DESC LIMIT 500`)
    .all(...params);

  const formatted = rows.map((r) => ({
    ...r,
    activated_at_vn: r.activated_at ? formatVNDateTime(r.activated_at) : "—",
    expires_at_vn: r.expires_at ? formatVNDateTime(r.expires_at) : "Chưa kích hoạt",
  }));

  res.json({
    success: true,
    keys: formatted,
  });
});

// ============================================================================
// 4. TẠO KEY (LẺ HOẶC HÀNG LOẠT): POST /api/keys/generate
// ============================================================================
router.post("/keys/generate", verifyToken, (req, res) => {
  const {
    prefix = "NGBAO-",
    duration = "1d",
    quantity = 1,
    note = "",
  } = req.body || {};

  const durationConfig = DURATION_OPTIONS[duration];
  if (!durationConfig) {
    return res.status(400).json({
      success: false,
      message: "Thời hạn Key không hợp lệ!",
    });
  }

  const count = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 100);
  const totalCost = durationConfig.creditCost * count;

  // Nếu là Đại lý (Reseller), kiểm tra hạn mức Credit
  if (req.user.role !== "super_admin") {
    if (req.user.credits < totalCost) {
      return res.status(403).json({
        success: false,
        message: `Số dư Credit không đủ! Cần ${totalCost} Credit nhưng bạn chỉ còn ${req.user.credits} Credit.`,
      });
    }
    db.prepare("UPDATE users SET credits = credits - ? WHERE id = ?").run(
      totalCost,
      req.user.id
    );
  }

  const createdKeys = [];
  const nowIso = new Date().toISOString();
  const insertStmt = db.prepare(`
    INSERT INTO license_keys (
      key_code, prefix, duration_hours, duration_label, status, note, created_by, created_at
    ) VALUES (?, ?, ?, ?, 'available', ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      let code = generateRandomKeyCode(prefix);
      while (db.prepare("SELECT id FROM license_keys WHERE key_code = ?").get(code)) {
        code = generateRandomKeyCode(prefix);
      }
      insertStmt.run(
        code,
        String(prefix || "NGBAO-").toUpperCase(),
        durationConfig.hours,
        durationConfig.label,
        String(note || "").trim(),
        req.user.username,
        nowIso
      );
      createdKeys.push(code);
    }
  });

  insertMany();

  const updatedUser = db
    .prepare("SELECT credits FROM users WHERE id = ?")
    .get(req.user.id);

  res.json({
    success: true,
    message: `Đã tạo thành công ${createdKeys.length} Key (${durationConfig.label})!`,
    keys: createdKeys,
    durationLabel: durationConfig.label,
    note: String(note || "").trim(),
    remainingCredits: updatedUser ? updatedUser.credits : req.user.credits,
  });
});

// ============================================================================
// 5. CÁC HÀNH ĐỘNG NHANH TRÊN BẢNG QUẢN LÝ KEY
// ============================================================================

// Kiểm tra quyền sở hữu key (Super Admin hoặc chính đại lý tạo key đó)
function getAuthorizedKey(req, res, keyId) {
  const record = db.prepare("SELECT * FROM license_keys WHERE id = ?").get(keyId);
  if (!record) {
    res.status(404).json({ success: false, message: "Không tìm thấy Key này!" });
    return null;
  }
  if (req.user.role !== "super_admin" && record.created_by !== req.user.username) {
    res.status(403).json({
      success: false,
      message: "Bạn chỉ có quyền quản lý Key do chính mình tạo!",
    });
    return null;
  }
  return record;
}

// 🔄 Reset HWID (Cho phép đổi máy mới)
router.post("/keys/:id/reset-hwid", verifyToken, (req, res) => {
  const record = getAuthorizedKey(req, res, req.params.id);
  if (!record) return;

  db.prepare(`
    UPDATE license_keys
    SET hwid = '', device_name = ''
    WHERE id = ?
  `).run(record.id);

  res.json({
    success: true,
    message: `Đã Reset HWID cho mã ${record.key_code}! Khách có thể đăng nhập trên máy mới.`,
  });
});

// ⏳ Gia hạn (Extend) thêm ngày/giờ sử dụng
router.post("/keys/:id/extend", verifyToken, (req, res) => {
  const record = getAuthorizedKey(req, res, req.params.id);
  if (!record) return;

  const addHours = parseInt(req.body.addHours, 10) || 24;
  if (addHours <= 0) {
    return res.status(400).json({
      success: false,
      message: "Số giờ gia hạn phải lớn hơn 0!",
    });
  }

  let newExpiresAt = record.expires_at;
  let newStatus = record.status;
  const newDurationHours = record.duration_hours + addHours;

  if (record.expires_at) {
    const baseTime =
      new Date(record.expires_at).getTime() > Date.now()
        ? new Date(record.expires_at).getTime()
        : Date.now();
    newExpiresAt = new Date(baseTime + addHours * 3600 * 1000).toISOString();
    if (record.status === "expired") {
      newStatus = "active";
    }
  }

  const addDaysLabel =
    addHours >= 24 ? `+${Math.round(addHours / 24)} Ngày` : `+${addHours} Giờ`;

  db.prepare(`
    UPDATE license_keys
    SET duration_hours = ?,
        duration_label = ?,
        expires_at = ?,
        status = ?
    WHERE id = ?
  `).run(
    newDurationHours,
    `${record.duration_label} (${addDaysLabel})`,
    newExpiresAt,
    newStatus,
    record.id
  );

  res.json({
    success: true,
    message: `Đã gia hạn thêm ${addDaysLabel} cho Key ${record.key_code}!`,
  });
});

// 🔒 Khóa / Mở khóa (Ban / Unban)
router.post("/keys/:id/toggle-ban", verifyToken, (req, res) => {
  const record = getAuthorizedKey(req, res, req.params.id);
  if (!record) return;

  let nextStatus = "banned";
  if (record.status === "banned") {
    if (!record.activated_at) {
      nextStatus = "available";
    } else if (record.expires_at && new Date(record.expires_at).getTime() < Date.now()) {
      nextStatus = "expired";
    } else {
      nextStatus = "active";
    }
  }

  db.prepare("UPDATE license_keys SET status = ? WHERE id = ?").run(
    nextStatus,
    record.id
  );

  res.json({
    success: true,
    message:
      nextStatus === "banned"
        ? `Đã KHÓA (Ban) mã ${record.key_code}!`
        : `Đã MỞ KHÓA mã ${record.key_code}!`,
    status: nextStatus,
  });
});

// 🗑️ Xóa Key
router.delete("/keys/:id", verifyToken, (req, res) => {
  const record = getAuthorizedKey(req, res, req.params.id);
  if (!record) return;

  db.prepare("DELETE FROM license_keys WHERE id = ?").run(record.id);

  res.json({
    success: true,
    message: `Đã xóa vĩnh viễn Key ${record.key_code}!`,
  });
});

module.exports = router;
