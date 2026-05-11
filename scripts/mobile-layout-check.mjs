import path from 'node:path';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
});
const page = await context.newPage();
const fileUrl = 'file:///' + path.resolve('public/index.html').replace(/\\/g, '/');
await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const info = await page.evaluate(() => {
  const shell = document.querySelector('.shell');
  const bento = document.querySelector('.bento-grid');
  const shellStyle = shell ? getComputedStyle(shell) : null;
  const bentoStyle = bento ? getComputedStyle(bento) : null;
  return {
    innerWidth: window.innerWidth,
    shellWidth: shell ? shell.getBoundingClientRect().width : null,
    shellMaxWidth: shellStyle?.maxWidth ?? null,
    shellMinWidth: shellStyle?.minWidth ?? null,
    bentoDisplay: bentoStyle?.display ?? null,
    bentoCols: bentoStyle?.gridTemplateColumns ?? null,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
