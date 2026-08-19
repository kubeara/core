import { useEffect, useRef } from "react";
import {
  getRecaptchaSiteKey,
  waitForRecaptcha,
} from "./recaptcha";
import type { RecaptchaWidgetProps } from "./types/recaptcha.types";

/** Loads Google reCAPTCHA v2 when a site key is configured (same as landing page). */
export function RecaptchaScript() {
  const siteKey = getRecaptchaSiteKey();

  useEffect(() => {
    if (!siteKey) return;
    void waitForRecaptcha().catch(() => undefined);
  }, [siteKey]);

  return null;
}

export function RecaptchaWidget({
  className,
  onWidgetId,
  onCompleted,
}: RecaptchaWidgetProps) {
  const siteKey = getRecaptchaSiteKey();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const onWidgetIdRef = useRef(onWidgetId);
  const onCompletedRef = useRef(onCompleted);
  onWidgetIdRef.current = onWidgetId;
  onCompletedRef.current = onCompleted;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    const renderWidget = () => {
      if (!containerRef.current || widgetIdRef.current !== null) return;
      if (!window.grecaptcha?.render) return;

      const widgetId = window.grecaptcha.render(containerRef.current, {
        sitekey: siteKey,
        callback: () => onCompletedRef.current?.(true),
        "expired-callback": () => onCompletedRef.current?.(false),
      });
      widgetIdRef.current = widgetId;
      onWidgetIdRef.current?.(widgetId);
    };

    if (window.grecaptcha?.ready) {
      window.grecaptcha.ready(renderWidget);
      return;
    }

    const interval = window.setInterval(() => {
      if (!window.grecaptcha?.ready) return;
      window.clearInterval(interval);
      window.grecaptcha.ready(renderWidget);
    }, 100);

    return () => window.clearInterval(interval);
  }, [siteKey]);

  useEffect(() => {
    return () => {
      const widgetId = widgetIdRef.current;
      widgetIdRef.current = null;
      onCompletedRef.current?.(false);
      if (widgetId !== null) {
        window.grecaptcha?.reset(widgetId);
      }
    };
  }, []);

  if (!siteKey) return null;

  return (
    <div
      ref={containerRef}
      className={className}
      aria-label="reCAPTCHA verification"
    />
  );
}
