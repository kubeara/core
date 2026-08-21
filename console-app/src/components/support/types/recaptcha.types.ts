export interface GrecaptchaRenderParameters {
  sitekey: string;
  callback?: () => void;
  "expired-callback"?: () => void;
}

export interface Grecaptcha {
  ready: (callback: () => void) => void;
  render: (container: HTMLElement, parameters: GrecaptchaRenderParameters) => number;
  reset: (optWidgetId?: number) => void;
  getResponse: (optWidgetId?: number) => string;
}

export type RecaptchaWidgetProps = {
  className?: string;
  onWidgetId?: (widgetId: number) => void;
  onCompleted?: (completed: boolean) => void;
};

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

export {};
