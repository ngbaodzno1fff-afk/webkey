/**
 * FF Server Key — Web Admin & Key Generator Frontend Controller
 */

let authToken = localStorage.getItem("ff_admin_token") || "";
let currentUser = null;
let currentCaptchaId = "";
let currentCaptchaRawQuestion = "";
let currentStatusFilter = "all";
let lastGeneratedKeys = [];
let lastGeneratedMeta = { durationLabel: "", note: "" };
let extendingKeyId = null;

// Elements
const loginView = document.getElementById("loginView");
const dashboardShell = document.getElementById("dashboardShell");
const toastContainer = document.getElementById("toastContainer");

const loginForm = document.getElementById("loginForm");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginCaptcha = document.getElementById("loginCaptcha");
const captchaQuestionBox = document.getElementById("captchaQuestionBox");
const btnRefreshCaptcha = document.getElementById("btnRefreshCaptcha");
const loginError = document.getElementById("loginError");

const btnFillAdmin = document.getElementById("btnFillAdmin");
const btnFillReseller = document.getElementById("btnFillReseller");

const badgeUserRole = document.getElementById("badgeUserRole");
const sidebarUsername = document.getElementById("sidebarUsername");
const sidebarCredits = document.getElementById("sidebarCredits");
const navTabResellers = document.getElementById("navTabResellers");

const statTotal = document.getElementById("statTotal");
const statActive = document.getElementById("statActive");
const statAvailable = document.getElementById("statAvailable");
const statExpiredBanned = document.getElementById("statExpiredBanned");
const activationChart = document.getElementById("activationChart");
const apiVerifyEndpointText = document.getElementById("apiVerifyEndpointText");
const btnCopyApiUrl = document.getElementById("btnCopyApiUrl");

const generateKeyForm = document.getElementById("generateKeyForm");
const genPrefix = document.getElementById("genPrefix");
const genDuration = document.getElementById("genDuration");
const genQuantity = document.getElementById("genQuantity");
const genNote = document.getElementById("genNote");

const searchKeyInput = document.getElementById("searchKeyInput");
const btnRefreshKeys = document.getElementById("btnRefreshKeys");
const keysTableBody = document.getElementById("keysTableBody");

const generatedModal = document.getElementById("generatedModal");
const generatedModalSub = document.getElementById("generatedModalSub");
const generatedKeysList = document.getElementById("generatedKeysList");
const btnCloseGenModal = document.getElementById("btnCloseGenModal");
const btnCopyAllKeys = document.getElementById("btnCopyAllKeys");
const btnExportTxt = document.getElementById("btnExportTxt");
const btnTestInApk = document.getElementById("btnTestInApk");

const extendModal = document.getElementById("extendModal");
const extendKeyLabel = document.getElementById("extendKeyLabel");
const extendHoursSelect = document.getElementById("extendHoursSelect");
const btnCloseExtendModal = document.getElementById("btnCloseExtendModal");
const btnConfirmExtend = document.getElementById("btnConfirmExtend");

const createResellerForm = document.getElementById("createResellerForm");
const resellersTableBody = document.getElementById("resellersTableBody");

// Hiển thị URL API Verify động theo tên miền hiện tại
const dynamicVerifyUrl = `${window.location.origin}/api/key/verify`;
if (apiVerifyEndpointText) {
  apiVerifyEndpointText.textContent = `POST ${dynamicVerifyUrl}`;
}

/**
 * Hiển thị Toast thông báo góc phải trên
 */
