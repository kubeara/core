import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { CustomComposeEditor } from "@/features/deployments/components/custom-compose-editor";
import { validateComposeFile } from "@/features/deployments/api/custom-compose";
import { showErrorToast } from "@/lib/toast";
import { getErrorMessage } from "@/api/api-error";

export type ComposeFileDropzoneProps = {
  accept: string;
  title: string;
  subtitle: string;
  error?: string | null;
  disabled?: boolean;
  secondary?: boolean;
  onFile: (file: File) => void;
};

/**
 * Entire-card clickable drag-and-drop file picker (no separate choose button).
 */
export function ComposeFileDropzone({
  accept,
  title,
  subtitle,
  error,
  disabled,
  secondary,
  onFile,
}: ComposeFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  function openPicker() {
    if (disabled) {
      return;
    }
    inputRef.current?.click();
  }

  function handleFile(file: File | null) {
    if (!file) {
      return;
    }

    onFile(file);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    handleFile(event.dataTransfer.files?.[0] ?? null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  }

  return (
    <div
      className={`custom-compose-upload-dropzone is-clickable${secondary ? " custom-compose-upload-dropzone-secondary" : ""}${isDragActive ? " is-drag-active" : ""}${error ? " has-error" : ""}${disabled ? " is-disabled" : ""}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={title}
      aria-disabled={disabled || undefined}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          handleFile(event.target.files?.[0] ?? null);
        }}
      />

      <div className="custom-compose-upload-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path
            d="M12 16V4m0 0L8 8m4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="custom-compose-upload-copy">
        <p className="custom-compose-upload-title">{title}</p>
        <p className="custom-compose-upload-subtitle">{subtitle}</p>
      </div>
    </div>
  );
}

type ComposeUploadFormProps = {
  disabled?: boolean;
  displayName: string;
  composeYaml: string;
  composeFileName: string;
  displayNameError?: string | null;
  composeError?: string | null;
  onDisplayNameChange: (value: string) => void;
  onComposeLoaded: (yaml: string, fileName: string) => void;
  onComposeChange: (yaml: string) => void;
  onComposeClear: () => void;
};

/**
 * Step 1 form: deployment name, compose upload/edit, and delete/re-upload.
 */
export function ComposeUploadForm({
  disabled,
  displayName,
  composeYaml,
  composeFileName,
  displayNameError,
  composeError,
  onDisplayNameChange,
  onComposeLoaded,
  onComposeChange,
  onComposeClear,
}: ComposeUploadFormProps) {
  const hasCompose = Boolean(composeYaml.trim());

  async function handleComposeFile(file: File) {
    const error = validateComposeFile(file);
    if (error) {
      showErrorToast(error);
      return;
    }

    try {
      const yaml = await file.text();
      onComposeLoaded(yaml, file.name);
    } catch (error) {
      showErrorToast(getErrorMessage(error));
    }
  }

  return (
    <div className="custom-compose-upload-form">
      <div className="custom-compose-upload-toolbar">
        <div className="custom-compose-name-input-wrap custom-compose-name-input-inline">
          <label
            className="custom-compose-name-label"
            htmlFor="compose-upload-deployment-name"
          >
            Deployment Name{" "}
            <span className="custom-compose-required">*</span>
          </label>
          <Input
            id="compose-upload-deployment-name"
            className="custom-compose-name-input"
            value={displayName}
            placeholder="e.g. Production-API"
            autoComplete="off"
            required
            aria-invalid={displayNameError ? true : undefined}
            aria-describedby={
              displayNameError
                ? "compose-upload-deployment-name-error"
                : undefined
            }
            disabled={disabled}
            onChange={(event) => onDisplayNameChange(event.target.value)}
          />
          {displayNameError ? (
            <p
              id="compose-upload-deployment-name-error"
              className="custom-compose-field-error"
              role="alert"
            >
              {displayNameError}
            </p>
          ) : null}
        </div>
      </div>

      {!hasCompose ? (
        <div className="custom-compose-upload-section-body custom-compose-upload-dropzone-wrap">
          <ComposeFileDropzone
            accept=".yml,.yaml,application/x-yaml,text/yaml,text/x-yaml"
            title="Drag and drop docker-compose.yml here"
            subtitle="Click anywhere in this area to choose a .yml or .yaml file"
            error={composeError}
            disabled={disabled}
            onFile={(file) => void handleComposeFile(file)}
          />
          {composeError ? (
            <p className="custom-compose-field-error" role="alert">
              {composeError}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="custom-compose-upload-editor-wrap custom-compose-upload-editor-fill">
          <CustomComposeEditor
            composeYaml={composeYaml}
            envFileContent=""
            showEnvTab={false}
            disabled={disabled}
            height="100%"
            fileLabel={composeFileName || "docker-compose.yml"}
            removeFileLabel="Delete"
            onRemoveFile={onComposeClear}
            onComposeChange={onComposeChange}
          />
          {composeError ? (
            <p className="custom-compose-field-error" role="alert">
              {composeError}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
