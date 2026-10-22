// Addresses the frontend has a screen for (frontend/src/lib/route.ts, and
// the event check-in page). Anything else gets the frontend's 404 page with
// a real 404 status. Keep this in step with readView.
const appPaths = [
  /^\/$/,
  /^\/(matches|groups)(\/[^/]+)?\/?$/,
  /^\/(events|measurement|reports|inbox|campaigns|analytics)\/?$/,
  /^\/new\/?$/,
  /^\/me(\/edit)?\/?$/,
  /^\/messages(\/[^/]+)?\/?$/,
  /^\/check-in\/[\w-]+\/?$/,
]

export const isAppPath = (pathname: string) => appPaths.some((pattern) => pattern.test(pathname))
