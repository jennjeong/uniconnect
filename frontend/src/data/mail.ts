import { t } from "../i18n"
import type { MailKind } from "../types"

// The kinds of notice email a member can turn off in 내 정보, in order, with
// what each covers; the server lists the same kinds (backend
// lib/validation.ts mailKinds; lib/lists.sync.test.ts checks).
export const mailKinds: { kind: MailKind; label: string; caption: string }[] = [
  { kind: "proposals", label: t("협찬 제안과 답"), caption: t("새 제안, 보낸 제안의 답, 초대한 가게의 가입") },
  {
    kind: "sponsorships",
    label: t("확정된 협찬 소식"),
    caption: t("계약서 변경과 확인, 협찬 취소, 행사 변경, 후기와 답글"),
  },
  { kind: "messages", label: t("새 메시지"), caption: t("읽지 않은 메시지가 오기 시작할 때") },
  { kind: "reminders", label: t("다가오는 일정"), caption: t("행사 사흘 전부터 한 번") },
  { kind: "digest", label: t("주간 추천 요약"), caption: t("지난 일주일 동안 가입한 잘 맞는 상대, 월요일마다") },
]
