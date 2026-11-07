import { waitUntil } from "@vercel/functions"

import { getDatabase, retryConflicts, saveDatabase } from "../store.js"
import type { Database, Measurement, SurveyCounts } from "../types.js"
import { todayInKorea } from "./dates.js"
import { checkInWindow, couponDays, eventOf, isDemoEvent, recordMetric } from "./measurements.js"
import { databaseSql, ensureTables, type Sql } from "./sql.js"

// Postgres에서 참여 기록과 현장 집계를 문서 밖에 둔다. 문서 하나를 스캔마다 쓰면
// 복사본끼리 부딪히고 문서 전체가 오가기 때문이다(docs/ARCHITECTURE.md). 참여 코드와
// 쿠폰은 행으로 있고, 스캔, 쿠폰, 방문, 설문은 한 문장으로 행과 집계 기록을 함께
// 쓴다. 쌓인 집계 기록은 몇 초마다 문서의 집계에 합쳐서, 집계를 읽는 코드는 문서만
// 본다. JSON 파일은 쓰는 쪽이 하나라 지금처럼 문서에 둔다.
export const passSql = () => databaseSql()

const numberOf = (rows: Record<string, unknown>[], key: string) => Number(rows[0]?.[key] ?? 0)

// 스캔 하나. 상한에 닿았으면 넣지 않는다. 앞선 기록 수와 넣었는지를 돌려준다.
export async function issuePass(sql: Sql, code: string, pass: string, limit: number) {
  await ensureTables(sql)
  const rows = await sql(
    `with before as (select count(*)::int as count from uniconnect_passes where code = $1),
     added as (insert into uniconnect_passes (code, pass) select $1, $2 from before where count < $3 returning pass),
     counted as (insert into uniconnect_counts (code, kind) select $1, 'scans' from added)
     select (select count from before) as before, (select count(*)::int from added) as added`,
    [code, pass, limit],
  )
  return { before: numberOf(rows, "before"), added: numberOf(rows, "added") === 1 }
}

export type PassState = { surveyed: boolean; coupons: { couponId: string; number: string; visited: boolean; issuedAt: string }[] }

export async function readPass(sql: Sql, code: string, pass: string): Promise<PassState | undefined> {
  await ensureTables(sql)
  const [row] = await sql("select surveyed from uniconnect_passes where code = $1 and pass = $2", [code, pass])
  if (!row) return undefined
  const coupons = await sql("select coupon_id, number, visited, issued_at from uniconnect_coupons where code = $1 and pass = $2", [code, pass])
  return {
    surveyed: Boolean(row.surveyed),
    coupons: coupons.map((item) => ({
      couponId: String(item.coupon_id),
      number: String(item.number),
      visited: Boolean(item.visited),
      issuedAt: new Date(String(item.issued_at)).toISOString(),
    })),
  }
}

// 쿠폰 하나를 준다. 같은 패스의 같은 쿠폰이 이미 있으면 주지 않는다. 번호가 우연히
// 겹쳐도 주지 않으니 부르는 쪽이 readPass로 가려 다시 부른다.
export async function issueCoupon(sql: Sql, code: string, pass: string, couponId: string, sponsorId: string | undefined, number: string) {
  await ensureTables(sql)
  const rows = await sql(
    `with added as (
       insert into uniconnect_coupons (code, number, pass, coupon_id)
       select $1, $2, $3, $4 where exists (select 1 from uniconnect_passes where code = $1 and pass = $3)
       on conflict do nothing returning number
     ),
     counted as (insert into uniconnect_counts (code, kind, sponsor_id) select $1, 'coupons', $5 from added)
     select (select count(*)::int from added) as added,
            (select count(*)::int from uniconnect_coupons where code = $1) as total`,
    [code, number, pass, couponId, sponsorId ?? null],
  )
  return { added: numberOf(rows, "added") === 1, total: numberOf(rows, "total") + 1 }
}

// 번호로 찾은 쿠폰의 방문을 확인한다. 어느 쿠폰인지까지 맞아야 하고, `validFrom`이 있으면
// 그 뒤에 발급된 것이어야 한다(상시 캠페인).
export async function markVisit(sql: Sql, code: string, number: string, couponId: string, sponsorId: string | undefined, validFrom?: Date) {
  await ensureTables(sql)
  const rows = await sql(
    `with marked as (
       update uniconnect_coupons set visited = true
       where code = $1 and number = $2 and coupon_id = $3 and not visited
         and ($5::timestamptz is null or issued_at >= $5::timestamptz) returning number
     ),
     counted as (insert into uniconnect_counts (code, kind, sponsor_id) select $1, 'visits', $4 from marked)
     select (select count(*)::int from marked) as marked,
            (select count(*)::int from uniconnect_coupons where code = $1 and visited) as visited`,
    [code, number, couponId, sponsorId ?? null, validFrom?.toISOString() ?? null],
  )
  return { marked: numberOf(rows, "marked") === 1, total: numberOf(rows, "visited") + 1 }
}

