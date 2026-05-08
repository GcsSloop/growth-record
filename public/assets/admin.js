async function bootstrapAdmin() {
  const response = await fetch("/api/admin/bootstrap", { credentials: "include" });
  if (!response.ok) return;

  const currentUser = await fetch("/api/me", { credentials: "include" });
  if (currentUser.ok) {
    const payload = await currentUser.json();
    if (payload.data?.user?.role === "admin") {
      showAdminApp();
      await loadAdminMetrics();
      await loadUsers();
      return;
    }
  }

  const payload = await response.json();
  const requiresPasswordSetup = Boolean(payload.data.requiresPasswordSetup);
  document.getElementById("adminLoginForm").hidden = requiresPasswordSetup;
  document.getElementById("adminSetupForm").hidden = !requiresPasswordSetup;
  document.getElementById("adminAuthTitle").textContent = requiresPasswordSetup ? "设置管理员密码" : "管理员登录";
}

function showAdminApp() {
  document.getElementById("adminAuthGate").hidden = true;
  document.querySelectorAll(".admin-only").forEach((node) => {
    node.hidden = false;
  });
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

async function loadUsers() {
  const tbody = document.getElementById("userTableBody");
  const response = await fetch("/api/admin/users", { credentials: "include" });
  if (!response.ok) return;
  const payload = await response.json();
  const users = payload.data.users ?? [];
  tbody.innerHTML = users
    .map(
      (user) => `
        <tr data-user-id="${user.id}">
          <td>${escapeHtml(user.displayName || user.username || "-")}</td>
          <td>${escapeHtml(user.email || "-")}</td>
          <td>${escapeHtml(user.phone || "-")}</td>
          <td>${user.role === "admin" ? "管理员" : "普通用户"}</td>
          <td>${user.status === "active" ? "启用" : "禁用"}</td>
          <td>${user.mustChangePassword ? "需改密" : "正常"}</td>
          <td>--</td>
          <td>
            <button class="button ghost" type="button" data-edit-user="${user.id}">编辑</button>
            <button class="button ghost" type="button" data-reset-user="${user.id}">重置密码</button>
            <button class="button ghost" type="button" data-delete-user="${user.id}">删除</button>
          </td>
        </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-edit-user]").forEach((button) => {
    button.addEventListener("click", () => openEditUser(users.find((user) => user.id === button.dataset.editUser)));
  });
  tbody.querySelectorAll("[data-reset-user]").forEach((button) => {
    button.addEventListener("click", () => resetUserPassword(button.dataset.resetUser));
  });
  tbody.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", () => deleteUser(button.dataset.deleteUser));
  });
}

function openCreateUser() {
  const form = document.getElementById("userEditorForm");
  form.reset();
  form.elements.id.value = "";
  document.getElementById("userEditorTitle").textContent = "新增用户";
  document.getElementById("userEditorStatus").textContent = "";
  document.getElementById("userEditorModal").hidden = false;
}

function openEditUser(user) {
  if (!user) return;
  const form = document.getElementById("userEditorForm");
  form.elements.id.value = user.id;
  form.elements.email.value = user.email || "";
  form.elements.phone.value = user.phone || "";
  form.elements.username.value = user.username || "";
  form.elements.displayName.value = user.displayName || "";
  form.elements.role.value = user.role || "user";
  form.elements.status.value = user.status || "active";
  document.getElementById("userEditorTitle").textContent = "编辑用户";
  document.getElementById("userEditorStatus").textContent = "";
  document.getElementById("userEditorModal").hidden = false;
}

async function saveUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.id.value;
  const body = {
    email: form.elements.email.value.trim(),
    phone: form.elements.phone.value.trim(),
    username: form.elements.username.value.trim(),
    displayName: form.elements.displayName.value.trim(),
    role: form.elements.role.value,
    status: form.elements.status.value
  };
  const response = await fetch(id ? `/api/admin/users/${id}` : "/api/admin/users", {
    method: id ? "PATCH" : "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    document.getElementById("userEditorStatus").textContent = adminErrorMessage(payload.error?.code, "保存失败。");
    return;
  }
  document.getElementById("userEditorModal").hidden = true;
  if (payload.data?.defaultPassword) showDefaultPassword(payload.data.defaultPassword);
  await loadUsers();
}

async function resetUserPassword(userId) {
  const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
    method: "POST",
    credentials: "include"
  });
  const payload = await response.json().catch(() => ({}));
  if (response.ok) {
    showDefaultPassword(payload.data.defaultPassword);
    await loadUsers();
  }
}

async function deleteUser(userId) {
  if (!confirm("确定删除该用户？")) return;
  const response = await fetch(`/api/admin/users/${userId}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (response.ok) await loadUsers();
}

function showDefaultPassword(defaultPassword) {
  document.getElementById("defaultPasswordOutput").textContent = defaultPassword;
  document.getElementById("defaultPasswordModal").hidden = false;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function adminErrorMessage(code, fallback) {
  const messages = {
    invalid_username: "请输入用户名，不能包含空格或 @。",
    username_already_registered: "该用户名已被使用。",
    invalid_email: "邮箱格式不正确。",
    email_already_registered: "该邮箱已被使用。",
    invalid_phone: "手机号格式不正确。"
  };
  return messages[code] ?? fallback;
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

  showAdminApp();
  await loadAdminMetrics();
  await loadUsers();
});

document.getElementById("openCreateUser")?.addEventListener("click", openCreateUser);
document.getElementById("closeUserEditor")?.addEventListener("click", () => {
  document.getElementById("userEditorModal").hidden = true;
});
document.getElementById("userEditorForm")?.addEventListener("submit", saveUser);
document.getElementById("closeDefaultPassword")?.addEventListener("click", () => {
  document.getElementById("defaultPasswordModal").hidden = true;
});

void bootstrapAdmin();
