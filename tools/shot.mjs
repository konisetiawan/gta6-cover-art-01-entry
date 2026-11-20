import { createRequire } from 'node:module';
import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/shot/node_modules/playwright');
const base = 'http://localhost:8765';
const output = resolve('screenshots');
mkdirSync(output, { recursive: true });
const shots = [];
const browser = await chromium.launch({ headless: true });
try {
  const cases = [
    { name: '01-app-loaded.jpg', url: '/?shot=editor', width: 1280, height: 800, editor: true },
    { name: '02-export-square.jpg', url: '/?shot=cover&layout=seven&grade=sunset&caption=PALM%20FEVER', width: 1080, height: 1080 },
    { name: '03-export-portrait.jpg', url: '/?shot=cover&layout=titleband&grade=neon&caption=COAST%20HEAT', width: 1024, height: 1280 },
    { name: '04-export-wide.jpg', url: '/?shot=cover&layout=diagonal&grade=golden&caption=LAST%20CALL', width: 1280, height: 720 }
  ];
  for (const shot of cases) {
    const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
    await page.goto(base + shot.url, { waitUntil: 'domcontentloaded' });
    if (shot.editor) {
      await page.waitForFunction(() => {
        const images = [...document.querySelectorAll('#thumbStrip .photo-thumb img')];
        return images.length === 8 && images.every((image) => image.complete && image.naturalWidth > 0);
      }, { timeout: 20_000 });
    } else {
      await page.waitForFunction(() => { const canvas = document.querySelector('#posterCanvas'); return canvas && canvas.width > 0 && canvas.height > 0; });
      await page.waitForTimeout(1500);
    }
    const path = resolve(output, shot.name);
    await page.screenshot({ path, type: 'jpeg', quality: 82 });
    let bytes = statSync(path).size;
    if (bytes > 256 * 1024) {
      await page.screenshot({ path, type: 'jpeg', quality: 70 });
      bytes = statSync(path).size;
      process.stdout.write(`${path} ${bytes} bytes (quality 70)\n`);
    } else process.stdout.write(`${path} ${bytes} bytes\n`);
    shots.push({ name: shot.name, bytes });
    await page.close();
  }
} finally {
  await browser.close();
}
process.stdout.write(JSON.stringify({ shots }) + '\n');
