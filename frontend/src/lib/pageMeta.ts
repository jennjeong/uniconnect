import { legalDocs } from "../data/legal"
import { lang, t } from "../i18n"
import type { Match, NavLabel, Role } from "../types"
import type { View } from "./route"

// The browser tab title and search description of each screen, so no two
// screens share them. Descriptions say only what the screen really shows.
// Screens for one account or one link are kept out of search results
// (noindex), and so is the dashboard, an app screen that visitors see with
// example data; the introduction, catalogs, profiles, FAQ and policies stay
// findable.

export type PageMeta = { title: string; description: string; noindex?: true }

// The pages of the menus that search engines may list.
const searchable = new Set<NavLabel>(["추천 매칭", "단체 찾기"])

const site = "uniconnect"
const titled = (name: string) => `${name} · ${site}`

// "뮤즈와", "코드랩과": 과 after a final consonant.
function withAnd(name: string) {
  const syllable = name.charCodeAt(name.length - 1) - 0xac00
  return `${name}${syllable >= 0 && syllable < 11172 && syllable % 28 !== 0 ? "과" : "와"}`
}

const pages: Record<Exclude<NavLabel, "대시보드">, PageMeta> = {
  "추천 매칭": {
    title: titled(t("추천 매칭")),
    description: t("행사와 잘 맞는 브랜드를 일치율 순으로 보고, 마음에 드는 브랜드에 협찬을 제안해요."),
  },
  "받은 협찬": {
    title: titled(t("받은 협찬 제안")),
    description: t("브랜드가 보낸 협찬 제안을 수락하거나 거절하고, 수락한 협찬의 진행 단계를 날짜별로 봐요."),
  },
  "내 행사": {
    title: titled(t("내 행사 일정")),
    description: t("등록한 행사를 달력과 그달 일정 목록으로 보고, 새 행사를 하루나 기간으로 등록해요."),
  },
  성과: {
    title: titled(t("성과")),
    description: t("행사 QR 스캔, 쿠폰 수령, 매장 방문을 실시간으로 집계하고 목표와 비교해요."),
  },
  리포트: {
    title: titled(t("협찬 성과 리포트")),
    description: t("측정이 끝난 행사의 핵심 지표와 ROAS를 확인하고 PDF 리포트로 내려받아요."),
  },
  "단체 찾기": {
    title: titled(t("학생단체 찾기")),
    description: t("캠페인과 잘 맞는 학생단체를 추천, 행사 임박, 분야별로 찾아 협찬을 제안해요."),
  },
  "받은 제안": {
    title: titled(t("받은 협찬 제안")),
    description: t("학생단체가 보낸 협찬 제안을 수락하거나 거절하고, 수락한 협찬의 진행 단계를 날짜별로 봐요."),
  },
  "행사 일정": {
    title: titled(t("행사 일정")),
    description: t("등록한 캠페인과 확정된 협찬 일정을 달력과 그달 일정 목록으로 봐요."),
  },
  "성과 분석": {
    title: titled(t("협찬 성과 분석")),
    description: t("협찬마다 집행액, 쿠폰, 방문, ROAS를 비교하고 분석 보고서를 PDF로 내려받아요."),
  },
}

