import type { ContainerActionType } from "../types";

const ICON_SIZE = 20;

type ContainerActionIconProps = {
  action: ContainerActionType;
};

export function ContainerActionIcon({ action }: ContainerActionIconProps) {
  switch (action) {
    case "stop":
      return (
        <svg
          width={ICON_SIZE}
          height={ICON_SIZE}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
          <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
        </svg>
      );
    case "restart":
      return (
        <svg
          width={ICON_SIZE}
          height={ICON_SIZE}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M21 3v5h-5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 21v-5h5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "delete":
      return (
        <svg
          width={ICON_SIZE}
          height={ICON_SIZE}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d="M9 5.5h6M10 5.5V4.75A1.25 1.25 0 0 1 11.25 3.5h1.5A1.25 1.25 0 0 1 14 4.75V5.5M7 5.5h10l-.9 12.1a1.5 1.5 0 0 1-1.49 1.4H9.39a1.5 1.5 0 0 1-1.49-1.4L7 5.5Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 9.5v7M14 9.5v7"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return null;
  }
}
