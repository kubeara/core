import {
  useCallback,
  useEffect,
  useId,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import "./terminal-scroll-down-button.css";

const SCROLL_THRESHOLD_PX = 48;

function IconChevronDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function useTerminalScrollDown(
  hostRef: RefObject<HTMLDivElement | null>,
  scrollToBottom: () => void,
) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let viewport: Element | null = null;
    let cleanup: (() => void) | undefined;

    const attach = () => {
      viewport = host.querySelector(".xterm-viewport");
      if (!viewport) return false;

      const updateVisibility = () => {
        const distanceFromBottom =
          viewport!.scrollHeight - viewport!.scrollTop - viewport!.clientHeight;
        setVisible(distanceFromBottom >= SCROLL_THRESHOLD_PX);
      };

      updateVisibility();
      viewport.addEventListener("scroll", updateVisibility, { passive: true });

      const observer = new MutationObserver(updateVisibility);
      observer.observe(viewport, { childList: true, subtree: true });

      const resizeObserver = new ResizeObserver(updateVisibility);
      resizeObserver.observe(viewport);

      cleanup = () => {
        viewport?.removeEventListener("scroll", updateVisibility);
        observer.disconnect();
        resizeObserver.disconnect();
      };

      return true;
    };

    if (!attach()) {
      const hostObserver = new MutationObserver(() => {
        if (attach()) {
          hostObserver.disconnect();
        }
      });
      hostObserver.observe(host, { childList: true, subtree: true });

      return () => {
        hostObserver.disconnect();
        cleanup?.();
      };
    }

    return () => cleanup?.();
  }, [hostRef]);

  const handleClick = useCallback(() => {
    scrollToBottom();
    setVisible(false);
  }, [scrollToBottom]);

  return { visible, handleClick };
}

function useTerminalScrollPortalTarget(
  hostRef: RefObject<HTMLDivElement | null>,
  visible: boolean,
) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!visible) {
      setTarget(null);
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    const windowEl = host.closest(".server-terminal-window");
    setTarget(
      (windowEl as HTMLElement | null) ??
        (host.closest(".terminal-viewer-frame") as HTMLElement | null),
    );
  }, [hostRef, visible]);

  return target;
}

type TerminalScrollDownButtonProps = {
  visible: boolean;
  onClick: () => void;
  hostRef: RefObject<HTMLDivElement | null>;
  tooltip?: string;
};

export function TerminalScrollDownButton({
  visible,
  onClick,
  hostRef,
  tooltip = "Go to latest output",
}: TerminalScrollDownButtonProps) {
  const portalTarget = useTerminalScrollPortalTarget(hostRef, visible);
  const tooltipId = useId();

  if (!visible || !portalTarget) return null;

  const content = (
    <div className="terminal-scroll-down-anchor">
      <button
        type="button"
        className="terminal-scroll-down-btn"
        onClick={onClick}
        aria-label={tooltip}
        aria-describedby={tooltipId}
      >
        <IconChevronDown />
      </button>
      <span id={tooltipId} className="terminal-scroll-down-tooltip" role="tooltip">
        {tooltip}
      </span>
    </div>
  );

  return createPortal(content, portalTarget);
}
