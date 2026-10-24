import { describe, expect, test } from "vitest"

import { isAppPath } from "../../../backend/src/lib/appPaths"
import { readView, viewPath } from "./route"
import { sampleViews } from "./route.samples"

// The server answers 404 for addresses no screen has (backend/src/lib/
// appPaths.ts), so its list has to agree with route.ts.
const at = (path: string) => new URL(path, "http://localhost") as unknown as Location

describe("the server's page list matches the screens", () => {
  test.each(sampleViews)("%o is a page the server serves", (view) => {
    expect(isAppPath(new URL(viewPath(view), "http://localhost").pathname)).toBe(true)
  })

  test.each([
    "/",
    "/matches",
    "/groups/abc/",
    "/new",
    "/me/edit",
    "/messages/abc",
    "/faq",
    "/terms",
    "/privacy/",
    "/privacy/x",
    "/admin",
    "/admin/x",
    "/nope",
    "/events/x",
    "/matches/a/b",
    "/me/other",
    "/faq/x",
    "/new/x",
    "/invite/Ab3_x-9Z",
    "/invite",
    "/invite/a/b",
    "/invite/%E0",
    "/invite/a.b",
    "/agreements",
    "/agreements/req-runners",
    "/agreements/a/b",
  ])("%s gets the same answer from both", (path) => {
    expect(isAppPath(path)).toBe(readView(at(path)).missing === undefined)
  })

  test("the check-in page, which main.tsx opens before the app, is served too", () => {
    expect(isAppPath("/check-in/20261012")).toBe(true)
  })
})
