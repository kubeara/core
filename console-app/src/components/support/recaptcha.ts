import {
  RECAPTCHA_SCRIPT_ID,
  RECAPTCHA_SCRIPT_SRC,
} from "./constants/recaptcha.constants";
import "./types/recaptcha.types";

export function getRecaptchaSiteKey(): string {
  return import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim() ?? "";
}

export function isRecaptchaRequired(): boolean {
  return Boolean(getRecaptchaSiteKey());
}

function loadRecaptchaScript(): Promise<void> {
  if (window.grecaptcha?.ready) {
    return new Promise((resolve) => window.grecaptcha!.ready(resolve));
  }

  const existing = document.getElementById(RECAPTCHA_SCRIPT_ID);
  if (existing) {
    return new Promise((resolve) => {
      const wait = window.setInterval(() => {
        if (!window.grecaptcha?.ready) return;
        window.clearInterval(wait);
        window.grecaptcha.ready(resolve);
      }, 100);
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = RECAPTCHA_SCRIPT_ID;
    script.src = RECAPTCHA_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => window.grecaptcha?.ready(() => resolve());
    script.onerror = () => reject(new Error("Failed to load reCAPTCHA"));
    document.head.appendChild(script);
  });
}

export function waitForRecaptcha(): Promise<void> {
  const siteKey = getRecaptchaSiteKey();
  if (!siteKey) {
    return Promise.resolve();
  }
  return loadRecaptchaScript();
}

export function getRecaptchaResponse(widgetId: number | null): string {
  if (widgetId === null || !window.grecaptcha) return "";
  return window.grecaptcha.getResponse(widgetId) ?? "";
}

export function resetRecaptcha(widgetId: number | null) {
  if (widgetId !== null) {
    window.grecaptcha?.reset(widgetId);
  }
}
