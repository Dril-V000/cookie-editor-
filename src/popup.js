// popup.js

let currentUrl = "";
let currentTab = null;
let allCookies = [];
let profiles = [];
let activeProfileId = null;
let selectedEmoji = "👤";
let selectedColor = "#4f8ef7";
let expandedCookie = null;

// ── Init ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  loadProfiles();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  currentUrl = tab?.url || "";

  try {
    const url = new URL(currentUrl);
    document.getElementById("domain-label").textContent = url.hostname;
  } catch {
    document.getElementById("domain-label").textContent = "—";
  }

  const perm = await checkPermissions();
  if (!perm.hasCookies) {
    showPermissionScreen();
  } else {
    showMain();
    await loadCookies();
  }

  setupEventListeners();
});

// ── Permissions ───────────────────────────────────────
async function checkPermissions() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { type: "CHECK_PERMISSION", url: currentUrl },
      resolve
    );
  });
}

function showPermissionScreen() {
  document.getElementById("perm-screen").style.display = "flex";
  document.getElementById("main").style.display = "none";
}

function showMain() {
  document.getElementById("perm-screen").style.display = "none";
  document.getElementById("main").style.display = "flex";
}

// ── Cookies ───────────────────────────────────────────
async function loadCookies() {
  const resp = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: "GET_COOKIES", url: currentUrl }, resolve)
  );

  allCookies = resp.cookies || [];
  document.getElementById("cookies-count").textContent = allCookies.length;
  renderCookies(allCookies);
}

function renderCookies(cookies) {
  const list = document.getElementById("cookies-list");
  const empty = document.getElementById("empty-cookies");
  list.innerHTML = "";

  if (cookies.length === 0) {
    empty.style.display = "flex";
    return;
  }
  empty.style.display = "none";

  cookies.forEach(cookie => {
    const item = buildCookieItem(cookie);
    list.appendChild(item);
  });
}

