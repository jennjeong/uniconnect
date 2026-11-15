import { locale, t } from "../i18n"
import type { BackupStatus, CronRun } from "../types"

// 운영자 콘솔 시스템 화면(pages/AdminMore.tsx의 SystemPanel)의 문구와 판단.

// 이 브라우저의 시간대: "Asia/Seoul (UTC+9)". 콘솔의 시각은 모두 이 시간대로 보인다.
export function timeZoneLabel(now = new Date()) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const minutes = -now.getTimezoneOffset()
  const sign = minutes >= 0 ? "+" : "-"
  const hours = Math.floor(Math.abs(minutes) / 60)
  const rest = Math.abs(minutes) % 60
  return `${zone} (UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""})`
}

// UTC 시(0~23)를 이 브라우저의 시각 "09:00"으로.
export function localHour(utcHour: number) {
  const date = new Date(Date.UTC(2026, 0, 1, utcHour))
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false })
}

// 백업이 어떻게 도는지 한 줄: 정기 백업, 저장할 때의 백업, 보관 기간.
export function backupPolicy(status: BackupStatus) {
  const kept = t("최근 {count}개만 남기고 오래된 백업은 지워요.", { count: status.keptCount })
  const onSave = t("그 밖에도 데이터가 바뀌면 한 시간에 한 번까지 찍어요.")
  if (status.schedule === "cron") {
    return [t("정기 백업은 매일 {times}에 찍어요.", { times: status.cronUtcHours.map(localHour).join(", ") }), onSave, kept]
  }
  if (status.schedule === "hourly") return [t("정기 백업은 한 시간마다 찍어요."), kept]
  return [t("정기 백업이 없어요. 데이터가 바뀌면 한 시간에 한 번까지 찍어요."), kept]
}

export const backupStateLabel: Record<BackupStatus["state"], string> = {
  ok: "정상",
  delayed: "지연",
  failed: "실패",
  unknown: "확인할 수 없음",
  none: "아직 없음",
}

// 콘솔 배지의 색: up 초록, late 주황, down 빨강, 없으면 회색.
export const backupStateTone: Record<BackupStatus["state"], string> = {
  ok: "up",
  delayed: "late",
  failed: "down",
  unknown: "",
  none: "",
}

export type CronOutcome = "none" | "done" | "partial" | "allFailed" | "error" | "noMail" | "legacy"

// 실행 한 번의 결과. 대상 수(targets)가 없는 예전 기록은 보낸 수로만 말하고, 0통이라고 대상이
// 없었다고 하지 않는다.
export function cronOutcome(run: CronRun): CronOutcome {
  if (run.error) return "error"
  if (run.targets === undefined) return "legacy"
  if (run.targets === 0) return "none"
  if (run.mail === false) return "noMail"
  const failed = run.failed ?? 0
  if (failed === 0) return "done"
  return failed >= run.targets ? "allFailed" : "partial"
}

export const cronOutcomeLabel: Record<CronOutcome, string> = {
  none: "발송 대상 없음",
  done: "발송 완료",
  partial: "일부 실패",
  allFailed: "전체 실패",
  error: "실행 실패",
  noMail: "메일 설정 없음",
  legacy: "결과 구분 전 기록",
}

export const cronOutcomeTone: Record<CronOutcome, string> = {
  none: "",
  done: "up",
  partial: "late",
  allFailed: "down",
  error: "down",
  noMail: "late",
  legacy: "",
}

// 결과 옆의 건수 한 줄.
export function cronCounts(run: CronRun) {
  if (run.targets === undefined) {
    return run.sent > 0
      ? t("{sent}통 보냄 · 대상과 실패 수는 기록되지 않았어요", { sent: run.sent })
      : t("보낸 메일 없음 · 대상이 없었는지 실패했는지 기록되지 않았어요")
  }
  if (run.error) return t("대상 {targets} · 실패 전까지 {sent}통 보냄", { targets: run.targets, sent: run.sent })
  if (run.targets === 0) return t("대상 0")
  if (run.mail === false) return t("대상 {targets} · 메일 서비스가 없어 보내지 않았어요", { targets: run.targets })
  return t("대상 {targets} · 성공 {sent} · 실패 {failed}", { targets: run.targets, sent: run.sent, failed: run.failed ?? 0 })
}

// "1440분에 10번" → "24시간에 10회", "60분에 5번" → "1시간에 5회", "15분에 30번" → "15분에 30회".
export function limitRule(minutes: number, count: number) {
  const limit = count.toLocaleString(locale)
  if (minutes >= 60 && minutes % 60 === 0) return t("{hours}시간에 {limit}회", { hours: minutes / 60, limit })
  return t("{minutes}분에 {limit}회", { minutes, limit })
}

export type Maintenance = { on: boolean; message: string; blockSignups: boolean }

export const sameMaintenance = (a: Maintenance, b: Maintenance) =>
  a.on === b.on && a.blockSignups === b.blockSignups && a.message.trim() === b.message.trim()

// 이 설정이 회원에게 어떻게 보이는지, 서버(backend app.ts의 점검 미들웨어, routes/auth.ts의 가입)가
// 실제로 하는 대로.
export function maintenanceEffects(form: Maintenance) {
  if (form.on) {
    return [
      t("회원 화면: 모든 방문자와 회원에게 점검 안내가 화면을 덮어요. 운영자 콘솔은 그대로 열려요."),
      t("데이터 저장: 읽기와 이메일 로그인, 운영자 콘솔을 뺀 모든 저장 요청이 503으로 거절돼요. 현장 QR 체크인 페이지는 열리지만 기록이 저장되지 않아요."),
      t("신규 가입: 저장 요청이라 함께 막혀요."),
    ]
  }
  return [
    t("회원 화면: 평소처럼 열려요."),
    t("데이터 저장: 평소처럼 저장돼요."),
    form.blockSignups ? t("신규 가입: 가입 요청만 503으로 거절돼요. 인증번호 받기와 로그인은 그대로예요.") : t("신규 가입: 평소처럼 열려요."),
  ]
}
