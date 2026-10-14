/**
 * Cấu hình giao diện & Server Key
 */
const APP_CONFIG = {
  serverApiUrl: "https://webkey-nine.vercel.app/api/key/verify",
  getKeyUrl: "https://webkey-nine.vercel.app/admin",

  deviceInfo: {
    deviceName:
      window.AndroidBridge && typeof window.AndroidBridge.getDeviceName === "function"
        ? window.AndroidBridge.getDeviceName()
        : "iPhone 12 Pro",
    osVersion: "Android 14",
  },

  defaultSuccessData: {
    greeting: "Hi iPhone 12 Pro",
    expireAt: "12-10-2026 2:37:17 CH",
    deviceName: "iPhone 12 Pro",
    osVersion: "Android 14",
    apiServer: "6.1.0",
  },
};

// ================= ELEMENTS =================
const screenKeyInput = document.getElementById("screenKeyInput");
const screenKeySuccess = document.getElementById("screenKeySuccess");
const screenMainDashboard = document.getElementById("screenMainDashboard");
const bgToast = document.getElementById("bgToast");

// Screen 1: Key Form
const keyForm = document.getElementById("keyForm");
const inputWrapper = document.getElementById("inputWrapper");
const keyInput = document.getElementById("keyInput");
const pasteBtn = document.getElementById("pasteBtn");
const errorMsg = document.getElementById("errorMsg");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = document.getElementById("loginBtnText");
const loginLoader = document.getElementById("loginLoader");
const getKeyLink = document.getElementById("getKeyLink");

// Screen 2: Success
const greetingText = document.getElementById("greetingText");
const expireText = document.getElementById("expireText");
const deviceText = document.getElementById("deviceText");
const apiServerText = document.getElementById("apiServerText");
const tapCloseBtn = document.getElementById("tapCloseBtn");

// Screen 3: Main Dashboard
const mainUserName = document.getElementById("mainUserName");
const dashKeyExpire = document.getElementById("dashKeyExpire");
const overlayStatusDesc = document.getElementById("overlayStatusDesc");
const overlayStatusDot = document.getElementById("overlayStatusDot");
const btnActivateOverlay = document.getElementById("btnActivateOverlay");
const btnOpenFloatingDirect = document.getElementById("btnOpenFloatingDirect");
const btnRecheckKey = document.getElementById("btnRecheckKey");

// Permission Modal
const overlayPermModal = document.getElementById("overlayPermModal");
const btnPermDeny = document.getElementById("btnPermDeny");
const btnPermAllow = document.getElementById("btnPermAllow");

// Floating Widget
const floatingContainer = document.getElementById("floatingContainer");
const floatingBall = document.getElementById("floatingBall");
const floatingMenuPanel = document.getElementById("floatingMenuPanel");
const btnMinimizePanel = document.getElementById("btnMinimizePanel");
const btnHideOverlay = document.getElementById("btnHideOverlay");

// Preview Toolbar
const btnPreviewInput = document.getElementById("btnPreviewInput");
const btnPreviewSuccess = document.getElementById("btnPreviewSuccess");
const btnPreviewMain = document.getElementById("btnPreviewMain");
const btnPreviewToggleBall = document.getElementById("btnPreviewToggleBall");

let isOverlayActive = false;
let toastTimer = null;

// ================= CHUYỂN MÀN HÌNH =================
function switchScreen(target) {
  [screenKeyInput, screenKeySuccess, screenMainDashboard].forEach((s) =>
    s.classList.remove("active")
  );
  [btnPreviewInput, btnPreviewSuccess, btnPreviewMain].forEach((b) =>
    b.classList.remove("active")
  );

  if (target === "input") {
    screenKeyInput.classList.add("active");
    btnPreviewInput.classList.add("active");
    bgToast.classList.remove("show");
  } else if (target === "success") {
    screenKeySuccess.classList.add("active");
    btnPreviewSuccess.classList.add("active");
    clearTimeout(toastTimer);
    bgToast.classList.add("show");
  } else if (target === "main") {
    screenMainDashboard.classList.add("active");
    btnPreviewMain.classList.add("active");
    bgToast.classList.remove("show");
  }
}

