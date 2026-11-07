import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { expect, test, type Page } from "@playwright/test"

// 반응형 점검이다(docs/RESPONSIVE_QA_REPORT.md). 주요 화면을 휴대폰부터 넓은
// 화면까지 열어, 레이아웃이 깨지는 곳을 잰다.
// - 막는 것(실패): 가로 스크롤, 휴대폰에서 16px보다 작은 입력창 글자(iOS가 확대한다),
//   화면 밖으로 나간 팝업.
// - 알리는 것(출력과 test-results/responsive.json): 잘린 글, 44px보다 작은 터치 영역,
//   12px보다 작은 글자.
// RESPONSIVE_SIZES=375x812,1280x800 처럼 크기를 줄여 돌릴 수 있다.

const allSizes = [
  [320, 700],
  [360, 800],
  [375, 812],
  [390, 844],
  [393, 852],
  [412, 915],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const

const sizes = process.env.RESPONSIVE_SIZES
  ? process.env.RESPONSIVE_SIZES.split(",").map((size) => size.split("x").map(Number) as [number, number])
  : allSizes

// 방문자가 볼 수 있는 화면(예시 데이터)과 브랜드 쪽 화면이다.
const visitorPages = [
  "/",
  "/dashboard",
  "/matches",
  "/matches/afternoon-coffee",
  "/groups?role=브랜드",
  "/events",
  "/event/event-muse-concert",
  "/measurement",
  "/reports",
  "/analytics?role=브랜드",
  "/inbox?role=브랜드",
  "/campaigns?role=브랜드",
  "/board",
  "/explore",
  "/agreements",
  "/plans",
  "/faq",
  "/terms",
  "/check-in/20261012",
  "/check-in/20261012/staff",
  "/admin",
  "/no-such-page",
]

type Finding = { page: string; size: string; kind: string; detail: string }
const findings: Finding[] = []

// 페이지 안에서 재는 것. 숨은 것, 화면을 읽는 프로그램용 글, PDF용 화면은 뺀다.
async function measure(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return false
      const cs = getComputedStyle(el)
      return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05
    }
    const skip = (el: Element) => !!el.closest(".sr-only, .pdf-export, .card-export, [aria-hidden='true'], svg")
    const name = (el: Element) => {
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24)
      return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} «${text}»`
    }
    // 가로로 스크롤되는 상자 안의 것은 그 상자가 맡는다.
    const inScroller = (el: Element) => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const o = getComputedStyle(n).overflowX
        if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true
      }
      return false
    }

    const overflow = document.documentElement.scrollWidth - vw
    const offscreen: string[] = []
    const clipped: string[] = []
    const smallText: string[] = []
    const smallTargets: string[] = []
    const smallInputs: string[] = []

    for (const el of document.querySelectorAll("body *")) {
      if (skip(el) || !visible(el)) continue
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if ((r.right > vw + 1 || r.left < -1) && !inScroller(el) && cs.position !== "fixed") offscreen.push(name(el))

      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())
      if (ownText) {
        const size = parseFloat(cs.fontSize)
        if (size < 11) smallText.push(`${size}px ${name(el)}`)
        // 글이 자기 상자보다 넓은데 잘라 보이는 것(말줄임표로 의도한 것은 뺀다).
        const cuts = cs.overflowX === "hidden" || cs.overflowX === "clip"
        if (cuts && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== "ellipsis") clipped.push(name(el))
      }
    }

    if (vw < 768) {
      for (const el of document.querySelectorAll("button, a[href], [role=tab], [role=button], input, select, textarea, summary")) {
        if (skip(el) || !visible(el)) continue
        const r = el.getBoundingClientRect()
        // 글 속의 링크는 줄 높이를 따르고, 건너뛰기 링크는 초점을 받을 때만 보인다.
        // 상자(label) 안의 입력창은 그 상자 전체가 누를 자리다.
        const inline = el.tagName === "A" && getComputedStyle(el).display === "inline"
        if (inline || el.matches(".skip-link")) continue
        const box = el.matches("input") ? (el.closest("label, form")?.getBoundingClientRect() ?? r) : r
        // 글 크기 버튼은 ::after로 누를 자리를 위아래로 넓힌다(index.css의 반응형 구역).
        const after = getComputedStyle(el, "::after")
        const reach = after.content !== "none" && after.position === "absolute" ? -2 * Math.min(0, parseFloat(after.top) || 0) : 0
        const height = box.height + reach
        // 글자 버튼은 높이가 44px이면 폭이 좁아도 누르기 쉽다.
        const short = height < 40 || (box.width < 40 && height < 44)
        if (short) smallTargets.push(`${Math.round(box.width)}x${Math.round(box.height)} ${name(el)}`)
      }
      for (const el of document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea")) {
        if (skip(el) || !visible(el)) continue
        const size = parseFloat(getComputedStyle(el).fontSize)
        if (size < 16) smallInputs.push(`${size}px ${name(el)}`)
      }
    }

    // 열린 팝업이 화면 안에 있는지.
    const popups: string[] = []
    for (const el of document.querySelectorAll("[role=dialog], .modal")) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      if (r.left < -1 || r.right > vw + 1) popups.push(`${Math.round(r.left)}..${Math.round(r.right)} ${name(el)}`)
    }

    const unique = (list: string[]) => [...new Set(list)]
    return {
      overflow,
      offscreen: unique(offscreen).slice(0, 8),
      clipped: unique(clipped).slice(0, 8),
      smallText: unique(smallText).slice(0, 12),
      smallTargets: unique(smallTargets).slice(0, 30),
      smallInputs: unique(smallInputs),
      popups,
    }
  })
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle")
  // 스크롤에 맞춰 나타나는 블록을 모두 보이게 둔다.
  await page.evaluate(() => document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("revealed")))
  await page.waitForTimeout(300)
}

function record(pagePath: string, size: string, result: Awaited<ReturnType<typeof measure>>) {
  const add = (kind: string, list: string[]) => list.forEach((detail) => findings.push({ page: pagePath, size, kind, detail }))
  if (result.overflow > 1) add("overflow", [`${result.overflow}px`])
  add("offscreen", result.offscreen)
  add("clipped", result.clipped)
  add("small-text", result.smallText)
  add("small-target", result.smallTargets)
  add("small-input", result.smallInputs)
  add("popup", result.popups)
}

for (const [width, height] of sizes) {
  const size = `${width}x${height}`
  test.describe(size, () => {
    test.use({ viewport: { width, height } })

    test(`pages fit ${size}`, async ({ page }) => {
      test.setTimeout(240_000)
      for (const pagePath of visitorPages) {
        await page.goto(pagePath)
        await settle(page)
        const result = await measure(page)
        record(pagePath, size, result)
        expect.soft(result.overflow, `${pagePath} scrolls sideways at ${size}`).toBeLessThanOrEqual(1)
        expect.soft(result.popups, `${pagePath} popups at ${size}`).toEqual([])
        if (width < 768) expect.soft(result.smallInputs, `${pagePath} inputs iOS would zoom at ${size}`).toEqual([])
      }
    })

    test(`login and sign-up popups fit ${size}`, async ({ page }) => {
      await page.goto("/")
      await settle(page)
      await page.getByRole("button", { name: "로그인", exact: true }).first().click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()
      await page.waitForTimeout(400)
      let result = await measure(page)
      record("로그인 팝업", size, result)
      expect.soft(result.popups).toEqual([])
      if (width < 768) expect.soft(result.smallInputs).toEqual([])

      await page.keyboard.press("Escape")
      await page.goto("/")
      await settle(page)
      await page.getByRole("button", { name: "회원가입" }).first().click()
      await expect(page.getByRole("dialog")).toBeVisible()
      await page.waitForTimeout(400)
      result = await measure(page)
      record("회원가입 팝업", size, result)
      expect.soft(result.popups).toEqual([])
      if (width < 768) expect.soft(result.smallInputs).toEqual([])
    })

    test(`member screens fit ${size}`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.goto("/")
      await settle(page)
      await page.getByRole("button", { name: "로그인", exact: true }).first().click()
      const dialog = page.getByRole("dialog")
      await dialog.getByLabel("이메일").fill("muse@syu.ac.kr")
      await dialog.getByLabel("비밀번호", { exact: true }).fill("uniconnect2026")
      await dialog.getByRole("button", { name: "학생단체로 로그인" }).click()
      await expect(dialog).toBeHidden()
      for (const pagePath of ["/dashboard", "/me", "/messages", "/agreements", "/offers", "/new"]) {
        await page.goto(pagePath)
        await settle(page)
        const result = await measure(page)
        record(`${pagePath} (회원)`, size, result)
        expect.soft(result.overflow, `${pagePath} scrolls sideways at ${size}`).toBeLessThanOrEqual(1)
        if (width < 768) expect.soft(result.smallInputs, `${pagePath} inputs iOS would zoom at ${size}`).toEqual([])
      }
    })
  })
}

// 브라우저 글꼴을 크게(125%) 설정한 사람도 가로 스크롤 없이 읽을 수 있어야 한다.
test.describe("larger browser text", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("pages still fit with text at 125%", async ({ page }) => {
    test.setTimeout(240_000)
    for (const pagePath of visitorPages) {
      await page.goto(pagePath)
      await page.addStyleTag({ content: "html { font-size: 125% }" })
      await settle(page)
      const result = await measure(page)
      record(`${pagePath} (글자 125%)`, "390x844", result)
      expect.soft(result.overflow, `${pagePath} scrolls sideways with larger text`).toBeLessThanOrEqual(1)
    }
  })
})

test.afterAll(() => {
  const dir = path.join("test-results")
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `responsive-${process.pid}.json`), JSON.stringify(findings, null, 1))
})
