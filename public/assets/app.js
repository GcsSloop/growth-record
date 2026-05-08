const THEME_KEY = "growth_record_theme";
const DEFAULT_DIMENSIONS = ["科研学习", "自媒体", "运动健身", "化妆技术", "电竞操作", "表达能力", "剪辑技能", "编程能力"];
let dashboardState = null;
let currentFilterDate = null;
let draftSettings = null;

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
    status.textContent = "登录失败，请检查邮箱、用户名和密码。";
    return;
  }
  status.textContent = "";
  showAppState();
}

async function registerWithEmail(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById("authStatus");
  const email = form.elements.email.value.trim();
  const username = form.elements.username.value.trim();
  const password = form.elements.password.value;
  const response = await fetch("/api/auth/register-email", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, username, password })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    status.textContent = authErrorMessage(payload.error?.code, "注册失败，请检查邮箱和密码。");
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
  void renderDashboardShell();
}

function authErrorMessage(code, fallback) {
  const messages = {
    invalid_email: "请输入有效邮箱。",
    invalid_username: "请输入有效用户名，不能包含空格或 @。",
    weak_password: "密码至少需要 8 位。",
    email_already_registered: "该邮箱已注册，请直接登录。",
    username_already_registered: "该用户名已被使用，请换一个。"
  };
  return messages[code] ?? fallback;
}

