// 기기 목록이 보여 주는 로그인 기기: User-Agent에서 가져온 "Chrome · macOS"
// 같은 브라우저와 시스템. 이 짧은 이름만 보관하고 헤더 전체는 보관하지 않는다.
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
