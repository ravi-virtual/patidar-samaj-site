// Serverless entry for Vercel: /api/* is rewritten here (see vercel.json).
// The backend is compiled by `npm --prefix backend run build` during the Vercel build, so this
// file only loads plain JavaScript and never depends on Vercel's own TypeScript settings.
const app = require('../backend/dist/src/app').default;
const { connectDb } = require('../backend/dist/src/utils/dbConnect');

module.exports = async (req, res) => {
  await connectDb();
  app(req, res);
};
