import { useEffect, useState, type ChangeEvent } from "react"

import { api, errorMessage } from "../api"
import { accountTypes } from "../data/roles"
import { t } from "../i18n"
import { toCsv } from "../lib/csv"
import { importColumns, importRows, parseCsv } from "../lib/csvRead"
import { formatDateTime } from "../lib/date"
import { saveFile } from "../lib/download"
import type { ImportAnswer, ImportBatch } from "../types"

type Notice = (message: string) => void
type Rows = Record<string, string>[]

// 양식 파일: 머리글과 한 줄씩의 예, 그 아래에 쓸 수 있는 유형.
function templateCsv() {
  const head = importColumns.map(([label]) => label)
  return toCsv([
    head,
    ["학생단체", "가온 밴드", "밴드 · 음악 동아리", "삼육대학교", "캠퍼스에서 정기 공연을 열어요.", "관객 200명", "공연, 음악"],
    ["브랜드", "봄날 커피", "카페 · 식음료", "서울 노원구 화랑로 815", "학생 행사에 음료를 협찬해요.", "음료 100잔", "카페"],
    [],
    [t("유형(학생단체)"), accountTypes.학생단체.join(" / ")],
    [t("유형(브랜드)"), accountTypes.브랜드.join(" / ")],
  ])
}

// 운영자 콘솔 콘텐츠의 대량 등록(#350). CSV를 읽어 먼저 검사하고(틀린 행은 줄 번호와
// 이유), 맞는 행만 넣는다. 넣은 목록은 주인 계정이 없어 방문자와 데모 계정이 보는
// 예시 목록에 들어가며, 묶음째 지울 수 있다.
export function ImportListings({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [rows, setRows] = useState<Rows>()
  const [file, setFile] = useState("")
  const [preview, setPreview] = useState<ImportAnswer>()
  const [batches, setBatches] = useState<ImportBatch[]>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.adminImportBatches(token).then(
      (answer) => setBatches(answer.batches),
      (error) => onNotice(errorMessage(error)),
    )
  }, [token, onNotice])

  const read = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0]
    event.target.value = ""
    setPreview(undefined)
    setRows(undefined)
    if (!chosen) return
    setFile(chosen.name)
    const parsed = importRows(parseCsv(await chosen.text()))
    if (!parsed) {
      onNotice(t("양식의 머리글(구분, 이름, 유형)이 없어요. 양식을 내려받아 그대로 써 주세요."))
      return
    }
    if (parsed.length === 0) {
      onNotice(t("머리글 아래에 행이 없어요."))
      return
    }
    setRows(parsed)
    setBusy(true)
    try {
      setPreview(await api.adminImportListings(token, parsed, true))
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    if (!rows) return
    setBusy(true)
    try {
      const answer = await api.adminImportListings(token, rows, false)
      setBatches(answer.batches)
      setRows(undefined)
      setPreview(undefined)
      onNotice(t("{count}곳을 등록했어요.", { count: answer.created }))
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (batch: ImportBatch) => {
    setBusy(true)
    try {
      const answer = await api.adminRemoveImport(token, batch.batch)
      setBatches(answer.batches)
      onNotice(
        answer.kept > 0
          ? t("{removed}곳을 지웠어요. 제안이나 대화가 걸린 {kept}곳은 남겼어요.", { removed: answer.removed, kept: answer.kept })
          : t("{removed}곳을 지웠어요.", { removed: answer.removed }),
      )
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const failed = preview?.results.filter((item) => !item.ok) ?? []

  return (
    <div className="console-import">
      <p className="field-hint">
        {t("엑셀에서 'CSV UTF-8'로 저장한 파일을 올려요. 먼저 행마다 검사하고, 맞는 행만 등록해요.")}
        <br />
        {t("등록한 곳은 가입한 계정이 없어서 방문자와 데모 계정이 보는 예시 목록에 들어가요. 회원에게는 회원만 보여요.")}
      </p>
      <div className="console-import-actions">
        <button className="cancel-button" onClick={() => saveFile("uniconnect-대량등록-양식.csv", templateCsv(), "text/csv;charset=utf-8")} type="button">
          {t("양식 내려받기")}
        </button>
        <label className="primary-button console-file">
          {t("CSV 파일 고르기")}
          <input accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={(event) => void read(event)} type="file" />
        </label>
      </div>

      {preview && (
        <section aria-label={t("검사 결과")} className="console-import-preview">
          <p>
            <strong>{file}</strong> · {t("{total}행 중 {valid}행을 등록할 수 있어요.", { total: preview.results.length, valid: preview.valid })}
          </p>
          {failed.length > 0 && (
            <table className="console-table plain">
              <caption className="sr-only">{t("등록할 수 없는 행")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("줄")}</th>
                  <th scope="col">{t("이름")}</th>
                  <th scope="col">{t("이유")}</th>
                </tr>
              </thead>
              <tbody>
                {failed.map((item) => (
                  <tr key={item.row}>
                    {/* 머리글이 1줄이므로 파일의 줄 번호는 행 번호 + 1이다. */}
                    <th scope="row">{item.row + 1}</th>
                    <td>{item.name || "—"}</td>
                    <td>{t(item.message ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="console-import-actions">
            <button className="primary-button" disabled={busy || preview.valid === 0} onClick={() => void commit()} type="button">
              {t("{count}곳 등록하기", { count: preview.valid })}
            </button>
            <button className="cancel-button" disabled={busy} onClick={() => (setPreview(undefined), setRows(undefined))} type="button">
              {t("취소")}
            </button>
          </div>
        </section>
      )}

      <table className="console-table plain">
        <caption className="console-caption">{t("등록한 묶음")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("등록한 때")}</th>
            <th scope="col">{t("학생단체")}</th>
            <th scope="col">{t("브랜드")}</th>
            <th scope="col">
              <span className="sr-only">{t("묶음 지우기")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {(batches ?? []).length === 0 ? (
            <tr>
              <td colSpan={4}>{batches ? t("아직 등록한 묶음이 없어요.") : t("불러오고 있어요…")}</td>
            </tr>
          ) : (
            batches!.map((batch) => (
              <tr key={batch.batch}>
                <th scope="row">{formatDateTime(batch.at)}</th>
                <td>{batch.groups}</td>
                <td>{batch.brands}</td>
                <td>
                  <button
                    aria-label={t("{at}에 등록한 묶음 지우기", { at: formatDateTime(batch.at) })}
                    className="console-inline"
                    disabled={busy}
                    onClick={() => void remove(batch)}
                    type="button"
                  >
                    {t("지우기")}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