// 번호의 쿠폰이 어느 것인지. 없으면 undefined다.
export async function findCoupon(sql: Sql, code: string, number: string) {
  await ensureTables(sql)
  const [row] = await sql("select coupon_id, visited from uniconnect_coupons where code = $1 and number = $2", [code, number])
  return row ? { couponId: String(row.coupon_id), visited: Boolean(row.visited) } : undefined
}

// 설문은 패스마다 한 번이다. 패스 자체가 없는지는 readPass로 가린다.
export async function markSurveyed(sql: Sql, code: string, pass: string, answers: Record<string, string | undefined>) {
  await ensureTables(sql)
  const rows = await sql(
    `with marked as (
       update uniconnect_passes set surveyed = true where code = $1 and pass = $2 and not surveyed returning pass
     ),
     counted as (insert into uniconnect_counts (code, kind, answers) select $1, 'survey', $3 from marked)
     select count(*)::int as marked from marked`,
    [code, pass, JSON.stringify(answers)],
  )
  return numberOf(rows, "marked") === 1
}

// 협찬사가 처음 들어오면 행사의 쿠폰이 그 협찬사의 것이 된다(syncSponsors). 문서를
// 고치는 동기 코드에서 행을 고칠 수 없으므로, 쿠폰을 읽기 전에 여기서 옮긴다.
export async function settleEventCoupons(sql: Sql, measurement: Measurement) {
  if (!measurement.eventCouponsTo) return
  await ensureTables(sql)
  await sql("update uniconnect_coupons set coupon_id = $1 where code = $2 and coupon_id = 'event'", [measurement.eventCouponsTo, measurement.code])
}

// ---- 문서에 합치기

export function countSurvey(measurement: Measurement, answers: Record<string, string | undefined>) {
  const survey = (measurement.survey ??= { responses: 0, grade: {}, field: {}, visited: {} })
  survey.responses += 1
  for (const [key, value] of Object.entries(answers)) {
    if (!value) continue
    const counts = (survey[key as keyof Omit<SurveyCounts, "responses">] ??= {})
    counts[value] = (counts[value] ?? 0) + 1
  }
}

type CountRow = { id: string; code: string; kind: string; sponsorId?: string; answers?: string; at: Date }

function applyCount(database: Database, row: CountRow) {
  const measurement = database.measurements.find((item) => item.code === row.code)
  if (!measurement) return
  if (row.kind === "survey") return countSurvey(measurement, JSON.parse(row.answers ?? "{}"))
  const sponsor = row.sponsorId ? measurement.sponsors.find((item) => item.id === row.sponsorId) : undefined
  recordMetric(measurement, row.kind as "scans" | "coupons" | "visits", sponsor, 1, row.at)
}

const foldBatch = 2000
// 합치는 간격이다. 이 간격마다 문서를 한 번 쓴다.
export const folding = { everyMs: 5000 }
let checkedAt = 0

// 쌓인 기록을 문서에 합치고 지운다. 저장과 삭제는 한 번에 일어나지 않으므로, 읽은
// 기록의 id를 문서에 남겨(`foldedCounts`) 저장 뒤 삭제 전에 멈추거나 다른 복사본이
// 함께 읽어도 두 번 세지 않는다. 합친 건수를 돌려준다.
async function foldOnce(sql: Sql) {
  return retryConflicts(async () => {
    const rows = await sql(
      `select id::text as id, code, kind, sponsor_id, answers, at from uniconnect_counts order by id limit ${foldBatch}`,
    )
    const database = getDatabase()
    const settled = database.measurements.filter((item) => item.eventCouponsTo)
    if (rows.length === 0 && settled.length === 0) return 0
    for (const measurement of settled) {
      await settleEventCoupons(sql, measurement)
      delete measurement.eventCouponsTo
    }
    const done = new Set(database.foldedCounts ?? [])
    let applied = 0
    for (const row of rows) {
      if (done.has(String(row.id))) continue
      applyCount(database, {
        id: String(row.id),
        code: String(row.code),
        kind: String(row.kind),
        sponsorId: row.sponsor_id ? String(row.sponsor_id) : undefined,
        answers: row.answers ? String(row.answers) : undefined,
        at: new Date(String(row.at)),
      })
      applied += 1
    }
    const ids = rows.map((row) => String(row.id))
    database.foldedCounts = ids
    await saveDatabase()
    if (ids.length) await sql("delete from uniconnect_counts where id = any($1::bigint[])", [ids])
    return applied
  })
}

// 복사본 하나만, 간격마다 한 번 합친다. `force`는 간격과 관계없이 쌓인 것을 다 합친다.
export async function foldCounts({ force = false }: { force?: boolean } = {}) {
  const sql = passSql()
  if (!sql) return 0
  if (!force) {
    if (Date.now() - checkedAt < folding.everyMs) return 0
    checkedAt = Date.now()
  }
  await ensureTables(sql)
  if (!force) {
    const pending = await sql("select 1 from uniconnect_counts limit 1")
    if (pending.length === 0 && !getDatabase().measurements.some((item) => item.eventCouponsTo)) return 0
    const claimed = await sql(
      `insert into uniconnect_fold (id, at) values (1, now()) on conflict (id) do update set at = now()
       where uniconnect_fold.at < now() - make_interval(secs => $1::float) returning id`,
      [folding.everyMs / 1000],
    )
    if (claimed.length === 0) return 0
    return foldOnce(sql)
  }
  let total = 0
  for (;;) {
    const applied = await foldOnce(sql)
    total += applied
    if (applied < foldBatch) return total
  }
}

