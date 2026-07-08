import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getErrorMessage } from "@/api/api-error";
import { Dropdown } from "@/components/shared/dropdown";
import { FormFieldLabel } from "@/components/shared/form-field-label";
import { useServersQuery } from "@/features/servers/hooks";
import {
  isServerOperationBusy,
  mapServerApiToServer,
} from "@/features/servers/types";
import type { ApiTemplate } from "../types";
import "./select-deploy-server-modal.css";

const SERVER_LIST_LIMIT = 100;

type SelectDeployServerModalProps = {
  open: boolean;
  template: ApiTemplate | null;
  onClose: () => void;
  onSelectServer: (serverId: string) => void;
};

function formatServerOptionLabel(name: string, host: string): string {
  return `${name} (${host})`;
}

function SelectDeployServerModalContent({
  template,
  onClose,
  onSelectServer,
}: {
  template: ApiTemplate;
  onClose: () => void;
  onSelectServer: (serverId: string) => void;
}) {
  const [selectedServerId, setSelectedServerId] = useState("");

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
        label: formatServerOptionLabel(server.name, server.host),
      })),
    ],
    [servers],
  );

  const selectedServer = servers.find((server) => server.id === selectedServerId);
  const selectedServerBusy = selectedServer
    ? isServerOperationBusy(selectedServer.operationStatus)
    : false;
  const canDeploy = Boolean(selectedServerId) && !selectedServerBusy;

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
          <div className="select-deploy-server-header-text">
            <h2 id="select-deploy-server-title">Choose a server</h2>
            <p>
              Select where to deploy <strong>{template.name}</strong>.
            </p>
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
            <div className="select-deploy-server-state">
              <p className="select-deploy-server-state-title">No servers yet</p>
              <p className="select-deploy-server-state-text">
                Add a server from the Servers page before deploying.
              </p>
              <Link to="/servers" className="btn-primary" onClick={onClose}>
                Go to Servers
              </Link>
            </div>
          ) : (
            <div className="select-deploy-server-field">
              <FormFieldLabel htmlFor="select-deploy-server-dropdown">
                Server
              </FormFieldLabel>
              <Dropdown
                id="select-deploy-server-dropdown"
                className="select-deploy-server-dropdown"
                value={selectedServerId}
                options={serverOptions}
                onChange={setSelectedServerId}
                searchable
                searchPlaceholder="Search servers by name or host…"
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
          {servers.length > 0 ? (
            <button
              type="button"
              className="btn-primary"
              disabled={!canDeploy}
              onClick={handleDeploy}
            >
              Deploy
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SelectDeployServerModal({
  open,
  template,
  onClose,
  onSelectServer,
}: SelectDeployServerModalProps) {
  if (!open || !template) {
    return null;
  }

  return (
    <SelectDeployServerModalContent
      key={template.slug}
      template={template}
      onClose={onClose}
      onSelectServer={onSelectServer}
    />
  );
}