function renderSuccessInfo(data = {}) {
  const info = { ...APP_CONFIG.defaultSuccessData, ...data };
  greetingText.textContent = info.greeting;
  expireText.textContent = `Hết hạn vào: ${info.expireAt}`;
  deviceText.textContent = `Thiết bị: ${info.deviceName} | Phiên bản: ${info.osVersion}`;
  apiServerText.textContent = `APIServer: ${info.apiServer}`;

  mainUserName.textContent = info.greeting;
  dashKeyExpire.textContent = `Hạn dùng: ${info.expireAt}`;
}

function showError(message) {
  errorMsg.textContent = message;
  inputWrapper.classList.remove("shake");
  void inputWrapper.offsetWidth;
  inputWrapper.classList.add("shake");
}

// ================= KEY INPUT HANDLERS =================
pasteBtn.addEventListener("click", async () => {
  errorMsg.textContent = "";
  try {
    if (window.AndroidBridge && typeof window.AndroidBridge.getClipboard === "function") {
      const clip = window.AndroidBridge.getClipboard();
      if (clip) {
        keyInput.value = clip.trim();
        return;
      }
    }
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      keyInput.value = text.trim();
    } else {
      keyInput.value = "NGBAO-VIP1-2026-FF99";
    }
  } catch {
    keyInput.value = "NGBAO-VIP1-2026-FF99";
  }
  keyInput.focus();
});

keyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMsg.textContent = "";

  const key = keyInput.value.trim();
  if (!key) {
    showError("Vui lòng nhập Key trước khi kích hoạt!");
    return;
  }

  loginBtn.disabled = true;
  loginBtnText.textContent = "Đang xác thực Server...";
  loginLoader.hidden = false;

  try {
    let hwid = localStorage.getItem("ff_device_hwid");
    if (!hwid) {
      hwid = "HWID-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem("ff_device_hwid", hwid);
    }

    const res = await fetch(APP_CONFIG.serverApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        deviceName: APP_CONFIG.deviceInfo.deviceName,
        hwid,
        osVersion: APP_CONFIG.deviceInfo.osVersion,
      }),
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || "Key không hợp lệ hoặc đã hết hạn!");
    }

    renderSuccessInfo(result.data);
    localStorage.setItem("saved_ff_key", key);
    switchScreen("success");
  } catch (err) {
    showError(err.message || "Không thể kết nối tới Server Key!");
  } finally {
    loginBtn.disabled = false;
    loginBtnText.textContent = "Đăng Nhập / Kích Hoạt";
    loginLoader.hidden = true;
  }
});

getKeyLink.addEventListener("click", (e) => {
  e.preventDefault();
  window.open(APP_CONFIG.getKeyUrl, "_blank");
});

// Bấm vào Màn 2 ("Tap to close") -> VÀO TRANG CHÍNH
tapCloseBtn.addEventListener("click", () => {
  switchScreen("main");
});

screenKeySuccess.addEventListener("click", (e) => {
  if (e.target === tapCloseBtn) return;
  switchScreen("main");
});

// ================= TRANG CHÍNH & XIN QUYỀN OVERLAY =================
btnActivateOverlay.addEventListener("click", () => {
  if (isOverlayActive) {
    // Nếu đã bật, mở thẳng menu nổi
    openFloatingMenu();
  } else {
    // Nếu chưa cấp quyền, mở hộp thoại xin quyền
    overlayPermModal.classList.add("show");
  }
});

btnPermDeny.addEventListener("click", () => {
  overlayPermModal.classList.remove("show");
});

btnPermAllow.addEventListener("click", () => {
  overlayPermModal.classList.remove("show");
  enableOverlayService();
});

btnOpenFloatingDirect.addEventListener("click", () => {
  enableOverlayService();
  openFloatingMenu();
});

btnRecheckKey.addEventListener("click", () => {
  switchScreen("input");
});

function enableOverlayService() {
  isOverlayActive = true;
  floatingContainer.hidden = false;
  overlayStatusDesc.textContent = "Đang chạy trên nền game (Đã bật)";
  overlayStatusDot.classList.add("active");

  // Nếu chạy trong Android native
  if (window.AndroidBridge && typeof window.AndroidBridge.startFloatingService === "function") {
    window.AndroidBridge.startFloatingService();
  }
}

