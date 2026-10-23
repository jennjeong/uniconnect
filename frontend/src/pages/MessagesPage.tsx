import { BrandMark } from "../components/BrandMark"
import { PageIntro } from "../components/PageIntro"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import type { Conversation } from "../types"

// Conversations with brands (for student groups) or groups (for brands),
// latest first.
export function MessagesPage({
  conversations,
  loggedIn,
  onBack,
  onOpen,
  onLogin,
}: {
  conversations: Conversation[]
  loggedIn: boolean
  onBack: () => void
  onOpen: (conversation: Conversation) => void
  onLogin: () => void
}) {
  return (
    <section className="page-view messages-view">
      <PageIntro
        onBack={onBack}
        eyebrow="Messages"
        title={t("메시지")}
        description={t("협찬 상대와 나눈 대화를 최근 순서로 모았어요.")}
      />

      {!loggedIn ? (
        <div className="day-empty messages-empty">
          <p>{t("로그인하면 브랜드와 학생단체가 서로 메시지를 주고받을 수 있어요.")}</p>
          <button className="primary-button" onClick={onLogin} type="button">
            {t("로그인")}
          </button>
        </div>
      ) : conversations.length === 0 ? (
        <p className="day-empty messages-empty">
          {t("아직 대화가 없어요. 상세 정보에서 문의하기를 눌러 대화를 시작해 보세요.")}
        </p>
      ) : (
        <div className="chat-list stagger">
          {conversations.map((conversation) => (
            <button
              className={conversation.unread > 0 ? "chat-row unread" : "chat-row"}
              key={conversation.id}
              onClick={() => onOpen(conversation)}
              type="button"
            >
              <BrandMark match={conversation.partner} />
              <span className="chat-row-copy">
                <span className="chat-row-head">
                  <strong>{conversation.partner.name}</strong>
                  <small>{conversation.partner.school ?? t(conversation.partner.category)}</small>
                </span>
                <span className="chat-row-preview">
                  {!conversation.lastMessage
                    ? t("아직 메시지가 없어요.")
                    : conversation.lastMessage.deleted
                      ? conversation.lastMessage.mine
                        ? t("메시지를 삭제했어요.")
                        : t("삭제된 메시지예요.")
                      : conversation.lastMessage.mine
                        ? t("나: {text}", { text: conversation.lastMessage.text })
                        : conversation.lastMessage.text}
                </span>
              </span>
              <span className="chat-row-meta">
                {conversation.lastMessage && (
                  <time dateTime={conversation.lastMessage.at}>
                    {formatDateTime(conversation.lastMessage.at)}
                  </time>
                )}
                {conversation.unread > 0 && <em>{conversation.unread}</em>}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
