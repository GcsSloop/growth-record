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

    expect(packageJson).toContain('"desktop:dev": "tauri dev"');
    expect(packageJson).toContain('"desktop:build": "tauri build"');
    expect(packageJson).toContain('"@tauri-apps/cli": "^2.11.1"');
  });

  it("configures macOS and Windows bundles", () => {
    const config = read("src-tauri/tauri.conf.json");

    expect(config).toContain('"productName": "Growth Record"');
    expect(config).toContain('"identifier": "com.gcssloop.growthrecord"');
    expect(config).toContain('"targets": ["dmg", "app", "msi", "nsis"]');
    expect(config).toContain('"frontendDist": "../public"');
  });

  it("contains a minimal Rust Tauri entrypoint", () => {
    const main = read("src-tauri/src/main.rs");

    expect(main).toContain("tauri::Builder::default()");
    expect(main).toContain("tauri::generate_context!()");
  });
});