function disableOverlayService() {
  isOverlayActive = false;
  floatingContainer.hidden = true;
  floatingMenuPanel.classList.remove("open");
  overlayStatusDesc.textContent = "Chưa bật (Bấm nút giữa để mở)";
  overlayStatusDot.classList.remove("active");
}

// ================= CỤC TRÒN NỔI & BẢNG CHỨC NĂNG =================
function openFloatingMenu() {
  floatingContainer.hidden = false;
  floatingMenuPanel.classList.add("open");

  // Định vị bảng menu cạnh cục tròn
  const rect = floatingBall.getBoundingClientRect();
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  if (rect.left > screenWidth / 2) {
    floatingMenuPanel.style.left = "auto";
    floatingMenuPanel.style.right = `${Math.max(screenWidth - rect.left + 14, 16)}px`;
  } else {
    floatingMenuPanel.style.right = "auto";
    floatingMenuPanel.style.left = `${Math.max(rect.right + 14, 16)}px`;
  }

  const topPos = Math.min(Math.max(rect.top - 40, 40), screenHeight - 380);
  floatingMenuPanel.style.top = `${topPos}px`;
}

function closeFloatingMenu() {
  floatingMenuPanel.classList.remove("open");
}

btnMinimizePanel.addEventListener("click", closeFloatingMenu);
btnHideOverlay.addEventListener("click", () => {
  disableOverlayService();
});

// Xử lý kéo thả Cục tròn nổi (Touch & Mouse Dragging)
let isDragging = false;
let startX = 0, startY = 0;
let initialX = 0, initialY = 0;
let hasMoved = false;

function onPointerDown(e) {
  isDragging = true;
  hasMoved = false;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  startX = clientX;
  startY = clientY;

  const rect = floatingBall.getBoundingClientRect();
  initialX = rect.left;
  initialY = rect.top;

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

  const newX = Math.min(Math.max(initialX + dx, 10), window.innerWidth - 82);
  const newY = Math.min(Math.max(initialY + dy, 40), window.innerHeight - 82);

  floatingBall.style.left = `${newX}px`;
  floatingBall.style.top = `${newY}px`;
  floatingBall.style.right = "auto";
}

function onPointerUp() {
  if (!isDragging) return;
  isDragging = false;
  document.removeEventListener("mousemove", onPointerMove);
  document.removeEventListener("mouseup", onPointerUp);
  document.removeEventListener("touchmove", onPointerMove);
  document.removeEventListener("touchend", onPointerUp);

  // Nếu chỉ chạm nhẹ mà không kéo -> MỞ / ĐÓNG MENU
  if (!hasMoved) {
    if (floatingMenuPanel.classList.contains("open")) {
      closeFloatingMenu();
    } else {
      openFloatingMenu();
    }
  }
}

floatingBall.addEventListener("mousedown", onPointerDown);
floatingBall.addEventListener("touchstart", onPointerDown, { passive: false });

// ================= CÁC CHỨC NĂNG FLOATING MENU (AIMLOCK, AIMBOT, AIMHEAD) =================
const chkAimlock = document.getElementById("chkAimlock");
const chkAimbot = document.getElementById("chkAimbot");
const chkAimhead = document.getElementById("chkAimhead");

[chkAimlock, chkAimbot, chkAimhead].forEach((chk) => {
  if (chk) {
    chk.addEventListener("change", (e) => {
      const name = e.target.id.replace("chk", "");
      if (e.target.checked) {
        showToastNotice(`Đã BẬT ${name}`);
      } else {
        showToastNotice(`Đã TẮT ${name}`);
      }
    });
  }
});

// ================= TÂM ẢO (CROSSHAIR CHÍNH GIỮA MÀN HÌNH) =================
const chkCrosshair = document.getElementById("chkCrosshair");
const hudCrosshair = document.getElementById("hudCrosshair");

if (chkCrosshair && hudCrosshair) {
  chkCrosshair.addEventListener("change", () => {
    hudCrosshair.hidden = !chkCrosshair.checked;
    if (chkCrosshair.checked) {
      showToastNotice("Đã hiện Tâm Ảo chính giữa màn hình");
    }
  });
}

