import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express"

import { conflictPause, conflictRetry, refreshDatabase, SaveConflict } from "../store.js"
import { reattachAccount } from "./session.js"

// 쓰기 요청이 다른 API 복사본에 밀려 저장이 되돌려지면(SaveConflict) 최신 데이터에서 핸들러를
// 처음부터 다시 한다. 데이터는 문서 하나라 서로 상관없는 두 쓰기도 동시에 오면 하나가 밀리는데,
// 그때마다 503으로 답하지 않게 한다(store.ts의 retryConflicts와 같은 방식).
//
// 핸들러가 지켜야 할 것: 마지막 저장 전에 메일, 결제, 외부 기록처럼 되돌릴 수 없는 일을 하지
// 않고(파일을 올렸으면 실패할 때 지운다), 저장은 한 번이며, 저장 전에 답하지 않는다. 그렇지 않은
// 라우터(운영자, 로그인, 결제, 현장, 크론, 팀 초대 메일)는 Router()를 그대로 쓴다. 핸들러 안의
// 요청 한도는 다시 할 때 한 번 더 센다.
export function retrying(handler: RequestHandler): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await handler(req, res, next)
      } catch (error) {
        if (!(error instanceof SaveConflict) || res.headersSent || attempt >= conflictRetry.attempts) throw error
        await conflictPause(attempt)
        await refreshDatabase({ force: true })
        reattachAccount(req)
      }
    }
  }
}

const writes = ["post", "put", "patch", "delete"] as const

// 쓰기(post, put, patch, delete)의 마지막 핸들러를 retrying으로 감싸는 Router다.
export function writeRouter() {
  const router = Router()
  for (const method of writes) {
    const register = router[method].bind(router) as (path: unknown, ...handlers: RequestHandler[]) => Router
    Object.assign(router, {
      [method]: (path: unknown, ...handlers: RequestHandler[]) =>
        register(path, ...handlers.slice(0, -1), ...handlers.slice(-1).map(retrying)),
    })
  }
  return router
}
