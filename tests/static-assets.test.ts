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
    expect(html).toContain("管理员登录");
    expect(html).not.toContain("用户数量");
    expect(html).not.toContain("今日活跃");
    expect(script).toContain("/api/admin/metrics");
    expect(html).toContain("assets/app.css");
    expect(html).toContain("assets/admin.js");
  });
});
