import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ContainerActionIcon } from "./container-action-icons";
import {
  CONTAINER_ACTION_LABELS,
  CONTAINER_ACTION_PENDING_LABELS,
} from "../constants/container-action-messages";
import type { ContainerActionType, ServerContainer } from "../types";

/**
 * Checks if the container is running.
 */
function isContainerRunning(container: ServerContainer): boolean {
  const normalized = container.status.toLowerCase();
  if (normalized.includes("exited") || normalized.includes("stopped")) {
    return false;
  }
  if (normalized.includes("dead") || normalized.includes("created")) {
    return false;
  }
  return (
    normalized.includes("up") ||
    normalized.includes("running") ||
    normalized.includes("restarting")
  );
}

/**
 * The props for the ContainerActionsMenu component.
 */
type ContainerActionsMenuProps = {
  container: ServerContainer;
  isPending: boolean;
  pendingAction: { containerId: string | null; action: ContainerActionType } | null;
  onAction: (container: ServerContainer, action: ContainerActionType) => void;
};

/**
 * The ContainerActionsMenu component.
 */
export function ContainerActionsMenu({
  container,
  isPending,
  pendingAction,
  onAction,
}: ContainerActionsMenuProps) {
  const containerId = container.containerId!;
  const showStop = isContainerRunning(container);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    minWidth: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const minWidth = 172;
      const left = Math.min(
        Math.max(8, rect.right - minWidth),
        window.innerWidth - minWidth - 8,
      );

      setMenuPosition({
        top: rect.bottom + 6,
        left,
        minWidth,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function runAction(action: ContainerActionType) {
    setOpen(false);
    onAction(container, action);
  }

  const actionLabel = (action: ContainerActionType): string => {
    if (pendingAction?.containerId !== containerId) {
      return CONTAINER_ACTION_LABELS[action];
    }
    return CONTAINER_ACTION_PENDING_LABELS[action];
  };

  const dropdown =
    open && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="container-actions-menu-dropdown container-actions-menu-dropdown--portal"
            role="menu"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              minWidth: menuPosition.minWidth,
            }}
          >
            {showStop ? (
              <button
                type="button"
                role="menuitem"
                className="container-actions-menu-item"
                disabled={isPending}
                onClick={() => runAction("stop")}
              >
                <span className="container-actions-menu-item-icon container-actions-menu-item-icon--stop">
                  <ContainerActionIcon action="stop" />
                </span>
                {actionLabel("stop")}
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="container-actions-menu-item"
              disabled={isPending}
              onClick={() => runAction("restart")}
            >
              <span className="container-actions-menu-item-icon container-actions-menu-item-icon--restart">
                <ContainerActionIcon action="restart" />
              </span>
              {actionLabel("restart")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="container-actions-menu-item container-actions-menu-item--danger"
              disabled={isPending}
              onClick={() => runAction("delete")}
            >
              <span className="container-actions-menu-item-icon">
                <ContainerActionIcon action="delete" />
              </span>
              {actionLabel("delete")}
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        className={`container-actions-menu${open ? " is-open" : ""}`}
      >
        <button
          ref={triggerRef}
          type="button"
          className="container-actions-menu-trigger"
          aria-label="Container actions"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          disabled={isPending}
          onClick={() => setOpen((value) => !value)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden
          >
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>
      </div>
      {dropdown}
    </>
  );
}
