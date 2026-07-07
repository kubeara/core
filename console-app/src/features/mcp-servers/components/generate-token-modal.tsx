import { useState } from "react";
import { waitMs } from "@/lib/async-delay";
import { GENERIC_ERROR_MESSAGE } from "@/api/api-error";
import { FormFieldLabel } from "@/components/shared/form-field-label";
import { validateRequired } from "@/lib/validation";
import { useCreateMcpApiKeyMutation } from "../hooks";

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

type GenerateTokenModalContentProps = {
    onClose: () => void;
};

function GenerateTokenModalContent({ onClose }: GenerateTokenModalContentProps) {
    const [name, setName] = useState("");
    const [generatedToken, setGeneratedToken] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const createMutation = useCreateMcpApiKeyMutation();

    const isTokenStep = generatedToken !== null;
    const canDismiss = !createMutation.isPending;

    async function handleGenerate(event: React.FormEvent) {
        event.preventDefault();
        setGeneratedToken(null);

        const nameError = validateRequired(name, "Name");
        if (nameError) {
            setFieldError(nameError);
            return;
        }
        setFieldError(null);
        setSubmitError(null);

        try {
            const result = await createMutation.mutateAsync({ name: name.trim() });
            setGeneratedToken(result.token);
        } catch {
            setSubmitError(GENERIC_ERROR_MESSAGE);
        }
    }

    async function handleCopy() {
        if (!generatedToken) return;

        try {
            await navigator.clipboard.writeText(generatedToken);
            setCopied(true);
            void waitMs(2000).then(() => setCopied(false));
        } catch {
            // Clipboard unavailable
        }
    }

    return (
        <div
            className="modal-overlay"
            role="presentation"
            onClick={canDismiss ? onClose : undefined}
        >
            <div
                className="modal-dialog modal-dialog-wide"
                role="dialog"
                aria-modal="true"
                aria-labelledby="generate-token-modal-title"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="modal-header">
                    <h2 id="generate-token-modal-title">
                        {isTokenStep ? "Your token" : "Generate token"}
                    </h2>
                    {canDismiss ? (
                        <button
                            type="button"
                            className="modal-close"
                            aria-label="Close"
                            onClick={onClose}
                        >
                            ×
                        </button>
                    ) : null}
                </header>

                {isTokenStep ? (
                    <div className="mcp-generate-token-modal-body">
                        <p className="mcp-token-notice">
                            Store this token securely. It will not be shown again.
                        </p>
                        <div className="mcp-token-field">
                            <code className="mcp-token-value">{generatedToken}</code>
                            <button
                                type="button"
                                className={`mcp-token-field-copy${copied ? " is-copied" : ""}`}
                                aria-label={copied ? "Copied" : "Copy token"}
                                onClick={handleCopy}
                            >
                                <CopyIcon />
                            </button>
                        </div>
                    </div>
                ) : (
                    <form
                        onSubmit={handleGenerate}
                        className="modal-form mcp-generate-token-modal-form"
                        noValidate
                    >
                        <div className="form-field">
                            <FormFieldLabel htmlFor="mcp-key-name" required>
                                Name
                            </FormFieldLabel>
                            <input
                                id="mcp-key-name"
                                value={name}
                                onChange={(event) => {
                                    setName(event.target.value);
                                    setFieldError(null);
                                    setSubmitError(null);
                                }}
                                placeholder="e.g. Kubera dev team's token"
                                disabled={createMutation.isPending}
                                aria-invalid={fieldError ? true : undefined}
                                aria-describedby={fieldError ? "mcp-key-name-error" : undefined}
                            />
                            {fieldError && (
                                <p
                                    id="mcp-key-name-error"
                                    className="form-field-error"
                                    role="alert"
                                >
                                    {fieldError}
                                </p>
                            )}
                        </div>
                        {submitError ? (
                            <p className="form-field-error" role="alert">
                                {submitError}
                            </p>
                        ) : null}
                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={onClose}
                                disabled={createMutation.isPending}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className={`btn-primary${createMutation.isPending ? " is-loading" : ""}`}
                                disabled={createMutation.isPending}
                                aria-busy={createMutation.isPending}
                            >
                                Generate
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

type GenerateTokenModalProps = {
    open: boolean;
    onClose: () => void;
};

export function GenerateTokenModal({ open, onClose }: GenerateTokenModalProps) {
    if (!open) return null;

    return <GenerateTokenModalContent key="generate-token" onClose={onClose} />;
}
