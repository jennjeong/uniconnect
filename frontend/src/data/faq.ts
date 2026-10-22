import type { IconName } from "../components/Icon"

// The help center's topics and questions (pages/FaqPage.tsx; the dashboards
// show the featured ones). Answers say only what the service does today;
// prices, refunds and reply times stay out until there is a real policy.

export type FaqTopic = "start" | "account" | "proposal" | "schedule" | "message" | "results"

export const faqTopics: { key: FaqTopic; title: string; description: string; icon: IconName }[] = [
  { key: "start", title: "시작하기", description: "가입할 수 있는 사람과 가입 전에 둘러보는 방법", icon: "spark" },
  { key: "account", title: "계정 · 소개", description: "내 정보와 다른 쪽에 보이는 우리 소개 관리", icon: "users" },
  { key: "proposal", title: "협찬 제안", description: "제안을 보내고, 답을 받고, 거두는 방법", icon: "send" },
  { key: "schedule", title: "일정 등록", description: "행사와 캠페인을 하루나 기간으로 등록하기", icon: "calendar" },
  { key: "message", title: "메시지", description: "상대에게 직접 묻고 대화를 관리하는 방법", icon: "chat" },
  { key: "results", title: "성과 · 리포트", description: "현장 측정과 성과 리포트, 분석 보고서", icon: "chart" },
]

export const faqs: { topic: FaqTopic; question: string; answer: string; featured?: true }[] = [
  {
    topic: "start",
    featured: true,
    question: "누가 가입할 수 있나요?",
    answer:
      "학생단체와 브랜드가 가입할 수 있어요. 학생단체는 학교 이메일, 브랜드는 회사 이메일로 6자리 인증번호를 받아 확인한 뒤 가입해요.",
  },
  {
    topic: "start",
    featured: true,
    question: "가입하지 않고도 둘러볼 수 있나요?",
    answer:
      "네. 로그인하지 않으면 학생단체 화면과 브랜드 화면을 데모 데이터로 둘러볼 수 있어요. 협찬 제안, 제안 수락, 일정 등록은 로그인한 뒤에 할 수 있어요.",
  },
  {
    topic: "account",
    question: "다른 쪽에 보이는 우리 소개는 어디서 고치나요?",
    answer:
      "내 정보의 ‘소개 편집’에서 고쳐요. 여기서 쓴 소개가 브랜드·학생단체 목록과 상세 페이지에 그대로 보여요.",
  },
  {
    topic: "proposal",
    featured: true,
    question: "협찬 제안은 어떻게 주고받나요?",
    answer:
      "학생단체는 추천 매칭에서, 브랜드는 단체 찾기에서 상대에게 협찬을 제안해요. 학생단체가 보낸 제안은 계정이 있는 브랜드의 받은 제안에 도착하고, 브랜드가 수락하거나 거절하면 그 결과가 제안한 쪽 카드에 표시돼요.",
  },
  {
    topic: "proposal",
    question: "보낸 제안을 거둘 수 있나요?",
    answer:
      "네. 제안을 보낸 카드의 ‘제안 완료’ 아래 ‘제안 취소’를 누르면 거둘 수 있어요. 거절된 제안은 ‘다시 제안하기’로 한 번 더 보낼 수 있어요.",
  },
  {
    topic: "schedule",
    featured: true,
    question: "행사나 캠페인 일정은 어떻게 등록하나요?",
    answer:
      "등록 페이지에서 이름과 인원, 협찬 유형을 고르고 달력에서 날짜를 골라요. 하루 일정은 한 번, 기간은 첫날과 마지막 날을 차례로 누르면 되고 최대 90일까지 고를 수 있어요.",
  },
  {
    topic: "message",
    question: "상대에게 직접 물어볼 수 있나요?",
    answer:
      "브랜드·학생단체 상세 페이지의 ‘문의하기’로 메시지를 보낼 수 있어요. 상대가 누구인지 알 수 있도록, 먼저 내 정보에서 우리 소개를 등록해야 해요.",
  },
  {
    topic: "message",
    question: "보낸 메시지를 고치거나 지울 수 있나요?",
    answer:
      "내가 보낸 메시지의 ⋯ 버튼에서 수정하거나 삭제할 수 있어요. 고친 메시지에는 ‘수정됨’, 지운 메시지는 삭제된 메시지로 양쪽 모두에게 보여요. 상대가 읽었는지도 메시지 옆에 표시돼요.",
  },
  {
    topic: "results",
    featured: true,
    question: "협찬 성과는 어떻게 확인하나요?",
    answer:
      "행사 현장의 QR로 참여(스캔), 쿠폰 수령, 매장 방문을 집계해 목표와 비교해요. 학생단체는 성과 측정과 리포트에서, 브랜드는 성과 분석에서 협찬별 ROAS로 확인해요.",
  },
  {
    topic: "results",
    question: "리포트를 PDF로 받을 수 있나요?",
    answer:
      "네. 학생단체는 리포트 페이지의 ‘PDF 리포트 다운로드’, 브랜드는 성과 분석의 ‘분석 보고서 다운로드’로 받아요. 브랜드 보고서에는 전체 요약과 협찬마다의 성과 페이지가 담겨요.",
  },
]