// ================= VÒNG TRÒN FOV (CĂN GIỮA VÀ KÉO CHỈNH TO NHỎ) =================
const chkFov = document.getElementById("chkFov");
const hudFovCircle = document.getElementById("hudFovCircle");
const rangeFovSize = document.getElementById("rangeFovSize");
const valFovSize = document.getElementById("valFovSize");

if (chkFov && hudFovCircle) {
  chkFov.addEventListener("change", () => {
    hudFovCircle.hidden = !chkFov.checked;
    if (chkFov.checked) {
      showToastNotice("Đã bật Vòng FOV ngắm");
    }
  });
}

if (rangeFovSize && hudFovCircle && valFovSize) {
  rangeFovSize.addEventListener("input", () => {
    const size = rangeFovSize.value;
    hudFovCircle.style.width = `${size}px`;
    hudFovCircle.style.height = `${size}px`;
    valFovSize.textContent = `${size}px`;
  });
}

// ================= PHÁT NHẠC MP3 LẶP LẠI (TỪ DOWNLOADS / MÁY) =================
const chkMusic = document.getElementById("chkMusic");
const bgmAudio = document.getElementById("bgmAudio");
const btnPickMusic = document.getElementById("btnPickMusic");
const bgmFileInput = document.getElementById("bgmFileInput");
const musicStatusText = document.getElementById("musicStatusText");
const currentTrackName = document.getElementById("currentTrackName");

let audioContext = null;
let synthTimer = null;
let isSynthPlaying = false;
let customAudioLoaded = false;

function startSynthBeat() {
  if (isSynthPlaying) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === "suspended") audioContext.resume();

    isSynthPlaying = true;
    let step = 0;
    const notes = [130.81, 146.83, 164.81, 196.00]; // Tông beat C3-D3-E3-G3
    synthTimer = setInterval(() => {
      if (!isSynthPlaying) return;
      try {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(notes[step % notes.length], audioContext.currentTime);
        gain.gain.setValueAtTime(0.06, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start();
        osc.stop(audioContext.currentTime + 0.36);
        step++;
      } catch (err) {}
    }, 420);
  } catch (e) {}
}

function stopSynthBeat() {
  isSynthPlaying = false;
  if (synthTimer) {
    clearInterval(synthTimer);
    synthTimer = null;
  }
}

function playBgm() {
  if (customAudioLoaded || (bgmAudio && bgmAudio.src && bgmAudio.src.startsWith("blob:"))) {
    bgmAudio.loop = true;
    bgmAudio.play().then(() => {
      if (musicStatusText) {
        musicStatusText.textContent = "Đang phát lặp lại";
        musicStatusText.style.color = "#32d764";
      }
    }).catch(() => {
      startSynthBeat();
    });
  } else {
    // Thử load music.mp3 hoặc phát beat synth ngầm
    bgmAudio.src = "music.mp3";
    bgmAudio.loop = true;
    bgmAudio.play().then(() => {
      customAudioLoaded = true;
      if (musicStatusText) {
        musicStatusText.textContent = "Đang phát lặp lại";
        musicStatusText.style.color = "#32d764";
      }
    }).catch(() => {
      startSynthBeat();
      if (musicStatusText) {
        musicStatusText.textContent = "Đang phát beat nền lặp lại";
        musicStatusText.style.color = "#32d764";
      }
    });
  }
}

function pauseBgm() {
  if (bgmAudio) bgmAudio.pause();
  stopSynthBeat();
  if (musicStatusText) {
    musicStatusText.textContent = "Tự phát & lặp lại liên tục";
    musicStatusText.style.color = "";
  }
}

if (chkMusic) {
  chkMusic.addEventListener("change", () => {
    if (chkMusic.checked) {
      playBgm();
      showToastNotice("Đã bật nhạc nền (Lặp lại liên tục)");
    } else {
      pauseBgm();
      showToastNotice("Đã tắt nhạc nền");
    }
  });
}

