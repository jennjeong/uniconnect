import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { t } from "../i18n"
import { formatDay, toIsoDate } from "../lib/date"
import type { Team } from "../types"

// The people running the account (내 정보's 함께 관리하는 사람): the owner,
// co-admins, and invitations still open. The owner invites by email (the
// code goes to that address) and takes people off, which logs them out at
// once; a co-admin sees the list only.
export function TeamModal({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  const [team, setTeam] = useState<Team | null>(null)
  const [draft, setDraft] = useState({ name: "", email: "" })
  const [devCode, setDevCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const owner = team?.you === "owner"

  useEffect(() => {
    api.team().then(
      (result) => setTeam(result.team),
      (caught: unknown) => setError(errorMessage(caught)),
    )
  }, [])

  const run = async (change: () => Promise<{ team: Team; devCode?: string }>, notice: string) => {
    setBusy(true)
    setError("")
    try {
      const result = await change()
      setTeam(result.team)
      setDevCode(result.devCode ?? "")
      onNotice(notice)
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }

  const invite = async () => {
    if (!draft.name.trim() || !draft.email.trim()) return setError(t("초대할 사람의 이름과 이메일을 적어 주세요."))
    const sent = await run(
      () => api.inviteMember({ name: draft.name.trim(), email: draft.email.trim() }),
      t("{email}로 초대 코드를 보냈어요.", { email: draft.email.trim() }),
    )
    if (sent) setDraft({ name: "", email: "" })
  }

  return (
    <Modal name="team" kicker="Team" title={t("함께 관리하는 사람")} onClose={onClose}>
      <div className="auth-form">
        <p className="auth-lead">
          {t("임원 여러 명이 각자의 이메일과 비밀번호로 같은 계정에 로그인해요. 초대받은 사람은 재직 증명 서류 확인을 거치고 2단계 인증을 꼭 설정해요. 탈퇴, 로그인 이메일 바꾸기와 이 목록 관리는 대표만 할 수 있어요.")}
        </p>
        {!team ? (
          <p className="field-hint">{error || t("불러오고 있어요…")}</p>
        ) : (
          <ul className="device-list team-list">
            <li>
              <span>
                <strong>
                  {team.owner.name}
                  <em className="device-current">{t("대표")}</em>
                </strong>
                <small>{team.owner.email}</small>
              </span>
            </li>
            {team.members.map((member) => (
              <li key={member.id}>
                <span>
                  <strong>
                    {member.name}
                    {team.you === member.id && <em className="device-current">{t("나")}</em>}
                  </strong>
                  <small>
                    {member.email} · {t("{date} 합류", { date: formatDay(toIsoDate(new Date(member.addedAt))) })}
                  </small>
                </span>
                {owner && (
                  <button
                    className="cancel-button"
                    disabled={busy}
                    onClick={() => void run(() => api.removeMember(member.id), t("{name}님을 뺐어요. 그 사람의 로그인도 끝났어요.", { name: member.name }))}
                    type="button"
                  >
                    {t("빼기")}
                  </button>
                )}
              </li>
            ))}
            {team.waiting.map((item) => (
              <li className="pending" key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.email} · {t("운영자 서류 확인 중")}
                  </small>
                </span>
              </li>
            ))}
            {team.invites.map((item) => (
              <li className="pending" key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.email} · {t("초대함 · {date}까지", { date: formatDay(toIsoDate(new Date(item.expiresAt))) })}
                  </small>
                </span>
                {owner && (
                  <button
                    className="cancel-button"
                    disabled={busy}
                    onClick={() => void run(() => api.cancelInvite(item.id), t("초대를 취소했어요."))}
                    type="button"
                  >
                    {t("초대 취소")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {owner && (
          <form
            className="team-invite"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void invite()
            }}
          >
            <label>
              {t("이름")}
              <input
                maxLength={30}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder={t("예) 부회장 김하나")}
                value={draft.name}
              />
            </label>
            <label>
              {t("초대할 이메일")}
              <input
                autoComplete="off"
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                placeholder="name@school.ac.kr"
                type="email"
                value={draft.email}
              />
            </label>
            <button className="primary-button wide" disabled={busy} type="submit">
              {t("초대 코드 보내기")}
            </button>
          </form>
        )}
        {devCode && (
          <p className="field-hint">
            {t("개발 모드라서 메일 대신 인증번호를 여기에 보여드려요:")} <strong>{devCode}</strong>
          </p>
        )}
        {team && error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
