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

void loadAdminMetrics();
