import { useState } from "react";
import { SETUP_GUIDES } from "../constants/setup-guides";
import type { SetupGuide } from "../types";
import { SetupGuideModal } from "./setup-guide-modal";

function GuideIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18a2 2 0 0 1 2 2v16a1 1 0 0 1-1.447.894L12 18.118l-6.553 3.776A1 1 0 0 1 4 21V5.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M8 7h8M8 11h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SetupGuidesSection() {
  const [activeGuide, setActiveGuide] = useState<SetupGuide | null>(null);

  return (
    <section className="profile-section-card mcp-setup-guides-section">
      <h2>Setup Guides</h2>
      <p className="profile-section-desc">
        Open the configuration guide for your AI desktop client.
      </p>

      <div className="mcp-setup-guides-grid">
        {SETUP_GUIDES.map((guide) => (
          <button
            key={guide.id}
            type="button"
            className="mcp-setup-guide-card"
            onClick={() => setActiveGuide(guide)}
          >
            <span className="mcp-setup-guide-icon" aria-hidden>
              <GuideIcon />
            </span>
            <span className="mcp-setup-guide-text">
              <span className="mcp-setup-guide-title">{guide.label}</span>
              <span className="mcp-setup-guide-action">
                {guide.available ? "View guide" : "Coming soon"}
              </span>
            </span>
          </button>
        ))}
      </div>

      {activeGuide ? (
        <SetupGuideModal
          guide={activeGuide}
          onClose={() => setActiveGuide(null)}
        />
      ) : null}
    </section>
  );
}
