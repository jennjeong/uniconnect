import { useEffect, useState } from "react"

import { api, ApiError, errorMessage } from "../api"
import {
  disputeEventLabels,
  disputeLimits,
  disputeOutcomeLabel,
  disputeReasonLabel,
  disputeReasons,
  disputeStatusLabels,
  snapshotAgreement,
} from "../data/disputes"
import { t } from "../i18n"
import { formatDateTime, formatFullDate } from "../lib/date"
import { documentFromFile, fileSize } from "../lib/documents"
import { saveFile } from "../lib/download"
import { fullWon } from "../lib/sponsorships"
import type { Agreement, Dispute, DisputeEvent, DisputeReason } from "../types"
import { Icon } from "./Icon"

// 협찬 분쟁(#335, backend routes/disputes.ts). 약속이 지켜지지 않을 때 계약서의 어느
// 쪽이든 접수하고, 양쪽이 말과 증빙을 남기며, 운영자가 결론을 기록한다. 결론은
// 기록일 뿐이라 계정, 결제, 후기를 바꾸지 않는다. 협찬 하나에 진행 중인 분쟁은 하나다.
export function DisputePanel({
  agreement,
  onNotice,
}: {
  agreement: Agreement
  onNotice: (message: string) => void
}) {
  const [disputes, setDisputes] = useState<Dispute[]>()
  const [failed, setFailed] = useState("")
  const [writing, setWriting] = useState(false)
  const [reason, setReason] = useState<DisputeReason | "">("")
  const [detail, setDetail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    api.disputes(agreement.id).then(
      (result) => {
        if (!cancelled) setDisputes(result.disputes)
      },
      (problem: unknown) => {
        if (!cancelled) setFailed(errorMessage(problem))
      },
    )
    return () => {
      cancelled = true
    }
  }, [agreement.id])

  const replace = (next: Dispute) =>
    setDisputes((list) => (list ?? []).map((item) => (item.id === next.id ? next : item)))

  const open = disputes?.find((item) => item.status !== "closed")
  const partner = agreement.side === "group" ? agreement.brand.name : agreement.group.name

  const submit = async () => {
    if (busy) return
    if (!reason) {
      setError(t("어떤 일인지 골라 주세요."))
      return
    }
    if (!detail.trim()) {
      setError(t("어떤 일이 있었는지 적어 주세요."))
      return
    }
    setBusy(true)
    setError("")
    try {
      const { dispute } = await api.openDispute({ agreementId: agreement.id, reason, detail: detail.trim() })
      setDisputes((list) => [dispute, ...(list ?? [])])
      setWriting(false)
      setReason("")
      setDetail("")
      onNotice(t("분쟁을 접수했어요. {name}에 알렸어요.", { name: partner }))
    } catch (problem) {
      setError(errorMessage(problem))
    } finally {
      setBusy(false)
    }
  }

  if (failed) return null

  return (
    <section aria-labelledby="agreement-dispute-title" className="agreement-section agreement-dispute" id="agreement-dispute">
      <h2 id="agreement-dispute-title">{t("협찬 분쟁")}</h2>
      {!disputes ? (
        <p className="field-hint">{t("불러오고 있어요…")}</p>
      ) : (
        <>
          {!open &&
            (writing ? (
              <form
                className="dispute-form"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  void submit()
                }}
              >
                <label className="field">
                  <span>{t("어떤 일인가요")}</span>
                  <select onChange={(event) => setReason(event.target.value as DisputeReason)} value={reason}>
                    <option value="">{t("골라 주세요")}</option>
                    {disputeReasons.map((item) => (
                      <option key={item.value} value={item.value}>
                        {t(item.label)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t("있었던 일")}</span>
                  <textarea
                    maxLength={disputeLimits.detail}
                    onChange={(event) => setDetail(event.target.value)}
                    placeholder={t("예) 약속한 날까지 협찬금이 들어오지 않았어요")}
                    rows={4}
                    value={detail}
                  />
                </label>
                <p className="field-hint">
                  {t("접수하면 지금의 계약 내용이 그대로 남고 상대에게 알림이 가요. 운영자의 결론은 기록일 뿐, 결제나 계정을 바꾸지 않아요.")}
                </p>
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="agreement-cancel-actions">
                  <button className="cancel-button" onClick={() => setWriting(false)} type="button">
                    {t("닫기")}
                  </button>
                  <button className="decline-button" disabled={busy} type="submit">
                    {t("분쟁 접수하기")}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="field-hint">
                  {t("약속이 지켜지지 않았고 대화로 풀기 어렵다면, 분쟁을 접수해 운영자에게 기록을 남길 수 있어요.")}
                </p>
                <div className="agreement-cancel-actions">
                  <button className="cancel-button" onClick={() => setWriting(true)} type="button">
                    {t("분쟁 접수")}
                  </button>
                </div>
              </>
            ))}
          {disputes.length > 0 && (
            <ol className="dispute-list">
              {disputes.map((dispute) => (
                <DisputeRecord
                  dispute={dispute}
                  key={dispute.id}
                  onChange={replace}
                  onNotice={onNotice}
                  partner={partner}
                />
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  )
}

export function DisputeRecord({
  dispute,
  partner,
  onChange,
  onNotice,
}: {
  dispute: Dispute
  partner: string
  onChange: (dispute: Dispute) => void
  onNotice: (message: string) => void
}) {
  const [statement, setStatement] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [withdrawing, setWithdrawing] = useState(false)
  const live = dispute.status !== "closed"
  const mine = dispute.events.filter((event) => event.kind === "statement" && event.by === dispute.side).length

  const run = async (work: () => Promise<{ dispute: Dispute }>, notice: string) => {
    if (busy) return false
    setBusy(true)
    setError("")
    try {
      onChange((await work()).dispute)
      onNotice(notice)
      return true
    } catch (problem) {
      setError(problem instanceof Error && !(problem instanceof ApiError) ? problem.message : errorMessage(problem))
      return false
    } finally {
      setBusy(false)
    }
  }

  const who = (event: DisputeEvent) =>
    event.by === "admin" ? t("운영자") : event.by === dispute.side ? t("우리") : partner

  const download = async (evidenceId: string, name: string) => {
    try {
      const blob = await api.disputeEvidence(dispute.id, evidenceId)
      saveFile(name, blob, blob.type)
    } catch (problem) {
      setError(errorMessage(problem))
    }
  }

  return (
    <li className="dispute-record">
      <header>
        <strong>{t(disputeReasonLabel(dispute.reason))}</strong>
        <span className={live ? "dispute-status live" : "dispute-status"}>
          {dispute.decision
            ? t(disputeOutcomeLabel(dispute.decision.outcome))
            : t(disputeStatusLabels[dispute.status])}
        </span>
        <small>
          {dispute.openedBy === dispute.side ? t("우리가 접수") : t("{name}에서 접수", { name: partner })} ·{" "}
          {formatDateTime(dispute.createdAt)}
        </small>
      </header>
      {dispute.left && (
        <p className="dispute-left">
          {dispute.keepUntil
            ? t("탈퇴한 회원이 남긴 내용은 지웠어요. 이 기록은 {date}까지 보관해요.", { date: formatFullDate(dispute.keepUntil.slice(0, 10)) })
            : t("탈퇴한 회원이 남긴 내용은 지웠어요.")}
        </p>
      )}
      {dispute.detail && <p className="dispute-detail">{dispute.detail}</p>}
      {/* 운영자가 보는 것과 같은 사본. 상대가 접수했어도 무엇을 두고 판단하는지 보고
          말과 증빙으로 답할 수 있다. */}
      <details className="dispute-snapshot">
        <summary>{t("접수할 때의 계약 보기")}</summary>
        <p className="dispute-snapshot-state">
          <strong>{t(snapshotAgreement(dispute.snapshot))}</strong> {t("다르면 말과 증빙으로 알려 주세요.")}
        </p>
        <dl>
          <div>
            <dt>{t("협찬액")}</dt>
            <dd>
              {dispute.snapshot.value
                ? t("현금 {cash} · 현물 {inKind}", {
                    cash: fullWon(dispute.snapshot.value.cash),
                    inKind: fullWon(dispute.snapshot.value.inKind),
                  })
                : t("미입력")}
            </dd>
          </div>
          {dispute.snapshot.canceled && (
            <div>
              <dt>{t("취소")}</dt>
              <dd>{t("취소된 협찬")}</dd>
            </div>
          )}
          {dispute.snapshot.clauses && dispute.snapshot.clauses.length > 0 && (
            <div>
              <dt>{t("표준 조항")}</dt>
              <dd>{dispute.snapshot.clauses.map((clause) => t(clause.title)).join(" · ")}</dd>
            </div>
          )}
        </dl>
        <ul>
          {dispute.snapshot.items.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              <span>{item.side === dispute.side ? t("우리") : partner}</span> {item.label}{" "}
              <small>{item.doneAt ? t("끝남 {date}", { date: formatDateTime(item.doneAt) }) : t("안 끝남")}</small>
            </li>
          ))}
        </ul>
      </details>
      <ol className="dispute-events">
        {dispute.events.map((event, index) => {
          const evidence = event.evidenceId ? dispute.evidence.find((item) => item.id === event.evidenceId) : undefined
          return (
            <li className={event.by === "admin" ? "admin" : event.by === dispute.side ? "mine" : undefined} key={`${event.at}-${index}`}>
              <span className="dispute-event-head">
                <strong>{who(event)}</strong> {t(disputeEventLabels[event.kind])}
                <time dateTime={event.at}>{formatDateTime(event.at)}</time>
              </span>
              {event.text && <p>{event.text}</p>}
              {evidence && (
                <button className="underline-link" onClick={() => void download(evidence.id, evidence.name)} type="button">
                  <Icon name="file" size={14} /> {evidence.name} · {fileSize(evidence.size)}
                </button>
              )}
            </li>
          )
        })}
      </ol>
      {dispute.decision?.note && (
        <p className="dispute-decision">
          <strong>{t("운영자의 결론")}</strong> {dispute.decision.note}
        </p>
      )}
      {live && (
        <div className="dispute-tools">
          <label className="field">
            <span>{t("남길 말")}</span>
            <textarea
              disabled={mine >= disputeLimits.statements}
              maxLength={disputeLimits.detail}
              onChange={(event) => setStatement(event.target.value)}
              placeholder={t("남긴 말은 고치거나 지울 수 없어요")}
              rows={3}
              value={statement}
            />
          </label>
          <div className="agreement-cancel-actions">
            <small className="field-hint">
              {t("{count}/{limit}번 남겼어요", { count: mine, limit: disputeLimits.statements })}
            </small>
            <button
              className="primary-button"
              disabled={busy || !statement.trim() || mine >= disputeLimits.statements}
              onClick={() =>
                void run(() => api.addDisputeStatement(dispute.id, statement.trim()), t("말을 남겼어요.")).then(
                  (done) => done && setStatement(""),
                )
              }
              type="button"
            >
              {t("남기기")}
            </button>
          </div>
          {dispute.canAddEvidence ? (
            <label className="dispute-upload">
              <span className="cancel-button">
                <Icon name="clip" size={14} /> {t("증빙 올리기")}
              </span>
              <input
                accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (!file) return
                  void run(
                    async () => api.addDisputeEvidence(dispute.id, await documentFromFile(file)),
                    t("증빙을 올렸어요."),
                  )
                }}
                type="file"
              />
              <small className="field-hint">
                {t("올린 증빙은 상대방과 운영자도 볼 수 있어요. 사진이나 2MB 이하 PDF를 한쪽마다 5개까지 올려요.")}
              </small>
            </label>
          ) : (
            <p className="field-hint">{t("증빙은 한쪽마다 5개까지 올릴 수 있어요.")}</p>
          )}
          {dispute.canWithdraw &&
            (withdrawing ? (
              <div className="agreement-cancel-actions">
                <span className="request-confirm">{t("분쟁을 거둘까요? 기록은 남고 다시 열 수 없어요.")}</span>
                <button className="cancel-button" onClick={() => setWithdrawing(false)} type="button">
                  {t("아니요")}
                </button>
                <button
                  className="decline-button"
                  disabled={busy}
                  onClick={() => void run(() => api.withdrawDispute(dispute.id), t("분쟁을 거뒀어요."))}
                  type="button"
                >
                  {t("거두기")}
                </button>
              </div>
            ) : (
              <div className="agreement-cancel-actions">
                <button className="cancel-button" onClick={() => setWithdrawing(true)} type="button">
                  {t("분쟁 거두기")}
                </button>
              </div>
            ))}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}
