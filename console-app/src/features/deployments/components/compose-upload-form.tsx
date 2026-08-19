import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import {
  getCustomComposeDisplayNameValidationError,
  normalizeCustomComposeDisplayName,
} from "@/features/deployments/api/custom-compose";
import { showErrorToast } from "@/lib/toast";
import { getErrorMessage } from "@/api/api-error";

const COMPOSE_EXTENSIONS = [".yml", ".yaml"];
const ENV_EXTENSIONS = [".env"];

type UploadTarget = "compose" | "env";

export type ComposeUploadFormData = {
  composeYaml: string;
  envFileContent: string;
  displayName: string;
  composeFileName: string;
  envFileName?: string;
};

type ComposeUploadFormProps = {
  disabled?: boolean;
  onSubmit: (data: ComposeUploadFormData) => void;
};

/**
 * Validates a Docker Compose file.
 * @param file - The file to validate.
 * @returns An error message if the file is not a valid Docker Compose file, otherwise null.
 */
function validateComposeFile(file: File | null): string | null {
  if (!file) {
    return "Please select a Docker Compose file";
  }

  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!COMPOSE_EXTENSIONS.includes(extension)) {
    return "Please upload a .yml or .yaml Docker Compose file";
  }

  return null;
}

/**
 * Validates an environment file.
 * @param file - The file to validate.
 * @returns An error message if the file is not a valid environment file, otherwise null.
 */
function validateEnvFile(file: File | null): string | null {
  if (!file) {
    return null;
  }

  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ENV_EXTENSIONS.includes(extension) && file.name !== ".env") {
    return "Please upload a .env file";
  }

  return null;
}

/**
 * Reusable form for uploading a Docker Compose YAML and optional .env file
 * with a deployment name. Handles validation, drag-and-drop, and file reading.
 */
