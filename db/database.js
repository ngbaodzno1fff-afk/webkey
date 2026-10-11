const fs = require("fs");
const path = require("path");
const os = require("os");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const UserModel = require("../models/User");
const KeyModel = require("../models/Key");

const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const dataDir = isVercel
  ? path.join(os.tmpdir(), "ff_key_data")
  : path.join(__dirname, "..", "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFile = path.join(dataDir, "ff_key_database.json");

// Cache kết nối MongoDB Atlas cho Vercel Serverless
let cachedMongo = global._mongooseCache;
if (!cachedMongo) {
  cachedMongo = global._mongooseCache = { conn: null, promise: null, seeded: false };
}

function createInitialData() {
  const now = new Date();
  const nowIso = now.toISOString();
  const exp30d = new Date(now.getTime() + 30 * 86400 * 1000).toISOString();
  const exp7d = new Date(now.getTime() + 7 * 86400 * 1000).toISOString();
  const expPast = new Date(now.getTime() - 2 * 86400 * 1000).toISOString();

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
        status: "available",
        hwid: "",
        device_name: "",
        os_version: "Android 14",
        note: "Key VIP mặc định test ngay",
        created_by: "admin",
        created_at: nowIso,
        activated_at: "",
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
        os_version: "Android 14",
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
        os_version: "Android 14",
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

async function connectMongoIfConfigured() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return false;

  try {
    if (!cachedMongo.conn) {
      if (!cachedMongo.promise) {
        cachedMongo.promise = mongoose
          .connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 5000 })
          .then((m) => m);
      }
      cachedMongo.conn = await cachedMongo.promise;
    }

    if (!cachedMongo.seeded) {
      const userCount = await UserModel.countDocuments();
      if (userCount === 0) {
        const seed = createInitialData();
        await UserModel.insertMany(seed.users.map(({ id, ...rest }) => rest));
        await KeyModel.insertMany(seed.license_keys.map(({ id, ...rest }) => rest));
      }
      cachedMongo.seeded = true;
    }
    return true;
  } catch (err) {
    console.error("MongoDB connection fallback to /tmp JSON:", err.message);
    return false;
  }
}

function readLocalState() {
  try {
    if (!fs.existsSync(dbFile)) {
      const seed = createInitialData();
      fs.writeFileSync(dbFile, JSON.stringify(seed, null, 2), "utf8");
      return seed;
    }
    return JSON.parse(fs.readFileSync(dbFile, "utf8"));
  } catch {
    return createInitialData();
  }
}

function writeLocalState(state) {
  try {
    fs.writeFileSync(dbFile, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("Write DB error:", err.message);
  }
}

/**
 * Đọc toàn bộ state từ MongoDB Atlas (nếu có MONGODB_URI) hoặc từ /tmp JSON
 */
async function loadState() {
  const isMongo = await connectMongoIfConfigured();
  if (isMongo) {
    const usersDocs = await UserModel.find().lean();
    const keysDocs = await KeyModel.find().lean();
    const localFallback = readLocalState();

    return {
      isMongo: true,
      users: usersDocs.map((u, idx) => ({
        ...u,
        id: String(u._id),
        numericId: idx + 1,
      })),
      license_keys: keysDocs.map((k, idx) => ({
        ...k,
        id: String(k._id),
        numericId: idx + 1,
      })),
      activation_logs: localFallback.activation_logs || [],
    };
  }

  return {
    isMongo: false,
    ...readLocalState(),
  };
}

/**
 * Lưu thay đổi vào MongoDB Atlas hoặc /tmp JSON
 */
async function saveState(state) {
  const isMongo = await connectMongoIfConfigured();
  if (isMongo) {
    // Đồng bộ Users
    for (const u of state.users) {
      if (u._id) {
        await UserModel.updateOne(
          { _id: u._id },
          {
            $set: {
              username: u.username,
              password_hash: u.password_hash,
              role: u.role,
              credits: u.credits,
              is_active: u.is_active,
            },
          }
        );
      } else {
        await UserModel.findOneAndUpdate(
          { username: u.username },
          {
            $setOnInsert: {
              username: u.username,
              password_hash: u.password_hash,
              role: u.role,
              credits: u.credits,
              is_active: u.is_active,
              created_at: u.created_at || new Date().toISOString(),
            },
          },
          { upsert: true }
        );
      }
    }

    // Đồng bộ Keys
    const currentKeyCodes = state.license_keys.map((k) => k.key_code);
    await KeyModel.deleteMany({ key_code: { $nin: currentKeyCodes } });

    for (const k of state.license_keys) {
      await KeyModel.findOneAndUpdate(
        { key_code: k.key_code },
        {
          $set: {
            prefix: k.prefix,
            duration_hours: k.duration_hours,
            duration_label: k.duration_label,
            status: k.status,
            hwid: k.hwid || "",
            device_name: k.device_name || "",
            os_version: k.os_version || "Android 14",
            note: k.note || "",
            created_by: k.created_by || "admin",
            created_at: k.created_at || new Date().toISOString(),
            activated_at: k.activated_at || "",
            expires_at: k.expires_at || "",
          },
        },
        { upsert: true }
      );
    }
  }

  writeLocalState({
    users: state.users,
    license_keys: state.license_keys,
    activation_logs: state.activation_logs || [],
  });
}

module.exports = {
  readDb: readLocalState,
  writeDb: writeLocalState,
  loadState,
  saveState,
};
