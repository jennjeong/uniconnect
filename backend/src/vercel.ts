import { createApp } from "./app.js"
import { HttpError } from "./lib/errors.js"
import { loadDatabase } from "./store.js"

// API를 Vercel Function 하나로 돌린다(api/index.mjs가 요청을 여기로 넘기고,
// 페이지는 Vercel이 직접 정적 파일로 서빙한다. vercel.json 참고). 함수의
// 각 복사본은 첫 요청에서 Postgres(DATABASE_URL)의 데이터를 읽고, 실패하면
// 다음 요청에서 다시 시도한다. 알림은 index.ts의 타이머 대신 Vercel
// Cron(routes/cron.ts)이 보낸다.
let loading: Promise<unknown> | undefined

async function loaded() {
  loading ??= loadDatabase().catch((error: unknown) => {
    loading = undefined
    throw error
  })
  try {
    await loading
  } catch (error) {
    console.error(error)
    throw new HttpError(503, "데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")
  }
}

export default createApp({ loaded })
