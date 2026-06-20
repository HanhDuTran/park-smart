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

  let apiData = null;
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/parking') && !resp.url().includes('/parking/')) {
      try { apiData = await resp.json(); } catch {}
    }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Wait longer — Overpass can take up to 20s
  console.log('Waiting 25s for Overpass response...');
  await page.waitForTimeout(25000);

  // Count DOM markers
  const counts = await page.evaluate(() => ({
    streetReal: document.querySelectorAll('[data-spot-type="street"]:not([data-estimated])').length,
    streetEst: document.querySelectorAll('[data-spot-type="street"][data-estimated="true"]').length,
    lots: document.querySelectorAll('[data-spot-type="lot"]').length,
  }));

  console.log(`DOM: real street=${counts.streetReal}, estimated=${counts.streetEst}, lots=${counts.lots}`);

  if (apiData) {
    const r = apiData.spots.filter(s => s.type==='street' && s.source==='overpass').length;
    const e = apiData.spots.filter(s => s.source==='estimated').length;
    const l = apiData.spots.filter(s => s.type==='lot').length;
    console.log(`API: total=${apiData.count} real=${r} estimated=${e} lots=${l}`);
  }

  await page.screenshot({ path: 'C:/parkAI/screenshot_all_markers.png' });
  console.log('Saved screenshot_all_markers.png');

  // Click a street parking spot in sidebar to show bottom sheet
  const streetIdx = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('aside div button'));
    return btns.findIndex(b => b.textContent?.includes('Street Parking'));
  });

  if (streetIdx >= 0) {
    await page.locator('aside div button').nth(streetIdx).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'C:/parkAI/screenshot_street_sheet.png' });
    console.log(`Street spot bottom sheet saved (sidebar index ${streetIdx})`);
  } else {
    console.log('No street spots found in sidebar yet');
  }

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
