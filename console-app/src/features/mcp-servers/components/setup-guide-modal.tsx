import { useState } from "react";
import { waitMs } from "@/lib/async-delay";
import {
  getMcpConfigForPreset,
  getMcpConfigLabel,
} from "../lib/mcp-config";
import type { SetupGuide, SetupGuideStep } from "../types";

function getStepCode(step: SetupGuideStep): string | null {
  if (step.configPreset) {
    return getMcpConfigForPreset(step.configPreset);
  }
  if (step.code) {
    return step.code;
  }
  return null;
}

function getStepCodeLabel(step: SetupGuideStep): string {
  if (step.configLabel) {
    return step.configLabel;
  }
  if (step.configPreset) {
    return getMcpConfigLabel(step.configPreset);
  }
  return "mcp.json";
}

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

function CodeBlock({
  code,
  label = "mcp.json",
}: {
  code: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      void waitMs(2000).then(() => setCopied(false));
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="mcp-setup-guide-code-block">
      <div className="mcp-setup-guide-code-header">
        <span className="mcp-setup-guide-code-label">{label}</span>
        <button
          type="button"
          className="mcp-setup-guide-copy-btn"
          onClick={handleCopy}
        >
          <CopyIcon />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

type SetupGuideModalProps = {
  guide: SetupGuide;
  onClose: () => void;
};

export function SetupGuideModal({ guide, onClose }: SetupGuideModalProps) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog mcp-setup-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-guide-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mcp-setup-guide-header">
          <div className="mcp-setup-guide-header-text">
            <span className="mcp-setup-guide-platform">{guide.label}</span>
            <h2 id="setup-guide-modal-title">{guide.title}</h2>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="mcp-setup-guide-body">
          {guide.available ? (
            <>
              <p className="mcp-setup-guide-intro">{guide.intro}</p>

              <section className="mcp-setup-guide-section">
                <h3>What you&apos;ll need</h3>
                <ul className="mcp-setup-guide-requirements">
                  {guide.requirements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="mcp-setup-guide-section">
                <h3>Setup steps</h3>
                <ol className="mcp-setup-guide-steps">
                  {guide.steps.map((step, index) => (
                    <li key={step.title} className="mcp-setup-guide-step">
                      <div className="mcp-setup-guide-step-marker" aria-hidden>
                        {index + 1}
                      </div>
                      <div className="mcp-setup-guide-step-content">
                        <h4>{step.title}</h4>
                        <p>{step.body}</p>
                        {step.example ? (
                          <p className="mcp-setup-guide-example">{step.example}</p>
                        ) : null}
                        {step.followUp ? <p>{step.followUp}</p> : null}
                        {getStepCode(step) ? (
                          <CodeBlock
                            code={getStepCode(step)!}
                            label={getStepCodeLabel(step)}
                          />
                        ) : null}
                        {step.note ? (
                          <p className="mcp-setup-guide-note">{step.note}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {guide.troubleshooting && guide.troubleshooting.length > 0 ? (
                <section className="mcp-setup-guide-section">
                  <h3>Troubleshooting</h3>
                  <ul className="mcp-setup-guide-troubleshooting">
                    {guide.troubleshooting.map((row) => (
                      <li key={row.issue}>
                        <strong>{row.issue}</strong>
                        <span>{row.fix}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {guide.outro ? (
                <section className="mcp-setup-guide-outro">
                  <h3>You&apos;re all set</h3>
                  <p>{guide.outro}</p>
                </section>
              ) : null}
            </>
          ) : (
            <p className="mcp-setup-guide-coming-soon">
              The {guide.label} setup guide is coming soon. Check back later for
              step-by-step instructions.
            </p>
          )}
        </div>

        <div className="modal-actions mcp-setup-guide-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
