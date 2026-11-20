import { describe, expect, it } from "vitest"

import { exampleProgram, exampleProgramReport } from "../data/programs"
import { programReportCsv } from "./programReport"

describe("programReportCsv", () => {
  it("carries the same totals and per-school figures as the report", () => {
    const report = exampleProgramReport("2026-04")
    const lines = programReportCsv(exampleProgram("2026-04"), report, { sample: true }).replace(/^﻿/, "").split("\r\n")
    expect(lines).toContain(`매장 방문,${report.totals.visits}`)
    expect(lines).toContain(`방문 1건당 비용 (원),${report.totals.costPerVisit}`)
    expect(lines).toContain("데이터 구분,예시 데이터")
    const first = report.schools[0]
    const row = lines.find((line) => line.startsWith(`${first.school},${first.name},`))
    expect(row).toContain(`,${first.coupons},${first.visits},${first.venue},${first.sales},`)
  })
})