async function renderDashboardShell() {
  const appContent = document.getElementById("appContent");
  if (!appContent || appContent.dataset.rendered === "true") return;

  const dashboard = await fetchDashboardData();
  dashboardState = dashboard;
  applySettingsToHeader(dashboard);
  applyTheme(dashboard.theme || localStorage.getItem(THEME_KEY) || "dark");
  const dimensions = dashboard.dimensions;
  const records = dashboard.records;
  const totalExp = records.reduce((sum, record) => sum + Number(record.exp || 0), 0);
  const level = Math.floor(totalExp / 200) + 1;
  const currentLevelExp = totalExp - (level - 1) * 200;
  const expPct = Math.min(100, Math.round((currentLevelExp / 200) * 100));
  const today = new Date();
  const monthTitle = `${today.getFullYear()}年${today.getMonth() + 1}月`;
  const todayStr = formatDate(today);

  appContent.className = "bento-grid app-only";
  appContent.innerHTML = `
    <div class="bento-col-left">
      <article class="card role-overview">
        <div class="role-level-badge"><span class="lv-label">LV</span>${level}</div>
        <p class="role-exp-info">总经验 <strong>${totalExp}</strong></p>
        <p class="role-exp-remaining">还需 <strong>${200 - currentLevelExp}</strong> 升级至 LV.${level + 1}</p>
        <div class="exp-bar-outer"><div class="exp-bar-inner" style="width:${expPct}%;"></div></div>
        <div class="exp-bar-label"><span>${totalExp} EXP</span><span>${level * 200} EXP</span></div>
      </article>
      <article class="card radar-card">
        <div class="card-header"><span class="icon-dot gold"></span> 能力雷达</div>
        <canvas id="radarCanvas" style="width:100%; height:240px;"></canvas>
      </article>
      <article class="card card-quotes">
        <div class="card-header"><span class="icon-dot gold"></span> 碎碎念</div>
        <div class="quote-list">
          ${dashboard.quotes.map((quote) => `<div class="quote-item"><div class="quote-date">${escapeHtml(quote.date)}</div><div>${escapeHtml(quote.text)}</div></div>`).join("")}
        </div>
      </article>
      <article class="card card-goals">
        <div class="card-header"><span class="icon-dot blue"></span> 年度目标</div>
        <ul class="goal-list">
          ${dashboard.goals.map((goal) => `<li><span>${escapeHtml(goal)}</span></li>`).join("")}
        </ul>
      </article>
    </div>

    <div class="bento-col-middle">
      <article class="card">
        <div class="card-header"><span class="icon-dot green"></span> 今日打卡状态</div>
        <div class="checkin-grid" id="checkinSummary">
          ${dimensions
            .map(
              (name) => {
                const dimExp = calcDimensionExp(records, name);
                const todayExp = records.filter((record) => record.date === todayStr && record.dimension === name).reduce((sum, record) => sum + Number(record.exp || 0), 0);
                const completed = todayExp > 0;
                return `
                <div class="checkin-item ${completed ? "completed" : "pending"}">
                  <span class="ci-level">LV.${Math.floor(dimExp / 200) + 1}</span>
                  <span class="ci-name">${name}</span>
                  <span class="ci-status"><span class="ci-status-dot"></span> ${completed ? "已完成" : "待打卡"}</span>
                  <span class="ci-exp">${completed ? `${todayExp} 经验` : "尚未打卡"}</span>
                </div>`;
              }
            )
            .join("")}
        </div>
      </article>
      <article class="card">
        <div class="card-header"><span class="icon-dot blue"></span> 八维成长进度</div>
        <div class="growth-grid">
          ${dimensions
            .map(
              (name) => {
                const dimExp = calcDimensionExp(records, name);
                const dimLevel = Math.floor(dimExp / 200) + 1;
                const dimProgress = dimExp - (dimLevel - 1) * 200;
                const dimPct = Math.min(100, Math.round((dimProgress / 200) * 100));
                return `
                <div class="growth-item">
                  <div class="growth-top"><span class="growth-name">${name}</span><span class="growth-lv">LV.${dimLevel}</span></div>
                  <div class="growth-bar-outer"><div class="growth-bar-inner very-low" style="width:${dimPct}%;"></div></div>
                  <div class="growth-stats"><span>${dimProgress}/200</span><span>${dimPct}%</span></div>
                  <div class="growth-desc">来自后端打卡记录</div>
                </div>`;
              }
            )
            .join("")}
        </div>
      </article>
      <article class="card record-card">
        <div class="card-header" style="justify-content:space-between;">
          <span><span class="icon-dot green"></span> 执行记录</span>
          <button class="link-button small-label" id="recordFilterLabel" type="button">全部记录</button>
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
            <tbody id="recordBody">${renderRecordRows(filteredRecords(records))}</tbody>
          </table>
        </div>
      </article>
    </div>

    <div class="bento-col-right">
      <article class="card calendar-card">
        <div class="card-header"><span class="icon-dot gold"></span> <span>${monthTitle}</span></div>
        <table class="calendar-table">
          <thead><tr><th>日</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th>六</th></tr></thead>
          <tbody id="calendarBody">${renderCalendarRows(today, records)}</tbody>
        </table>
        <div class="calendar-info">点击日期筛选记录</div>
      </article>
      <article class="card">
        <div class="card-header"><span class="icon-dot purple"></span> 数据趋势</div>
        <div class="stats-vertical">
          <div class="stats-chart-wrap"><h4>7日经验</h4><canvas id="chartBar7" style="width:100%; height:149px;"></canvas></div>
          <div class="stats-chart-wrap"><h4>月度累计</h4><canvas id="chartLineMonth" style="width:100%; height:148px;"></canvas></div>
          <div class="stats-chart-wrap"><h4>维度分布</h4><canvas id="chartPieDim" style="width:100%; height:148px;"></canvas></div>
        </div>
      </article>
    </div>`;
  appContent.dataset.rendered = "true";
  appContent.hidden = false;
  drawDashboardCanvases(dashboard, records, dimensions, today);
  bindDashboardInteractions();
}

async function fetchDashboardData() {
  const response = await fetch("/api/dashboard", { credentials: "include" });
  if (!response.ok) {
    return {
      dimensions: ["科研学习", "自媒体", "运动健身", "化妆技术", "电竞操作", "表达能力", "剪辑技能", "编程能力"],
      records: [],
      goals: ["建立稳定成长记录", "把打卡变成可复盘的数据"],
      quotes: [{ id: "default", date: formatDate(new Date()), text: "慢慢来，每天进步一点点。" }],
      title: "✨ 园中月努力可视化系统",
      subtitle: "自由才是我永恒的向往",
      descriptions: {},
      dimensionLevelExp: {},
      theme: localStorage.getItem(THEME_KEY) || "dark"
    };
  }
  const payload = await response.json();
  return payload.data;
}

