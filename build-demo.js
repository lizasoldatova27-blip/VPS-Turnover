// Собирает демо-версию в один HTML-файл (без сервера): node build-demo.js
const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');
html = html.replace(/<link rel="(manifest|apple-touch-icon|icon)"[^>]*>\n/g, '');
const js = (f) => fs.readFileSync(f, 'utf8').replace(/<\/script/g, '<\\/script');
html = html.replace('<script src="/app.js"></script>', `<script>window.VPS_DEMO=true;window.VPS_LOGO='data:image/png;base64,${fs.readFileSync('public/logo.png').toString('base64')}';window.VPS_SEED=${JSON.stringify(JSON.parse(fs.readFileSync('seed.json', 'utf8')))};</script>
<script>${js('public/demo.js')}</script>
<script>${js('public/app.js')}</script>`);
html = html.replace('<title>VPS Turnover</title>', '<title>VPS Turnover — demo</title>');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/demo.html', html);
console.log('dist/demo.html', html.length);