function buildCookieItem(cookie) {
  const div = document.createElement("div");
  div.className = "cookie-item";
  div.dataset.name = cookie.name;

  const isSession = !cookie.expirationDate;
  const expText = isSession
    ? "session"
    : new Date(cookie.expirationDate * 1000).toLocaleDateString("ar-EG");

  div.innerHTML = `
    <div>
      <div class="cookie-name">${escHtml(cookie.name)}</div>
      <div class="cookie-value">${escHtml(cookie.value) || "(فارغ)"}</div>
    </div>
    <div class="cookie-badges">
      ${cookie.secure  ? '<span class="badge badge-secure">🔒 Secure</span>' : ""}
      ${cookie.httpOnly? '<span class="badge badge-http">HTTP</span>'         : ""}
      ${isSession      ? '<span class="badge badge-session">Session</span>'   : ""}
      ${cookie.hostOnly? '<span class="badge badge-host">Host</span>'         : ""}
    </div>
    <div class="cookie-edit">
      <div class="edit-row">
        <div class="edit-field">
          <label>الاسم</label>
          <input type="text" class="field-name" value="${escHtml(cookie.name)}" />
        </div>
        <div class="edit-field" style="flex:2">
          <label>القيمة</label>
          <input type="text" class="field-value" value="${escHtml(cookie.value)}" />
        </div>
      </div>
      <div class="edit-row">
        <div class="edit-field">
          <label>المسار</label>
          <input type="text" class="field-path" value="${escHtml(cookie.path)}" />
        </div>
        <div class="edit-field">
          <label>انتهاء الصلاحية</label>
          <input type="datetime-local" class="field-exp" value="${
            isSession ? "" : toDatetimeLocal(cookie.expirationDate * 1000)
          }" />
        </div>
      </div>
      <div class="edit-row">
        <div class="edit-field">
          <label>SameSite</label>
          <select class="field-same">
            <option value="no_restriction" ${cookie.sameSite==="no_restriction"?"selected":""}>None</option>
            <option value="lax"            ${cookie.sameSite==="lax"?"selected":""}>Lax</option>
            <option value="strict"         ${cookie.sameSite==="strict"?"selected":""}>Strict</option>
            <option value="unspecified"    ${cookie.sameSite==="unspecified"?"selected":""}>Unspecified</option>
          </select>
        </div>
        <div class="edit-field" style="display:flex; align-items:flex-end; gap:10px; padding-bottom:2px;">
          <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:12px; color:var(--text2); text-transform:none; letter-spacing:0;">
            <input type="checkbox" class="field-secure"   ${cookie.secure  ?"checked":""} /> Secure
          </label>
          <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:12px; color:var(--text2); text-transform:none; letter-spacing:0;">
            <input type="checkbox" class="field-httponly" ${cookie.httpOnly?"checked":""} /> HttpOnly
          </label>
        </div>
      </div>
      <div class="edit-actions">
        <button class="btn-delete btn-del-cookie">🗑 حذف</button>
        <button class="btn-save btn-save-cookie">💾 حفظ</button>
      </div>
    </div>
  `;

  // Toggle expand
  div.addEventListener("click", e => {
    if (e.target.closest(".cookie-edit")) return;
    const wasExpanded = div.classList.contains("expanded");
    document.querySelectorAll(".cookie-item.expanded").forEach(el => el.classList.remove("expanded"));
    if (!wasExpanded) div.classList.add("expanded");
  });

  // Save
  div.querySelector(".btn-save-cookie").addEventListener("click", async e => {
    e.stopPropagation();
    const name     = div.querySelector(".field-name").value;
    const value    = div.querySelector(".field-value").value;
    const path     = div.querySelector(".field-path").value;
    const expVal   = div.querySelector(".field-exp").value;
    const sameSite = div.querySelector(".field-same").value;
    const secure   = div.querySelector(".field-secure").checked;
    const httpOnly = div.querySelector(".field-httponly").checked;

    const cookieData = {
      url: currentUrl, name, value, path, secure, httpOnly,
      sameSite,
      ...(expVal ? { expirationDate: Math.floor(new Date(expVal).getTime() / 1000) } : {}),
    };

    // Delete old name if renamed
    if (name !== cookie.name) {
      await new Promise(r => chrome.runtime.sendMessage({ type: "DELETE_COOKIE", url: currentUrl, name: cookie.name }, r));
    }

    const resp = await new Promise(r => chrome.runtime.sendMessage({ type: "SET_COOKIE", cookie: cookieData }, r));
    if (resp.success) {
      showToast("✅", "تم حفظ الـ cookie");
      await loadCookies();
    } else {
      showToast("❌", "خطأ: " + resp.error);
    }
  });

  // Delete
  div.querySelector(".btn-del-cookie").addEventListener("click", async e => {
    e.stopPropagation();
    const resp = await new Promise(r =>
      chrome.runtime.sendMessage({ type: "DELETE_COOKIE", url: currentUrl, name: cookie.name }, r)
    );
    if (resp.success) {
      showToast("🗑", "تم حذف الـ cookie");
      await loadCookies();
    } else {
      showToast("❌", "خطأ في الحذف");
    }
  });

  return div;
}

// ── Profiles ──────────────────────────────────────────
function loadProfiles() {
  const raw = localStorage.getItem("cookie_profiles");
  profiles = raw ? JSON.parse(raw) : [];
  activeProfileId = localStorage.getItem("active_profile_id") || null;
  renderProfiles();
}

function saveProfilesStorage() {
  localStorage.setItem("cookie_profiles", JSON.stringify(profiles));
  if (activeProfileId) localStorage.setItem("active_profile_id", activeProfileId);
  document.getElementById("profiles-count").textContent = profiles.length;
}

