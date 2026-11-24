import { randomUUID } from "node:crypto"

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

// 켜진 실험의 지금 회차, 알맞은 갈래만 센다. 맞지 않으면 아무것도 하지 않고 false.
// 숫자를 지우기 전에 문구를 본 브라우저의 전환이 새 숫자에 섞이지 않는다.
export function countExperiment(database: Database, key: unknown, variant: unknown, event: unknown, run: unknown) {
  const experiment = findExperiment(key)
  if (!experiment || !(experiment.variants as readonly string[]).includes(String(variant))) return false
  if (!(experimentEvents as readonly string[]).includes(String(event))) return false
  const record = database.experiments?.[experiment.key]
  if (!record?.on || !record.run || record.run !== run) return false
  const counts = (record.counts[String(variant)] ??= { seen: 0, converted: 0 })
  counts[event as ExperimentEvent] += 1
  return true
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
export function experimentView(database: Database, experiment: (typeof experimentList)[number]) {
  const record = database.experiments?.[experiment.key]
  const variants = experiment.variants.map((variant) => {
    const counts = record?.counts[variant] ?? { seen: 0, converted: 0 }
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

export const experimentsView = (database: Database) => experimentList.map((item) => experimentView(database, item))

export function switchExperiment(database: Database, key: string, on: boolean, now = new Date()) {
  const record = experimentRecord(database, key)
  if (record.on === on) return record
  record.on = on
  if (on) {
    // 멈췄다 다시 켜면 같은 회차를 이어 센다. 회차는 처음 켤 때와 숫자를 지울 때 바뀐다.
    record.run ??= randomUUID()
    record.startedAt = now.toISOString()
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
  return record
}
