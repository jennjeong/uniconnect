// 라우트 핸들러에서 던진다. 오류 미들웨어가 { error } JSON으로 바꾼다.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