function renderProfiles() {
  const list = document.getElementById("profiles-list");
  const empty = document.getElementById("empty-profiles-msg");
  list.innerHTML = "";

  document.getElementById("profiles-count").textContent = profiles.length;

  if (profiles.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  profiles.forEach(profile => {
    const card = buildProfileCard(profile);
    list.appendChild(card);
  });
}

function buildProfileCard(profile) {
  const isActive = profile.id === activeProfileId;
  const cookieCount = (profile.cookies || []).length;

  const card = document.createElement("div");
  card.className = "profile-card" + (isActive ? " active" : "");
  card.innerHTML = `
    <div class="profile-top">
      <div class="profile-avatar" style="background:${profile.color}22;">
        ${profile.emoji}
      </div>
      <div class="profile-info">
        <div class="profile-name">${escHtml(profile.name)}</div>
        <div class="profile-meta">${cookieCount} cookie${cookieCount !== 1 ? "s" : ""} محفوظة · ${escHtml(profile.domain || "كل المواقع")}</div>
      </div>
      ${isActive ? '<div class="active-dot" title="نشط"></div>' : ""}
    </div>
    <div class="profile-actions-row">
      <button class="btn btn-secondary btn-load" style="flex:1;">📥 تحميل</button>
      <button class="btn btn-secondary btn-capture" style="flex:1;">📸 التقاط</button>
      <button class="btn btn-ghost btn-del-profile" style="color:var(--red);">🗑</button>
    </div>
  `;

  card.querySelector(".btn-load").addEventListener("click", async e => {
    e.stopPropagation();
    await loadProfile(profile);
  });

  card.querySelector(".btn-capture").addEventListener("click", async e => {
    e.stopPropagation();
    await captureToProfile(profile.id);
  });

  card.querySelector(".btn-del-profile").addEventListener("click", e => {
    e.stopPropagation();
    if (confirm(`حذف بروفايل "${profile.name}"؟`)) {
      profiles = profiles.filter(p => p.id !== profile.id);
      if (activeProfileId === profile.id) activeProfileId = null;
      saveProfilesStorage();
      renderProfiles();
      showToast("🗑", "تم حذف البروفايل");
    }
  });

  return card;
}

async function captureToProfile(profileId) {
  const p = profiles.find(x => x.id === profileId);
  if (!p) return;
  const resp = await new Promise(r => chrome.runtime.sendMessage({ type: "GET_COOKIES", url: currentUrl }, r));
  p.cookies = resp.cookies || [];
  p.domain = currentUrl ? new URL(currentUrl).hostname : "—";
  p.capturedAt = Date.now();
  saveProfilesStorage();
  renderProfiles();
  showToast("📸", `تم التقاط ${p.cookies.length} cookies`);
}

async function loadProfile(profile) {
  if (!profile.cookies || profile.cookies.length === 0) {
    showToast("⚠️", "لا يوجد cookies في هذا البروفايل");
    return;
  }
  for (const cookie of profile.cookies) {
    const cookieData = {
      url: currentUrl,
      name: cookie.name, value: cookie.value, path: cookie.path,
      secure: cookie.secure, httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {}),
    };
    await new Promise(r => chrome.runtime.sendMessage({ type: "SET_COOKIE", cookie: cookieData }, r));
  }
  activeProfileId = profile.id;
  saveProfilesStorage();
  renderProfiles();
  await loadCookies();
  showToast("✅", `تم تحميل بروفايل "${profile.name}"`);
}

