import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const versionTag = process.argv[2];
const platform = process.argv[3];
if (!versionTag || !platform) {
  console.error("Usage: node scripts/collect-release-artifacts.mjs v0.1.0 <platform>");
  process.exit(1);
}

const version = versionTag.startsWith("v") ? versionTag : `v${versionTag}`;
const outDir = join("release", version);
mkdirSync(outDir, { recursive: true });

function copyIfExists(source, targetName) {
  if (!source) return false;
  if (!existsSync(source)) return false;
  const target = join(outDir, targetName);
  const stat = statSync(source);
  if (stat.isDirectory()) cpSync(source, target, { recursive: true });
  else copyFileSync(source, target);
  console.log(`Collected ${target}`);
  return true;
}

function newestFile(dir, predicate) {
  if (!existsSync(dir)) return null;
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile() && predicate(path))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

const collectors = {
  "android": () => copyIfExists("apps/mobile/build/app/outputs/flutter-apk/app-release.apk", `growth_record-android-arm64-${version}.apk`),
  "ios": () => copyIfExists("apps/mobile/build/ios/iphoneos/Runner.app", `growth_record-ios-arm64-${version}.app`),
  "darwin-arm64": () => {
    const app = copyIfExists("apps/desktop/target/release/bundle/macos/Growth Record.app", `growth_record-darwin-arm64-${version}.app`);
    const dmg = newestFile("apps/desktop/target/release/bundle/dmg", (path) => path.endsWith(".dmg"));
    return copyIfExists(dmg ?? "", `growth_record-darwin-arm64-${version}.dmg`) || app;
  },
  "windows-x64": () => {
    const msi = newestFile("apps/desktop/target/release/bundle/msi", (path) => path.endsWith(".msi"));
    const nsis = newestFile("apps/desktop/target/release/bundle/nsis", (path) => path.endsWith(".exe"));
    const copiedMsi = copyIfExists(msi ?? "", `growth_record-windows-x64-${version}.msi`);
    const copiedNsis = copyIfExists(nsis ?? "", `growth_record-windows-x64-${version}.exe`);
    return copiedMsi || copiedNsis;
  }
};

const collect = collectors[platform];
if (!collect) {
  console.error(`Unknown platform: ${platform}`);
  process.exit(1);
}

if (!collect()) {
  console.error(`No artifacts were collected for ${platform}`);
  process.exit(1);
}

console.log(`Artifacts available in ${outDir}`);
