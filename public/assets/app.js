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

void checkSession();
