const express = require("express");
const crypto = require("crypto");
const { loadState, saveState } = require("../db/database");
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

async function syncExpiredKeys(state) {
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
  if (changed) await saveState(state);
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
// A. ENDPOINT CHO CLIENT APK: POST & GET /api/key/verify
// ============================================================================
async function handleVerifyKey(req, res) {
  try {
    const state = await loadState();
    await syncExpiredKeys(state);

    const source = req.method === "GET" ? req.query : req.body || {};
    const { key, deviceName, hwid, osVersion } = source;
    const cleanKey = String(key || "").trim().toUpperCase();

    // Nếu truy cập GET /api/key/verify trên trình duyệt mà chưa truyền ?key=...
    if (req.method === "GET" && !cleanKey) {
      return res.json({
        success: true,
        status: "online",
        endpoint: "POST /api/key/verify",
        apiServer: "6.1.0",
        message:
          "API Server Key đang hoạt động! Gửi POST { key, deviceName } hoặc truy cập ?key=NGBAO-VIP1-2026-FF99 để kiểm tra.",
      });
    }

    if (!cleanKey) {
      return res.status(400).json({
        success: false,
        message: "Key không hợp lệ hoặc đã hết hạn!",
      });
    }

    const record = state.license_keys.find(
      (k) => String(k.key_code).toUpperCase() === cleanKey
    );

    if (!record || record.status === "banned" || record.status === "expired") {
      return res.status(403).json({
        success: false,
        message: "Key không hợp lệ hoặc đã hết hạn!",
      });
    }

    const clientDevice = String(deviceName || "Android Device").trim();
    const clientHwid = String(hwid || clientDevice).trim();
    const clientOs = String(osVersion || "Android 14").trim();
    const now = new Date();

    if (record.status === "available") {
      const expDate = new Date(
        now.getTime() + (record.duration_hours || 24) * 3600 * 1000
      );
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
      await saveState(state);
    } else if (record.status === "active") {
      if (
        record.hwid &&
        record.hwid !== clientHwid &&
        record.device_name &&
        record.device_name !== clientDevice
      ) {
        return res.status(403).json({
          success: false,
          message: "Key không hợp lệ hoặc đã hết hạn! (Key đang gắn với thiết bị khác)",
        });
      }
      if (!record.hwid) {
        record.hwid = clientHwid;
        record.device_name = clientDevice;
        record.os_version = clientOs;
        await saveState(state);
      }
    }

    const finalDevice = record.device_name || clientDevice;
    const finalOs = record.os_version || clientOs;

    return res.status(200).json({
      success: true,
      message: "Kích hoạt thành công!",
      data: {
        greeting: `Hi ${finalDevice}`,
        expireAt: formatVNDateTime(record.expires_at),
        deviceName: finalDevice,
        osVersion: finalOs,
        apiServer: "6.1.0",
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Lỗi xử lý Server Key: " + err.message,
    });
  }
}

router.post("/key/verify", handleVerifyKey);
router.get("/key/verify", handleVerifyKey);

// ============================================================================
// B. CÁC ENDPOINT CHO TRANG WEB QUẢN TRỊ (ADMIN.JS)
// ============================================================================

// 4. GET /api/stats
router.get("/stats", verifyToken, async (req, res) => {
  const state = await loadState();
  await syncExpiredKeys(state);

  const isSuper = req.user.role === "super_admin" || req.user.role === "admin";
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

    const count = (state.activation_logs || []).filter(
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

// 5. GET /api/keys
router.get("/keys", verifyToken, async (req, res) => {
  const state = await loadState();
  await syncExpiredKeys(state);

  const { status = "all", search = "" } = req.query;
  const q = String(search || "").trim().toLowerCase();

  let list = state.license_keys.slice();

  if (req.user.role !== "super_admin" && req.user.role !== "admin") {
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

  list.reverse();

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

// 6. POST /api/keys/generate
router.post("/keys/generate", verifyToken, async (req, res) => {
  const {
    prefix = "NGBAO-",
    duration = "1d",
    quantity = 1,
    note = "",
  } = req.body || {};

  const durationConfig = DURATION_OPTIONS[duration] || DURATION_OPTIONS["1d"];
  const state = await loadState();
  const count = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 100);
  const totalCost = durationConfig.creditCost * count;

  const dbUser = state.users.find((u) => String(u.id) === String(req.user.id));
  if (req.user.role !== "super_admin" && req.user.role !== "admin") {
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
  let nextId = state.license_keys.length + 1 + Date.now();

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
      os_version: "Android 14",
      note: String(note || "").trim(),
      created_by: req.user.username,
      created_at: nowIso,
      activated_at: "",
      expires_at: "",
    });
    createdKeys.push(code);
  }

  await saveState(state);

  res.json({
    success: true,
    message: `Đã tạo thành công ${createdKeys.length} Key (${durationConfig.label})!`,
    keys: createdKeys,
    durationLabel: durationConfig.label,
    note: String(note || "").trim(),
    remainingCredits: dbUser ? dbUser.credits : req.user.credits,
  });
});

function getAuthorizedKey(state, req, res, keyId) {
  const record = state.license_keys.find(
    (k) => String(k.id) === String(keyId) || String(k._id) === String(keyId)
  );
  if (!record) {
    res.status(404).json({ success: false, message: "Không tìm thấy Key này!" });
    return null;
  }
  if (
    req.user.role !== "super_admin" &&
    req.user.role !== "admin" &&
    record.created_by !== req.user.username
  ) {
    res.status(403).json({
      success: false,
      message: "Bạn chỉ có quyền quản lý Key do chính mình tạo!",
    });
    return null;
  }
  return record;
}

// 7. POST /api/keys/:id/reset-hwid
router.post("/keys/:id/reset-hwid", verifyToken, async (req, res) => {
  const state = await loadState();
  const record = getAuthorizedKey(state, req, res, req.params.id);
  if (!record) return;

  record.hwid = "";
  record.device_name = "";
  await saveState(state);

  res.json({
    success: true,
    message: `Đã Reset HWID cho mã ${record.key_code}! Khách có thể đăng nhập trên máy mới.`,
  });
});

// 8. POST /api/keys/:id/extend
router.post("/keys/:id/extend", verifyToken, async (req, res) => {
  const state = await loadState();
  const record = getAuthorizedKey(state, req, res, req.params.id);
  if (!record) return;

  const addHours = parseInt(req.body.addHours, 10) || 24;
  record.duration_hours = (record.duration_hours || 24) + addHours;

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

  await saveState(state);

  res.json({
    success: true,
    message: `Đã gia hạn thêm ${addDaysLabel} cho Key ${record.key_code}!`,
  });
});

// 9. POST /api/keys/:id/toggle-ban
router.post("/keys/:id/toggle-ban", verifyToken, async (req, res) => {
  const state = await loadState();
  const record = getAuthorizedKey(state, req, res, req.params.id);
  if (!record) return;

  if (record.status === "banned") {
    record.status = record.activated_at ? "active" : "available";
  } else {
    record.status = "banned";
  }

  await saveState(state);

  res.json({
    success: true,
    message:
      record.status === "banned"
        ? `Đã KHÓA (Ban) mã ${record.key_code}!`
        : `Đã MỞ KHÓA mã ${record.key_code}!`,
    status: record.status,
  });
});

// 10. DELETE /api/keys/:id
router.delete("/keys/:id", verifyToken, async (req, res) => {
  const state = await loadState();
  const record = getAuthorizedKey(state, req, res, req.params.id);
  if (!record) return;

  state.license_keys = state.license_keys.filter(
    (k) => String(k.id) !== String(record.id)
  );
  await saveState(state);

  res.json({
    success: true,
    message: `Đã xóa vĩnh viễn Key ${record.key_code}!`,
  });
});

module.exports = router;
