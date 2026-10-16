/**
 * NGBAO FF VIP Overlay App
 * Khớp 100% Giao Diện Holo HUD & VIP PANEL Chuẩn Esports
 */

const API_SERVER_URL = "https://webkey-nine.vercel.app/api/key/verify";

// DOM Elements
const hudCrosshair = document.getElementById("hudCrosshair");
const hudLabelTamAo = document.getElementById("hudLabelTamAo");
const hudFovCircle = document.getElementById("hudFovCircle");
const hudLabelVongFov = document.getElementById("hudLabelVongFov");
const holoHudLabel = document.getElementById("holoHudLabel");

const chkCrosshair = document.getElementById("chkCrosshair");
const chkFov = document.getElementById("chkFov");
const chkAimlock = document.getElementById("chkAimlock");
const chkAimbot = document.getElementById("chkAimbot");
const chkAimhead = document.getElementById("chkAimhead");

const rangeFovSize = document.getElementById("rangeFovSize");
const valFovSize = document.getElementById("valFovSize");

const chkMusic = document.getElementById("chkMusic");
const bgmAudio = document.getElementById("bgmAudio");
const btnPickMusic = document.getElementById("btnPickMusic");
const bgmFileInput = document.getElementById("bgmFileInput");

const btnLaunchFF = document.getElementById("btnLaunchFF");
const btnLaunchFFMax = document.getElementById("btnLaunchFFMax");

const floatingBall = document.getElementById("floatingBall");
const vipPanelCard = document.getElementById("vipPanelCard");
const vipPanelWrapper = document.getElementById("vipPanelWrapper");

// Key Modal Elements
const btnOpenKeyModal = document.getElementById("btnOpenKeyModal");
const keyAuthModal = document.getElementById("keyAuthModal");
const modalKeyInput = document.getElementById("modalKeyInput");
const btnModalPaste = document.getElementById("btnModalPaste");
const btnModalClose = document.getElementById("btnModalClose");
const btnModalVerify = document.getElementById("btnModalVerify");
const modalErrorMsg = document.getElementById("modalErrorMsg");
const topKeyStatusText = document.getElementById("topKeyStatusText");

// Toast
const bgToast = document.getElementById("bgToast");
const toastTitle = document.getElementById("toastTitle");
const toastSub = document.getElementById("toastSub");

function showToast(title, sub = "Holo HUD Active") {
  if (!bgToast) return;
  toastTitle.textContent = title;
  toastSub.textContent = sub;
  bgToast.classList.add("show");
  setTimeout(() => {
    bgToast.classList.remove("show");
  }, 2200);
}

// ================= 1. VÒNG FOV & THANH TRƯỢT KÍCH THƯỚC =================
function updateFovSize(size) {
  if (hudFovCircle) {
    hudFovCircle.style.width = `${size}px`;
    hudFovCircle.style.height = `${size}px`;
  }
  if (valFovSize) {
    valFovSize.textContent = `${size}px`;
  }
  if (holoHudLabel) {
    holoHudLabel.style.top = `calc(50% - ${size / 2 + 25}px)`;
  }
  if (hudLabelVongFov) {
    hudLabelVongFov.style.top = `calc(50% + ${size / 2 - 15}px)`;
    hudLabelVongFov.style.left = `calc(50% - ${size / 2 + 20}px)`;
  }
}

if (rangeFovSize) {
  rangeFovSize.addEventListener("input", (e) => {
    updateFovSize(e.target.value);
  });
}

// Bật / Tắt Vòng FOV
if (chkFov) {
  chkFov.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    updateToggleText(chkFov, isChecked);
    if (hudFovCircle) hudFovCircle.classList.toggle("hidden", !isChecked);
    if (hudLabelVongFov) hudLabelVongFov.classList.toggle("hidden", !isChecked);
    if (holoHudLabel) holoHudLabel.classList.toggle("hidden", !isChecked);
    showToast(isChecked ? "Đã BẬT Vòng FOV" : "Đã TẮT Vòng FOV");
  });
}

// Bật / Tắt Tâm Ảo (Crosshair)
if (chkCrosshair) {
  chkCrosshair.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    updateToggleText(chkCrosshair, isChecked);
    if (hudCrosshair) hudCrosshair.classList.toggle("hidden", !isChecked);
    if (hudLabelTamAo) hudLabelTamAo.classList.toggle("hidden", !isChecked);
    showToast(isChecked ? "Đã BẬT Tâm Ảo" : "Đã TẮT Tâm Ảo");
  });
}

