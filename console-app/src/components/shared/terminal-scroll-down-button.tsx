import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { TooltipHint } from "@/components/ui/tooltip";
import "./terminal-scroll-down-button.css";

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

  if (!visible || !portalTarget) return null;

  const content = (
    <div className="terminal-scroll-down-anchor">
      <TooltipHint content={tooltip} side="top" align="end">
        <button
          type="button"
          className="terminal-scroll-down-btn"
          onClick={onClick}
          aria-label={tooltip}
        >
          <IconChevronDown />
        </button>
      </TooltipHint>
    </div>
  );

  return createPortal(content, portalTarget);
}
