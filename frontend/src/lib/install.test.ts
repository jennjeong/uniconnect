import { describe, expect, it } from "vitest"

import { installKind, kakaoTalkExternal } from "./install"

const agents = {
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  kakaoAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 KAKAOTALK/25.8.0 (INAPP)",
  kakaoIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.8.0",
  naverApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.10.0)",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  // iPadOS와 macOS Safari는 같은 에이전트 문자열을 보낸다. 터치스크린이 있는
  // 것은 iPad뿐이다.
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
}

const here = (userAgent: string, more: Partial<Parameters<typeof installKind>[0]> = {}) =>
  installKind({ standalone: false, offered: false, userAgent, touchPoints: 0, ...more })

describe("installKind", () => {
  it("shows no button inside the installed app", () => {
    expect(here(agents.chromeAndroid, { standalone: true, offered: true })).toBe("app")
    expect(here(agents.iphoneSafari, { standalone: true })).toBe("app")
  })

  it("uses the browser's own dialog where it offers one", () => {
    expect(here(agents.chromeAndroid, { offered: true })).toBe("prompt")
  })

  it("sends pages opened inside KakaoTalk and other apps to a browser first", () => {
    expect(here(agents.kakaoAndroid)).toBe("inapp")
    expect(here(agents.kakaoIphone, { touchPoints: 5 })).toBe("inapp")
    expect(here(agents.naverApp, { touchPoints: 5 })).toBe("inapp")
  })

  it("tells iPhones and iPads to add it to the home screen", () => {
    expect(here(agents.iphoneSafari, { touchPoints: 5 })).toBe("ios")
    expect(here(agents.macSafari, { touchPoints: 5 })).toBe("ios")
  })

  it("guides every other browser, and one where the app is installed already", () => {
    expect(here(agents.macSafari)).toBe("guide")
    expect(here(agents.firefox)).toBe("guide")
    expect(here(agents.chromeAndroid)).toBe("guide")
  })
})

it("hands the page to the phone's browser from KakaoTalk", () => {
  expect(kakaoTalkExternal("https://uniconnect.example/?a=1")).toBe(
    "kakaotalk://web/openExternal?url=https%3A%2F%2Funiconnect.example%2F%3Fa%3D1",
  )
})