function renderRecordRows(records) {
  if (!records.length) return `<tr><td colspan="7" class="empty-cell">暂无记录，点击打卡开始记录。</td></tr>`;
  return records
    .map(
      (record) => `
        <tr>
          <td><span class="status-done">完成</span></td>
          <td>${escapeHtml(record.date)}</td>
          <td>${escapeHtml(record.dimension)}</td>
          <td>${Number(record.hours)}小时</td>
          <td>${escapeHtml(record.description)}</td>
          <td><span class="exp-badge">+${Number(record.exp)}</span></td>
          <td><button class="btn-danger-text" data-delete-record="${escapeHtml(record.id)}" type="button">🗑️</button></td>
        </tr>`
    )
    .join("");
}

function filteredRecords(records) {
  return currentFilterDate ? records.filter((record) => record.date === currentFilterDate) : [...records];
}

function renderCalendarRows(today, records) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const recordDates = new Set(records.map((record) => record.date));
  const cells = [];
  for (let i = 0; i < firstDay; i += 1) cells.push("<td class='empty'>·</td>");
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const classes = [day === today.getDate() ? "today" : "", recordDates.has(date) ? "has-record" : ""].filter(Boolean).join(" ");
    cells.push(`<td class="${classes}" data-calendar-date="${date}">${day}</td>`);
  }
  while (cells.length % 7 !== 0) cells.push("<td class='empty'>·</td>");
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
  return rows.join("");
}

function calcDimensionExp(records, dimension) {
  return records.filter((record) => record.dimension === dimension).reduce((sum, record) => sum + Number(record.exp || 0), 0);
}

function drawDashboardCanvases(_dashboard, records, dimensions, today) {
  drawRadarChart(dimensions, records);
  drawBarChart7(records, today);
  drawLineChartMonth(records, today);
  drawPieChart(dimensions, records);
}

function refreshDashboard() {
  const appContent = document.getElementById("appContent");
  if (!appContent) return;
  appContent.dataset.rendered = "false";
  void renderDashboardShell();
}

async function reloadDashboard() {
  const appContent = document.getElementById("appContent");
  if (!appContent) return;
  appContent.dataset.rendered = "false";
  appContent.innerHTML = "";
  await renderDashboardShell();
}

function applySettingsToHeader(settings) {
  const title = document.querySelector(".header-title");
  const subtitle = document.querySelector(".header-subtitle");
  if (title) title.textContent = settings.title || "✨ 园中月努力可视化系统";
  if (subtitle) subtitle.textContent = settings.subtitle || "自由才是我永恒的向往";
  document.title = String(settings.title || "园中月努力可视化系统").replace(/^✨\s*/, "");
}

function applyTheme(theme) {
  const normalized = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("light-theme", normalized === "light");
  const button = document.getElementById("themeToggleBtn");
  if (button) button.textContent = normalized === "light" ? "☀️" : "🌙";
  localStorage.setItem(THEME_KEY, normalized);
}

async function toggleTheme() {
  const nextTheme = document.body.classList.contains("light-theme") ? "dark" : "light";
  applyTheme(nextTheme);
  if (dashboardState) {
    dashboardState.theme = nextTheme;
    await saveSettingsPayload(dashboardState, false);
    setTimeout(() => drawDashboardCanvases(dashboardState, dashboardState.records, dashboardState.dimensions, new Date()), 80);
  }
}

function bindDashboardInteractions() {
  const filterLabel = document.getElementById("recordFilterLabel");
  if (filterLabel) filterLabel.textContent = currentFilterDate ? `${currentFilterDate} 记录` : "全部记录";
  filterLabel?.addEventListener("click", showAllRecords);
  document.querySelectorAll("[data-calendar-date]").forEach((cell) => {
    cell.addEventListener("click", () => openArchiveModal(cell.dataset.calendarDate));
  });
  document.querySelectorAll("[data-delete-record]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void deleteRecord(button.dataset.deleteRecord);
    });
  });
}

