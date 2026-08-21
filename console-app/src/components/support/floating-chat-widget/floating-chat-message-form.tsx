import { useRef, useState, type SubmitEventHandler } from "react";
import { useAuth } from "@/features/auth/context/use-auth";
import {
  getRecaptchaResponse,
  isRecaptchaRequired,
  resetRecaptcha,
} from "@/components/support/recaptcha";
import { RecaptchaWidget } from "@/components/support/recaptcha-widget";
import { CHAT_WIDGET_MESSAGES as t } from "./chat-widget-messages";
import { appendFloatingChatRecent } from "./floating-chat-recents-storage";
import { submitSupportRequest } from "./support-api";

type FloatingChatMessageFormProps = {
  formId: string;
  onSubmitted?: () => void;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function FloatingChatMessageForm({ formId, onSubmitted }: FloatingChatMessageFormProps) {
  const { user } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formKeyRef = useRef(0);
  const recaptchaWidgetIdRef = useRef<number | null>(null);
  const recaptchaRequired = isRecaptchaRequired();
  const [recaptchaCompleted, setRecaptchaCompleted] = useState(false);
  const submitDisabled =
    status === "loading" || (recaptchaRequired && !recaptchaCompleted);

  const handleSendAgain = () => {
    resetRecaptcha(recaptchaWidgetIdRef.current);
    setRecaptchaCompleted(false);
    formKeyRef.current += 1;
    setStatus("idle");
    setErrorMessage("");
    setFieldErrors({});
  };

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage("");
    setFieldErrors({});

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();

    const errors: Record<string, string> = {};
    if (!name) errors.name = t.nameRequired;
    else if (name.length < 2) errors.name = t.nameMin;
    if (!email) errors.email = t.emailRequired;
    else if (!EMAIL_PATTERN.test(email)) errors.email = t.emailInvalid;
    if (!message) errors.message = t.messageRequired;
    else if (message.length < 10) errors.message = t.messageMin;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatus("idle");
      return;
    }

    if (recaptchaRequired && !getRecaptchaResponse(recaptchaWidgetIdRef.current)) {
      setStatus("idle");
      setErrorMessage(t.captcha);
      return;
    }

    const result = await submitSupportRequest({
      name,
      email,
      topic: "Support",
      message,
    });

    if (!result.ok) {
      setStatus("error");
      setErrorMessage(result.error);
      resetRecaptcha(recaptchaWidgetIdRef.current);
      setRecaptchaCompleted(false);
      return;
    }

    setStatus("success");
    appendFloatingChatRecent({ name, email, message });
    onSubmitted?.();
    form.reset();
    resetRecaptcha(recaptchaWidgetIdRef.current);
    setRecaptchaCompleted(false);
  };

  if (status === "success") {
    return (
      <div className="floating-chat-widget__success" role="status">
        <p className="floating-chat-widget__success-text">{t.success}</p>
        <button
          type="button"
          className="floating-chat-widget__send-again"
          onClick={handleSendAgain}
        >
          {t.sendAgain}
        </button>
      </div>
    );
  }

  return (
    <form
      id={formId}
      key={formKeyRef.current}
      className="floating-chat-widget__form"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="floating-chat-widget__form-fields">
        <label className="floating-chat-widget__field">
          <span className="floating-chat-widget__label">
            {t.name} <span aria-hidden>*</span>
          </span>
          <input
            name="name"
            type="text"
            autoComplete="name"
            defaultValue={user?.name ?? ""}
            className={`floating-chat-widget__input${fieldErrors.name ? " floating-chat-widget__input--invalid" : ""}`}
            readOnly={Boolean(user?.name)}
            aria-invalid={Boolean(fieldErrors.name)}
            onChange={() => setFieldErrors((current) => ({ ...current, name: "" }))}
          />
          {fieldErrors.name ? (
            <p className="floating-chat-widget__field-error" role="alert">
              {fieldErrors.name}
            </p>
          ) : null}
        </label>

        <label className="floating-chat-widget__field">
          <span className="floating-chat-widget__label">
            {t.email} <span aria-hidden>*</span>
          </span>
          <input
            name="email"
            type="text"
            inputMode="email"
            autoComplete="email"
            defaultValue={user?.email ?? ""}
            className={`floating-chat-widget__input${fieldErrors.email ? " floating-chat-widget__input--invalid" : ""}`}
            readOnly={Boolean(user?.email)}
            aria-invalid={Boolean(fieldErrors.email)}
            onChange={() => setFieldErrors((current) => ({ ...current, email: "" }))}
          />
          {fieldErrors.email ? (
            <p className="floating-chat-widget__field-error" role="alert">
              {fieldErrors.email}
            </p>
          ) : null}
        </label>

        <label className="floating-chat-widget__field floating-chat-widget__field--message">
          <span className="floating-chat-widget__label">
            {t.message} <span aria-hidden>*</span>
          </span>
          <textarea
            name="message"
            rows={2}
            className={`floating-chat-widget__input floating-chat-widget__textarea${fieldErrors.message ? " floating-chat-widget__input--invalid" : ""}`}
            disabled={status === "loading"}
            aria-invalid={Boolean(fieldErrors.message)}
            onChange={() => setFieldErrors((current) => ({ ...current, message: "" }))}
          />
          {fieldErrors.message ? (
            <p className="floating-chat-widget__field-error" role="alert">
              {fieldErrors.message}
            </p>
          ) : null}
        </label>

        <RecaptchaWidget
          className="floating-chat-widget__recaptcha"
          onWidgetId={(widgetId) => {
            recaptchaWidgetIdRef.current = widgetId;
          }}
          onCompleted={setRecaptchaCompleted}
        />

        {status === "error" && errorMessage ? (
          <p className="floating-chat-widget__error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>

      <div className="floating-chat-widget__submit-bar">
        <button
          type="submit"
          disabled={submitDisabled}
          className="floating-chat-widget__submit"
          aria-disabled={submitDisabled}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {status === "loading" ? t.submitting : t.submit}
        </button>
      </div>
    </form>
  );
}