function showToast(message, type = "success") {
  const el = document.createElement("div");
  const isErr = type === "error";
  el.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl transition-all duration-300 ${
    isErr
      ? "bg-rose-950/90 border-rose-500/50 text-rose-200"
      : "bg-zinc-900/95 border-emerald-500/40 text-emerald-300"
  }`;
  el.innerHTML = `
    <span class="text-base">${isErr ? "⚠️" : "✅"}</span>
    <span class="text-xs font-semibold leading-snug">${message}</span>
  `;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-8px)";
    setTimeout(() => el.remove(), 280);
  }, 3200);
}

/**
 * Gọi API kèm JWT Header
 */
async function apiFetch(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && url !== "/api/auth/login") {
    logout();
  }
  return { ok: response.ok, status: response.status, data };
}

/**
 * Copy văn bản vào Clipboard
 */
async function copyText(text, label = "Đã sao chép vào bộ nhớ tạm!") {
  try {
    await navigator.clipboard.writeText(text);
    showToast(label, "success");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    showToast(label, "success");
  }
}

// ============================================================================
// A. XỬ LÝ CAPTCHA & ĐĂNG NHẬP
// ============================================================================
async function loadCaptcha() {
  const { ok, data } = await apiFetch("/api/auth/captcha");
  if (ok && data.success) {
    currentCaptchaId = data.captchaId;
    currentCaptchaRawQuestion = data.question;
    captchaQuestionBox.textContent = data.question;
    loginCaptcha.value = "";
  }
}

function solveCurrentCaptcha() {
  const m = currentCaptchaRawQuestion.match(/(\d+)\s*\+\s*(\d+)/);
  if (m) {
    loginCaptcha.value = String(parseInt(m[1], 10) + parseInt(m[2], 10));
  }
}

btnRefreshCaptcha.addEventListener("click", loadCaptcha);

btnFillAdmin.addEventListener("click", () => {
  loginUsername.value = "admin";
  loginPassword.value = "admin123456";
  solveCurrentCaptcha();
  loginError.textContent = "";
});

btnFillReseller.addEventListener("click", () => {
  loginUsername.value = "reseller";
  loginPassword.value = "reseller123";
  solveCurrentCaptcha();
  loginError.textContent = "";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";

  const { ok, data } = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: loginUsername.value.trim(),
      password: loginPassword.value,
      captchaId: currentCaptchaId,
      captchaAnswer: loginCaptcha.value.trim(),
    }),
  });

  if (!ok || !data.success) {
    loginError.textContent = data.message || "Đăng nhập thất bại!";
    await loadCaptcha();
    return;
  }

  authToken = data.token;
  localStorage.setItem("ff_admin_token", authToken);
  currentUser = data.user;
  showToast(`Chào mừng ${currentUser.username} quay trở lại!`);
  enterDashboard();
});

function logout() {
  authToken = "";
  currentUser = null;
  localStorage.removeItem("ff_admin_token");
  dashboardShell.classList.add("hidden");
  loginView.classList.remove("hidden");
  loadCaptcha();
}

document.getElementById("btnLogoutDesktop").addEventListener("click", logout);
document.getElementById("btnLogoutMobile").addEventListener("click", logout);

// ============================================================================
// B. KHỞI TẠO DASHBOARD & ĐIỀU HƯỚNG TAB
// ============================================================================
function updateSidebarUser(user) {
  currentUser = user;
  sidebarUsername.textContent = user.username;
  if (user.role === "super_admin") {
    badgeUserRole.textContent = "👑 SUPER ADMIN";
    badgeUserRole.className =
      "px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30";
    sidebarCredits.textContent = "∞ Vô hạn";
    navTabResellers.classList.remove("hidden");
  } else {
    badgeUserRole.textContent = "🤝 RESELLER";
    badgeUserRole.className =
      "px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30";
    sidebarCredits.textContent = `${user.credits} Credit`;
    navTabResellers.classList.add("hidden");
  }
}

async function enterDashboard() {
  loginView.classList.add("hidden");
  dashboardShell.classList.remove("hidden");
  updateSidebarUser(currentUser);
  await Promise.all([loadStatsAndChart(), loadKeysTable()]);
  if (currentUser.role === "super_admin") {
    await loadResellersTable();
  }
}

// Chuyển đổi Tab
document.querySelectorAll(".nav-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.getAttribute("data-tab");
    document.querySelectorAll(".nav-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    document.querySelectorAll(".tab-pane").forEach((pane) => {
      if (pane.id === targetId) {
        pane.classList.remove("hidden");
      } else {
        pane.classList.add("hidden");
      }
    });

    if (targetId === "tabOverview") loadStatsAndChart();
    if (targetId === "tabKeys") loadKeysTable();
    if (targetId === "tabResellers") loadResellersTable();
  });
});

// Load thống kê & vẽ biểu đồ 7 ngày
async function loadStatsAndChart() {
  const { ok, data } = await apiFetch("/api/stats");
  if (!ok || !data.success) return;

  const s = data.stats;
  statTotal.textContent = s.total;
  statActive.textContent = s.active;
  statAvailable.textContent = s.available;
  statExpiredBanned.textContent = s.expiredOrBanned;

  if (currentUser && currentUser.role !== "super_admin") {
    sidebarCredits.textContent = `${s.credits} Credit`;
  }

  // Render Biểu đồ cột Neon
  const chart = data.chart || [];
  const maxVal = Math.max(...chart.map((c) => c.count), 5);
  activationChart.innerHTML = chart
    .map((item) => {
      const heightPct = Math.max(Math.round((item.count / maxVal) * 100), 10);
      return `
        <div class="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
          <span class="text-[11px] font-mono font-bold text-rose-300 opacity-85 group-hover:opacity-100">
            ${item.count}
          </span>
          <div class="w-full max-w-[38px] rounded-t-xl bg-gradient-to-t from-rose-700/80 via-rose-500 to-orange-400 shadow-lg shadow-rose-600/30 transition-all duration-500 group-hover:brightness-125"
               style="height: ${heightPct}%"></div>
          <span class="text-[11px] text-zinc-400 font-medium">${item.label}</span>
        </div>
      `;
    })
    .join("");
}

btnCopyApiUrl.addEventListener("click", () => {
  copyText(dynamicVerifyUrl, "Đã copy URL Endpoint Verify cho APK!");
});

// ============================================================================
// C. CHỨC NĂNG TẠO KEY (KEY GENERATOR TOOL)
// ============================================================================
document.querySelectorAll(".prefix-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".prefix-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    genPrefix.value = chip.getAttribute("data-prefix");
  });
});

document.querySelectorAll(".qty-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".qty-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    genQuantity.value = chip.getAttribute("data-qty");
  });
});

generateKeyForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    prefix: genPrefix.value.trim() || "NGBAO-",
    duration: genDuration.value,
    quantity: parseInt(genQuantity.value, 10) || 1,
    note: genNote.value.trim(),
  };

  const { ok, data } = await apiFetch("/api/keys/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!ok || !data.success) {
    showToast(data.message || "Không thể tạo Key!", "error");
    return;
  }

  showToast(data.message, "success");
  lastGeneratedKeys = data.keys || [];
  lastGeneratedMeta = {
    durationLabel: data.durationLabel,
    note: data.note,
  };

  // Mở hộp thoại hiển thị danh sách Key vừa tạo
  openGeneratedModal();
  await Promise.all([loadStatsAndChart(), loadKeysTable()]);
});

function openGeneratedModal() {
  generatedModalSub.textContent = `Đã tạo ${lastGeneratedKeys.length} Key • Thời hạn: ${lastGeneratedMeta.durationLabel}`;
  generatedKeysList.innerHTML = lastGeneratedKeys
    .map(
      (k, idx) => `
      <div class="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10">
        <div class="flex items-center gap-2.5 truncate">
          <span class="text-[11px] font-mono text-zinc-500">#${idx + 1}</span>
          <code class="text-xs sm:text-sm font-mono font-bold text-rose-300 select-all truncate">${k}</code>
        </div>
        <button
          type="button"
          onclick="copySingleKey('${k}')"
          class="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 text-rose-200 text-xs font-semibold shrink-0 transition"
        >
          Copy 1 chạm
        </button>
      </div>
    `
    )
    .join("");
  generatedModal.classList.remove("hidden");
}

window.copySingleKey = function (keyCode) {
  copyText(keyCode, `Đã copy mã: ${keyCode}`);
};

btnCloseGenModal.addEventListener("click", () => {
  generatedModal.classList.add("hidden");
});

btnCopyAllKeys.addEventListener("click", () => {
  if (!lastGeneratedKeys.length) return;
  copyText(lastGeneratedKeys.join("\n"), `Đã copy tất cả ${lastGeneratedKeys.length} Key!`);
});

btnExportTxt.addEventListener("click", () => {
  if (!lastGeneratedKeys.length) return;
  const header = [
    "================================================",
    "       DANH SÁCH LICENSE KEY APK FREE FIRE      ",
    `       Thời hạn : ${lastGeneratedMeta.durationLabel}`,
    `       Ghi chú  : ${lastGeneratedMeta.note || "Không có"}`,
    `       Ngày xuất: ${new Date().toLocaleString("vi-VN")}`,
    "================================================",
    "",
  ].join("\r\n");

  const content = header + lastGeneratedKeys.join("\r\n") + "\r\n";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FF_Keys_${lastGeneratedKeys.length}_${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Đã tải xuống file .TXT thành công!");
});

btnTestInApk.addEventListener("click", () => {
  if (!lastGeneratedKeys.length) return;
  localStorage.setItem("saved_ff_key", lastGeneratedKeys[0]);
  window.open("/", "_blank");
});

// ============================================================================
// D. BẢNG QUẢN LÝ KEY (KEY MANAGEMENT TABLE)
// ============================================================================
function renderStatusBadge(status) {
  switch (status) {
    case "available":
      return `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">✨ Chưa kích hoạt</span>`;
    case "active":
      return `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">⚡ Đang dùng</span>`;
    case "expired":
      return `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-700/50 text-zinc-300 border border-zinc-600">⌛ Hết hạn</span>`;
    case "banned":
      return `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">🔒 Đã khóa</span>`;
    default:
      return status;
  }
}

