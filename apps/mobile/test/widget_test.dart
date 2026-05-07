import 'package:flutter_test/flutter_test.dart';

import 'package:growth_record_mobile/main.dart';

void main() {
  testWidgets('shows native authentication gate', (WidgetTester tester) async {
    await tester.pumpWidget(const GrowthRecordApp());

    expect(find.text('园中月努力可视化系统'), findsOneWidget);
    expect(find.text('登录'), findsWidgets);
    expect(find.text('注册'), findsOneWidget);

    await tester.tap(find.text('注册'));
    await tester.pump();

    expect(find.text('邮箱'), findsOneWidget);
  });
}
