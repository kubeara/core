import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { BackLink } from "@/components/shared/back-link";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/api/api-error";
import {
  getCustomComposeDisplayNameValidationError,
  normalizeCustomComposeDisplayName,
  validateCustomComposeUpload,
} from "@/features/deployments/api/custom-compose";
import { useServerQuery } from "@/features/servers/hooks";
import { buildServerDetailHref } from "@/features/servers/components/server-detail/utils/server-detail-tab-url";
import { showErrorToast } from "@/lib/toast";
import { DeployConfigurePageSkeleton } from "@/components/shared/skeleton";
import { NotFoundPage } from "./not-found-page";
import "./custom-compose-pages.css";
import "@/features/templates/templates-ui.css";

const ACCEPTED_EXTENSIONS = [".yml", ".yaml"];

/**
 * Upload page for custom Docker Compose: deployment name + file, validated together.
 */
export function CustomComposeUploadPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deploymentName, setDeploymentName] = useState("");
  const [deploymentNameError, setDeploymentNameError] = useState<string | null>(
    null,
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [composeIssues, setComposeIssues] = useState<
    Array<{ path: string; message: string }>
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const serverQuery = useServerQuery(serverId);

  if (!serverId) {
    return <NotFoundPage />;
  }

  const backHref = buildServerDetailHref(serverId, "overview");

  if (serverQuery.isPending) {
    return (
      <div className="dashboard service-detail-page custom-compose-page deploy-configure-page">
        <BackLink to={backHref} label="Back" />
        <DeployConfigurePageSkeleton />
      </div>
    );
  }

  if (serverQuery.isError || !serverQuery.data) {
    return <NotFoundPage />;
  }

  function assignSelectedFile(file: File | null) {
    setSelectedFile(file);
    setFileError(null);
    setComposeIssues([]);
  }

  function validateSelectedFile(file: File | null): string | null {
    if (!file) {
      return "Please select a Docker Compose file";
    }

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      return "Please upload a .yml or .yaml Docker Compose file";
    }

    return null;
  }

  function handleFileInput(file: File | null) {
    if (!file) {
      assignSelectedFile(null);
      return;
    }

    const error = validateSelectedFile(file);
    if (error) {
      assignSelectedFile(null);
      setFileError(error);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    assignSelectedFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setComposeIssues([]);
    setFileError(null);

    const nameError = getCustomComposeDisplayNameValidationError(deploymentName);
    setDeploymentNameError(nameError);

    const nextFileError = validateSelectedFile(selectedFile);
    setFileError(nextFileError);

    if (nameError || nextFileError || !selectedFile) {
      return;
    }

    setIsUploading(true);
    try {
      const content = await selectedFile.text();
      const result = await validateCustomComposeUpload({
        composeYaml: content,
        fileName: selectedFile.name,
      });

      if (!result.valid) {
        setComposeIssues(result.issues);
        return;
      }

      const displayName = normalizeCustomComposeDisplayName(deploymentName);

      navigate(`/servers/${serverId}/custom-compose/configure`, {
        state: {
          composeYaml: content,
          displayName,
          variables: result.variables,
          fileName: selectedFile.name,
        },
      });
    } catch (error) {
      showErrorToast(getErrorMessage(error));
    } finally {
      setIsUploading(false);
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
    handleFileInput(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div className="dashboard service-detail-page custom-compose-page deploy-configure-page">
      <BackLink to={backHref} label="Back" />

      <div className="deploy-configure-main custom-compose-upload-panel">
        <header className="deploy-configure-main-header custom-compose-upload-header">
          <div>
            <h1>Upload custom yml</h1>
            <p>
              Enter a deployment name and upload a docker-compose.yml file for{" "}
              {serverQuery.data.name}.
            </p>
          </div>
        </header>

        <form className="custom-compose-upload-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
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
                  htmlFor="custom-compose-deployment-name"
                >
                  Name <span className="custom-compose-required">*</span>
                </label>
                <Input
                  id="custom-compose-deployment-name"
                  className="custom-compose-name-input"
                  value={deploymentName}
                  placeholder="e.g. Production-API"
                  autoComplete="off"
                  required
                  aria-invalid={deploymentNameError ? true : undefined}
                  aria-describedby={
                    deploymentNameError
                      ? "custom-compose-deployment-name-error"
                      : undefined
                  }
                  disabled={isUploading}
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
                  id="custom-compose-deployment-name-error"
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
              <p>Upload a .yml or .yaml file up to 256 KiB.</p>
            </header>

            <div className="custom-compose-upload-section-body">
              <div
                className={`custom-compose-upload-dropzone${isDragActive ? " is-drag-active" : ""}${fileError ? " has-error" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
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
                    Drag and drop your compose file here
                  </p>
                  <p className="custom-compose-upload-subtitle">
                    Or choose a file from your computer
                  </p>
                </div>

                <label className="btn-secondary custom-compose-upload-choose-btn">
                  Choose file
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".yml,.yaml,application/x-yaml,text/yaml,text/x-yaml"
                    disabled={isUploading}
                    onChange={(event) => {
                      handleFileInput(event.target.files?.[0] ?? null);
                    }}
                  />
                </label>

                {selectedFile ? (
                  <p className="custom-compose-upload-filename">
                    Selected: <strong>{selectedFile.name}</strong>
                  </p>
                ) : null}
              </div>

              {fileError ? (
                <p className="custom-compose-field-error" role="alert">
                  {fileError}
                </p>
              ) : null}
            </div>
          </section>

          {composeIssues.length > 0 ? (
            <div className="custom-compose-upload-section-body">
              <ul className="custom-compose-validation-issues" role="alert">
                {composeIssues.map((issue) => (
                  <li key={`${issue.path}-${issue.message}`}>
                    <strong>{issue.path}</strong>: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <footer className="deploy-configure-actions custom-compose-upload-actions">
            <button
              type="submit"
              className={`btn-primary deploy-configure-action-btn${isUploading ? " is-loading" : ""}`}
              disabled={isUploading}
              aria-busy={isUploading}
            >
              Upload
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
