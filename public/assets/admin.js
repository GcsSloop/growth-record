async function bootstrapAdmin() {
  const response = await fetch("/api/admin/bootstrap", { credentials: "include" });
  if (!response.ok) return;

  const payload = await response.json();
  const requiresPasswordSetup = Boolean(payload.data.requiresPasswordSetup);
  document.getElementById("adminLoginForm").hidden = requiresPasswordSetup;
  document.getElementById("adminSetupForm").hidden = !requiresPasswordSetup;
  document.getElementById("adminAuthTitle").textContent = requiresPasswordSetup ? "设置管理员密码" : "管理员登录";
}

async function loadAdminMetrics() {
  const totalUsers = document.getElementById("totalUsers");
  const activeToday = document.getElementById("activeToday");
  const weeklyRecords = document.getElementById("weeklyRecords");

  try {
    const response = await fetch("/api/admin/metrics", { credentials: "include" });
    if (!response.ok) return;
    const payload = await response.json();
    totalUsers.textContent = String(payload.data.totalUsers ?? "--");
    activeToday.textContent = String(payload.data.activeToday ?? "--");
    weeklyRecords.textContent = String(payload.data.weeklyRecords ?? "--");
  } catch {
    if (totalUsers) totalUsers.textContent = "--";
    if (activeToday) activeToday.textContent = "--";
    if (weeklyRecords) weeklyRecords.textContent = "--";
  }
}

document.getElementById("adminSetupForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const password = form.elements.password.value;
  const confirmPassword = form.elements.confirmPassword.value;
  if (password !== confirmPassword) return;

  const response = await fetch("/api/admin/setup-password", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (response.ok) {
    document.getElementById("adminLoginForm").hidden = false;
    document.getElementById("adminSetupForm").hidden = true;
    document.getElementById("adminAuthTitle").textContent = "管理员登录";
  }
});

document.getElementById("adminLoginForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const account = form.elements.account.value;
  const password = form.elements.password.value;

  const response = await fetch("/api/auth/login-password", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password })
  });
  if (!response.ok) return;

  document.getElementById("adminAuthGate").hidden = true;
  document.querySelectorAll(".admin-only").forEach((node) => {
    node.hidden = false;
  });
  await loadAdminMetrics();
});

void bootstrapAdmin();
