import { createApp } from "./app.js"
import { HttpError } from "./lib/errors.js"
import { loadDatabase } from "./store.js"

// The API as one Vercel Function (api/index.mjs hands requests here; the
// pages are static files Vercel serves itself, see vercel.json). Each copy
// of the function reads the data from Postgres (DATABASE_URL) on its first
// request, trying again on the next one if that failed. Reminders come from
// Vercel Cron (routes/cron.ts) instead of index.ts's timer.
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
