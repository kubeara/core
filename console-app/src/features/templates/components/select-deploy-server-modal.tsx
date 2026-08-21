import { useMemo, useState } from "react";
import { Link } from "react-router";
import { getErrorMessage } from "@/api/api-error";
import { Dropdown } from "@/components/shared/dropdown";
import { ServiceBrandIcon } from "@/components/shared/service-brand-icon";
import { useServersQuery } from "@/features/servers/hooks";
import {
  isServerOperationBusy,
  mapServerApiToServer,
} from "@/features/servers/types";
import type { ApiTemplate } from "../types";
import { getTemplateAccentColor } from "../utils/deploy-form-schema";
import "./select-deploy-server-modal.css";

const SERVER_LIST_LIMIT = 100;

/**
 * Props for the SelectDeployServerModal component.
 * @param open 
 * @param template 
 * @param onClose 
 * @param onSelectServer 
 */
type SelectDeployServerModalProps = {
  open: boolean;
  template: ApiTemplate | null;
  onClose: () => void;
  onSelectServer: (serverId: string) => void;
  confirmLabel?: string;
  initialServerId?: string;
};

/**
 * Renders the content of the select deploy server modal.
 * @param template 
 * @param onClose 
 * @param onSelectServer 
 */
function SelectDeployServerModalContent({
  template,
  onClose,
  onSelectServer,
  confirmLabel,
  initialServerId,
}: {
  template: ApiTemplate;
  onClose: () => void;
  onSelectServer: (serverId: string) => void;
  confirmLabel: string;
  initialServerId?: string;
}) {
  const [selectedServerId, setSelectedServerId] = useState(initialServerId ?? "");

  const listParams = useMemo(
    () => ({
      page: 1,
      limit: SERVER_LIST_LIMIT,
      sortBy: "name" as const,
      sortOrder: "asc" as const,
    }),
    [],
  );

  const serversQuery = useServersQuery(listParams);

  const servers = useMemo(
    () => (serversQuery.data?.data ?? []).map(mapServerApiToServer),
    [serversQuery.data?.data],
  );

  const serverOptions = useMemo(
    () => [
      { value: "", label: "Select a server…" },
      ...servers.map((server) => ({
        value: server.id,
        label: server.name,
      })),
    ],
    [servers],
  );

  const selectedServer = servers.find((server) => server.id === selectedServerId);
  const selectedServerBusy = selectedServer
    ? isServerOperationBusy(selectedServer.operationStatus)
    : false;
  const canDeploy = Boolean(selectedServerId) && !selectedServerBusy;
  const accent = getTemplateAccentColor(template.slug);

  function handleDeploy() {
    if (!canDeploy) {
      return;
    }
    onSelectServer(selectedServerId);
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-dialog select-deploy-server-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="select-deploy-server-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div className="select-deploy-server-header-inner">
            <ServiceBrandIcon
              name={template.name}
              logo={template.logo}
              className="select-deploy-server-icon"
              style={{
                backgroundColor: `${accent}20`,
                color: accent,
              }}
            />
            <div className="select-deploy-server-header-text">
              <h2 id="select-deploy-server-title">Choose a server</h2>
              <p className="select-deploy-server-subtitle">
                Select where to deploy <strong>{template.name}</strong>.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="select-deploy-server-body">
          {serversQuery.isPending ? (
            <div className="select-deploy-server-state" aria-busy="true">
              <p>Loading servers…</p>
            </div>
          ) : serversQuery.isError ? (
            <div className="select-deploy-server-state select-deploy-server-state-error">
              <p>{getErrorMessage(serversQuery.error)}</p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void serversQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : servers.length === 0 ? (
            <div className="select-deploy-server-empty">
              <p className="select-deploy-server-empty-title">No servers yet</p>
              <p className="select-deploy-server-empty-text">
                Add a server from the Servers page before deploying{" "}
                <strong>{template.name}</strong>.
              </p>
            </div>
          ) : (
            <div className="form-field select-deploy-server-field">
              <Dropdown
                id="select-deploy-server-dropdown"
                className="select-deploy-server-dropdown"
                label="Server"
                value={selectedServerId}
                options={serverOptions}
                onChange={setSelectedServerId}
                searchable
                searchPlaceholder="Search servers by name…"
                noResultsLabel="No servers found"
                ariaLabel="Select server"
                pinnedOptionValue=""
              />
              {selectedServerBusy ? (
                <p className="select-deploy-server-field-hint">
                  This server is busy. Choose another server to continue.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {!serversQuery.isPending &&
          !serversQuery.isError &&
          servers.length === 0 ? (
            <Link
              to="/servers"
              className="btn-primary select-deploy-server-go-link"
              onClick={onClose}
            >
              Go to Servers
            </Link>
          ) : servers.length > 0 ? (
            <button
              type="button"
              className="btn-primary"
              disabled={!canDeploy}
              onClick={handleDeploy}
            >
              {confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the select deploy server modal.
 * @param open 
 * @param template 
 * @param onClose 
 * @param onSelectServer 
 */
export function SelectDeployServerModal({
  open,
  template,
  onClose,
  onSelectServer,
  confirmLabel = "Deploy",
  initialServerId,
}: SelectDeployServerModalProps) {
  if (!open || !template) {
    return null;
  }

  return (
    <SelectDeployServerModalContent
      key={`${template.slug}-${initialServerId ?? ""}`}
      template={template}
      onClose={onClose}
      onSelectServer={onSelectServer}
      confirmLabel={confirmLabel}
      initialServerId={initialServerId}
    />
  );
}