export function ComposeUploadForm({ disabled, onSubmit }: ComposeUploadFormProps) {
  const composeInputRef = useRef<HTMLInputElement>(null);
  const envInputRef = useRef<HTMLInputElement>(null);
  const [deploymentName, setDeploymentName] = useState("");
  const [deploymentNameError, setDeploymentNameError] = useState<string | null>(
    null,
  );
  const [selectedComposeFile, setSelectedComposeFile] = useState<File | null>(
    null,
  );
  const [selectedEnvFile, setSelectedEnvFile] = useState<File | null>(null);
  const [composeFileError, setComposeFileError] = useState<string | null>(null);
  const [envFileError, setEnvFileError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeDropTarget, setActiveDropTarget] = useState<UploadTarget | null>(
    null,
  );

  /**
   * Handles the input of a Docker Compose file.
   * @param file - The file to handle.
   */
  function handleComposeFileInput(file: File | null) {
    if (!file) {
      setSelectedComposeFile(null);
      setComposeFileError(null);
      return;
    }

    const error = validateComposeFile(file);
    if (error) {
      setSelectedComposeFile(null);
      setComposeFileError(error);
      if (composeInputRef.current) {
        composeInputRef.current.value = "";
      }
      return;
    }

    setSelectedComposeFile(file);
    setComposeFileError(null);
  }

  /**
   * Handles the input of an environment file.
   * @param file - The file to handle.
   */
  function handleEnvFileInput(file: File | null) {
    if (!file) {
      setSelectedEnvFile(null);
      setEnvFileError(null);
      return;
    }

    const error = validateEnvFile(file);
    if (error) {
      setSelectedEnvFile(null);
      setEnvFileError(error);
      if (envInputRef.current) {
        envInputRef.current.value = "";
      }
      return;
    }

    setSelectedEnvFile(file);
    setEnvFileError(null);
  }

  /**
   * Handles the submission of the form.
   * @param event - The form event.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nameError = getCustomComposeDisplayNameValidationError(deploymentName);
    setDeploymentNameError(nameError);

    const nextComposeError = validateComposeFile(selectedComposeFile);
    setComposeFileError(nextComposeError);

    const nextEnvError = validateEnvFile(selectedEnvFile);
    setEnvFileError(nextEnvError);

    if (nameError || nextComposeError || nextEnvError || !selectedComposeFile) {
      return;
    }

    setIsSubmitting(true);
    try {
      const composeYaml = await selectedComposeFile.text();
      const envFileContent = selectedEnvFile
        ? await selectedEnvFile.text()
        : "";
      const displayName = normalizeCustomComposeDisplayName(deploymentName);

      onSubmit({
        composeYaml,
        envFileContent,
        displayName,
        composeFileName: selectedComposeFile.name,
        envFileName: selectedEnvFile?.name,
      });
    } catch (error) {
      showErrorToast(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * Handles the drag over event.
   * @param event - The drag over event.
   * @param target - The target of the drag over event.
   */
  function handleDragOver(event: DragEvent<HTMLDivElement>, target: UploadTarget) {
    event.preventDefault();
    setActiveDropTarget(target);
  }

  /**
   * Handles the drag leave event.
   * @param event - The drag leave event.
   */
  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActiveDropTarget(null);
  }

  /**
   * Handles the drop event.
   * @param event - The drop event.
   * @param target - The target of the drop event.
   */
  function handleDrop(event: DragEvent<HTMLDivElement>, target: UploadTarget) {
    event.preventDefault();
    setActiveDropTarget(null);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (target === "compose") {
      handleComposeFileInput(file);
      return;
    }
    handleEnvFileInput(file);
  }

  const isBusy = disabled || isSubmitting;

  return (
    <form
      className="custom-compose-upload-form"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <section className="custom-compose-upload-section">
        <header className="deploy-vars-section-header custom-compose-upload-section-header">
          <h2>Deployment name</h2>
          <p>
            All containers in this stack will appear under this name on the
            server overview.
          </p>
        </header>

        <div className="custom-compose-upload-section-body">
          <div className="custom-compose-name-input-wrap">
            <label
              className="custom-compose-name-label"
              htmlFor="compose-upload-deployment-name"
            >
              Name <span className="custom-compose-required">*</span>
            </label>
            <Input
              id="compose-upload-deployment-name"
              className="custom-compose-name-input"
              value={deploymentName}
              placeholder="e.g. Production-API"
              autoComplete="off"
              required
              aria-invalid={deploymentNameError ? true : undefined}
              aria-describedby={
                deploymentNameError
                  ? "compose-upload-deployment-name-error"
                  : undefined
              }
              disabled={isBusy}
              onChange={(event) => {
                setDeploymentName(event.target.value);
                if (deploymentNameError) {
                  setDeploymentNameError(null);
                }
              }}
            />
          </div>

          {deploymentNameError ? (
            <p
              id="compose-upload-deployment-name-error"
              className="custom-compose-field-error"
              role="alert"
            >
              {deploymentNameError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="custom-compose-upload-section">
        <header className="deploy-vars-section-header custom-compose-upload-section-header">
          <h2>Compose file</h2>
          <p>Upload a required .yml or .yaml file up to 256 KiB.</p>
        </header>

        <div className="custom-compose-upload-section-body">
          <div
            className={`custom-compose-upload-dropzone${activeDropTarget === "compose" ? " is-drag-active" : ""}${composeFileError ? " has-error" : ""}`}
            onDragOver={(event) => handleDragOver(event, "compose")}
            onDragLeave={handleDragLeave}
            onDrop={(event) => handleDrop(event, "compose")}
          >
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
              <p className="custom-compose-upload-title">
                Drag and drop docker-compose.yml here
              </p>
              <p className="custom-compose-upload-subtitle">
                Or choose a compose file from your computer
              </p>
            </div>

            <label className="btn-secondary custom-compose-upload-choose-btn">
              Choose compose file
              <input
                ref={composeInputRef}
                type="file"
                accept=".yml,.yaml,application/x-yaml,text/yaml,text/x-yaml"
                disabled={isBusy}
                onChange={(event) => {
                  handleComposeFileInput(event.target.files?.[0] ?? null);
                }}
              />
            </label>

            {selectedComposeFile ? (
              <p className="custom-compose-upload-filename">
                Selected: <strong>{selectedComposeFile.name}</strong>
              </p>
            ) : null}
          </div>

          {composeFileError ? (
            <p className="custom-compose-field-error" role="alert">
              {composeFileError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="custom-compose-upload-section">
        <header className="deploy-vars-section-header custom-compose-upload-section-header">
          <h2>.env file</h2>
          <p>Optional environment file for ${"VARIABLE"} references.</p>
        </header>

        <div className="custom-compose-upload-section-body">
          <div
            className={`custom-compose-upload-dropzone custom-compose-upload-dropzone-secondary${activeDropTarget === "env" ? " is-drag-active" : ""}${envFileError ? " has-error" : ""}`}
            onDragOver={(event) => handleDragOver(event, "env")}
            onDragLeave={handleDragLeave}
            onDrop={(event) => handleDrop(event, "env")}
          >
            <div className="custom-compose-upload-copy">
              <p className="custom-compose-upload-title">
                Drag and drop .env here
              </p>
              <p className="custom-compose-upload-subtitle">
                Optional — skip if all values are inline in compose
              </p>
            </div>

            <label className="btn-secondary custom-compose-upload-choose-btn">
              Choose .env file
              <input
                ref={envInputRef}
                type="file"
                accept=".env,text/plain"
                disabled={isBusy}
                onChange={(event) => {
                  handleEnvFileInput(event.target.files?.[0] ?? null);
                }}
              />
            </label>

            {selectedEnvFile ? (
              <p className="custom-compose-upload-filename">
                Selected: <strong>{selectedEnvFile.name}</strong>
              </p>
            ) : null}
          </div>

          {envFileError ? (
            <p className="custom-compose-field-error" role="alert">
              {envFileError}
            </p>
          ) : null}
        </div>
      </section>

      <footer className="deploy-configure-actions custom-compose-upload-actions">
        <button
          type="submit"
          className={`btn-primary deploy-configure-action-btn${isSubmitting ? " is-loading" : ""}`}
          disabled={isBusy}
          aria-busy={isSubmitting}
        >
          Continue
        </button>
      </footer>
    </form>
  );
}
