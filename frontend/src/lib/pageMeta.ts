import { legalDocs } from "../data/legal"
import { lang, t } from "../i18n"
import type { Match, NavLabel, Role } from "../types"
import type { View } from "./route"

// 각 화면의 브라우저 탭 제목과 검색 설명. 두 화면이 같은 것을 쓰지 않는다.
// 설명은 화면이 실제로 보여주는 것만 말한다.\n|계정 하나나 링크 하나를 위한
// 화면은 검색 결과에서 뺀다(noindex). 방문자가 예시 데이터로 보는 앱 화면인
// 대시보드도 마찬가지다. 소개, 카탈로그, 프로필, FAQ, 약관은 검색에 잡히게
// 둔다.

export type PageMeta = { title: string; description: string; noindex?: true }

// 검색 엔진이 목록에 올려도 되는 메뉴 페이지.
const searchable = new Set<NavLabel>(["추천 매칭", "단체 찾기"])

const site = "uniconnect"
const titled = (name: string) => `${name} · ${site}`

// "뮤즈와", "코드랩과": 받침 뒤의 과.
function withAnd(name: string) {
  const syllable = name.charCodeAt(name.length - 1) - 0xac00
  return `${name}${syllable >= 0 && syllable < 11172 && syllable % 28 !== 0 ? "과" : "와"}`
}

const pages: Record<Exclude<NavLabel, "대시보드">, PageMeta> = {
  "추천 매칭": {
    title: titled(t("추천 매칭")),
    description: t("잘 맞는 브랜드를 골라 보고 바로 협찬을 제안해요."),
  },
  "받은 협찬": {
    title: titled(t("받은 협찬 제안")),
    description: t("브랜드가 보낸 협찬 제안을 수락하거나 거절하고 수락한 협찬의 진행 단계를 날짜별로 봐요."),
  },
  "내 행사": {
    title: titled(t("내 행사 일정")),
    description: t("등록한 행사를 달력과 그달 일정 목록으로 보고 새 행사를 하루나 기간으로 등록해요."),
  },
  성과: {
    title: titled(t("성과")),
    description: t("QR · 쿠폰 · 매장 방문을 실시간으로 세고 목표와 비교해요."),
  },
  리포트: {
    title: titled(t("협찬 성과 리포트")),
    description: t("측정이 끝난 행사의 핵심 지표와 ROAS를 확인하고 PDF 리포트로 내려받아요."),
  },
  "단체 찾기": {
    title: titled(t("학생단체 찾기")),
    description: t("잘 맞는 학생단체를 골라 보고 바로 협찬을 제안해요."),
  },
  "받은 제안": {
    title: titled(t("받은 협찬 제안")),
    description: t("학생단체가 보낸 협찬 제안을 수락하거나 거절하고 수락한 협찬의 진행 단계를 날짜별로 봐요."),
  },
  "행사 일정": {
    title: titled(t("행사 일정")),
    description: t("등록한 캠페인과 확정된 협찬 일정을 달력과 그달 일정 목록으로 봐요."),
  },
  "성과 분석": {
    title: titled(t("협찬 성과 분석")),
    description: t("협찬마다 ROAS를 비교하고 분석 보고서를 PDF로 받아요."),
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
    // 화면에 떠 있는 페이지 (역할에 맞게 고친 view.page).
    page: NavLabel
    // 상세 페이지가 열려 있는 브랜드나 단체.
    detail?: Match
    // 열려 있는 대화의 상대.
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
  if (view.edit) {
    return students
      ? {
          title: titled(t("행사 수정")),
          description: t("등록한 행사의 이름과 일정, 인원, 원하는 협찬 유형을 고쳐요."),
          noindex: true,
        }
      : {
          title: titled(t("캠페인 수정")),
          description: t("등록한 캠페인의 이름과 일정, 목표 인원, 제공할 협찬 형태를 고쳐요."),
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
      description: t("가입, 협찬 제안, 일정 등록, 성과 확인에 대해 자주 묻는 질문을 보고 더 궁금한 점은 관리자에게 물어봐요."),
    }
  }
  if (view.board || view.post) {
    return {
      title: titled(t(view.post ? "모집 글" : "모집 게시판")),
      description: t("브랜드는 함께할 행사를, 학생단체는 협찬사를 모집하고 상대 쪽 글에 지원해요."),
      noindex: true,
    }
  }
  if (view.eventPage) {
    return {
      title: titled(students ? t("행사 상세") : t("행사 · 캠페인 상세")),
      description: students
        ? t("학생단체의 행사 장소와 소개, 사진, 브랜드에 드리는 협찬 혜택 묶음을 봐요.")
        : t("캠페인의 일정과 목표, 제공할 협찬이나 학생단체의 행사 정보를 봐요."),
      noindex: true,
    }
  }
  if (view.admin) {
    return { title: titled(t("운영자 화면")), description: t("도움말 센터로 들어온 질문을 확인하고 답해요."), noindex: true }
  }
  if (view.agreement) {
    return {
      title: titled(t("임시 전자 계약서")),
      description: t("학생단체와 브랜드가 협찬으로 할 일을 함께 정해 확인하고 끝낸 일은 링크와 사진으로 남겨요."),
      noindex: true,
    }
  }
  if (view.insight || view.sharedReport) {
    return {
      title: titled(t("상세 성과 리포트")),
      description: t("협찬 하나의 목표 달성, 다른 행사와의 비교, 비용 효율, 시간대, 평소 대비 효과와 다음 협찬 제안을 한 번에 봐요."),
      noindex: true,
    }
  }
  if (view.ledger) {
    return {
      title: titled(t("협찬 결산")),
      description: t("학생단체가 학생들에게 공개하는 협찬 내역이에요."),
      noindex: true,
    }
  }
  if (view.explore) {
    return {
      title: titled(t("다른 단체 행사 둘러보기")),
      description: t("다른 학생회와 동아리의 다가오는 행사와 비슷한 행사의 협찬 사례를 봐요."),
      noindex: true,
    }
  }
  if (view.council) {
    return {
      title: titled(t("소속 단체")),
      description: t("학생회에 연결한 소속 단체의 행사와 협찬 현황을 한곳에서 봐요."),
      noindex: true,
    }
  }
  if (view.agreements) {
    return {
      title: titled(t("임시 전자 계약서")),
      description: t("확정된 협찬마다 계약서를 확인하고 할 일이 얼마나 끝났는지 봐요."),
      noindex: true,
    }
  }
  if (view.invite) {
    return {
      title: titled(t("uniconnect 초대장")),
      description: t("학생단체가 보낸 초대예요. 가게로 가입하면 근처 학생단체의 협찬 제안을 받고 행사 날 쿠폰과 방문 성과를 확인할 수 있어요."),
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
      ? t("학생단체가 행사와 잘 맞는 브랜드를 찾고 협찬 제안부터 성과 리포트까지 한곳에서 관리해요.")
      : t("브랜드가 캠페인에 맞는 학생단체를 찾고 받은 제안과 협찬 성과(ROAS)를 한곳에서 봐요."),
    noindex: true,
  }
}

// 메타 정보를 탭 제목, 설명, 공유용 사본에 쓴다.
export function applyPageMeta({ title, description, noindex }: PageMeta) {
  document.title = title
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", title)
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]']) {
    document.querySelector(selector)?.setAttribute("content", description)
  }
  keepOutOfSearch(noindex === true)
}

// 화면이 계정이나 링크 하나를 위한 것이면 noindex인 robots 메타를 두고(체크인
// 페이지는 스스로 부른다), 아니면 두지 않는다.
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
