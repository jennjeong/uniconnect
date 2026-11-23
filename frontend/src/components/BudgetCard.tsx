import { useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "../api";
import { lang, t } from "../i18n";
import { formatFullDate } from "../lib/date";
import { fullWon } from "../lib/sponsorships";
import type { BudgetQuarter, BudgetView } from "../types";

// "2026-Q4" → "2026년 4분기" / "Q4 2026".
export const quarterLabel = (quarter: string) =>
  lang === "en"
    ? `Q${quarter.slice(6)} ${quarter.slice(0, 4)}`
    : t("{year}년 {quarter}분기", {
        year: quarter.slice(0, 4),
        quarter: quarter.slice(6),
      });

// 예산 대비 집행과 예정의 비율(0–100). 예산을 넘으면 막대는 꽉 차고 넘었다고 적는다.
export function budgetShares(
  row: Pick<BudgetQuarter, "budget" | "spent" | "planned">,
) {
  if (!row.budget)
    return { spent: 0, planned: 0, left: null as number | null, over: false };
  const spent = Math.min(100, (row.spent / row.budget) * 100);
  const planned = Math.min(100 - spent, (row.planned / row.budget) * 100);
  const left = row.budget - row.spent - row.planned;
  return { spent, planned, left, over: left < 0 };
}

const digits = (value: string) => Number(value.replace(/[^0-9]/g, "")) || 0;

// 성과 분석의 분기별 협찬 예산(#336, backend lib/budget.ts). 이번 분기의 예산, 집행,
// 예정, 남은 금액을 막대와 함께 보이고, 아래에 지난 3개 분기부터 다음 2개 분기까지를
// 표로 보인다. 방문자와 데모 계정은 데모 브랜드의 것을 읽기만 한다.
export function BudgetCard() {
  const [view, setView] = useState<BudgetView>();
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.budget().then(
      (result) => {
        if (!cancelled) setView(result);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!view) return null;
  const current =
    view.quarters.find((row) => row.quarter === view.current) ??
    view.quarters[0];
  const shares = budgetShares(current);
  const others = view.quarters.filter((row) => row.quarter !== current.quarter);
  const editingOther = others.find((row) => row.quarter === editing);

  const startEdit = (row: BudgetQuarter) => {
    setEditing(row.quarter);
    setDraft(row.budget ? row.budget.toLocaleString("ko-KR") : "");
    setError("");
  };

  const save = async (event: FormEvent, amount: number | null) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      setView(await api.setBudget(editing, amount));
      setEditing(undefined);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const editor = (row: BudgetQuarter) => (
    <form
      className="budget-editor"
      onSubmit={(event) => void save(event, digits(draft))}
    >
      <label>
        {t("{quarter} 예산", { quarter: quarterLabel(row.quarter) })}
        <input
          autoFocus
          inputMode="numeric"
          onChange={(event) =>
            setDraft(digits(event.target.value).toLocaleString("ko-KR"))
          }
          value={draft}
        />
      </label>
      <div className="budget-editor-actions">
        <button className="primary-button" disabled={busy} type="submit">
          {t("저장")}
        </button>
        {row.budget !== null && (
          <button
            className="cancel-button"
            disabled={busy}
            onClick={(event) => void save(event, null)}
            type="button"
          >
            {t("예산 지우기")}
          </button>
        )}
        <button
          className="cancel-button"
          disabled={busy}
          onClick={() => setEditing(undefined)}
          type="button"
        >
          {t("취소")}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );

  return (
    <section
      aria-labelledby="budget-title"
      className="analytics-card budget-card"
    >
      <header className="portfolio-head">
        <div>
          <p className="section-title" id="budget-title">
            {t("분기 협찬 예산")}
          </p>
          <p className="field-hint">
            {t(
              "분기마다 예산을 정하고, 수락한 협찬이 얼마를 썼고 얼마가 남았는지 봐요.",
            )}
          </p>
        </div>
      </header>

      <div className="budget-now">
        <p className="budget-quarter">
          <strong>{quarterLabel(current.quarter)}</strong>
          <small>
            {formatFullDate(current.start)} ~ {formatFullDate(current.end)}
          </small>
        </p>
        <dl className="portfolio-totals">
          <div>
            <dt>{t("예산")}</dt>
            <dd>
              {current.budget === null
                ? t("정하지 않음")
                : fullWon(current.budget)}
            </dd>
          </div>
          <div>
            <dt>{t("집행")}</dt>
            <dd>{fullWon(current.spent)}</dd>
          </div>
          <div>
            <dt>{t("예정")}</dt>
            <dd>{fullWon(current.planned)}</dd>
          </div>
          <div>
            <dt>{shares.over ? t("초과") : t("남은 금액")}</dt>
            <dd className={shares.over ? "budget-over" : undefined}>
              {shares.left === null ? "—" : fullWon(Math.abs(shares.left))}
            </dd>
          </div>
        </dl>
        {current.budget !== null && (
          <div
            aria-label={t("예산의 {spent}% 집행 · {planned}% 예정", {
              spent: Math.round(shares.spent),
              planned: Math.round(shares.planned),
            })}
            className="budget-meter"
            role="img"
          >
            <i
              className="budget-meter-spent"
              style={{ width: `${shares.spent}%` }}
            />
            <i
              className="budget-meter-planned"
              style={{ width: `${shares.planned}%` }}
            />
          </div>
        )}
        {current.unpriced > 0 && (
          <p className="field-hint">
            {t("금액이 정해지지 않은 협찬 {count}건은 더하지 않았어요.", {
              count: current.unpriced,
            })}
          </p>
        )}
        {view.editable &&
          (editing === current.quarter ? (
            editor(current)
          ) : (
            <button
              className="detail-button budget-edit"
              onClick={() => startEdit(current)}
              type="button"
            >
              {current.budget === null
                ? t("이번 분기 예산 정하기")
                : t("이번 분기 예산 바꾸기")}
            </button>
          ))}
      </div>

      {/* 좁은 화면에서 표가 옆으로 넘기므로 키보드로도 넘길 수 있게 초점을 받는다. */}
      <div
        aria-label={t("분기별 예산과 집행")}
        className="budget-table-wrap"
        role="region"
        tabIndex={0}
      >
        <table className="budget-table">
          <thead>
            <tr>
              <th scope="col">{t("분기")}</th>
              <th scope="col">{t("예산")}</th>
              <th scope="col">{t("집행")}</th>
              <th scope="col">{t("예정")}</th>
              <th scope="col">{t("협찬")}</th>
              {view.editable && (
                <th scope="col">
                  <span className="sr-only">{t("예산 정하기")}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {others.map((row) => (
              <tr key={row.quarter}>
                <th scope="row">{quarterLabel(row.quarter)}</th>
                <td>{row.budget === null ? "—" : fullWon(row.budget)}</td>
                <td>{fullWon(row.spent)}</td>
                <td>{fullWon(row.planned)}</td>
                <td>{t("{count}건", { count: row.count })}</td>
                {view.editable && (
                  <td>
                    <button
                      aria-label={t("{quarter} 예산 정하기", {
                        quarter: quarterLabel(row.quarter),
                      })}
                      className="row-button"
                      onClick={() => startEdit(row)}
                      type="button"
                    >
                      {t("정하기")}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editingOther && editor(editingOther)}
      <p className="field-hint">
        {t(
          "집행은 행사 날이 지난 협찬, 예정은 수락했고 날이 남은 협찬이에요. 협찬 금액은 현금과 현물을 더한 값이에요.",
        )}
      </p>
    </section>
  );
}
