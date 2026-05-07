import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Flutter mobile shell scaffold", () => {
  it("declares a Flutter app with WebView support", () => {
    const pubspec = read("apps/mobile/pubspec.yaml");

    expect(pubspec).toContain("name: growth_record_mobile");
    expect(pubspec).toContain('sdk: ">=3.8.0 <4.0.0"');
    expect(pubspec).toContain("webview_flutter: ^4.13.1");
    expect(pubspec).toContain("flutter_lints: ^6.0.0");
  });

  it("loads the configured web app URL", () => {
    const main = read("apps/mobile/lib/main.dart");

    expect(main).toContain("GROWTH_RECORD_WEB_URL");
    expect(main).toContain("WebViewController");
    expect(main).toContain("园中月努力可视化系统");
  });

  it("enables Flutter lint rules", () => {
    const analysisOptions = read("apps/mobile/analysis_options.yaml");

    expect(analysisOptions).toContain("include: package:flutter_lints/flutter.yaml");
  });
});
