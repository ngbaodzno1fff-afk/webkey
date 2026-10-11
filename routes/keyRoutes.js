const express = require("express");
const crypto = require("crypto");
const { readDb, writeDb } = require("../db/database");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

const DURATION_OPTIONS = {
  "2h": { hours: 2, label: "2 Giờ (Test)", creditCost: 1 },
  "12h": { hours: 12, label: "12 Giờ (Test)", creditCost: 2 },
  "1d": { hours: 24, label: "1 Ngày", creditCost: 5 },
  "7d": { hours: 24 * 7, label: "7 Ngày", creditCost: 20 },
  "30d": { hours: 24 * 30, label: "30 Ngày", creditCost: 60 },
  "90d": { hours: 24 * 90, label: "90 Ngày", creditCost: 150 },
  "999d": { hours: 24 * 999, label: "Vĩnh viễn (999 Ngày)", creditCost: 500 },
};

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

function syncExpiredKeys(state) {
  const nowMs = Date.now();
  let changed = false;
  for (const k of state.license_keys) {
    if (k.status === "active" && k.expires_at) {
      if (new Date(k.expires_at).getTime() < nowMs) {
        k.status = "expired";
        changed = true;
      }
    }
  }
  if (changed) writeDb(state);
}

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
  const state = readDb();
  syncExpiredKeys(state);

  const { key, deviceName, hwid, osVersion } = req.body || {};
  const cleanKey = String(key || "").trim().toUpperCase();

  if (!cleanKey) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập mã License Key!",
    });
  }

  const record = state.license_keys.find(
    (k) => String(k.key_code).toUpperCase() === cleanKey
  );

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

  if (record.status === "available") {
    const expDate = new Date(now.getTime() + record.duration_hours * 3600 * 1000);
    record.status = "active";
    record.hwid = clientHwid;
    record.device_name = clientDevice;
    record.os_version = clientOs;
    record.activated_at = now.toISOString();
    record.expires_at = expDate.toISOString();

    state.activation_logs.push({
      id: Date.now(),
      key_code: record.key_code,
      device_name: clientDevice,
      hwid: clientHwid,
      activated_date: now.toISOString().slice(0, 10),
      created_at: now.toISOString(),
    });
    writeDb(state);
  } else if (record.status === "active") {
    if (record.hwid && record.hwid !== clientHwid) {
      return res.status(403).json({
        success: false,
        message: `Key đã được gắn cố định với thiết bị (${record.device_name})! Liên hệ Admin để Reset HWID.`,
      });
    }
    if (!record.hwid) {
      record.hwid = clientHwid;
      record.device_name = clientDevice;
      record.os_version = clientOs;
      writeDb(state);
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
      expireAt: formatVNDateTime(record.expires_at),
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
  const state = readDb();
  syncExpiredKeys(state);

  const isSuper = req.user.role === "super_admin";
  const keys = isSuper
    ? state.license_keys
    : state.license_keys.filter((k) => k.created_by === req.user.username);

  const total = keys.length;
  const active = keys.filter((k) => k.status === "active").length;
  const available = keys.filter((k) => k.status === "available").length;
  const expiredOrBanned = keys.filter(
    (k) => k.status === "expired" || k.status === "banned"
  ).length;

  const chartDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}`;

    const count = state.activation_logs.filter(
      (l) => l.activated_date === dateStr
    ).length;

    chartDays.push({ date: dateStr, label, count });
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
  const state = readDb();
  syncExpiredKeys(state);

  const { status = "all", search = "" } = req.query;
  const q = String(search || "").trim().toLowerCase();

  let list = state.license_keys.slice();

  if (req.user.role !== "super_admin") {
    list = list.filter((k) => k.created_by === req.user.username);
  }

  if (status && status !== "all") {
    list = list.filter((k) => k.status === status);
  }

  if (q) {
    list = list.filter(
      (k) =>
        String(k.key_code || "").toLowerCase().includes(q) ||
        String(k.note || "").toLowerCase().includes(q) ||
        String(k.device_name || "").toLowerCase().includes(q) ||
        String(k.hwid || "").toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => b.id - a.id);

  const formatted = list.map((r) => ({
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

  const state = readDb();
  const count = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 100);
  const totalCost = durationConfig.creditCost * count;

  const dbUser = state.users.find((u) => u.id === req.user.id);
  if (req.user.role !== "super_admin") {
    if (!dbUser || dbUser.credits < totalCost) {
      return res.status(403).json({
        success: false,
        message: `Số dư Credit không đủ! Cần ${totalCost} Credit nhưng bạn chỉ còn ${
          dbUser ? dbUser.credits : 0
        } Credit.`,
      });
    }
    dbUser.credits -= totalCost;
  }

  const createdKeys = [];
  const nowIso = new Date().toISOString();
  let nextId =
    state.license_keys.reduce((max, k) => Math.max(max, k.id || 0), 0) + 1;

  for (let i = 0; i < count; i++) {
    let code = generateRandomKeyCode(prefix);
    while (state.license_keys.some((k) => k.key_code === code)) {
      code = generateRandomKeyCode(prefix);
    }
    state.license_keys.push({
      id: nextId++,
      key_code: code,
      prefix: String(prefix || "NGBAO-").toUpperCase(),
      duration_hours: durationConfig.hours,
      duration_label: durationConfig.label,
      status: "available",
      hwid: "",
      device_name: "",
      os_version: "",
      note: String(note || "").trim(),
      created_by: req.user.username,
      created_at: nowIso,
      activated_at: "",
      expires_at: "",
    });
    createdKeys.push(code);
  }

  writeDb(state);

  res.json({
    success: true,
    message: `Đã tạo thành công ${createdKeys.length} Key (${durationConfig.label})!`,
    keys: createdKeys,
    durationLabel: durationConfig.label,
    note: String(note || "").trim(),
    remainingCredits: dbUser ? dbUser.credits : req.user.credits,
  });
});

// ============================================================================
// 5. CÁC HÀNH ĐỘNG NHANH TRÊN BẢNG QUẢN LÝ KEY
// ============================================================================
function getAuthorizedKey(state, req, res, keyId) {
  const idNum = parseInt(keyId, 10);
  const record = state.license_keys.find((k) => k.id === idNum);
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

router.post("/keys/:id/reset-hwid", verifyToken, (req, res) => {
  const state = readDb();
  const record = getAuthorizedKey(state, req, res, req.params.id);
  if (!record) return;

  record.hwid = "";
  record.device_name = "";
  writeDb(state);

  res.json({
    success: true,
    message: `Đã Reset HWID cho mã ${record.key_code}! Khách có thể đăng nhập trên máy mới.`,
  });
});

router.post("/keys/:id/extend", verifyToken, (req, res) => {
  const state = readDb();
  const record = getAuthorizedKey(state, req, res, req.params.id);
  if (!record) return;

  const addHours = parseInt(req.body.addHours, 10) || 24;
  record.duration_hours += addHours;

  if (record.expires_at) {
    const baseTime =
      new Date(record.expires_at).getTime() > Date.now()
        ? new Date(record.expires_at).getTime()
        : Date.now();
    record.expires_at = new Date(baseTime + addHours * 3600 * 1000).toISOString();
    if (record.status === "expired") {
      record.status = "active";
    }
  }

  const addDaysLabel =
    addHours >= 24 ? `+${Math.round(addHours / 24)} Ngày` : `+${addHours} Giờ`;
  const baseLabel = String(record.duration_label).split(" (+")[0];
  record.duration_label = `${baseLabel} (${addDaysLabel})`;

  writeDb(state);

  res.json({
    success: true,
    message: `Đã gia hạn thêm ${addDaysLabel} cho Key ${record.key_code}!`,
  });
});

router.post("/keys/:id/toggle-ban", verifyToken, (req, res) => {
  const state = readDb();
  const record = getAuthorizedKey(state, req, res, req.params.id);
  if (!record) return;

  if (record.status === "banned") {
    record.status = record.activated_at ? "active" : "available";
  } else {
    record.status = "banned";
  }

  writeDb(state);

  res.json({
    success: true,
    message:
      record.status === "banned"
        ? `Đã KHÓA (Ban) mã ${record.key_code}!`
        : `Đã MỞ KHÓA mã ${record.key_code}!`,
    status: record.status,
  });
});

router.delete("/keys/:id", verifyToken, (req, res) => {
  const state = readDb();
  const record = getAuthorizedKey(state, req, res, req.params.id);
  if (!record) return;

  state.license_keys = state.license_keys.filter((k) => k.id !== record.id);
  writeDb(state);

  res.json({
    success: true,
    message: `Đã xóa vĩnh viễn Key ${record.key_code}!`,
  });
});

module.exports = router;
