// Addresses the frontend has a screen for (frontend/src/lib/route.ts, and
// the event check-in page with its two venue pages). Anything else gets the
// frontend's 404 page with a real 404 status. Keep this in step with
// readView.
const appPaths = [
  /^\/$/,
  /^\/(matches|groups)(\/[^/]+)?\/?$/,
  /^\/(dashboard|offers|events|measurement|reports|inbox|campaigns|analytics)\/?$/,
  /^\/new\/?$/,
  /^\/edit\/[^/]+\/?$/,
  /^\/event\/[^/]+\/?$/,
  /^\/board(\/[^/]+)?\/?$/,
  /^\/me(\/edit)?\/?$/,
  /^\/messages(\/[^/]+)?\/?$/,
  /^\/faq\/?$/,
  /^\/(terms|privacy)\/?$/,
  /^\/admin\/?$/,
  /^\/council\/?$/,
  /^\/explore\/?$/,
  /^\/invite\/[\w-]+\/?$/,
  /^\/agreements(\/[^/]+)?\/?$/,
  /^\/insights\/[^/]+\/?$/,
  /^\/report\/[\w-]+\/?$/,
  /^\/ledger\/[\w-]+\/?$/,
  /^\/check-in\/[\w-]+(\/(staff|group))?\/?$/,
]

export const isAppPath = (pathname: string) => appPaths.some((pattern) => pattern.test(pathname))
