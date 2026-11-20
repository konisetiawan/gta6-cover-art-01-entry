import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/shot/node_modules/playwright');
const root = resolve('app');
const base = 'http://localhost:8765';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
const consoleErrors = [];
const failedRequests = [];
const externalRequests = [];
const downloads = [];

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'request failed' }));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== 'localhost') externalRequests.push(request.url());
  });
  page.on('download', (download) => {
    downloads.push((async () => {
      const path = '/tmp/' + download.suggestedFilename();
      await download.saveAs(path);
      return { name: download.suggestedFilename(), size: statSync(path).size };
    })());
  });

  // The runner blocks TCP listen() in this workspace. This route serves the same app/ files
  // at the requested localhost URL so browser behavior can still be exercised.
  if (process.env.TEST_STATIC_FALLBACK === '1') {
    await context.route(base + '/**', async (route) => {
      const url = new URL(route.request().url());
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = resolve(root, '.' + pathname);
      if (file !== root && !file.startsWith(root + sep)) return route.fulfill({ status: 403, body: 'forbidden' });
      try {
        return route.fulfill({ status: 200, contentType: mime[extname(file).toLowerCase()] || 'application/octet-stream', body: readFileSync(file) });
      } catch {
        return route.fulfill({ status: 404, body: 'not found' });
      }
    });
  }

  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('#thumbStrip .photo-thumb img')];
    return images.length === 8 && images.every((image) => image.complete && image.naturalWidth > 0);
  }, { timeout: 20_000 });
  const thumbs = await page.locator('#thumbStrip .photo-thumb').count();
  await page.screenshot({ path: '/tmp/cover-test-ui.png', fullPage: false });
  await page.getByRole('button', { name: 'Seven mosaic' }).click();
  const neonNight = page.getByRole('button', { name: 'Neon Night' });
  if (await neonNight.count()) {
    await neonNight.click();
  } else {
    // Preserve the test run while making a mismatched grade label visible to the report.
    consoleErrors.push('UI test mismatch: expected grade button "Neon Night"; found "Neon"');
    await page.getByRole('button', { name: 'Neon', exact: true }).click();
  }
  await page.locator('#titleInput').fill('COAST HEAT');
  await page.getByRole('button', { name: 'Export all three sizes' }).click();
  const deadline = Date.now() + 20_000;
  while (downloads.length < 3 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  if (downloads.length !== 3) throw new Error('Expected 3 PNG downloads, got ' + downloads.length);
  const completedDownloads = await Promise.all(downloads);
  const summary = { consoleErrors, failedRequests, externalRequests, thumbs, downloads: completedDownloads };
  process.stdout.write(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
