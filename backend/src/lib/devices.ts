// A login's device as the device list shows it: the browser and system
// from its User-Agent, such as "Chrome · macOS". Only this short label is
// kept, never the whole header.
export function deviceLabel(userAgent: string | undefined) {
  const agent = userAgent ?? ""
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /SamsungBrowser\//.test(agent)
      ? "Samsung Internet"
      : /KAKAOTALK/i.test(agent)
        ? "KakaoTalk"
        : /NAVER\(/.test(agent)
          ? "Naver"
          : /Firefox\/|FxiOS\//.test(agent)
            ? "Firefox"
            : /Chrome\/|CriOS\//.test(agent)
              ? "Chrome"
              : /Safari\//.test(agent)
                ? "Safari"
                : undefined
  const system = /iPhone/.test(agent)
    ? "iPhone"
    : /iPad/.test(agent)
      ? "iPad"
      : /Android/.test(agent)
        ? "Android"
        : /Mac OS X|Macintosh/.test(agent)
          ? "macOS"
          : /Windows/.test(agent)
            ? "Windows"
            : /CrOS/.test(agent)
              ? "ChromeOS"
              : /Linux/.test(agent)
                ? "Linux"
                : undefined
  return [browser, system].filter(Boolean).join(" · ") || "알 수 없는 기기"
}
