// Renderiza o comercial quadro a quadro (Chromium + Playwright) e, opcionalmente, monta o MP4 com o áudio.
// Prévia:  node video/render.mjs --preview 2.4,6.2,12 --out <pasta>
// Completo: node video/render.mjs --frames <pasta> [--workers 4] [--from 0 --to 1440]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { start } from '../tools/serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const fps = 30, total = 48 * fps;
const server = await start(0);
const url = `http://localhost:${server.address().port}/video/compose.html`;
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(url); await page.evaluate(() => window.ready);
  return page;
}

if (arg('preview')) {
  const out = arg('out'); mkdirSync(out, { recursive: true });
  const page = await open();
  for (const t of arg('preview').split(',').map(Number)) {
    await page.evaluate((x) => window.renderFrame(x), t);
    await page.screenshot({ path: `${out}/p-${String(t).replace('.', '_')}.png` });
    console.log('prévia', t);
  }
} else {
  const dir = arg('frames'); mkdirSync(dir, { recursive: true });
  const workers = Number(arg('workers', 4)), from = Number(arg('from', 0)), to = Number(arg('to', total));
  let done = 0; const t0 = Date.now();
  const run = async (w) => {
    const page = await open();
    for (let f = from + w; f < to; f += workers) {
      await page.evaluate((x) => window.renderFrame(x), f / fps);
      await page.screenshot({ path: `${dir}/f${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 94 });
      if (++done % 60 === 0) console.log(`${done}/${to - from} quadros · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  };
  await Promise.all(Array.from({ length: workers }, (_, w) => run(w)));
  console.log('quadros prontos');
}
await browser.close(); server.close();
