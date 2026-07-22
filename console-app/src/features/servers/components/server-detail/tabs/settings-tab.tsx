import { useState } from "react";
import { SensitiveHost } from "@/components/shared/sensitive-host";
import { useDisconnectServerMutation } from "@/features/servers/hooks";
import { formatApiTimestamp } from "@/lib/unix-timestamp";
import type { Server } from "@/types";

type ServerSettingsTabProps = {
  server: Server;
};

export function ServerSettingsTab({ server }: ServerSettingsTabProps) {
  const disconnectMutation = useDisconnectServerMutation();
  const [disconnectOpen, setDisconnectOpen] = useState(false);

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
              <SensitiveHost host={server.host} />
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
              <strong>{server.name}</strong> (
              <SensitiveHost host={server.host} monospace={false} />) will be
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
