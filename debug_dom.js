process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:\\playwright-browsers';
const playwright = require('C:/Users/Duhan/AppData/Roaming/npm/node_modules/playwright');

(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    geolocation: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
    permissions: ['geolocation'],
    viewport: { width: 1440, height: 900 }
  });
  const page = await ctx.newPage();

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 20000 });

  await page.waitForFunction(
    () => { const a = document.querySelector('aside'); return a && /\d+ spots/.test(a.textContent||''); },
    { timeout: 35000 }
  );
  await page.waitForTimeout(2000);

  const report = await page.evaluate(() => {
    // ---- 1. User location marker
    const userMarker = document.querySelector('.mapboxgl-marker:not([data-spot-type])');
    const userRect = userMarker?.getBoundingClientRect();
    const userStyle = userMarker ? window.getComputedStyle(userMarker) : null;

    // ---- 2. First spot marker
    const spotMarker = document.querySelector('[data-spot-type]');
    const spotRect = spotMarker?.getBoundingClientRect();
    const spotStyle = spotMarker ? window.getComputedStyle(spotMarker) : null;

    // ---- 3. Outer HTML of first spot marker (truncated)
    const spotHTML = spotMarker?.outerHTML?.slice(0, 400);

    // ---- 4. Canvas container structure
    const canvasContainer = document.querySelector('.mapboxgl-canvas-container');
    const canvasContainerStyle = canvasContainer ? window.getComputedStyle(canvasContainer) : null;

    // ---- 5. What contains the spot marker?
    const spotParents = [];
    let el = spotMarker?.parentElement;
    let depth = 0;
    while (el && depth < 6) {
      const s = window.getComputedStyle(el);
      spotParents.push({
        tag: el.tagName,
        id: el.id,
        classList: el.className?.slice(0, 80),
        position: s.position,
        display: s.display,
        overflow: s.overflow,
        rect: { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }
      });
      el = el.parentElement;
      depth++;
    }

    // ---- 6. Check spot marker's computed position
    return {
      userMarker: userMarker ? {
        rect: { x: userRect.x, y: userRect.y, w: userRect.width, h: userRect.height },
        position: userStyle.position,
        transform: userStyle.transform,
        display: userStyle.display,
        classList: userMarker.className?.slice(0, 120),
      } : null,
      spotMarker: spotMarker ? {
        rect: { x: spotRect.x, y: spotRect.y, w: spotRect.width, h: spotRect.height },
        position: spotStyle.position,
        transform: spotStyle.transform,
        display: spotStyle.display,
        classList: spotMarker.className?.slice(0, 120),
        outerHTML: spotHTML,
      } : null,
      canvasContainer: canvasContainer ? {
        position: canvasContainerStyle.position,
        display: canvasContainerStyle.display,
        overflow: canvasContainerStyle.overflow,
        rect: { x: canvasContainer.getBoundingClientRect().x, y: canvasContainer.getBoundingClientRect().y, w: canvasContainer.getBoundingClientRect().width, h: canvasContainer.getBoundingClientRect().height },
        childCount: canvasContainer.children.length,
      } : null,
      spotParents,
    };
  });

  console.log('=== USER LOCATION MARKER ===');
  console.log(JSON.stringify(report.userMarker, null, 2));

  console.log('\n=== FIRST SPOT MARKER ===');
  console.log(JSON.stringify(report.spotMarker, null, 2));

  console.log('\n=== CANVAS CONTAINER ===');
  console.log(JSON.stringify(report.canvasContainer, null, 2));

  console.log('\n=== SPOT MARKER PARENT CHAIN ===');
  report.spotParents.forEach((p, i) => console.log(`  [${i}] ${p.tag}.${p.classList?.slice(0,60)} | pos=${p.position} | rect=(${p.rect.x},${p.rect.y},${p.rect.w}x${p.rect.h})`));

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