// 요청이 끝나는 것을 막지 않고 합친다. 실패하면 다음 번이 다시 한다.
export function foldInBackground() {
  const running = foldCounts().catch((error: Error) => console.error(`[passes] ${error.message}`))
  waitUntil(running)
}

// 문서에 남은 참여 기록을 행으로 옮긴다. 이전 버전의 복사본이 배포 중에 문서에 쓸 수
// 있어 요청마다 살핀다. 행을 먼저 넣고 문서를 비우므로 도중에 멈춰도 잃지 않는다.
export const hasDocumentPasses = (database: Database) => database.measurements.some((item) => Object.keys(item.passes).length > 0)

export async function movePassesToRows() {
  const sql = passSql()
  if (!sql || !hasDocumentPasses(getDatabase())) return
  await ensureTables(sql)
  await retryConflicts(async () => {
    const database = getDatabase()
    for (const measurement of database.measurements) {
      const passes = Object.entries(measurement.passes)
      if (passes.length === 0) continue
      const coupons = passes.flatMap(([pass, state]) =>
        [
          ...(state.coupon ? [{ couponId: "event", ...state }] : []),
          ...Object.entries(state.sponsors ?? {}).map(([couponId, item]) => ({ couponId, ...item })),
        ].map((item) => ({
          pass,
          coupon_id: item.couponId,
          // 번호를 따로 두기 전의 쿠폰이다. 번호 없이 받은 것으로 남는다.
          number: typeof item.coupon === "string" ? item.coupon : `legacy-${pass}-${item.couponId}`,
          visited: Boolean(item.visit),
        })),
      )
      await sql(
        `insert into uniconnect_passes (code, pass, surveyed)
         select $1, pass, surveyed from jsonb_to_recordset($2::jsonb) as item(pass text, surveyed boolean)
         on conflict do nothing`,
        [measurement.code, JSON.stringify(passes.map(([pass, state]) => ({ pass, surveyed: Boolean(state.surveyed) })))],
      )
      await sql(
        `insert into uniconnect_coupons (code, number, pass, coupon_id, visited)
         select $1, number, pass, coupon_id, visited
         from jsonb_to_recordset($2::jsonb) as item(number text, pass text, coupon_id text, visited boolean)
         on conflict do nothing`,
        [measurement.code, JSON.stringify(coupons)],
      )
      measurement.passes = {}
    }
    await saveDatabase()
  })
}

// 더는 필요 없는 행을 지운다(prunePasses와 같은 기준). 행사가 없어진 측정의 행도 함께
// 지운다. 지운 참여 기록 수를 돌려준다.
export async function prunePassRows(now = todayInKorea()) {
  const sql = passSql()
  if (!sql) return 0
  await ensureTables(sql)
  const database = getDatabase()
  let removed = 0
  const codes: string[] = []
  for (const measurement of database.measurements) {
    const event = eventOf(database, measurement)
    if (!event) continue
    codes.push(measurement.code)
    if (isDemoEvent(database, measurement)) continue
    // 상시 캠페인은 기록마다 발급하고 7일 뒤에 지운다. 쿠폰이 지워진 패스도 그때 함께 간다.
    if (measurement.alwaysOn) {
      await sql("delete from uniconnect_coupons where code = $1 and issued_at < now() - make_interval(days => $2::int)", [measurement.code, couponDays])
      removed += (
        await sql(
          `delete from uniconnect_passes as item where code = $1 and issued_at < now() - make_interval(days => $2::int)
           and not exists (select 1 from uniconnect_coupons as coupon where coupon.code = item.code and coupon.pass = item.pass)
           returning pass`,
          [measurement.code, couponDays],
        )
      ).length
      continue
    }
    const { end, visitsEnd } = checkInWindow(event)
    if (now <= end) continue
    if (now > visitsEnd) {
      await sql("delete from uniconnect_coupons where code = $1", [measurement.code])
      removed += (await sql("delete from uniconnect_passes where code = $1 returning pass", [measurement.code])).length
    } else {
      removed += (
        await sql(
          `delete from uniconnect_passes as item where code = $1
           and not exists (select 1 from uniconnect_coupons as coupon where coupon.code = item.code and coupon.pass = item.pass)
           returning pass`,
          [measurement.code],
        )
      ).length
    }
  }
  await sql("delete from uniconnect_coupons where code <> all($1::text[])", [codes])
  removed += (await sql("delete from uniconnect_passes where code <> all($1::text[]) returning pass", [codes])).length
  return removed
}
