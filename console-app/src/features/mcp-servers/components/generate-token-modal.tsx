import { useState } from "react";
import { CopyButton } from "@/components/shared/copy-button";
import { API_ERROR_MESSAGES } from "@/constants/error-messages";
import { FormFieldLabel } from "@/components/shared/form-field-label";
import { validateRequired } from "@/lib/validation";
import { useCreateMcpApiKeyMutation } from "../hooks";

type GenerateTokenModalContentProps = {
    onClose: () => void;
};

function GenerateTokenModalContent({ onClose }: GenerateTokenModalContentProps) {
    const [name, setName] = useState("");
    const [generatedToken, setGeneratedToken] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
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
            setSubmitError(API_ERROR_MESSAGES.GENERIC);
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
                            <div className="mcp-token-field-copy-wrap">
                                <CopyButton
                                    text={generatedToken}
                                    label="Copy token"
                                />
                            </div>
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
                                placeholder="e.g. Kubeara dev team's token"
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