export function pageMeta(
  view: View,
  {
    role,
    page,
    detail,
    partnerName,
  }: {
    role: Role
    // The page on screen (view.page corrected for the role).
    page: NavLabel
    // The brand or group whose detail page is open.
    detail?: Match
    // The other side of the open conversation.
    partnerName?: string
  },
): PageMeta {
  const students = role === "학생단체"
  if (view.missing) {
    return {
      title: titled(t("페이지를 찾을 수 없어요")),
      description: t("요청한 주소의 페이지가 없어요. 홈이나 주요 메뉴로 이동해 주세요."),
      noindex: true,
    }
  }
  if (view.home) {
    return {
      title: t("{site} · 학생단체와 브랜드를 잇는 협찬 매칭", { site }),
      description: t("학생단체와 브랜드를 잇는 캠퍼스 협찬 매칭 서비스예요. 추천 매칭부터 제안, 임시 전자 계약서, 현장 QR 측정과 성과 리포트까지 한곳에서 해요."),
    }
  }
  if (view.create) {
    return students
      ? {
          title: titled(t("새 행사 등록")),
          description: t("행사 정보와 일정, 원하는 협찬 유형을 등록하면 잘 맞는 브랜드를 찾아 드려요."),
          noindex: true,
        }
      : {
          title: titled(t("새 캠페인 등록")),
          description: t("캠페인 정보와 일정, 제공할 협찬 형태를 등록하면 잘 맞는 학생단체를 찾아 드려요."),
          noindex: true,
        }
  }
  if (view.profile) {
    return view.profile === "edit"
      ? {
          title: titled(t("소개 편집")),
          description: t("다른 쪽의 목록과 상세 페이지에 보이는 우리 소개를 고쳐요."),
          noindex: true,
        }
      : {
          title: titled(t("내 정보")),
          description: t("계정 정보와 공개 소개, 지금까지 등록한 일정과 협찬 활동을 확인해요."),
          noindex: true,
        }
  }
  if (view.chat) {
    const partner = partnerName ?? t("대화 상대")
    const name = lang === "en" ? partner : withAnd(partner)
    return {
      title: titled(t("{name}의 대화", { name })),
      description: t("{name} 주고받은 메시지예요.", { name }),
      noindex: true,
    }
  }
  if (view.faq) {
    return {
      title: titled(t("자주 묻는 질문")),
      description: t("가입, 협찬 제안, 일정 등록, 성과 확인에 대해 자주 묻는 질문을 보고, 더 궁금한 점은 관리자에게 물어봐요."),
    }
  }
  if (view.admin) {
    return { title: titled(t("운영자 화면")), description: t("도움말 센터로 들어온 질문을 확인하고 답해요."), noindex: true }
  }
  if (view.agreement) {
    return {
      title: titled(t("임시 전자 계약서")),
      description: t("학생단체와 브랜드가 협찬으로 할 일을 함께 정하고 확인하고, 한 일을 링크와 사진으로 남겨요."),
      noindex: true,
    }
  }
  if (view.agreements) {
    return {
      title: titled(t("임시 전자 계약서")),
      description: t("확정된 협찬마다 계약서를 확인하고, 할 일이 얼마나 끝났는지 봐요."),
      noindex: true,
    }
  }
  if (view.invite) {
    return {
      title: titled(t("uniconnect 초대장")),
      description: t("학생단체가 보낸 초대예요. 가게로 가입하면 근처 학생단체의 협찬 제안을 받고, 행사 날 쿠폰과 방문 성과를 확인할 수 있어요."),
      noindex: true,
    }
  }
  if (view.legal) {
    const doc = legalDocs[view.legal]
    return { title: titled(doc.title), description: doc.summary }
  }
  if (view.messages) {
    return { title: titled(t("메시지")), description: t("학생단체와 브랜드가 주고받은 대화 목록이에요."), noindex: true }
  }
  if (detail) {
    return {
      title: titled(detail.name),
      description: t("{name}({category})의 소개와 협찬 조건, 일치율 {score}%를 확인하고 제안하거나 문의해요.", {
        name: detail.name,
        category: t(detail.category),
        score: detail.score,
      }),
    }
  }
  if (page !== "대시보드") return searchable.has(page) ? pages[page] : { ...pages[page], noindex: true }
  return {
    title: titled(t("대시보드")),
    description: students
      ? t("학생단체가 행사와 잘 맞는 브랜드를 찾고, 협찬 제안부터 성과 리포트까지 한곳에서 관리해요.")
      : t("브랜드가 캠페인에 맞는 학생단체를 찾고, 받은 제안과 협찬 성과(ROAS)를 한곳에서 봐요."),
    noindex: true,
  }
}

// Writes the meta to the tab title, the description and their share copies.
export function applyPageMeta({ title, description, noindex }: PageMeta) {
  document.title = title
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", title)
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]']) {
    document.querySelector(selector)?.setAttribute("content", description)
  }
  keepOutOfSearch(noindex === true)
}

// A robots meta of noindex while the screen is one for an account or a link
// (the check-in pages call it themselves), and none otherwise.
export function keepOutOfSearch(hidden = true) {
  let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
  if (!hidden) {
    robots?.remove()
    return
  }
  if (!robots) {
    robots = document.createElement("meta")
    robots.name = "robots"
    document.head.append(robots)
  }
  robots.content = "noindex"
}
