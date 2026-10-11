const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "database.sqlite");
const db = new Database(dbPath);

// Bật WAL mode giúp tăng tốc độ đọc/ghi đồng thời
db.pragma("journal_mode = WAL");

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'reseller', -- 'super_admin' | 'reseller'
      credits INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS license_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_code TEXT UNIQUE NOT NULL,
      prefix TEXT NOT NULL DEFAULT 'NGBAO-',
      duration_hours INTEGER NOT NULL,
      duration_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available', -- 'available' | 'active' | 'expired' | 'banned'
      hwid TEXT DEFAULT '',
      device_name TEXT DEFAULT '',
      os_version TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_by TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL,
      activated_at TEXT DEFAULT '',
      expires_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS activation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_code TEXT NOT NULL,
      device_name TEXT NOT NULL,
      hwid TEXT NOT NULL,
      activated_date TEXT NOT NULL, -- YYYY-MM-DD
      created_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();

  // Tạo tài khoản Super Admin mặc định: admin / admin123456
  const adminExists = db.prepare("SELECT id FROM users WHERE username = ?").get("admin");
  if (!adminExists) {
    const hash = bcrypt.hashSync("admin123456", 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, role, credits, is_active, created_at)
      VALUES (?, ?, 'super_admin', 999999, 1, ?)
    `).run("admin", hash, now);
  }

  // Tạo tài khoản Đại lý (Reseller) mặc định để test: reseller / reseller123
  const resellerExists = db.prepare("SELECT id FROM users WHERE username = ?").get("reseller");
  if (!resellerExists) {
    const hash = bcrypt.hashSync("reseller123", 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, role, credits, is_active, created_at)
      VALUES (?, ?, 'reseller', 50, 1, ?)
    `).run("reseller", hash, now);
  }
}

initDatabase();

module.exports = db;
