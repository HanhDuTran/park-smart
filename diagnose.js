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

  // Intercept the API response to see exactly what the frontend receives
  let apiResponse = null;
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/parking') && !resp.url().includes('prompt-park') && !resp.url().includes('confirm')) {
      try {
        const json = await resp.json();
        apiResponse = json;
      } catch {}
    }
  });

  page.on('console', msg => {
    console.log(`[${msg.type()}] ${msg.text()}`);
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Wait for data to load
  await page.waitForTimeout(12000);

  // Inspect the DOM for parking markers
  const streetMarkers = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-spot-type="street"]')).length;
  });
  const lotMarkers = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-spot-type="lot"]')).length;
  });
  const allMarkers = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-spot-type]')).map(el => el.dataset.spotType);
  });

  // Check sidebar buttons
  const sidebarButtons = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    if (!aside) return { count: 0, texts: [] };
    const btns = aside.querySelectorAll('button');
    return {
      count: btns.length,
      texts: Array.from(btns).slice(0, 5).map(b => b.textContent?.trim().slice(0, 50))
    };
  });

  // Check what spots are actually in the React state via sidebar text
  const sidebarText = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    return aside ? aside.textContent?.slice(0, 500) : 'no aside';
  });

  console.log('\n=== DIAGNOSTIC REPORT ===');
  console.log(`Street markers in DOM: ${streetMarkers}`);
  console.log(`Lot markers in DOM: ${lotMarkers}`);
  console.log(`All marker types: ${JSON.stringify(allMarkers)}`);
  console.log(`Sidebar buttons: ${sidebarButtons.count}`);
  console.log(`Sidebar button texts: ${JSON.stringify(sidebarButtons.texts)}`);
  console.log(`Sidebar text (first 500 chars): ${sidebarText}`);

  if (apiResponse) {
    const spots = apiResponse.spots || [];
    const streetCount = spots.filter(s => s.type === 'street').length;
    const lotCount = spots.filter(s => s.type === 'lot').length;
    console.log(`\nAPI response: ${spots.length} total spots (${streetCount} street, ${lotCount} lots)`);
    console.log('First 3 street spots:', JSON.stringify(spots.filter(s => s.type === 'street').slice(0, 3), null, 2));
  } else {
    console.log('\nNO API response captured');
  }

  await page.screenshot({ path: 'C:/parkAI/screenshot_debug.png' });
  console.log('\nSaved screenshot_debug.png');

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
