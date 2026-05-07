# Growth Record Mobile

This is the Flutter WebView shell for the Growth Record web app.

## Run

```bash
flutter pub get
flutter run --dart-define=GROWTH_RECORD_WEB_URL=http://localhost:8787
```

## Dependency Baseline

- Dart SDK: `>=3.8.0 <4.0.0`
- `webview_flutter`: `^4.13.1`
- `flutter_lints`: `^6.0.0`

For production builds, point `GROWTH_RECORD_WEB_URL` to the deployed Cloudflare Pages or Worker URL.

## Platform Projects

The `android/` and `ios/` directories are reserved for generated Flutter platform files. Run `flutter create .` inside `apps/mobile` when the local Flutter SDK is available and platform-specific files are needed.
