// Local run: DATABASE_URL=postgres://... node server.js
const express = require('express');
const path = require('path');
const app = require('./lib/app');
const web = express();
web.use(app);
web.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res, p) => { if (p.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache'); } }));
const PORT = process.env.PORT || 3000;
web.listen(PORT, () => console.log(`VPS Turnover: http://localhost:${PORT}`));