async function loadKeysTable() {
  const search = searchKeyInput.value.trim();
  const url = `/api/keys?status=${encodeURIComponent(currentStatusFilter)}&search=${encodeURIComponent(search)}`;
  const { ok, data } = await apiFetch(url);
  if (!ok || !data.success) return;

  const keys = data.keys || [];
  if (keys.length === 0) {
    keysTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="py-10 text-center text-zinc-400">
          Không tìm thấy License Key nào khớp với bộ lọc hiện tại.
        </td>
      </tr>
    `;
    return;
  }

  keysTableBody.innerHTML = keys
    .map((k) => {
      const deviceInfo = k.device_name
        ? `<div class="font-semibold text-zinc-200">${k.device_name}</div>
           <div class="text-[11px] font-mono text-zinc-400 truncate max-w-[160px]">${k.hwid || ""}</div>`
        : `<span class="text-zinc-500 italic">Chưa gắn máy</span>`;

      const isBanned = k.status === "banned";

      return `
        <tr class="hover:bg-white/[0.03] transition">
          <td class="py-3.5 px-4">
            <div class="flex items-center gap-2">
              <code class="font-mono font-bold text-rose-300 select-all">${k.key_code}</code>
              <button
                type="button"
                onclick="copySingleKey('${k.key_code}')"
                title="Copy mã Key"
                class="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-[11px] text-zinc-300"
              >
                📋
              </button>
            </div>
          </td>
          <td class="py-3.5 px-3 font-medium text-zinc-200 whitespace-nowrap">${k.duration_label}</td>
          <td class="py-3.5 px-3 whitespace-nowrap">${renderStatusBadge(k.status)}</td>
          <td class="py-3.5 px-3">${deviceInfo}</td>
          <td class="py-3.5 px-3 text-zinc-300 whitespace-nowrap">${k.activated_at_vn}</td>
          <td class="py-3.5 px-3 text-zinc-300 whitespace-nowrap">${k.expires_at_vn}</td>
          <td class="py-3.5 px-3 text-zinc-300 max-w-[160px] truncate" title="${k.note || ""}">
            ${k.note || "<span class='text-zinc-500'>—</span>"}
          </td>
          <td class="py-3.5 px-4 text-right whitespace-nowrap">
            <div class="inline-flex items-center gap-1.5">
              <button
                type="button"
                onclick="handleResetHwid(${k.id})"
                title="Reset HWID (Cho phép đổi máy)"
                class="px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 font-semibold transition"
              >
                🔄 Reset HWID
              </button>
              <button
                type="button"
                onclick="openExtendModal(${k.id}, '${k.key_code}')"
                title="Gia hạn thêm ngày sử dụng"
                class="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-semibold transition"
              >
                ⏳ Gia hạn
              </button>
              <button
                type="button"
                onclick="handleToggleBan(${k.id})"
                title="${isBanned ? "Mở khóa Key" : "Khóa Key tạm thời"}"
                class="px-2.5 py-1.5 rounded-lg ${
                  isBanned
                    ? "bg-emerald-500/15 hover:bg-emerald-500/30 border-emerald-500/30 text-emerald-300"
                    : "bg-orange-500/15 hover:bg-orange-500/30 border-orange-500/30 text-orange-300"
                } border font-semibold transition"
              >
                ${isBanned ? "🔓 Mở khóa" : "🔒 Khóa"}
              </button>
              <button
                type="button"
                onclick="handleDeleteKey(${k.id}, '${k.key_code}')"
                title="Xóa Key"
                class="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/35 border border-rose-500/30 text-rose-300 font-semibold transition"
              >
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

// Bộ lọc trạng thái
document.querySelectorAll(".status-filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".status-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentStatusFilter = btn.getAttribute("data-status");
    loadKeysTable();
  });
});

