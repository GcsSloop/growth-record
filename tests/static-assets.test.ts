import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readAsset(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("static web assets", () => {
  it("provides the authenticated app shell", () => {
    const html = readAsset("public/index.html");
    const script = readAsset("public/assets/app.js");

    expect(html).toContain("园中月努力可视化系统");
    expect(script).toContain("/api/me");
    expect(script).toContain("/api/dashboard");
    expect(script).toContain("/api/auth/register-email");
    expect(script).not.toContain("/api/auth/request-phone-code");
    expect(script).not.toContain("/api/auth/register-phone");
    expect(script).toContain("/api/me/password");
    expect(script).toContain("能力雷达");
    expect(script).toContain("碎碎念");
    expect(script).toContain("年度目标");
    expect(script).toContain("八维成长进度");
    expect(script).toContain("数据趋势");
    expect(script).toContain("calendarBody");
    expect(script).toContain("recordBody");
    expect(html).toContain("checkinModal");
    expect(html).toContain("archiveModal");
    expect(html).toContain("settingsModal");
    expect(html).toContain("userManagementModal");
    expect(html).toContain('id="archiveButton"');
    expect(html).not.toContain('id="archiveButton" type="button" disabled');
    expect(html).toContain('id="themeToggleBtn"');
    expect(script).toContain("/api/records");
    expect(script).toContain("/api/settings");
    expect(script).toContain("openCheckinModal");
    expect(script).toContain("openArchiveModal");
    expect(script).toContain("openSettingsModal");
    expect(script).toContain("toggleTheme");
    expect(html).toContain("注册");
    expect(html).toContain("邮箱");
    expect(html).toContain("用户名");
    expect(html).not.toContain("验证码");
    expect(html).not.toContain("获取验证码");
    expect(html).toContain("设置密码");
    expect(html).not.toContain('href="/admin"');
    expect(html).not.toContain("今日打卡状态");
    expect(html).not.toContain("执行记录");
    expect(html).toContain("assets/app.css");
    expect(html).toContain("assets/app.js");
  });

  it("provides the admin shell", () => {
    const html = readAsset("public/admin.html");
    const script = readAsset("public/assets/admin.js");

    expect(html).toContain("管理后台");
    expect(script).toContain("/api/admin/bootstrap");
    expect(script).toContain("/api/me");
    expect(html).toContain("管理员登录");
    expect(html).toContain("openCreateUser");
    expect(html).toContain("邮箱");
    expect(html).toContain("用户名");
    expect(script).toContain("form.elements.email");
    expect(script).toContain("form.elements.username");
    expect(html).toContain("userEditorModal");
    expect(html).toContain("defaultPasswordModal");
    expect(html).not.toContain("用户数量");
    expect(html).not.toContain("今日活跃");
    expect(script).toContain("/api/admin/metrics");
    expect(html).toContain("assets/app.css");
    expect(html).toContain("assets/admin.js");
  });

  it("provides the mobile authenticated app shell", () => {
    const html = readAsset("public/mobile.html");

    expect(html).toContain("/api/dashboard");
    expect(html).toContain("/api/records");
    expect(html).toContain("/api/settings");
    expect(html).toContain("syncDashboard");
    expect(html).toContain("normalizeApiRecord");
    expect(html).toContain("credentials: 'same-origin'");
    expect(html).toContain("theme: 'dark'");
    expect(html).toContain("localPrefs.theme === 'light' ? 'light'");
    expect(html).toContain("defaults.theme");
    expect(html).not.toContain("payload.theme === 'light' ? 'light' : 'dark'");
    expect(html).toContain("document.body.classList.toggle('light-theme', appSettings.theme === 'light')");
    expect(html).toContain("theme: settings.theme === 'light' ? 'light' : 'dark'");
    expect(html).toContain("saveLocalPrefs(appSettings)");
    expect(html).toContain("app-dialog-overlay");
    expect(html).toContain("app-date-dialog");
    expect(html).toContain("openAppDatePicker");
    expect(html).toContain("window.openAppDatePicker = openAppDatePicker");
    expect(html).toContain("function shiftCalendarMonth");
    expect(html).toContain("getTrendAnchorDate");
    expect(html).toContain("anchorMonthPrefix");
    expect(html).toContain(`onclick="openAppDatePicker('inlineCheckinDate')"`);
    expect(html).toContain(`onclick="shiftCalendarMonth(-1)"`);
    expect(html).toContain(`onclick="shiftCalendarMonth(1)"`);
    expect(html).toContain("DEFAULT_BACKUP_DIR_NAME = 'GrowthRecordBackups'");
    expect(html).toContain("BackupBridge.postMessage");
    expect(html).toContain("saveBackupWithNativeBridge");
    expect(html).toContain("AvatarBridge.postMessage");
    expect(html).toContain("window.setAvatarImageFromNative = setAvatarImageData");
    expect(html).toContain("body.mobile-preview .settings-add-row .btn");
    expect(html).toContain('id="avatarImageInput"');
    expect(html).not.toContain('id="avatarImageInput" accept="image/*" style="display:none;"');
    expect(html).toContain('for="avatarImageInput"');
    expect(html).toContain("input.showPicker");
    expect(html).toContain('id="themeToggleBtn"');
    expect(html).toContain('class="header-actions"');
    expect(html).toContain("mobile-tab-overview");
    expect(html).toContain("body.mobile-preview:not(.mobile-tab-overview) .header");
    expect(html).toContain("const headerBtn = document.getElementById('themeToggleBtn')");
    expect(html).not.toContain("body.mobile-preview #themeToggleBtn {\n                display: none;\n            }");
    expect(html).not.toMatch(/<div class="action-bar">[\s\S]*id="themeToggleBtn"[\s\S]*<\/div>/);
    expect(html).toContain("mobile-keyboard-active");
    expect(html).toContain("setMobileKeyboardActive");
    expect(html).toContain("focusin");
    expect(html).toContain("focusout");
    expect(html).toContain("record-desc-cell");
    expect(html).toContain("table-layout: fixed");
    expect(html).toContain("overflow-wrap: anywhere");
    expect(html).toContain("record-delete-btn");
    expect(html).toContain("🗑");
    expect(html).toContain("删除记录");
    expect(html).not.toContain("settingsAvatarInput");
    expect(html).not.toContain("settingsAvatarPreview");
    expect(html).not.toContain("settingsThemeToggleBtn");
    expect(html).not.toContain("avatar-settings-row");
    expect(html).not.toContain("settings-avatar-preview");
    expect(html).not.toContain('id="inlineCheckinDate" type="date"');
    expect(html).not.toContain("border:1px solid rgba(74,222,128,0.3)");
    expect(html).not.toContain("clearAvatarImage");
    expect(html).not.toContain("更换头像");
    expect(html).not.toContain("清除头像");
    expect(html).not.toContain("settingsImportData");
    expect(html).not.toContain("importDataPrompt");
    expect(html).not.toContain("自动备份");
    expect(html).not.toContain("settingsPickBackupFolder");
    expect(html).not.toContain("settingsRunBackupNow");
    expect(html).not.toContain("数据管理");
    expect(html).not.toContain('onclick="settingsExportData()"');
    expect(html).not.toContain('onclick="settingsResetAllData()"');
    expect(html).not.toContain("startAutoBackupTimer");
    expect(html).toContain(`onclick="openAppDatePicker('settingsNewQuoteDate')"`);
    expect(html).toContain(`onclick="openAppDatePicker('settingsQuoteDate\${i}')"`);
    expect(html).toContain("settings-exp-input");
    expect(html).toContain("settings-date-input");
    expect(html).toContain("position: relative !important");
    expect(html).not.toContain("localStorage.setItem(STORAGE_KEY");
    expect(html).not.toContain("localStorage.setItem(THEME_KEY");
  });

  it("uses a Wrangler-compatible Node version for Worker deploys", () => {
    const workflow = readAsset(".github/workflows/deploy-worker.yml");

    expect(workflow).toContain('node-version: "22"');
    expect(workflow).toContain("npx wrangler deploy");
  });
});
