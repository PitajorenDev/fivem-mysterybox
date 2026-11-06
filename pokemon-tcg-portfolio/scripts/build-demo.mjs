// Bouwt een demo van de app als één los HTML-bestand (zonder server):
//   npm run build:demo   ->   dist-demo/tcg-portfolio-demo.html
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('dist-demo');
await build({
  configFile: false,
  plugins: [react()],
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
    rollupOptions: { input: path.resolve('demo.html') },
  },
});

const assets = path.join(outDir, 'assets');
const files = fs.readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
const css = files.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');

const html = `<title>TCG Portfolio Demo</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
const out = path.join(outDir, 'tcg-portfolio-demo.html');
fs.writeFileSync(out, html);
fs.rmSync(assets, { recursive: true, force: true });
fs.rmSync(path.join(outDir, 'demo.html'), { force: true });
console.log(`Demo gebouwd: ${out} (${Math.round(html.length / 1024)} kB)`);
