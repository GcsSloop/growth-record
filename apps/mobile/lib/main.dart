import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

const String defaultWebUrl = 'https://growth-record.pages.dev';

void main() {
  runApp(const GrowthRecordApp());
}

class GrowthRecordApp extends StatelessWidget {
  const GrowthRecordApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '园中月努力可视化系统',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xfff0c060),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const GrowthRecordWebView(),
    );
  }
}

class GrowthRecordWebView extends StatefulWidget {
  const GrowthRecordWebView({super.key});

  @override
  State<GrowthRecordWebView> createState() => _GrowthRecordWebViewState();
}

class _GrowthRecordWebViewState extends State<GrowthRecordWebView> {
  late final WebViewController controller;

  @override
  void initState() {
    super.initState();
    const webUrl = String.fromEnvironment('GROWTH_RECORD_WEB_URL', defaultValue: defaultWebUrl);
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xff0d0f1a))
      ..loadRequest(Uri.parse(webUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xff0d0f1a),
      body: SafeArea(
        child: WebViewWidget(controller: controller),
      ),
    );
  }
}
