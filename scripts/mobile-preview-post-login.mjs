import path from 'node:path';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
});
const page = await context.newPage();
const fileUrl = 'file:///' + path.resolve('public/index.html').replace(/\\/g, '/');
await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  if (typeof window.showAppState === 'function') {
    await window.showAppState();
  }
});
await page.waitForTimeout(1200);
await page.screenshot({ path: 'docs/mobile-preview-post-login-local.png', fullPage: true });
await browser.close();
console.log('OK docs/mobile-preview-post-login-local.png');
