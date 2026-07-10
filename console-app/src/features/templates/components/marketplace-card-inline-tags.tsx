import { useLayoutEffect, useRef, useState } from "react";
import { TooltipHint } from "@/components/ui/tooltip";

const TAG_GAP_PX = 6;

type MarketplaceCardInlineTagsProps = {
  tags: string[];
  ariaLabel: string;
  className?: string;
  tagClassName?: string;
};

/**
 * Measures the width of the overflow badge.
 * @param element 
 * @param overflowCount 
 * @returns 
 */
function measureOverflowBadgeWidth(
  element: HTMLElement | null,
  overflowCount: number,
): number {
  if (!element || overflowCount <= 0) {
    return 0;
  }

  element.textContent = `+${overflowCount}`;
  return element.offsetWidth;
}

/**
 * Computes the number of tags that can be displayed within the available width.
 * @param availableWidth 
 * @param tagWidths 
 * @param overflowMeasureEl 
 * @param gap 
 * @returns 
 */
function computeVisibleTagCount(
  availableWidth: number,
  tagWidths: number[],
  overflowMeasureEl: HTMLElement | null,
  gap: number,
): number {
  const total = tagWidths.length;
  if (total === 0 || availableWidth <= 0) {
    return 0;
  }

  for (let visible = total; visible >= 1; visible -= 1) {
    const overflow = total - visible;
    let usedWidth = tagWidths
      .slice(0, visible)
      .reduce((sum, width, index) => sum + width + (index > 0 ? gap : 0), 0);

    if (overflow > 0) {
      usedWidth += gap + measureOverflowBadgeWidth(overflowMeasureEl, overflow);
    }

    if (usedWidth <= availableWidth) {
      return visible;
    }
  }

  return 1;
}

/**
 * Props for the OverflowTagBadge component.
 * @param overflowCount 
 * @param hiddenTags 
 */
type OverflowTagBadgeProps = {
  overflowCount: number;
  hiddenTags: string[];
};

/**
 * Renders a badge for the overflow of tags.
 * @param overflowCount 
 * @param hiddenTags 
 * @returns 
 */
function OverflowTagBadge({ overflowCount, hiddenTags }: OverflowTagBadgeProps) {
  const tooltipLabel = hiddenTags.join(", ");

  return (
    <TooltipHint content={tooltipLabel} multiline>
      <li className="marketplace-card-tag marketplace-card-tag-overflow">
        +{overflowCount}
      </li>
    </TooltipHint>
  );
}
/**
 * Renders a list of tags inline.
 * @param tags 
 * @param ariaLabel 
 * @param className 
 * @param tagClassName 
 * @returns 
 */
export function MarketplaceCardInlineTags({
  tags,
  ariaLabel,
  className = "",
  tagClassName = "",
}: MarketplaceCardInlineTagsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measureRoot = measureRef.current;
    if (!container || !measureRoot || tags.length === 0) {
      setVisibleCount(tags.length);
      return;
    }

    const tagMeasureElements = measureRoot.querySelectorAll<HTMLElement>(
      "[data-tag-measure]",
    );
    const overflowMeasureEl = measureRoot.querySelector<HTMLElement>(
      "[data-overflow-measure]",
    );

    const updateVisibleCount = () => {
      const availableWidth = container.clientWidth;
      if (availableWidth <= 0) {
        return;
      }

      const tagWidths = Array.from(tagMeasureElements).map(
        (element) => element.offsetWidth,
      );

      setVisibleCount(
        computeVisibleTagCount(
          availableWidth,
          tagWidths,
          overflowMeasureEl,
          TAG_GAP_PX,
        ),
      );
    };

    updateVisibleCount();

    const resizeObserver = new ResizeObserver(updateVisibleCount);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [tags]);

  if (tags.length === 0) {
    return null;
  }

  const overflowCount = Math.max(0, tags.length - visibleCount);
  const hiddenTags = tags.slice(visibleCount);
  const tagClass = tagClassName
    ? `marketplace-card-tag ${tagClassName}`
    : "marketplace-card-tag";

  return (
    <div
      ref={containerRef}
      className={`marketplace-card-inline-tags${className ? ` ${className}` : ""}`}
    >
      <div
        ref={measureRef}
        className="marketplace-card-tags-measure"
        aria-hidden="true"
      >
        {tags.map((tag) => (
          <span key={tag} data-tag-measure className={tagClass}>
            {tag}
          </span>
        ))}
        <span
          data-overflow-measure
          className="marketplace-card-tag marketplace-card-tag-overflow"
        >
          +99
        </span>
      </div>

      <ul
        className="marketplace-card-tags marketplace-card-tags--inline"
        aria-label={ariaLabel}
      >
        {tags.slice(0, visibleCount).map((tag) => (
          <li key={tag} className={tagClass}>
            {tag}
          </li>
        ))}
        {overflowCount > 0 ? (
          <OverflowTagBadge
            overflowCount={overflowCount}
            hiddenTags={hiddenTags}
          />
        ) : null}
      </ul>
    </div>
  );
}
