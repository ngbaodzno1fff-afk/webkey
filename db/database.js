const fs = require("fs");
const path = require("path");
const os = require("os");
const bcrypt = require("bcryptjs");

// Trên Vercel Serverless, chỉ thư mục /tmp mới cho phép ghi file (Writeable)
const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const dataDir = isVercel
  ? path.join(os.tmpdir(), "ff_key_data")
  : path.join(__dirname, "..", "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFile = path.join(dataDir, "ff_key_database.json");

function createInitialData() {
  const now = new Date();
  const nowIso = now.toISOString();
  const exp30d = new Date(now.getTime() + 30 * 86400 * 1000).toISOString();
  const exp7d = new Date(now.getTime() + 7 * 86400 * 1000).toISOString();
  const expPast = new Date(now.getTime() - 2 * 86400 * 1000).toISOString();

  // Tạo dữ liệu biểu đồ 7 ngày gần nhất
  const activation_logs = [];
  const sampleCounts = [3, 5, 4, 8, 6, 11, 7];
  let logId = 1;
  sampleCounts.forEach((cnt, idx) => {
    const dayDt = new Date(now.getTime() - (6 - idx) * 86400 * 1000);
    const dStr = dayDt.toISOString().slice(0, 10);
    for (let c = 0; c < cnt; c++) {
      activation_logs.push({
        id: logId++,
        key_code: `NGBAO-LOG-${idx}-${c}`,
        device_name: "iPhone 12 Pro",
        hwid: `HWID-${idx}-${c}`,
        activated_date: dStr,
        created_at: dayDt.toISOString(),
      });
    }
  });

  return {
    users: [
      {
        id: 1,
        username: "admin",
        password_hash: bcrypt.hashSync("admin123456", 10),
        role: "super_admin",
        credits: 999999,
        is_active: 1,
        created_at: nowIso,
      },
      {
        id: 2,
        username: "reseller",
        password_hash: bcrypt.hashSync("reseller123", 10),
        role: "reseller",
        credits: 150,
        is_active: 1,
        created_at: nowIso,
      },
    ],
    license_keys: [
      {
        id: 1,
        key_code: "NGBAO-VIP1-2026-FF99",
        prefix: "NGBAO-",
        duration_hours: 720,
        duration_label: "30 Ngày",
        status: "active",
        hwid: "HWID-IPHONE12PRO-9981",
        device_name: "iPhone 12 Pro",
        os_version: "26.6.1",
        note: "Khách VIP Nguyễn Bảo",
        created_by: "admin",
        created_at: nowIso,
        activated_at: nowIso,
        expires_at: exp30d,
      },
      {
        id: 2,
        key_code: "FFVIP-8899-ABCD-EF01",
        prefix: "FFVIP-",
        duration_hours: 168,
        duration_label: "7 Ngày",
        status: "available",
        hwid: "",
        device_name: "",
        os_version: "",
        note: "Key test sẵn sàng nhập",
        created_by: "admin",
        created_at: nowIso,
        activated_at: "",
        expires_at: "",
      },
      {
        id: 3,
        key_code: "NGBAO-FREE-TEST-2026",
        prefix: "NGBAO-",
        duration_hours: 24,
        duration_label: "1 Ngày",
        status: "available",
        hwid: "",
        device_name: "",
        os_version: "",
        note: "Key dùng thử 1 ngày",
        created_by: "reseller",
        created_at: nowIso,
        activated_at: "",
        expires_at: "",
      },
      {
        id: 4,
        key_code: "KEY-EXPD-1122-3344",
        prefix: "KEY-",
        duration_hours: 2,
        duration_label: "2 Giờ (Test)",
        status: "expired",
        hwid: "HWID-ROGPHONE-7712",
        device_name: "ASUS ROG Phone 7",
        os_version: "Android 14",
        note: "Khách test 2h",
        created_by: "admin",
        created_at: expPast,
        activated_at: expPast,
        expires_at: expPast,
      },
      {
        id: 5,
        key_code: "FFVIP-BAN9-0000-9999",
        prefix: "FFVIP-",
        duration_hours: 720,
        duration_label: "30 Ngày",
        status: "banned",
        hwid: "HWID-SPAM-001",
        device_name: "Samsung S24 Ultra",
        os_version: "Android 14",
        note: "Vi phạm chia sẻ nhiều máy",
        created_by: "admin",
        created_at: nowIso,
        activated_at: nowIso,
        expires_at: exp7d,
      },
    ],
    activation_logs,
  };
}

function readDb() {
  try {
    if (!fs.existsSync(dbFile)) {
      const seed = createInitialData();
      fs.writeFileSync(dbFile, JSON.stringify(seed, null, 2), "utf8");
      return seed;
    }
    const raw = fs.readFileSync(dbFile, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return createInitialData();
  }
}

function writeDb(state) {
  try {
    fs.writeFileSync(dbFile, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("Write DB error:", err.message);
  }
}

module.exports = {
  readDb,
  writeDb,
};
