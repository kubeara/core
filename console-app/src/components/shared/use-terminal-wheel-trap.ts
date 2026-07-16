import { useEffect, type RefObject } from "react";

function getViewport(container: HTMLElement): HTMLElement | null {
  const viewport = container.querySelector(".xterm-viewport");
  return viewport instanceof HTMLElement ? viewport : null;
}

function getHorizontalScrollContainer(
  container: HTMLElement,
): HTMLElement | null {
  const scrollContainer = container.querySelector(".terminal-xterm-hscroll");
  return scrollContainer instanceof HTMLElement ? scrollContainer : null;
}

function getHorizontalWheelDelta(event: WheelEvent): number {
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    return event.deltaX;
  }

  if (event.shiftKey) {
    return event.deltaY;
  }

  return 0;
}

function attachWheelTrap(
  container: HTMLElement,
  wordWrap: boolean,
): () => void {
  const viewport = getViewport(container);
  const hscroll = getHorizontalScrollContainer(container);

  const stopPageScroll = (event: WheelEvent) => {
    event.stopPropagation();
  };

  const trapVerticalBoundaryScroll = (event: WheelEvent) => {
    if (!viewport) return;

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

  const handleHorizontalWheel = (event: WheelEvent) => {
    if (wordWrap || !hscroll) return;

    const horizontalDelta = getHorizontalWheelDelta(event);
    if (horizontalDelta === 0) return;

    const { scrollLeft, scrollWidth, clientWidth } = hscroll;
    const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
    if (maxScrollLeft <= 0) return;

    const nextScrollLeft = Math.min(
      maxScrollLeft,
      Math.max(0, scrollLeft + horizontalDelta),
    );

    if (nextScrollLeft === scrollLeft) {
      event.preventDefault();
      return;
    }

    hscroll.scrollLeft = nextScrollLeft;
    event.preventDefault();
    event.stopPropagation();
  };

  const trapHorizontalBoundaryScroll = (event: WheelEvent) => {
    if (wordWrap || !hscroll) return;

    const horizontalDelta = getHorizontalWheelDelta(event);
    if (horizontalDelta === 0) return;

    const { scrollLeft, scrollWidth, clientWidth } = hscroll;
    const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);

    if (maxScrollLeft <= 0) {
      event.preventDefault();
      return;
    }

    const atLeft = scrollLeft <= 0;
    const atRight = scrollLeft >= maxScrollLeft - 1;

    if (
      (horizontalDelta < 0 && atLeft) ||
      (horizontalDelta > 0 && atRight)
    ) {
      event.preventDefault();
    }
  };

  const horizontalWheelTargets = [container, viewport, hscroll].filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );

  container.addEventListener("wheel", stopPageScroll, { passive: true });
  viewport?.addEventListener("wheel", trapVerticalBoundaryScroll, {
    passive: false,
  });

  for (const target of horizontalWheelTargets) {
    target.addEventListener("wheel", handleHorizontalWheel, { passive: false });
  }

  hscroll?.addEventListener("wheel", trapHorizontalBoundaryScroll, {
    passive: false,
  });

  return () => {
    container.removeEventListener("wheel", stopPageScroll);
    viewport?.removeEventListener("wheel", trapVerticalBoundaryScroll);

    for (const target of horizontalWheelTargets) {
      target.removeEventListener("wheel", handleHorizontalWheel);
    }

    hscroll?.removeEventListener("wheel", trapHorizontalBoundaryScroll);
  };
}

/**
 * Keeps mouse wheel scrolling inside an xterm terminal so the page does not scroll
 * when the terminal buffer reaches the top or bottom, or when horizontal overflow
 * reaches the left or right edge.
 */
export function useTerminalWheelTrap(
  containerRef: RefObject<HTMLElement | null>,
  wordWrap = true,
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
      cleanup = attachWheelTrap(container, wordWrap);
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
  }, [containerRef, wordWrap]);
}
