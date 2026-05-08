import { readFileSync, writeFileSync } from "node:fs";

const rawVersion = process.argv[2];
if (!rawVersion || !/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(rawVersion)) {
  console.error("Usage: node scripts/set-release-version.mjs v0.1.0");
  process.exit(1);
}

const version = rawVersion.slice(1);

function updateJson(path, updater) {
  const json = JSON.parse(readFileSync(path, "utf8"));
  updater(json);
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

function replaceInFile(path, pattern, replacement) {
  const before = readFileSync(path, "utf8");
  const after = before.replace(pattern, replacement);
  if (after === before) {
    console.error(`No version field matched in ${path}`);
    process.exit(1);
  }
  writeFileSync(path, after);
}

updateJson("package.json", (json) => {
  json.version = version;
});
updateJson("apps/desktop/tauri.conf.json", (json) => {
  json.version = version;
});
replaceInFile("apps/desktop/Cargo.toml", /^version = ".+"$/m, `version = "${version}"`);
replaceInFile("apps/mobile/pubspec.yaml", /^version: .+$/m, `version: ${version}+1`);

console.log(`Release version set to ${version}`);
