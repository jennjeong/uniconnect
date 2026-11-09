import { describe, expect, test } from "vitest"

import { createSeed, DEMO_PASSWORD } from "../../../backend/src/data/seed"
import * as serverCouncil from "../../../backend/src/lib/council"
import * as serverMethods from "../../../backend/src/lib/methods"
import * as server from "../../../backend/src/lib/validation"
import { demoAccounts, demoPassword } from "../data/demo"
import { brandOffers, factFields, snsPlatforms } from "../data/profile"
import { inquiryCategories } from "../data/inquiries"
import { defaultMethods, isVenueMethod, methodInfo, methodKinds } from "../data/methods"
import { placeCategories } from "../data/places"
import { mailKinds } from "../data/mail"
import { reportReasons } from "../data/reports"
import { carriers } from "../data/carriers"
import { audienceYears, eventKinds, handoutWays, logoSpots, promoPosts } from "../data/eventDetails"
import { reviewTags } from "../data/reviews"
import { accountTypes, councilTypes, roles } from "../data/roles"
import { sponsorOptions, valueTypes } from "../data/sponsorTypes"
import { surveyOptions } from "../data/survey"
import { passwordProblem } from "./password"

// 서버가 입력을 검사하는 목록(backend/src/lib/validation.ts)과 화면이 선택지로
// 내놓는 목록은 같아야 한다. 아니면 화면의 선택지를 서버가 거절하게 된다.
describe("the screens offer the choices the server takes", () => {
  test.each(roles)("account types for %s", (role) => {
    expect(accountTypes[role]).toEqual(server.accountTypes[role])
  })

  test("student council types", () => {
    expect(councilTypes).toEqual(serverCouncil.councilTypes)
  })

  test.each(roles)("profile facts for %s", (role) => {
    expect(factFields[role].map((field) => field.label)).toEqual(server.factLabels[role])
  })

  test.each(roles)("sponsorship kinds for %s", (role) => {
    expect(sponsorOptions[role].map((option) => option.value)).toEqual(server.sponsorTypes)
  })

  test("sponsorship kinds in the goals form, SNS platforms and question kinds", () => {
    expect(valueTypes).toEqual(server.sponsorTypes)
    expect(snsPlatforms).toEqual(server.snsPlatforms)
    expect(brandOffers).toEqual(server.brandOffers)
    expect(inquiryCategories).toEqual(server.inquiryCategories)
    expect(reportReasons).toEqual(server.reportReasons)
    expect(carriers).toEqual(server.carriers)
    expect(eventKinds).toEqual(server.eventKinds)
    expect(audienceYears).toEqual(server.audienceYears)
    expect(logoSpots).toEqual(server.logoSpots)
    expect(handoutWays).toEqual(server.handoutWays)
    expect(promoPosts).toEqual(server.promoPosts)
    expect(mailKinds.map((item) => item.kind)).toEqual(server.mailKinds)
  })

  test("the participants' survey answers", () => {
    expect(surveyOptions).toEqual(server.surveyOptions)
  })

  test("kinds of shop to look for around the campus", () => {
    expect(placeCategories.map((category) => category.code)).toEqual(server.placeCategories)
  })

  test.each(roles)("review tags about a %s", (role) => {
    expect(reviewTags[role]).toEqual(server.reviewTags[role])
  })

  // 양식이 나열하는 비밀번호 규칙은 서버가 말하는 것과 같다.
  test("password rules", () => {
    const samples = ["", "sh-1!", "club pass-123", "clubpass123", "12345678-!", "Club-pass-1", "a".repeat(126) + "1!", "a".repeat(127) + "1!"]
    for (const password of samples) {
      let refused = ""
      try {
        server.checkPassword(password)
      } catch (error) {
        refused = (error as Error).message
      }
      expect(passwordProblem(password), password).toBe(refused)
    }
  })

  // 전자계약서는 서버가 받는 방식을 내놓는다: 매장 방문은 브랜드에 고정되고,
  // 각각 서버가 요구하는 것을 필요로 하며, 서버가 상자 단위를 받는 곳은 상자로
  // 세고, 각각 서버가 세는 것을 센다.
  test("confirmation methods", () => {
    expect(methodKinds).toEqual(serverMethods.methodKinds)
    expect(defaultMethods).toEqual(serverMethods.defaultMethods)
    for (const kind of methodKinds) {
      const info = methodInfo[kind]
      expect(info.fixed ? info.side : undefined, kind).toBe(serverMethods.fixedSides[kind])
      expect(info.needs, kind).toBe(serverMethods.methodNeeds[kind])
      expect(Boolean(info.bulk), kind).toBe((serverMethods.bulkKinds as string[]).includes(kind))
      if (serverMethods.isVenueKind(kind)) expect(info.metric, kind).toBe(serverMethods.venueMetrics[kind])
      expect(isVenueMethod(kind), kind).toBe(serverMethods.isVenueKind(kind))
    }
  })
})

// 로그인 팝업의 데모 버튼은 시드의 데모 로그인을 보낸다. 아니면 누를 때
// 비밀번호가 틀렸다는 답이 온다.
test("the demo accounts the login popup offers are the seed's", async () => {
  expect(demoPassword).toBe(DEMO_PASSWORD)
  const seed = await createSeed()
  for (const role of roles) {
    const account = seed.accounts.find((item) => item.id === seed.demoAccountIds[role])!
    expect(demoAccounts[role]).toEqual({ email: account.email, name: account.name })
  }
})
