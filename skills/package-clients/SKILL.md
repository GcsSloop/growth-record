---
name: package-clients
description: Build Growth Record macOS, Windows, Android, and iOS client artifacts locally or through the vX.Y.Z GitHub Actions release flow.
---

# Package Clients

Use this skill when building or explaining Growth Record client releases.

## Local Builds

Run the quality gate first:

```bash
npm run quality
```

Build commands:

```bash
npm run desktop:build:mac
npm run desktop:build:windows
npm run mobile:build:android
npm run mobile:build:ios
```

Expected local constraints:
- macOS desktop and iOS builds require macOS.
- Windows desktop builds should run on Windows.
- iOS uses `--no-codesign`; App Store submission still needs Apple signing assets.

## CI Release Builds

Pushing a tag such as `v0.1.0` triggers `.github/workflows/release-clients.yml`.

The workflow:
- verifies the tag commit is reachable from `origin/master`;
- runs the Node quality gate;
- updates package metadata from the tag in the CI workspace;
- builds Android APK, iOS app, macOS Tauri app, and Windows Tauri installers;
- uploads artifacts to a GitHub Release.

Optional GitHub repository variable:
- `GROWTH_RECORD_WEB_URL`: deployed web URL used by Flutter builds. If absent, CI uses `https://growth-record.gcssloop.workers.dev`.

Output names follow this pattern:

```text
release/v0.1.0/growth_record-darwin-arm64-v0.1.0.app
release/v0.1.0/growth_record-darwin-arm64-v0.1.0.dmg
release/v0.1.0/growth_record-windows-x64-v0.1.0.msi
release/v0.1.0/growth_record-windows-x64-v0.1.0.exe
release/v0.1.0/growth_record-android-arm64-v0.1.0.apk
release/v0.1.0/growth_record-ios-arm64-v0.1.0.app
```
