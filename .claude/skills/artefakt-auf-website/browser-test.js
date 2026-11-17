// Testet eine Seite von riozma.ch lokal in Chromium, auch mit Supabase Realtime.
// Grund: In der Cloud-Sandbox kann Chromium keine Tunnel über den Proxy öffnen (ERR_TUNNEL_CONNECTION_FAILED).
// Darum: supabase-js aus node_modules ausliefern, Google Fonts abbrechen, WebSockets über Playwright weiterreichen.
//
// Vorbereitung (einmal pro Sitzung, im Scratchpad):
//   mkdir -p $SCRATCH/rt && cd $SCRATCH/rt && npm init -y && npm i @supabase/supabase-js@2
//   cd /home/user/riozma && python3 -m http.server 8765 --bind 127.0.0.1 &
// Aufruf:
//   SUPA_UMD=$SCRATCH/rt/node_modules/@supabase/supabase-js/dist/umd/supabase.js \
//   NODE_PATH=$(npm root -g) node browser-test.js /blubberbiss/ out.png
const { chromium } = require('playwright');
const fs = require('fs');

async function openPage(browser, path, viewport = { width: 1280, height: 720 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const umd = fs.readFileSync(process.env.SUPA_UMD, 'utf8');
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: umd }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.routeWebSocket(/supabase\.co/, ws => { ws.connectToServer(); });
  page.on('pageerror', e => console.log('pageerror:', e.message));
  await page.goto('http://127.0.0.1:8765' + path);
  return page;
}
module.exports = { openPage };

if (require.main === module) {
  (async () => {
    const browser = await chromium.launch();
    const page = await openPage(browser, process.argv[2] || '/', undefined);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: process.argv[3] || 'out.png' });
    await browser.close();
  })();
}
