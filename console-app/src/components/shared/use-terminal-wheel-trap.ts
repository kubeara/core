import { useEffect, type RefObject } from "react";

function getViewport(host: HTMLElement): HTMLElement | null {
  return host.querySelector(".xterm-viewport");
}

function attachWheelTrap(container: HTMLElement): () => void {
  const viewport = getViewport(container);
  if (!viewport) {
    return () => undefined;
  }

  const stopPageScroll = (event: WheelEvent) => {
    event.stopPropagation();
  };

  const trapBoundaryScroll = (event: WheelEvent) => {
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);

    if (maxScrollTop <= 0) {
      event.preventDefault();
      return;
    }

    const atTop = scrollTop <= 0;
    const atBottom = scrollTop >= maxScrollTop - 1;

    if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
      event.preventDefault();
    }
  };

  container.addEventListener("wheel", stopPageScroll, { passive: true });
  viewport.addEventListener("wheel", trapBoundaryScroll, { passive: false });

  return () => {
    container.removeEventListener("wheel", stopPageScroll);
    viewport.removeEventListener("wheel", trapBoundaryScroll);
  };
}

/**
 * Keeps mouse wheel scrolling inside an xterm terminal so the page does not scroll
 * when the terminal buffer reaches the top or bottom.
 */
export function useTerminalWheelTrap(
  containerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cleanup: (() => void) | undefined;

    const tryAttach = () => {
      if (!getViewport(container)) {
        return false;
      }

      cleanup?.();
      cleanup = attachWheelTrap(container);
      return true;
    };

    if (!tryAttach()) {
      const observer = new MutationObserver(() => {
        if (tryAttach()) {
          observer.disconnect();
        }
      });
      observer.observe(container, { childList: true, subtree: true });

      return () => {
        observer.disconnect();
        cleanup?.();
      };
    }

    return () => cleanup?.();
  }, [containerRef]);
}
