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
  await page.waitForFunction(() => {
    const a = document.querySelector('aside');
    return a && /\d+\s+spots/.test(a.textContent || '');
  }, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => !!(window).__PARKAI_MAP__, { timeout: 10000 });

  const dump = await page.evaluate(() => {
    const map = (window).__PARKAI_MAP__;
    const els = Array.from(document.querySelectorAll('[data-test-lng]')).slice(0, 4);
    return els.map((el) => {
      const parent = el.parentElement;
      const grandparent = parent ? parent.parentElement : null;
      const rect = el.getBoundingClientRect();
      const prect = parent ? parent.getBoundingClientRect() : null;
      const lng = parseFloat(el.dataset.testLng);
      const lat = parseFloat(el.dataset.testLat);
      const proj = map.project([lng, lat]);
      return {
        lng, lat,
        proj,
        elTag: el.tagName, elClass: el.className,
        elRect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        elTransform: window.getComputedStyle(el).transform,
        elPosition: window.getComputedStyle(el).position,
        parentTag: parent ? parent.tagName : null,
        parentClass: parent ? parent.className : null,
        parentRect: prect,
        parentTransform: parent ? window.getComputedStyle(parent).transform : null,
        parentPosition: parent ? window.getComputedStyle(parent).position : null,
        grandparentTag: grandparent ? grandparent.tagName : null,
        grandparentClass: grandparent ? grandparent.className : null,
      };
    });
  });
  console.log(JSON.stringify(dump, null, 2));

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
