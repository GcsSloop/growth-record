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

function updateCargoPackageVersion(path, nextVersion) {
  const before = readFileSync(path, "utf8");
  const lines = before.split(/\r?\n/);
  let inPackage = false;
  let replaced = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      inPackage = trimmed === "[package]";
      continue;
    }

    if (inPackage && /^\s*version\s*=/.test(line)) {
      lines[index] = `version = "${nextVersion}"`;
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    console.error(`No version field matched in ${path}`);
    process.exit(1);
  }

  const eol = before.includes("\r\n") ? "\r\n" : "\n";
  writeFileSync(path, `${lines.join(eol)}${eol}`);
}

updateJson("package.json", (json) => {
  json.version = version;
});
updateJson("apps/desktop/tauri.conf.json", (json) => {
  json.version = version;
});
updateCargoPackageVersion("apps/desktop/Cargo.toml", version);
replaceInFile("apps/mobile/pubspec.yaml", /^version: .+$/m, `version: ${version}+1`);

console.log(`Release version set to ${version}`);
