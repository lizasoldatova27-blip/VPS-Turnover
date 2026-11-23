// Entry point. On Vercel this file is the Express app (files in public/ are served automatically).
// Locally: DATABASE_URL=postgres://... node server.js
const express = require('express');
const path = require('path');
const api = require('./lib/app');

const app = express();
app.use(api);
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res, p) => { if (p.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => { if (err) res.status(500).send('index.html not found'); }));
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`VPS Turnover: http://localhost:${PORT}`));
}
