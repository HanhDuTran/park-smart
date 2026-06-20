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
  await page.waitForFunction(
    () => document.querySelectorAll('[data-test-lng]').length > 0,
    { timeout: 30000 }
  );
  await page.waitForTimeout(1000);

  async function measure(label) {
    const data = await page.evaluate(() => {
      const map = (window).__PARKAI_MAP__;
      const markerEls = Array.from(document.querySelectorAll('[data-test-lng]'));
      const samples = markerEls.slice(0, 4).map((el) => {
        const wrapper = el.closest('.mapboxgl-marker') || el;
        const lng = parseFloat(el.dataset.testLng);
        const lat = parseFloat(el.dataset.testLat);
        const cs = window.getComputedStyle(wrapper);
        const rect = wrapper.getBoundingClientRect();
        const actualCenter = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        const p = map.project([lng, lat]);
        return {
          spotType: el.dataset.spotType,
          transform: cs.transform,
          position: cs.position,
          actualCenter,
          expected: { x: p.x, y: p.y },
          deltaX: +(actualCenter.x - p.x).toFixed(2),
          deltaY: +(actualCenter.y - p.y).toFixed(2),
        };
      });
      return { zoom: map.getZoom(), samples };
    });
    console.log(`\n=== ${label} (zoom=${data.zoom.toFixed(2)}) ===`);
    data.samples.forEach((s, i) => {
      console.log(`  marker[${i}] type=${s.spotType} pos=${s.position} expected=(${s.expected.x.toFixed(1)},${s.expected.y.toFixed(1)}) actual=(${s.actualCenter.x.toFixed(1)},${s.actualCenter.y.toFixed(1)}) delta=(${s.deltaX}, ${s.deltaY})`);
    });
    return data;
  }

  // 1. Initial load at zoom 15
  await measure('INITIAL (zoom 15)');
  await page.screenshot({ path: 'C:/parkAI/zoom_drift_1_initial.png' });

  // 2. Programmatic zoom in to 17, measure IMMEDIATELY on moveend (no extra settle wait)
  await page.evaluate(() => {
    const map = (window).__PARKAI_MAP__;
    window.__moveEndFired = false;
    map.once('moveend', () => { window.__moveEndFired = true; });
    map.easeTo({ zoom: 17, duration: 600 });
  });
  await page.waitForFunction(() => (window).__moveEndFired === true, { timeout: 5000 });
  await measure('IMMEDIATELY AFTER ZOOM-IN TO 17 (right on moveend)');
  await page.screenshot({ path: 'C:/parkAI/zoom_drift_2_zoomed_in_immediate.png' });

  // wait past the 200ms CSS transition window to see if it later "catches up"
  await page.waitForTimeout(400);
  await measure('400ms AFTER moveend (zoom 17) - did it catch up?');
  await page.screenshot({ path: 'C:/parkAI/zoom_drift_3_zoomed_in_settled.png' });

  // 3. Zoom back out to 14
  await page.evaluate(() => {
    const map = (window).__PARKAI_MAP__;
    window.__moveEndFired = false;
    map.once('moveend', () => { window.__moveEndFired = true; });
    map.easeTo({ zoom: 14, duration: 600 });
  });
  await page.waitForFunction(() => (window).__moveEndFired === true, { timeout: 5000 });
  await measure('IMMEDIATELY AFTER ZOOM-OUT TO 14 (right on moveend)');
  await page.screenshot({ path: 'C:/parkAI/zoom_drift_4_zoomed_out_immediate.png' });

  await page.waitForTimeout(400);
  await measure('400ms AFTER moveend (zoom 14) - did it catch up?');
  await page.screenshot({ path: 'C:/parkAI/zoom_drift_5_zoomed_out_settled.png' });

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
