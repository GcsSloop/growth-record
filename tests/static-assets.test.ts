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

    expect(html).toContain("园中月努力可视化系统");
    expect(html).toContain("/api/me");
    expect(html).toContain("/admin");
    expect(html).toContain("assets/app.css");
    expect(html).toContain("assets/app.js");
  });

  it("provides the admin shell", () => {
    const html = readAsset("public/admin.html");

    expect(html).toContain("管理后台");
    expect(html).toContain("/api/admin/users");
    expect(html).toContain("/api/admin/metrics");
    expect(html).toContain("assets/app.css");
    expect(html).toContain("assets/admin.js");
  });
});
