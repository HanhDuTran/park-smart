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

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    consoleLogs.push(`[PAGEERROR] ${err.message}`);
  });

  let apiData = null;
  page.on('response', async resp => {
    if (resp.url().includes('/api/parking') && !resp.url().includes('/parking/')) {
      try { apiData = await resp.json(); } catch {}
    }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Wait for sidebar spot count to show
  console.log('Waiting for sidebar to populate...');
  try {
    await page.waitForFunction(
      () => {
        const aside = document.querySelector('aside');
        return aside && aside.textContent && /\d+ spots? within range/.test(aside.textContent);
      },
      { timeout: 35000 }
    );
    console.log('Sidebar populated!');
  } catch(e) {
    console.log('Sidebar timeout:', e.message);
  }

  await page.waitForTimeout(3000); // let markers render

  // 1. Check sidebar text for spot count
  const sidebarText = await page.$eval('aside', el => el.textContent?.slice(0, 200));
  console.log('Sidebar text:', sidebarText);

  // 2. Look for mapboxgl-marker elements with data-spot-type
  const markerInfo = await page.evaluate(() => {
    // All mapbox markers
    const allMapboxMarkers = document.querySelectorAll('.mapboxgl-marker');
    // Our custom markers with data-spot-type
    const spotMarkers = document.querySelectorAll('[data-spot-type]');
    // Check visibility of first few
    const details = Array.from(spotMarkers).slice(0, 5).map(el => {
      const rect = el.getBoundingClientRect();
      const computed = window.getComputedStyle(el);
      const parent = el.closest('.mapboxgl-marker');
      const parentStyle = parent ? window.getComputedStyle(parent) : null;
      return {
        spotType: el.dataset.spotType,
        estimated: el.dataset.estimated,
        // Element's own rect
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        // Computed styles
        display: computed.display,
        visibility: computed.visibility,
        opacity: computed.opacity,
        zIndex: computed.zIndex,
        // Parent mapboxgl-marker styles
        parentTransform: parentStyle?.transform,
        parentDisplay: parentStyle?.display,
        parentVisibility: parentStyle?.visibility,
        parentOpacity: parentStyle?.opacity,
        // Is in viewport?
        inViewport: rect.x >= 0 && rect.y >= 0 && rect.x < window.innerWidth && rect.y < window.innerHeight,
      };
    });
    return {
      totalMapboxMarkers: allMapboxMarkers.length,
      totalSpotMarkers: spotMarkers.length,
      details,
    };
  });

  console.log('\n=== MARKER DIAGNOSTIC ===');
  console.log(`Total .mapboxgl-marker elements: ${markerInfo.totalMapboxMarkers}`);
  console.log(`Total [data-spot-type] elements: ${markerInfo.totalSpotMarkers}`);
  console.log('First 5 spot markers:');
  markerInfo.details.forEach((d, i) => {
    console.log(`  [${i}] type=${d.spotType} estimated=${d.estimated}`);
    console.log(`       rect: x=${d.rect.x.toFixed(0)}, y=${d.rect.y.toFixed(0)}, w=${d.rect.w.toFixed(0)}, h=${d.rect.h.toFixed(0)}`);
    console.log(`       visibility=${d.visibility} opacity=${d.opacity} display=${d.display} zIndex=${d.zIndex}`);
    console.log(`       parent: transform=${d.parentTransform} display=${d.parentDisplay} opacity=${d.parentOpacity}`);
    console.log(`       inViewport=${d.inViewport}`);
  });

  // 3. Check map container and canvas
  const mapInfo = await page.evaluate(() => {
    const canvas = document.querySelector('.mapboxgl-canvas');
    const container = document.querySelector('.mapboxgl-map');
    const markerContainer = document.querySelector('.mapboxgl-canvas-container');
    return {
      canvasExists: !!canvas,
      canvasSize: canvas ? { w: canvas.width, h: canvas.height } : null,
      containerExists: !!container,
      markerContainerExists: !!markerContainer,
      // Check the marker layer (markers go into mapboxgl-canvas-container sibling)
      markerLayerHTML: document.querySelector('.mapboxgl-canvas-container + div')?.innerHTML?.slice(0, 200),
    };
  });
  console.log('\n=== MAP CANVAS ===');
  console.log('Canvas exists:', mapInfo.canvasExists, 'size:', JSON.stringify(mapInfo.canvasSize));
  console.log('Map container exists:', mapInfo.containerExists);
  console.log('Marker layer HTML:', mapInfo.markerLayerHTML?.slice(0, 300));

  // 4. Check if spots actually got into React state (count from sidebar)
  const sidebarButtonCount = await page.evaluate(() =>
    document.querySelectorAll('aside div button').length
  );
  console.log('\nSidebar button count:', sidebarButtonCount);

  // 5. Check console logs for errors
  console.log('\n=== CONSOLE LOGS ===');
  consoleLogs.filter(l => !l.includes('vite') && !l.includes('GPU') && !l.includes('Download')).forEach(l => console.log(l));

  if (apiData) {
    console.log(`\nAPI data: ${apiData.count} spots`);
  }

  // Screenshot
  await page.screenshot({ path: 'C:/parkAI/debug_state.png', fullPage: false });
  console.log('\nSaved debug_state.png');

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
