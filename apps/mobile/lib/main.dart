import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:webview_flutter/webview_flutter.dart';

const String defaultWebUrl = 'https://growth.ai-gate.work';
const String mobileViewportScript = '''
(function () {
  if (document.getElementById('growth-record-mobile-webview-style')) return;
  document.documentElement.classList.add('growth-record-mobile-webview');
  document.body.classList.add('growth-record-mobile-webview');
  var style = document.createElement('style');
  style.id = 'growth-record-mobile-webview-style';
  style.textContent = `
    html.growth-record-mobile-webview,
    body.growth-record-mobile-webview {
      width: 100% !important;
      min-width: 0 !important;
      overflow-x: hidden !important;
      background: #0d0f1a !important;
    }
    body.growth-record-mobile-webview {
      padding: 12px !important;
    }
    .growth-record-mobile-webview .shell {
      width: 100% !important;
      max-width: none !important;
      min-width: 0 !important;
      min-height: calc(100vh - 24px) !important;
      gap: 12px !important;
    }
    .growth-record-mobile-webview .topbar {
      align-items: flex-start !important;
      border-radius: 16px !important;
      padding: 14px !important;
      gap: 12px !important;
    }
    .growth-record-mobile-webview .header-title {
      font-size: 1.05rem !important;
      line-height: 1.25 !important;
    }
    .growth-record-mobile-webview .actions {
      width: 100% !important;
      justify-content: flex-start !important;
    }
    .growth-record-mobile-webview .bento-grid,
    .growth-record-mobile-webview .dashboard-grid,
    .growth-record-mobile-webview .admin-grid,
    .growth-record-mobile-webview .auth-gate {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 12px !important;
      width: 100% !important;
      margin-top: 12px !important;
    }
    .growth-record-mobile-webview .bento-col-left,
    .growth-record-mobile-webview .bento-col-middle,
    .growth-record-mobile-webview .bento-col-right {
      width: 100% !important;
      min-width: 0 !important;
      gap: 12px !important;
    }
    .growth-record-mobile-webview .card,
    .growth-record-mobile-webview .metric-card,
    .growth-record-mobile-webview .auth-gate > div,
    .growth-record-mobile-webview .login-panel {
      width: 100% !important;
      min-width: 0 !important;
      border-radius: 16px !important;
      padding: 14px !important;
    }
    .growth-record-mobile-webview .checkin-grid,
    .growth-record-mobile-webview .growth-grid,
    .growth-record-mobile-webview .settings-dim-row,
    .growth-record-mobile-webview .settings-quote-row,
    .growth-record-mobile-webview .settings-inline-3,
    .growth-record-mobile-webview .inline-fields {
      grid-template-columns: minmax(0, 1fr) !important;
    }
    .growth-record-mobile-webview canvas {
      max-width: 100% !important;
      height: auto !important;
    }
    .growth-record-mobile-webview .record-table-wrap {
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
    }
    .growth-record-mobile-webview .record-table {
      min-width: 760px !important;
    }
    .growth-record-mobile-webview .modal-overlay {
      padding: 12px !important;
      align-items: start !important;
    }
    .growth-record-mobile-webview .modal {
      width: 100% !important;
      max-height: calc(100vh - 24px) !important;
      border-radius: 16px !important;
      padding: 16px !important;
    }
    .growth-record-mobile-webview .toast-container {
      left: 12px !important;
      right: 12px !important;
      top: 76px !important;
    }
    .growth-record-mobile-webview .toast {
      max-width: none !important;
    }
  `;
  document.head.appendChild(style);
})();
''';

void main() {
  runApp(const GrowthRecordApp());
}

class GrowthRecordApp extends StatelessWidget {
  const GrowthRecordApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '成长记录系统',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xfff0c060),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xff0d0f1a),
        useMaterial3: true,
      ),
      home: const NativeAuthGate(),
    );
  }
}

class NativeAuthGate extends StatefulWidget {
  const NativeAuthGate({super.key});

  @override
  State<NativeAuthGate> createState() => _NativeAuthGateState();
}

class _NativeAuthGateState extends State<NativeAuthGate> {
  static const webUrl = String.fromEnvironment('GROWTH_RECORD_WEB_URL', defaultValue: defaultWebUrl);
  final accountController = TextEditingController();
  final emailController = TextEditingController();
  final usernameController = TextEditingController();
  final passwordController = TextEditingController();
  bool registering = false;
  bool loading = false;
  String status = '';

