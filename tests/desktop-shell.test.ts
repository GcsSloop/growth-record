import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Tauri desktop shell scaffold", () => {
  it("declares Tauri desktop scripts and cli dependency", () => {
    const packageJson = read("package.json");

    expect(packageJson).toContain('"desktop:dev": "cd apps/desktop && tauri dev"');
    expect(packageJson).toContain('"desktop:build": "cd apps/desktop && tauri build"');
    expect(packageJson).toContain('"@tauri-apps/cli": "^2.11.1"');
  });

  it("configures macOS and Windows bundles", () => {
    const config = read("apps/desktop/tauri.conf.json");

    expect(config).toContain('"productName": "Growth Record"');
    expect(config).toContain('"identifier": "com.gcssloop.growthrecord"');
    expect(config).toContain('"targets": ["dmg", "app", "msi", "nsis"]');
    expect(config).toContain('"frontendDist": "../../public"');
  });

  it("contains a minimal Rust Tauri entrypoint", () => {
    const main = read("apps/desktop/src/main.rs");

    expect(main).toContain("tauri::Builder::default()");
    expect(main).toContain("tauri::generate_context!()");
  });
});
