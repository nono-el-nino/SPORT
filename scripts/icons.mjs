// Génère les icônes PNG à partir d'un rendu HTML avec la vraie police Alumni Sans.
// Usage : node scripts/icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, writeFileSync } from 'node:fs';

const font = readFileSync(new URL('../node_modules/@fontsource/alumni-sans/files/alumni-sans-latin-900-normal.woff2', import.meta.url)).toString('base64');

const html = (size, pad) => `<!doctype html><html><head><style>
@font-face{font-family:A;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:900}
html,body{margin:0;width:${size}px;height:${size}px;background:#164E9F}
.c{position:relative;width:100%;height:100%;overflow:hidden;background:#164E9F}
.n{position:absolute;left:0;right:0;top:${50 - 2}%;transform:translateY(-50%);text-align:center;font-family:A;font-weight:900;font-size:${size * (pad ? 0.5 : 0.64)}px;line-height:1;color:#F2EBD9;letter-spacing:-0.01em}
.l{position:absolute;left:${pad ? 22 : 12}%;right:${pad ? 22 : 12}%;bottom:${pad ? 24 : 14}%;height:${size * 0.075}px;background:repeating-linear-gradient(180deg,#D54D38 0 ${size * 0.016}px,transparent ${size * 0.016}px ${size * 0.03}px)}
</style></head><body><div class="c"><div class="n">74</div><div class="l"></div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size, pad] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html(size, pad));
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), await page.screenshot({ type: 'png' }));
}
await browser.close();
