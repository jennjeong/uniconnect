import { describe, expect, test } from "vitest"

import { createSeed, DEMO_PASSWORD } from "../../../backend/src/data/seed"
import * as server from "../../../backend/src/lib/validation"
import { demoAccounts, demoPassword } from "../data/demo"
import { factFields, snsPlatforms } from "../data/profile"
import { inquiryCategories } from "../data/inquiries"
import { placeCategories } from "../data/places"
import { reviewTags } from "../data/reviews"
import { accountTypes, roles } from "../data/roles"
import { sponsorOptions, valueTypes } from "../data/sponsorTypes"

// Lists the server checks input against (backend/src/lib/validation.ts) and
// the screens offer as choices have to be the same, or a choice on screen
// would be refused.
describe("the screens offer the choices the server takes", () => {
  test.each(roles)("account types for %s", (role) => {
    expect(accountTypes[role]).toEqual(server.accountTypes[role])
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
  })

  test("kinds of shop to look for around the campus", () => {
    expect(placeCategories.map((category) => category.code)).toEqual(server.placeCategories)
  })

  test.each(roles)("review tags about a %s", (role) => {
    expect(reviewTags[role]).toEqual(server.reviewTags[role])
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
