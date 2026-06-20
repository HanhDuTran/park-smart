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

  async function measureAll(label) {
    const data = await page.evaluate(() => {
      const map = (window).__PARKAI_MAP__;
      const els = Array.from(document.querySelectorAll('[data-test-lng]'));
      let maxAbsDx = 0, maxAbsDy = 0, count = 0, offHorizonCount = 0;
      const worst = [];
      els.forEach((el, i) => {
        const lng = parseFloat(el.dataset.testLng);
        const lat = parseFloat(el.dataset.testLat);
        const rect = el.getBoundingClientRect();
        const actual = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        const p = map.project([lng, lat]);
        // Mapbox uses a huge float sentinel for points beyond the horizon in a
        // pitched view (not visible / not really projectable) - skip those, they
        // are not a real on-screen position to compare against.
        if (Math.abs(p.x) > 1e6 || Math.abs(p.y) > 1e6) { offHorizonCount++; return; }
        const dx = actual.x - p.x;
        const dy = actual.y - p.y;
        maxAbsDx = Math.max(maxAbsDx, Math.abs(dx));
        maxAbsDy = Math.max(maxAbsDy, Math.abs(dy));
        count++;
        worst.push({ i, dx: +dx.toFixed(2), dy: +dy.toFixed(2) });
      });
      worst.sort((a, b) => (Math.abs(b.dx) + Math.abs(b.dy)) - (Math.abs(a.dx) + Math.abs(a.dy)));
      return { zoom: map.getZoom(), count, offHorizonCount, maxAbsDx: +maxAbsDx.toFixed(2), maxAbsDy: +maxAbsDy.toFixed(2), top5Worst: worst.slice(0, 5) };
    });
    console.log(`\n=== ${label} (zoom=${data.zoom.toFixed(2)}, markers=${data.count}, offHorizon=${data.offHorizonCount}) ===`);
    console.log(`  max |deltaX| = ${data.maxAbsDx}px, max |deltaY| = ${data.maxAbsDy}px across ALL markers`);
    console.log(`  worst 5: ${JSON.stringify(data.top5Worst)}`);
    return data;
  }

  await measureAll('INITIAL LOAD (zoom 15)');
  await page.screenshot({ path: 'C:/parkAI/verify_zoom15.png' });

  await page.evaluate(() => {
    const map = (window).__PARKAI_MAP__;
    window.__moveEndFired = false;
    map.once('moveend', () => { window.__moveEndFired = true; });
    map.easeTo({ zoom: 17, duration: 600 });
  });
  await page.waitForFunction(() => (window).__moveEndFired === true, { timeout: 5000 });
  await measureAll('ZOOM 17 (right on moveend, no extra wait)');
  await page.screenshot({ path: 'C:/parkAI/verify_zoom17.png' });

  await page.evaluate(() => {
    const map = (window).__PARKAI_MAP__;
    window.__moveEndFired = false;
    map.once('moveend', () => { window.__moveEndFired = true; });
    map.easeTo({ zoom: 14, duration: 600 });
  });
  await page.waitForFunction(() => (window).__moveEndFired === true, { timeout: 5000 });
  await measureAll('BACK TO ZOOM 14 (right on moveend, no extra wait)');
  await page.screenshot({ path: 'C:/parkAI/verify_zoom14_back.png' });

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
