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

  page.on('console', msg => {
    if (msg.type() === 'error') console.error('[browser]', msg.text());
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Wait up to 20s for sidebar spots to load
  console.log('Waiting for parking spots...');
  try {
    await page.waitForSelector('aside div button', {
      timeout: 20000,
    });
    console.log('Spots loaded');
  } catch {
    console.log('Spots did not appear — taking fallback screenshot');
    await page.screenshot({ path: 'C:/parkAI/screenshot_nav_fallback.png' });
    await browser.close();
    return;
  }

  // Take screenshot of loaded state (spots visible, no nav yet)
  await page.screenshot({ path: 'C:/parkAI/screenshot_spots_loaded.png' });
  console.log('Saved screenshot_spots_loaded.png');

  // Click the first spot in the sidebar
  const firstSpot = page.locator('aside div button').first();
  await firstSpot.click();
  await page.waitForTimeout(800);

  // Take screenshot of bottom sheet open
  await page.screenshot({ path: 'C:/parkAI/screenshot_bottomsheet.png' });
  console.log('Saved screenshot_bottomsheet.png');

  // Click the Navigate button
  const navBtn = page.locator('button', { hasText: 'Navigate' }).first();
  await navBtn.click();
  console.log('Clicked Navigate');

  // Wait for NavigationPanel to appear (look for "Navigating to" text)
  await page.waitForSelector('text=Navigating to', { timeout: 10000 });
  console.log('NavigationPanel appeared');

  // Wait a moment for route line to render
  await page.waitForTimeout(4000);

  // Final screenshot — should show route line + NavigationPanel
  await page.screenshot({ path: 'C:/parkAI/screenshot_nav_final.png' });
  console.log('Saved screenshot_nav_final.png');

  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
