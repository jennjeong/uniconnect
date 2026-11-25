import { randomUUID } from "node:crypto"

import { databaseSql, ensureTables } from "./sql.js"
import type { Database, ExperimentRecord } from "../types.js"

// A/B 테스트(#347). 화면의 문구를 두 가지로 나눠 보여 주고, 어느 쪽이 목표(가입)로
// 더 많이 이어졌는지 숫자로만 센다. 누가 어느 쪽을 봤는지는 남기지 않는다:
// 브라우저가 자기 안에서 무작위 번호로 갈래를 정하고(frontend/src/lib/experiments.ts),
// 서버는 실험 · 갈래 · 노출/전환의 횟수만 받는다. 실험 목록은 코드에 두고
// (frontend/src/data/experiments.ts와 같게, lists.sync.test.ts가 확인), 운영자는
// 콘솔에서 켜고 끄고 숫자를 지운다.

export type ExperimentGoal = "sign_up"

export const experimentList = [
  {
    key: "landing-entry",
    name: "소개 첫 화면의 시작 버튼 문구",
    goal: "sign_up" as ExperimentGoal,
    variants: ["A", "B"],
  },
] as const

export type ExperimentKey = (typeof experimentList)[number]["key"]

export const findExperiment = (key: unknown) => experimentList.find((item) => item.key === key)

export const experimentEvents = ["seen", "converted"] as const
export type ExperimentEvent = (typeof experimentEvents)[number]

export function experimentRecord(database: Database, key: string): ExperimentRecord {
  database.experiments ??= {}
  return (database.experiments[key] ??= { on: false, counts: {} })
}

// 지금 켜진 실험의 키와 회차. GET /api/site가 브라우저에 알린다.
export const runningExperiments = (database: Database): Record<string, string> =>
  Object.fromEntries(
    experimentList.flatMap((item) => {
      const record = database.experiments?.[item.key]
      return record?.on && record.run ? [[item.key, record.run]] : []
    }),
  )

type Hit = { key: string; run: string; variant: string; event: ExperimentEvent }
type Counts = Record<string, { seen: number; converted: number }>

// 켜진 실험의 지금 회차, 알맞은 갈래만 센다. 맞지 않으면 null.
// 숫자를 지우기 전에 문구를 본 브라우저의 전환이 새 숫자에 섞이지 않는다.
function experimentHit(database: Database, key: unknown, variant: unknown, event: unknown, run: unknown): Hit | null {
  const experiment = findExperiment(key)
  if (!experiment || !(experiment.variants as readonly string[]).includes(String(variant))) return null
  if (!(experimentEvents as readonly string[]).includes(String(event))) return null
  const record = database.experiments?.[experiment.key]
  if (!record?.on || !record.run || record.run !== run) return null
  return { key: experiment.key, run: record.run, variant: String(variant), event: event as ExperimentEvent }
}

function countInDocument(database: Database, hit: Hit) {
  const record = database.experiments![hit.key]
  const counts = (record.counts[hit.variant] ??= { seen: 0, converted: 0 })
  counts[hit.event] += 1
}

// 데이터 문서에 센다(데이터베이스 없이 돌 때). 저장은 부르는 쪽이 한다.
export function countExperiment(database: Database, key: unknown, variant: unknown, event: unknown, run: unknown) {
  const hit = experimentHit(database, key, variant, event, run)
  if (hit) countInDocument(database, hit)
  return Boolean(hit)
}

// 방문자가 보낸 노출 · 전환 하나를 센다. 데이터베이스가 있으면 uniconnect_experiment_counts에
// 한 문장으로 더한다. 방문마다 데이터 문서 전체를 저장하면 문서의 버전이 계속 올라, 같은 때
// 저장하는 회원의 요청이 충돌(SaveConflict)로 다시 돌거나 503을 받는다. 표에 따로 세면 문서를
// 건드리지 않고, 복사본들이 함께 세어도 잃지 않는다. "document"면 부르는 쪽이 저장한다.
export async function recordExperiment(database: Database, key: unknown, variant: unknown, event: unknown, run: unknown) {
  const hit = experimentHit(database, key, variant, event, run)
  if (!hit) return false
  const sql = databaseSql()
  if (!sql) {
    countInDocument(database, hit)
    return "document" as const
  }
  await ensureTables(sql)
  const seen = hit.event === "seen" ? 1 : 0
  await sql(
    `insert into uniconnect_experiment_counts (key, run, variant, seen, converted) values ($1, $2, $3, $4, $5)
     on conflict (key, run, variant) do update set seen = uniconnect_experiment_counts.seen + excluded.seen,
       converted = uniconnect_experiment_counts.converted + excluded.converted`,
    [hit.key, hit.run, hit.variant, seen, 1 - seen],
  )
  return "table" as const
}

