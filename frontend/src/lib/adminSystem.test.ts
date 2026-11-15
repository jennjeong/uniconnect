import { describe, expect, test } from "vitest"

import { en } from "../i18n/en"
import {
  backupPolicy,
  backupStateLabel,
  cronCounts,
  cronOutcome,
  cronOutcomeLabel,
  limitRule,
  maintenanceEffects,
  sameMaintenance,
} from "./adminSystem"

// 운영자 콘솔 시스템 화면의 판단(pages/AdminMore.tsx의 SystemPanel).
describe("reminder runs", () => {
  test("tell a run with nothing to send from one whose mail failed", () => {
    expect(cronOutcome({ at: "", sent: 0, targets: 0, failed: 0, mail: true })).toBe("none")
    expect(cronOutcome({ at: "", sent: 3, targets: 3, failed: 0, mail: true })).toBe("done")
    expect(cronOutcome({ at: "", sent: 1, targets: 3, failed: 2, mail: true })).toBe("partial")
    expect(cronOutcome({ at: "", sent: 0, targets: 2, failed: 2, mail: true })).toBe("allFailed")
    expect(cronOutcome({ at: "", sent: 1, targets: 4, failed: 0, mail: true, error: true })).toBe("error")
    expect(cronOutcome({ at: "", sent: 2, targets: 2, failed: 0, mail: false })).toBe("noMail")
  })

  test("never call an older record with nothing sent a run with nothing to send", () => {
    expect(cronOutcome({ at: "", sent: 0 })).toBe("legacy")
    expect(cronOutcome({ at: "", sent: 4 })).toBe("legacy")
    expect(cronCounts({ at: "", sent: 0 })).toContain("기록되지 않았어요")
    expect(cronCounts({ at: "", sent: 4 })).toBe("4통 보냄 · 대상과 실패 수는 기록되지 않았어요")
    expect(cronCounts({ at: "", sent: 1, targets: 3, failed: 2, mail: true })).toBe("대상 3 · 성공 1 · 실패 2")
    expect(cronCounts({ at: "", sent: 0, targets: 0, failed: 0, mail: false })).toBe("대상 0")
  })
})

describe("request limits", () => {
  test("read in hours or minutes", () => {
    expect(limitRule(1440, 10)).toBe("24시간에 10회")
    expect(limitRule(60, 5)).toBe("1시간에 5회")
    expect(limitRule(15, 30)).toBe("15분에 30회")
    expect(limitRule(90, 3)).toBe("90분에 3회")
    expect(limitRule(720, 1_000_000)).toBe("12시간에 1,000,000회")
  })
})

describe("maintenance", () => {
  const normal = { on: false, message: "", blockSignups: false }
  test("is unchanged when the edits are put back", () => {
    expect(sameMaintenance(normal, { ...normal })).toBe(true)
    expect(sameMaintenance(normal, { ...normal, message: "  " })).toBe(true)
    expect(sameMaintenance(normal, { ...normal, on: true })).toBe(false)
  })

  test("says what members meet for each setting", () => {
    expect(maintenanceEffects({ ...normal, on: true }).join(" ")).toContain("503")
    expect(maintenanceEffects({ ...normal, blockSignups: true })[2]).toContain("가입 요청만")
    expect(maintenanceEffects(normal)[2]).toBe("신규 가입: 평소처럼 열려요.")
  })
})

describe("backup policy", () => {
  test("names the scheduled times and the 24 hours kept", () => {
    const lines = backupPolicy({ state: "ok", schedule: "cron", cronUtcHours: [0, 6], keptHours: 24 })
    expect(lines[0]).toMatch(/^정기 백업은 매일 .+, .+에 찍어요\.$/)
    expect(lines.at(-1)).toBe("찍은 지 24시간이 지난 백업은 지워요.")
  })
})

test("every label shown through t() has its English", () => {
  for (const label of [...Object.values(backupStateLabel), ...Object.values(cronOutcomeLabel)]) {
    expect(en[label], label).toBeTruthy()
  }
})
