import { describe, expect, test } from "vitest"

import * as server from "../../../backend/src/lib/validation"
import { factFields, snsPlatforms } from "../data/profile"
import { inquiryCategories } from "../data/inquiries"
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
})