searchKeyInput.addEventListener("input", () => {
  loadKeysTable();
});

btnRefreshKeys.addEventListener("click", () => {
  loadKeysTable();
  loadStatsAndChart();
  showToast("Đã làm mới dữ liệu Key!");
});

// Hành động 1: 🔄 Reset HWID
window.handleResetHwid = async function (id) {
  const { ok, data } = await apiFetch(`/api/keys/${id}/reset-hwid`, { method: "POST" });
  if (!ok || !data.success) {
    showToast(data.message || "Lỗi khi Reset HWID!", "error");
    return;
  }
  showToast(data.message, "success");
  loadKeysTable();
};

// Hành động 2: ⏳ Mở Modal Gia hạn Key
window.openExtendModal = function (id, keyCode) {
  extendingKeyId = id;
  extendKeyLabel.textContent = `Mã Key: ${keyCode}`;
  extendModal.classList.remove("hidden");
};

btnCloseExtendModal.addEventListener("click", () => {
  extendModal.classList.add("hidden");
});

btnConfirmExtend.addEventListener("click", async () => {
  if (!extendingKeyId) return;
  const addHours = parseInt(extendHoursSelect.value, 10) || 24;
  const { ok, data } = await apiFetch(`/api/keys/${extendingKeyId}/extend`, {
    method: "POST",
    body: JSON.stringify({ addHours }),
  });
  extendModal.classList.add("hidden");
  if (!ok || !data.success) {
    showToast(data.message || "Không thể gia hạn Key!", "error");
    return;
  }
  showToast(data.message, "success");
  loadKeysTable();
  loadStatsAndChart();
});