// Aimlock, Aimbot, Aimhead
[chkAimlock, chkAimbot, chkAimhead].forEach((chk) => {
  if (chk) {
    chk.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      updateToggleText(chk, isChecked);
      const name = chk.id.replace("chk", "");
      showToast(`${isChecked ? "Đã BẬT" : "Đã TẮT"} ${name}`);
    });
  }
});

function updateToggleText(inputEl, isChecked) {
  const txtEl = inputEl.parentElement.querySelector(".toggle-state-text");
  if (txtEl) {
    txtEl.textContent = isChecked ? "ON" : "OFF";
  }
}

// ================= 2. HỆ THỐNG NHẠC MP3 LẶP LẠI =================
function startMusic() {
  if (bgmAudio) {
    bgmAudio.loop = true;
    bgmAudio.play().catch(() => {
      // Autoplay fallback
      document.addEventListener("click", () => {
        if (chkMusic.checked) bgmAudio.play().catch(() => {});
      }, { once: true });
    });
  }
}

function stopMusic() {
  if (bgmAudio) bgmAudio.pause();
}

if (chkMusic) {
  chkMusic.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    updateToggleText(chkMusic, isChecked);
    if (isChecked) {
      startMusic();
      showToast("Đã BẬT Nhạc Nền MP3 (Loop)");
    } else {
      stopMusic();
      showToast("Đã TẮT Nhạc Nền");
    }
  });
}

// Chọn file nhạc từ Downloads
if (btnPickMusic && bgmFileInput) {
  btnPickMusic.addEventListener("click", () => {
    bgmFileInput.click();
  });

  bgmFileInput.addEventListener("change", () => {
    if (bgmFileInput.files && bgmFileInput.files[0]) {
      const file = bgmFileInput.files[0];
      bgmAudio.src = URL.createObjectURL(file);
      bgmAudio.loop = true;
      chkMusic.checked = true;
      updateToggleText(chkMusic, true);
      bgmAudio.play().catch(console.error);
      btnPickMusic.textContent = `🎵 ${file.name.substring(0, 16)}...`;
      showToast(`Đã nạp bài: ${file.name}`);
    }
  });
}

// ================= 3. KHỞI CHẠY FREE FIRE & FF MAX =================
function launchGame(type) {
  const packageName = type === "max" ? "com.dts.freefiremax" : "com.dts.freefireth";
  const gameName = type === "max" ? "Free Fire MAX" : "Free Fire Thường";

  // Gọi native Android bridge nếu đang chạy trong APK
  if (window.AndroidBridge) {
    if (type === "max" && typeof window.AndroidBridge.launchFreeFireMax === "function") {
      window.AndroidBridge.launchFreeFireMax();
      showToast(`Đang mở ${gameName}...`);
      return;
    }
    if (type === "normal" && typeof window.AndroidBridge.launchFreeFire === "function") {
      window.AndroidBridge.launchFreeFire();
      showToast(`Đang mở ${gameName}...`);
      return;
    }
  }

  // Fallback trên web di động: Mở Android intent
  showToast(`Đang mở ${gameName}...`);
  const intentUrl = `intent://#Intent;package=${packageName};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`;
  const startTime = Date.now();
  window.location.href = intentUrl;

  setTimeout(() => {
    if (Date.now() - startTime < 1600) {
      window.open(`https://play.google.com/store/apps/details?id=${packageName}`, "_blank");
    }
  }, 1200);
}

if (btnLaunchFF) btnLaunchFF.addEventListener("click", () => launchGame("normal"));
if (btnLaunchFFMax) btnLaunchFFMax.addEventListener("click", () => launchGame("max"));

// ================= 4. THU NHỎ / MỞ RỘNG & KÉO THẢ VIP PANEL =================
let isPanelMinimized = false;
let isDragging = false;
let startX = 0, startY = 0;
let initialLeft = 0, initialTop = 0;
let hasMoved = false;

floatingBall.addEventListener("click", (e) => {
  if (hasMoved) return; // Nếu vừa kéo thả thì không đóng/mở
  isPanelMinimized = !isPanelMinimized;
  if (vipPanelCard) {
    vipPanelCard.classList.toggle("minimized", isPanelMinimized);
  }
  showToast(isPanelMinimized ? "Đã thu nhỏ VIP PANEL về Avatar" : "Đã mở rộng VIP PANEL");
});

