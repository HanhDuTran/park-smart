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

  const result = await page.evaluate(() => {
    const map = (window).__PARKAI_MAP__;
    const els = Array.from(document.querySelectorAll('[data-test-lng]')).slice(0, 4);

    const before = els.map((el) => {
      const rect = el.getBoundingClientRect();
      const lng = parseFloat(el.dataset.testLng);
      const lat = parseFloat(el.dataset.testLat);
      const p = map.project([lng, lat]);
      return {
        position: getComputedStyle(el).position,
        actual: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        expected: { x: p.x, y: p.y },
      };
    });

    // Hypothesis test: remove the 'relative' class from each wrapper and re-measure.
    els.forEach((el) => el.classList.remove('relative'));

    const after = els.map((el) => {
      const rect = el.getBoundingClientRect();
      const lng = parseFloat(el.dataset.testLng);
      const lat = parseFloat(el.dataset.testLat);
      const p = map.project([lng, lat]);
      return {
        position: getComputedStyle(el).position,
        actual: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        expected: { x: p.x, y: p.y },
      };
    });

    return { before, after };
  });

  console.log('=== BEFORE removing .relative class ===');
  result.before.forEach((s, i) => {
    const dx = (s.actual.x - s.expected.x).toFixed(2);
    const dy = (s.actual.y - s.expected.y).toFixed(2);
    console.log(`  marker[${i}] position=${s.position} delta=(${dx}, ${dy})`);
  });

  console.log('\n=== AFTER removing .relative class (hypothesis test) ===');
  result.after.forEach((s, i) => {
    const dx = (s.actual.x - s.expected.x).toFixed(2);
    const dy = (s.actual.y - s.expected.y).toFixed(2);
    console.log(`  marker[${i}] position=${s.position} delta=(${dx}, ${dy})`);
  });

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
