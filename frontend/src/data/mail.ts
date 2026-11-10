import { t } from "../i18n"
import type { MailKind } from "../types"

// 회원이 내 정보에서 끌 수 있는 알림 메일의 종류를 순서대로, 각각이 다루는 것과
// 함께. 서버가 같은 종류를 가진다 (backend lib/validation.ts의 mailKinds,
// lib/lists.sync.test.ts가 검사한다).
export const mailKinds: { kind: MailKind; label: string; caption: string }[] = [
  { kind: "proposals", label: t("협찬 제안과 답"), caption: t("새 제안, 보낸 제안의 답, 답을 기다리는 제안, 초대한 가게의 가입") },
  {
    kind: "sponsorships",
    label: t("확정된 협찬 소식"),
    caption: t("계약서 변경과 확인, 협찬 취소, 행사 변경, 후기와 답글"),
  },
  { kind: "messages", label: t("새 메시지"), caption: t("읽지 않은 메시지가 오기 시작할 때") },
  { kind: "reminders", label: t("다가오는 일정"), caption: t("행사 사흘 전부터 한 번") },
  { kind: "digest", label: t("주간 추천 요약"), caption: t("지난 일주일 동안 가입한 잘 맞는 상대, 월요일마다") },
]
