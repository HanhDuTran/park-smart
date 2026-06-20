process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:\\playwright-browsers';
const playwright = require('C:/Users/Duhan/AppData/Roaming/npm/node_modules/playwright');

(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    geolocation: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
    permissions: ['geolocation'],
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  page.on('pageerror', err => console.log('[PAGEERROR]', err.message));

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!(window).__PARKAI_MAP__, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-test-lng]').length > 0, { timeout: 30000 });
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const map = (window).__PARKAI_MAP__;
    window.__moveEndFired = false;
    map.once('moveend', () => { window.__moveEndFired = true; });
    map.easeTo({ zoom: 17, duration: 600 });
  });
  await page.waitForFunction(() => (window).__moveEndFired === true, { timeout: 5000 });

  const detail = await page.evaluate(() => {
    const map = (window).__PARKAI_MAP__;
    const els = Array.from(document.querySelectorAll('[data-test-lng]'));
    return [318, 325].map((i) => {
      const el = els[i];
      if (!el) return { i, error: 'no element at this index' };
      const lngRaw = el.dataset.testLng;
      const latRaw = el.dataset.testLat;
      const lng = parseFloat(lngRaw);
      const lat = parseFloat(latRaw);
      const rect = el.getBoundingClientRect();
      let proj = null, projError = null;
      try { proj = map.project([lng, lat]); } catch (e) { projError = e.message; }
      return {
        i, lngRaw, latRaw, lng, lat,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        proj, projError,
        outerHTML: el.outerHTML.slice(0, 300),
      };
    });
  });
  console.log(JSON.stringify(detail, null, 2));

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
