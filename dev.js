// Local run only (Vercel uses server.js directly): DATABASE_URL=postgres://... node dev.js
const app = require('./server');
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VPS Turnover: http://localhost:${PORT}`));
