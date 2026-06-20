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
  page.on('console', msg => { if (msg.type() === 'error') console.log('[CONSOLE ERROR]', msg.text()); });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-spot-type]').length > 0,
    { timeout: 30000 }
  );
  await page.waitForTimeout(1000);

  // --- Capture the spot list BEFORE searching, for an "area changed" check ---
  const beforeSpotIds = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-spot-type]')).length
  );
  console.log('Spot markers before search:', beforeSpotIds);

  // --- Type a real address into the search bar ---
  const input = page.locator('input[placeholder="Search for parking…"]');
  await input.click();
  await input.fill('Ferry Building San Francisco');

  // Wait for the dropdown with real results (debounce is 300ms + network).
  await page.waitForSelector('header >> text=Ferry Building', { timeout: 10000 });
  await page.waitForTimeout(300); // let any remaining suggestions settle
  await page.screenshot({ path: 'C:/parkAI/search_dropdown.png' });
  console.log('Screenshot saved: search_dropdown.png');

  const dropdownText = await page.evaluate(() => {
    const header = document.querySelector('header');
    return header ? header.innerText : '';
  });
  console.log('--- dropdown text snapshot ---');
  console.log(dropdownText);

  // --- Click the first result ---
  const firstResult = page.locator('header button', { hasText: 'Ferry Building' }).first();
  await firstResult.click();

  // Wait for the map to fly + parking data to refetch for the new area.
  await page.waitForFunction(() => !!(window).__PARKAI_MAP_TEST_HOOK__, { timeout: 1000 }).catch(() => {});
  await page.waitForTimeout(2200); // flyTo duration (1400ms) + refetch settle

  await page.screenshot({ path: 'C:/parkAI/search_after_select.png' });
  console.log('Screenshot saved: search_after_select.png');

  const inputValueAfter = await input.inputValue();
  console.log('Input value after selection:', inputValueAfter);

  const afterSpotCount = await page.evaluate(() =>
    document.querySelectorAll('[data-spot-type]').length
  );
  console.log('Spot markers after search selection:', afterSpotCount);

  // --- Find an estimated spot in the sidebar and open its card ---
  const estimatedCardOpened = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('aside button'));
    for (const btn of buttons) {
      if (btn.textContent && btn.textContent.includes('Est.')) {
        btn.click();
        return true;
      }
    }
    return false;
  });
  console.log('Found and clicked an estimated SpotCard:', estimatedCardOpened);

  if (estimatedCardOpened) {
    await page.waitForTimeout(600); // BottomSheet spring animation
    await page.screenshot({ path: 'C:/parkAI/estimated_spot_card.png' });
    console.log('Screenshot saved: estimated_spot_card.png');

    const sheetText = await page.evaluate(() => {
      const sheets = Array.from(document.querySelectorAll('div'));
      const sheet = sheets.find(d => d.textContent && d.textContent.includes('Estimated, not verified'));
      return sheet ? sheet.textContent : '(not found)';
    });
    console.log('BottomSheet disclaimer text found:', sheetText.includes('Estimated, not verified'));
  }

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
