import { useState } from "react";
import { useNavigate } from "react-router";
import { SensitiveHost } from "@/components/shared/sensitive-host";
import { DeleteServerConfirmModal } from "@/features/servers/components/delete-server-confirm-modal";
import { useDeleteServerMutation } from "@/features/servers/hooks";
import { formatApiTimestamp } from "@/lib/unix-timestamp";
import type { Server } from "@/types";

type ServerSettingsTabProps = {
  server: Server;
};

export function ServerSettingsTab({ server }: ServerSettingsTabProps) {
  const navigate = useNavigate();
  const deleteMutation = useDeleteServerMutation();
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleDelete(removeManagedServices: boolean) {
    try {
      await deleteMutation.mutateAsync({
        id: server.id,
        removeManagedServices,
      });
      setDeleteOpen(false);
      void navigate("/servers");
    } catch {
      /* errors surfaced via mutation onError toast */
    }
  }

  function openDeleteModal() {
    setDeleteOpen(true);
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteOpen(false);
  }

  const deleting = deleteMutation.isPending;

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
        <h2>Delete server</h2>
        <p>
          Permanently remove this server from Kubeara. This cannot be undone.
        </p>
        <button
          type="button"
          className="btn-danger-outline"
          onClick={openDeleteModal}
        >
          Delete server
        </button>
      </section>

      {deleteOpen && (
        <DeleteServerConfirmModal
          server={server}
          isPending={deleting}
          onCancel={closeDeleteModal}
          onConfirm={(removeManagedServices) => {
            void handleDelete(removeManagedServices);
          }}
        />
      )}
    </div>
  );
}
