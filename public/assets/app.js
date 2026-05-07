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

  const dimensions = ["科研学习", "自媒体", "运动健身", "化妆技术", "电竞操作", "表达能力", "剪辑技能", "编程能力"];
  const today = new Date();
  const monthTitle = `${today.getFullYear()}年${today.getMonth() + 1}月`;

  appContent.className = "bento-grid app-only";
  appContent.innerHTML = `
    <div class="bento-col-left">
      <article class="card role-overview">
        <div class="role-level-badge"><span class="lv-label">LV</span>1</div>
        <p class="role-exp-info">总经验 <strong>0</strong></p>
        <p class="role-exp-remaining">还需 <strong>200</strong> 升级至 LV.2</p>
        <div class="exp-bar-outer"><div class="exp-bar-inner" style="width:0%;"></div></div>
        <div class="exp-bar-label"><span>0 EXP</span><span>200 EXP</span></div>
      </article>
      <article class="card">
        <div class="card-header"><span class="icon-dot gold"></span> 能力雷达</div>
        <div class="radar-placeholder">
          <div class="radar-ring"></div>
          <span>等待成长数据</span>
        </div>
      </article>
      <article class="card card-quotes">
        <div class="card-header"><span class="icon-dot gold"></span> 碎碎念</div>
        <div class="quote-list">
          <div class="quote-item"><div class="quote-date">今日</div><div>慢慢来，每天进步一点点。</div></div>
        </div>
      </article>
      <article class="card card-goals">
        <div class="card-header"><span class="icon-dot blue"></span> 年度目标</div>
        <ul class="goal-list">
          <li><span>建立稳定成长记录</span></li>
          <li><span>把打卡变成可复盘的数据</span></li>
        </ul>
      </article>
    </div>

    <div class="bento-col-middle">
      <article class="card">
        <div class="card-header"><span class="icon-dot green"></span> 今日打卡状态</div>
        <div class="checkin-grid" id="checkinSummary">
          ${dimensions
            .map(
              (name) => `
                <div class="checkin-item pending">
                  <span class="ci-level">LV.1</span>
                  <span class="ci-name">${name}</span>
                  <span class="ci-status"><span class="ci-status-dot"></span> 待打卡</span>
                  <span class="ci-exp">尚未打卡</span>
                </div>`
            )
            .join("")}
        </div>
      </article>
      <article class="card">
        <div class="card-header"><span class="icon-dot blue"></span> 八维成长进度</div>
        <div class="growth-grid">
          ${dimensions
            .map(
              (name) => `
                <div class="growth-item">
                  <div class="growth-top"><span class="growth-name">${name}</span><span class="growth-lv">LV.1</span></div>
                  <div class="growth-bar-outer"><div class="growth-bar-inner very-low" style="width:0%;"></div></div>
                  <div class="growth-stats"><span>0/200</span><span>0%</span></div>
                  <div class="growth-desc">等待打卡记录同步</div>
                </div>`
            )
            .join("")}
        </div>
      </article>
      <article class="card record-card">
        <div class="card-header split-header">
          <span><span class="icon-dot green"></span> 执行记录</span>
          <span class="muted small-label">全部记录</span>
        </div>
        <div class="record-table-wrap">
          <table class="record-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>日期</th>
                <th>维度</th>
                <th>时长</th>
                <th>描述</th>
                <th>经验</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="recordBody">
              <tr><td colspan="7" class="empty-cell">暂无记录，点击打卡开始记录。</td></tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>

    <div class="bento-col-right">
      <article class="card">
        <div class="card-header"><span class="icon-dot gold"></span> <span>${monthTitle}</span></div>
        <table class="calendar-table">
          <thead><tr><th>日</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th>六</th></tr></thead>
          <tbody id="calendarBody">${renderCalendarRows(today)}</tbody>
        </table>
        <div class="calendar-info">点击日期筛选记录</div>
      </article>
      <article class="card">
        <div class="card-header"><span class="icon-dot purple"></span> 数据趋势</div>
        <div class="stats-vertical">
          <div class="stats-chart-wrap"><h4>7日经验</h4><div class="chart-placeholder">暂无数据</div></div>
          <div class="stats-chart-wrap"><h4>月度累计</h4><div class="chart-placeholder">暂无数据</div></div>
          <div class="stats-chart-wrap"><h4>维度分布</h4><div class="chart-placeholder">暂无数据</div></div>
        </div>
      </article>
    </div>`;
  appContent.dataset.rendered = "true";
  appContent.hidden = false;
}

function renderCalendarRows(today) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i += 1) cells.push("<td class='empty'>·</td>");
  for (let day = 1; day <= daysInMonth; day += 1) {
    const todayClass = day === today.getDate() ? "today" : "";
    cells.push(`<td class="${todayClass}">${day}</td>`);
  }
  while (cells.length % 7 !== 0) cells.push("<td class='empty'>·</td>");
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
  return rows.join("");
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
