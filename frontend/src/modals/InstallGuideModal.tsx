import { Modal } from "../components/Modal"
import { t } from "../i18n"
import { inKakaoTalk, kakaoTalkExternal, type InstallKind } from "../lib/install"

// 브라우저에 자체 설치 대화 상자가 없을 때 uniconnect를 설치하는
// 방법(lib/install.ts). iPhone과 iPad는 공유 시트, 카카오톡이나 다른 앱 안에서
// 연 페이지는 먼저 브라우저로 열기, 그 밖에는 브라우저마다 고유한 방법을
// 안내한다.
export function InstallGuideModal({ kind, onClose }: { kind: InstallKind; onClose: () => void }) {
  return (
    <Modal name="install" kicker="Get the App" title={t("앱 다운로드")} onClose={onClose}>
      <div className="install-guide">
        <p>{t("uniconnect는 스토어를 거치지 않고 이 사이트에서 바로 설치하는 앱이에요.")}</p>
        {kind === "ios" ? (
          <ol className="install-steps">
            <li>{t("공유 버튼을 눌러요. 보이지 않으면 ⋯ 버튼을 먼저 눌러요.")}</li>
            <li>{t("목록에서 ‘홈 화면에 추가’를 눌러요.")}</li>
            <li>{t("‘추가’를 누르면 홈 화면에 uniconnect가 생겨요.")}</li>
          </ol>
        ) : kind === "inapp" ? (
          <>
            <p>{t("카카오톡처럼 다른 앱 안에서 연 페이지는 설치할 수 없어요.")}</p>
            <ol className="install-steps">
              <li>{t("메뉴에서 ‘다른 브라우저로 열기’나 ‘Safari로 열기’를 눌러요.")}</li>
              <li>{t("열린 브라우저에서 ‘앱 다운로드’를 다시 눌러요.")}</li>
            </ol>
          </>
        ) : (
          <>
            <p>{t("이 브라우저에서는 설치 창을 바로 띄울 수 없어요. 쓰는 기기에 맞춰 설치해 주세요.")}</p>
            <ul className="install-devices">
              <li>
                <strong>{t("컴퓨터의 크롬 · 엣지")}</strong>
                <span>{t("주소창 오른쪽의 설치 아이콘을 눌러요.")}</span>
              </li>
              <li>
                <strong>{t("휴대폰")}</strong>
                <span>{t("브라우저 메뉴에서 ‘앱 설치’나 ‘홈 화면에 추가’를 눌러요.")}</span>
              </li>
              <li>
                <strong>{t("Mac의 Safari")}</strong>
                <span>{t("메뉴 막대에서 파일 → ‘Dock에 추가’를 눌러요.")}</span>
              </li>
            </ul>
            <p>{t("이미 설치했다면 홈 화면이나 앱 목록에서 uniconnect를 열어요.")}</p>
          </>
        )}
        <div className="install-actions">
          {kind === "inapp" && inKakaoTalk() && (
            <a className="cancel-button" href={kakaoTalkExternal(window.location.href)}>
              {t("다른 브라우저로 열기")}
            </a>
          )}
          <button className="primary-button" onClick={onClose} type="button">
            {t("알겠어요")}
          </button>
        </div>
      </div>
    </Modal>
  )
}
