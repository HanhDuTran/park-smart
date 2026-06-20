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

  function measureNow() {
    return page.evaluate(() => {
      const map = (window).__PARKAI_MAP__;
      const els = Array.from(document.querySelectorAll('[data-test-lng]'));
      let maxAbsDx = 0, maxAbsDy = 0, n = 0;
      els.forEach((el) => {
        const lng = parseFloat(el.dataset.testLng);
        const lat = parseFloat(el.dataset.testLat);
        const rect = el.getBoundingClientRect();
        const actual = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        const p = map.project([lng, lat]);
        if (Math.abs(p.x) > 1e6 || Math.abs(p.y) > 1e6) return;
        maxAbsDx = Math.max(maxAbsDx, Math.abs(actual.x - p.x));
        maxAbsDy = Math.max(maxAbsDy, Math.abs(actual.y - p.y));
        n++;
      });
      return { zoom: map.getZoom(), n, maxAbsDx: +maxAbsDx.toFixed(2), maxAbsDy: +maxAbsDy.toFixed(2) };
    });
  }

  // Real mouse-wheel zoom over the map center, sampled mid-gesture (no settle wait).
  await page.mouse.move(720, 450);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -200); // scroll up = zoom in
    await page.waitForTimeout(60); // sample mid-gesture, well under any 200ms transition window
    const m = await measureNow();
    console.log(`wheel-zoom-in tick ${i}: zoom=${m.zoom.toFixed(2)} n=${m.n} maxAbsDx=${m.maxAbsDx} maxAbsDy=${m.maxAbsDy}`);
  }
  await page.waitForTimeout(300);
  console.log('settled:', JSON.stringify(await measureNow()));

  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 200); // scroll down = zoom out
    await page.waitForTimeout(60);
    const m = await measureNow();
    console.log(`wheel-zoom-out tick ${i}: zoom=${m.zoom.toFixed(2)} n=${m.n} maxAbsDx=${m.maxAbsDx} maxAbsDy=${m.maxAbsDy}`);
  }
  await page.waitForTimeout(300);
  console.log('settled:', JSON.stringify(await measureNow()));

  await page.screenshot({ path: 'C:/parkAI/verify_wheel_zoom_final.png' });
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
