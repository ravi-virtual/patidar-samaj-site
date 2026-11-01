// Serverless entry for the backend Vercel project (Root Directory: backend). Every request is
// rewritten here (see backend/vercel.json) and Express routes it by path.
// The backend is compiled by `npm run build` during the Vercel build, so this file only loads
// plain JavaScript and never depends on Vercel's own TypeScript settings.
const app = require('../dist/src/app').default;
const { connectDb } = require('../dist/src/utils/dbConnect');

module.exports = async (req, res) => {
  await connectDb();
  app(req, res);
};
