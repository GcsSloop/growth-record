async function checkSession() {
  const statusNode = document.getElementById("authGate");
  if (!statusNode) return;

  try {
    const response = await fetch("/api/me", { credentials: "include" });
    if (!response.ok) {
      showGuestState();
      return;
    }
    showAppState();
  } catch {
    showGuestState();
  }
}

async function loginWithPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById("authStatus");
  const account = form.elements.account.value.trim();
  const password = form.elements.password.value;
  const response = await fetch("/api/auth/login-password", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password })
  });
  if (!response.ok) {
    status.textContent = "登录失败，请检查手机号和密码。";
    return;
  }
  status.textContent = "";
  showAppState();
}

async function requestRegisterCode() {
  const status = document.getElementById("authStatus");
  const phone = document.querySelector("#registerForm input[name='phone']").value.trim();
  const response = await fetch("/api/auth/request-phone-code", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, purpose: "register" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    status.textContent = "验证码发送失败，请检查手机号。";
    return;
  }
  status.textContent = payload.data?.devCode ? `开发环境验证码：${payload.data.devCode}` : "验证码已发送。";
}

async function registerWithPhone(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById("authStatus");
  const phone = form.elements.phone.value.trim();
  const code = form.elements.code.value.trim();
  const response = await fetch("/api/auth/register-phone", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, code })
  });
  if (!response.ok) {
    status.textContent = "注册失败，请检查验证码。";
    return;
  }
  status.textContent = "";
  showAppState();
}

async function setCurrentUserPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById("passwordStatus");
  const password = form.elements.password.value;
  const confirmPassword = form.elements.confirmPassword.value;
  if (password !== confirmPassword) {
    status.textContent = "两次输入的密码不一致。";
    return;
  }

  const response = await fetch("/api/me/password", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!response.ok) {
    status.textContent = "密码设置失败，请至少输入 8 位。";
    return;
  }
  status.textContent = "密码已保存。";
}

function showGuestState() {
  document.getElementById("authGate")?.removeAttribute("hidden");
  document.querySelectorAll(".app-only").forEach((node) => {
    node.setAttribute("hidden", "");
  });
}

function showAppState() {
  document.getElementById("authGate")?.setAttribute("hidden", "");
  document.querySelectorAll(".app-only").forEach((node) => {
    node.removeAttribute("hidden");
  });
  renderDashboardShell();
}

function renderDashboardShell() {
  const appContent = document.getElementById("appContent");
  if (!appContent || appContent.dataset.rendered === "true") return;

  appContent.className = "dashboard-grid app-only";
  appContent.innerHTML = `
    <article class="card hero-stat">
      <span class="badge">LV</span>
      <strong>--</strong>
      <p>个人成长等级</p>
    </article>
    <article class="card">
      <h2>今日打卡状态</h2>
      <div class="placeholder-list" id="checkinSummary"></div>
    </article>
    <article class="card">
      <h2>执行记录</h2>
      <p class="muted">登录后只读取当前用户自己的数据。</p>
    </article>`;
  appContent.dataset.rendered = "true";
  appContent.hidden = false;
}

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.authTab;
    document.querySelectorAll("[data-auth-tab]").forEach((item) => item.classList.toggle("active", item === button));
    document.getElementById("loginForm").hidden = tab !== "login";
    document.getElementById("registerForm").hidden = tab !== "register";
    document.getElementById("authStatus").textContent = "";
  });
});

document.getElementById("loginForm")?.addEventListener("submit", loginWithPassword);
document.getElementById("requestRegisterCode")?.addEventListener("click", requestRegisterCode);
document.getElementById("registerForm")?.addEventListener("submit", registerWithPhone);
document.getElementById("openUserManagement")?.addEventListener("click", () => {
  document.getElementById("userManagementModal").hidden = false;
});
document.getElementById("closeUserManagement")?.addEventListener("click", () => {
  document.getElementById("userManagementModal").hidden = true;
});
document.getElementById("userManagementModal")?.addEventListener("click", (event) => {
  if (event.target.id === "userManagementModal") event.currentTarget.hidden = true;
});
document.getElementById("setPasswordForm")?.addEventListener("submit", setCurrentUserPassword);

void checkSession();
