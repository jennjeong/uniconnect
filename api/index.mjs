// Vercel runs the API as this one function (vercel.json sends /api/* here).
// It is the Express app compiled by `npm run build`; see backend/src/vercel.ts.
export { default } from "../backend/dist/vercel.js"