  @override
  void dispose() {
    accountController.dispose();
    emailController.dispose();
    usernameController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      loading = true;
      status = '';
    });

    final endpoint = registering ? '/api/auth/register-email' : '/api/auth/login-password';
    final registerUsername = usernameController.text.trim();
    final body = registering
        ? {
            'email': emailController.text.trim(),
            'password': passwordController.text,
            if (registerUsername.isNotEmpty) 'username': registerUsername,
          }
        : {'account': accountController.text.trim(), 'password': passwordController.text};

    try {
      final response = await http
          .post(
            Uri.parse('$webUrl$endpoint'),
            headers: {'content-type': 'application/json'},
            body: jsonEncode(body),
          )
          .timeout(const Duration(seconds: 15));

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final code = _extractErrorCode(response.body);
        setState(() {
          status = _authErrorMessage(code, registering);
        });
        return;
      }

      final cookie = _extractSessionCookie(response.headers['set-cookie']);
      if (cookie == null) {
        setState(() {
          status = '登录状态写入失败，请稍后重试。';
        });
        return;
      }

      try {
        await WebViewCookieManager()
            .setCookie(
              WebViewCookie(
                name: 'growth_session',
                value: cookie,
                domain: Uri.parse(webUrl).host,
                path: '/',
              ),
            )
            .timeout(const Duration(seconds: 5));
      } catch (_) {
        // Cookie 写入失败时仍进入 WebView，避免原生页无穷转圈。
      }

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(builder: (_) => const GrowthRecordWebView()),
      );
    } on TimeoutException {
      setState(() {
        status = '请求或会话写入超时，请检查网络后重试。服务地址：$webUrl';
      });
    } on SocketException {
      setState(() {
        status = '网络连接失败，请检查网络或服务地址：$webUrl';
      });
    } catch (_) {
      setState(() {
        status = '请求失败，请稍后重试。服务地址：$webUrl';
      });
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
        });
      }
    }
  }

  String? _extractSessionCookie(String? setCookie) {
    if (setCookie == null) return null;
    final match = RegExp(r'growth_session=([^;]+)').firstMatch(setCookie);
    return match?.group(1);
  }

  String? _extractErrorCode(String body) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) {
        final error = decoded['error'];
        if (error is Map<String, dynamic>) {
          final code = error['code'];
          if (code is String && code.isNotEmpty) return code;
        }
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  String _authErrorMessage(String? code, bool isRegister) {
    const codeMap = {
      'invalid_email': '邮箱格式不正确。',
      'weak_password': '密码至少 8 位。',
      'email_already_registered': '该邮箱已注册，请直接登录。',
      'username_already_registered': '用户名已被占用，请换一个用户名。',
      'invalid_username': '用户名不合法，不能包含空格或 @。',
      'invalid_credentials': '账号或密码错误。',
      'unauthorized': '登录状态已失效，请重新登录。',
    };
    return codeMap[code] ??
        (isRegister ? '注册失败，请检查邮箱、用户名和密码。' : '登录失败，请检查账号和密码。');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    '成长记录系统',
                    style: TextStyle(
                      color: Color(0xfff8d478),
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text('自由才是我永恒的向往', style: TextStyle(color: Color(0xffa8aab8))),
                  const SizedBox(height: 28),
                  SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(value: false, label: Text('登录')),
                      ButtonSegment(value: true, label: Text('注册')),
                    ],
                    selected: {registering},
                    onSelectionChanged: loading
                        ? null
                        : (value) {
                            setState(() {
                              registering = value.first;
                              status = '';
                            });
                          },
                  ),
                  const SizedBox(height: 18),
                  if (registering)
                    TextField(
                      controller: emailController,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(labelText: '邮箱'),
                    )
                  else
                    TextField(
                      controller: accountController,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(labelText: '邮箱或用户名'),
                    ),
                  if (registering) const SizedBox(height: 12),
                  if (registering)
                    TextField(
                      controller: usernameController,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(labelText: '用户名（可选）'),
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: passwordController,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    decoration: const InputDecoration(labelText: '密码'),
                    onSubmitted: (_) => loading ? null : submit(),
                  ),
                  const SizedBox(height: 18),
                  FilledButton(
                    onPressed: loading ? null : submit,
                    child: loading
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(registering ? '注册并进入' : '登录'),
                  ),
                  const SizedBox(height: 12),
                  Text(status, style: const TextStyle(color: Color(0xfff0c060))),
                ],
              ),
            ),
          ),
        ),
      ),
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
  String? loadError;

  @override
  void initState() {
    super.initState();
    const webUrl = String.fromEnvironment('GROWTH_RECORD_WEB_URL', defaultValue: defaultWebUrl);
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xff0d0f1a))
      ..setNavigationDelegate(
        NavigationDelegate(
          onWebResourceError: (error) {
            if (!mounted) return;
            setState(() {
              loadError = '页面加载失败：${error.description}';
            });
          },
          onPageFinished: (_) async {
            await controller.runJavaScript(mobileViewportScript);
          },
        ),
      )
      ..loadRequest(Uri.parse(webUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xff0d0f1a),
      body: SafeArea(
        child: Stack(
          children: [
            WebViewWidget(controller: controller),
            if (loadError != null)
              Align(
                alignment: Alignment.topCenter,
                child: Container(
                  width: double.infinity,
                  margin: const EdgeInsets.all(12),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xCC7F1D1D),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    loadError!,
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
