import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import blackLogo from "../../../../assets/Logo_black.webp";
import mainLogo from "../../../../assets/main_logo.png";
import { CHAT_WIDGET_MESSAGES as t } from "./chat-widget-messages";
import { FloatingChatMessageForm } from "./floating-chat-message-form";
import {
  loadFloatingChatRecents,
  type FloatingChatRecent,
} from "./floating-chat-recents-storage";
import "./floating-chat-widget.css";

type WidgetTab = "message" | "recents";

function ChatLauncherIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6 6l12 12M18 6 6 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RecentsPanel({ items }: { items: FloatingChatRecent[] }) {
  if (items.length === 0) {
    return (
      <div className="floating-chat-widget__recents-empty">
        <p className="floating-chat-widget__recents-empty-title">{t.noMessagesTitle}</p>
        <p className="floating-chat-widget__recents-empty-text">{t.noMessagesBody}</p>
      </div>
    );
  }

  return (
    <ul className="floating-chat-widget__recents-list">
      {items.map((item) => (
        <li key={item.id} className="floating-chat-widget__recents-item">
          <div className="floating-chat-widget__recents-item-head">
            <span className="floating-chat-widget__recents-name">{item.name}</span>
            <time className="floating-chat-widget__recents-time" dateTime={item.submittedAt}>
              {new Date(item.submittedAt).toLocaleString()}
            </time>
          </div>
          <p className="floating-chat-widget__recents-email">{item.email}</p>
          <p className="floating-chat-widget__recents-message">{item.message}</p>
        </li>
      ))}
    </ul>
  );
}

export function FloatingChatWidget() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WidgetTab>("message");
  const [formGeneration, setFormGeneration] = useState(0);
  const [recents, setRecents] = useState<FloatingChatRecent[]>(() => loadFloatingChatRecents());
  const rootRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();
  const formId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setActiveTab("message");
    setFormGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        launcherRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  return (
    <div
      ref={rootRef}
      className={`floating-chat-widget${open ? " floating-chat-widget--open" : ""}`}
    >
      <div
        id={panelId}
        role="dialog"
        aria-modal={open}
        aria-labelledby={titleId}
        aria-hidden={!open}
        className="floating-chat-widget__panel"
      >
        <div className="floating-chat-widget__hero">
          <span id={titleId} className="floating-chat-widget__sr-only">
            {activeTab === "message" ? t.sendMessageTitle : t.recentsTitle}
          </span>
          <img
            src={blackLogo}
            alt="Kubeara"
            width={220}
            height={66}
            className="floating-chat-widget__logo floating-chat-widget__logo--light"
          />
          <img
            src={mainLogo}
            alt="Kubeara"
            width={220}
            height={66}
            className="floating-chat-widget__logo floating-chat-widget__logo--dark"
          />
        </div>

        <div
          className={`floating-chat-widget__card${activeTab === "recents" ? " floating-chat-widget__card--recents" : ""}`}
        >
          {activeTab === "message" ? (
            <FloatingChatMessageForm
              key={formGeneration}
              formId={formId}
              onSubmitted={() => setRecents(loadFloatingChatRecents())}
            />
          ) : (
            <RecentsPanel items={recents} />
          )}
        </div>

        <div className="floating-chat-widget__footer" role="tablist" aria-label={t.widgetAria}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "message"}
            aria-controls={formId}
            className={`floating-chat-widget__footer-tab${activeTab === "message" ? " floating-chat-widget__footer-tab--active" : ""}`}
            aria-label={t.messageTab}
            onClick={() => setActiveTab("message")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "recents"}
            aria-label={t.recentsTab}
            className={`floating-chat-widget__footer-tab${activeTab === "recents" ? " floating-chat-widget__footer-tab--active" : ""}`}
            onClick={() => {
              setRecents(loadFloatingChatRecents());
              setActiveTab("recents");
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <button
        ref={launcherRef}
        type="button"
        className="floating-chat-widget__launcher"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={open ? t.closeChat : t.openChat}
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          setOpen((previous) => {
            if (previous) {
              setActiveTab("message");
              setFormGeneration((value) => value + 1);
            }
            return !previous;
          });
        }}
      >
        {!open ? (
          <span className="floating-chat-widget__tooltip" role="tooltip">
            {t.tooltip}
          </span>
        ) : null}
        <ChatLauncherIcon open={open} />
      </button>
    </div>
  );
}
