// Vercel treats every file in /api as a serverless function. Since an Express
// app instance is itself a valid (req, res) => void handler, we can export it
// directly - no need for the `serverless-http` wrapper.
const app = require('../server/app');

module.exports = app;