// ── Event Listeners ────────────────────────────────────
function setupEventListeners() {
  // Permission buttons
  document.getElementById("perm-site-btn").addEventListener("click", async () => {
    const resp = await new Promise(r =>
      chrome.runtime.sendMessage({ type: "REQUEST_PERMISSION", scope: "site", url: currentUrl }, r)
    );
    if (resp.granted) { showMain(); await loadCookies(); }
    else showToast("❌", "لم يتم منح الصلاحية");
  });

  document.getElementById("perm-all-btn").addEventListener("click", async () => {
    const resp = await new Promise(r =>
      chrome.runtime.sendMessage({ type: "REQUEST_PERMISSION", scope: "all" }, r)
    );
    if (resp.granted) { showMain(); await loadCookies(); }
    else showToast("❌", "لم يتم منح الصلاحية");
  });

  document.getElementById("perm-skip-btn").addEventListener("click", () => window.close());

  // Tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // Search
  document.getElementById("search-input").addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    const filtered = allCookies.filter(c =>
      c.name.toLowerCase().includes(q) || c.value.toLowerCase().includes(q)
    );
    renderCookies(filtered);
  });

  // Refresh
  document.getElementById("btn-refresh").addEventListener("click", async () => {
    await loadCookies();
    showToast("🔄", "تم التحديث");
  });

  // Export — clean format matching import format
  document.getElementById("btn-export").addEventListener("click", () => {
    const exportData = allCookies.map(c => {
      const obj = { name: c.name, value: c.value };
      if (c.path && c.path !== "/") obj.path = c.path;
      if (c.domain) obj.domain = c.domain;
      if (c.secure) obj.secure = true;
      if (c.httpOnly) obj.httpOnly = true;
      if (c.sameSite && c.sameSite !== "unspecified") obj.sameSite = c.sameSite;
      if (c.expirationDate) obj.expirationDate = c.expirationDate;
      return obj;
    });
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const domain = currentUrl ? new URL(currentUrl).hostname : "cookies";
    a.href = url; a.download = `cookies-${domain}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast("📤", `تم تصدير ${allCookies.length} cookie`);
  });

  // Add cookie — open JSON import modal
  document.getElementById("btn-add-cookie").addEventListener("click", () => {
    openImportModal();
  });

  // Import modal events
  document.getElementById("import-close").addEventListener("click", closeImportModal);
  document.getElementById("import-overlay").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeImportModal();
  });

  document.getElementById("import-format-single").addEventListener("click", () => setImportMode("single"));
  document.getElementById("import-format-array").addEventListener("click",  () => setImportMode("array"));

  document.getElementById("import-apply").addEventListener("click", applyImport);

  document.getElementById("import-textarea").addEventListener("input", () => {
    validateImportJson();
  });

  // Paste from clipboard shortcut
  document.getElementById("import-paste-btn").addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.getElementById("import-textarea").value = text;
      validateImportJson();
    } catch { showToast("❌", "تعذر القراءة من الحافظة"); }
  });

  // Profile: new
  document.getElementById("btn-new-profile").addEventListener("click", () => {
    const form = document.getElementById("new-profile-form");
    form.classList.toggle("visible");
  });

  document.getElementById("cancel-profile").addEventListener("click", () => {
    document.getElementById("new-profile-form").classList.remove("visible");
    document.getElementById("profile-name-input").value = "";
  });

  // Emoji picker
  document.getElementById("emoji-picker").addEventListener("click", e => {
    const opt = e.target.closest(".emoji-opt");
    if (!opt) return;
    document.querySelectorAll(".emoji-opt").forEach(el => el.classList.remove("selected"));
    opt.classList.add("selected");
    selectedEmoji = opt.dataset.emoji;
  });

  // Color picker
  document.getElementById("color-picker").addEventListener("click", e => {
    const dot = e.target.closest(".color-dot");
    if (!dot) return;
    document.querySelectorAll(".color-dot").forEach(el => el.classList.remove("selected"));
    dot.classList.add("selected");
    selectedColor = dot.dataset.color;
  });

  // Save profile
  document.getElementById("save-new-profile").addEventListener("click", () => {
    const name = document.getElementById("profile-name-input").value.trim();
    if (!name) { showToast("⚠️", "أدخل اسم البروفايل"); return; }
    const profile = {
      id: Date.now().toString(),
      name, emoji: selectedEmoji, color: selectedColor,
      cookies: [], domain: "", capturedAt: null,
    };
    profiles.push(profile);
    saveProfilesStorage();
    renderProfiles();
    document.getElementById("new-profile-form").classList.remove("visible");
    document.getElementById("profile-name-input").value = "";
    showToast("✅", `تم إنشاء بروفايل "${name}"`);
  });
}

// ── Import Modal ──────────────────────────────────────
let importMode = "array"; // "single" | "array"

function openImportModal() {
  document.getElementById("import-overlay").style.display = "flex";
  document.getElementById("import-textarea").value = "";
  document.getElementById("import-status").textContent = "";
  document.getElementById("import-apply").disabled = true;
  setImportMode("array");
  setTimeout(() => document.getElementById("import-textarea").focus(), 50);
}

function closeImportModal() {
  document.getElementById("import-overlay").style.display = "none";
}

function setImportMode(mode) {
  importMode = mode;
  document.getElementById("import-format-single").classList.toggle("active", mode === "single");
  document.getElementById("import-format-array").classList.toggle("active",  mode === "array");

  const placeholder = mode === "array"
    ? `[\n  { "name": "session_id", "value": "abc123" },\n  { "name": "theme", "value": "dark", "secure": true }\n]`
    : `{ "name": "session_id", "value": "abc123", "path": "/", "secure": true }`;
  document.getElementById("import-textarea").placeholder = placeholder;
  validateImportJson();
}

function validateImportJson() {
  const raw = document.getElementById("import-textarea").value.trim();
  const status = document.getElementById("import-status");
  const applyBtn = document.getElementById("import-apply");

  if (!raw) {
    status.textContent = "";
    applyBtn.disabled = true;
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const cookies = Array.isArray(parsed) ? parsed : [parsed];

    // Validate each has at least name
    const invalid = cookies.filter(c => !c.name);
    if (invalid.length > 0) {
      status.className = "import-status error";
      status.textContent = `❌ ${invalid.length} cookie بدون اسم (حقل "name" مطلوب)`;
      applyBtn.disabled = true;
      return;
    }

    status.className = "import-status ok";
    status.textContent = `✅ ${cookies.length} cookie جاهزة للإضافة`;
    applyBtn.disabled = false;
  } catch (e) {
    status.className = "import-status error";
    status.textContent = "❌ JSON غير صالح — " + e.message.split("\n")[0];
    applyBtn.disabled = true;
  }
}

async function applyImport() {
  const raw = document.getElementById("import-textarea").value.trim();
  let cookies;
  try {
    const parsed = JSON.parse(raw);
    cookies = Array.isArray(parsed) ? parsed : [parsed];
  } catch { return; }

  const applyBtn = document.getElementById("import-apply");
  applyBtn.disabled = true;
  applyBtn.textContent = "جاري الإضافة...";

  let success = 0, failed = 0;
  for (const c of cookies) {
    const cookieData = {
      url: currentUrl,
      name: c.name,
      value: c.value ?? "",
      path: c.path ?? "/",
      secure: c.secure ?? false,
      httpOnly: c.httpOnly ?? false,
      sameSite: c.sameSite ?? "lax",
      ...(c.expirationDate ? { expirationDate: c.expirationDate } : {}),
      ...(c.domain ? { domain: c.domain } : {}),
    };
    const resp = await new Promise(r =>
      chrome.runtime.sendMessage({ type: "SET_COOKIE", cookie: cookieData }, r)
    );
    resp.success ? success++ : failed++;
  }

  closeImportModal();
  await loadCookies();

  if (failed === 0) showToast("✅", `تمت إضافة ${success} cookie بنجاح`);
  else showToast("⚠️", `${success} نجح، ${failed} فشل`);
}

// ── Helpers ────────────────────────────────────────────
function showToast(icon, msg, duration = 2200) {
  const toast = document.getElementById("toast");
  document.getElementById("toast-msg").textContent = msg;
  toast.querySelector(".toast-icon").textContent = icon;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), duration);
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toDatetimeLocal(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