// 표에 센 지금 회차의 숫자(실험 키 → 갈래 → 횟수). 데이터베이스가 없으면 비어 있다.
export async function experimentTableCounts(database: Database): Promise<Record<string, Counts>> {
  const sql = databaseSql()
  if (!sql) return {}
  await ensureTables(sql)
  const counted: Record<string, Counts> = {}
  for (const item of experimentList) {
    const run = database.experiments?.[item.key]?.run
    if (!run) continue
    const rows = await sql("select variant, seen, converted from uniconnect_experiment_counts where key = $1 and run = $2", [item.key, run])
    counted[item.key] = Object.fromEntries(rows.map((row) => [String(row.variant), { seen: Number(row.seen), converted: Number(row.converted) }]))
  }
  return counted
}

// 숫자를 지운 뒤 지난 회차의 표 행을 치운다. 콘솔은 지금 회차만 읽으므로 실패해도 숫자는 맞다.
export async function dropOldRuns(database: Database, key: string) {
  const sql = databaseSql()
  const run = database.experiments?.[key]?.run
  if (!sql || !run) return
  await ensureTables(sql)
  await sql("delete from uniconnect_experiment_counts where key = $1 and run <> $2", [key, run])
}

// 두 비율의 차이가 우연인지 보는 z 검정(양측). 한쪽이라도 노출이 30번 안 되거나, 전환이
// 노출보다 많아 숫자를 믿을 수 없으면 판정하지 않는다.
export function compareRates(a: { seen: number; converted: number }, b: { seen: number; converted: number }) {
  if (a.seen < 30 || b.seen < 30 || a.converted > a.seen || b.converted > b.seen) return { z: null, p: null }
  const pa = a.converted / a.seen
  const pb = b.converted / b.seen
  const pooled = (a.converted + b.converted) / (a.seen + b.seen)
  const error = Math.sqrt(pooled * (1 - pooled) * (1 / a.seen + 1 / b.seen))
  if (error === 0) return { z: 0, p: 1 }
  const z = (pb - pa) / error
  return { z: Math.round(z * 100) / 100, p: Math.round(2 * (1 - normalCdf(Math.abs(z))) * 1000) / 1000 }
}

// 표준정규분포의 누적분포(Abramowitz-Stegun 26.2.17 근사, 오차 1e-7 안쪽).
function normalCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * x)
  const density = Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI)
  const tail = density * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return 1 - tail
}

export type Verdict = "too-early" | "no-difference" | "b-wins" | "a-wins"

// 콘솔이 보여 주는 실험 하나의 결과.
// counted는 표에 센 숫자로, 문서에 센 숫자(데이터베이스 없이 센 것)에 더한다.
export function experimentView(database: Database, experiment: (typeof experimentList)[number], counted: Counts = {}) {
  const record = database.experiments?.[experiment.key]
  const variants = experiment.variants.map((variant) => {
    const inDocument = record?.counts[variant] ?? { seen: 0, converted: 0 }
    const inTable = counted[variant] ?? { seen: 0, converted: 0 }
    const counts = { seen: inDocument.seen + inTable.seen, converted: inDocument.converted + inTable.converted }
    return { variant, ...counts, rate: counts.seen ? Math.round((counts.converted / counts.seen) * 1000) / 10 : null }
  })
  const [a, b] = variants
  const { z, p } = compareRates(a, b)
  const verdict: Verdict = p === null ? "too-early" : p >= 0.05 ? "no-difference" : (z ?? 0) > 0 ? "b-wins" : "a-wins"
  return {
    key: experiment.key,
    name: experiment.name,
    goal: experiment.goal,
    on: Boolean(record?.on),
    startedAt: record?.startedAt,
    stoppedAt: record?.stoppedAt,
    variants,
    p,
    verdict,
  }
}

export async function experimentsView(database: Database) {
  const counted = await experimentTableCounts(database)
  return experimentList.map((item) => experimentView(database, item, counted[item.key]))
}

export function switchExperiment(database: Database, key: string, on: boolean, now = new Date()) {
  const record = experimentRecord(database, key)
  if (record.on === on) return record
  record.on = on
  if (on) {
    // 멈췄다 다시 켜면 같은 회차를 이어 센다. 회차는 처음 켤 때와 숫자를 지울 때 바뀐다.
    // 시작 시각은 그 회차가 처음 켜진 때다. 다시 켜도 그대로 두어, 콘솔이 이어 센 숫자를
    // 오늘 시작한 것처럼 보이지 않게 한다.
    record.run ??= randomUUID()
    record.startedAt ??= now.toISOString()
    delete record.stoppedAt
  } else record.stoppedAt = now.toISOString()
  return record
}

// 숫자를 처음부터 다시 센다(문구를 바꾼 뒤처럼). 켜져 있으면 시작 시각도 지금으로.
export function resetExperiment(database: Database, key: string, now = new Date()) {
  const record = experimentRecord(database, key)
  record.counts = {}
  record.run = randomUUID()
  if (record.on) record.startedAt = now.toISOString()
  else delete record.startedAt
  return record
}
