// Local development entrypoint. On Vercel, api/index.js is used instead -
// this file is never invoked in production.
const dotenv = require('dotenv');
dotenv.config();

const app = require('./server/app');

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0',() => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 Smart Study Planner API Ready\n`);
});