function setupCanvas(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 220;
  const height = canvas.clientHeight || 160;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function drawRadarChart(dimensions, records) {
  const canvas = document.getElementById("radarCanvas");
  const drawing = setupCanvas(canvas);
  if (!drawing) return;
  const { ctx, width, height } = drawing;
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = size * 0.32;
  const start = -Math.PI / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.fillStyle = "rgba(240,192,96,0.05)";
  for (let layer = 1; layer <= 5; layer += 1) {
    ctx.beginPath();
    const r = (radius / 5) * layer;
    dimensions.forEach((_, index) => {
      const angle = start + (Math.PI * 2 * index) / dimensions.length;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }
  const points = dimensions.map((name, index) => {
    const pct = Math.min(1, calcDimensionExp(records, name) / 500);
    const angle = start + (Math.PI * 2 * index) / dimensions.length;
    return { x: cx + Math.cos(angle) * radius * pct, y: cy + Math.sin(angle) * radius * pct };
  });
  ctx.beginPath();
  points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.closePath();
  ctx.fillStyle = "rgba(96,165,250,0.12)";
  ctx.strokeStyle = "rgba(240,192,96,0.55)";
  ctx.lineWidth = 1.8;
  ctx.fill();
  ctx.stroke();
  ctx.font = "600 11px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e8e9f0";
  dimensions.forEach((name, index) => {
    const angle = start + (Math.PI * 2 * index) / dimensions.length;
    ctx.fillText(name, cx + Math.cos(angle) * (radius + 24), cy + Math.sin(angle) * (radius + 24));
  });
}

function drawBarChart7(records, today) {
  const drawing = setupCanvas(document.getElementById("chartBar7"));
  if (!drawing) return;
  const { ctx, width, height } = drawing;
  drawEmptyChartFrame(ctx, width, height, "暂无数据");
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const dateStr = formatDate(date);
    return { label: `${date.getMonth() + 1}/${date.getDate()}`, exp: records.filter((record) => record.date === dateStr).reduce((sum, record) => sum + Number(record.exp || 0), 0) };
  });
  drawBars(ctx, width, height, days);
}

function drawLineChartMonth(records, today) {
  const drawing = setupCanvas(document.getElementById("chartLineMonth"));
  if (!drawing) return;
  const { ctx, width, height } = drawing;
  drawEmptyChartFrame(ctx, width, height, "暂无数据");
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  let total = 0;
  const points = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    total += records.filter((record) => record.date === dateStr).reduce((sum, record) => sum + Number(record.exp || 0), 0);
    return total;
  });
  if (!total) return;
  const pad = { top: 20, right: 18, bottom: 26, left: 34 };
  ctx.strokeStyle = "#f0c060";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  points.forEach((value, index) => {
    const x = pad.left + (index / Math.max(1, points.length - 1)) * (width - pad.left - pad.right);
    const y = height - pad.bottom - (value / total) * (height - pad.top - pad.bottom);
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawPieChart(dimensions, records) {
  const drawing = setupCanvas(document.getElementById("chartPieDim"));
  if (!drawing) return;
  const { ctx, width, height } = drawing;
  const values = dimensions.map((name) => calcDimensionExp(records, name));
  const total = values.reduce((sum, value) => sum + value, 0);
  drawEmptyChartFrame(ctx, width, height, total ? "" : "暂无数据");
  if (!total) return;
  const colors = ["#4ade80", "#f472b6", "#fb923c", "#f87171", "#818cf8", "#22d3bb", "#a78bfa", "#60a5fa"];
  let start = -Math.PI / 2;
  values.forEach((value, index) => {
    const angle = (Math.PI * 2 * value) / total;
    ctx.beginPath();
    ctx.moveTo(width / 2, height / 2);
    ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.32, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = colors[index % colors.length];
    ctx.fill();
    start += angle;
  });
}

function drawEmptyChartFrame(ctx, width, height, label) {
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.setLineDash([3, 6]);
  for (let i = 1; i <= 2; i += 1) {
    const y = (height / 3) * i;
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(width - 16, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (label) {
    ctx.fillStyle = "#6b6d80";
    ctx.font = "14px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, width / 2, height / 2);
  }
}

function drawBars(ctx, width, height, days) {
  const max = Math.max(1, ...days.map((day) => day.exp));
  const pad = { top: 22, right: 14, bottom: 28, left: 34 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  ctx.fillStyle = "#a8aab8";
  ctx.font = "10px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.textAlign = "center";
  days.forEach((day, index) => {
    const x = pad.left + (chartWidth / days.length) * index + chartWidth / days.length / 2;
    const barHeight = (day.exp / max) * chartHeight;
    ctx.fillStyle = "#f0c060";
    ctx.fillRect(x - 8, pad.top + chartHeight - barHeight, 16, barHeight);
    ctx.fillStyle = "#a8aab8";
    ctx.fillText(day.label, x, height - 10);
  });
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function calcCheckinExp(hours) {
  let exp = Math.round(Number(hours || 0) * 10);
  if (hours >= 4) exp = Math.round(exp * 1.2);
  else if (hours >= 2.5) exp = Math.round(exp * 1.1);
  return exp;
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function openCheckinModal() {
  if (!dashboardState) return;
  document.getElementById("checkinDate").value = formatDate(new Date());
  document.getElementById("checkinHours").value = "1";
  document.getElementById("checkinDesc").value = "";
  const select = document.getElementById("checkinDimension");
  select.innerHTML = dashboardState.dimensions.map((dimension) => `<option value="${escapeHtml(dimension)}">${escapeHtml(dimension)}</option>`).join("");
  updateExpPreview();
  document.getElementById("checkinModal").hidden = false;
}

function closeCheckinModal() {
  document.getElementById("checkinModal").hidden = true;
}

function updateExpPreview() {
  const hours = Number(document.getElementById("checkinHours")?.value || 0);
  const preview = document.getElementById("expPreview");
  if (preview) preview.textContent = `预计经验：+${calcCheckinExp(hours)}`;
}

async function submitCheckin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const date = form.elements.date.value;
  const dimension = form.elements.dimension.value;
  const hours = Number(form.elements.hours.value);
  const description = form.elements.description.value.trim() || "未描述";
  if (!date || !dimension || !Number.isFinite(hours) || hours <= 0 || hours > 12) {
    showToast("请填写完整，时长不超过 12 小时", "warning");
    return;
  }
  const response = await fetch("/api/records", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, dimension, hours, description })
  });
  if (!response.ok) {
    showToast("打卡失败，请稍后重试", "warning");
    return;
  }
  const payload = await response.json();
  dashboardState.records.unshift(payload.data.record);
  closeCheckinModal();
  showToast(`🎉 打卡成功！+${payload.data.record.exp} 经验`, "success");
  await reloadDashboard();
}

function openArchiveModal(date = formatDate(new Date())) {
  const input = document.getElementById("archiveDate");
  input.value = date;
  previewArchiveDate();
  document.getElementById("archiveModal").hidden = false;
}

function closeArchiveModal() {
  document.getElementById("archiveModal").hidden = true;
}

function previewArchiveDate() {
  const date = document.getElementById("archiveDate")?.value;
  const preview = document.getElementById("archivePreview");
  if (!date || !preview || !dashboardState) return;
  const records = dashboardState.records.filter((record) => record.date === date);
  const exp = records.reduce((sum, record) => sum + Number(record.exp || 0), 0);
  preview.textContent = records.length ? `📅 ${date}：共 ${records.length} 条记录，累计 +${exp} 经验` : `📅 ${date}：暂无记录`;
}

async function jumpToArchiveDate() {
  const date = document.getElementById("archiveDate")?.value;
  if (!date) return;
  currentFilterDate = date;
  closeArchiveModal();
  await reloadDashboard();
  showToast(`已筛选 ${date} 的记录`, "info");
}

async function showAllRecords() {
  currentFilterDate = null;
  closeArchiveModal();
  await reloadDashboard();
}

async function deleteRecord(recordId) {
  if (!recordId || !confirm("确定删除这条记录？")) return;
  const response = await fetch(`/api/records/${encodeURIComponent(recordId)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    showToast("删除失败", "warning");
    return;
  }
  dashboardState.records = dashboardState.records.filter((record) => record.id !== recordId);
  showToast("记录已删除", "success");
  await reloadDashboard();
}

function openSettingsModal() {
  if (!dashboardState) return;
  draftSettings = structuredClone({
    title: dashboardState.title,
    subtitle: dashboardState.subtitle,
    dimensions: dashboardState.dimensions || DEFAULT_DIMENSIONS,
    descriptions: dashboardState.descriptions || {},
    dimensionLevelExp: dashboardState.dimensionLevelExp || {},
    goals: dashboardState.goals || [],
    quotes: dashboardState.quotes || [],
    theme: dashboardState.theme || localStorage.getItem(THEME_KEY) || "dark"
  });
  document.getElementById("settingsTitle").value = draftSettings.title;
  document.getElementById("settingsSubtitle").value = draftSettings.subtitle;
  document.getElementById("settingsNewQuoteDate").value = formatDate(new Date());
  renderSettingsLists();
  document.getElementById("settingsModal").hidden = false;
}

function closeSettingsModal() {
  document.getElementById("settingsModal").hidden = true;
}

function renderSettingsLists() {
  renderSettingsGoalList();
  renderSettingsQuoteList();
  renderSettingsDimList();
}

function renderSettingsGoalList() {
  const container = document.getElementById("settingsGoalList");
  container.innerHTML = (draftSettings.goals || [])
    .map((goal, index) => `<div class="settings-row"><input value="${escapeHtml(goal)}" data-goal-index="${index}"><button class="btn-danger-text" data-remove-goal="${index}" type="button">🗑️</button></div>`)
    .join("");
}

function renderSettingsQuoteList() {
  const container = document.getElementById("settingsQuoteList");
  container.innerHTML = (draftSettings.quotes || [])
    .map(
      (quote, index) => `<div class="settings-row settings-quote-row"><input type="date" value="${escapeHtml(quote.date)}" data-quote-date="${index}"><input value="${escapeHtml(quote.text)}" data-quote-text="${index}"><button class="btn-danger-text" data-remove-quote="${index}" type="button">🗑️</button></div>`
    )
    .join("");
}

function renderSettingsDimList() {
  const container = document.getElementById("settingsDimList");
  container.innerHTML = (draftSettings.dimensions || [])
    .map(
      (dimension, index) => `<div class="settings-dim-row"><input value="${escapeHtml(dimension)}" data-dim-name="${index}" placeholder="维度名称"><input type="number" min="1" step="1" value="${Number(draftSettings.dimensionLevelExp?.[dimension] || 200)}" data-dim-exp="${index}" placeholder="每级经验"><input value="${escapeHtml(draftSettings.descriptions?.[dimension] || "")}" data-dim-desc="${index}" placeholder="描述"></div>`
    )
    .join("");
}

function syncSettingsDraftFromDom() {
  if (!draftSettings) return;
  draftSettings.title = document.getElementById("settingsTitle").value.trim() || "✨ 园中月努力可视化系统";
  draftSettings.subtitle = document.getElementById("settingsSubtitle").value.trim() || "自由才是我永恒的向往";
  document.querySelectorAll("[data-goal-index]").forEach((input) => {
    draftSettings.goals[Number(input.dataset.goalIndex)] = input.value.trim();
  });
  document.querySelectorAll("[data-quote-date]").forEach((input) => {
    draftSettings.quotes[Number(input.dataset.quoteDate)].date = input.value;
  });
  document.querySelectorAll("[data-quote-text]").forEach((input) => {
    draftSettings.quotes[Number(input.dataset.quoteText)].text = input.value.trim();
  });
  const nextDimensions = [];
  const nextDescriptions = {};
  const nextLevelExp = {};
  document.querySelectorAll("[data-dim-name]").forEach((input) => {
    const index = Number(input.dataset.dimName);
    const name = input.value.trim();
    if (!name) return;
    nextDimensions.push(name);
    nextDescriptions[name] = document.querySelector(`[data-dim-desc="${index}"]`)?.value.trim() || "";
    const exp = Number(document.querySelector(`[data-dim-exp="${index}"]`)?.value || 200);
    nextLevelExp[name] = Number.isFinite(exp) && exp > 0 ? Math.round(exp) : 200;
  });
  draftSettings.dimensions = nextDimensions.length ? nextDimensions : DEFAULT_DIMENSIONS;
  draftSettings.descriptions = nextDescriptions;
  draftSettings.dimensionLevelExp = nextLevelExp;
  draftSettings.goals = draftSettings.goals.map((goal) => goal.trim()).filter(Boolean);
  draftSettings.quotes = draftSettings.quotes.filter((quote) => quote.text);
}

async function saveSettingsPayload(settings, announce = true) {
  const response = await fetch("/api/settings", {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings)
  });
  if (!response.ok) {
    if (announce) showToast("设置保存失败", "warning");
    return null;
  }
  const payload = await response.json();
  return payload.data;
}

async function saveSettings() {
  syncSettingsDraftFromDom();
  const saved = await saveSettingsPayload(draftSettings);
  if (!saved) return;
  dashboardState = { ...dashboardState, ...saved };
  closeSettingsModal();
  showToast("设置已保存", "success");
  await reloadDashboard();
}

function exportData() {
  if (!dashboardState) return;
  const blob = new Blob([JSON.stringify(dashboardState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `growth_record_backup_${formatDate(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
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
document.getElementById("registerForm")?.addEventListener("submit", registerWithEmail);
document.getElementById("checkinButton")?.addEventListener("click", openCheckinModal);
document.getElementById("mobileCheckinButton")?.addEventListener("click", openCheckinModal);
document.getElementById("archiveButton")?.addEventListener("click", () => openArchiveModal());
document.getElementById("settingsButton")?.addEventListener("click", openSettingsModal);
document.getElementById("themeToggleBtn")?.addEventListener("click", () => void toggleTheme());
document.getElementById("checkinHours")?.addEventListener("input", updateExpPreview);
document.getElementById("checkinForm")?.addEventListener("submit", submitCheckin);
document.getElementById("closeCheckin")?.addEventListener("click", closeCheckinModal);
document.getElementById("archiveDate")?.addEventListener("change", previewArchiveDate);
document.getElementById("closeArchive")?.addEventListener("click", closeArchiveModal);
document.getElementById("jumpArchiveDate")?.addEventListener("click", () => void jumpToArchiveDate());
document.getElementById("showAllRecords")?.addEventListener("click", () => void showAllRecords());
document.getElementById("closeSettings")?.addEventListener("click", closeSettingsModal);
document.getElementById("saveSettings")?.addEventListener("click", () => void saveSettings());
document.getElementById("settingsExportData")?.addEventListener("click", exportData);
document.getElementById("settingsAddGoal")?.addEventListener("click", () => {
  syncSettingsDraftFromDom();
  const input = document.getElementById("settingsNewGoal");
  const value = input.value.trim();
  if (!value) return;
  draftSettings.goals.push(value);
  input.value = "";
  renderSettingsGoalList();
});
document.getElementById("settingsAddQuote")?.addEventListener("click", () => {
  syncSettingsDraftFromDom();
  const dateInput = document.getElementById("settingsNewQuoteDate");
  const textInput = document.getElementById("settingsNewQuoteText");
  const text = textInput.value.trim();
  if (!text) return;
  draftSettings.quotes.push({ id: `q${Date.now()}`, date: dateInput.value || formatDate(new Date()), text });
  textInput.value = "";
  renderSettingsQuoteList();
});
document.getElementById("settingsGoalList")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-goal]");
  if (!button) return;
  syncSettingsDraftFromDom();
  draftSettings.goals.splice(Number(button.dataset.removeGoal), 1);
  renderSettingsGoalList();
});
document.getElementById("settingsQuoteList")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-quote]");
  if (!button) return;
  syncSettingsDraftFromDom();
  draftSettings.quotes.splice(Number(button.dataset.removeQuote), 1);
  renderSettingsQuoteList();
});
document.getElementById("openUserManagement")?.addEventListener("click", () => {
  closeSettingsModal();
  document.getElementById("userManagementModal").hidden = false;
});
document.getElementById("closeUserManagement")?.addEventListener("click", () => {
  document.getElementById("userManagementModal").hidden = true;
});
document.getElementById("userManagementModal")?.addEventListener("click", (event) => {
  if (event.target.id === "userManagementModal") event.currentTarget.hidden = true;
});
["checkinModal", "archiveModal", "settingsModal"].forEach((id) => {
  document.getElementById(id)?.addEventListener("click", (event) => {
    if (event.target.id === id) event.currentTarget.hidden = true;
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCheckinModal();
    closeArchiveModal();
    closeSettingsModal();
    document.getElementById("userManagementModal").hidden = true;
  }
});
document.getElementById("setPasswordForm")?.addEventListener("submit", setCurrentUserPassword);

void checkSession();
