import { getDatabase, retryConflicts, saveDatabase } from "../store.js"
import { disputeFolder, disputesOf } from "./disputes.js"
import { photos } from "./photos.js"

// 보관 기간(keepUntil)이 지난 분쟁을 지우고 지운 건수를 돌려준다. 지울 것이 없으면 저장하지
// 않는다. 증빙 폴더는 저장한 뒤 지운다. 크론(routes/cron.ts)과 오래 떠 있는 서버(index.ts)가 부른다.
export async function purgeDisputes(now = new Date()) {
  const gone = await retryConflicts(async () => {
    const database = getDatabase()
    const expired = disputesOf(database).filter((dispute) => dispute.keepUntil && dispute.keepUntil <= now.toISOString())
    if (expired.length === 0) return []
    database.disputes = disputesOf(database).filter((dispute) => !expired.includes(dispute))
    await saveDatabase()
    return expired.map((dispute) => disputeFolder(dispute.id))
  })
  if (gone.length) await photos().removeAll(gone)
  return gone.length
}
