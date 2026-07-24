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

      let pendingVisibilityFrame = 0;

      const updateVisibility = () => {
        const distanceFromBottom =
          viewport!.scrollHeight - viewport!.scrollTop - viewport!.clientHeight;
        setVisible(distanceFromBottom >= SCROLL_THRESHOLD_PX);
      };

      const scheduleVisibilityUpdate = () => {
        cancelAnimationFrame(pendingVisibilityFrame);
        pendingVisibilityFrame = requestAnimationFrame(updateVisibility);
      };

      updateVisibility();
      viewport.addEventListener("scroll", scheduleVisibilityUpdate, {
        passive: true,
      });

      const observer = new MutationObserver(scheduleVisibilityUpdate);
      observer.observe(viewport, { childList: true, subtree: true });

      const resizeObserver = new ResizeObserver(scheduleVisibilityUpdate);
      resizeObserver.observe(viewport);

      cleanup = () => {
        cancelAnimationFrame(pendingVisibilityFrame);
        viewport?.removeEventListener("scroll", scheduleVisibilityUpdate);
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
