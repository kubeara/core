import { useState } from "react";
import { TooltipHint } from "@/components/ui/tooltip";
import "./copy-button.css";

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="9"
        width="13"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type CopyButtonProps = {
  text: string;
  label?: string;
};

export function CopyButton({ text, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <TooltipHint
      content={
        copied ? (
          <>
            <CheckIcon />
            Copied
          </>
        ) : (
          label
        )
      }
      variant={copied ? "success" : "default"}
      open={copied ? true : undefined}
    >
      <button
        type="button"
        className={`copy-btn ${copied ? "copied" : ""}`}
        onClick={() => void handleCopy()}
        aria-label={copied ? "Copied" : label}
      >
        <CopyIcon />
      </button>
    </TooltipHint>
  );
}
