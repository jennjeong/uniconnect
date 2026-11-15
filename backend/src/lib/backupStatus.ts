import type { ErrorEntry } from "./errorLog.js"
import { backups, backupWhere } from "./storage.js"

// 운영자 콘솔(시스템)의 백업 상태: 최근 성공, 다음 예정, 지금 상태.
//
// 정기 백업(store.ts의 backUpNow)이 도는 방식:
// - "cron": Vercel. 요청 사이에 아무것도 돌지 않아서 vercel.json의 크론이 하루 두 번(UTC 시,
//   cronUtcHours) routes/cron.ts를 부르고, 그때 찍는다. Vercel 무료 요금제의 크론은 정한 시의
//   한 시간 안 어느 때에 돌 수 있어 graceMs를 넉넉히 둔다.
// - "hourly": 오래 떠 있는 서버(index.ts). 한 시간 타이머가 찍는다.
// - "none": 정기 백업이 없다(테스트의 createApp). 다음 예정을 알 수 없다.
// 그 밖에도 데이터를 저장할 때 한 시간에 한 번 이하로 찍는다(lib/storage.ts). 보관은 찍은
// 지 backups.keptHours(24)시간까지다.
export const cronUtcHours = [0, 6]

export const backupSchedule: { kind: "cron" | "hourly" | "none"; lastRunAt?: number } = {
  kind: process.env.VERCEL ? "cron" : "none",
}

const hourMs = 60 * 60 * 1000
const graceMs = { cron: hourMs, hourly: 15 * 60 * 1000 }

export type BackupState = "ok" | "delayed" | "failed" | "unknown" | "none"

// 크론이 도는 시각들 가운데 `now`의 앞뒤.
function cronTimes(now: number) {
  const day = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate())
  const times = [-1, 0, 1].flatMap((offset) => cronUtcHours.map((hour) => day + offset * 24 * hourMs + hour * hourMs)).sort((a, b) => a - b)
  return times
}

// `list`는 storage.listBackups()처럼 새것부터, 찍은 시각은 UTC 시("2026-11-14T06")다.
export function backupStatus(
  list: { hour: string }[],
  errors: ErrorEntry[],
  now = Date.now(),
  schedule = backupSchedule,
) {
  const lastSuccess = list[0] ? Date.parse(`${list[0].hour}:00:00.000Z`) : undefined
  const failure = errors
    .filter((entry) => entry.where === backupWhere && entry.source === "server")
    .sort((a, b) => b.at.localeCompare(a.at))[0]
  const lastFailure = failure ? Date.parse(failure.at) : undefined

  // 다음 예정과, 지금쯤이면 이미 찍혔어야 할 가장 최근의 정기 백업 시각.
  let next: number | undefined
  let expected: number | undefined
  if (schedule.kind === "cron") {
    const times = cronTimes(now)
    next = times.find((time) => time > now)
    expected = [...times].reverse().find((time) => time <= now - graceMs.cron)
  } else if (schedule.kind === "hourly" && schedule.lastRunAt !== undefined) {
    next = schedule.lastRunAt + hourMs
    expected = now - hourMs - graceMs.hourly
  }

  // 찍은 시각은 시 단위라서, 성공한 시(hour)보다 뒤에 난 실패를 마지막 시도의 실패로 본다.
  const failed = lastFailure !== undefined && (lastSuccess === undefined || lastFailure > lastSuccess)
  const hourOf = (time: number) => Math.floor(time / hourMs) * hourMs
  const late = expected !== undefined && (lastSuccess === undefined || lastSuccess < hourOf(expected))
  const state: BackupState = failed
    ? "failed"
    : late
      ? "delayed"
      : lastSuccess === undefined
        ? "none"
        : schedule.kind === "none"
          ? "unknown"
          : "ok"

  const iso = (time: number | undefined) => (time === undefined ? undefined : new Date(time).toISOString())
  return {
    state,
    lastSuccess: iso(lastSuccess),
    lastFailure: iso(lastFailure),
    next: iso(next),
    schedule: schedule.kind,
    cronUtcHours,
    keptHours: backups.keptHours,
  }
}
