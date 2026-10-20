import { BrandMark } from "../components/BrandMark"
import { Icon } from "../components/Icon"
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
      <div className="create-head">
        <button aria-label="뒤로" className="back-button" onClick={onBack} type="button">
          <Icon name="chevron" size={18} />
        </button>
        <div>
          <span className="section-kicker dark">MESSAGES</span>
          <p className="section-title">메시지</p>
        </div>
      </div>

      {!loggedIn ? (
        <div className="day-empty messages-empty">
          <p>로그인하면 브랜드와 학생단체가 서로 메시지를 주고받을 수 있어요.</p>
          <button className="primary-button" onClick={onLogin} type="button">
            로그인
          </button>
        </div>
      ) : conversations.length === 0 ? (
        <p className="day-empty messages-empty">
          아직 대화가 없어요. 상세 정보에서 문의하기를 눌러 대화를 시작해 보세요.
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
                  <small>{conversation.partner.school ?? conversation.partner.category}</small>
                </span>
                <span className="chat-row-preview">
                  {conversation.lastMessage
                    ? `${conversation.lastMessage.mine ? "나: " : ""}${conversation.lastMessage.text}`
                    : "아직 메시지가 없어요."}
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
