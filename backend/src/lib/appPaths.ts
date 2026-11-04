// 프런트엔드에 화면이 있는 주소(frontend/src/lib/route.ts와 행사 체크인
// 페이지와 그 행사장 페이지 둘). 그 밖의 주소는 프런트엔드의 404 페이지를
// 실제 404 상태로 받는다. readView와 맞춰 둔다.
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
