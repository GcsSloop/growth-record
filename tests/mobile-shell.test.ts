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
    expect(pubspec).toContain("file_selector: ^1.1.0");
    expect(pubspec).toContain("flutter_secure_storage: ^9.2.4");
    expect(pubspec).toContain("path_provider: ^2.1.5");
    expect(pubspec).toContain("webview_flutter: ^4.13.1");
    expect(pubspec).toContain("webview_flutter_android: ^4.12.0");
    expect(pubspec).toContain("flutter_lints: ^6.0.0");
  });

  it("loads the configured web app URL", () => {
    const main = read("apps/mobile/lib/main.dart");

    expect(main).toContain("GROWTH_RECORD_WEB_URL");
    expect(main).toContain("mobileAppPath = '/mobile.html'");
    expect(main).toContain("WebViewController");
    expect(main).toContain("Uri.parse('$webUrl$mobileAppPath')");
    expect(main).toContain("FlutterSecureStorage");
    expect(main).toContain("AndroidWebViewController");
    expect(main).toContain("setOnShowFileSelector");
    expect(main).toContain("openFile");
    expect(main).toContain("openFiles");
    expect(main).toContain("BackupBridge");
    expect(main).toContain("GrowthRecordBackups");
    expect(main).toContain("getApplicationDocumentsDirectory");
    expect(main).toContain("secureStorage.read");
    expect(main).toContain("secureStorage.write");
    expect(main).toContain("savedAccountKey");
    expect(main).toContain("savedPasswordKey");
    expect(main).not.toContain("mobileViewportScript");
    expect(main).toContain("成长记录系统");
  });

  it("enables Flutter lint rules", () => {
    const analysisOptions = read("apps/mobile/analysis_options.yaml");

    expect(analysisOptions).toContain("include: package:flutter_lints/flutter.yaml");
  });

  it("uses stable Android Maven repositories for CI builds", () => {
    const settingsGradle = read("apps/mobile/android/settings.gradle.kts");
    const buildGradle = read("apps/mobile/android/build.gradle.kts");
    const androidGradle = `${settingsGradle}\n${buildGradle}`;

    expect(androidGradle).toContain("google()");
    expect(androidGradle).toContain("mavenCentral()");
    expect(androidGradle).toContain("gradlePluginPortal()");
    expect(androidGradle).not.toContain("maven.aliyun.com");
  });
});
