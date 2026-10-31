import { describe, expect, test } from "vitest"

import { createSeed, DEMO_PASSWORD } from "../../../backend/src/data/seed"
import * as serverCouncil from "../../../backend/src/lib/council"
import * as serverMethods from "../../../backend/src/lib/methods"
import * as server from "../../../backend/src/lib/validation"
import { demoAccounts, demoPassword } from "../data/demo"
import { factFields, snsPlatforms } from "../data/profile"
import { inquiryCategories } from "../data/inquiries"
import { defaultMethods, isVenueMethod, methodInfo, methodKinds } from "../data/methods"
import { placeCategories } from "../data/places"
import { mailKinds } from "../data/mail"
import { reportReasons } from "../data/reports"
import { carriers } from "../data/carriers"
import { reviewTags } from "../data/reviews"
import { accountTypes, councilTypes, roles } from "../data/roles"
import { sponsorOptions, valueTypes } from "../data/sponsorTypes"
import { surveyOptions } from "../data/survey"
import { passwordProblem } from "./password"

// Lists the server checks input against (backend/src/lib/validation.ts) and
// the screens offer as choices have to be the same, or a choice on screen
// would be refused.
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
    expect(inquiryCategories).toEqual(server.inquiryCategories)
    expect(reportReasons).toEqual(server.reportReasons)
    expect(carriers).toEqual(server.carriers)
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

  // The password rules the forms list say what the server says.
  test("password rules", () => {
    const samples = ["", "sh-1!", "club pass-123", "clubpass123", "12345678-!", "Club-pass-1", "a".repeat(62) + "1!", "a".repeat(63) + "1!"]
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

  // The e-contract offers the methods the server takes, store visits fixed
  // to the brand, each needing what the server needs, counted by the box
  // where the server takes a box, each counting what the server counts.
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

// The login popup's demo buttons send the seed's demo logins, or a press
// would answer that the password is wrong.
test("the demo accounts the login popup offers are the seed's", async () => {
  expect(demoPassword).toBe(DEMO_PASSWORD)
  const seed = await createSeed()
  for (const role of roles) {
    const account = seed.accounts.find((item) => item.id === seed.demoAccountIds[role])!
    expect(demoAccounts[role]).toEqual({ email: account.email, name: account.name })
  }
})
