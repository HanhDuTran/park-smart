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

  let apiData = null;
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/parking') && !resp.url().includes('/parking/')) {
      try { apiData = await resp.json(); } catch {}
    }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Wait for spots to load (Overpass can be slow)
  console.log('Waiting for spots...');
  await page.waitForTimeout(15000);

  // Count markers in DOM
  const counts = await page.evaluate(() => {
    const street = document.querySelectorAll('[data-spot-type="street"]').length;
    const streetEst = document.querySelectorAll('[data-spot-type="street"][data-estimated="true"]').length;
    const lots = document.querySelectorAll('[data-spot-type="lot"]').length;
    return { street, streetEst, lots };
  });

  console.log(`DOM markers: ${counts.street} street (${counts.streetEst} estimated) + ${counts.lots} lots`);

  if (apiData) {
    const real = apiData.spots.filter(s => s.type === 'street' && s.source === 'overpass').length;
    const est = apiData.spots.filter(s => s.source === 'estimated').length;
    const lots = apiData.spots.filter(s => s.type === 'lot').length;
    console.log(`API: total=${apiData.count} | real street=${real} | estimated=${est} | lots=${lots}`);
  }

  // Take wide shot showing marker density
  await page.screenshot({ path: 'C:/parkAI/screenshot_streets_wide.png' });
  console.log('Saved screenshot_streets_wide.png');

  // Click a street spot to verify bottom sheet
  const streetBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('aside div button'));
    const streetBtn = btns.find(b => b.textContent && b.textContent.includes('Street'));
    return streetBtn ? true : false;
  });
  console.log('Found street button in sidebar:', streetBtn);

  // Click first sidebar button then look for street spots
  const firstBtn = page.locator('aside div button').first();
  await firstBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'C:/parkAI/screenshot_spot_selected.png' });
  console.log('Saved screenshot_spot_selected.png');

  // Click one that's a street spot if available
  const streetSpotIdx = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('aside div button'));
    return btns.findIndex(b => b.textContent && b.textContent.includes('Street Parking'));
  });

  if (streetSpotIdx >= 0) {
    const streetSpotBtn = page.locator('aside div button').nth(streetSpotIdx);
    await streetSpotBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'C:/parkAI/screenshot_street_bottomsheet.png' });
    console.log(`Saved screenshot_street_bottomsheet.png (button index ${streetSpotIdx})`);
  }

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
