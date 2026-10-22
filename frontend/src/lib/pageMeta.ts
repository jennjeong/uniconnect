import { legalDocs } from "../data/legal"
import type { Match, NavLabel, Role } from "../types"
import type { View } from "./route"

// The browser tab title and search description of each screen, so no two
// screens share them. Descriptions say only what the screen really shows.

export type PageMeta = { title: string; description: string }

const site = "uniconnect"
const titled = (name: string) => `${name} · ${site}`

// "뮤즈와", "코드랩과": 과 after a final consonant.
function withAnd(name: string) {
  const syllable = name.charCodeAt(name.length - 1) - 0xac00
  return `${name}${syllable >= 0 && syllable < 11172 && syllable % 28 !== 0 ? "과" : "와"}`
}

const pages: Record<Exclude<NavLabel, "대시보드">, PageMeta> = {
  "추천 매칭": {
    title: titled("추천 매칭"),
    description: "행사와 잘 맞는 브랜드를 일치율 순으로 보고, 마음에 드는 브랜드에 협찬을 제안해요.",
  },
  "받은 협찬": {
    title: titled("받은 협찬 제안"),
    description: "브랜드가 보낸 협찬 제안을 수락하거나 거절하고, 수락한 협찬의 진행 단계를 날짜별로 봐요.",
  },
  "내 행사": {
    title: titled("내 행사 일정"),
    description: "등록한 행사를 달력과 그달 일정 목록으로 보고, 새 행사를 하루나 기간으로 등록해요.",
  },
  "성과 측정": {
    title: titled("성과 측정"),
    description: "행사 QR 스캔, 쿠폰 수령, 매장 방문을 실시간으로 집계하고 목표와 비교해요.",
  },
  리포트: {
    title: titled("협찬 성과 리포트"),
    description: "측정이 끝난 행사의 핵심 지표와 ROAS를 확인하고 PDF 리포트로 내려받아요.",
  },
  "단체 찾기": {
    title: titled("학생단체 찾기"),
    description: "캠페인과 잘 맞는 학생단체를 추천, 행사 임박, 분야별로 찾아 협찬을 제안해요.",
  },
  "받은 제안": {
    title: titled("받은 협찬 제안"),
    description: "학생단체가 보낸 협찬 제안을 수락하거나 거절하고, 수락한 협찬의 진행 단계를 날짜별로 봐요.",
  },
  "행사 일정": {
    title: titled("행사 일정"),
    description: "등록한 캠페인과 확정된 협찬 일정을 달력과 그달 일정 목록으로 봐요.",
  },
  "성과 분석": {
    title: titled("협찬 성과 분석"),
    description: "협찬마다 집행액, 쿠폰, 방문, ROAS를 비교하고 분석 보고서를 PDF로 내려받아요.",
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
      title: titled("페이지를 찾을 수 없어요"),
      description: "요청한 주소의 페이지가 없어요. 홈이나 주요 메뉴로 이동해 주세요.",
    }
  }
  if (view.create) {
    return students
      ? {
          title: titled("새 행사 등록"),
          description: "행사 정보와 일정, 원하는 협찬 유형을 등록하면 잘 맞는 브랜드를 찾아 드려요.",
        }
      : {
          title: titled("새 캠페인 등록"),
          description: "캠페인 정보와 일정, 제공할 협찬 형태를 등록하면 잘 맞는 학생단체를 찾아 드려요.",
        }
  }
  if (view.profile) {
    return view.profile === "edit"
      ? {
          title: titled("소개 편집"),
          description: "다른 쪽의 목록과 상세 페이지에 보이는 우리 소개를 고쳐요.",
        }
      : {
          title: titled("내 정보"),
          description: "계정 정보와 공개 소개, 지금까지 등록한 일정과 협찬 활동을 확인해요.",
        }
  }
  if (view.chat) {
    const name = withAnd(partnerName ?? "대화 상대")
    return { title: titled(`${name}의 대화`), description: `${name} 주고받은 메시지예요.` }
  }
  if (view.faq) {
    return {
      title: titled("자주 묻는 질문"),
      description: "가입, 협찬 제안, 일정 등록, 성과 확인에 대해 자주 묻는 질문을 보고, 더 궁금한 점은 관리자에게 물어봐요.",
    }
  }
  if (view.legal) {
    const doc = legalDocs[view.legal]
    return { title: titled(doc.title), description: doc.summary }
  }
  if (view.messages) {
    return { title: titled("메시지"), description: "학생단체와 브랜드가 주고받은 대화 목록이에요." }
  }
  if (detail) {
    return {
      title: titled(detail.name),
      description: `${detail.name}(${detail.category})의 소개와 협찬 조건, 일치율 ${detail.score}%를 확인하고 제안하거나 문의해요.`,
    }
  }
  if (page !== "대시보드") return pages[page]
  return {
    title: `${site} · 학생단체와 브랜드를 잇는 협찬 매칭`,
    description: students
      ? "학생단체가 행사와 잘 맞는 브랜드를 찾고, 협찬 제안부터 성과 리포트까지 한곳에서 관리해요."
      : "브랜드가 캠페인에 맞는 학생단체를 찾고, 받은 제안과 협찬 성과(ROAS)를 한곳에서 봐요.",
  }
}

// Writes the meta to the tab title, the description and their share copies.
export function applyPageMeta({ title, description }: PageMeta) {
  document.title = title
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", title)
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]']) {
    document.querySelector(selector)?.setAttribute("content", description)
  }
}
