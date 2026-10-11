#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FF Server Key & Web Admin Backend (Python 3.12 Zero-Dependency Edition)
Tương thích 100% cơ sở dữ liệu SQLite và REST API với server.js (Node.js Express).
Chạy ngay bằng lệnh: python server.py
"""

import base64
import datetime
import hashlib
import hmac
import json
import mimetypes
import os
import random
import re
import secrets
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "database.sqlite")

JWT_SECRET = os.environ.get("JWT_SECRET", "FF_SERVER_KEY_SUPER_SECRET_2026")
PORT = int(os.environ.get("PORT", "3000"))

DURATION_OPTIONS = {
    "2h": {"hours": 2, "label": "2 Giờ (Test)", "creditCost": 1},
    "12h": {"hours": 12, "label": "12 Giờ (Test)", "creditCost": 2},
    "1d": {"hours": 24, "label": "1 Ngày", "creditCost": 5},
    "7d": {"hours": 24 * 7, "label": "7 Ngày", "creditCost": 20},
    "30d": {"hours": 24 * 30, "label": "30 Ngày", "creditCost": 60},
    "90d": {"hours": 24 * 90, "label": "90 Ngày", "creditCost": 150},
    "999d": {"hours": 24 * 999, "label": "Vĩnh viễn (999 Ngày)", "creditCost": 500},
}

CAPTCHA_STORE = {}
RATE_LIMIT_STORE = {}


def hash_password(password: str) -> str:
    salt = secrets.token_hex(8)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"pbkdf2${salt}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    if stored_hash.startswith("pbkdf2$"):
        parts = stored_hash.split("$")
        if len(parts) != 3:
            return False
        salt, expected_hex = parts[1], parts[2]
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
        return hmac.compare_digest(dk.hex(), expected_hex)
    return False


def create_jwt(payload: dict, expires_hours: int = 24) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    data = dict(payload)
    data["exp"] = int(time.time()) + expires_hours * 3600

    b64_header = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    b64_payload = base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")
    signing_input = f"{b64_header}.{b64_payload}"
    sig = hmac.new(JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256).digest()
    b64_sig = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{signing_input}.{b64_sig}"


def decode_jwt(token: str):
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        signing_input = f"{parts[0]}.{parts[1]}"
        expected_sig = hmac.new(JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256).digest()
        b64_expected = base64.urlsafe_b64encode(expected_sig).decode().rstrip("=")
        if not hmac.compare_digest(parts[2], b64_expected):
            return None
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def format_vn_datetime(iso_str: str) -> str:
    if not iso_str:
        return "Chưa kích hoạt"
    try:
        clean = iso_str.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(clean)
        if dt.tzinfo is not None:
            dt = dt.astimezone()
        period = "CH" if dt.hour >= 12 else "SA"
        h12 = dt.hour % 12 or 12
        return f"{dt.day:02d}-{dt.month:02d}-{dt.year} {h12}:{dt.minute:02d}:{dt.second:02d} {period}"
    except Exception:
        return iso_str


def generate_random_key_code(raw_prefix: str) -> str:
    clean_prefix = re.sub(r"[^A-Z0-9\-_]", "", str(raw_prefix or "NGBAO-").upper())
    if not clean_prefix:
        clean_prefix = "NGBAO-"
    if not clean_prefix.endswith("-"):
        clean_prefix += "-"
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    seg = lambda: "".join(secrets.choice(chars) for _ in range(4))
    return f"{clean_prefix}{seg()}-{seg()}-{seg()}"


def init_database():
    conn = get_db()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'reseller',
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
          status TEXT NOT NULL DEFAULT 'available',
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
          activated_date TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        """
    )

    now_iso = datetime.datetime.now().isoformat()

    # Seed Super Admin: admin / admin123456
    cur.execute("SELECT id FROM users WHERE username = 'admin'")
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO users (username, password_hash, role, credits, is_active, created_at) VALUES (?, ?, 'super_admin', 999999, 1, ?)",
            ("admin", hash_password("admin123456"), now_iso),
        )

    # Seed Reseller: reseller / reseller123
    cur.execute("SELECT id FROM users WHERE username = 'reseller'")
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO users (username, password_hash, role, credits, is_active, created_at) VALUES (?, ?, 'reseller', 150, 1, ?)",
            ("reseller", hash_password("reseller123"), now_iso),
        )

    # Seed dữ liệu mẫu nếu bảng license_keys đang trống
    cur.execute("SELECT COUNT(*) AS cnt FROM license_keys")
    if cur.fetchone()["cnt"] == 0:
        now = datetime.datetime.now()
        exp_30d = (now + datetime.timedelta(days=30)).isoformat()
        exp_7d = (now + datetime.timedelta(days=7)).isoformat()
        exp_past = (now - datetime.timedelta(days=2)).isoformat()

        sample_keys = [
            (
                "NGBAO-VIP1-2026-FF99",
                "NGBAO-",
                720,
                "30 Ngày",
                "active",
                "HWID-IPHONE12PRO-9981",
                "iPhone 12 Pro",
                "26.6.1",
                "Khách VIP Nguyễn Bảo",
                "admin",
                now_iso,
                now_iso,
                exp_30d,
            ),
            (
                "FFVIP-8899-ABCD-EF01",
                "FFVIP-",
                168,
                "7 Ngày",
                "available",
                "",
                "",
                "",
                "Key test sẵn sàng nhập",
                "admin",
                now_iso,
                "",
                "",
            ),
            (
                "NGBAO-FREE-TEST-2026",
                "NGBAO-",
                24,
                "1 Ngày",
                "available",
                "",
                "",
                "",
                "Key dùng thử 1 ngày",
                "reseller",
                now_iso,
                "",
                "",
            ),
            (
                "KEY-EXPD-1122-3344",
                "KEY-",
                2,
                "2 Giờ (Test)",
                "expired",
                "HWID-ROGPHONE-7712",
                "ASUS ROG Phone 7",
                "Android 14",
                "Khách test 2h",
                "admin",
                exp_past,
                exp_past,
                exp_past,
            ),
            (
                "FFVIP-BAN9-0000-9999",
                "FFVIP-",
                720,
                "30 Ngày",
                "banned",
                "HWID-SPAM-001",
                "Samsung S24 Ultra",
                "Android 14",
                "Vi phạm chia sẻ nhiều máy",
                "admin",
                now_iso,
                now_iso,
                exp_7d,
            ),
        ]
        cur.executemany(
            """
            INSERT INTO license_keys (
              key_code, prefix, duration_hours, duration_label, status,
              hwid, device_name, os_version, note, created_by, created_at, activated_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            sample_keys,
        )

        # Tạo dữ liệu biểu đồ 7 ngày gần nhất để Dashboard hiển thị trực quan ngay từ đầu
        sample_counts = [3, 5, 4, 8, 6, 11, 7]
        for idx, cnt in enumerate(sample_counts):
            day_dt = now - datetime.timedelta(days=(6 - idx))
            d_str = day_dt.strftime("%Y-%m-%d")
            for c in range(cnt):
                cur.execute(
                    "INSERT INTO activation_logs (key_code, device_name, hwid, activated_date, created_at) VALUES (?, ?, ?, ?, ?)",
                    (f"NGBAO-LOG-{idx}-{c}", "iPhone 12 Pro", f"HWID-{idx}-{c}", d_str, day_dt.isoformat()),
                )

    conn.commit()
    conn.close()


def sync_expired_keys(conn):
    now_iso = datetime.datetime.now().isoformat()
    conn.execute(
        "UPDATE license_keys SET status = 'expired' WHERE status = 'active' AND expires_at != '' AND expires_at < ?",
        (now_iso,),
    )
    conn.commit()


class KeyServerHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send_json(self, status_code: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def _get_auth_user(self, conn):
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        decoded = decode_jwt(auth[7:])
        if not decoded:
            return None
        row = conn.execute(
            "SELECT id, username, role, credits, is_active FROM users WHERE id = ?",
            (decoded.get("id"),),
        ).fetchone()
        if not row or not row["is_active"]:
            return None
        return dict(row)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # 1. API Captcha
        if path == "/api/auth/captcha":
            n1 = random.randint(1, 9)
            n2 = random.randint(1, 9)
            cid = secrets.token_hex(8)
            CAPTCHA_STORE[cid] = {"answer": str(n1 + n2), "expires": time.time() + 300}
            return self._send_json(200, {"success": True, "captchaId": cid, "question": f"{n1} + {n2} = ?"})

        # 2. API Thông tin tài khoản hiện tại
        if path == "/api/auth/me":
            conn = get_db()
            user = self._get_auth_user(conn)
            conn.close()
            if not user:
                return self._send_json(401, {"success": False, "message": "Phiên đăng nhập đã hết hạn!"})
            return self._send_json(200, {"success": True, "user": user})

        # 3. API Thống kê Dashboard
        if path == "/api/stats":
            conn = get_db()
            user = self._get_auth_user(conn)
            if not user:
                conn.close()
                return self._send_json(401, {"success": False, "message": "Chưa đăng nhập!"})

            sync_expired_keys(conn)
            is_super = user["role"] == "super_admin"
            where_owner = "" if is_super else "WHERE created_by = ?"
            params = () if is_super else (user["username"],)

            total = conn.execute(f"SELECT COUNT(*) AS cnt FROM license_keys {where_owner}", params).fetchone()["cnt"]
            active = conn.execute(
                f"SELECT COUNT(*) AS cnt FROM license_keys {'WHERE' if is_super else 'WHERE created_by = ? AND'} status = 'active'",
                params,
            ).fetchone()["cnt"]
            available = conn.execute(
                f"SELECT COUNT(*) AS cnt FROM license_keys {'WHERE' if is_super else 'WHERE created_by = ? AND'} status = 'available'",
                params,
            ).fetchone()["cnt"]
            expired_or_banned = conn.execute(
                f"SELECT COUNT(*) AS cnt FROM license_keys {'WHERE' if is_super else 'WHERE created_by = ? AND'} status IN ('expired', 'banned')",
                params,
            ).fetchone()["cnt"]

            chart = []
            now = datetime.datetime.now()
            for i in range(6, -1, -1):
                d = now - datetime.timedelta(days=i)
                d_str = d.strftime("%Y-%m-%d")
                lbl = d.strftime("%d/%m")
                cnt = conn.execute(
                    "SELECT COUNT(*) AS cnt FROM activation_logs WHERE activated_date = ?", (d_str,)
                ).fetchone()["cnt"]
                chart.append({"date": d_str, "label": lbl, "count": cnt})

            conn.close()
            return self._send_json(
                200,
                {
                    "success": True,
                    "stats": {
                        "total": total,
                        "active": active,
                        "available": available,
                        "expiredOrBanned": expired_or_banned,
                        "credits": user["credits"],
                    },
                    "chart": chart,
                },
            )

        # 4. API Danh sách & Tìm kiếm Key
        if path == "/api/keys":
            conn = get_db()
            user = self._get_auth_user(conn)
            if not user:
                conn.close()
                return self._send_json(401, {"success": False, "message": "Chưa đăng nhập!"})

            sync_expired_keys(conn)
            status_filter = query.get("status", ["all"])[0]
            search_q = query.get("search", [""])[0].strip()

            conds = []
            params = []
            if user["role"] != "super_admin":
                conds.append("created_by = ?")
                params.append(user["username"])
            if status_filter and status_filter != "all":
                conds.append("status = ?")
                params.append(status_filter)
            if search_q:
                like_q = f"%{search_q}%"
                conds.append("(key_code LIKE ? OR note LIKE ? OR device_name LIKE ? OR hwid LIKE ?)")
                params.extend([like_q, like_q, like_q, like_q])

            where_sql = f"WHERE {' AND '.join(conds)}" if conds else ""
            rows = conn.execute(
                f"SELECT * FROM license_keys {where_sql} ORDER BY id DESC LIMIT 500", tuple(params)
            ).fetchall()

            keys_list = []
            for r in rows:
                item = dict(r)
                item["activated_at_vn"] = format_vn_datetime(item["activated_at"]) if item["activated_at"] else "—"
                item["expires_at_vn"] = format_vn_datetime(item["expires_at"]) if item["expires_at"] else "Chưa kích hoạt"
                keys_list.append(item)

            conn.close()
            return self._send_json(200, {"success": True, "keys": keys_list})

        # 5. API Danh sách Đại lý / Reseller (Super Admin)
        if path == "/api/users":
            conn = get_db()
            user = self._get_auth_user(conn)
            if not user or user["role"] != "super_admin":
                conn.close()
                return self._send_json(403, {"success": False, "message": "Chỉ Super Admin mới có quyền!"})

            rows = conn.execute(
                """
                SELECT u.id, u.username, u.role, u.credits, u.is_active, u.created_at,
                       (SELECT COUNT(*) FROM license_keys k WHERE k.created_by = u.username) AS keys_count
                FROM users u ORDER BY u.id ASC
                """
            ).fetchall()
            conn.close()
            return self._send_json(200, {"success": True, "users": [dict(r) for r in rows]})

        # Phục vụ trang tĩnh
        if path in ("/admin", "/admin/"):
            return self._serve_file(os.path.join(BASE_DIR, "public", "admin.html"))
        if path == "/":
            return self._serve_file(os.path.join(BASE_DIR, "index.html"))

        # Tìm file trong public/ hoặc thư mục gốc
        candidate_public = os.path.join(BASE_DIR, "public", path.lstrip("/"))
        if os.path.isfile(candidate_public):
            return self._serve_file(candidate_public)

        candidate_root = os.path.join(BASE_DIR, path.lstrip("/"))
        if os.path.isfile(candidate_root):
            return self._serve_file(candidate_root)

        self._send_json(404, {"success": False, "message": "Không tìm thấy đường dẫn!"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_json_body()

        # 1. API Đăng nhập
        if path == "/api/auth/login":
            client_ip = self.client_address[0]
            now_ts = time.time()
            attempts = [t for t in RATE_LIMIT_STORE.get(client_ip, []) if now_ts - t < 300]
            if len(attempts) >= 15:
                return self._send_json(
                    429, {"success": False, "message": "Quá nhiều lần đăng nhập sai! Thử lại sau 5 phút."}
                )

            username = str(body.get("username", "")).strip()
            password = str(body.get("password", ""))
            captcha_id = body.get("captchaId")
            captcha_ans = str(body.get("captchaAnswer", "")).strip()

            if captcha_id:
                cap = CAPTCHA_STORE.pop(captcha_id, None)
                if not cap or cap["expires"] < now_ts or cap["answer"] != captcha_ans:
                    return self._send_json(400, {"success": False, "message": "Mã bảo vệ (Captcha) không chính xác!"})

            conn = get_db()
            user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            conn.close()

            if not user or not verify_password(password, user["password_hash"]):
                attempts.append(now_ts)
                RATE_LIMIT_STORE[client_ip] = attempts
                return self._send_json(401, {"success": False, "message": "Sai tài khoản hoặc mật khẩu!"})

            if not user["is_active"]:
                return self._send_json(403, {"success": False, "message": "Tài khoản Đại lý đã bị khóa!"})

            token = create_jwt({"id": user["id"], "username": user["username"], "role": user["role"]})
            return self._send_json(
                200,
                {
                    "success": True,
                    "message": "Đăng nhập thành công!",
                    "token": token,
                    "user": {
                        "id": user["id"],
                        "username": user["username"],
                        "role": user["role"],
                        "credits": user["credits"],
                    },
                },
            )

        # 2. API Verify Key từ APK Client: POST /api/key/verify
        if path == "/api/key/verify":
            conn = get_db()
            sync_expired_keys(conn)

            clean_key = str(body.get("key", "")).strip().upper()
            if not clean_key:
                conn.close()
                return self._send_json(400, {"success": False, "message": "Vui lòng nhập mã License Key!"})

            row = conn.execute("SELECT * FROM license_keys WHERE UPPER(key_code) = ?", (clean_key,)).fetchone()
            if not row:
                conn.close()
                return self._send_json(404, {"success": False, "message": "Key không tồn tại trên Server!"})

            record = dict(row)
            if record["status"] == "banned":
                conn.close()
                return self._send_json(403, {"success": False, "message": "Key này đã bị Admin khóa (Banned)!"})

            if record["status"] == "expired":
                conn.close()
                return self._send_json(
                    403, {"success": False, "message": f"Key đã hết hạn vào {format_vn_datetime(record['expires_at'])}!"}
                )

            client_device = str(body.get("deviceName") or "iPhone 12 Pro").strip()
            client_hwid = str(body.get("hwid") or client_device).strip()
            client_os = str(body.get("osVersion") or "26.6.1").strip()
            now = datetime.datetime.now()
            expires_iso = record["expires_at"]

            if record["status"] == "available":
                exp_dt = now + datetime.timedelta(hours=record["duration_hours"])
                expires_iso = exp_dt.isoformat()
                conn.execute(
                    """
                    UPDATE license_keys
                    SET status = 'active', hwid = ?, device_name = ?, os_version = ?, activated_at = ?, expires_at = ?
                    WHERE id = ?
                    """,
                    (client_hwid, client_device, client_os, now.isoformat(), expires_iso, record["id"]),
                )
                conn.execute(
                    "INSERT INTO activation_logs (key_code, device_name, hwid, activated_date, created_at) VALUES (?, ?, ?, ?, ?)",
                    (record["key_code"], client_device, client_hwid, now.strftime("%Y-%m-%d"), now.isoformat()),
                )
                conn.commit()
            elif record["status"] == "active":
                if record["hwid"] and record["hwid"] != client_hwid:
                    conn.close()
                    return self._send_json(
                        403,
                        {
                            "success": False,
                            "message": f"Key đã gắn cố định với thiết bị ({record['device_name']})! Liên hệ Admin để Reset HWID.",
                        },
                    )
                if not record["hwid"]:
                    conn.execute(
                        "UPDATE license_keys SET hwid = ?, device_name = ?, os_version = ? WHERE id = ?",
                        (client_hwid, client_device, client_os, record["id"]),
                    )
                    conn.commit()

            final_device = record["device_name"] or client_device
            final_os = record["os_version"] or client_os
            short_greeting = "iPhone" if "iphone" in final_device.lower() else (final_device.split(" ")[0] or "User")
            conn.close()

            return self._send_json(
                200,
                {
                    "success": True,
                    "message": "Kích hoạt thành công!",
                    "data": {
                        "greeting": f"Hi {short_greeting}",
                        "expireAt": format_vn_datetime(expires_iso),
                        "deviceName": final_device,
                        "osVersion": final_os,
                        "apiServer": "6.1.0",
                    },
                },
            )

        # 3. API Tạo Key (Lẻ / Hàng loạt)
        if path == "/api/keys/generate":
            conn = get_db()
            user = self._get_auth_user(conn)
            if not user:
                conn.close()
                return self._send_json(401, {"success": False, "message": "Chưa đăng nhập!"})

            prefix = str(body.get("prefix", "NGBAO-")).strip().upper()
            duration = str(body.get("duration", "1d"))
            quantity = min(max(int(body.get("quantity", 1) or 1), 1), 100)
            note = str(body.get("note", "")).strip()

            d_cfg = DURATION_OPTIONS.get(duration)
            if not d_cfg:
                conn.close()
                return self._send_json(400, {"success": False, "message": "Thời hạn Key không hợp lệ!"})

            total_cost = d_cfg["creditCost"] * quantity
            if user["role"] != "super_admin":
                if user["credits"] < total_cost:
                    conn.close()
                    return self._send_json(
                        403,
                        {
                            "success": False,
                            "message": f"Không đủ Credit! Cần {total_cost} Credit nhưng bạn còn {user['credits']} Credit.",
                        },
                    )
                conn.execute("UPDATE users SET credits = credits - ? WHERE id = ?", (total_cost, user["id"]))

            created_keys = []
            now_iso = datetime.datetime.now().isoformat()
            for _ in range(quantity):
                code = generate_random_key_code(prefix)
                while conn.execute("SELECT id FROM license_keys WHERE key_code = ?", (code,)).fetchone():
                    code = generate_random_key_code(prefix)
                conn.execute(
                    """
                    INSERT INTO license_keys (key_code, prefix, duration_hours, duration_label, status, note, created_by, created_at)
                    VALUES (?, ?, ?, ?, 'available', ?, ?, ?)
                    """,
                    (code, prefix, d_cfg["hours"], d_cfg["label"], note, user["username"], now_iso),
                )
                created_keys.append(code)

            conn.commit()
            updated_credits = conn.execute("SELECT credits FROM users WHERE id = ?", (user["id"],)).fetchone()["credits"]
            conn.close()

            return self._send_json(
                200,
                {
                    "success": True,
                    "message": f"Đã tạo thành công {len(created_keys)} Key ({d_cfg['label']})!",
                    "keys": created_keys,
                    "durationLabel": d_cfg["label"],
                    "note": note,
                    "remainingCredits": updated_credits,
                },
            )

        # 4. Các hành động trên từng Key: Reset HWID / Extend / Toggle Ban
        m_action = re.match(r"^/api/keys/(\d+)/(reset-hwid|extend|toggle-ban)$", path)
        if m_action:
            key_id = int(m_action.group(1))
            action = m_action.group(2)

            conn = get_db()
            user = self._get_auth_user(conn)
            if not user:
                conn.close()
                return self._send_json(401, {"success": False, "message": "Chưa đăng nhập!"})

            row = conn.execute("SELECT * FROM license_keys WHERE id = ?", (key_id,)).fetchone()
            if not row:
                conn.close()
                return self._send_json(404, {"success": False, "message": "Không tìm thấy Key!"})

            record = dict(row)
            if user["role"] != "super_admin" and record["created_by"] != user["username"]:
                conn.close()
                return self._send_json(403, {"success": False, "message": "Bạn chỉ được thao tác trên Key do mình tạo!"})

            if action == "reset-hwid":
                conn.execute("UPDATE license_keys SET hwid = '', device_name = '' WHERE id = ?", (key_id,))
                conn.commit()
                conn.close()
                return self._send_json(
                    200,
                    {"success": True, "message": f"Đã Reset HWID cho Key {record['key_code']}! Khách có thể đổi máy mới."},
                )

            if action == "extend":
                add_hours = int(body.get("addHours", 24) or 24)
                new_hours = record["duration_hours"] + add_hours
                new_exp = record["expires_at"]
                new_status = record["status"]
                if record["expires_at"]:
                    try:
                        base_dt = datetime.datetime.fromisoformat(record["expires_at"].replace("Z", "+00:00"))
                        if base_dt < datetime.datetime.now():
                            base_dt = datetime.datetime.now()
                    except Exception:
                        base_dt = datetime.datetime.now()
                    new_exp = (base_dt + datetime.timedelta(hours=add_hours)).isoformat()
                    if new_status == "expired":
                        new_status = "active"

                add_lbl = f"+{add_hours // 24} Ngày" if add_hours >= 24 else f"+{add_hours} Giờ"
                base_lbl = record["duration_label"].split(" (+")[0]
                conn.execute(
                    "UPDATE license_keys SET duration_hours = ?, duration_label = ?, expires_at = ?, status = ? WHERE id = ?",
                    (new_hours, f"{base_lbl} ({add_lbl})", new_exp, new_status, key_id),
                )
                conn.commit()
                conn.close()
                return self._send_json(
                    200, {"success": True, "message": f"Đã gia hạn {add_lbl} cho Key {record['key_code']}!"}
                )

            if action == "toggle-ban":
                if record["status"] == "banned":
                    next_st = "active" if record["activated_at"] else "available"
                else:
                    next_st = "banned"
                conn.execute("UPDATE license_keys SET status = ? WHERE id = ?", (next_st, key_id))
                conn.commit()
                conn.close()
                msg = (
                    f"Đã KHÓA (Ban) mã {record['key_code']}!"
                    if next_st == "banned"
                    else f"Đã MỞ KHÓA mã {record['key_code']}!"
                )
                return self._send_json(200, {"success": True, "message": msg, "status": next_st})

        # 5. Quản lý Đại lý (Reseller): Tạo mới / Cộng Credit / Khóa
        if path == "/api/users":
            conn = get_db()
            user = self._get_auth_user(conn)
            if not user or user["role"] != "super_admin":
                conn.close()
                return self._send_json(403, {"success": False, "message": "Chỉ Super Admin mới có quyền!"})

            uname = str(body.get("username", "")).strip()
            pwd = str(body.get("password", ""))
            credits = max(int(body.get("credits", 50) or 0), 0)
            role = "super_admin" if body.get("role") == "super_admin" else "reseller"

            if not uname or len(pwd) < 4:
                conn.close()
                return self._send_json(400, {"success": False, "message": "Tài khoản và mật khẩu (>= 4 ký tự) bắt buộc!"})

            if conn.execute("SELECT id FROM users WHERE username = ?", (uname,)).fetchone():
                conn.close()
                return self._send_json(409, {"success": False, "message": "Tên tài khoản này đã tồn tại!"})

            conn.execute(
                "INSERT INTO users (username, password_hash, role, credits, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                (uname, hash_password(pwd), role, credits, datetime.datetime.now().isoformat()),
            )
            conn.commit()
            conn.close()
            return self._send_json(200, {"success": True, "message": f"Đã tạo Đại lý {uname} ({credits} Credit)!"})

        m_user = re.match(r"^/api/users/(\d+)/(credits|toggle-active)$", path)
        if m_user:
            uid = int(m_user.group(1))
            u_act = m_user.group(2)
            conn = get_db()
            user = self._get_auth_user(conn)
            if not user or user["role"] != "super_admin":
                conn.close()
                return self._send_json(403, {"success": False, "message": "Chỉ Super Admin mới có quyền!"})

            target = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
            if not target:
                conn.close()
                return self._send_json(404, {"success": False, "message": "Không tìm thấy tài khoản!"})

            if u_act == "credits":
                delta = int(body.get("addCredits", 0) or 0)
                next_c = max(target["credits"] + delta, 0)
                conn.execute("UPDATE users SET credits = ? WHERE id = ?", (next_c, uid))
                conn.commit()
                conn.close()
                return self._send_json(
                    200,
                    {"success": True, "message": f"Đã cập nhật số dư cho {target['username']}: {next_c} Credit!"},
                )

            if u_act == "toggle-active":
                if target["username"] == "admin":
                    conn.close()
                    return self._send_json(400, {"success": False, "message": "Không thể khóa Super Admin gốc!"})
                next_active = 0 if target["is_active"] else 1
                conn.execute("UPDATE users SET is_active = ? WHERE id = ?", (next_active, uid))
                conn.commit()
                conn.close()
                return self._send_json(
                    200,
                    {
                        "success": True,
                        "message": f"Đã {'mở khóa' if next_active else 'khóa'} tài khoản {target['username']}!",
                    },
                )

        self._send_json(404, {"success": False, "message": "API không tồn tại!"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        m_del = re.match(r"^/api/keys/(\d+)$", parsed.path)
        if m_del:
            key_id = int(m_del.group(1))
            conn = get_db()
            user = self._get_auth_user(conn)
            if not user:
                conn.close()
                return self._send_json(401, {"success": False, "message": "Chưa đăng nhập!"})

            row = conn.execute("SELECT * FROM license_keys WHERE id = ?", (key_id,)).fetchone()
            if not row:
                conn.close()
                return self._send_json(404, {"success": False, "message": "Không tìm thấy Key!"})

            if user["role"] != "super_admin" and row["created_by"] != user["username"]:
                conn.close()
                return self._send_json(403, {"success": False, "message": "Bạn không có quyền xóa Key này!"})

            conn.execute("DELETE FROM license_keys WHERE id = ?", (key_id,))
            conn.commit()
            conn.close()
            return self._send_json(200, {"success": True, "message": f"Đã xóa Key {row['key_code']}!"})

        self._send_json(404, {"success": False, "message": "Không tìm thấy đường dẫn xóa!"})

    def _serve_file(self, filepath: str):
        try:
            with open(filepath, "rb") as f:
                content = f.read()
            ctype, _ = mimetypes.guess_type(filepath)
            if not ctype:
                ctype = "application/octet-stream"
            if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
                ctype += "; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception:
            self._send_json(404, {"success": False, "message": "File not found"})


if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    init_database()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), KeyServerHandler)
    print("==========================================================", flush=True)
    print(f"[OK] FF SERVER KEY & WEB ADMIN RUNNING ON PORT {PORT}", flush=True)
    print(f"[ADMIN] Web Admin Panel : http://localhost:{PORT}/admin", flush=True)
    print(f"[APK]   APK Client Test : http://localhost:{PORT}/", flush=True)
    print(f"[API]   Verify Endpoint : http://localhost:{PORT}/api/key/verify", flush=True)
    print("[AUTH]  Super Admin     : admin / admin123456", flush=True)
    print("[AUTH]  Reseller        : reseller / reseller123", flush=True)
    print("==========================================================", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
