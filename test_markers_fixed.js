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

  const consoleLogs = [];
  page.on('console', msg => { if (!msg.text().includes('vite') && !msg.text().includes('GPU')) consoleLogs.push(`[${msg.type()}] ${msg.text()}`); });
  page.on('pageerror', err => consoleLogs.push(`[PAGEERROR] ${err.message}`));

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for sidebar to show spots
  await page.waitForFunction(
    () => {
      const a = document.querySelector('aside');
      return a && /\d+\s+spots/.test(a.textContent || '');
    },
    { timeout: 30000 }
  );

  // Give Mapbox style load + marker positioning time to settle
  await page.waitForTimeout(4000);

  const report = await page.evaluate(() => {
    const allMarkers = document.querySelectorAll('.mapboxgl-marker');
    const spotMarkers = document.querySelectorAll('[data-spot-type]');
    const userMarker = document.querySelector('.mapboxgl-marker:not([data-spot-type])');
    const userStyle = userMarker ? window.getComputedStyle(userMarker) : null;

    const details = Array.from(spotMarkers).slice(0, 6).map(el => {
      const outer = el.closest('.mapboxgl-marker') || el;
      const outerStyle = window.getComputedStyle(outer);
      const rect = outer.getBoundingClientRect();
      return {
        spotType: el.dataset.spotType,
        estimated: el.dataset.estimated,
        transform: outerStyle.transform,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        inViewport: rect.x > 0 && rect.y > 0 && rect.x < window.innerWidth && rect.y < window.innerHeight,
        opacity: outerStyle.opacity,
      };
    });

    // Count markers visible on screen (transform is NOT identity/zero)
    let visibleCount = 0;
    let wrongPositionCount = 0;
    for (const el of spotMarkers) {
      const outer = el.closest('.mapboxgl-marker') || el;
      const t = window.getComputedStyle(outer).transform;
      const rect = outer.getBoundingClientRect();
      if (t !== 'none' && !t.includes('matrix(1, 0, 0, 1, 0,') && rect.x > 10 && rect.y > 10) {
        visibleCount++;
      } else {
        wrongPositionCount++;
      }
    }

    return {
      totalMarkers: allMarkers.length,
      spotMarkerCount: spotMarkers.length,
      visibleCount,
      wrongPositionCount,
      userTransform: userStyle?.transform,
      sampleDetails: details,
    };
  });

  console.log(`\n=== MARKER FIX VERIFICATION ===`);
  console.log(`Total .mapboxgl-marker elements: ${report.totalMarkers}`);
  console.log(`Spot markers (data-spot-type): ${report.spotMarkerCount}`);
  console.log(`Markers at CORRECT position (on-screen): ${report.visibleCount}`);
  console.log(`Markers at WRONG position (at 0,0): ${report.wrongPositionCount}`);
  console.log(`User location transform: ${report.userTransform}`);
  console.log(`\nSample spot markers:`);
  report.sampleDetails.forEach((d, i) => {
    console.log(`  [${i}] type=${d.spotType} est=${d.estimated} transform=${d.transform}`);
    console.log(`       rect=(${d.rect.x},${d.rect.y}) ${d.rect.w}x${d.rect.h} inViewport=${d.inViewport} opacity=${d.opacity}`);
  });

  if (consoleLogs.filter(l => l.includes('error') || l.includes('Error')).length > 0) {
    console.log('\nErrors:');
    consoleLogs.filter(l => l.includes('error') || l.includes('Error')).forEach(l => console.log(' ', l));
  }

  await page.screenshot({ path: 'C:/parkAI/screenshot_markers_fixed.png', fullPage: false });
  console.log('\nScreenshot saved: C:/parkAI/screenshot_markers_fixed.png');

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
