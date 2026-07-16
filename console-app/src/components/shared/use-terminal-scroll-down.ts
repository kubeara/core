import {
  useCallback,
  useEffect,
  useState,
  type RefObject,
} from "react";

const SCROLL_THRESHOLD_PX = 48;

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
