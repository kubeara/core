import { useEffect, useState } from "react";
import { useDisconnectServerMutation } from "@/features/servers/hooks";
import { formatApiTimestamp } from "@/lib/unix-timestamp";
import { Switch } from "@/components/ui/switch";
import type { Server } from "@/types";

type ServerSettingsTabProps = {
  server: Server;
};

export function ServerSettingsTab({ server }: ServerSettingsTabProps) {
  const disconnectMutation = useDisconnectServerMutation();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [monitoringEnabled, setMonitoringEnabled] = useState(server.connected);

  useEffect(() => {
    setMonitoringEnabled(server.connected);
  }, [server.connected]);

  async function handleDisconnect() {
    try {
      await disconnectMutation.mutateAsync(server.id);
      setDisconnectOpen(false);
    } catch {
      /* errors surfaced via mutation onError toast */
    }
  }

  function openDisconnectModal() {
    setDisconnectOpen(true);
  }

  function closeDisconnectModal() {
    if (disconnecting) return;
    setDisconnectOpen(false);
  }

  const disconnecting = disconnectMutation.isPending;

  return (
    <div className="server-detail-panel">
      <section className="settings-section">
        <h2>Server configuration</h2>
        <dl className="server-detail-grid">
          <div>
            <dt>Name</dt>
            <dd>{server.name}</dd>
          </div>
          <div>
            <dt>Host</dt>
            <dd>
              <code>{server.host}</code>
            </dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{server.username}</dd>
          </div>
          <div>
            <dt>Created At</dt>
            <dd>
              <time dateTime={server.createdAt ?? undefined}>
                {formatApiTimestamp(server.createdAt)}
              </time>
            </dd>
          </div>
        </dl>

        <div className="settings-toggles">
          <div className="settings-toggle-row">
            <div>
              <span className="settings-toggle-label">Monitoring</span>
              <span className="settings-toggle-hint">
                Collect metrics and send alerts to your workspace
              </span>
            </div>
            <Switch
              checked={monitoringEnabled}
              onCheckedChange={setMonitoringEnabled}
              aria-label="Monitoring"
            />
          </div>
        </div>
      </section>

      <section className="settings-danger-zone">
        <h2>Disconnect server</h2>
        <p>
          Disconnect this server from Kubeara. Services on the server will not
          be removed.
        </p>
        <button
          type="button"
          className="btn-danger-outline"
          onClick={openDisconnectModal}
        >
          Disconnect server
        </button>
      </section>

      {disconnectOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disconnect-server-title"
        >
          <div className="modal-dialog modal-dialog-sm">
            <div className="modal-header">
              <h2 id="disconnect-server-title">Disconnect server?</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={closeDisconnectModal}
              >
                ×
              </button>
            </div>
            <p className="modal-body-text">
              <strong>{server.name}</strong> ({server.host}) will be
              disconnected from Kubeara. You can reconnect it later.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={disconnecting}
                onClick={closeDisconnectModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn-danger-outline${disconnecting ? " is-loading" : ""}`}
                disabled={disconnecting}
                aria-busy={disconnecting}
                onClick={() => void handleDisconnect()}
              >
                {disconnecting ? "Disconnecting…" : "Disconnect server"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
