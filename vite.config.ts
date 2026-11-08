import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import type {} from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Génère sw.js après le build : précache de tous les fichiers produits,
 * versionné par empreinte du contenu. Aucune donnée utilisateur n'est touchée.
 */
function serviceWorker(): Plugin {
  return {
    name: 'club74-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      // Les .woff (repli ancien navigateur) ne sont pas précachés : iOS lit le woff2.
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !f.endsWith('.woff'));
      const publicFiles = ['manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
      const hash = createHash('sha256');
      for (const f of files.sort()) {
        const c = bundle[f];
        hash.update(f);
        hash.update(c.type === 'chunk' ? c.code : typeof c.source === 'string' ? c.source : Buffer.from(c.source));
      }
      const version = hash.digest('hex').slice(0, 12);
      const tpl = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      const code = tpl
        .replace('__VERSION__', version)
        .replace('__ASSETS__', JSON.stringify(['./', ...files.filter((f) => f !== 'index.html'), ...publicFiles]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