// Xử lý kéo thả Panel bằng Avatar badge
function onPointerDown(e) {
  isDragging = true;
  hasMoved = false;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  startX = clientX;
  startY = clientY;

  const rect = vipPanelWrapper.getBoundingClientRect();
  initialLeft = rect.left;
  initialTop = rect.top;

  document.addEventListener("mousemove", onPointerMove);
  document.addEventListener("mouseup", onPointerUp);
  document.addEventListener("touchmove", onPointerMove, { passive: false });
  document.addEventListener("touchend", onPointerUp);
}

function onPointerMove(e) {
  if (!isDragging) return;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  const dx = clientX - startX;
  const dy = clientY - startY;

  if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
    hasMoved = true;
    if (e.cancelable) e.preventDefault();
  }

  const maxLeft = window.innerWidth - 80;
  const maxTop = window.innerHeight - 80;

  const newLeft = Math.min(Math.max(initialLeft + dx, 10), maxLeft);
  const newTop = Math.min(Math.max(initialTop + dy, 40), maxTop);

  vipPanelWrapper.style.left = `${newLeft}px`;
  vipPanelWrapper.style.top = `${newTop}px`;
  vipPanelWrapper.style.right = "auto";
  vipPanelWrapper.style.transform = "none";
}

function onPointerUp() {
  if (!isDragging) return;
  isDragging = false;
  document.removeEventListener("mousemove", onPointerMove);
  document.removeEventListener("mouseup", onPointerUp);
  document.removeEventListener("touchmove", onPointerMove);
  document.removeEventListener("touchend", onPointerUp);
}

floatingBall.addEventListener("mousedown", onPointerDown);
floatingBall.addEventListener("touchstart", onPointerDown, { passive: false });

// ================= 5. MODAL XÁC THỰC LICENSE KEY =================
if (btnOpenKeyModal && keyAuthModal) {
  btnOpenKeyModal.addEventListener("click", () => {
    keyAuthModal.classList.add("open");
  });
}

if (btnModalClose && keyAuthModal) {
  btnModalClose.addEventListener("click", () => {
    keyAuthModal.classList.remove("open");
  });
}

if (btnModalPaste && modalKeyInput) {
  btnModalPaste.addEventListener("click", async () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.getClipboard === "function") {
      const clip = window.AndroidBridge.getClipboard();
      if (clip) {
        modalKeyInput.value = clip.trim();
        return;
      }
    }
    try {
      const text = await navigator.clipboard.readText();
      modalKeyInput.value = text.trim();
    } catch {
      modalKeyInput.focus();
    }
  });
}

if (btnModalVerify) {
  btnModalVerify.addEventListener("click", async () => {
    const key = modalKeyInput.value.trim();
    if (!key) {
      modalErrorMsg.textContent = "Vui lòng nhập mã Key!";
      return;
    }

    modalErrorMsg.textContent = "Đang kiểm tra Key...";
    btnModalVerify.disabled = true;

    try {
      const deviceName = window.AndroidBridge && typeof window.AndroidBridge.getDeviceName === "function" 
        ? window.AndroidBridge.getDeviceName() 
        : navigator.userAgent.includes("Android") ? "Android Phone" : "Xiaomi Device";

      const resp = await fetch(API_SERVER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, deviceName })
      });

      const res = await resp.json();
      if (res.success) {
        localStorage.setItem("saved_ff_key", key);
        topKeyStatusText.textContent = `KEY VIP: ${key.substring(0, 10)}...`;
        showToast("Xác Thực Key Thành Công!", "VIP Active");
        keyAuthModal.classList.remove("open");
      } else {
        modalErrorMsg.textContent = res.message || "Key không hợp lệ!";
      }
    } catch (e) {
      // Fallback nếu mạng yếu
      localStorage.setItem("saved_ff_key", key);
      topKeyStatusText.textContent = `KEY VIP: ACTIVE`;
      showToast("Đã kích hoạt Offline", "Holo HUD Active");
      keyAuthModal.classList.remove("open");
    } finally {
      btnModalVerify.disabled = false;
    }
  });
}

// Khởi tạo ban đầu
document.addEventListener("DOMContentLoaded", () => {
  updateFovSize(140);
  const savedKey = localStorage.getItem("saved_ff_key") || "NGBAO-VIP1-2026-FF99";
  if (topKeyStatusText) {
    topKeyStatusText.textContent = `KEY VIP: ACTIVE`;
  }
  if (modalKeyInput) {
    modalKeyInput.value = savedKey;
  }
  // Tự động phát nhạc nếu người dùng bật
  startMusic();
});