if (btnPickMusic && bgmFileInput) {
  btnPickMusic.addEventListener("click", () => {
    bgmFileInput.click();
  });

  bgmFileInput.addEventListener("change", () => {
    if (bgmFileInput.files && bgmFileInput.files[0]) {
      const file = bgmFileInput.files[0];
      stopSynthBeat();
      bgmAudio.src = URL.createObjectURL(file);
      bgmAudio.loop = true;
      customAudioLoaded = true;
      if (currentTrackName) {
        currentTrackName.textContent = `🎵 ${file.name}`;
      }
      chkMusic.checked = true;
      bgmAudio.play().then(() => {
        if (musicStatusText) {
          musicStatusText.textContent = "Đang phát file từ Downloads";
          musicStatusText.style.color = "#32d764";
        }
      }).catch(console.error);
      showToastNotice(`Đã nạp file: ${file.name}`);
    }
  });
}

// ================= KHỞI CHẠY FREE FIRE & FREE FIRE MAX =================
function launchGame(type) {
  const packageName = type === "max" ? "com.dts.freefiremax" : "com.dts.freefireth";
  const gameTitle = type === "max" ? "Free Fire MAX" : "Free Fire Thường";

  // 1. Thử gọi qua AndroidBridge nếu chạy trong APK Android
  if (window.AndroidBridge) {
    if (type === "max" && typeof window.AndroidBridge.launchFreeFireMax === "function") {
      window.AndroidBridge.launchFreeFireMax();
      showToastNotice(`Đang mở ${gameTitle}...`);
      return;
    }
    if (type === "normal" && typeof window.AndroidBridge.launchFreeFire === "function") {
      window.AndroidBridge.launchFreeFire();
      showToastNotice(`Đang mở ${gameTitle}...`);
      return;
    }
  }

  // 2. Nếu chạy trên trình duyệt web điện thoại: Mở qua Android Intent scheme
  showToastNotice(`Đang kết nối mở ${gameTitle}...`);
  const intentUrl = `intent://#Intent;package=${packageName};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`;
  const startTime = Date.now();
  window.location.href = intentUrl;

  setTimeout(() => {
    // Nếu không mở được app sau 1.5s -> chuyển sang trang Google Play Store
    if (Date.now() - startTime < 1600) {
      window.open(`https://play.google.com/store/apps/details?id=${packageName}`, "_blank");
    }
  }, 1200);
}

// Gắn sự kiện nút khởi chạy cả ở Dashboard và trong Menu nổi
const btnMainLaunchFF = document.getElementById("btnMainLaunchFF");
const btnMainLaunchFFMax = document.getElementById("btnMainLaunchFFMax");
const btnPanelLaunchFF = document.getElementById("btnPanelLaunchFF");
const btnPanelLaunchFFMax = document.getElementById("btnPanelLaunchFFMax");

if (btnMainLaunchFF) btnMainLaunchFF.addEventListener("click", () => launchGame("normal"));
if (btnMainLaunchFFMax) btnMainLaunchFFMax.addEventListener("click", () => launchGame("max"));
if (btnPanelLaunchFF) btnPanelLaunchFF.addEventListener("click", () => launchGame("normal"));
if (btnPanelLaunchFFMax) btnPanelLaunchFFMax.addEventListener("click", () => launchGame("max"));

function showToastNotice(msg) {
  const toast = document.getElementById("bgToast");
  const title = toast ? toast.querySelector(".toast-title") : null;
  const sub = toast ? toast.querySelector(".toast-sub") : null;
  if (toast && title) {
    title.textContent = msg;
    if (sub) sub.textContent = "VIP Menu Active";
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 2200);
  }
}

// ================= PREVIEW TOOLBAR =================
btnPreviewInput.addEventListener("click", () => switchScreen("input"));
btnPreviewSuccess.addEventListener("click", () => {
  renderSuccessInfo();
  switchScreen("success");
});
btnPreviewMain.addEventListener("click", () => {
  renderSuccessInfo();
  switchScreen("main");
});
btnPreviewToggleBall.addEventListener("click", () => {
  if (isOverlayActive) {
    disableOverlayService();
  } else {
    enableOverlayService();
    openFloatingMenu();
  }
});

// Khởi tạo
renderSuccessInfo();
const savedKey = localStorage.getItem("saved_ff_key");
if (savedKey) {
  keyInput.value = savedKey;
} else {
  keyInput.value = "NGBAO-VIP1-2026-FF99";
}
