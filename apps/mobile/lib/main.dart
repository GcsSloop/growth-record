import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter/webview_flutter.dart';

const String defaultWebUrl = 'https://growth.ai-gate.work';
const String mobileAppPath = '/mobile.html';

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
  static const savedAccountKey = 'growth_record_saved_account';
  static const savedPasswordKey = 'growth_record_saved_password';
  static const secureStorage = FlutterSecureStorage();
  final accountController = TextEditingController();
  final emailController = TextEditingController();
  final usernameController = TextEditingController();
  final passwordController = TextEditingController();
  bool registering = false;
  bool loading = false;
  String status = '';

  @override
  void initState() {
    super.initState();
    unawaited(_loadSavedCredentials());
  }

  @override
  void dispose() {
    accountController.dispose();
    emailController.dispose();
    usernameController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  Future<void> _loadSavedCredentials() async {
    final savedAccount = await secureStorage.read(key: savedAccountKey);
    final savedPassword = await secureStorage.read(key: savedPasswordKey);
    if (!mounted) return;
    accountController.text = savedAccount ?? '';
    passwordController.text = savedPassword ?? '';
  }

  Future<void> _saveCredentials(String account, String password) async {
    await secureStorage.write(key: savedAccountKey, value: account);
    await secureStorage.write(key: savedPasswordKey, value: password);
  }

  Future<void> submit() async {
    setState(() {
      loading = true;
      status = '';
    });

    final endpoint = registering ? '/api/auth/register-email' : '/api/auth/login-password';
    final registerUsername = usernameController.text.trim();
    final loginAccount = accountController.text.trim();
    final body = registering
        ? {
            'email': emailController.text.trim(),
            'password': passwordController.text,
            if (registerUsername.isNotEmpty) 'username': registerUsername,
          }
        : {'account': loginAccount, 'password': passwordController.text};

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

      if (!registering) {
        await _saveCredentials(loginAccount, passwordController.text);
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
      ..addJavaScriptChannel(
        'BackupBridge',
        onMessageReceived: (message) {
          unawaited(_saveBackupFromWeb(message.message));
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onWebResourceError: (error) {
            if (!mounted) return;
            setState(() {
              loadError = '页面加载失败：${error.description}';
            });
          },
        ),
      )
      ..loadRequest(Uri.parse('$webUrl$mobileAppPath'));
    _configureAndroidFilePicker();
  }

  void _configureAndroidFilePicker() {
    if (controller.platform is! AndroidWebViewController) return;
    final androidController = controller.platform as AndroidWebViewController;
    androidController.setOnShowFileSelector((params) async {
      final acceptedTypeGroups = _acceptedTypeGroups(params.acceptTypes);
      if (params.mode == FileSelectorMode.openMultiple) {
        final files = await openFiles(acceptedTypeGroups: acceptedTypeGroups);
        return files.map((file) => file.path).toList();
      }
      final file = await openFile(acceptedTypeGroups: acceptedTypeGroups);
      return file == null ? <String>[] : <String>[file.path];
    });
  }

  List<XTypeGroup> _acceptedTypeGroups(List<String> acceptTypes) {
    final normalized = acceptTypes.map((type) => type.trim()).where((type) => type.isNotEmpty).toList();
    if (normalized.isEmpty) {
      return const [XTypeGroup(label: 'Images', mimeTypes: ['image/*'])];
    }
    final mimeTypes = normalized.where((type) => !type.startsWith('.')).toList();
    final extensions = normalized
        .where((type) => type.startsWith('.') && type.length > 1)
        .map((type) => type.substring(1))
        .toList();
    return [XTypeGroup(label: 'Selected files', mimeTypes: mimeTypes, extensions: extensions)];
  }

  Future<void> _saveBackupFromWeb(String message) async {
    try {
      final decoded = jsonDecode(message);
      if (decoded is! Map<String, dynamic>) return;
      final fileName = _safeBackupFileName(decoded['fileName']);
      final content = decoded['content'];
      if (content is! String || content.isEmpty) return;
      final docs = await getApplicationDocumentsDirectory();
      final dir = Directory('${docs.path}${Platform.pathSeparator}GrowthRecordBackups');
      if (!await dir.exists()) await dir.create(recursive: true);
      final file = File('${dir.path}${Platform.pathSeparator}$fileName');
      await file.writeAsString(content);
    } catch (_) {
      // Web fallback download remains available when native backup writing fails.
    }
  }

  String _safeBackupFileName(Object? fileName) {
    final raw = fileName is String && fileName.trim().isNotEmpty ? fileName.trim() : 'growth_record_backup.json';
    final sanitized = raw.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
    return sanitized.endsWith('.json') ? sanitized : '$sanitized.json';
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
