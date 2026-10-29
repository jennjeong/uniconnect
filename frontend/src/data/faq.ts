import type { IconName } from "../components/Icon"
import { t } from "../i18n"

// The help center's topics and questions (pages/FaqPage.tsx; the dashboards
// show the featured ones). Answers say only what the service does today;
// prices, refunds and reply times stay out until there is a real policy.

export type FaqTopic = "start" | "account" | "proposal" | "schedule" | "message" | "results"

export const faqTopics: { key: FaqTopic; title: string; description: string; icon: IconName }[] = [
  { key: "start", title: t("시작하기"), description: t("가입할 수 있는 사람과 가입 전에 둘러보는 방법"), icon: "spark" },
  { key: "account", title: t("계정 · 소개"), description: t("내 정보와 다른 쪽에 보이는 우리 소개 관리"), icon: "users" },
  { key: "proposal", title: t("협찬 제안"), description: t("제안을 보내고, 답을 받고, 거두는 방법"), icon: "send" },
  { key: "schedule", title: t("일정 등록"), description: t("행사와 캠페인을 하루나 기간으로 등록하기"), icon: "calendar" },
  { key: "message", title: t("메시지"), description: t("상대에게 직접 묻고 대화를 관리하는 방법"), icon: "chat" },
  { key: "results", title: t("성과 · 리포트"), description: t("현장 측정과 성과 리포트, 분석 보고서"), icon: "chart" },
]

// A question in the help center. `key` is its Korean wording, which the
// operators hide it by from the console (hooks/useSiteState.ts).
export type FaqItem = { key: string; topic: FaqTopic; question: string; answer: string; featured?: boolean }

export const faqs: FaqItem[] = [
  {
    topic: "start",
    featured: true,
    key: "누가 가입할 수 있나요?",
    question: t("누가 가입할 수 있나요?"),
    answer:
      t("학생단체와 브랜드가 가입할 수 있어요. 학생단체는 학교 이메일, 브랜드는 회사 이메일로 6자리 인증번호를 받아 확인한 뒤 가입해요."),
  },
  {
    topic: "start",
    featured: true,
    key: "가입하지 않고도 둘러볼 수 있나요?",
    question: t("가입하지 않고도 둘러볼 수 있나요?"),
    answer:
      t("네. 로그인하지 않으면 학생단체 화면과 브랜드 화면을 데모 데이터로 둘러볼 수 있어요. 협찬 제안, 제안 수락, 일정 등록은 로그인한 뒤에 할 수 있어요. 가입하면 데모 데이터 대신 실제로 가입한 브랜드와 학생단체만 보여요."),
  },
  {
    topic: "start",
    key: "앱으로 설치할 수 있나요?",
    question: t("앱으로 설치할 수 있나요?"),
    answer:
      t("네. 첫 화면이나 메뉴의 ‘앱 다운로드’로 설치해요. 컴퓨터의 Chrome에서는 설치한 뒤로 사이트 링크가 앱 창에서 열려요. 브라우저 탭에서 열고 싶다면 앱 창 ⋮ 메뉴의 ‘앱 정보’에서 링크 설정을 바꾸거나, 주소창에 chrome://apps를 입력하고 uniconnect를 오른쪽 클릭해 ‘Chrome에서 삭제’를 눌러요. Finder나 휴지통에서 바로가기만 지우면 다시 생겨요."),
  },
  {
    topic: "account",
    key: "다른 쪽에 보이는 우리 소개는 어디서 고치나요?",
    question: t("다른 쪽에 보이는 우리 소개는 어디서 고치나요?"),
    answer:
      t("내 정보의 ‘소개 편집’에서 고쳐요. 여기서 쓴 소개가 브랜드·학생단체 목록과 상세 페이지에 그대로 보여요."),
  },
  {
    topic: "proposal",
    featured: true,
    key: "협찬 제안은 어떻게 주고받나요?",
    question: t("협찬 제안은 어떻게 주고받나요?"),
    answer:
      t("학생단체는 추천 매칭에서, 브랜드는 단체 찾기에서 상대에게 협찬을 제안해요. 학생단체가 보낸 제안은 계정이 있는 브랜드의 받은 제안에, 브랜드가 보낸 제안은 계정이 있는 학생단체의 받은 협찬에 도착해요. 받은 쪽이 수락하거나 거절하면 그 결과가 제안한 쪽 카드에 표시돼요."),
  },
  {
    topic: "proposal",
    key: "보낸 제안을 거둘 수 있나요?",
    question: t("보낸 제안을 거둘 수 있나요?"),
    answer:
      t("네. 제안을 보낸 카드의 ‘제안 완료’ 아래 ‘제안 취소’를 누르면 거둘 수 있어요. 거절된 제안은 ‘다시 제안하기’로 한 번 더 보낼 수 있어요."),
  },
  {
    topic: "schedule",
    featured: true,
    key: "행사나 캠페인 일정은 어떻게 등록하나요?",
    question: t("행사나 캠페인 일정은 어떻게 등록하나요?"),
    answer:
      t("등록 페이지에서 이름과 인원, 협찬 유형을 고르고 달력에서 날짜를 골라요. 하루 일정은 한 번, 기간은 첫날과 마지막 날을 차례로 누르면 되고 최대 90일까지 고를 수 있어요."),
  },
  {
    topic: "message",
    key: "상대에게 직접 물어볼 수 있나요?",
    question: t("상대에게 직접 물어볼 수 있나요?"),
    answer:
      t("브랜드·학생단체 상세 페이지의 ‘문의하기’로 메시지를 보낼 수 있어요. 상대가 누구인지 알 수 있도록, 먼저 내 정보에서 우리 소개를 등록해야 해요."),
  },
  {
    topic: "message",
    key: "보낸 메시지를 고치거나 지울 수 있나요?",
    question: t("보낸 메시지를 고치거나 지울 수 있나요?"),
    answer:
      t("내가 보낸 메시지의 ⋯ 버튼에서 수정하거나 삭제할 수 있어요. 고친 메시지에는 ‘수정됨’, 지운 메시지는 삭제된 메시지로 양쪽 모두에게 보여요. 상대가 읽었는지도 메시지 옆에 표시돼요."),
  },
  {
    topic: "results",
    featured: true,
    key: "협찬 성과는 어떻게 확인하나요?",
    question: t("협찬 성과는 어떻게 확인하나요?"),
    answer:
      t("임시 전자 계약서 아래의 협찬 확인 방식에서 QR 체크인, 쿠폰 발급, 매장 방문, 샘플링 · 시음, 부스 스탬프, SNS 인증, 설문, 현장 구매, 사은품, 경품 응모, 회원 가입, 체험 가운데 여러 개를 고르고, 방식마다 학생단체 · 브랜드 · 두 쪽 모두 가운데 확인할 쪽을 정해요. 두 쪽이 계약서를 확인하면 확정되고, 행사장에서 각자 자기 PIN으로 확인한 숫자가 목표와 함께 모여요. 학생단체는 성과와 리포트에서, 브랜드는 성과 분석에서 확인해요."),
  },
  {
    topic: "results",
    key: "리포트를 PDF로 받을 수 있나요?",
    question: t("리포트를 PDF로 받을 수 있나요?"),
    answer:
      t("네. 학생단체는 리포트 페이지의 ‘PDF 리포트 다운로드’, 브랜드는 성과 분석의 ‘분석 보고서 다운로드’로 받아요. 브랜드 보고서에는 전체 요약과 협찬마다의 성과 페이지가 담겨요."),
  },
]
