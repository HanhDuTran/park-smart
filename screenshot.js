process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:\\playwright-browsers';
const playwright = require('C:/Users/Duhan/AppData/Roaming/npm/node_modules/playwright');

(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    geolocation: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
    permissions: ['geolocation'],
    viewport: { width: 1280, height: 800 }
  });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'C:/parkAI/screenshot_nav.png' });
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e.message); process.exit(1); });
