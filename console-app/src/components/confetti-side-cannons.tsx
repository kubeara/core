import confetti from "canvas-confetti";
import { useEffect } from "react";

const SIDE_CANNONS_DURATION_MS = 2_000;
/** Above deployment UI overlays (up to 1200). */
const SIDE_CANNONS_Z_INDEX = 1_300;

const SIDE_CANNONS_COLORS = [
  "#ffd700",
  "#22c55e",
  "#ef4444",
  "#ffeb3b",
  "#4ade80",
  "#f87171",
  "#fcff42",
  "#84cc16",
  "#dc2626",
  "#a786ff",
  "#fd8bbc",
  "#fff176",
  "#88ff5a",
  "#ff3131",
  "#26ccff",
  "#eca184",
  "#ffa62d",
  "#ff5e7e",
  "#ff36ff",
  "#f8deb1",
];

function rotateColors(offset: number): string[] {
  const normalized = ((offset % SIDE_CANNONS_COLORS.length) + SIDE_CANNONS_COLORS.length) % SIDE_CANNONS_COLORS.length;
  return [
    ...SIDE_CANNONS_COLORS.slice(normalized),
    ...SIDE_CANNONS_COLORS.slice(0, normalized),
  ];
}

/**
 * Magic UI-style side confetti cannons from the left and right (~3s).
 * Starts automatically on mount; unmount cancels the animation loop.
 */
export function ConfettiSideCannons() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const end = Date.now() + SIDE_CANNONS_DURATION_MS;
    let frameId = 0;
    let cancelled = false;
    let colorOffset = 0;

    const frame = () => {
      if (cancelled || Date.now() > end) {
        return;
      }

      const colors = rotateColors(colorOffset);
      colorOffset += 1;

      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        startVelocity: 60,
        origin: { x: 0, y: 0.5 },
        colors,
        zIndex: SIDE_CANNONS_Z_INDEX,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        startVelocity: 60,
        origin: { x: 1, y: 0.5 },
        colors,
        zIndex: SIDE_CANNONS_Z_INDEX,
      });

      frameId = requestAnimationFrame(frame);
    };

    frameId = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, []);

  return null;
}
