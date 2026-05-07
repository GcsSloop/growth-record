# Growth Record Mobile

This is the Flutter mobile client for the Growth Record web app.

The app uses native email/password authentication before opening the authenticated web experience in a WebView. This keeps the mobile app from being a bare WebView-only wrapper and supports iOS review requirements for a native app shell.

## Run

```bash
flutter pub get
flutter run --dart-define=GROWTH_RECORD_WEB_URL=https://growth-record.gcssloop.workers.dev
```

## Dependency Baseline

- Dart SDK: `>=3.8.0 <4.0.0`
- `http`: `^1.6.0`
- `webview_flutter`: `^4.13.1`
- `flutter_lints`: `^6.0.0`

For production builds, point `GROWTH_RECORD_WEB_URL` to the deployed Cloudflare Pages or Worker URL.

## Platform Projects

The `android/` and `ios/` directories are checked in as generated Flutter platform projects. Keep platform-specific app identifiers, permissions, and display names aligned with the Growth Record product.