// Hành động 3: 🔒 Khóa / Mở khóa Key
window.handleToggleBan = async function (id) {
  const { ok, data } = await apiFetch(`/api/keys/${id}/toggle-ban`, { method: "POST" });
  if (!ok || !data.success) {
    showToast(data.message || "Không thể đổi trạng thái khóa!", "error");
    return;
  }
  showToast(data.message, "success");
  loadKeysTable();
  loadStatsAndChart();
};

// Hành động 4: 🗑️ Xóa Key
window.handleDeleteKey = async function (id, keyCode) {
  const { ok, data } = await apiFetch(`/api/keys/${id}`, { method: "DELETE" });
  if (!ok || !data.success) {
    showToast(data.message || "Không thể xóa Key!", "error");
    return;
  }
  showToast(data.message, "success");
  loadKeysTable();
  loadStatsAndChart();
};

// ============================================================================
// E. QUẢN LÝ ĐẠI LÝ / CỘNG TÁC VIÊN (SUPER ADMIN)
// ============================================================================
async function loadResellersTable() {
  if (!currentUser || currentUser.role !== "super_admin") return;
  const { ok, data } = await apiFetch("/api/users");
  if (!ok || !data.success) return;

  const users = data.users || [];
  resellersTableBody.innerHTML = users
    .map((u) => {
      const isSuper = u.role === "super_admin";
      return `
        <tr class="hover:bg-white/[0.03] transition">
          <td class="py-3 px-4 font-bold text-white">${u.username}</td>
          <td class="py-3 px-3">
            ${
              isSuper
                ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300">👑 Super Admin</span>`
                : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300">🤝 Reseller</span>`
            }
          </td>
          <td class="py-3 px-3 font-mono font-bold text-amber-400">
            ${isSuper ? "∞" : `${u.credits} Credit`}
          </td>
          <td class="py-3 px-3 text-zinc-300">${u.keys_count || 0} Key</td>
          <td class="py-3 px-3">
            ${
              u.is_active
                ? `<span class="text-emerald-400 font-semibold">● Hoạt động</span>`
                : `<span class="text-rose-400 font-semibold">● Đã khóa</span>`
            }
          </td>
          <td class="py-3 px-4 text-right whitespace-nowrap">
            ${
              u.username === "admin"
                ? `<span class="text-zinc-500 italic">Tài khoản gốc</span>`
                : `
                <div class="inline-flex gap-1.5">
                  <button
                    type="button"
                    onclick="handleAddCredit(${u.id}, 100)"
                    class="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-semibold"
                  >
                    +100 Credit
                  </button>
                  <button
                    type="button"
                    onclick="handleToggleUser(${u.id})"
                    class="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-200 font-semibold"
                  >
                    ${u.is_active ? "Khóa" : "Mở khóa"}
                  </button>
                </div>
              `
            }
          </td>
        </tr>
      `;
    })
    .join("");
}

createResellerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("resellerUsername").value.trim();
  const password = document.getElementById("resellerPassword").value;
  const credits = parseInt(document.getElementById("resellerCredits").value, 10) || 100;
  const role = document.getElementById("resellerRole").value;

  const { ok, data } = await apiFetch("/api/users", {
    method: "POST",
    body: JSON.stringify({ username, password, credits, role }),
  });

  if (!ok || !data.success) {
    showToast(data.message || "Không thể tạo tài khoản!", "error");
    return;
  }

  showToast(data.message, "success");
  createResellerForm.reset();
  loadResellersTable();
});

window.handleAddCredit = async function (userId, amount) {
  const { ok, data } = await apiFetch(`/api/users/${userId}/credits`, {
    method: "POST",
    body: JSON.stringify({ addCredits: amount }),
  });
  if (ok && data.success) {
    showToast(data.message, "success");
    loadResellersTable();
  }
};

window.handleToggleUser = async function (userId) {
  const { ok, data } = await apiFetch(`/api/users/${userId}/toggle-active`, {
    method: "POST",
  });
  if (ok && data.success) {
    showToast(data.message, "success");
    loadResellersTable();
  }
};

// ============================================================================
// KHỞI ĐỘNG BAN ĐẦU
// ============================================================================
(async function init() {
  await loadCaptcha();
  if (authToken) {
    const { ok, data } = await apiFetch("/api/auth/me");
    if (ok && data.success) {
      currentUser = data.user;
      enterDashboard();
      return;
    }
  }
})();
